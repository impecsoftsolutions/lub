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

interface ExtractedFieldOption {
  value: string;
  label?: string;
  source?: string;
}

interface ExtractionEnvelope {
  detected_type: DetectedDocType;
  is_readable: boolean;
  extracted_fields: Record<string, string>;
  /**
   * Optional per-field candidate options for user-driven selection.
   * Currently used for GST `company_name` (Trade vs Legal).
   * Backward-compatible: omitted when no options are produced.
   */
  field_options?: Record<string, ExtractedFieldOption[]>;
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
  /**
   * Optional candidate options. Today only deterministic extractors populate this;
   * AI never produces it directly so it stays undefined on the AI path.
   */
  field_options?: Record<string, ExtractedFieldOption[]>;
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
    // GST registrations carry an identifiable person name (Proprietor / Karta /
    // Managing Director / etc. in Annexure B). Allow `full_name` so it can be
    // surfaced as a fallback identity source when no Aadhaar is uploaded.
    // Aadhaar still wins via the client-side FIELD_SOURCE_PRIORITY map.
    'full_name',
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
  gender_sex: 'gender',
  sex_gender: 'gender',
  gender_m_f: 'gender',
  m_f: 'gender',
  'm/f': 'gender',
  mf: 'gender',
  male_female: 'gender',
  gender_code: 'gender',
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
  if (lower === 'm' || lower === 'male' || lower === 'पुरुष') return 'male';
  if (lower === 'f' || lower === 'female' || lower === 'महिला' || lower === 'स्त्री') return 'female';
  // Tolerate short OCR/AI variants that embed the word (e.g. "sex: male", "gender - female")
  if (/\bfemale\b/.test(lower) || /\bमहिला\b/.test(lower) || /\bस्त्री\b/.test(lower)) return 'female';
  if (/\bmale\b/.test(lower) || /\bपुरुष\b/.test(lower)) return 'male';
  return lower;
}

/**
 * Normalize a free-text field value into the canonical shape the /join
 * registration form expects. Reduces friction when the user clicks
 * `Verify`. Operations:
 *   - Trim outer whitespace.
 *   - Collapse runs of internal whitespace to a single space.
 *   - Strip obvious leading/trailing punctuation noise (commas, periods,
 *     colons, semicolons, hyphens, slashes, pipes).
 *   - Collapse runs of repeated commas/spaces inside addresses into a
 *     single ", " sequence.
 * Does NOT change casing — entity suffixes such as `HUF`, `LLP`,
 * `PVT LTD`, `PRIVATE LIMITED` are preserved as-is. Display formatting
 * for dates is preserved separately by `normalizeDateField`.
 */
function normalizeFreeText(value: string): string {
  if (!value) return value;
  let out = value.replace(/\s+/g, ' ').trim();
  out = out.replace(/^[\s,.;:\-/|]+|[\s,.;:\-/|]+$/g, '').trim();
  out = out.replace(/(?:,\s*){2,}/g, ', ');
  return out;
}

/** Free-text fields that should pass through `normalizeFreeText`. Excludes
 * fields that already have stricter normalization (dates, gender, GST/PAN/PIN). */
const FREE_TEXT_FIELD_KEYS = new Set<string>([
  'full_name',
  'company_name',
  'company_address',
  'state',
  'district',
  'city',
  'industry',
  'activity_type',
  'products_services',
  'transaction_id',
  'bank_reference',
]);

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
    } else if (FREE_TEXT_FIELD_KEYS.has(key)) {
      strVal = normalizeFreeText(strVal);
    }

    if (strVal) result[key] = strVal;
  }
  return result;
}

/**
 * Post-sanitisation policy guard for full_name.
 *
 * Problem this guards against (CLAUDE-SMART-UPLOAD-FULLNAME-MAPPING-031):
 *   On GST certificates for entities (PRIVATE LIMITED, LLP, etc.) the AI
 *   sometimes copies the company's Legal/Trade Name into `full_name`,
 *   which corrupts the registration form's person-name field. The
 *   deterministic GST extractor already drops the "fallback to legal
 *   name" branch, but AI output can still leak the entity name when
 *   there is no Annexure B Karta/Proprietor row.
 *
 * Rule:
 *   - On GST docs, drop `full_name` if it matches `company_name` after
 *     case-insensitive whitespace collapse. The user can pick on the
 *     form, or rely on Aadhaar (which has identity precedence).
 *   - On non-GST docs, no change.
 *   - Person-name evidence (e.g. Aadhaar's full_name) is unaffected
 *     because Aadhaar's policy never returns company_name.
 */
function applyFullNameVsCompanyNameGuard(
  fields: Record<string, string>,
  effectiveDocType: DetectedDocType,
): Record<string, string> {
  if (effectiveDocType !== 'gst_certificate') return fields;
  const fullName = (fields.full_name ?? '').trim();
  const companyName = (fields.company_name ?? '').trim();
  if (!fullName || !companyName) return fields;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  if (norm(fullName) === norm(companyName)) {
    const next = { ...fields };
    delete next.full_name;
    return next;
  }
  return fields;
}

const INDIAN_STATE_CANONICAL: Record<string, string> = {
  'andhra pradesh': 'Andhra Pradesh',
  'arunachal pradesh': 'Arunachal Pradesh',
  assam: 'Assam',
  bihar: 'Bihar',
  chhattisgarh: 'Chhattisgarh',
  goa: 'Goa',
  gujarat: 'Gujarat',
  haryana: 'Haryana',
  'himachal pradesh': 'Himachal Pradesh',
  'jharkhand': 'Jharkhand',
  karnataka: 'Karnataka',
  kerala: 'Kerala',
  'madhya pradesh': 'Madhya Pradesh',
  maharashtra: 'Maharashtra',
  manipur: 'Manipur',
  meghalaya: 'Meghalaya',
  mizoram: 'Mizoram',
  nagaland: 'Nagaland',
  odisha: 'Odisha',
  punjab: 'Punjab',
  rajasthan: 'Rajasthan',
  sikkim: 'Sikkim',
  'tamil nadu': 'Tamil Nadu',
  telangana: 'Telangana',
  tripura: 'Tripura',
  'uttar pradesh': 'Uttar Pradesh',
  uttarakhand: 'Uttarakhand',
  'west bengal': 'West Bengal',
  'andaman and nicobar islands': 'Andaman and Nicobar Islands',
  chandigarh: 'Chandigarh',
  'dadra and nagar haveli and daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  delhi: 'Delhi',
  'nct of delhi': 'Delhi',
  lakshadweep: 'Lakshadweep',
  puducherry: 'Puducherry',
  'jammu and kashmir': 'Jammu and Kashmir',
  ladakh: 'Ladakh',
};

function normalizeStateToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferGstLocationFromAddress(fields: Record<string, string>): Record<string, string> {
  const address = (fields.company_address ?? '').trim();
  if (!address) return fields;

  const next = { ...fields };

  if (!next.pin_code) {
    const pinMatches = [...address.matchAll(/\b(\d{6})\b/g)];
    const lastPin = pinMatches.length > 0 ? pinMatches[pinMatches.length - 1]?.[1] : '';
    if (lastPin) next.pin_code = lastPin;
  }

  const rawParts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (rawParts.length === 0) return next;

  // Remove a trailing PIN segment so state/city/district inference stays stable.
  const parts = [...rawParts];
  if (parts.length > 0 && /^\d{6}$/.test(parts[parts.length - 1])) {
    parts.pop();
  }
  if (parts.length === 0) return next;

  let stateIndex = -1;
  let stateValue = '';
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const token = normalizeStateToken(parts[i]);
    const canonical = INDIAN_STATE_CANONICAL[token];
    if (canonical) {
      stateIndex = i;
      stateValue = canonical;
      break;
    }
  }

  if (!next.state && stateValue) {
    next.state = stateValue;
  }

  const districtCandidate = stateIndex > 0 ? parts[stateIndex - 1] : '';
  const cityCandidate = stateIndex > 1 ? parts[stateIndex - 2] : '';

  if (!next.district && districtCandidate) {
    next.district = districtCandidate;
  }

  if (!next.city) {
    if (cityCandidate) {
      next.city = cityCandidate;
    } else if (districtCandidate) {
      // Common GST addresses may only expose one locality token before state.
      next.city = districtCandidate;
    }
  }

  return next;
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
// Deterministic text-PDF extraction (GST certificates today)
//
// Goal: when a text-readable government PDF (e.g. GST REG-06) is uploaded but
// the AI parse path fails or returns is_readable=false, we still surface
// directly-parsed labelled fields so the user is not blocked with an
// "Unreadable" status. For GST PDFs, deterministic fields also win over AI
// because they are pulled straight from the certificate text, while AI still
// adds value for fields that are harder to label-anchor.
// ---------------------------------------------------------------------------

const GSTIN_RE = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9])\b/;

function captureBetween(text: string, labelRe: RegExp, stopRes: RegExp[]): string {
  const m = text.match(labelRe);
  if (!m || m.index === undefined) return '';
  const startIdx = m.index + m[0].length;
  let endIdx = text.length;
  for (const stop of stopRes) {
    const cloned = new RegExp(stop.source, stop.flags.includes('g') ? stop.flags : `${stop.flags}g`);
    cloned.lastIndex = startIdx;
    const sm = cloned.exec(text);
    if (sm && sm.index !== undefined && sm.index >= startIdx && sm.index < endIdx) {
      endIdx = sm.index;
    }
  }
  return text.slice(startIdx, endIdx).replace(/\s+/g, ' ').trim();
}

/**
 * Trim leading punctuation and trailing numbered-list markers that bleed in
 * when a sibling form field starts on the same line (e.g. "DOKI SANKARA RAO HUF 2.").
 */
function trimGstFieldValue(value: string): string {
  return value
    .replace(/^[:\s-]+/, '')
    .replace(/\s+\d+\.\s*$/, '')
    .replace(/\s+\d+\.\s+[A-Z][\s\S]*$/, '')
    .trim();
}

function extractGstLegalName(text: string): string {
  const bounded = captureBetween(
    text,
    /(?:^|\b)(?:1\.\s*)?Legal\s+Name\b\s*/i,
    [
      /\bTrade\s+Name\b/i,
      /\bAdditional\s+trade\s+names\b/i,
      /\bConstitution\s+of\s+Business\b/i,
      /\bAddress\s+of\s+Principal\s+Place\b/i,
    ]
  );
  if (bounded) return trimGstFieldValue(bounded);

  const inline = text.match(
    /\b(?:\d+\.\s*)?Legal\s+Name\s*[-:]?\s*([\s\S]{1,220}?)(?=\s+(?:Trade\s+Name|Additional\s+trade\s+names|Constitution\s+of\s+Business|Address\s+of\s+Principal\s+Place)\b|$)/i
  );
  return inline ? trimGstFieldValue(inline[1]) : '';
}

function extractGstTradeName(text: string): string {
  const bounded = captureBetween(
    text,
    /\bTrade\s+Name(?:\s*,?\s*if\s+any)?\b\s*/i,
    [
      /\bAdditional\s+trade\s+names\b/i,
      /\bConstitution\s+of\s+Business\b/i,
      /\bAddress\s+of\s+Principal\s+Place\b/i,
      /\bDate\s+of\s+Liability\b/i,
    ]
  );
  if (bounded) return trimGstFieldValue(bounded);

  const inline = text.match(
    /\bTrade\s+Name(?:\s*,?\s*if\s+any)?\s*[-:]?\s*([\s\S]{1,220}?)(?=\s+(?:Additional\s+trade\s+names|Constitution\s+of\s+Business|Address\s+of\s+Principal\s+Place|Date\s+of\s+Liability)\b|$)/i
  );
  return inline ? trimGstFieldValue(inline[1]) : '';
}

function trimUdyamFieldValue(value: string): string {
  return value
    .replace(/^[:\s-]+/, '')
    .replace(/\s+\*+\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildDeterministicUdyamExtraction(rawText: string): ParsedAIResult | null {
  if (!rawText) return null;
  const text = rawText.replace(/\r\n?/g, '\n');
  const flat = text.replace(/\s+/g, ' ').trim();

  const looksUdyam =
    /\bUDYAM\b/i.test(flat) &&
    (/\bREGISTRATION\s+CERTIFICATE\b/i.test(flat) || /\bUDYAM-[A-Z]{2}-\d{2}-\d{7}\b/i.test(flat));
  if (!looksUdyam) return null;

  const fields: Record<string, string> = {};

  const companyName = captureBetween(
    text,
    /\bNAME\s+OF\s+ENTERPRISE\b\s*[:-]?\s*/i,
    [
      /\bTYPE\s+OF\s+ENTERPRISE\b/i,
      /\bMAJOR\s+ACTIVITY\b/i,
      /\bSOCIAL\s+CATEGORY\b/i,
      /\bNAME\s+OF\s+UNIT/i,
      /\bOFFI(?:C|CI|CIAL)?AL?\s+ADDRESS\s+OF\s+ENTERPRISE\b/i,
    ]
  );
  if (companyName && companyName.length <= 220) {
    const cleaned = trimUdyamFieldValue(companyName);
    if (cleaned) fields.company_name = cleaned;
  }

  const activityType = captureBetween(
    text,
    /\bMAJOR\s+ACTIVITY\b\s*[:-]?\s*/i,
    [
      /\bSOCIAL\s+CATEGORY\b/i,
      /\bNAME\s+OF\s+UNIT/i,
      /\bOFFI(?:C|CI|CIAL)?AL?\s+ADDRESS\s+OF\s+ENTERPRISE\b/i,
    ]
  );
  if (activityType && activityType.length <= 140) {
    const cleaned = trimUdyamFieldValue(activityType);
    if (cleaned) fields.activity_type = cleaned;
  }

  const addressBlockMatch = text.match(
    /\bOFFI(?:C|CI|CIAL)?AL?\s+ADDRESS\s+OF\s+ENTERPRISE\b([\s\S]*?)(?=\bDATE\s+OF\s+INCORPORATION\b|\bDATE\s+OF\s+UDYAM\s+REGISTRATION\b|\bNATIONAL\s+INDUSTRY\b|$)/i
  );
  if (addressBlockMatch) {
    const block = addressBlockMatch[1];

    const cityMatch = block.match(/\bCity\b\s*[:-]?\s*([^\n,]+?)(?=\s+\bState\b|\s+\bDistrict\b|\s+\bPin\b|$)/i);
    if (cityMatch) {
      const cleaned = trimUdyamFieldValue(cityMatch[1]);
      if (cleaned && cleaned.length <= 120) fields.city = cleaned;
    }

    const districtMatch = block.match(/\bDistrict\b\s*[:-]?\s*([^\n,]+?)(?=\s*,?\s*\bPin\b|$)/i);
    if (districtMatch) {
      const cleaned = trimUdyamFieldValue(districtMatch[1]);
      if (cleaned && cleaned.length <= 120) fields.district = cleaned;
    }

    const stateMatch = block.match(/\bState\b\s*[:-]?\s*([^\n,]+?)(?=\s+\bDistrict\b|\s*,?\s*\bPin\b|$)/i);
    if (stateMatch) {
      const cleaned = trimUdyamFieldValue(stateMatch[1]);
      if (cleaned && cleaned.length <= 120) fields.state = cleaned;
    }

    const pinMatch = block.match(/\bPin\b\s*[:-]?\s*(\d{6})\b/i);
    if (pinMatch) {
      fields.pin_code = pinMatch[1];
    }

    const normalizedAddress = block
      .replace(/\bFlat\/Door\/Block\s+No\.?\b/gi, ' ')
      .replace(/\bName\s+of\s+Premises\/?\s*Building\b/gi, ' ')
      .replace(/\bVillage\/Town\b/gi, ' ')
      .replace(/\bRoad\/Street\/Lane\b/gi, ' ')
      .replace(/\bCity\b/gi, ' ')
      .replace(/\bState\b/gi, ' ')
      .replace(/\bDistrict\b/gi, ' ')
      .replace(/\bPin\b/gi, ' ')
      .replace(/\bMobile\b[\s\S]*$/i, ' ')
      .replace(/\bEmail\b[\s\S]*$/i, ' ')
      .replace(/\s*:\s*/g, ', ')
      .replace(/\s+/g, ' ')
      .replace(/(?:,\s*){2,}/g, ', ')
      .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
      .trim();

    if (normalizedAddress.length > 0 && normalizedAddress.length <= 450) {
      fields.company_address = normalizedAddress;
    }
  }

  const nicIndustryMatch =
    flat.match(/\b(\d{2}\s*-\s*[A-Za-z][A-Za-z\s&/()-]{3,140}?)(?=\s+\d{4}\s*-\s*|\s+\d{5}\s*-\s*|\s+\b(?:Services|Manufacturing|Trading)\b|$)/i)
    ?? flat.match(/\bNATIONAL\s+INDUSTRY[\s\S]*?\b(\d{2}\s*-\s*[A-Za-z][A-Za-z\s&/()-]{3,140})\b/i);
  if (nicIndustryMatch) {
    const cleaned = trimUdyamFieldValue(nicIndustryMatch[1]);
    if (cleaned && cleaned.length <= 120) {
      fields.industry = cleaned;
    }
  }

  if (Object.keys(fields).length === 0) return null;

  return {
    detected_type: 'udyam_certificate',
    is_readable: true,
    extracted_fields: fields as Record<string, unknown>,
  };
}

function buildDeterministicGstExtraction(rawText: string): ParsedAIResult | null {
  if (!rawText) return null;
  const text = rawText.replace(/\r\n?/g, '\n');

  // Quick gate: must look like a GST certificate
  const looksGst =
    /Form\s+GST\s+REG[\s-]?06/i.test(text) ||
    (/Goods\s+and\s+Services\s+Tax/i.test(text) && /Registration\s+Certificate/i.test(text)) ||
    GSTIN_RE.test(text);
  if (!looksGst) return null;

  const gstinMatch = text.match(GSTIN_RE);
  if (!gstinMatch) return null;

  const fields: Record<string, string> = {
    gst_number: gstinMatch[1],
  };
  const fieldOptions: Record<string, ExtractedFieldOption[]> = {};

  // Legal Name vs Trade Name. Prefer Trade Name when present.
  const cleanedLegal = extractGstLegalName(text);
  const cleanedTrade = extractGstTradeName(text);
  if (cleanedTrade && cleanedTrade.length > 0 && cleanedTrade.length <= 200) {
    fields.company_name = cleanedTrade;
  } else if (cleanedLegal && cleanedLegal.length > 0 && cleanedLegal.length <= 200) {
    fields.company_name = cleanedLegal;
  }

  // Surface Trade Name + Legal Name as user-selectable candidates for company_name.
  // Deduped case-insensitively after trim/whitespace collapse.
  const companyOptions: ExtractedFieldOption[] = [];
  const seenCompanyValues = new Set<string>();
  const pushCompanyOption = (value: string, label: string) => {
    if (!value) return;
    if (value.length > 200) return;
    const normalized = value.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!normalized || seenCompanyValues.has(normalized)) return;
    seenCompanyValues.add(normalized);
    companyOptions.push({ value, label, source: 'gst_certificate' });
  };
  if (cleanedTrade) pushCompanyOption(cleanedTrade, 'Trade Name');
  if (cleanedLegal) pushCompanyOption(cleanedLegal, 'Legal Name');
  if (companyOptions.length > 0) {
    fieldOptions.company_name = companyOptions;
  }

  // GST `full_name`: ONLY accept person-level evidence from the Annexure B
  // Karta / Proprietor / Managing Director row. Do NOT fall back to Legal
  // Name or Trade Name — those are entity names and silently injecting them
  // into `full_name` corrupts the registration form's person-name field on
  // company-form GST certificates (e.g. "M/S SRK INFRA PROJECTS PRIVATE
  // LIMITED"). If no person-level row is present, leave full_name unset
  // and let the user fill it on the form (or rely on Aadhaar precedence).
  let kartaName = '';
  const kartaSectionMatch = text.match(/Details\s+of\s+(?:Proprietor|Karta|Managing\s+Director)[\s\S]*$/i);
  if (kartaSectionMatch) {
    const kartaSection = kartaSectionMatch[0];
    const numberedMatch = kartaSection.match(/(?:^|\s)\d+\s+Name\s+([\s\S]+?)\s+Designation(?:\/Status)?\b/i);
    if (numberedMatch) {
      kartaName = trimGstFieldValue(numberedMatch[1]);
    }
  }
  if (kartaName && kartaName.length > 0 && kartaName.length <= 200) {
    fields.full_name = kartaName;
  }

  // City / Town / Village
  const city = captureBetween(
    text,
    /\bCity\s*\/\s*Town\s*\/\s*Village\b\s*[:-]?\s*/i,
    [/\bDistrict\b/i, /\bState\b/i, /\bPIN\s*Code\b/i, /\bDate\s+of\s+Liability\b/i]
  );
  if (city && city.length <= 120) {
    const cleaned = trimGstFieldValue(city);
    if (cleaned) fields.city = cleaned;
  }

  // District
  const district = captureBetween(
    text,
    /\bDistrict\b\s*[:-]?\s*/i,
    [/\bState\b/i, /\bPIN\s*Code\b/i, /\bDate\s+of\s+Liability\b/i]
  );
  if (district && district.length <= 120) {
    const cleaned = trimGstFieldValue(district);
    if (cleaned) fields.district = cleaned;
  }

  // State (avoid matching "State of registration" headers — anchor on standalone label)
  const state = captureBetween(
    text,
    /\bState\b\s*[:-]?\s*/i,
    [/\bPIN\s*Code\b/i, /\bDate\s+of\s+Liability\b/i, /\bPeriod\s+of\s+Validity\b/i]
  );
  if (state && state.length <= 120) {
    const cleaned = trimGstFieldValue(state);
    if (cleaned) fields.state = cleaned;
  }

  // PIN Code
  const pinMatch = text.match(/\bPIN\s*Code\b\s*[:-]?\s*(\d{6})\b/i);
  if (pinMatch) fields.pin_code = pinMatch[1];

  // Address: pull the whole "Address of Principal Place of Business" block and condense
  const addrBlock = text.match(
    /\bAddress\s+of\s+Principal\s+Place\s+of\s+Business\b([\s\S]*?)(?=\bDate\s+of\s+Liability\b|\bPeriod\s+of\s+Validity\b|\bType\s+of\s+Registration\b|$)/i
  );
  if (addrBlock) {
    let addr = addrBlock[1]
      // Strip the inline labels that prefix each address subfield
      .replace(/\bBuilding\s+No\.?\s*\/?\s*Flat\s+No\.?\b/gi, ' ')
      .replace(/\bName\s+of\s+Premises\s*\/?\s*Building\b/gi, ' ')
      .replace(/\bRoad\s*\/?\s*Street\b/gi, ' ')
      .replace(/\bCity\s*\/\s*Town\s*\/\s*Village\b/gi, ' ')
      .replace(/\bDistrict\b/gi, ' ')
      .replace(/\bState\b/gi, ' ')
      .replace(/\bPIN\s*Code\b/gi, ' ')
      .replace(/\bLatitude\b/gi, ' ')
      .replace(/\bLongitude\b/gi, ' ');
    // Convert leftover ":" subfield separators into commas, drop stray periods
    addr = addr
      .replace(/\s*:\s*/g, ', ')
      .replace(/(?:^|\s)\.(?=\s|,|$)/g, ' ')
      // Drop the trailing next-item number e.g. " 6."
      .replace(/\s+\d+\.\s*$/, '')
      .replace(/\s+/g, ' ')
      .replace(/^[\s,;:-]+|[\s,;:-]+$/g, '')
      // Collapse repeated comma/spaces
      .replace(/(?:,\s*){2,}/g, ', ')
      .trim();
    if (addr.length > 0 && addr.length < 400) {
      fields.company_address = addr;
    }
  }

  if (Object.keys(fields).length <= 1) {
    // Only have GSTIN — still useful but don't claim a richer result
    // Returning is fine; the merge layer/policy filter will pass GSTIN through.
  }

  return {
    detected_type: 'gst_certificate',
    is_readable: true,
    extracted_fields: fields as Record<string, unknown>,
    field_options: Object.keys(fieldOptions).length > 0 ? fieldOptions : undefined,
  };
}

function buildDeterministicTextExtraction(text: string, selectedDocType: string): ParsedAIResult | null {
  if (!text) return null;
  const udyam = buildDeterministicUdyamExtraction(text);
  if (udyam) return udyam;
  // GST is the first deterministic doc supported. Do not gate on selectedDocType
  // because pass 1 typically receives 'unknown' — we let the GSTIN anchor decide.
  const gst = buildDeterministicGstExtraction(text);
  if (gst) return gst;
  // Future: deterministic UDYAM / PAN parsers can be added here.
  void selectedDocType;
  return null;
}

function mergeFieldOptions(
  ...sources: Array<Record<string, ExtractedFieldOption[]> | undefined>
): Record<string, ExtractedFieldOption[]> | undefined {
  const merged: Record<string, ExtractedFieldOption[]> = {};
  for (const source of sources) {
    if (!source) continue;
    for (const [key, options] of Object.entries(source)) {
      if (!Array.isArray(options) || options.length === 0) continue;
      const target = merged[key] ?? [];
      const seen = new Set(target.map((opt) => opt.value.trim().replace(/\s+/g, ' ').toLowerCase()));
      for (const opt of options) {
        if (!opt || typeof opt.value !== 'string') continue;
        const value = opt.value.trim();
        if (!value) continue;
        const normalized = value.replace(/\s+/g, ' ').toLowerCase();
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        target.push({
          value,
          ...(typeof opt.label === 'string' && opt.label ? { label: opt.label } : {}),
          ...(typeof opt.source === 'string' && opt.source ? { source: opt.source } : {}),
        });
      }
      if (target.length > 0) merged[key] = target;
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeParsedWithDeterministic(
  parsed: ParsedAIResult | null,
  deterministic: ParsedAIResult | null
): ParsedAIResult | null {
  if (!deterministic) return parsed;
  if (!parsed || !parsed.is_readable) return deterministic;
  // Deterministic fields win for the labels they extract.
  return {
    detected_type: deterministic.detected_type || parsed.detected_type,
    is_readable: true,
    extracted_fields: {
      ...parsed.extracted_fields,
      ...deterministic.extracted_fields,
    },
    field_options: mergeFieldOptions(parsed.field_options, deterministic.field_options),
  };
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
      return 'PRIORITY for this doc type: gst_number (15-char GSTIN), company_name, company_address, state, district, city, pin_code, industry. ' +
        'STRICT FULL_NAME RULE: full_name on a GST certificate must be a NATURAL PERSON name taken ONLY from the Annexure B "Details of Proprietor / Karta / Managing Director / Authorized Signatory" section (the numbered "Name <PERSON NAME> Designation/Status <role>" row). ' +
        'Do NOT use Legal Name, Trade Name, Additional Trade Names, or any entity-form text (anything containing PRIVATE LIMITED, PVT LTD, LLP, LIMITED, COMPANY, ENTERPRISES, INFRA, INDUSTRIES, M/S, &, AND CO, AND CO., HUF as the whole value) as full_name. ' +
        'If no person-level Annexure B row is visible, OMIT full_name entirely. Never copy the entity/company name into full_name as a fallback.';
    case 'udyam_certificate':
      return 'PRIORITY for this doc type: company_name, company_address, state, district, city, pin_code, industry, activity_type (look for the label "MAJOR ACTIVITY" on the certificate and map its value to activity_type), products_services.';
    case 'pan_card':
      return 'PRIORITY for this doc type: pan_company (10-char PAN).';
    case 'aadhaar_card':
      return 'PRIORITY for this doc type: full_name, date_of_birth (DOB, usually DD/MM/YYYY), and gender. GENDER EXTRACTION IS REQUIRED: on Indian Aadhaar cards, the sex/gender almost always appears as a standalone English word "Male" or "Female" (sometimes alongside a Hindi word "पुरुष"/"महिला"/"स्त्री") near the DOB or name. You MUST scan the entire card — front and back — for that standalone word and return it as gender. Do not omit gender unless the card image is so degraded that neither English nor Hindi word is legible anywhere.';
    default:
      return 'Extract all registration-relevant fields visible on this document. If the document appears to be an Indian Aadhaar card or identity document, always try to extract gender (Male/Female) even when shown as a standalone word without a "Gender:" label.';
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
- For Aadhaar cards, gender is ALWAYS present. Look for a standalone English word "Male" or "Female" (possibly near Hindi "पुरुष" / "महिला" / "स्त्री") anywhere on the card, even without a "Gender:" label, and return it as gender. Never omit gender from an Aadhaar card unless the entire card is unreadable.
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
        const deterministic = buildDeterministicTextExtraction(route.text, selectedDocType);
        if (deterministic) {
          const detFieldCount = Object.keys(deterministic.extracted_fields ?? {}).length;
          console.log(
            `[extract-document] deterministic_text_extraction detected_type="${deterministic.detected_type}" fields=${detFieldCount}`
          );
        }

        const r = await runPdfPipeline(apiKey, model, route.text, selectedDocType, reasoningEffort);
        parsed = r.parsed;
        aiError = r.aiError;

        // Capture AI text-path outcome BEFORE we reassign `parsed` to the
        // deterministic fallback below. This is what drives the gap-fill
        // pdf_vision retry (COD-SMART-UPLOAD-GST-FIELD-REGRESSION-033).
        const aiTextPathFailed =
          !!aiError || !r.parsed || r.parsed.is_readable !== true;

        // Merge deterministic into a readable AI result (deterministic wins for its labels).
        if (deterministic && parsed && parsed.is_readable) {
          parsed = mergeParsedWithDeterministic(parsed, deterministic);
        }

        // If AI didn't produce a readable result but deterministic did, use deterministic
        // and clear any AI error so we return ok rather than failing the whole envelope.
        if (deterministic && (!parsed || parsed.is_readable !== true)) {
          if (aiError) {
            console.log(
              `[extract-document] AI parse failed ("${aiError}") — using deterministic_text_extraction fallback`
            );
            aiError = null;
          } else {
            console.log('[extract-document] AI returned no readable result — using deterministic_text_extraction fallback');
          }
          parsed = deterministic;
        }

        // pdf_vision gap-fill retry (COD-SMART-UPLOAD-GST-FIELD-REGRESSION-033 +
        // CLAUDE-SMART-UPLOAD-UDYAM-PDF-030):
        //
        // The pdfjs / legacy text extractor can return degraded glyph
        // fragments on hybrid government PDFs (GST REG-06, Udyam, etc.)
        // that look like text to the parser but read as garbage to the
        // AI, producing parse_error / ai_error / is_readable=false.
        //
        // Pre-fix gate retried pdf_vision ONLY when there was no
        // deterministic fallback. That meant readable GST PDFs whose
        // deterministic extractor anchored gst_number / company_name /
        // company_address but failed to anchor pin_code / city /
        // district / state would arrive at the client with only those
        // 3 server fields — the regression the user reported.
        //
        // New gate:
        //   1) retry whenever AI text path failed, AND
        //   2) for GST docs, also retry when key location fields are missing
        //      even if AI text path reported readable (some PDFs return
        //      semantically thin but "readable" JSON with only 2-3 fields).
        //
        // Vision result is then merged with deterministic so deterministic-
        // anchored fields keep their canonical values while vision fills gaps.
        const parsedSanitized = parsed ? sanitizeExtractedFields(parsed.extracted_fields) : {};
        const parsedDocType = parsed
          ? getEffectiveDocType(selectedDocType, parsed.detected_type, parsedSanitized)
          : toSafeDetectedType(selectedDocType);
        const gstLocationFieldsMissing =
          parsedDocType === 'gst_certificate' &&
          ['pin_code', 'city', 'district', 'state'].some((k) => !(parsedSanitized[k] ?? '').trim());

        if (aiTextPathFailed || gstLocationFieldsMissing) {
          const retryReason = aiTextPathFailed
            ? 'AI text parse failed'
            : 'GST location fields missing from text-path extraction';
          console.log(
            `[extract-document] ${retryReason} (deterministic=${
              deterministic ? 'present' : 'absent'
            }) — retrying with pdf_vision to fill missing fields`
          );
          const retry = await runPdfVisionPipeline(
            apiKey,
            model,
            cleanBase64,
            fileName,
            selectedDocType,
            reasoningEffort
          );
          if (!retry.aiError && retry.parsed && retry.parsed.is_readable) {
            if (deterministic && deterministic.is_readable) {
              parsed = mergeParsedWithDeterministic(retry.parsed, deterministic);
            } else {
              parsed = retry.parsed;
            }
            aiError = null;
            pipelineUsed = 'pdf_pipeline';
          } else if (!parsed && retry.aiError) {
            // Only surface the retry error when we still have nothing.
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

      // Accept enriched fields from pass 2 even when that pass flagged is_readable=false.
      // Pass 1 already confirmed the image is readable for this document, so any extra
      // fields pass 2 produces under the doc-type hint are safe to merge additively.
      if (!enriched?.aiError && enriched?.parsed) {
        const enrichedFields = sanitizeExtractedFields(enriched.parsed.extracted_fields);
        if (Object.keys(enrichedFields).length > 0) {
          // Preserve field_options from the parsed result (deterministic-merge output)
          // since AI enrichment never produces them and re-creating finalParsed would otherwise drop them.
          const preservedOptions = mergeFieldOptions(finalParsed.field_options, enriched.parsed.field_options);
          finalParsed = {
            detected_type: effectiveDocType,
            is_readable: true,
            extracted_fields: {
              ...sanitizedFields,
              ...enrichedFields,
            },
            field_options: preservedOptions,
          };
          sanitizedFields = sanitizeExtractedFields(finalParsed.extracted_fields);
          effectiveDocType = getEffectiveDocType(selectedDocType, finalParsed.detected_type, sanitizedFields);
        }
      }
    }

    // ------------------------------------------------------------------
    // 8. Build final envelope
    // ------------------------------------------------------------------
    const guardedFields = applyFullNameVsCompanyNameGuard(sanitizedFields, effectiveDocType);
    const gstBackfilledFields =
      effectiveDocType === 'gst_certificate'
        ? inferGstLocationFromAddress(guardedFields)
        : guardedFields;
    const policyFields = filterFieldsByDocPolicy(gstBackfilledFields, effectiveDocType);
    const fieldCount = Object.keys(policyFields).length;
    console.log(
      `[extract-document] ok is_readable=${finalParsed.is_readable} ` +
      `fields=${fieldCount} pipeline=${pipelineUsed} detected_type="${finalParsed.detected_type}" effective_doc_type="${effectiveDocType}"`
    );

    // Filter field_options by the same doc-type policy that gates extracted_fields,
    // so we don't surface candidate options for fields the policy strips.
    let policyFieldOptions: Record<string, ExtractedFieldOption[]> | undefined;
    if (finalParsed.field_options) {
      const allowed = DOC_TYPE_FIELD_POLICY[effectiveDocType];
      const filtered: Record<string, ExtractedFieldOption[]> = {};
      for (const [key, opts] of Object.entries(finalParsed.field_options)) {
        if (!allowed?.has(key)) continue;
        if (!Array.isArray(opts) || opts.length === 0) continue;
        filtered[key] = opts;
      }
      if (Object.keys(filtered).length > 0) {
        policyFieldOptions = filtered;
      }
    }

    return respond({
      detected_type: toSafeDetectedType(finalParsed.detected_type),
      is_readable: finalParsed.is_readable,
      extracted_fields: policyFields,
      ...(policyFieldOptions ? { field_options: policyFieldOptions } : {}),
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
