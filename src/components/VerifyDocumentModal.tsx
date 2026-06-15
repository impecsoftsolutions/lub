import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileCheck2, Loader2, ShieldCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { extractDocument, type SmartDocType, type ExtractionResult } from '@/lib/documentExtraction';
import { cn } from '@/lib/utils';

type MatchStatus = 'exact' | 'partial' | 'mismatch' | 'not_found';
type OverallStatus = 'verified' | 'partial' | 'manual_review' | 'not_available';

interface RegistrationForVerification {
  id: string;
  full_name: string;
  company_name: string;
  gst_number?: string | null;
  pan_company?: string | null;
  pin_code?: string | null;
  payment_date?: string | null;
  transaction_id?: string | null;
  bank_reference?: string | null;
  gst_certificate_url?: string | null;
  udyam_certificate_url?: string | null;
  payment_proof_url?: string | null;
}

interface VerifyDocumentModalProps {
  registration: RegistrationForVerification | null;
  isOpen: boolean;
  onClose: () => void;
}

interface DocumentConfig {
  key: 'gst_certificate' | 'udyam_certificate' | 'payment_proof';
  label: string;
  url?: string | null;
  docType: SmartDocType;
}

interface ExtractedDocument {
  key: DocumentConfig['key'];
  label: string;
  result: ExtractionResult;
}

interface VerificationRow {
  field: string;
  registeredValue: string;
  extractedValue: string;
  status: MatchStatus;
  sensitive?: boolean;
}

const COMPANY_SUFFIX_TOKENS = new Set([
  'pvt',
  'private',
  'ltd',
  'limited',
  'llp',
  'opc',
  'inc',
  'company',
  'co',
  'ms',
  'm',
  's',
]);

const clean = (value?: string | null) => (value ?? '').trim();

const normalizeIdentifier = (value?: string | null) =>
  clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

const normalizeDate = (value?: string | null) => clean(value).slice(0, 10);

const normalizeText = (value?: string | null) =>
  clean(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenize = (value?: string | null, ignoreCompanySuffixes = false) => {
  const tokens = normalizeText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1);

  return ignoreCompanySuffixes
    ? tokens.filter((token) => !COMPANY_SUFFIX_TOKENS.has(token))
    : tokens;
};

const tokenMatch = (registered: string, extracted: string, ignoreCompanySuffixes = false): MatchStatus => {
  const registeredTokens = tokenize(registered, ignoreCompanySuffixes);
  const extractedTokens = tokenize(extracted, ignoreCompanySuffixes);

  if (!registeredTokens.length || !extractedTokens.length) return 'not_found';

  const registeredSet = new Set(registeredTokens);
  const extractedSet = new Set(extractedTokens);
  const matches = registeredTokens.filter((token) => extractedSet.has(token)).length;
  const reverseMatches = extractedTokens.filter((token) => registeredSet.has(token)).length;
  const coverage = matches / registeredTokens.length;
  const reverseCoverage = reverseMatches / extractedTokens.length;

  if (coverage === 1 && reverseCoverage === 1) return 'exact';
  if (coverage >= 0.6 || reverseCoverage >= 0.6 || matches >= 2) return 'partial';
  return 'mismatch';
};

const exactMatch = (registered: string, extracted: string, normalizer: (value: string) => string): MatchStatus => {
  if (!clean(extracted)) return 'not_found';
  if (!clean(registered)) return 'not_found';
  return normalizer(registered) === normalizer(extracted) ? 'exact' : 'mismatch';
};

const maskSensitive = (value: string) => {
  const normalized = clean(value);
  if (!normalized) return '';
  const compact = normalized.replace(/\s+/g, '');
  if (compact.length <= 4) return compact;
  return `•••• ${compact.slice(-4)}`;
};

const getStatusLabel = (status: MatchStatus) => {
  switch (status) {
    case 'exact':
      return 'Exact match';
    case 'partial':
      return 'Partial match';
    case 'mismatch':
      return 'Mismatch';
    case 'not_found':
      return 'Not found in document';
  }
};

const getStatusVariant = (status: MatchStatus): 'success' | 'warning' | 'destructive' | 'secondary' => {
  switch (status) {
    case 'exact':
      return 'success';
    case 'partial':
      return 'warning';
    case 'mismatch':
      return 'destructive';
    case 'not_found':
      return 'secondary';
  }
};

const getOverallLabel = (status: OverallStatus) => {
  switch (status) {
    case 'verified':
      return 'Verified';
    case 'partial':
      return 'Partially Verified';
    case 'manual_review':
      return 'Needs Manual Review';
    case 'not_available':
      return 'Document Not Available';
  }
};

const getOverallVariant = (status: OverallStatus): 'success' | 'warning' | 'destructive' | 'secondary' => {
  switch (status) {
    case 'verified':
      return 'success';
    case 'partial':
      return 'warning';
    case 'manual_review':
      return 'destructive';
    case 'not_available':
      return 'secondary';
  }
};

const filenameForDocument = (label: string, url: string) => {
  try {
    const parsed = new URL(url);
    const pathPart = parsed.pathname.split('/').filter(Boolean).pop();
    if (pathPart) return decodeURIComponent(pathPart);
  } catch {
    // Fall through to a safe generated name.
  }
  return `${label.toLowerCase().replace(/\s+/g, '-')}.pdf`;
};

const fileFromUrl = async (url: string, label: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not fetch ${label}`);
  }

  const blob = await response.blob();
  const contentType = response.headers.get('content-type') || blob.type || 'application/octet-stream';
  return new File([blob], filenameForDocument(label, url), { type: contentType });
};

const pickField = (documents: ExtractedDocument[], field: string, allowedDocs?: DocumentConfig['key'][]) => {
  for (const doc of documents) {
    if (allowedDocs && !allowedDocs.includes(doc.key)) continue;
    const value = clean(doc.result.extracted_fields[field]);
    if (value) return value;
  }
  return '';
};

const pickCompanyName = (documents: ExtractedDocument[]) => {
  for (const doc of documents) {
    const options = doc.result.field_options?.company_name ?? [];
    if (options.length > 0) {
      const option = options.find((entry) => clean(entry.value)) ?? options[0];
      if (option?.value) return option.value;
    }
    const value = clean(doc.result.extracted_fields.company_name);
    if (value) return value;
  }
  return '';
};

const buildRows = (registration: RegistrationForVerification, documents: ExtractedDocument[]): VerificationRow[] => {
  const extractedGst = pickField(documents, 'gst_number', ['gst_certificate']);
  const extractedPanFromGst = normalizeIdentifier(extractedGst).length >= 12
    ? normalizeIdentifier(extractedGst).slice(2, 12)
    : '';
  const extractedPan = extractedPanFromGst || pickField(documents, 'pan_company', ['gst_certificate', 'udyam_certificate']);
  const extractedCompanyName = pickCompanyName(documents);
  const extractedPersonName = pickField(documents, 'full_name', ['gst_certificate', 'udyam_certificate']);
  const extractedPinCode = pickField(documents, 'pin_code', ['gst_certificate', 'udyam_certificate']);
  const extractedPaymentDate = pickField(documents, 'payment_date', ['payment_proof']);
  const extractedTransactionId = pickField(documents, 'transaction_id', ['payment_proof']);
  const extractedBankReference = pickField(documents, 'bank_reference', ['payment_proof']);

  return [
    {
      field: 'GST Number',
      registeredValue: clean(registration.gst_number),
      extractedValue: extractedGst,
      status: exactMatch(clean(registration.gst_number), extractedGst, normalizeIdentifier),
      sensitive: true,
    },
    {
      field: 'PAN Number',
      registeredValue: clean(registration.pan_company),
      extractedValue: extractedPan,
      status: exactMatch(clean(registration.pan_company), extractedPan, normalizeIdentifier),
      sensitive: true,
    },
    {
      field: 'Company Name',
      registeredValue: clean(registration.company_name),
      extractedValue: extractedCompanyName,
      status: extractedCompanyName
        ? tokenMatch(registration.company_name, extractedCompanyName, true)
        : 'not_found',
    },
    {
      field: 'Person Name',
      registeredValue: clean(registration.full_name),
      extractedValue: extractedPersonName,
      status: extractedPersonName
        ? tokenMatch(registration.full_name, extractedPersonName)
        : 'not_found',
    },
    {
      field: 'PIN Code',
      registeredValue: clean(registration.pin_code),
      extractedValue: extractedPinCode,
      status: exactMatch(clean(registration.pin_code), extractedPinCode, normalizeIdentifier),
    },
    {
      field: 'Payment Date',
      registeredValue: normalizeDate(registration.payment_date),
      extractedValue: normalizeDate(extractedPaymentDate),
      status: exactMatch(normalizeDate(registration.payment_date), normalizeDate(extractedPaymentDate), normalizeDate),
    },
    {
      field: 'Transaction ID',
      registeredValue: clean(registration.transaction_id),
      extractedValue: extractedTransactionId,
      status: exactMatch(clean(registration.transaction_id), extractedTransactionId, normalizeIdentifier),
      sensitive: true,
    },
    {
      field: 'Bank Reference',
      registeredValue: clean(registration.bank_reference),
      extractedValue: extractedBankReference,
      status: exactMatch(clean(registration.bank_reference), extractedBankReference, normalizeIdentifier),
      sensitive: true,
    },
  ];
};

const deriveOverallStatus = (rows: VerificationRow[], hasDocuments: boolean): OverallStatus => {
  if (!hasDocuments) return 'not_available';

  const comparableRows = rows.filter((row) => row.registeredValue || row.extractedValue);
  if (comparableRows.some((row) => row.status === 'mismatch')) return 'manual_review';
  if (comparableRows.some((row) => row.status === 'partial' || row.status === 'not_found')) return 'partial';

  const keyRows = comparableRows.filter((row) => ['GST Number', 'PAN Number', 'Company Name', 'Person Name'].includes(row.field));
  return keyRows.length > 0 && keyRows.every((row) => row.status === 'exact') ? 'verified' : 'partial';
};

const VerifyDocumentModal: React.FC<VerifyDocumentModalProps> = ({ registration, isOpen, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [documents, setDocuments] = useState<ExtractedDocument[]>([]);

  const documentConfigs = useMemo<DocumentConfig[]>(() => {
    if (!registration) return [];
    return [
      {
        key: 'gst_certificate',
        label: 'GST Certificate',
        url: registration.gst_certificate_url,
        docType: 'gst_certificate',
      },
      {
        key: 'udyam_certificate',
        label: 'UDYAM Certificate',
        url: registration.udyam_certificate_url,
        docType: 'udyam_certificate',
      },
      {
        key: 'payment_proof',
        label: 'Payment Proof',
        url: registration.payment_proof_url,
        docType: 'payment_proof',
      },
    ];
  }, [registration]);

  useEffect(() => {
    if (!isOpen || !registration) return;

    let cancelled = false;

    const runVerification = async () => {
      setIsLoading(true);
      setWarnings([]);
      setDocuments([]);

      const availableDocs = documentConfigs.filter((doc) => clean(doc.url));
      if (availableDocs.length === 0) {
        setIsLoading(false);
        return;
      }

      const nextWarnings: string[] = [];
      const nextDocuments: ExtractedDocument[] = [];

      for (const doc of availableDocs) {
        try {
          const file = await fileFromUrl(doc.url as string, doc.label);
          const result = await extractDocument(file, doc.docType);
          if (!result.is_readable || result.reason_code !== 'ok') {
            nextWarnings.push(`${doc.label} could not be read clearly.`);
          }
          nextDocuments.push({ key: doc.key, label: doc.label, result });
        } catch {
          nextWarnings.push(`${doc.label} could not be fetched. The link may be expired or blocked by CORS.`);
        }
      }

      if (!cancelled) {
        setDocuments(nextDocuments);
        setWarnings(nextWarnings);
        setIsLoading(false);
      }
    };

    void runVerification();

    return () => {
      cancelled = true;
    };
  }, [documentConfigs, isOpen, registration]);

  const rows = useMemo(
    () => (registration ? buildRows(registration, documents) : []),
    [documents, registration]
  );

  const hasUploadedDocuments = documentConfigs.some((doc) => clean(doc.url));
  const overallStatus = deriveOverallStatus(rows, hasUploadedDocuments);

  if (!isOpen || !registration) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-background shadow-xl">
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Verify Documents
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {registration.full_name} - {registration.company_name}
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close verification report">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {documentConfigs.map((doc) => (
              <Badge key={doc.key} variant={doc.url ? 'info' : 'secondary'}>
                {doc.label}: {doc.url ? 'Available' : 'Not uploaded'}
              </Badge>
            ))}
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-primary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Extracting document details and comparing registration values...
            </div>
          ) : (
            <>
              {warnings.length > 0 && (
                <div className="mb-4 space-y-2 rounded-lg border border-warning/30 bg-warning/10 p-4">
                  {warnings.map((warning) => (
                    <div key={warning} className="flex items-start gap-2 text-sm text-warning-foreground">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}

              {!hasUploadedDocuments ? (
                <div className="rounded-lg border border-border p-6 text-center">
                  <FileCheck2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
                  <h3 className="text-base font-medium text-foreground">Document Not Available</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    No GST certificate, UDYAM certificate, or payment proof is uploaded for this registration.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Field</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Registered Value</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Extracted Value</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Match Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-card">
                      {rows.map((row) => (
                        <tr key={row.field}>
                          <td className="px-4 py-3 text-sm font-medium text-foreground">{row.field}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {row.sensitive ? maskSensitive(row.registeredValue) : row.registeredValue || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {row.sensitive ? maskSensitive(row.extractedValue) : row.extractedValue || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={getStatusVariant(row.status)}>
                              {getStatusLabel(row.status)}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div
                className={cn(
                  'mt-5 rounded-lg border p-4',
                  overallStatus === 'verified' && 'border-success/30 bg-success/10',
                  overallStatus === 'partial' && 'border-warning/30 bg-warning/10',
                  overallStatus === 'manual_review' && 'border-destructive/30 bg-destructive/10',
                  overallStatus === 'not_available' && 'border-border bg-muted/30'
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Overall Result</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This is a read-only verification report. No registration data was changed.
                    </p>
                  </div>
                  <Badge variant={getOverallVariant(overallStatus)}>
                    {getOverallLabel(overallStatus)}
                  </Badge>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-border px-6 py-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};

export default VerifyDocumentModal;
