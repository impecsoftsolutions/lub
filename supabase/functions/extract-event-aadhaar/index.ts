// =============================================================================
// Edge Function: extract-event-aadhaar
// Slice: COD-EVENTS-AADHAAR-DOC-AUTOFILL-063B
//
// Transient Aadhaar card reader. Accepts a multipart file upload,
// processes it with OpenAI vision entirely in memory, returns extracted
// registration fields to the caller. Zero persistence:
//
//   - File bytes are NEVER written to Storage, DB, logs, or artifacts.
//   - Aadhaar number is NEVER logged (not even partially).
//   - No event_rsvps or event_assets rows are created by this function.
//   - Rate limiting uses a DB-backed opaque counter key. It stores no file bytes, OCR text, Aadhaar number, or name.
//
// Input (multipart/form-data):
//   file        : binary file — JPEG / PNG / WebP / PDF (required, ≤ 8 MB)
//   event_id    : event UUID string (optional; used as rate-limit key)
//
// Output (JSON 200):
//   { success: true,  data: { aadhaar_number, name, surname_guess, given_name_guess, dob, confidence } }
//   { success: false, error_code, error }
//
// Error codes: bad_request | file_required | file_too_large | unsupported_format |
//              ai_disabled | provider_unsupported | no_api_key |
//              rate_limited | extraction_failed
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

const SUPPORTED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

// -- Rate limiter ------------------------------------------------------------
// DB-backed through check_event_aadhaar_extract_rate_limit. The DB row stores
// only a SHA-256 rate key and request counters, never uploaded bytes or PII.

// -- Types ────────────────────────────────────────────────────────────────────

interface AIRuntimeSettingsRow {
  provider: string;
  model: string;
  reasoning_effort: string | null;
  is_enabled: boolean;
  api_key_secret: string | null;
}

interface ExtractionResult {
  aadhaar_number: string | null;
  name: string | null;
  surname_guess: string | null;
  given_name_guess: string | null;
  dob: string | null; // YYYY-MM-DD or null
  confidence: number; // 0–1
}

interface OpenAIResponsesAPIResponse {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
}

interface RateLimitResponse {
  allowed?: boolean;
  error_code?: string;
  remaining?: number;
  request_count?: number;
  reset_at?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function toStr(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim();
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ── AI settings ──────────────────────────────────────────────────────────────

async function checkRateLimit(
  supabaseUrl: string,
  serviceRoleKey: string,
  key: string,
): Promise<RateLimitResponse> {
  const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/check_event_aadhaar_extract_rate_limit`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      p_rate_key: key,
      p_max_requests: RATE_LIMIT_MAX,
      p_window_seconds: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
    }),
  });
  if (!resp.ok) {
    return { allowed: false, error_code: 'rate_limited' };
  }
  return (await resp.json()) as RateLimitResponse;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function loadAISettings(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<AIRuntimeSettingsRow | null> {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/ai_runtime_settings?setting_key=eq.event_drafting` +
      `&select=provider,model,reasoning_effort,is_enabled,api_key_secret&limit=1`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: 'application/json',
      },
    },
  );
  if (!resp.ok) return null;
  const rows = (await resp.json()) as AIRuntimeSettingsRow[];
  return rows?.[0] ?? null;
}

// ── Extraction ────────────────────────────────────────────────────────────────

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch { /* fall through */ }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI did not return a JSON object.');
  return JSON.parse(match[0]);
}

function sanitizeResult(raw: unknown): ExtractionResult {
  const input = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  // aadhaar_number: strip non-digits, accept only if exactly 12
  const rawAadhaar = toStr(input.aadhaar_number).replace(/\D/g, '');
  const aadhaarNumber = rawAadhaar.length === 12 ? rawAadhaar : null;

  // dob: accept only YYYY-MM-DD pattern
  const rawDob = toStr(input.dob);
  const dob = /^\d{4}-\d{2}-\d{2}$/.test(rawDob) ? rawDob : null;

  // confidence: clamp 0–1
  const rawConf = Number(input.confidence);
  const confidence = Number.isFinite(rawConf) ? Math.max(0, Math.min(1, rawConf)) : 0;

  const nameStr = toStr(input.name).slice(0, 200) || null;

  // COD-EVENTS-REGISTRATION-AADHAAR-EXPORT-BADGE-LIST-064
  // Project rule: first whitespace-delimited word = surname, remainder = given name.
  // This is deterministic and overrides whatever the AI returned for surname/given splits,
  // because Indian names on Aadhaar cards consistently follow this pattern.
  let surnameGuess: string | null = null;
  let givenNameGuess: string | null = null;
  if (nameStr) {
    const parts = nameStr.trim().split(/\s+/);
    // Some OCR passes split a single Indian surname across two tokens
    // (for example "Raju lapati" instead of "Rajulapati"). If the
    // second token begins lowercase, treat it as a broken continuation
    // of the surname; otherwise keep the project rule: first word =
    // surname, remaining words = given name.
    const secondLooksLikeContinuation = parts.length > 1 && /^[a-z]/.test(parts[1] ?? '');
    if (secondLooksLikeContinuation) {
      surnameGuess = `${parts[0] ?? ''}${parts[1] ?? ''}` || null;
      givenNameGuess = parts.length > 2 ? parts.slice(2).join(' ') : null;
    } else {
      surnameGuess = parts[0] ?? null;
      givenNameGuess = parts.length > 1 ? parts.slice(1).join(' ') : null;
    }
  }

  return {
    aadhaar_number: aadhaarNumber,
    name: nameStr,
    surname_guess: surnameGuess,
    given_name_guess: givenNameGuess,
    dob,
    confidence,
  };
}

// COD-EVENTS-REGISTRATION-BADGE-EXPORT-AADHAAR-068
// Low-confidence threshold that triggers a second orientation-aware call.
const CONFIDENCE_RETRY_THRESHOLD = 0.5;

async function callOpenAI(
  apiKey: string,
  model: string,
  mime: string,
  filename: string,
  base64: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<ExtractionResult> {
  const dataUrl = `data:${mime};base64,${base64}`;

  const userParts: Array<Record<string, unknown>> = [
    { type: 'input_text', text: `${systemPrompt}\n\n${userPrompt}` },
  ];

  if (mime === 'application/pdf') {
    userParts.push({
      type: 'input_file',
      filename: filename || 'aadhaar.pdf',
      file_data: dataUrl,
    });
  } else {
    userParts.push({ type: 'input_image', image_url: dataUrl });
  }

  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [{ role: 'user', content: userParts }],
    }),
  });

  const body = (await resp.json()) as OpenAIResponsesAPIResponse;
  if (!resp.ok) {
    throw new Error(body?.error?.message ?? `OpenAI request failed with HTTP ${resp.status}`);
  }

  // Extract text from either output_text shorthand or the full output array
  let text = toStr(body.output_text);
  if (!text && Array.isArray(body.output)) {
    const chunks: string[] = [];
    for (const item of body.output) {
      for (const c of item.content ?? []) {
        if (typeof c.text === 'string') chunks.push(c.text);
      }
    }
    text = chunks.join('\n').trim();
  }
  if (!text) throw new Error('AI returned an empty response.');

  return sanitizeResult(extractJsonObject(text));
}

// Primary extraction prompt — mentions rotation explicitly.
const PRIMARY_SYSTEM =
  'You extract structured data from Aadhaar card images and PDFs. ' +
  'The image or PDF may be rotated 0, 90, 180, or 270 degrees, or scanned upside-down. ' +
  'Examine all orientations to locate the Aadhaar card content. ' +
  'Return ONLY valid JSON with no markdown fences or extra text.';

const PRIMARY_USER =
  'Read this Aadhaar card and return exactly this JSON object:\n' +
  '{\n' +
  '  "aadhaar_number": "12-digit number with no spaces, or null if not readable",\n' +
  '  "name": "full name exactly as printed on the card, or null",\n' +
  '  "surname_guess": "first word of the full name — for Indian Aadhaar cards the first word is always the family/last name",\n' +
  '  "given_name_guess": "all remaining words after the first word joined by spaces, or null if name is a single word",\n' +
  '  "dob": "YYYY-MM-DD if date of birth is printed, else null",\n' +
  '  "confidence": 0.0 to 1.0 (1.0 = fully readable Aadhaar card, 0.0 = cannot read)\n' +
  '}\n' +
  'IMPORTANT: The card may be rotated. Try reading it at 90°, 180°, and 270° if not readable at 0°. ' +
  'Do not include any extra text. Do not identify the person beyond these fields.';

// Retry prompt — used when the first pass returns low confidence or no useful fields.
const RETRY_SYSTEM =
  'You extract structured data from Indian Aadhaar cards. ' +
  'The image or PDF was already tried at its default orientation and gave a very low confidence result. ' +
  'It is very likely rotated 90 degrees clockwise or counter-clockwise. ' +
  'Mentally rotate the image 90° clockwise and try to read the Aadhaar card fields. ' +
  'If that does not work, try 90° counter-clockwise (i.e. 270° clockwise). ' +
  'Return ONLY valid JSON with no markdown fences or extra text.';

const RETRY_USER =
  'This is the same image/PDF as before but now assume it is rotated. ' +
  'Try each 90-degree rotation to locate the Aadhaar card and return exactly this JSON:\n' +
  '{\n' +
  '  "aadhaar_number": "12-digit number with no spaces, or null if not readable",\n' +
  '  "name": "full name exactly as printed on the card, or null",\n' +
  '  "surname_guess": "first word of the full name",\n' +
  '  "given_name_guess": "all remaining words after the first word, or null",\n' +
  '  "dob": "YYYY-MM-DD if date of birth is printed, else null",\n' +
  '  "confidence": 0.0 to 1.0\n' +
  '}\n' +
  'Do not include any extra text. Do not identify the person beyond these fields.';

function isUsefulResult(r: ExtractionResult): boolean {
  return r.aadhaar_number !== null || r.name !== null;
}

async function extractWithOpenAI(
  apiKey: string,
  model: string,
  mime: string,
  filename: string,
  base64: string,
): Promise<ExtractionResult> {
  // First pass: primary prompt with rotation awareness
  const first = await callOpenAI(apiKey, model, mime, filename, base64, PRIMARY_SYSTEM, PRIMARY_USER);

  // Only retry if the result is genuinely poor: low confidence AND no useful fields.
  // This avoids wasting an extra API call when extraction succeeded.
  if (isUsefulResult(first) && first.confidence >= CONFIDENCE_RETRY_THRESHOLD) {
    return first;
  }

  // Second pass: explicitly instruct the model to try rotated orientations.
  let second: ExtractionResult;
  try {
    second = await callOpenAI(apiKey, model, mime, filename, base64, RETRY_SYSTEM, RETRY_USER);
  } catch {
    // If retry itself fails, return the first result (may still be partial).
    return first;
  }

  // Pick the better result: prefer the one with an Aadhaar number; then higher confidence.
  if (isUsefulResult(second) && !isUsefulResult(first)) return second;
  if (isUsefulResult(second) && second.confidence > first.confidence) return second;
  return first;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error_code: 'bad_request', error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { success: false, error_code: 'service_misconfigured', error: 'Service configuration missing.' },
      500,
    );
  }

  // ── Parse multipart ────────────────────────────────────────────────────────
  let file: File | null = null;
  let eventId = '';
  try {
    const fd = await req.formData();
    file = fd.get('file') as File | null;
    eventId = toStr(fd.get('event_id'));
  } catch {
    return jsonResponse({ success: false, error_code: 'bad_request', error: 'Could not parse form data.' }, 400);
  }

  if (!file) {
    return jsonResponse({ success: false, error_code: 'file_required', error: 'No file provided.' }, 400);
  }

  // ── Validate file ──────────────────────────────────────────────────────────
  if (file.size > MAX_FILE_BYTES) {
    return jsonResponse(
      { success: false, error_code: 'file_too_large', error: `File exceeds the ${MAX_FILE_BYTES / (1024 * 1024)} MB limit.` },
      400,
    );
  }

  const mime = file.type.split(';')[0].trim().toLowerCase();
  if (!SUPPORTED_MIMES.has(mime)) {
    return jsonResponse(
      { success: false, error_code: 'unsupported_format', error: 'Unsupported format. Use JPEG, PNG, WebP, or PDF.' },
      400,
    );
  }

  // ── Rate limit ─────────────────────────────────────────────────────────────
  const clientIP =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const rateLimitKey = `${clientIP}:${eventId || 'none'}`;
  const rateLimitResult = await checkRateLimit(
    supabaseUrl,
    serviceRoleKey,
    await sha256Hex(rateLimitKey),
  );
  if (rateLimitResult.allowed !== true) {
    return jsonResponse(
      { success: false, error_code: 'rate_limited', error: 'Too many requests. Please wait a minute and try again.' },
      429,
    );
  }

  // ── AI settings ────────────────────────────────────────────────────────────
  const settings = await loadAISettings(supabaseUrl, serviceRoleKey);
  if (!settings || !settings.is_enabled) {
    return jsonResponse(
      { success: false, error_code: 'ai_disabled', error: 'Automatic extraction is not available right now.' },
      503,
    );
  }
  const provider = toStr(settings.provider).toLowerCase();
  if (provider !== 'openai') {
    return jsonResponse(
      { success: false, error_code: 'provider_unsupported', error: `AI provider "${provider || 'unknown'}" is not supported for extraction.` },
      503,
    );
  }
  const apiKey = toStr(settings.api_key_secret);
  if (!apiKey) {
    return jsonResponse(
      { success: false, error_code: 'no_api_key', error: 'AI API key is not configured.' },
      503,
    );
  }

  // ── Transiently process file ────────────────────────────────────────────────
  // File bytes stay in memory only. No Storage write, no DB insert.
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return jsonResponse(
      { success: false, error_code: 'extraction_failed', error: 'Could not read the uploaded file.' },
      500,
    );
  }

  const base64 = base64FromBytes(bytes);
  const filename = file.name || 'aadhaar';

  try {
    const result = await extractWithOpenAI(
      apiKey,
      toStr(settings.model) || 'gpt-4o-mini',
      mime,
      filename,
      base64,
    );

    // Log safe metadata only. NEVER log aadhaar_number or any PII.
    console.log('[extract-event-aadhaar] success', {
      event_id: eventId || null,
      mime,
      file_size: bytes.length,
      confidence: result.confidence,
      has_aadhaar: result.aadhaar_number !== null,
      has_name: result.name !== null,
    });

    return jsonResponse({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed.';
    // Log only the error message — no file bytes, no extracted PII.
    console.error('[extract-event-aadhaar] extraction error', {
      event_id: eventId || null,
      mime,
      error: message.slice(0, 200),
    });
    // This is a valid user-facing extraction miss, not a transport/server error.
    // Keep HTTP 200 so supabase-js exposes the structured error_code to the UI.
    return jsonResponse(
      {
        success: false,
        error_code: 'extraction_failed',
        error: 'Could not extract Aadhaar details. Please type the number manually.',
      },
    );
  }
});
