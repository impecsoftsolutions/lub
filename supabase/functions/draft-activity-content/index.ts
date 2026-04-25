// =============================================================================
// Edge Function: draft-activity-content
// Slices: COD-ACTIVITIES-AI-001 + CLAUDE-ACTIVITIES-FOLLOWUP-002
//         + CLAUDE-ACTIVITIES-NEXT-003 (COD-ACTIVITIES-AI-DOC-UI-003)
//
// Two operating modes (request body field `mode`):
//
//   "draft" (default) — Generates AI-assisted draft content (title, slug,
//   excerpt, description) for an Activities post. Optional `source_files`
//   are consumed via the OpenAI Responses API as additional source material.
//   Falls back to chat/completions JSON mode when no files are present.
//
//   "extract_fields" — Reads supplied `source_files` (at least one required)
//   and returns structured guided-input field values (activity_date, location,
//   participants, host, purpose, highlights, outcome, additional_notes) extracted
//   from the document content. Used for auto-prefill in the AI panel before
//   the admin clicks Generate.
//
// Source file limits:
//   - Max 3 files per request
//   - Images (JPEG/PNG): ≤ 10 MB per file
//   - PDFs: ≤ 20 MB per file
//   - Total cumulative: ≤ 30 MB
//
// The API key is read server-side via SUPABASE_SERVICE_ROLE_KEY and never
// returned to the browser.
//
// Request body:
//   {
//     session_token: string,
//     mode?: "draft" | "extract_fields",   // defaults to "draft"
//     inputs?: {                            // used in draft mode
//       activity_date?: string,
//       location?: string,
//       participants?: string,
//       purpose?: string,
//       host?: string,
//       highlights?: string,
//       outcome?: string,
//       additional_notes?: string,
//     },
//     source_files?: Array<{ name: string, mime: string, base64: string }>
//   }
//
// Authorization:
//   - session_token must resolve to an active user via
//     public.resolve_custom_session_user_id(p_session_token)
//   - that user must have `activities.create` OR `activities.edit_any`
//     permission via public.has_permission(actor_id, code).
//
// Output — draft mode (success):
//   { success: true, data: { title, slug, excerpt, description } }
//
// Output — extract_fields mode (success):
//   { success: true, fields: { activity_date?, location?, participants?,
//     host?, purpose?, highlights?, outcome?, additional_notes? } }
//
// Output (failure / fail-closed) — always HTTP 200 with structured error_code:
//   { success: false, error: string, error_code: ErrorCode }
//
// ErrorCode union:
//   'ai_disabled' | 'provider_unsupported' | 'no_api_key'
//   | 'session_invalid' | 'permission_denied' | 'generation_failed'
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

type ErrorCode =
  | 'ai_disabled'
  | 'provider_unsupported'
  | 'no_api_key'
  | 'session_invalid'
  | 'permission_denied'
  | 'generation_failed';

interface DraftInputs {
  activity_date?: string;
  location?: string;
  participants?: string;
  purpose?: string;
  host?: string;
  highlights?: string;
  outcome?: string;
  additional_notes?: string;
}

interface SourceFile {
  name: string;
  mime: string;
  base64: string;
}

interface ExtractionFields {
  activity_date?: string;
  activity_date_options?: string[];
  location?: string;
  location_options?: string[];
  participants?: string;
  host?: string;
  purpose?: string;
  highlights?: string;
  outcome?: string;
  additional_notes?: string;
}

interface DraftRequestBody {
  session_token?: string;
  /** Defaults to "draft" when absent. */
  mode?: 'draft' | 'extract_fields';
  inputs?: DraftInputs;
  source_files?: SourceFile[];
}

interface AIRuntimeSettingsRow {
  provider: string;
  model: string;
  reasoning_effort: string | null;
  is_enabled: boolean;
  api_key_secret: string | null;
}

interface OpenAICompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface OpenAIResponsesAPIResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
}

const VALID_REASONING_EFFORT = new Set(['low', 'medium', 'high', 'xhigh']);

const SUPPORTED_SOURCE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
]);

const MAX_SOURCE_FILES = 3;
const MAX_SOURCE_FILE_IMAGE_BYTES = 10 * 1024 * 1024;  // 10 MB per image (JPEG/PNG)
const MAX_SOURCE_FILE_PDF_BYTES = 20 * 1024 * 1024;    // 20 MB per PDF
const MAX_SOURCE_FILES_TOTAL_BYTES = 30 * 1024 * 1024; // 30 MB cumulative

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function sanitizeReasoningEffort(value: string | null | undefined): string | null {
  const candidate = toStringValue(value).toLowerCase();
  if (!candidate) return null;
  return VALID_REASONING_EFFORT.has(candidate) ? candidate : null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function failClosed(error: string, error_code: ErrorCode): Response {
  // Always return 200 with success:false so the SDK doesn't surface a generic
  // network error. The frontend renders the message + code.
  return jsonResponse({ success: false, error, error_code }, 200);
}

async function rpcCall<T>(
  supabaseUrl: string,
  serviceRoleKey: string,
  fnName: string,
  params: Record<string, unknown>
): Promise<T | null> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      console.warn(`[draft-activity-content] rpcCall ${fnName} failed: ${response.status} ${errorBody}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (err) {
    console.warn(`[draft-activity-content] rpcCall ${fnName} exception:`, err);
    return null;
  }
}

async function loadAIRuntimeSettings(
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<AIRuntimeSettingsRow | null> {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/ai_runtime_settings?setting_key=eq.member_normalization&select=provider,model,reasoning_effort,is_enabled,api_key_secret&limit=1`,
      {
        method: 'GET',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: 'application/json',
        },
      }
    );
    if (!response.ok) {
      const errorBody = await response.text();
      console.warn(`[draft-activity-content] loadAIRuntimeSettings: ${response.status} ${errorBody}`);
      return null;
    }
    const rows = (await response.json()) as AIRuntimeSettingsRow[];
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.warn('[draft-activity-content] loadAIRuntimeSettings exception:', err);
    return null;
  }
}

function slugifyServer(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function buildSystemPrompt(hasSourceFiles: boolean): string {
  const base = [
    'You draft public-facing copy for member-association activity posts.',
    'Tone: organisational activity reporting — factual, neutral, member-facing.',
    'Avoid event marketing language, avoid news-headline clickbait, avoid emojis.',
    'Keep the description grounded in the supplied facts. Do not invent metrics, attendance figures, quotes, or outcomes.',
  ];
  if (hasSourceFiles) {
    base.push(
      'If supplied, treat uploaded documents as primary source material; ignore unrelated content; do not invent figures absent from the facts and documents.'
    );
  }
  base.push(
    'Return strict JSON only with this exact shape:',
    '{ "title": string, "slug": string, "excerpt": string, "description": string }',
    'title: short, descriptive, ≤ 90 characters, no trailing punctuation.',
    'slug: lowercase letters, digits, and hyphens only, ≤ 60 characters; will be re-validated client-side.',
    'excerpt: 1–2 sentences, ≤ 280 characters, plain text, suitable as listing card summary.',
    'description: 2–4 short paragraphs (~150–500 words total), plain text, no Markdown, no headings.'
  );
  return base.join(' ');
}

function buildUserFacts(inputs: DraftInputs): string {
  const factBlock: Record<string, string> = {};
  for (const [k, v] of Object.entries(inputs)) {
    const s = toStringValue(v);
    if (s) factBlock[k] = s;
  }
  return JSON.stringify(
    {
      task: 'draft_activity_post',
      facts: factBlock,
      style: 'organisational activity report',
    },
    null,
    2
  );
}

function parseAIDraftJson(content: string): {
  title: string;
  slug: string;
  excerpt: string;
  description: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      parsed = JSON.parse(content.slice(firstBrace, lastBrace + 1));
    } else {
      throw new Error('AI returned non-JSON content.');
    }
  }
  const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const title = toStringValue(obj.title);
  const description = toStringValue(obj.description);
  const excerpt = toStringValue(obj.excerpt);
  const aiSlug = toStringValue(obj.slug);
  if (!title || !description) {
    throw new Error('AI response missing required fields (title/description).');
  }
  return {
    title,
    slug: slugifyServer(aiSlug || title),
    excerpt,
    description,
  };
}

function buildExtractionSystemPrompt(): string {
  return [
    'You are a document parsing assistant.',
    'Read the supplied documents and extract any of these fields if clearly present:',
    'activity_date (ISO 8601 date string, e.g. "2026-03-15"), location (city or venue name),',
    'activity_date_options (array of ISO 8601 dates when multiple possible activity dates are clearly present),',
    'location_options (array of venue/city strings when multiple possible activity locations are clearly present),',
    'participants (brief description of who attended), host (organizer or hosting entity name),',
    'purpose (what the event was meant to achieve), highlights (key moments, sessions, or speakers),',
    'outcome (what was achieved or concluded), additional_notes (any other notable facts).',
    'For two-day or multi-day activities, set activity_date to the first day of the activity and include all clear activity dates in activity_date_options.',
    'Do not use document issue dates, print dates, RSVP deadlines, registration deadlines, or payment dates as activity_date unless the document clearly says they are the event/activity date.',
    'Prefer dates near event title, agenda, schedule, venue, invitation line, or phrases such as "held on", "conducted on", "date", "program", or "venue".',
    'If multiple locations are present, set location to the most likely event venue/location and include the candidates in location_options.',
    'Return a JSON object with exactly those field names as keys. Omit any key you cannot clearly determine from the documents.',
    'Do not invent or infer information not present in the documents.',
    'Return strict JSON only — no explanation, no markdown, no code fences.',
  ].join(' ');
}

function parseExtractionJson(content: string): ExtractionFields {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      parsed = JSON.parse(content.slice(firstBrace, lastBrace + 1));
    } else {
      throw new Error('AI returned non-JSON content for extraction.');
    }
  }
  const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const fields: ExtractionFields = {};
  const STRING_KEYS: (keyof ExtractionFields)[] = [
    'activity_date', 'location', 'participants', 'host',
    'purpose', 'highlights', 'outcome', 'additional_notes',
  ];
  for (const key of STRING_KEYS) {
    const v = toStringValue(obj[key]);
    if (v) fields[key] = v;
  }
  const ARRAY_KEYS: (keyof ExtractionFields)[] = ['activity_date_options', 'location_options'];
  for (const key of ARRAY_KEYS) {
    const raw = obj[key];
    if (!Array.isArray(raw)) continue;
    const values = raw
      .map((item) => toStringValue(item))
      .filter((item): item is string => Boolean(item));
    if (values.length > 0) fields[key] = Array.from(new Set(values));
  }
  return fields;
}

// ── OpenAI Chat Completions path (no source files) ──────────────────────────
async function callOpenAIChatCompletions(
  apiKey: string,
  model: string,
  reasoningEffort: string | null,
  systemPrompt: string,
  userPrompt: string
): Promise<{ title: string; slug: string; excerpt: string; description: string }> {
  const requestBody: Record<string, unknown> = {
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  };
  if (reasoningEffort && model.toLowerCase().startsWith('gpt-5')) {
    requestBody.reasoning_effort = reasoningEffort;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const body = (await response.json()) as OpenAICompletionResponse;
  if (!response.ok) {
    const message = body?.error?.message || `OpenAI request failed with ${response.status}`;
    throw new Error(message);
  }
  const content = body?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('AI returned empty content.');
  }
  return parseAIDraftJson(content);
}

// ── OpenAI Responses API path (with source files) ───────────────────────────
function buildResponsesContent(
  systemPrompt: string,
  userPrompt: string,
  sourceFiles: SourceFile[]
): Array<Record<string, unknown>> {
  const userParts: Array<Record<string, unknown>> = [];

  // Free text instruction first
  userParts.push({
    type: 'input_text',
    text: `${systemPrompt}\n\n${userPrompt}`,
  });

  for (const f of sourceFiles) {
    const dataUrl = `data:${f.mime};base64,${f.base64}`;
    if (f.mime === 'application/pdf') {
      userParts.push({
        type: 'input_file',
        filename: f.name || 'source.pdf',
        file_data: dataUrl,
      });
    } else {
      userParts.push({
        type: 'input_image',
        image_url: dataUrl,
      });
    }
  }

  return [
    {
      role: 'user',
      content: userParts,
    },
  ];
}

async function callOpenAIResponsesAPI(
  apiKey: string,
  model: string,
  reasoningEffort: string | null,
  systemPrompt: string,
  userPrompt: string,
  sourceFiles: SourceFile[]
): Promise<{ title: string; slug: string; excerpt: string; description: string }> {
  const requestBody: Record<string, unknown> = {
    model,
    input: buildResponsesContent(systemPrompt, userPrompt, sourceFiles),
  };
  if (reasoningEffort && model.toLowerCase().startsWith('gpt-5')) {
    requestBody.reasoning = { effort: reasoningEffort };
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const body = (await response.json()) as OpenAIResponsesAPIResponse;
  if (!response.ok) {
    const message = body?.error?.message || `OpenAI Responses request failed with ${response.status}`;
    throw new Error(message);
  }

  // Prefer output_text convenience field; fall back to walking output[].content[].text
  let textContent = toStringValue(body?.output_text);
  if (!textContent && Array.isArray(body?.output)) {
    const collected: string[] = [];
    for (const item of body.output) {
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (c && typeof c === 'object' && typeof c.text === 'string') {
            collected.push(c.text);
          }
        }
      }
    }
    textContent = collected.join('\n').trim();
  }

  if (!textContent) {
    throw new Error('AI Responses API returned empty content.');
  }
  return parseAIDraftJson(textContent);
}

// ── OpenAI Responses API path — extract_fields mode ────────────────────────
async function callOpenAIResponsesAPIExtract(
  apiKey: string,
  model: string,
  reasoningEffort: string | null,
  sourceFiles: SourceFile[]
): Promise<ExtractionFields> {
  const systemText = buildExtractionSystemPrompt();
  const parts: Array<Record<string, unknown>> = [
    { type: 'input_text', text: systemText },
  ];
  for (const f of sourceFiles) {
    const dataUrl = `data:${f.mime};base64,${f.base64}`;
    if (f.mime === 'application/pdf') {
      parts.push({ type: 'input_file', filename: f.name || 'source.pdf', file_data: dataUrl });
    } else {
      parts.push({ type: 'input_image', image_url: dataUrl });
    }
  }

  const requestBody: Record<string, unknown> = {
    model,
    input: [{ role: 'user', content: parts }],
  };
  if (reasoningEffort && model.toLowerCase().startsWith('gpt-5')) {
    requestBody.reasoning = { effort: reasoningEffort };
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const body = (await response.json()) as OpenAIResponsesAPIResponse;
  if (!response.ok) {
    throw new Error(body?.error?.message || `OpenAI Responses request failed with ${response.status}`);
  }

  let textContent = toStringValue(body?.output_text);
  if (!textContent && Array.isArray(body?.output)) {
    const collected: string[] = [];
    for (const item of body.output) {
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (c && typeof c === 'object' && typeof c.text === 'string') {
            collected.push(c.text);
          }
        }
      }
    }
    textContent = collected.join('\n').trim();
  }

  if (!textContent) {
    throw new Error('AI Responses API returned empty content for extraction.');
  }
  return parseExtractionJson(textContent);
}

// ── Source file validation ──────────────────────────────────────────────────
function validateSourceFiles(raw: unknown): { ok: true; files: SourceFile[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, files: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'source_files must be an array.' };
  if (raw.length > MAX_SOURCE_FILES) {
    return { ok: false, error: `At most ${MAX_SOURCE_FILES} source files are allowed.` };
  }

  const files: SourceFile[] = [];
  let total = 0;
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'Each source_files item must be an object.' };
    }
    const rec = item as Record<string, unknown>;
    const name = toStringValue(rec.name) || 'source';
    const mime = toStringValue(rec.mime).toLowerCase();
    const base64 = toStringValue(rec.base64);
    if (!base64) return { ok: false, error: `Source file "${name}" is empty.` };
    if (!SUPPORTED_SOURCE_MIMES.has(mime)) {
      return { ok: false, error: `Unsupported source file type "${mime}". Allowed: JPEG, PNG, PDF.` };
    }
    // base64 size estimate: 4 chars per 3 bytes
    const sizeBytes = Math.ceil((base64.length * 3) / 4);
    const perFileLimit = mime === 'application/pdf' ? MAX_SOURCE_FILE_PDF_BYTES : MAX_SOURCE_FILE_IMAGE_BYTES;
    const perFileLimitLabel = mime === 'application/pdf' ? '20 MB' : '10 MB';
    if (sizeBytes > perFileLimit) {
      return { ok: false, error: `Source file "${name}" exceeds the per-file size limit (${perFileLimitLabel}).` };
    }
    total += sizeBytes;
    if (total > MAX_SOURCE_FILES_TOTAL_BYTES) {
      return { ok: false, error: 'Total source files size exceeds 30 MB.' };
    }
    files.push({ name, mime, base64 });
  }
  return { ok: true, files };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { success: false, error: 'Method not allowed', error_code: 'generation_failed' as ErrorCode },
      405
    );
  }

  let payload: DraftRequestBody;
  try {
    payload = (await req.json()) as DraftRequestBody;
  } catch {
    return failClosed('Invalid JSON payload.', 'generation_failed');
  }

  const sessionToken = toStringValue(payload?.session_token);
  const rawMode = toStringValue(payload?.mode) || 'draft';
  const inputs: DraftInputs = payload?.inputs && typeof payload.inputs === 'object' ? payload.inputs : {};

  if (rawMode !== 'draft' && rawMode !== 'extract_fields') {
    return failClosed(`Invalid mode "${rawMode}". Expected "draft" or "extract_fields".`, 'generation_failed');
  }
  const mode = rawMode as 'draft' | 'extract_fields';

  if (!sessionToken) {
    return failClosed('Session token is required.', 'session_invalid');
  }

  const sourceFilesValidation = validateSourceFiles(payload?.source_files);
  if (!sourceFilesValidation.ok) {
    return failClosed(sourceFilesValidation.error, 'generation_failed');
  }
  const sourceFiles = sourceFilesValidation.files;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[draft-activity-content] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return failClosed('AI service is not configured. Please contact an administrator.', 'ai_disabled');
  }

  // ── Authorization ────────────────────────────────────────────────────────
  const userId = await rpcCall<string | null>(
    supabaseUrl,
    serviceRoleKey,
    'resolve_custom_session_user_id',
    { p_session_token: sessionToken }
  );
  if (!userId || typeof userId !== 'string') {
    return failClosed('Session is invalid or expired. Please sign in again.', 'session_invalid');
  }

  const [canCreate, canEditAny] = await Promise.all([
    rpcCall<boolean>(supabaseUrl, serviceRoleKey, 'has_permission', {
      p_user_id: userId,
      p_permission_code: 'activities.create',
    }),
    rpcCall<boolean>(supabaseUrl, serviceRoleKey, 'has_permission', {
      p_user_id: userId,
      p_permission_code: 'activities.edit_any',
    }),
  ]);
  if (!canCreate && !canEditAny) {
    return failClosed('You do not have permission to draft Activities content.', 'permission_denied');
  }

  // ── Load AI runtime ──────────────────────────────────────────────────────
  const settings = await loadAIRuntimeSettings(supabaseUrl, serviceRoleKey);
  if (!settings) {
    return failClosed('AI runtime is not configured. Please configure AI Settings first.', 'ai_disabled');
  }

  const provider = toStringValue(settings.provider).toLowerCase();
  const model = toStringValue(settings.model) || 'gpt-4o-mini';
  const enabled = Boolean(settings.is_enabled);
  const apiKey = toStringValue(settings.api_key_secret);
  const reasoningEffort = sanitizeReasoningEffort(settings.reasoning_effort);

  if (!enabled) {
    return failClosed('AI generation is disabled. Enable it in AI Settings.', 'ai_disabled');
  }
  if (provider !== 'openai') {
    return failClosed(
      `AI provider "${provider || 'unknown'}" is not supported by Activities drafting yet. OpenAI is the only currently supported provider.`,
      'provider_unsupported'
    );
  }
  if (!apiKey) {
    return failClosed('AI API key is not configured. Please set it in AI Settings.', 'no_api_key');
  }

  // ── extract_fields mode ──────────────────────────────────────────────────
  if (mode === 'extract_fields') {
    if (sourceFiles.length === 0) {
      return failClosed(
        'extract_fields mode requires at least one source file.',
        'generation_failed'
      );
    }
    try {
      const fields = await callOpenAIResponsesAPIExtract(apiKey, model, reasoningEffort, sourceFiles);
      return jsonResponse({ success: true, fields });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed.';
      console.error('[draft-activity-content] extraction error:', message);
      return failClosed(`AI field extraction failed: ${message}`, 'generation_failed');
    }
  }

  // ── draft mode (default) ─────────────────────────────────────────────────
  try {
    const systemPrompt = buildSystemPrompt(sourceFiles.length > 0);
    const userPrompt = buildUserFacts(inputs);

    const draft = sourceFiles.length > 0
      ? await callOpenAIResponsesAPI(apiKey, model, reasoningEffort, systemPrompt, userPrompt, sourceFiles)
      : await callOpenAIChatCompletions(apiKey, model, reasoningEffort, systemPrompt, userPrompt);

    return jsonResponse({ success: true, data: draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI drafting failed.';
    console.error('[draft-activity-content] generation error:', message);
    return failClosed(`AI drafting failed: ${message}`, 'generation_failed');
  }
});
