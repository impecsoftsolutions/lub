import { supabase } from './supabase';

export type SmartDocType =
  | 'payment_proof'
  | 'gst_certificate'
  | 'udyam_certificate'
  | 'pan_card'
  | 'aadhaar_card';

export type DetectedDocType = SmartDocType | 'unknown';

export type ReasonCode =
  | 'ok'
  | 'empty_input'
  | 'unsupported_format'
  | 'ai_error'
  | 'parse_error'
  | 'low_confidence';

export type PipelineUsed =
  | 'image_vision'
  | 'pdf_pipeline'
  | 'text_pipeline'
  | 'office_pipeline'
  | 'none';

export interface ExtractedFieldOption {
  value: string;
  label?: string;
  source?: string;
}

export interface ExtractionResult {
  detected_type: DetectedDocType;
  is_readable: boolean;
  extracted_fields: Record<string, string>;
  /**
   * Optional candidate options keyed by field name (e.g. `company_name`).
   * Today produced for GST `company_name` (Trade vs Legal); may be empty/undefined.
   */
  field_options?: Record<string, ExtractedFieldOption[]>;
  /** Why the extraction succeeded or failed */
  reason_code: ReasonCode;
  /** Which internal pipeline processed the file */
  pipeline_used: PipelineUsed;
  /** MIME type reported by the browser */
  input_mime: string;
  /** MIME type detected from file magic bytes */
  detected_mime: string;
}

const SAFE_DETECTED_TYPES = new Set<string>([
  'payment_proof',
  'gst_certificate',
  'udyam_certificate',
  'pan_card',
  'aadhaar_card',
  'unknown',
]);

const SAFE_REASON_CODES = new Set<string>([
  'ok', 'empty_input', 'unsupported_format', 'ai_error', 'parse_error', 'low_confidence',
]);

const SAFE_PIPELINE_USED = new Set<string>([
  'image_vision', 'pdf_pipeline', 'text_pipeline', 'office_pipeline', 'none',
]);

function buildFailureResult(reasonCode: ReasonCode = 'ai_error'): ExtractionResult {
  return {
    detected_type: 'unknown',
    is_readable: false,
    extracted_fields: {},
    reason_code: reasonCode,
    pipeline_used: 'none',
    input_mime: '',
    detected_mime: '',
  };
}

/**
 * Defensive parser for the optional `field_options` envelope field.
 * Drops malformed entries (non-string values, blank values) and ensures
 * the returned shape is `Record<string, ExtractedFieldOption[]>` or undefined.
 */
function parseFieldOptions(raw: unknown): Record<string, ExtractedFieldOption[]> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: Record<string, ExtractedFieldOption[]> = {};
  for (const [key, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const cleaned: ExtractedFieldOption[] = [];
    for (const entry of list) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const e = entry as Record<string, unknown>;
      const value = typeof e.value === 'string' ? e.value.trim() : '';
      if (!value) continue;
      const opt: ExtractedFieldOption = { value };
      if (typeof e.label === 'string' && e.label.trim()) opt.label = e.label.trim();
      if (typeof e.source === 'string' && e.source.trim()) opt.source = e.source.trim();
      cleaned.push(opt);
    }
    if (cleaned.length > 0) result[key] = cleaned;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx < 0) {
        reject(new Error('Failed to parse data URL'));
        return;
      }
      resolve({
        base64: dataUrl.slice(commaIdx + 1),
        mimeType: file.type || 'application/octet-stream',
      });
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function extractDocument(
  file: File,
  selectedDocType: SmartDocType | 'unknown' = 'unknown'
): Promise<ExtractionResult> {
  try {
    const { base64, mimeType } = await readFileAsBase64(file);

    const { data, error } = await supabase.functions.invoke('extract-document', {
      body: {
        file_base64: base64,
        file_mime_type: mimeType,
        file_name: file.name,
        selected_doc_type: selectedDocType,
      },
    });

    if (error) {
      console.error('[documentExtraction] Edge function error:', error);
      return buildFailureResult('ai_error');
    }

    if (!data || typeof data !== 'object') {
      return buildFailureResult('parse_error');
    }

    const raw = data as Record<string, unknown>;

    const detectedType =
      typeof raw.detected_type === 'string' && SAFE_DETECTED_TYPES.has(raw.detected_type)
        ? (raw.detected_type as DetectedDocType)
        : 'unknown';

    const extractedFields =
      raw.extracted_fields &&
      typeof raw.extracted_fields === 'object' &&
      !Array.isArray(raw.extracted_fields)
        ? (raw.extracted_fields as Record<string, string>)
        : {};

    const reasonCode =
      typeof raw.reason_code === 'string' && SAFE_REASON_CODES.has(raw.reason_code)
        ? (raw.reason_code as ReasonCode)
        : 'ai_error';

    const pipelineUsed =
      typeof raw.pipeline_used === 'string' && SAFE_PIPELINE_USED.has(raw.pipeline_used)
        ? (raw.pipeline_used as PipelineUsed)
        : 'none';

    const fieldOptions = parseFieldOptions(raw.field_options);

    return {
      detected_type: detectedType,
      is_readable: Boolean(raw.is_readable),
      extracted_fields: extractedFields,
      ...(fieldOptions ? { field_options: fieldOptions } : {}),
      reason_code: reasonCode,
      pipeline_used: pipelineUsed,
      input_mime: typeof raw.input_mime === 'string' ? raw.input_mime : '',
      detected_mime: typeof raw.detected_mime === 'string' ? raw.detected_mime : '',
    };
  } catch (err) {
    console.error('[documentExtraction] Unexpected error:', err);
    return buildFailureResult('ai_error');
  }
}
