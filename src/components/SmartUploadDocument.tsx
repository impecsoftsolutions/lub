import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload,
  Camera,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  X as XIcon,
  Zap,
} from 'lucide-react';
import { extractDocument, SmartDocType, DetectedDocType, ReasonCode, PipelineUsed, ExtractedFieldOption } from '../lib/documentExtraction';
import { formatDateValue } from '../lib/dateTimeManager';

const DATE_FIELD_KEYS = new Set(['payment_date', 'date_of_birth']);

/**
 * Display-format a Smart Upload extracted field value.
 * Date fields render via the configured portal date format; all other fields render raw.
 * Internal/canonical values are NOT mutated — this is presentation-only.
 */
function formatExtractedFieldValueForDisplay(fieldKey: string, value: string): string {
  if (!value) return value;
  if (DATE_FIELD_KEYS.has(fieldKey)) {
    return formatDateValue(value) || value;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DocStatus = 'queued' | 'processing' | 'extracted' | 'unreadable' | 'failed' | 'mapped';

interface SmartUploadItem {
  id: string;
  file: File;
  /** Type detected by AI (null until extraction runs) */
  detectedDocType: DetectedDocType | null;
  status: DocStatus;
  extractedFields: Record<string, string>;
  fieldOptions: Record<string, ExtractedFieldOption[]> | null;
  reasonCode: ReasonCode | null;
  pipelineUsed: PipelineUsed | null;
  detectedMime: string | null;
}

interface ConflictField {
  fieldKey: string;
  label: string;
  extractedValue: string;
  currentValue: string;
  sourceDocType: DetectedDocType;
}

export interface SmartUploadDocumentProps {
  /** Current form field values — used to detect conflicts at extraction time */
  formFieldValues: Record<string, string>;
  /** Called immediately with fields that can be autofilled (no current value) */
  onAutofill: (fields: Record<string, string>) => void;
  /** Called after conflict modal confirm — with the fields the user chose to overwrite */
  onConflictResolved: (chosenFields: Record<string, string>) => void;
  /** Called when a document file should be routed to a specific upload slot */
  onFileReady: (slot: 'paymentProof' | 'gstCertificate' | 'udyamCertificate', file: File) => void;
  /** Optional hook to surface raw extracted fields for review, even if nothing needed autofill */
  onExtractedFieldsDetected?: (fields: Record<string, string>) => void;
  /** Optional hook to surface candidate field_options (e.g. company_name Trade vs Legal) */
  onExtractedFieldOptionsDetected?: (options: Record<string, ExtractedFieldOption[]>) => void;
  /** Fields where document extraction should override an existing current value without conflict UI */
  forceDocumentPrecedenceFields?: string[];
  /** Optional hook to canonicalize extracted values before comparison/autofill */
  normalizeExtractedFields?: (fields: Record<string, string>) => Record<string, string>;
  /** Optional extra controls rendered in the action row */
  extraControls?: React.ReactNode;
  /**
   * Optional guided selected document type hint.
   * When provided, the extractor receives this value instead of "unknown".
   */
  selectedDocType?: SmartDocType | 'unknown';
  /**
   * Optional callback for guided flows to react to extraction status changes.
   */
  onDocumentProcessed?: (event: {
    status: 'extracted' | 'unreadable' | 'failed';
    detectedDocType: DetectedDocType;
    extractedFields: Record<string, string>;
    reasonCode: ReasonCode | null;
    file: File;
  }) => void;
  /** Guided flows can suppress conflict UI and apply extracted values directly. */
  disableConflictModal?: boolean;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOC_TYPE_LABELS: Record<SmartDocType, string> = {
  payment_proof: 'Payment Proof',
  gst_certificate: 'GST Certificate',
  udyam_certificate: 'UDYAM Certificate',
  pan_card: 'PAN Card (Company)',
  aadhaar_card: 'Aadhaar Card',
};

/** Human-readable labels for extracted field keys shown in conflict modal */
const FIELD_LABELS: Record<string, string> = {
  full_name: 'Full Name',
  date_of_birth: 'Date of Birth',
  gender: 'Gender',
  payment_date: 'Payment Date',
  transaction_id: 'Transaction ID',
  bank_reference: 'Bank Reference',
  gst_number: 'GST Number',
  gst_registered: 'GST Registered',
  pan_company: 'PAN (Company)',
  company_name: 'Company Name',
  company_address: 'Company / Residential Address',
  pin_code: 'PIN Code',
  state: 'State',
  district: 'District',
  city: 'City / Town',
  industry: 'Industry',
  activity_type: 'Activity Type',
  products_services: 'Products & Services',
};

/**
 * Source priority for each field — ordered from highest to lowest priority.
 * Only listed doc types are allowed to fill the given field.
 */
const FIELD_SOURCE_PRIORITY: Record<string, SmartDocType[]> = {
  // Aadhaar wins for full_name; GST is allowed as a lower-priority fallback so
  // the registration form can be prefilled when no Aadhaar is uploaded.
  full_name: ['aadhaar_card', 'gst_certificate'],
  date_of_birth: ['aadhaar_card'],
  gender: ['aadhaar_card'],
  payment_date: ['payment_proof'],
  transaction_id: ['payment_proof'],
  bank_reference: ['payment_proof'],
  amount_paid: ['payment_proof'],
  gst_number: ['gst_certificate'],
  gst_registered: ['gst_certificate'],
  pan_company: ['pan_card', 'gst_certificate'],
  company_name: ['gst_certificate', 'udyam_certificate'],
  company_address: ['gst_certificate', 'udyam_certificate'],
  pin_code: ['gst_certificate', 'udyam_certificate'],
  state: ['gst_certificate', 'udyam_certificate'],
  district: ['gst_certificate', 'udyam_certificate'],
  city: ['gst_certificate', 'udyam_certificate'],
  industry: ['udyam_certificate', 'gst_certificate'],
  activity_type: ['udyam_certificate'],
  products_services: ['udyam_certificate'],
};

/**
 * Extracted field keys eligible for autofill.
 * amount_paid is intentionally excluded — it is auto-calculated from state + gender in Join.
 */
const AUTOFILL_FIELDS = new Set(Object.keys(FIELD_LABELS));

/** Doc types where the file must NOT be routed to any upload slot */
const EXTRACT_ONLY_TYPES = new Set<SmartDocType>(['pan_card', 'aadhaar_card']);

/** Human-readable messages for each reason code shown when is_readable=false */
const REASON_CODE_MESSAGES: Partial<Record<ReasonCode, string>> = {
  empty_input: 'No readable file content was found.',
  unsupported_format:
    'This file format cannot be auto-read. Please upload a PDF, clear photo, or image instead, or enter details manually.',
  ai_error: 'Could not read this file right now. Please retry.',
  parse_error: 'Could not parse this document. Please retry or enter details manually.',
  low_confidence: 'We could not confidently read this document. Please enter details manually.',
};

const FILE_SLOT_MAP: Partial<Record<SmartDocType, 'paymentProof' | 'gstCertificate' | 'udyamCertificate'>> = {
  payment_proof: 'paymentProof',
  gst_certificate: 'gstCertificate',
  udyam_certificate: 'udyamCertificate',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return `sud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildExtractionSummary(fields: Record<string, string>): string {
  const parts: string[] = [];
  if (fields.payment_date) parts.push(`Date: ${formatExtractedFieldValueForDisplay('payment_date', fields.payment_date)}`);
  if (fields.transaction_id) parts.push(`Txn: ${fields.transaction_id.slice(0, 12)}…`);
  if (fields.gst_number) parts.push(`GST: ${fields.gst_number}`);
  if (fields.pan_company) parts.push(`PAN: ${fields.pan_company}`);
  if (fields.full_name) parts.push(`Name: ${fields.full_name}`);
  if (fields.company_name) parts.push(`Co: ${fields.company_name}`);
  if (fields.activity_type) parts.push(`Activity: ${fields.activity_type}`);
  if (fields.products_services) parts.push(`Products: ${fields.products_services}`);
  if (parts.length === 0 && Object.keys(fields).length > 0) {
    parts.push(`${Object.keys(fields).length} field(s) extracted`);
  }
  return parts.slice(0, 3).join(' · ');
}

function truncateFilename(name: string, maxLen = 28): string {
  if (name.length <= maxLen) return name;
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  return name.slice(0, maxLen - ext.length - 1) + '…' + ext;
}

const CASE_INSENSITIVE_CONFLICT_FIELDS = new Set([
  'state',
  'district',
  'city',
  'gender',
  'gst_registered',
  'payment_mode',
]);

function normalizeComparisonValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function areEquivalentValues(fieldKey: string, currentValue: string, extractedValue: string): boolean {
  const normalizedCurrentValue = normalizeComparisonValue(currentValue);
  const normalizedExtractedValue = normalizeComparisonValue(extractedValue);

  if (CASE_INSENSITIVE_CONFLICT_FIELDS.has(fieldKey)) {
    return normalizedCurrentValue.toLowerCase() === normalizedExtractedValue.toLowerCase();
  }

  return normalizedCurrentValue === normalizedExtractedValue;
}

function getFieldPriority(fieldKey: string, docType: DetectedDocType): number {
  if (docType === 'unknown') return Number.POSITIVE_INFINITY;
  const policy = FIELD_SOURCE_PRIORITY[fieldKey];
  if (!policy) return Number.POSITIVE_INFINITY;
  const index = policy.indexOf(docType as SmartDocType);
  return index >= 0 ? index : Number.POSITIVE_INFINITY;
}

function isDocAllowedForField(fieldKey: string, docType: DetectedDocType): boolean {
  return Number.isFinite(getFieldPriority(fieldKey, docType));
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: DocStatus }) {
  switch (status) {
    case 'queued':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          Queued
        </span>
      );
    case 'processing':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
          <Loader2 className="h-3 w-3 animate-spin" />
          Processing
        </span>
      );
    case 'extracted':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          <CheckCircle className="h-3 w-3" />
          Extracted
        </span>
      );
    case 'unreadable':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
          <AlertCircle className="h-3 w-3" />
          Unreadable
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
          <AlertCircle className="h-3 w-3" />
          Failed
        </span>
      );
    case 'mapped':
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-300">
          <CheckCircle className="h-3 w-3" />
          Applied
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Conflict modal
// ---------------------------------------------------------------------------

interface ConflictModalProps {
  conflicts: ConflictField[];
  choices: Record<string, 'extracted' | 'keep'>;
  onChoiceChange: (fieldKey: string, choice: 'extracted' | 'keep') => void;
  onConfirm: () => void;
  onDismiss: () => void;
}

function ConflictModal({ conflicts, choices, onChoiceChange, onConfirm, onDismiss }: ConflictModalProps) {
  const extractedCount = Object.values(choices).filter(c => c === 'extracted').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-card shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">Resolve Field Conflicts</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {conflicts.length} field{conflicts.length !== 1 ? 's' : ''} already have values. Choose which to keep.
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Close"
          >
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Conflict list */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {conflicts.map(conflict => (
            <div key={conflict.fieldKey} className="rounded-lg border border-border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{conflict.label}</p>
              <div className="grid grid-cols-2 gap-2">
                {/* Extracted value option */}
                <button
                  type="button"
                  onClick={() => onChoiceChange(conflict.fieldKey, 'extracted')}
                  className={`rounded-lg border-2 p-2 text-left text-xs transition-colors ${
                    choices[conflict.fieldKey] === 'extracted'
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  <p className="font-medium mb-0.5 text-[10px] uppercase tracking-wide text-primary/70">
                    From document
                  </p>
                  <p className="break-all leading-snug">
                    {formatExtractedFieldValueForDisplay(conflict.fieldKey, conflict.extractedValue)}
                  </p>
                </button>
                {/* Keep current option */}
                <button
                  type="button"
                  onClick={() => onChoiceChange(conflict.fieldKey, 'keep')}
                  className={`rounded-lg border-2 p-2 text-left text-xs transition-colors ${
                    choices[conflict.fieldKey] === 'keep'
                      ? 'border-border bg-muted text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:border-border'
                  }`}
                >
                  <p className="font-medium mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Keep current
                  </p>
                  <p className="break-all leading-snug">
                    {formatExtractedFieldValueForDisplay(conflict.fieldKey, conflict.currentValue)}
                  </p>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4 flex-shrink-0">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            Keep all current
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {extractedCount > 0
              ? `Apply ${extractedCount} extracted value${extractedCount !== 1 ? 's' : ''}`
              : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const SmartUploadDocument: React.FC<SmartUploadDocumentProps> = ({
  formFieldValues,
  onAutofill,
  onConflictResolved,
  onFileReady,
  onExtractedFieldsDetected,
  onExtractedFieldOptionsDetected,
  forceDocumentPrecedenceFields = [],
  normalizeExtractedFields,
  extraControls,
  selectedDocType = 'unknown',
  onDocumentProcessed,
  disableConflictModal = false,
  disabled = false,
}) => {
  const [items, setItems] = useState<SmartUploadItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [conflictModal, setConflictModal] = useState<{
    show: boolean;
    conflicts: ConflictField[];
    choices: Record<string, 'extracted' | 'keep'>;
  }>({ show: false, conflicts: [], choices: {} });
  const [fieldSourceMap, setFieldSourceMap] = useState<Record<string, DetectedDocType>>({});

  const formFieldValuesRef = useRef(formFieldValues);
  useEffect(() => {
    formFieldValuesRef.current = formFieldValues;
  }, [formFieldValues]);

  const fieldSourceMapRef = useRef(fieldSourceMap);
  useEffect(() => {
    fieldSourceMapRef.current = fieldSourceMap;
  }, [fieldSourceMap]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------------------------------------
  // Core extraction logic
  // -------------------------------------------------------------------------

  const processExtraction = useCallback(
    async (itemId: string, file: File) => {
      setItems(prev =>
        prev.map(item => (item.id === itemId ? { ...item, status: 'processing' } : item))
      );

      try {
        // Guided flows can provide a selected document type hint.
        const result = await extractDocument(file, selectedDocType);

        if (!result.is_readable) {
          setItems(prev =>
            prev.map(item =>
              item.id === itemId
                ? {
                    ...item,
                    status: 'unreadable',
                    detectedDocType: result.detected_type,
                    reasonCode: result.reason_code,
                    pipelineUsed: result.pipeline_used,
                    detectedMime: result.detected_mime,
                  }
                : item
            )
          );
          if (onDocumentProcessed) {
            onDocumentProcessed({
              status: 'unreadable',
              detectedDocType: result.detected_type,
              extractedFields: {},
              reasonCode: result.reason_code,
              file,
            });
          }
          return;
        }

        const detectedType = result.detected_type;
        const normalizedExtractedFields = normalizeExtractedFields
          ? normalizeExtractedFields(result.extracted_fields)
          : result.extracted_fields;
        const finalType: SmartDocType | null =
          detectedType !== 'unknown' ? (detectedType as SmartDocType) : null;

        if (onExtractedFieldsDetected) {
          onExtractedFieldsDetected(normalizedExtractedFields);
        }
        if (onDocumentProcessed) {
          onDocumentProcessed({
            status: 'extracted',
            detectedDocType: detectedType,
            extractedFields: normalizedExtractedFields,
            reasonCode: result.reason_code,
            file,
          });
        }

        const resultFieldOptions = result.field_options ?? null;
        if (onExtractedFieldOptionsDetected && resultFieldOptions) {
          onExtractedFieldOptionsDetected(resultFieldOptions);
        }

        setItems(prev =>
          prev.map(item =>
            item.id === itemId
              ? {
                  ...item,
                  status: 'extracted',
                  detectedDocType: detectedType,
                  extractedFields: normalizedExtractedFields,
                  fieldOptions: resultFieldOptions,
                  reasonCode: result.reason_code,
                  pipelineUsed: result.pipeline_used,
                  detectedMime: result.detected_mime,
                }
              : item
          )
        );

        // Route file to the appropriate upload slot (extract-only types are skipped)
        if (finalType) {
          const slot = FILE_SLOT_MAP[finalType];
          if (slot && !EXTRACT_ONLY_TYPES.has(finalType)) {
            onFileReady(slot, file);
          }
        }

        // Separate into autofillable fields and conflicts
        const currentValues = formFieldValuesRef.current;
        const toAutofill: Record<string, string> = {};
        const sourceUpdatesForAutofill: Record<string, DetectedDocType> = {};
        const conflicts: ConflictField[] = [];
        const currentSourceMap = fieldSourceMapRef.current;
        const forcedDocumentFields = new Set(forceDocumentPrecedenceFields);

        for (const [key, extractedVal] of Object.entries(normalizedExtractedFields)) {
          if (!AUTOFILL_FIELDS.has(key)) continue;
          if (!extractedVal.trim()) continue;

          // If finalType is unknown, skip — backend already returned no fields for unknown docs
          if (!finalType || !isDocAllowedForField(key, finalType)) continue;

          const currentVal = (currentValues[key] ?? '').trim();
          const incomingPriority = getFieldPriority(key, finalType);
          const currentSource = currentSourceMap[key];
          const currentSourcePriority = currentSource
            ? getFieldPriority(key, currentSource)
            : Number.POSITIVE_INFINITY;

          // Never let a lower-priority smart-upload source override a higher-priority one.
          if (currentSource && incomingPriority > currentSourcePriority) {
            continue;
          }

          if (!currentVal) {
            toAutofill[key] = extractedVal;
            sourceUpdatesForAutofill[key] = finalType;
          } else if (forcedDocumentFields.has(key)) {
            toAutofill[key] = extractedVal;
            sourceUpdatesForAutofill[key] = finalType;
          } else if (!areEquivalentValues(key, currentVal, extractedVal)) {
            conflicts.push({
              fieldKey: key,
              label: FIELD_LABELS[key] ?? key,
              extractedValue: extractedVal,
              currentValue: currentVal,
              sourceDocType: finalType,
            });
          }
        }

        // Autofill empty fields immediately
        if (Object.keys(toAutofill).length > 0) {
          onAutofill(toAutofill);
          setFieldSourceMap(prev => ({ ...prev, ...sourceUpdatesForAutofill }));
        }

        if (conflicts.length > 0) {
          if (disableConflictModal) {
            const extractedConflictValues: Record<string, string> = {};
            const sourceUpdatesForConflicts: Record<string, DetectedDocType> = {};
            for (const conflict of conflicts) {
              extractedConflictValues[conflict.fieldKey] = conflict.extractedValue;
              sourceUpdatesForConflicts[conflict.fieldKey] = conflict.sourceDocType;
            }
            onAutofill(extractedConflictValues);
            setFieldSourceMap(prev => ({ ...prev, ...sourceUpdatesForConflicts }));
            setItems(prev =>
              prev.map(item => (item.id === itemId ? { ...item, status: 'mapped' } : item))
            );
            return;
          }

          const defaultChoices: Record<string, 'extracted' | 'keep'> = {};
          conflicts.forEach(c => {
            defaultChoices[c.fieldKey] = 'extracted';
          });
          setConflictModal(prev => ({
            show: true,
            conflicts: [...prev.conflicts, ...conflicts],
            choices: { ...prev.choices, ...defaultChoices },
          }));
        } else {
          setItems(prev =>
            prev.map(item => (item.id === itemId ? { ...item, status: 'mapped' } : item))
          );
        }
      } catch (err) {
        console.error('[SmartUploadDocument] Extraction error:', err);
        setItems(prev =>
          prev.map(item => (item.id === itemId ? { ...item, status: 'failed' } : item))
        );
        if (onDocumentProcessed) {
          onDocumentProcessed({
            status: 'failed',
            detectedDocType: 'unknown',
            extractedFields: {},
            reasonCode: 'ai_error',
            file,
          });
        }
      }
    },
    [
      forceDocumentPrecedenceFields,
      normalizeExtractedFields,
      onAutofill,
      disableConflictModal,
      onDocumentProcessed,
      onExtractedFieldOptionsDetected,
      onExtractedFieldsDetected,
      onFileReady,
      selectedDocType,
    ]
  );

  // -------------------------------------------------------------------------
  // File selection handlers
  // -------------------------------------------------------------------------

  const handleFileSelected = useCallback((file: File) => {
    const id = generateId();
    setItems(prev => [
      ...prev,
      {
        id,
        file,
        detectedDocType: null,
        status: 'queued',
        extractedFields: {},
        fieldOptions: null,
        reasonCode: null,
        pipelineUsed: null,
        detectedMime: null,
      },
    ]);
    // No auto-processing — user must click Import Data
  }, []);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
    e.target.value = '';
  };

  const handleUploadClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };

  const handleCameraClick = () => {
    if (disabled) return;
    cameraInputRef.current?.click();
  };

  // -------------------------------------------------------------------------
  // Import Data — processes all queued items
  // -------------------------------------------------------------------------

  const handleImportData = useCallback(async () => {
    const queuedItems = items.filter(i => i.status === 'queued');
    if (queuedItems.length === 0 || isProcessing) return;
    setIsProcessing(true);
    try {
      for (const item of queuedItems) {
        await processExtraction(item.id, item.file);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [items, isProcessing, processExtraction]);

  // -------------------------------------------------------------------------
  // Item actions
  // -------------------------------------------------------------------------

  const handleRetry = (item: SmartUploadItem) => {
    void processExtraction(item.id, item.file);
  };

  const handleRemoveItem = (itemId: string) => {
    setItems(prev => prev.filter(i => i.id !== itemId));
  };

  // -------------------------------------------------------------------------
  // Conflict modal actions
  // -------------------------------------------------------------------------

  const handleConflictChoiceChange = (fieldKey: string, choice: 'extracted' | 'keep') => {
    setConflictModal(prev => ({
      ...prev,
      choices: { ...prev.choices, [fieldKey]: choice },
    }));
  };

  const handleConflictConfirm = () => {
    const fieldsToApply: Record<string, string> = {};
    const sourceUpdates: Record<string, DetectedDocType> = {};
    conflictModal.conflicts.forEach(c => {
      if (conflictModal.choices[c.fieldKey] === 'extracted') {
        fieldsToApply[c.fieldKey] = c.extractedValue;
        // Only track source when type is definitively known
        if (c.sourceDocType !== 'unknown') {
          sourceUpdates[c.fieldKey] = c.sourceDocType;
        }
      }
    });
    if (Object.keys(fieldsToApply).length > 0) {
      onConflictResolved(fieldsToApply);
      setFieldSourceMap(prev => ({ ...prev, ...sourceUpdates }));
    }
    setConflictModal({ show: false, conflicts: [], choices: {} });
    setItems(prev =>
      prev.map(item => (item.status === 'extracted' ? { ...item, status: 'mapped' } : item))
    );
  };

  const handleConflictDismiss = () => {
    setConflictModal({ show: false, conflicts: [], choices: {} });
    setItems(prev =>
      prev.map(item => (item.status === 'extracted' ? { ...item, status: 'mapped' } : item))
    );
  };

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const queuedCount = items.filter(i => i.status === 'queued').length;
  const importDisabled = disabled || isProcessing || queuedCount === 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      <div className="rounded-lg border border-dashed border-primary/40 bg-primary/3 p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              {selectedDocType !== 'unknown'
                ? `Upload ${DOC_TYPE_LABELS[selectedDocType]}`
                : 'Smart Upload'}
            </p>
            <p className="text-xs text-muted-foreground">
              {selectedDocType !== 'unknown'
                ? "We'll auto-fill matching fields after extraction."
                : 'Upload one or more documents, then tap Import to auto-fill matching fields.'}
            </p>
          </div>
        </div>

        {/* Action row — upload controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload className="h-4 w-4" />
            Upload File
          </button>

          <button
            type="button"
            onClick={handleCameraClick}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Camera className="h-4 w-4" />
            Take Picture
          </button>

          {extraControls}
        </div>

        {/* Document list */}
        {items.length > 0 && (
          <div className="space-y-2">
            {items.map(item => {
              const summary = buildExtractionSummary(item.extractedFields);
              const canRetry =
                (item.status === 'failed' || item.status === 'unreadable') &&
                item.reasonCode !== 'unsupported_format' &&
                item.reasonCode !== 'empty_input';
              const detectedLabel =
                item.detectedDocType && item.detectedDocType !== 'unknown'
                  ? (DOC_TYPE_LABELS[item.detectedDocType as SmartDocType] ?? item.detectedDocType)
                  : null;
              const isExtractOnly =
                item.detectedDocType &&
                item.detectedDocType !== 'unknown' &&
                EXTRACT_ONLY_TYPES.has(item.detectedDocType as SmartDocType);
              const unreadableMessage =
                item.status === 'unreadable' && item.reasonCode
                  ? (REASON_CODE_MESSAGES[item.reasonCode] ?? "We couldn't read this document. Retry, or enter the details on the form.")
                  : null;

              return (
                <div
                  key={item.id}
                  className="rounded-lg border border-border bg-card px-3 py-2.5 space-y-1.5"
                >
                  {/* Row 1: filename + status + retry + remove */}
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-xs text-foreground font-medium truncate min-w-0">
                      {truncateFilename(item.file.name)}
                    </span>
                    <StatusBadge status={item.status} />
                    {canRetry && (
                      <button
                        type="button"
                        onClick={() => handleRetry(item)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Retry extraction"
                        title="Retry"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Remove"
                      title="Remove"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Row 2: detected type */}
                  {detectedLabel && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">
                        Detected:{' '}
                        <span className="text-foreground">{detectedLabel}</span>
                      </span>
                      {isExtractOnly && (
                        <span className="text-muted-foreground italic">
                          Used for auto-fill only — file is not attached to your registration.
                        </span>
                      )}
                    </div>
                  )}

                  {/* Row 3: Extraction summary */}
                  {summary && (
                    <p className="text-xs text-muted-foreground truncate">{summary}</p>
                  )}

                  {/* Unreadable hint — reason-code-aware message */}
                  {unreadableMessage && (
                    <p className="text-xs text-muted-foreground">{unreadableMessage}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Action row — import trigger (below the document list per UX direction) */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => { void handleImportData(); }}
            disabled={importDisabled}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting…
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                {selectedDocType !== 'unknown'
                  ? 'Extract details'
                  : `Extract details from ${queuedCount} document${queuedCount === 1 ? '' : 's'}`}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.bmp,.tif,.tiff,.txt,.csv,.doc,.docx,.xls,.xlsx"
        onChange={handleFileInputChange}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileInputChange}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Conflict modal */}
      {conflictModal.show && (
        <ConflictModal
          conflicts={conflictModal.conflicts}
          choices={conflictModal.choices}
          onChoiceChange={handleConflictChoiceChange}
          onConfirm={handleConflictConfirm}
          onDismiss={handleConflictDismiss}
        />
      )}
    </>
  );
};

export default SmartUploadDocument;
