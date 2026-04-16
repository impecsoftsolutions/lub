/**
 * extract-document — Edge Function
 *
 * Uses OpenAI Responses API (POST /v1/responses), NOT chat/completions.
 * response_format is intentionally absent — incompatible with many models.
 *
 * Supported format matrix:
 * ┌───────────────────────────────┬──────────────┬──────────────────────────────────────┐
 * │ Format                        │ Pipeline     │ Notes                                │
 * ├───────────────────────────────┼──────────────┼──────────────────────────────────────┤
 * │ JPEG / PNG / GIF / WebP       │ image_vision │ input_image via Responses API        │
 * │ PDF (text-based)              │ pdf_pipeline │ BT/ET text extraction → AI text      │
 * │ PDF (image-based / no text)   │ pdf_pipeline │ Vision fallback via OpenAI input_file │
 * │ Plain text / CSV              │ text_pipeline│ UTF-8 decoded, sent as input_text    │
 * │ HEIC / HEIF                   │ none         │ unsupported_format                   │
 * │ BMP / TIFF                    │ none         │ unsupported_format                   │
 * │ DOCX / XLSX / ZIP             │ none         │ unsupported_format                   │
 * │ Unknown / unrecognised        │ none         │ unsupported_format                   │
 * └───────────────────────────────┴──────────────┴──────────────────────────────────────┘
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DetectedDocType =
  | 'payment_proof'
  | 'gst_certificate'
  | 'udyam_certificate'
  | 'pan_card'
  | 'aadhaar_card'
  | 'unknown';

type ReasonCode =
  | 'ok'
  | 'empty_input'
  | 'unsupported_format'
  | 'ai_error'
  | 'parse_error'
  | 'low_confidence';

type PipelineUsed =
  | 'image_vision'
  | 'pdf_pipeline'
  | 'text_pipeline'
  | 'office_pipeline'
  | 'none';

interface ExtractionEnvelope {
  detected_type: DetectedDocType;
  is_readable: boolean;
  extracted_fields: Record<string, string>;
  reason_code: ReasonCode;
  pipeline_used: PipelineUsed;
  input_mime: string;
  detected_mime: string;
}

interface AIRuntimeSettingsRow {
  provider: string;
  model: string;
  reasoning_effort: string | null;
  is_enabled: boolean;
  api_key_secret: string | null;
}

interface ParsedAIResult {
  detected_type: string;
  is_readable: boolean;
  extracted_fields: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_DOC_TYPES = new Set<string>([
  'payment_proof', 'gst_certificate', 'udyam_certificate', 'pan_card', 'aadhaar_card', 'unknown',
]);

const ALLOWED_FIELD_KEYS = new Set<string>([
  'payment_date', 'transaction_id', 'bank_reference', 'amount_paid',
  'gst_number', 'pan_company',
  'full_name', 'date_of_birth', 'gender',
  'company_name', 'company_address', 'pin_code', 'state', 'district', 'city',
  'industry', 'activity_type', 'products_services',
]);

const DOC_TYPE_FIELD_POLICY: Record<DetectedDocType, Set<string>> = {
  payment_proof: new Set([
    'payment_date',
    'transaction_id',
    'bank_reference',
    'amount_paid',
  ]),
  gst_certificate: new Set([
    'gst_number',
    'company_name',
    'company_address',
    'pin_code',
    'state',
    'district',
    'city',
    'industry',
  ]),
  udyam_certificate: new Set([
    'company_name',
    'company_address',
    'pin_code',
    'state',
    'district',
    'city',
    'industry',
    'activity_type',
    'products_services',
  ]),
  pan_card: new Set([
    'pan_company',
  ]),
  aadhaar_card: new Set([
    'full_name',
    'date_of_birth',
    'gender',
  ]),
  unknown: new Set(),
};

/** MIME types routed to the image vision pipeline */
const IMAGE_MIMES = new Set<string>([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
]);

/** MIME types that are unsupported — short-circuit without calling AI */
const UNSUPPORTED_MIMES = new Set<string>([
  'image/heic', 'image/heif',
  'image/bmp', 'image/tiff', 'image/tif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
]);

const SYSTEM_INSTRUCTIONS =
  'You are a document data extractor. Extract structured data from document images or text. ' +
  'Return ONLY a valid JSON object — no markdown fences, no prose, no extra keys outside the JSON.';

// ---------------------------------------------------------------------------
// Helpers: type safety
// ---------------------------------------------------------------------------

function toSafeDetectedType(raw: unknown): DetectedDocType {
  if (typeof raw === 'string' && VALID_DOC_TYPES.has(raw)) {
    return raw as DetectedDocType;
  }
  return 'unknown';
}

function buildEnvelope(
  selectedDocType: string,
  overrides: Partial<ExtractionEnvelope>
): ExtractionEnvelope {
  return {
    detected_type: toSafeDetectedType(selectedDocType),
    is_readable: false,
    extracted_fields: {},
    reason_code: 'ai_error',
    pipeline_used: 'none',
    input_mime: '',
    detected_mime: '',
    ...overrides,
  };
}

function respond(body: ExtractionEnvelope): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Helpers: date normalisation
// ---------------------------------------------------------------------------

function normalizeDateField(raw: string): string {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return trimmed;
}

// ---------------------------------------------------------------------------
// Helpers: synonym / alias normalisation for extracted key names
// The AI may return keys under various spellings; map them to canonical form.
// ---------------------------------------------------------------------------

const KEY_SYNONYMS: Record<string, string> = {
  // full_name
  name: 'full_name',
  card_holder_name: 'full_name',
  cardholder_name: 'full_name',
  holder_name: 'full_name',
  account_holder: 'full_name',
  account_holder_name: 'full_name',
  beneficiary_name: 'full_name',
  payer_name: 'full_name',
  payee_name: 'full_name',
  owner_name: 'full_name',
  proprietor_name: 'full_name',
  // date_of_birth
  dob: 'date_of_birth',
  birth_date: 'date_of_birth',
  birthdate: 'date_of_birth',
  // gender
  sex: 'gender',
  // transaction_id
  transaction_reference: 'transaction_id',
  txn_reference: 'transaction_id',
  txn_ref: 'transaction_id',
  txn_id: 'transaction_id',
  transaction_no: 'transaction_id',
  utr: 'transaction_id',
  utr_number: 'transaction_id',
  utr_no: 'transaction_id',
  rrn: 'transaction_id',
  ref_number: 'transaction_id',
  // bank_reference
  bank_ref: 'bank_reference',
  bank_ref_no: 'bank_reference',
  reference_no: 'bank_reference',
  reference_number: 'bank_reference',
  ref_no: 'bank_reference',
  // company_name
  enterprise: 'company_name',
  enterprise_name: 'company_name',
  name_of_enterprise: 'company_name',
  business_name: 'company_name',
  legal_name: 'company_name',
  trade_name: 'company_name',
  organization_name: 'company_name',
  // pin_code
  pincode: 'pin_code',
  postal_code: 'pin_code',
  zip: 'pin_code',
  zip_code: 'pin_code',
  // company_address
  address: 'company_address',
  addr: 'company_address',
  residential_address: 'company_address',
  registered_address: 'company_address',
  location: 'company_address',
  official_address: 'company_address',
  official_address_of_enterprise: 'company_address',
  offical_address_of_enterprise: 'company_address',
  // pan_company
  pan: 'pan_company',
  pan_number: 'pan_company',
  pan_no: 'pan_company',
  company_pan: 'pan_company',
  pan_card_number: 'pan_company',
  // gst_number
  gstin: 'gst_number',
  gst: 'gst_number',
  gst_no: 'gst_number',
  gst_in: 'gst_number',
  // state/district/city
  state_name: 'state',
  district_name: 'district',
  city_name: 'city',
  town: 'city',
  village: 'city',
  city_town: 'city',
  village_town: 'city',
  // industry
  sector: 'industry',
  business_industry: 'industry',
  industry_type: 'industry',
  nic_description: 'industry',
  nic_2_digit: 'industry',
  nic_4_digit: 'industry',
  nic_5_digit: 'industry',
  // activity_type
  nature_of_business: 'activity_type',
  nature_business: 'activity_type',
  business_type: 'activity_type',
  major_activity: 'activity_type',
  major_activity_type: 'activity_type',
  activity_kind: 'activity_type',
  activity: 'activity_type',
  // products_services
  products: 'products_services',
  product: 'products_services',
  product_details: 'products_services',
  goods_services: 'products_services',
  business_products: 'products_services',
  business_services: 'products_services',
  products_and_services: 'products_services',
  products_services_details: 'products_services',
  nic_activity: 'products_services',
  // amount_paid
  amount: 'amount_paid',
  total_amount: 'amount_paid',
  paid_amount: 'amount_paid',
  transaction_amount: 'amount_paid',
  txn_amount: 'amount_paid',
};

/**
 * Remap any synonym keys in the AI output to canonical field names.
 * First-write wins — if the AI returned both "gstin" and "gst_number", whichever comes
 * first is kept; the synonym is not allowed to overwrite an already-set canonical key.
 */
function normalizeExtractedKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw)) {
    const lower = key.toLowerCase().trim().replace(/\s+/g, '_');
    const canonical = KEY_SYNONYMS[lower] ?? lower;
    if (out[canonical] === undefined) {
      out[canonical] = val;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers: per-field value normalisation
// ---------------------------------------------------------------------------

function normalizeGender(raw: string): string {
  const lower = raw.toLowerCase().trim();
  if (lower === 'm' || lower === 'male') return 'male';
  if (lower === 'f' || lower === 'female') return 'female';
  return lower;
}

// ---------------------------------------------------------------------------
// Helpers: field sanitisation (runs key normalisation first)
// ---------------------------------------------------------------------------

function sanitizeExtractedFields(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const normalized = normalizeExtractedKeys(raw as Record<string, unknown>);
  const result: Record<string, string> = {};

  for (const key of Object.keys(normalized)) {
    if (!ALLOWED_FIELD_KEYS.has(key)) continue;
    const val = normalized[key];
    let strVal: string;
    if (typeof val === 'string' && val.trim()) {
      strVal = val.trim();
    } else if (typeof val === 'number' && isFinite(val)) {
      strVal = String(val);
    } else {
      continue;
    }

    // Per-field value normalisation
    if (key === 'payment_date' || key === 'date_of_birth') {
      strVal = normalizeDateField(strVal);
    } else if (key === 'gender') {
      strVal = normalizeGender(strVal);
    } else if (key === 'pan_company') {
      strVal = strVal.toUpperCase().replace(/[^A-Z0-9]/g, '');
    } else if (key === 'gst_number') {
      strVal = strVal.toUpperCase().replace(/[^A-Z0-9]/g, '');
    } else if (key === 'pin_code') {
      const digits = strVal.replace(/\D/g, '');
      const sixDigit = digits.match(/\d{6}/);
      strVal = sixDigit ? sixDigit[0] : digits;
    }

    if (strVal) result[key] = strVal;
  }
  return result;
}

function hasAnyField(fields: Record<string, string>, keys: string[]): boolean {
  return keys.some((key) => Boolean(fields[key]?.trim()));
}

function getEffectiveDocType(
  selectedDocType: string,
  parsedDetectedType: string,
  sanitizedFields: Record<string, string>
): DetectedDocType {
  // Respect explicit user-provided doc type when present (future-safe for optional UI selectors).
  if (VALID_DOC_TYPES.has(selectedDocType)) {
    const selected = selectedDocType as DetectedDocType;
    if (selected !== 'unknown') {
      return selected;
    }
  }

  const parsed = toSafeDetectedType(parsedDetectedType);

  // Anchor signals (server-side confidence hardening to prevent cross-domain misclassification).
  const hasPaymentAnchor = hasAnyField(sanitizedFields, [
    'payment_date',
    'transaction_id',
    'bank_reference',
    'amount_paid',
  ]);
  const hasGstAnchor = hasAnyField(sanitizedFields, ['gst_number']);
  const hasPanAnchor = hasAnyField(sanitizedFields, ['pan_company']);
  const hasIdentityAnchor =
    Boolean(sanitizedFields.full_name?.trim()) &&
    hasAnyField(sanitizedFields, ['date_of_birth', 'gender']);
  const hasUdyamBusinessAnchor = hasAnyField(sanitizedFields, [
    'industry',
    'activity_type',
    'products_services',
  ]);
  const hasAddressAnchor = hasAnyField(sanitizedFields, [
    'company_name',
    'company_address',
    'pin_code',
    'state',
    'district',
    'city',
  ]);

  // Strong deterministic anchors first.
  if (hasGstAnchor) return 'gst_certificate';
  if (hasPanAnchor && (parsed === 'pan_card' || parsed === 'unknown')) return 'pan_card';
  if (hasIdentityAnchor) return 'aadhaar_card';

  // Payment proof must never leak into company/business fields due to misclassification.
  if (hasPaymentAnchor) {
    return 'payment_proof';
  }

  // UDYAM fallback only when business/location signals exist.
  if (hasUdyamBusinessAnchor || (parsed === 'udyam_certificate' && hasAddressAnchor)) {
    return 'udyam_certificate';
  }

  // If parsed doc type has at least one allowed field, accept it; else treat as unknown.
  if (parsed !== 'unknown') {
    const allowed = DOC_TYPE_FIELD_POLICY[parsed];
    if (Object.keys(sanitizedFields).some((key) => allowed.has(key))) {
      return parsed;
    }
  }

  return 'unknown';
}

function filterFieldsByDocPolicy(
  fields: Record<string, string>,
  effectiveDocType: DetectedDocType
): Record<string, string> {
  const allowed = DOC_TYPE_FIELD_POLICY[effectiveDocType];
  if (!allowed || allowed.size === 0) {
    return {};
  }

  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (allowed.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

// ---------------------------------------------------------------------------
// Base64 decode
// ---------------------------------------------------------------------------

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
  const binary = atob(clean);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// Magic-byte MIME detection
// ---------------------------------------------------------------------------

function detectMimeFromBytes(bytes: Uint8Array, clientMime: string, fileName: string): string {
  if (bytes.length < 4) return clientMime || 'application/octet-stream';

  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  // GIF: 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  // WebP: RIFF????WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  // PDF: %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf';
  // HEIC/HEIF: ISO Base Media File Format — ftyp box at offset 4
  if (bytes.length >= 12) {
    const boxType = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (boxType === 'ftyp') {
      const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
      if (['heic', 'heis', 'heim', 'hevc', 'hevx', 'mif1', 'msf1'].some(b => brand.startsWith(b.slice(0, 4)))) {
        return 'image/heic';
      }
    }
  }
  // BMP: 42 4D
  if (bytes[0] === 0x42 && bytes[1] === 0x4D) return 'image/bmp';
  // TIFF: LE 49 49 2A 00 — BE 4D 4D 00 2A
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) ||
    (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A)
  ) return 'image/tiff';
  // ZIP / OOXML: PK\x03\x04
  if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
    const lowerName = (fileName || '').toLowerCase();
    if (lowerName.endsWith('.docx'))
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (lowerName.endsWith('.xlsx'))
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (lowerName.endsWith('.pptx'))
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    return 'application/zip';
  }

  return clientMime || 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// PDF text extraction (text-based PDFs only)
// ---------------------------------------------------------------------------

function extractPdfTextLegacy(bytes: Uint8Array): string | null {
  const raw = new TextDecoder('latin1').decode(bytes);
  const fragments: string[] = [];

  const btEtRe = /BT\s([\s\S]*?)ET/g;
  let match: RegExpExecArray | null;

  while ((match = btEtRe.exec(raw)) !== null) {
    const block = match[1];

    const parenRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
    let pMatch: RegExpExecArray | null;
    while ((pMatch = parenRe.exec(block)) !== null) {
      const text = pMatch[1]
        .replace(/\\n/g, ' ').replace(/\\r/g, ' ').replace(/\\t/g, ' ')
        .replace(/\\\\/g, '\\').replace(/\\(.)/g, '$1').trim();
      if (text.length > 1) fragments.push(text);
    }

    const hexRe = /<([0-9A-Fa-f]{2,})>/g;
    let hMatch: RegExpExecArray | null;
    while ((hMatch = hexRe.exec(block)) !== null) {
      const hex = hMatch[1];
      let decoded = '';
      for (let i = 0; i < hex.length - 1; i += 2) {
        const code = parseInt(hex.slice(i, i + 2), 16);
        if (code > 31) decoded += String.fromCharCode(code);
      }
      if (decoded.trim().length > 1) fragments.push(decoded.trim());
    }
  }

  if (fragments.length < 3) return null;

  // Hybrid government PDFs can expose a "text layer" made of single-glyph fragments.
  // Treat that as semantically weak so we fall through to the pdf_vision pipeline instead.
  const wordLikeFragments = fragments.filter((fragment) => fragment.length >= 3);
  if (wordLikeFragments.length < 5) return null;
  const joined = fragments.join(' ');
  if (joined.length < 150) return null;

  return joined.slice(0, 8000);
}

async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  try {
    const pdfjs = await import('npm:pdfjs-dist@4.10.38/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      disableWorker: true,
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true,
    });
    const pdf = await loadingTask.promise;
    const pageTexts: string[] = [];

    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex);
      const textContent = await page.getTextContent();
      const pageFragments = textContent.items
        .map((item: unknown) => {
          if (!item || typeof item !== 'object') return '';
          const str = (item as { str?: unknown }).str;
          return typeof str === 'string' ? str.trim() : '';
        })
        .filter((fragment: string) => fragment.length > 0);

      if (pageFragments.length > 0) {
        pageTexts.push(pageFragments.join(' '));
      }
    }

    const joined = pageTexts.join('\n').replace(/\s+/g, ' ').trim();
    if (joined.length >= 150) {
      return joined.slice(0, 8000);
    }
  } catch (error) {
    console.warn(
      `[extract-document] pdfjs text extraction failed, falling back to legacy parser: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return extractPdfTextLegacy(bytes);
}

// ---------------------------------------------------------------------------
// OpenAI Responses API call
// POST /v1/responses — replaces chat/completions
// response_format is intentionally NOT used (incompatible with many models)
// ---------------------------------------------------------------------------

type ResponsesInputItem =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail?: string }
  | { type: 'input_file'; filename: string; file_data: string };

async function callOpenAIResponses(
  apiKey: string,
  model: string,
  instructions: string,
  inputContent: ResponsesInputItem[],
  maxOutputTokens = 800,
  reasoningEffort?: string | null,
  forceJsonFormat = false
): Promise<{ outputText: string | null; error: string | null }> {
  const body: Record<string, unknown> = {
    model,
    instructions,
    input: [
      {
        role: 'user',
        content: inputContent,
      },
    ],
    max_output_tokens: maxOutputTokens,
  };

  // Include reasoning effort only when explicitly configured
  if (reasoningEffort) {
    body.reasoning = { effort: reasoningEffort };
  }

  if (forceJsonFormat) {
    body.text = { format: { type: 'json_object' } };
  }

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (fetchErr) {
    return { outputText: null, error: fetchErr instanceof Error ? fetchErr.message : 'Network error' };
  }

  const responseBody = await response.json() as Record<string, unknown>;

  if (!response.ok) {
    const errObj = responseBody?.error as Record<string, unknown> | undefined;
    const errMsg = typeof errObj?.message === 'string' ? errObj.message : `OpenAI HTTP ${response.status}`;
    // Sanitize: never log the full error object which may contain request echoes
    return { outputText: null, error: errMsg };
  }

  // Parse output — try convenience field first, then walk output array
  const outputText = extractOutputText(responseBody);
  if (!outputText) {
    const responseKeys = Object.keys(responseBody).join(',');
    const outputTypes = Array.isArray(responseBody.output)
      ? responseBody.output
          .map((item) =>
            item && typeof item === 'object'
              ? String((item as Record<string, unknown>).type ?? '?')
              : '?'
          )
          .join(',')
      : 'none';
    console.warn(
      `[extract-document] extractOutputText null — response_keys="${responseKeys}" output_types="${outputTypes}"`
    );
  }
  return { outputText, error: null };
}

function extractOutputText(responseBody: Record<string, unknown>): string | null {
  // 1. Convenience field output_text (present in most responses)
  if (typeof responseBody.output_text === 'string' && responseBody.output_text.trim()) {
    return responseBody.output_text.trim();
  }

  // 2. Walk output[] array for message items
  const output = responseBody.output;
  if (!Array.isArray(output)) return null;

  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const itemObj = item as Record<string, unknown>;

    // Direct text field
    if (typeof itemObj.text === 'string' && itemObj.text.trim()) {
      return itemObj.text.trim();
    }

    // content[] array within a message item
    const content = itemObj.content;
    if (Array.isArray(content)) {
      for (const c of content) {
        if (!c || typeof c !== 'object') continue;
        const cObj = c as Record<string, unknown>;
        if (typeof cObj.text === 'string' && cObj.text.trim()) {
          return cObj.text.trim();
        }
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Parse AI response text into structured result
// ---------------------------------------------------------------------------

function parseAIResponse(content: string): ParsedAIResult | null {
  const tryParse = (text: string): ParsedAIResult | null => {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') return null;
      return {
        detected_type: typeof parsed.detected_type === 'string' ? parsed.detected_type : 'unknown',
        is_readable: Boolean(parsed.is_readable),
        extracted_fields:
          parsed.extracted_fields &&
          typeof parsed.extracted_fields === 'object' &&
          !Array.isArray(parsed.extracted_fields)
            ? (parsed.extracted_fields as Record<string, unknown>)
            : {},
      };
    } catch {
      return null;
    }
  };

  // Attempt 1: bare JSON
  const direct = tryParse(content);
  if (direct) return direct;

  // Attempt 2: strip markdown code fence
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    const r = tryParse(fenceMatch[1]);
    if (r) return r;
  }

  // Attempt 3: extract first { ... last }
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return tryParse(content.slice(firstBrace, lastBrace + 1));
  }

  return null;
}

// ---------------------------------------------------------------------------
// Extraction prompt — doc-type-aware
// ---------------------------------------------------------------------------

/**
 * Per-document-type priority hint appended to the base extraction prompt.
 * Tells the model which fields to look hardest for on this specific document type.
 */
function getDocTypePriorityHint(selectedDocType: string): string {
  switch (selectedDocType) {
    case 'payment_proof':
      return 'PRIORITY for this doc type: payment_date, transaction_id (UTR/RRN/UPI ref), bank_reference, amount_paid.';
    case 'gst_certificate':
      return 'PRIORITY for this doc type: gst_number (15-char GSTIN), company_name, company_address, state, district, city, pin_code, industry.';
    case 'udyam_certificate':
      return 'PRIORITY for this doc type: company_name, company_address, state, district, city, pin_code, industry, activity_type (look for the label "MAJOR ACTIVITY" on the certificate and map its value to activity_type), products_services.';
    case 'pan_card':
      return 'PRIORITY for this doc type: pan_company (10-char PAN).';
    case 'aadhaar_card':
      return 'PRIORITY for this doc type: full_name, date_of_birth (DOB, usually DD/MM/YYYY), gender (IMPORTANT: on Indian Aadhaar cards, gender may appear as a standalone word "Male" or "Female" without any "Gender" label prefix; extract that standalone word as gender when clearly visible).';
    default:
      return 'Extract all registration-relevant fields visible on this document.';
  }
}

function buildExtractionPrompt(selectedDocType: string): string {
  const docLabel = selectedDocType === 'unknown' ? 'document' : selectedDocType.replace(/_/g, ' ');
  return `Extract data from this ${docLabel} document. Return ONLY this exact JSON — no markdown, no prose, no extra keys:
{
  "detected_type": "<payment_proof|gst_certificate|udyam_certificate|pan_card|aadhaar_card|unknown>",
  "is_readable": <true|false>,
  "extracted_fields": {
    "full_name": "<full name of person or account holder as printed>",
    "date_of_birth": "<YYYY-MM-DD if visible>",
    "gender": "<male|female if visible>",
    "payment_date": "<YYYY-MM-DD if visible>",
    "transaction_id": "<UTR/UPI ref/RRN/transaction ID if visible>",
    "bank_reference": "<bank ref/reference number if visible>",
    "amount_paid": "<digits only, no currency symbol>",
    "gst_number": "<15-char GSTIN if visible>",
    "pan_company": "<10-char PAN like ABCDE1234F if visible>",
    "company_name": "<company/business name if visible>",
    "company_address": "<full address (street, locality) if visible>",
    "pin_code": "<6-digit PIN/postal code if visible>",
    "state": "<state name if visible>",
    "district": "<district name if visible>",
    "city": "<city/town/village if visible>",
    "industry": "<industry/sector if visible>",
    "activity_type": "<business activity / nature of business if visible>",
    "products_services": "<products or services if visible>"
  }
}
Rules:
- detected_type: what this document actually appears to be
- is_readable: false only if blurry, corrupted, encrypted, or not a document
- extracted_fields: include ONLY fields clearly visible; omit fields not present or unreadable
- date_of_birth / payment_date: YYYY-MM-DD format only
- gender: "male" or "female" only
- amount_paid: digits only (no ₹, INR, commas, spaces)
- pan_company: uppercase alphanumeric, exactly 10 chars
- gst_number: uppercase alphanumeric, exactly 15 chars
- Return only fields that truly belong to the document type; do not infer or guess identity fields from non-identity documents.
- For payment receipts/screenshots, do NOT treat payee/merchant organization text as company_name/company_address.
- For Aadhaar cards, if "Male" or "Female" appears as a standalone word near the identity details, extract it as gender even without a "Gender:" label.
- For UDYAM / MSME certificates:
  - map "NAME OF ENTERPRISE" to company_name
  - map "OFFICAL ADDRESS OF ENTERPRISE" or "OFFICIAL ADDRESS OF ENTERPRISE" to company_address
  - extract state, district, city, and pin_code from the same address block when visible
  - map "MAJOR ACTIVITY" to activity_type
  - use NIC / industry descriptions for industry
  - use NIC activity / business service descriptions for products_services when clearly visible
${getDocTypePriorityHint(selectedDocType)}`;
}

// ---------------------------------------------------------------------------
// Pipeline: image_vision
// ---------------------------------------------------------------------------

async function runImagePipeline(
  apiKey: string,
  model: string,
  detectedMime: string,
  cleanBase64: string,
  selectedDocType: string,
  reasoningEffort: string | null
): Promise<{ parsed: ParsedAIResult | null; aiError: string | null }> {
  const inputContent: ResponsesInputItem[] = [
    { type: 'input_text', text: buildExtractionPrompt(selectedDocType) },
    { type: 'input_image', image_url: `data:${detectedMime};base64,${cleanBase64}`, detail: 'high' },
  ];

  const { outputText, error } = await callOpenAIResponses(
    apiKey, model, SYSTEM_INSTRUCTIONS, inputContent, 800, reasoningEffort, true
  );
  if (error || !outputText) return { parsed: null, aiError: error };
  return { parsed: parseAIResponse(outputText), aiError: null };
}

// ---------------------------------------------------------------------------
// Pipeline: pdf_pipeline (text-based PDFs)
// ---------------------------------------------------------------------------

async function runPdfPipeline(
  apiKey: string,
  model: string,
  pdfText: string,
  selectedDocType: string,
  reasoningEffort: string | null
): Promise<{ parsed: ParsedAIResult | null; aiError: string | null }> {
  const prompt = `${buildExtractionPrompt(selectedDocType)}\n\nDocument text content:\n${pdfText}`;
  const inputContent: ResponsesInputItem[] = [
    { type: 'input_text', text: prompt },
  ];

  const { outputText, error } = await callOpenAIResponses(
    apiKey, model, SYSTEM_INSTRUCTIONS, inputContent, 800, reasoningEffort
  );
  if (error || !outputText) return { parsed: null, aiError: error };
  return { parsed: parseAIResponse(outputText), aiError: null };
}

// ---------------------------------------------------------------------------
// Pipeline: pdf_vision_pipeline (image-based / scanned PDFs via OpenAI input_file)
// ---------------------------------------------------------------------------

async function runPdfVisionPipeline(
  apiKey: string,
  model: string,
  cleanBase64: string,
  fileName: string,
  selectedDocType: string,
  reasoningEffort: string | null
): Promise<{ parsed: ParsedAIResult | null; aiError: string | null }> {
  const inputContent: ResponsesInputItem[] = [
    { type: 'input_text', text: buildExtractionPrompt(selectedDocType) },
    {
      type: 'input_file',
      filename: fileName || 'document.pdf',
      file_data: `data:application/pdf;base64,${cleanBase64}`,
    },
  ];

  const { outputText, error } = await callOpenAIResponses(
    apiKey, model, SYSTEM_INSTRUCTIONS, inputContent, 800, reasoningEffort
  );
  if (error || !outputText) return { parsed: null, aiError: error };
  return { parsed: parseAIResponse(outputText), aiError: null };
}

// ---------------------------------------------------------------------------
// Pipeline: text_pipeline (plain text / CSV)
// ---------------------------------------------------------------------------

async function runTextPipeline(
  apiKey: string,
  model: string,
  text: string,
  selectedDocType: string,
  reasoningEffort: string | null
): Promise<{ parsed: ParsedAIResult | null; aiError: string | null }> {
  const prompt = `${buildExtractionPrompt(selectedDocType)}\n\nDocument text:\n${text.slice(0, 8000)}`;
  const inputContent: ResponsesInputItem[] = [
    { type: 'input_text', text: prompt },
  ];

  const { outputText, error } = await callOpenAIResponses(
    apiKey, model, SYSTEM_INSTRUCTIONS, inputContent, 800, reasoningEffort
  );
  if (error || !outputText) return { parsed: null, aiError: error };
  return { parsed: parseAIResponse(outputText), aiError: null };
}

// ---------------------------------------------------------------------------
// Route to pipeline
// ---------------------------------------------------------------------------

type PipelineRoute =
  | { type: 'image' }
  | { type: 'pdf_text'; text: string }
  | { type: 'pdf_vision' }
  | { type: 'text'; text: string }
  | { type: 'unsupported' }
  | { type: 'unknown' };

async function routePipeline(detectedMime: string, bytes: Uint8Array, fileName: string): Promise<PipelineRoute> {
  if (IMAGE_MIMES.has(detectedMime)) return { type: 'image' };

  if (UNSUPPORTED_MIMES.has(detectedMime)) return { type: 'unsupported' };

  if (detectedMime === 'application/pdf') {
    const pdfText = await extractPdfText(bytes);
    if (pdfText) return { type: 'pdf_text', text: pdfText };
    // Image-based / scanned PDF — use OpenAI input_file vision fallback
    return { type: 'pdf_vision' };
  }

  if (detectedMime === 'text/plain' || detectedMime.startsWith('text/')) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return { type: 'text', text };
  }

  // Extension fallback for unrecognised MIME
  const lowerName = (fileName || '').toLowerCase();
  if (lowerName.endsWith('.txt') || lowerName.endsWith('.csv')) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return { type: 'text', text };
  }

  return { type: 'unknown' };
}

// ---------------------------------------------------------------------------
// AI Runtime Settings
// ---------------------------------------------------------------------------

async function loadAIRuntimeSettings(): Promise<AIRuntimeSettingsRow | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!supabaseUrl || !serviceRoleKey) return null;

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
    if (!response.ok) return null;
    const rows = (await response.json()) as AIRuntimeSettingsRow[];
    return Array.isArray(rows) && rows.length > 0 ? (rows[0] ?? null) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let selectedDocType = 'unknown';
  let inputMime = '';
  let detectedMime = '';

  try {
    const payload = (await req.json()) as Record<string, unknown>;
    selectedDocType = typeof payload.selected_doc_type === 'string' ? payload.selected_doc_type : 'unknown';
    const fileBase64 = typeof payload.file_base64 === 'string' ? payload.file_base64 : '';
    const clientMime = typeof payload.file_mime_type === 'string' ? payload.file_mime_type : '';
    const fileName = typeof payload.file_name === 'string' ? payload.file_name : '';

    inputMime = clientMime;

    // ------------------------------------------------------------------
    // 1. Validate input
    // ------------------------------------------------------------------
    if (!fileBase64) {
      console.log('[extract-document] empty_input: no base64 data');
      return respond(buildEnvelope(selectedDocType, {
        reason_code: 'empty_input', pipeline_used: 'none',
        input_mime: inputMime, detected_mime: '',
      }));
    }

    // ------------------------------------------------------------------
    // 2. Decode bytes and detect MIME from magic bytes
    // ------------------------------------------------------------------
    const cleanBase64 = fileBase64.includes(',')
      ? fileBase64.slice(fileBase64.indexOf(',') + 1)
      : fileBase64;

    let bytes: Uint8Array;
    try {
      bytes = base64ToBytes(cleanBase64);
    } catch {
      console.log('[extract-document] parse_error: base64 decode failed');
      return respond(buildEnvelope(selectedDocType, {
        reason_code: 'parse_error', pipeline_used: 'none',
        input_mime: inputMime, detected_mime: '',
      }));
    }

    detectedMime = detectMimeFromBytes(bytes, clientMime, fileName);
    console.log(
      `[extract-document] doc_type="${selectedDocType}" input_mime="${inputMime}" ` +
      `detected_mime="${detectedMime}" size=${bytes.length} file="${fileName}"`
    );

    // ------------------------------------------------------------------
    // 3. Short-circuit unsupported formats
    // ------------------------------------------------------------------
    if (UNSUPPORTED_MIMES.has(detectedMime)) {
      console.log(`[extract-document] unsupported_format: ${detectedMime}`);
      return respond(buildEnvelope(selectedDocType, {
        reason_code: 'unsupported_format', pipeline_used: 'none',
        input_mime: inputMime, detected_mime: detectedMime,
      }));
    }

    // ------------------------------------------------------------------
    // 4. Load AI runtime settings
    // ------------------------------------------------------------------
    const settings = await loadAIRuntimeSettings();
    if (!settings) {
      console.error('[extract-document] ai_error: failed to load ai_runtime_settings');
      return respond(buildEnvelope(selectedDocType, {
        reason_code: 'ai_error', pipeline_used: 'none',
        input_mime: inputMime, detected_mime: detectedMime,
      }));
    }

    const provider = String(settings.provider ?? '').toLowerCase();
    const model = String(settings.model || 'gpt-4o');
    const enabled = Boolean(settings.is_enabled);
    const apiKey = String(settings.api_key_secret ?? '');
    const reasoningEffort = settings.reasoning_effort ?? null;

    if (!enabled || provider !== 'openai' || !apiKey) {
      console.log(`[extract-document] ai_error: disabled or misconfigured (enabled=${enabled} provider=${provider})`);
      return respond(buildEnvelope(selectedDocType, {
        reason_code: 'ai_error', pipeline_used: 'none',
        input_mime: inputMime, detected_mime: detectedMime,
      }));
    }

    // ------------------------------------------------------------------
    // 5. Route to pipeline
    // ------------------------------------------------------------------
    const route = await routePipeline(detectedMime, bytes, fileName);
    console.log(`[extract-document] route="${route.type}" model="${model}" reasoning="${reasoningEffort ?? 'none'}"`);

    let parsed: ParsedAIResult | null = null;
    let pipelineUsed: PipelineUsed = 'none';
    let aiError: string | null = null;

    switch (route.type) {
      case 'image': {
        pipelineUsed = 'image_vision';
        const r = await runImagePipeline(apiKey, model, detectedMime, cleanBase64, selectedDocType, reasoningEffort);
        parsed = r.parsed;
        aiError = r.aiError;
        break;
      }

      case 'pdf_text': {
        pipelineUsed = 'pdf_pipeline';
        const r = await runPdfPipeline(apiKey, model, route.text, selectedDocType, reasoningEffort);
        parsed = r.parsed;
        aiError = r.aiError;
        if (!aiError && (!parsed || parsed.is_readable === false)) {
          console.log('[extract-document] pdf_text parse/unreadable, retrying with pdf_vision');
          const retry = await runPdfVisionPipeline(
            apiKey,
            model,
            cleanBase64,
            fileName,
            selectedDocType,
            reasoningEffort
          );
          if (!retry.aiError && retry.parsed) {
            parsed = retry.parsed;
          } else if (retry.aiError) {
            aiError = retry.aiError;
          }
        }
        break;
      }

      case 'pdf_vision': {
        // Image-based / scanned PDF — attempt vision extraction via OpenAI input_file
        pipelineUsed = 'pdf_pipeline';
        const r = await runPdfVisionPipeline(apiKey, model, cleanBase64, fileName, selectedDocType, reasoningEffort);
        parsed = r.parsed;
        aiError = r.aiError;
        break;
      }

      case 'text': {
        pipelineUsed = 'text_pipeline';
        const r = await runTextPipeline(apiKey, model, route.text, selectedDocType, reasoningEffort);
        parsed = r.parsed;
        aiError = r.aiError;
        break;
      }

      case 'unsupported':
      case 'unknown':
      default: {
        console.log(`[extract-document] unsupported_format: route="${route.type}" mime="${detectedMime}"`);
        return respond(buildEnvelope(selectedDocType, {
          reason_code: 'unsupported_format', pipeline_used: 'none',
          input_mime: inputMime, detected_mime: detectedMime,
        }));
      }
    }

    // ------------------------------------------------------------------
    // 6. Handle AI errors
    // ------------------------------------------------------------------
    if (aiError) {
      console.error(`[extract-document] ai_error: ${aiError}`);
      return respond(buildEnvelope(selectedDocType, {
        reason_code: 'ai_error', pipeline_used: pipelineUsed,
        input_mime: inputMime, detected_mime: detectedMime,
      }));
    }

    if (!parsed) {
      console.log('[extract-document] parse_error: could not parse AI response as JSON');
      return respond(buildEnvelope(selectedDocType, {
        reason_code: 'parse_error', pipeline_used: pipelineUsed,
        input_mime: inputMime, detected_mime: detectedMime,
      }));
    }

    // ------------------------------------------------------------------
    // 7. Optional doc-specific enrichment pass for auto-detected uploads
    // ------------------------------------------------------------------
    let finalParsed = parsed;
    let sanitizedFields = sanitizeExtractedFields(finalParsed.extracted_fields);
    let effectiveDocType = getEffectiveDocType(selectedDocType, finalParsed.detected_type, sanitizedFields);

    if (selectedDocType === 'unknown' && finalParsed.is_readable && effectiveDocType !== 'unknown') {
      console.log(
        `[extract-document] rerunning extraction with detected doc type "${effectiveDocType}" for doc-specific hints`
      );

      let enriched: { parsed: ParsedAIResult | null; aiError: string | null } | null = null;

      switch (route.type) {
        case 'image':
          enriched = await runImagePipeline(
            apiKey,
            model,
            detectedMime,
            cleanBase64,
            effectiveDocType,
            reasoningEffort
          );
          break;
        case 'pdf_text':
        case 'pdf_vision':
          enriched = await runPdfVisionPipeline(
            apiKey,
            model,
            cleanBase64,
            fileName,
            effectiveDocType,
            reasoningEffort
          );
          break;
        case 'text':
          enriched = await runTextPipeline(
            apiKey,
            model,
            route.text,
            effectiveDocType,
            reasoningEffort
          );
          break;
        default:
          enriched = null;
      }

      if (!enriched?.aiError && enriched?.parsed?.is_readable) {
        const enrichedFields = sanitizeExtractedFields(enriched.parsed.extracted_fields);
        if (Object.keys(enrichedFields).length > 0) {
          finalParsed = {
            detected_type: effectiveDocType,
            is_readable: true,
            extracted_fields: {
              ...sanitizedFields,
              ...enrichedFields,
            },
          };
          sanitizedFields = sanitizeExtractedFields(finalParsed.extracted_fields);
          effectiveDocType = getEffectiveDocType(selectedDocType, finalParsed.detected_type, sanitizedFields);
        }
      }
    }

    // ------------------------------------------------------------------
    // 8. Build final envelope
    // ------------------------------------------------------------------
    const policyFields = filterFieldsByDocPolicy(sanitizedFields, effectiveDocType);
    const fieldCount = Object.keys(policyFields).length;
    console.log(
      `[extract-document] ok is_readable=${finalParsed.is_readable} ` +
      `fields=${fieldCount} pipeline=${pipelineUsed} detected_type="${finalParsed.detected_type}" effective_doc_type="${effectiveDocType}"`
    );

    return respond({
      detected_type: toSafeDetectedType(finalParsed.detected_type),
      is_readable: finalParsed.is_readable,
      extracted_fields: policyFields,
      reason_code: 'ok',
      pipeline_used: pipelineUsed,
      input_mime: inputMime,
      detected_mime: detectedMime,
    });

  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    console.error('[extract-document] unhandled error:', details);
    return respond(buildEnvelope(selectedDocType, {
      reason_code: 'ai_error', pipeline_used: 'none',
      input_mime: inputMime, detected_mime: detectedMime,
    }));
  }
});
