import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Upload,
  FileText,
  User,
  Building2,
  MapPin,
  Phone,
  Lock,
  AlertCircle,
  CheckCircle,
  Loader2,
  Camera,
  X as XIcon
} from 'lucide-react';
import {
  memberRegistrationService,
  statesService,
  locationsService,
  companyDesignationsService,
  urlUtils,
  PublicPaymentState,
  DistrictOption,
  CityOption,
  DesignationMaster,
  registrationDraftService,
  type JoinDraftConfigurationErrorCode,
  type RegistrationDraftExpectedDocType
} from '../lib/supabase';
import Toast from '../components/Toast';
import { useFormFieldConfig } from '../hooks/useFormFieldConfig';
import { useValidation } from '../hooks/useValidation';
import ImageCropModal from '../components/ImageCropModal';
import { readFileAsDataURL, validateImageFile, generatePhotoFileName } from '../lib/imageProcessing';
import { normalizeMemberData, type NormalizationResult } from '../lib/normalization';
import FieldCorrectionStepper, { type FieldCorrectionStep } from '../components/FieldCorrectionStepper';
import SmartUploadDocument from '../components/SmartUploadDocument';
import type { SmartDocType, DetectedDocType, ReasonCode } from '../lib/documentExtraction';
import type { ExtractedFieldOption } from '../lib/documentExtraction';
import { useMember } from '../contexts/useMember';
import { supabase } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { formatDateValue } from '../lib/dateTimeManager';

const SMART_UPLOAD_DATE_FIELD_KEYS = new Set(['payment_date', 'date_of_birth']);

const correctionFieldLabels: Record<string, string> = {
  full_name: 'Full Name',
  company_name: 'Company Name',
  company_address: 'Company Address',
  products_services: 'Products & Services',
  alternate_contact_name: 'Alternate Contact Name',
  referred_by: 'Referred By'
};

const JOIN_LIVE_VALIDATION_EXCLUDED_FIELDS = new Set<string>([
  'is_custom_city',
  'gst_certificate_url',
  'udyam_certificate_url',
  'payment_proof_url'
]);

const EMPTY_JOIN_FORM_DATA = {
  full_name: '',
  gender: '',
  date_of_birth: '',
  email: '',
  mobile_number: '',
  company_name: '',
  company_designation_id: '',
  company_address: '',
  city: '',
  other_city_name: '',
  is_custom_city: false,
  district: '',
  state: '',
  pin_code: '',
  industry: '',
  activity_type: '',
  constitution: '',
  annual_turnover: '',
  number_of_employees: '',
  products_services: '',
  brand_names: '',
  website: '',
  gst_registered: '',
  gst_number: '',
  pan_company: '',
  esic_registered: '',
  epf_registered: '',
  referred_by: '',
  amount_paid: '',
  payment_date: '',
  payment_mode: '',
  transaction_id: '',
  bank_reference: '',
  alternate_contact_name: '',
  alternate_mobile: ''
};

type JoinFormData = typeof EMPTY_JOIN_FORM_DATA;
type RegistrationEntryStage = 'smart_steps' | 'smart_review' | 'form';

type GuidedDocType = SmartDocType;
type GuidedDocStatus = 'pending' | 'completed' | 'skipped' | 'no_document' | 'unreadable_confirmed';
type GuidedStepMessageTone = 'neutral' | 'success' | 'error';

interface GuidedDocConfig {
  docType: GuidedDocType;
  label: string;
  optional: boolean;
  supportsNoDocument: boolean;
  guidance: string;
}

const JOIN_PREFILL_FIELD_KEYS: Array<keyof JoinFormData> = [
  'full_name',
  'gender',
  'date_of_birth',
  'email',
  'mobile_number',
  'company_name',
  'company_designation_id',
  'company_address',
  'city',
  'other_city_name',
  'is_custom_city',
  'district',
  'state',
  'pin_code',
  'industry',
  'activity_type',
  'constitution',
  'annual_turnover',
  'number_of_employees',
  'products_services',
  'brand_names',
  'website',
  'gst_registered',
  'gst_number',
  'pan_company',
  'esic_registered',
  'epf_registered',
  'referred_by',
  'amount_paid',
  'payment_date',
  'payment_mode',
  'transaction_id',
  'bank_reference',
  'alternate_contact_name',
  'alternate_mobile'
] as const;

const PREFILL_SOURCE_KEY_ALIASES: Partial<Record<keyof JoinFormData, string[]>> = {
  company_designation_id: ['designation', 'company_designation', 'company_designation_name'],
  date_of_birth: ['dob'],
  payment_date: ['transaction_date'],
  other_city_name: ['other_city', 'custom_city'],
  transaction_id: ['transaction_reference', 'utr', 'utr_number'],
  bank_reference: ['reference_number', 'bank_ref']
};

const isDateField = (fieldKey: keyof JoinFormData): boolean =>
  fieldKey === 'date_of_birth' || fieldKey === 'payment_date';

const normalizeDateField = (rawValue: string): string => {
  const value = rawValue.trim();
  if (!value) {
    return '';
  }

  // Handle YYYY-MM-DDTHH:mm:ss and related ISO-like timestamps.
  const isoPrefix = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix?.[1]) {
    return isoPrefix[1];
  }

  // Handle DD-MM-YYYY or DD/MM/YYYY.
  const dmy = value.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  }

  return value;
};

const normalizeComparableValue = (value: string): string =>
  value.trim().replace(/\s+/g, ' ').toLowerCase();

const findCaseInsensitiveMatch = (options: string[], candidate: string): string | null => {
  const normalizedCandidate = normalizeComparableValue(candidate);
  if (!normalizedCandidate) {
    return null;
  }

  return options.find(option => normalizeComparableValue(option) === normalizedCandidate) ?? null;
};

const sanitizeGstNumber = (value: string): string =>
  value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

const sanitizePanNumber = (value: string): string =>
  value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

const derivePanFromGstNumber = (gstNumber: string): string | null => {
  const sanitized = sanitizeGstNumber(gstNumber);
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(sanitized)) {
    return null;
  }
  return sanitized.slice(2, 12);
};

const GUIDED_DOC_ORDER: GuidedDocType[] = [
  'gst_certificate',
  'udyam_certificate',
  'pan_card',
  'aadhaar_card',
  'payment_proof',
];

const GUIDED_DOC_CONFIGS: Record<GuidedDocType, GuidedDocConfig> = {
  gst_certificate: {
    docType: 'gst_certificate',
    label: 'GST Certificate',
    optional: true,
    supportsNoDocument: true,
    guidance: "Upload your GST certificate. Skip if you don't have GST.",
  },
  udyam_certificate: {
    docType: 'udyam_certificate',
    label: 'Udyam Certificate',
    optional: true,
    supportsNoDocument: true,
    guidance: "Upload your Udyam certificate. Skip if you don't have one.",
  },
  pan_card: {
    docType: 'pan_card',
    label: 'Company PAN Card',
    optional: true,
    supportsNoDocument: false,
    guidance: 'Upload your company PAN card to auto-fill PAN details.',
  },
  aadhaar_card: {
    docType: 'aadhaar_card',
    label: 'Aadhaar Card',
    optional: true,
    supportsNoDocument: false,
    guidance: 'Optional. Upload Aadhaar to auto-fill name, DOB, and gender.',
  },
  payment_proof: {
    docType: 'payment_proof',
    label: 'Payment Proof',
    optional: false,
    supportsNoDocument: false,
    guidance: 'Required to submit. Upload your payment receipt or screenshot.',
  },
};

const STORABLE_DRAFT_TYPES: ReadonlySet<GuidedDocType> = new Set<GuidedDocType>([
  'gst_certificate',
  'udyam_certificate',
  'payment_proof',
]);
const EXTRACT_ONLY_DRAFT_TYPES: ReadonlySet<GuidedDocType> = new Set<GuidedDocType>([
  'pan_card',
  'aadhaar_card',
]);

// Smart Upload normalization is now data-driven via the admin-managed
// `member_normalization_rules` table (CLAUDE-SMART-UPLOAD-NORMALIZATION-
// DYNAMIC-FIELDS-036). The previous static `RULES_ENGINE_FIELDS` gate was
// removed: `normalizeViaRulesEngine` now sends every extracted string-keyed
// field that matches the runtime field-key regex, and the runtime applies
// rules only to keys with an active rule.

const SMART_AUTOFILL_ALLOWED = new Set([
  'full_name', 'date_of_birth', 'gender',
  'payment_date', 'transaction_id', 'bank_reference',
  'gst_registered', 'gst_number', 'pan_company',
  'company_name', 'company_address', 'pin_code',
  'state', 'district', 'city',
  'industry', 'activity_type', 'products_services',
]);

const hasPrefillValue = (fieldKey: keyof JoinFormData, value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim() !== '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value === 'boolean') {
    return fieldKey === 'is_custom_city' ? value === true : true;
  }
  return false;
};

const normalizePrefillValue = (fieldKey: keyof JoinFormData, value: unknown): JoinFormData[keyof JoinFormData] => {
  if (fieldKey === 'is_custom_city') {
    if (typeof value === 'boolean') {
      return value;
    }
    const normalized = String(value).trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
  }

  const textValue = String(value).trim();
  if (isDateField(fieldKey)) {
    return normalizeDateField(textValue);
  }
  if (fieldKey === 'gender') {
    return textValue.toLowerCase();
  }
  return textValue;
};

const getPrefillCandidateValue = (
  source: Record<string, unknown>,
  fieldKey: keyof JoinFormData
): unknown => {
  if (Object.prototype.hasOwnProperty.call(source, fieldKey as string)) {
    return source[fieldKey as string];
  }

  const aliases = PREFILL_SOURCE_KEY_ALIASES[fieldKey];
  if (!aliases?.length) {
    return undefined;
  }

  for (const alias of aliases) {
    if (!Object.prototype.hasOwnProperty.call(source, alias)) {
      continue;
    }
    const aliasValue = source[alias];
    if (aliasValue !== undefined && aliasValue !== null) {
      return aliasValue;
    }
  }

  return undefined;
};

const Join: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isPreviewMode = searchParams.get('preview') === '1';
  const {
    isFieldVisible,
    isFieldRequired,
    getFieldLabel,
    getFieldPlaceholder,
    getFieldOptions,
    getFieldMinLength,
    getFieldMaxLength,
    isLoading: isLoadingConfig,
    error: configError,
    errorCode: configErrorCode
  } = useFormFieldConfig({
    source: isPreviewMode ? 'builder_draft' : 'builder_live',
    formKey: 'join_lub'
  });
  const { validateField: validateFieldByRule, isLoading: isLoadingValidation } = useValidation({ formKey: 'join_lub' });

  // Authentication and existing registration state
  const { member, isAuthenticated, isLoading: isLoadingAuth, refreshMember } = useMember();
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);
  const [hasRegistrationRecord, setHasRegistrationRecord] = useState<boolean | null>(
    isPreviewMode ? true : null
  );
  const [registrationStatusError, setRegistrationStatusError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<JoinFormData>(EMPTY_JOIN_FORM_DATA);
  const [registrationEntryStage, setRegistrationEntryStage] = useState<RegistrationEntryStage>(
    isPreviewMode ? 'form' : 'smart_steps'
  );
  const [smartUploadDraft, setSmartUploadDraft] = useState<Record<string, string>>({});
  const [smartUploadReviewData, setSmartUploadReviewData] = useState<Record<string, string>>({});
  const [smartUploadFieldOptions, setSmartUploadFieldOptions] = useState<Record<string, ExtractedFieldOption[]>>({});
  const guidedSelectedDocs: GuidedDocType[] = GUIDED_DOC_ORDER;
  const [guidedStepIndex, setGuidedStepIndex] = useState(0);
  const [guidedDocStatus, setGuidedDocStatus] = useState<Record<GuidedDocType, GuidedDocStatus>>({
    gst_certificate: 'pending',
    udyam_certificate: 'pending',
    pan_card: 'pending',
    aadhaar_card: 'pending',
    payment_proof: 'pending',
  });
  const [guidedStepMessage, setGuidedStepMessage] = useState<string>('');
  const [guidedStepMessageTone, setGuidedStepMessageTone] = useState<GuidedStepMessageTone>('neutral');
  // Per-doc extracted fields, captured at extraction time so the inline
  // preview panel can show only the current step's extracted values.
  const [perDocExtractedFields, setPerDocExtractedFields] = useState<
    Partial<Record<GuidedDocType, Record<string, string>>>
  >({});
  // Server-side draft document IDs for re-extract / cleanup. Populated as
  // saveDocument / uploadDocumentFile RPCs return them.
  const [draftDocumentIds, setDraftDocumentIds] = useState<
    Partial<Record<GuidedDocType, string>>
  >({});
  const hasHydratedDraftRef = useRef(false);
  const applyPrefillFromSources = useCallback((
    current: JoinFormData,
    sources: Array<Record<string, unknown>>
  ): JoinFormData => {
    const next: JoinFormData = { ...current };

    for (const key of JOIN_PREFILL_FIELD_KEYS) {
      if (hasPrefillValue(key, current[key])) {
        continue;
      }

      for (const source of sources) {
        if (!source || typeof source !== 'object') {
          continue;
        }

        const candidate = getPrefillCandidateValue(source, key);
        if (!hasPrefillValue(key, candidate)) {
          continue;
        }

        next[key] = normalizePrefillValue(key, candidate) as JoinFormData[typeof key];
        break;
      }
    }

    return next;
  }, []);

  // Location state
  const [availableStates, setAvailableStates] = useState<PublicPaymentState[]>([]);
  const [availableDistricts, setAvailableDistricts] = useState<DistrictOption[]>([]);
  const [availableCities, setAvailableCities] = useState<CityOption[]>([]);
  const [availableDesignations, setAvailableDesignations] = useState<DesignationMaster[]>([]);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string>('');
  const [showOtherCity, setShowOtherCity] = useState(false);
  const [otherCityText, setOtherCityText] = useState('');
  const [currentStatePaymentSettings, setCurrentStatePaymentSettings] = useState<PublicPaymentState | null>(null);
  
  // Loading states
  const [isLoadingStates, setIsLoadingStates] = useState(true);
  const [isLoadingDesignations, setIsLoadingDesignations] = useState(true);
  const [isLoadingDistricts, setIsLoadingDistricts] = useState(false);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [, setIsLoadingPaymentSettings] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // File uploads
  const [files, setFiles] = useState<{
    gstCertificate: File | null;
    udyamCertificate: File | null;
    paymentProof: File | null;
  }>({
    gstCertificate: null,
    udyamCertificate: null,
    paymentProof: null
  });

  // Profile photo state
  const [profilePhoto, setProfilePhoto] = useState<Blob | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string>('');
  const [photoFileName, setPhotoFileName] = useState<string>('');
  const [photoImageSrc, setPhotoImageSrc] = useState<string>('');
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);

  // Normalization state
  const [initialFormSnapshot, setInitialFormSnapshot] = useState<JoinFormData>(EMPTY_JOIN_FORM_DATA);
  const [isVerifiedForSubmit, setIsVerifiedForSubmit] = useState(false);
  const [normalizationOriginalSnapshot, setNormalizationOriginalSnapshot] = useState<typeof formData | null>(null);
  const [correctionFields, setCorrectionFields] = useState<FieldCorrectionStep[]>([]);
  const [showCorrectionStepper, setShowCorrectionStepper] = useState(false);
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const latestErrorsRef = useRef<Record<string, string>>({});

  const scrollToFirstError = (errorMap: Record<string, string>) => {
    for (const key of Object.keys(errorMap)) {
      const el =
        document.getElementById(key) ??
        (document.querySelector(`[name="${key}"]`) as HTMLElement | null);
      if (el && el.offsetParent !== null) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
        return;
      }
    }
  };

  // Validation and UI state
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [formErrorMessage, setFormErrorMessage] = useState<string>('');
  const [previewBlockReason, setPreviewBlockReason] = useState<JoinDraftConfigurationErrorCode | null>(null);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({
    type: 'success',
    message: '',
    isVisible: false
  });

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, isVisible: false }));
  }, []);

  // Ensure a hard refresh on /join always starts from top instead of restoring
  // browser scroll position near the footer.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';

    const forceTop = () => window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    forceTop();
    const rafId = window.requestAnimationFrame(forceTop);
    const timeoutId = window.setTimeout(forceTop, 120);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  const isFieldApplicable = useCallback(
    (fieldName: string, data: JoinFormData = formData): boolean => {
      if (!isFieldVisible(fieldName)) {
        return false;
      }

      // GST-related fields only apply when GST is marked as registered.
      if ((fieldName === 'gst_number' || fieldName === 'gst_certificate_url') && data.gst_registered !== 'yes') {
        return false;
      }

      return true;
    },
    [formData, isFieldVisible]
  );

  const resolveFieldLabel = useCallback(
    (fieldKey: string, fallback: string) => getFieldLabel(fieldKey, fallback),
    [getFieldLabel]
  );

  const resolveFieldPlaceholder = useCallback(
    (fieldKey: string, fallback: string) => getFieldPlaceholder(fieldKey, fallback),
    [getFieldPlaceholder]
  );

  const resolveFieldOptions = useCallback(
    (fieldKey: string, fallback: string[]) => {
      const configured = getFieldOptions(fieldKey)
        .map(item => String(item).trim())
        .filter(Boolean);
      return configured.length > 0 ? configured : fallback;
    },
    [getFieldOptions]
  );

  const getCorrectionFields = useCallback((result: NormalizationResult): FieldCorrectionStep[] => {
    return Object.entries(correctionFieldLabels)
      .filter(([fieldName]) => {
        const originalValue = String(result.original[fieldName] ?? '').trim();
        const correctedValue = String(result.normalized[fieldName as keyof typeof result.normalized] ?? '').trim();
        return originalValue !== correctedValue;
      })
      .map(([fieldName, label]) => ({
        fieldName,
        label,
        value: String(result.normalized[fieldName as keyof typeof result.normalized] ?? '')
      }));
  }, []);

  const focusSubmitButton = useCallback(() => {
    window.requestAnimationFrame(() => {
      submitButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      submitButtonRef.current?.focus();
    });
  }, []);

  const hasFormChanges = useCallback(() => {
    return JSON.stringify(formData) !== JSON.stringify(initialFormSnapshot);
  }, [formData, initialFormSnapshot]);

  // Check authentication - redirect to sign in if not authenticated (non-preview only)
  useEffect(() => {
    if (isPreviewMode) {
      return;
    }
    if (!isLoadingAuth && !isAuthenticated) {
      console.log('[Join] Not authenticated, redirecting to sign in');
      navigate('/signin', { replace: true });
    }
  }, [isLoadingAuth, isAuthenticated, isPreviewMode, navigate]);

  // Preview access gate: admin-only draft preview, no live fallback.
  useEffect(() => {
    if (!isPreviewMode || isLoadingConfig) {
      return;
    }

    if (!configError && !configErrorCode) {
      setPreviewBlockReason(null);
      return;
    }

    const reason = configErrorCode ?? 'load_failed';
    if (reason === 'no_session') {
      navigate(`/signin?next=${encodeURIComponent('/join?preview=1')}`, { replace: true });
      return;
    }

    setPreviewBlockReason(reason);
  }, [configError, configErrorCode, isLoadingConfig, isPreviewMode, navigate]);

  // Check for existing registration and handle based on status
  useEffect(() => {
    if (isPreviewMode) {
      setHasRegistrationRecord(true);
      setRegistrationStatusError(null);
      setIsCheckingExisting(false);
      return;
    }

    const checkExistingRegistration = async () => {
      // Only check if authenticated and member data is available
      if (!isAuthenticated || !member || !member.user_id) {
        setHasRegistrationRecord(false);
        setRegistrationStatusError(null);
        setIsCheckingExisting(false);
        return;
      }

      try {
        setIsCheckingExisting(true);
        setRegistrationStatusError(null);
        console.log('[Join] Checking for existing registration for user:', member.user_id);

        const { data: registrationRows, error } = await supabase
          .from('member_registrations')
          .select('*')
          .eq('user_id', member.user_id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) {
          console.error('[Join] Error checking registration:', error);
          setHasRegistrationRecord(null);
          setRegistrationStatusError('Unable to confirm your registration status right now. Please refresh and try again.');
          setIsCheckingExisting(false);
          return;
        }

        let existingRegistration = registrationRows?.[0] as Record<string, unknown> | undefined;

        // Legacy fallback where user_id may still be null on older registrations.
        if (!existingRegistration && member.email) {
          const { data: legacyRows, error: legacyError } = await supabase
            .from('member_registrations')
            .select('*')
            .is('user_id', null)
            .eq('email', member.email)
            .order('created_at', { ascending: false })
            .limit(1);

          if (!legacyError) {
            existingRegistration = legacyRows?.[0] as Record<string, unknown> | undefined;
          } else {
            console.warn('[Join] Legacy registration prefill lookup failed:', legacyError.message);
          }
        }

        const resolveUserPrefillSource = async (): Promise<Record<string, unknown>> => {
          const userPrefillSource: Record<string, unknown> = {
            ...member,
            email: member.email || '',
            mobile_number: member.mobile_number || ''
          };

          // Include cached session user payload (may carry additional fields).
          const cachedUser = sessionManager.getUserData();
          if (cachedUser && typeof cachedUser === 'object') {
            Object.assign(userPrefillSource, cachedUser);
          }

          // Pull fresh account row to capture any additional join-compatible fields.
          if (member.user_id) {
            try {
              const { data: userRow, error: userStateError } = await supabase
                .from('users')
                .select('*')
                .eq('id', member.user_id)
                .maybeSingle();

              if (!userStateError && userRow && typeof userRow === 'object') {
                Object.assign(userPrefillSource, userRow as Record<string, unknown>);
              } else if (userStateError) {
                console.warn('[Join] Could not fetch user row from users table:', userStateError.message);
              }
            } catch (stateLookupError) {
              console.warn('[Join] Unexpected error while fetching user prefill fallback:', stateLookupError);
            }
          }

          return userPrefillSource;
        };

        const userPrefillSource = await resolveUserPrefillSource();
        const signupPrefillResult = await memberRegistrationService.getSignupPrefillPayloadByToken();
        const signupPrefillSource =
          signupPrefillResult.data && typeof signupPrefillResult.data === 'object'
            ? (signupPrefillResult.data as Record<string, unknown>)
            : {};

        if (signupPrefillResult.error) {
          console.warn('[Join] Failed to load signup prefill payload:', signupPrefillResult.error);
        } else if (Object.keys(signupPrefillSource).length > 0) {
          console.log('[Join] Loaded signup prefill payload keys:', Object.keys(signupPrefillSource));
        }

        // Handle different registration statuses
        if (existingRegistration) {
          setHasRegistrationRecord(true);
          setRegistrationStatusError(null);
          const registrationStatus = String(existingRegistration.status ?? '').toLowerCase();
          console.log('[Join] Found existing registration with status:', registrationStatus || 'unknown');

          // Pending: Redirect to dashboard
          if (registrationStatus === 'pending') {
            console.log('[Join] User has pending registration, redirecting to dashboard');
            navigate('/dashboard', { replace: true });
            return;
          }

          // Approved: Redirect to dashboard
          if (registrationStatus === 'approved') {
            console.log('[Join] User is already approved, redirecting to dashboard');
            navigate('/dashboard', { replace: true });
            return;
          }

          // Rejected: Redirect to reapply page
          if (registrationStatus === 'rejected') {
            console.log('[Join] User has rejected registration, redirecting to reapply page');
            navigate('/dashboard/reapply', { replace: true });
            return;
          }

          // For non-blocking legacy/edge statuses, prefill from matching registration fields
          // and user account payload without overwriting user-entered values.
          setFormData(prev => {
            const nextFormData = applyPrefillFromSources(prev, [existingRegistration, signupPrefillSource, userPrefillSource]);
            setInitialFormSnapshot(snapshot => applyPrefillFromSources(snapshot, [existingRegistration!, signupPrefillSource, userPrefillSource]));
            return nextFormData;
          });
          console.log('[Join] Pre-filled form from existing registration + signup payload + user data for non-blocking status');
        } else {
          setHasRegistrationRecord(false);
          setRegistrationStatusError(null);
          console.log('[Join] No existing registration found - user can proceed with form');
          // Prefill all matching form fields from signup payload + user payloads.
          setFormData(prev => {
            const nextFormData = applyPrefillFromSources(prev, [signupPrefillSource, userPrefillSource]);
            setInitialFormSnapshot(snapshot => applyPrefillFromSources(snapshot, [signupPrefillSource, userPrefillSource]));
            return nextFormData;
          });
          console.log('[Join] Pre-filled form from signup payload + available user data');
        }
      } catch (error) {
        console.error('[Join] Unexpected error checking registration:', error);
        setHasRegistrationRecord(null);
        setRegistrationStatusError('Unable to confirm your registration status right now. Please refresh and try again.');
      } finally {
        setIsCheckingExisting(false);
      }
    };

    // Only run check if user is authenticated
    if (isAuthenticated && member) {
      checkExistingRegistration();
    } else {
      setHasRegistrationRecord(false);
      setRegistrationStatusError(null);
      setIsCheckingExisting(false);
    }
  }, [applyPrefillFromSources, isAuthenticated, isPreviewMode, member, navigate]);

  // Load initial data and handle URL parameters
  // Auto-fill amount paid based on state payment settings and gender
  useEffect(() => {
    if (currentStatePaymentSettings && formData.gender) {
      if (formData.gender === 'male') {
        setFormData(prev => ({ ...prev, amount_paid: currentStatePaymentSettings.male_fee.toString() }));
      } else if (formData.gender === 'female') {
        setFormData(prev => ({ ...prev, amount_paid: currentStatePaymentSettings.female_fee.toString() }));
      }
    } else {
      setFormData(prev => ({ ...prev, amount_paid: '' }));
    }
  }, [formData.gender, currentStatePaymentSettings]);

  const loadStates = useCallback(async () => {
    try {
      console.log('[Join.tsx] Loading states...');
      setIsLoadingStates(true);
      const states = await statesService.getPublicPaymentStates();
      console.log('[Join.tsx] States loaded successfully:', states.length, 'states');
      setAvailableStates(states.sort((a, b) => a.state.localeCompare(b.state)));
    } catch (error) {
      console.error('Error loading states:', error);
      showToast('error', 'Failed to load states');
    } finally {
      setIsLoadingStates(false);
    }
  }, [showToast]);

  const loadDesignations = useCallback(async () => {
    try {
      console.log('[Join.tsx] Loading designations...');
      setIsLoadingDesignations(true);
      const designations = await companyDesignationsService.getActiveDesignations();
      console.log('[Join.tsx] Designations loaded:', designations.length, 'designations');
      setAvailableDesignations(designations);
    } catch (error) {
      console.error('Error loading designations:', error);
      showToast('error', 'Failed to load designations');
    } finally {
      setIsLoadingDesignations(false);
    }
  }, [showToast]);

  const loadDistricts = useCallback(async (stateName: string) => {
    try {
      console.log('[Join.tsx] Loading districts for state:', stateName);
      setIsLoadingDistricts(true);
      const districts = await locationsService.getActiveDistrictsByStateName(stateName);
      console.log('[Join.tsx] Districts loaded:', districts.length, 'districts for', stateName);
      setAvailableDistricts(districts);
    } catch (error) {
      console.error('Error loading districts:', error);
      showToast('error', 'Failed to load districts');
    } finally {
      setIsLoadingDistricts(false);
    }
  }, [showToast]);

  const loadCities = useCallback(async (districtId: string) => {
    try {
      console.log('[Join.tsx] Loading cities for district ID:', districtId);
      setIsLoadingCities(true);
      const cities = await locationsService.getActiveCitiesByDistrictId(districtId);
      console.log('[Join.tsx] Cities loaded:', cities.length, 'cities');
      setAvailableCities(cities);

      // If no cities available, show "Other" by default
      if (cities.length === 0) {
        console.log('[Join.tsx] No cities available, showing "Other" option by default');
        setShowOtherCity(true);
      }
    } catch (error) {
      console.error('Error loading cities:', error);
      showToast('error', 'Failed to load cities');
    } finally {
      setIsLoadingCities(false);
    }
  }, [showToast]);

  const loadPaymentSettingsForState = useCallback(async (stateName: string) => {
    try {
      setIsLoadingPaymentSettings(true);
      const paymentSettings = await statesService.getPublicPaymentStateByName(stateName);

      if (paymentSettings) {
        setCurrentStatePaymentSettings(paymentSettings);
      } else {
        setCurrentStatePaymentSettings(null);
        showToast('error', `No payment settings found for ${stateName}`);
      }
    } catch (error) {
      console.error('Error loading payment settings:', error);
      setCurrentStatePaymentSettings(null);
      showToast('error', 'Failed to load payment settings');
    } finally {
      setIsLoadingPaymentSettings(false);
    }
  }, [showToast]);

  useEffect(() => {
    console.log('[Join.tsx] Component mounted, loading initial data');
    void loadStates();
    void loadDesignations();

    const stateParam = searchParams.get('state');
    if (stateParam) {
      console.log('[Join.tsx] State parameter from URL:', stateParam);
      setFormData(prev => ({ ...prev, state: stateParam }));
      setInitialFormSnapshot(prev => ({ ...prev, state: stateParam }));
    }
  }, [loadDesignations, loadStates, searchParams]);

  useEffect(() => {
    if (formData.state) {
      void loadDistricts(formData.state);
      void loadPaymentSettingsForState(formData.state);
    } else {
      setAvailableDistricts([]);
      setAvailableCities([]);
      setSelectedDistrictId('');
      setShowOtherCity(false);
      setOtherCityText('');
      setCurrentStatePaymentSettings(null);
      setFormData(prev => ({ ...prev, district: '', city: '', other_city_name: '', is_custom_city: false, amount_paid: '' }));
    }
  }, [formData.state, loadDistricts, loadPaymentSettingsForState]);

  useEffect(() => {
    if (!formData.state || availableStates.length === 0) {
      return;
    }

    const matchedState = findCaseInsensitiveMatch(
      availableStates.map(item => item.state),
      formData.state
    );

    if (matchedState && matchedState !== formData.state) {
      setFormData(prev => (
        prev.state === formData.state
          ? { ...prev, state: matchedState }
          : prev
      ));
    }
  }, [availableStates, formData.state]);

  useEffect(() => {
    if (selectedDistrictId) {
      void loadCities(selectedDistrictId);
    } else {
      setAvailableCities([]);
      setShowOtherCity(false);
      setOtherCityText('');
      setFormData(prev => ({ ...prev, city: '', other_city_name: '', is_custom_city: false }));
    }
  }, [loadCities, selectedDistrictId]);

  // When district is prefilled from existing data, hydrate selectedDistrictId so city options load.
  useEffect(() => {
    if (formData.district && availableDistricts.length > 0) {
      const matchedDistrict = availableDistricts.find(
        district => normalizeComparableValue(district.district_name) === normalizeComparableValue(formData.district)
      );
      if (matchedDistrict) {
        if (matchedDistrict.district_name !== formData.district) {
          setFormData(prev => (
            prev.district === formData.district
              ? { ...prev, district: matchedDistrict.district_name }
              : prev
          ));
        }
        if (selectedDistrictId !== matchedDistrict.district_id) {
          setSelectedDistrictId(matchedDistrict.district_id);
        }
      }
    }
  }, [availableDistricts, formData.district, selectedDistrictId]);

  useEffect(() => {
    if (!formData.city || showOtherCity || availableCities.length === 0) {
      return;
    }

    const matchedCity = availableCities.find(
      city => normalizeComparableValue(city.city_name) === normalizeComparableValue(formData.city)
    );

    if (matchedCity && matchedCity.city_name !== formData.city) {
      setFormData(prev => (
        prev.city === formData.city
          ? { ...prev, city: matchedCity.city_name }
          : prev
      ));
    }
  }, [availableCities, formData.city, showOtherCity]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    // Auto-convert email and website to lowercase
    const processedValue = (name === 'email' || name === 'website') ? value.toLowerCase() : value;

    setFormData(prev => ({ ...prev, [name]: processedValue }));
    setIsVerifiedForSubmit(false);

    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });

      // Clear form error message if all required fields now have values
      const requiredFields = ['full_name', 'email', 'mobile_number', 'date_of_birth', 'gender', 'payment_date'];
      const hasAllRequired = requiredFields.every(field => {
        if (field === name) return processedValue.trim() !== '';
        const fieldValue = formData[field as keyof typeof formData];
        return fieldValue && fieldValue.toString().trim() !== '';
      });

      if (hasAllRequired) {
        setFormErrorMessage('');
      }
    }
  };

  const handleMobileNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Remove all non-numeric characters
    let numericValue = value.replace(/\D/g, '');

    // Prevent 0 as the first digit
    if (numericValue.length > 0 && numericValue[0] === '0') {
      numericValue = numericValue.substring(1);
    }

    // No length limit - let validation handle it

    setFormData(prev => ({ ...prev, [name]: numericValue }));
    setIsVerifiedForSubmit(false);

    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });

      // Clear form error message if all required fields now have values
      const requiredFields = ['full_name', 'email', 'mobile_number', 'date_of_birth', 'gender', 'payment_date'];
      const hasAllRequired = requiredFields.every(field => {
        if (field === name) return numericValue.trim() !== '';
        const fieldValue = formData[field as keyof typeof formData];
        return fieldValue && fieldValue.toString().trim() !== '';
      });

      if (hasAllRequired) {
        setFormErrorMessage('');
      }
    }
  };

  const handlePinCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Remove all non-numeric characters
    const numericValue = value.replace(/\D/g, '');

    // No length limit - let validation handle it

    setFormData(prev => ({ ...prev, [name]: numericValue }));
    setIsVerifiedForSubmit(false);

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handlePanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Remove all non-alphanumeric characters and convert to uppercase
    const alphanumericValue = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    // No length limit - let validation handle it

    setFormData(prev => ({ ...prev, [name]: alphanumericValue }));
    setIsVerifiedForSubmit(false);

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleGstChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Remove all non-alphanumeric characters and convert to uppercase
    const alphanumericValue = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    // No length limit - let validation handle it

    setFormData(prev => ({ ...prev, [name]: alphanumericValue }));
    setIsVerifiedForSubmit(false);

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const fallbackFieldLabel = useCallback((fieldName: string): string => {
    return fieldName
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }, []);

  const getRequiredFieldMessage = useCallback(
    (fieldName: string, dataToCheck: JoinFormData = formData): { errorKey: string; message: string } | null => {
      if (fieldName === 'is_custom_city') {
        return null;
      }

      if (fieldName === 'city') {
        if (!isFieldRequired('city') || !isFieldApplicable('city', dataToCheck)) {
          return null;
        }

        if (dataToCheck.is_custom_city) {
          if (!String(dataToCheck.other_city_name ?? '').trim()) {
            return { errorKey: 'city', message: 'Please enter a city/town/village name' };
          }
          return null;
        }

        if (!String(dataToCheck.city ?? '').trim()) {
          return { errorKey: 'city', message: 'City/Town/Village is required' };
        }
        return null;
      }

      if (!isFieldRequired(fieldName) || !isFieldApplicable(fieldName, dataToCheck)) {
        return null;
      }

      const rawValue = dataToCheck[fieldName as keyof JoinFormData];
      if (String(rawValue ?? '').trim()) {
        return null;
      }

      const label = resolveFieldLabel(fieldName, fallbackFieldLabel(fieldName));
      return { errorKey: fieldName, message: `${label} is required` };
    },
    [fallbackFieldLabel, formData, isFieldApplicable, isFieldRequired, resolveFieldLabel]
  );

  const validateField = async (fieldName: string) => {
    if (fieldName !== 'other_city_name' && !Object.prototype.hasOwnProperty.call(formData, fieldName)) {
      return;
    }

    if (fieldName === 'other_city_name') {
      const cityIssue = getRequiredFieldMessage('city');
      setErrors(prev => ({ ...prev, city: cityIssue?.message ?? '' }));
      return;
    }

    if (!isFieldApplicable(fieldName)) {
      setErrors(prev => ({ ...prev, [fieldName]: '' }));
      return;
    }

    const value = formData[fieldName as keyof typeof formData];

    console.log('[Join] validateField called for:', fieldName, 'value:', value ? (value.toString().substring(0, 20) + '...') : '(empty)');

    const requiredIssue = getRequiredFieldMessage(fieldName);
    if (requiredIssue?.errorKey === fieldName) {
      setErrors(prev => ({ ...prev, [fieldName]: requiredIssue.message }));
      return;
    }

    // Only validate format if field has a value.
    if (!value || value.toString().trim() === '') {
      setErrors(prev => ({ ...prev, [fieldName]: '' }));
      return;
    }

    let errorMessage = '';

    // Pass field name directly to validation - it will look up the rule internally
    console.log('[Join] Validating field:', fieldName);
    const result = await validateFieldByRule(fieldName, value.toString());
    console.log('[Join] Validation result for', fieldName, ':', result.isValid ? 'VALID' : 'INVALID', '-', result.message || '(no error)');

    if (!result.isValid) {
      errorMessage = result.message;
    }

    // Additional duplicate check for email and mobile (only if format validation passed)
    if (!errorMessage) {
      if (fieldName === 'email') {
        console.log('[Join] Checking for duplicate email:', value);
        const duplicateCheck = await memberRegistrationService.checkEmailDuplicate(value.toString());
        if (duplicateCheck.isDuplicate) {
          errorMessage = 'This email address is already registered. You can either sign in to your account or register with a different email address.';
          console.log('[Join] Duplicate email detected');
        }
      } else if (fieldName === 'mobile_number') {
        console.log('[Join] Checking for duplicate mobile number:', value);
        const duplicateCheck = await memberRegistrationService.checkMobileDuplicate(value.toString());
        if (duplicateCheck.isDuplicate) {
          errorMessage = 'This mobile number is already registered. You can either sign in to your account or register with a different mobile number.';
          console.log('[Join] Duplicate mobile number detected');
        }
      }
    }

    setErrors(prev => ({ ...prev, [fieldName]: errorMessage }));
  };

  const handleFormBlurCapture = (event: React.FocusEvent<HTMLFormElement>) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const fieldName = target.name;
    if (!fieldName) {
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(formData, fieldName)) {
      return;
    }

    if (JOIN_LIVE_VALIDATION_EXCLUDED_FIELDS.has(fieldName)) {
      return;
    }

    void validateField(fieldName);
  };

  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const districtName = e.target.value;
    const selectedDistrict = availableDistricts.find(d => d.district_name === districtName);

    setFormData(prev => ({ ...prev, district: districtName, city: '', other_city_name: '', is_custom_city: false }));
    setIsVerifiedForSubmit(false);
    setSelectedDistrictId(selectedDistrict?.district_id || '');
    setShowOtherCity(false);
    setOtherCityText('');
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cityName = e.target.value;
    console.log('[Join.tsx] City selection changed:', cityName);

    if (cityName === 'Other') {
      console.log('[Join.tsx] "Other" city selected, enabling custom city input');
      setShowOtherCity(true);
      setFormData(prev => ({ ...prev, city: '', other_city_name: '', is_custom_city: true }));
      setOtherCityText('');
    } else {
      console.log('[Join.tsx] Standard city selected:', cityName);
      setShowOtherCity(false);
      setOtherCityText('');
      setFormData(prev => ({ ...prev, city: cityName, other_city_name: '', is_custom_city: false }));
    }
    setIsVerifiedForSubmit(false);
  };

  const handleOtherCityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    console.log('[Join.tsx] Custom city name entered:', value);
    setOtherCityText(value);
    setFormData(prev => ({
      ...prev,
      other_city_name: value,
      is_custom_city: true,
      city: ''
    }));
    setIsVerifiedForSubmit(false);

    if (errors.city) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.city;
        return newErrors;
      });
    }
  };

  const handleFileChange = useCallback((fileType: keyof typeof files, file: File | null) => {
    setFiles(prev => ({ ...prev, [fileType]: file }));
    const errorKeyMap: Record<keyof typeof files, string> = {
      gstCertificate: 'gst_certificate_url',
      udyamCertificate: 'udyam_certificate_url',
      paymentProof: 'payment_proof_url'
    };
    const errorKey = errorKeyMap[fileType];
    if (errorKey) {
      setErrors(prev => {
        if (!prev[errorKey]) return prev;
        const next = { ...prev };
        delete next[errorKey];
        return next;
      });
    }
    setIsVerifiedForSubmit(false);
  }, []);

  // Smart Upload callbacks
  const applySmartFieldsToJoinData = useCallback((current: JoinFormData, fields: Record<string, string>) => {
    const updates: Partial<JoinFormData> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (SMART_AUTOFILL_ALLOWED.has(key) && Object.prototype.hasOwnProperty.call(current, key)) {
        (updates as Record<string, string>)[key] = key === 'gender' ? value.toLowerCase() : value;
      }
    }
    return { ...current, ...updates };
  }, []);

  const normalizeSmartUploadFields = useCallback((fields: Record<string, string>) => {
    const normalized = { ...fields };

    if (normalized.payment_date) {
      normalized.payment_date = normalizeDateField(normalized.payment_date);
    }

    if (normalized.gender) {
      // Backend emits lowercase `male` / `female`. Match case-insensitively
      // against the configured gender options so the form dropdown selects cleanly.
      const genderOptions = resolveFieldOptions('gender', ['Male', 'Female']);
      const matchedGender = findCaseInsensitiveMatch(genderOptions, normalized.gender);
      if (matchedGender) {
        normalized.gender = matchedGender;
      }
    }

    if (normalized.state) {
      const matchedState = findCaseInsensitiveMatch(
        availableStates.map(item => item.state),
        normalized.state
      );
      if (matchedState) {
        normalized.state = matchedState;
      }
    }

    if (normalized.district) {
      const matchedDistrict = findCaseInsensitiveMatch(
        availableDistricts.map(item => item.district_name),
        normalized.district
      );
      if (matchedDistrict) {
        normalized.district = matchedDistrict;
      }
    }

    if (normalized.city) {
      const matchedCity = findCaseInsensitiveMatch(
        availableCities.map(item => item.city_name),
        normalized.city
      );
      if (matchedCity) {
        normalized.city = matchedCity;
      }
    }

    if (normalized.gst_number) {
      normalized.gst_number = sanitizeGstNumber(normalized.gst_number);
      normalized.gst_registered = 'yes';

      if (!normalized.pan_company) {
        const derivedPan = derivePanFromGstNumber(normalized.gst_number);
        if (derivedPan) {
          normalized.pan_company = derivedPan;
        }
      }
    }

    if (normalized.pan_company) {
      normalized.pan_company = sanitizePanNumber(normalized.pan_company);
    }

    return normalized;
  }, [availableCities, availableDistricts, availableStates, resolveFieldOptions]);

  // Restore server-side Smart Upload draft state for the current user.
  // This keeps guided-step progress and extracted details visible across refreshes.
  useEffect(() => {
    if (isPreviewMode || isLoadingAuth || !isAuthenticated || hasRegistrationRecord !== false) {
      return;
    }
    // Session token can arrive slightly after auth state on hard refresh.
    // Avoid locking hydration as "done" until a token-backed draft fetch succeeds
    // (or we definitively learn no draft exists).
    const sessionToken = sessionManager.getSessionToken();
    if (!sessionToken) {
      return;
    }
    if (hasHydratedDraftRef.current) {
      return;
    }

    let cancelled = false;
    let retryTimer: number | null = null;
    let retryCount = 0;
    const maxInvalidSessionRetries = 4;

    const hydrateDraft = async () => {
      const draftResult = await registrationDraftService.getDraft();
      if (cancelled) {
        return;
      }
      if (!draftResult.success) {
        if (draftResult.errorCode === 'invalid_session' && retryCount < maxInvalidSessionRetries) {
          retryCount += 1;
          retryTimer = window.setTimeout(() => {
            void hydrateDraft();
          }, 350);
          return;
        }
        if (draftResult.errorCode !== 'no_draft') {
          console.warn('[Join] Draft hydration failed (non-blocking):', draftResult.error ?? draftResult.errorCode ?? 'unknown_error');
        }
        hasHydratedDraftRef.current = true;
        return;
      }
      if (!draftResult.draft) {
        hasHydratedDraftRef.current = true;
        return;
      }

      const nextStatuses: Record<GuidedDocType, GuidedDocStatus> = {
        gst_certificate: 'pending',
        udyam_certificate: 'pending',
        pan_card: 'pending',
        aadhaar_card: 'pending',
        payment_proof: 'pending',
      };
      const nextDraftDocumentIds: Partial<Record<GuidedDocType, string>> = {};
      const nextPerDocFields: Partial<Record<GuidedDocType, Record<string, string>>> = {};
      const mergedReviewData: Record<string, string> = {};
      const mergedDraftData: Record<string, string> = {};
      const mergedFieldOptions: Record<string, ExtractedFieldOption[]> = {};

      for (const doc of draftResult.documents) {
        const expected = doc.expected_doc_type as GuidedDocType;
        if (!GUIDED_DOC_ORDER.includes(expected)) {
          continue;
        }

        nextDraftDocumentIds[expected] = doc.id;
        switch (doc.status) {
          case 'extracted':
            nextStatuses[expected] = 'completed';
            break;
          case 'unreadable':
            nextStatuses[expected] = 'unreadable_confirmed';
            break;
          case 'skipped':
            nextStatuses[expected] = 'skipped';
            break;
          case 'no_document':
            nextStatuses[expected] = 'no_document';
            if (expected === 'gst_certificate') {
              mergedDraftData.gst_registered = 'no';
            }
            break;
          default:
            nextStatuses[expected] = 'pending';
        }

        const rawFields =
          doc.extracted_fields && typeof doc.extracted_fields === 'object'
            ? (doc.extracted_fields as Record<string, unknown>)
            : {};
        const stringFields: Record<string, string> = {};
        for (const [fieldKey, fieldValue] of Object.entries(rawFields)) {
          const text = String(fieldValue ?? '').trim();
          if (!text) continue;
          stringFields[fieldKey] = text;
        }
        const normalizedFields = normalizeSmartUploadFields(stringFields);
        if (Object.keys(normalizedFields).length > 0) {
          nextPerDocFields[expected] = normalizedFields;
          Object.assign(mergedReviewData, normalizedFields);
          Object.assign(mergedDraftData, normalizedFields);
        }

        const rawOptions =
          doc.field_options && typeof doc.field_options === 'object'
            ? (doc.field_options as Record<string, unknown>)
            : {};
        for (const [fieldKey, list] of Object.entries(rawOptions)) {
          if (!Array.isArray(list)) continue;
          const existing = mergedFieldOptions[fieldKey] ?? [];
          const seen = new Set(
            existing.map(opt => opt.value.trim().replace(/\s+/g, ' ').toLowerCase())
          );
          const merged = [...existing];
          for (const option of list) {
            if (!option || typeof option !== 'object') continue;
            const value = String((option as { value?: unknown }).value ?? '').trim();
            if (!value) continue;
            const normalized = value.replace(/\s+/g, ' ').toLowerCase();
            if (seen.has(normalized)) continue;
            seen.add(normalized);
            const labelRaw = (option as { label?: unknown }).label;
            const sourceRaw = (option as { source?: unknown }).source;
            merged.push({
              value,
              ...(typeof labelRaw === 'string' && labelRaw.trim() ? { label: labelRaw.trim() } : {}),
              ...(typeof sourceRaw === 'string' && sourceRaw.trim() ? { source: sourceRaw.trim() } : {}),
            });
          }
          if (merged.length > 0) {
            mergedFieldOptions[fieldKey] = merged;
          }
        }
      }

      if (cancelled) {
        return;
      }

      hasHydratedDraftRef.current = true;
      setGuidedDocStatus(nextStatuses);
      setDraftDocumentIds(nextDraftDocumentIds);
      setPerDocExtractedFields(nextPerDocFields);
      setSmartUploadReviewData(prev => ({ ...prev, ...mergedReviewData }));
      setSmartUploadDraft(prev => ({ ...prev, ...mergedDraftData }));
      setSmartUploadFieldOptions(prev => ({ ...prev, ...mergedFieldOptions }));

      // Always land on Step 1 (GST) on initial entry, even when prior
      // draft state shows every step complete. The user can still reach
      // review via the Step 5 navigation. Hydrated statuses, extracted
      // fields, field options, and draftDocumentIds are kept intact so
      // moving forward through the flow surfaces previously saved data.
      setRegistrationEntryStage('smart_steps');
      setGuidedStepIndex(0);
    };

    void hydrateDraft();
    return () => {
      cancelled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [hasRegistrationRecord, isAuthenticated, isLoadingAuth, isPreviewMode, normalizeSmartUploadFields]);

  const hydrateSmartUploadLocationFields = useCallback(async (fields: Record<string, string>) => {
    const hydratedFields = { ...fields };

    if (!hydratedFields.state) {
      return hydratedFields;
    }

    const matchedState = findCaseInsensitiveMatch(
      availableStates.map(item => item.state),
      hydratedFields.state
    );
    if (matchedState) {
      hydratedFields.state = matchedState;
    }

    let districtOptions = availableDistricts;
    if (hydratedFields.district && districtOptions.length === 0 && hydratedFields.state) {
      try {
        districtOptions = await locationsService.getActiveDistrictsByStateName(hydratedFields.state);
        setAvailableDistricts(districtOptions);
      } catch (error) {
        console.warn('[Join] Smart Upload district hydration failed:', error);
      }
    }

    let matchedDistrict: DistrictOption | null = null;
    if (hydratedFields.district && districtOptions.length > 0) {
      matchedDistrict = districtOptions.find(
        district => normalizeComparableValue(district.district_name) === normalizeComparableValue(hydratedFields.district)
      ) ?? null;

      if (matchedDistrict) {
        hydratedFields.district = matchedDistrict.district_name;
      }
    }

    let cityOptions = availableCities;
    if (hydratedFields.city && matchedDistrict && cityOptions.length === 0) {
      try {
        cityOptions = await locationsService.getActiveCitiesByDistrictId(matchedDistrict.district_id);
        setAvailableCities(cityOptions);
      } catch (error) {
        console.warn('[Join] Smart Upload city hydration failed:', error);
      }
    }

    if (hydratedFields.city && cityOptions.length > 0) {
      const matchedCity = cityOptions.find(
        city => normalizeComparableValue(city.city_name) === normalizeComparableValue(hydratedFields.city)
      );
      if (matchedCity) {
        hydratedFields.city = matchedCity.city_name;
      }
    }

    return hydratedFields;
  }, [availableCities, availableDistricts, availableStates]);

  const handleSmartAutofill = useCallback(async (fields: Record<string, string>) => {
    const hydratedFields = await hydrateSmartUploadLocationFields(fields);
    setFormData(prev => applySmartFieldsToJoinData(prev, hydratedFields));
    setIsVerifiedForSubmit(false);
  }, [applySmartFieldsToJoinData, hydrateSmartUploadLocationFields]);

  const handleSmartConflictResolved = useCallback(async (fields: Record<string, string>) => {
    const hydratedFields = await hydrateSmartUploadLocationFields(fields);
    setFormData(prev => applySmartFieldsToJoinData(prev, hydratedFields));
    setIsVerifiedForSubmit(false);
  }, [applySmartFieldsToJoinData, hydrateSmartUploadLocationFields]);

  const smartUploadDraftFieldValues = {
    full_name: smartUploadDraft.full_name ?? formData.full_name,
    date_of_birth: smartUploadDraft.date_of_birth ?? formData.date_of_birth,
    gender: smartUploadDraft.gender ?? formData.gender,
    payment_date: smartUploadDraft.payment_date ?? formData.payment_date,
    transaction_id: smartUploadDraft.transaction_id ?? formData.transaction_id,
    bank_reference: smartUploadDraft.bank_reference ?? formData.bank_reference,
    gst_registered: smartUploadDraft.gst_registered ?? formData.gst_registered,
    gst_number: smartUploadDraft.gst_number ?? formData.gst_number,
    pan_company: smartUploadDraft.pan_company ?? formData.pan_company,
    company_name: smartUploadDraft.company_name ?? formData.company_name,
    company_address: smartUploadDraft.company_address ?? formData.company_address,
    pin_code: smartUploadDraft.pin_code ?? formData.pin_code,
    state: smartUploadDraft.state ?? formData.state,
    district: smartUploadDraft.district ?? formData.district,
    city: smartUploadDraft.city ?? formData.city,
    industry: smartUploadDraft.industry ?? formData.industry,
    activity_type: smartUploadDraft.activity_type ?? formData.activity_type,
    products_services: smartUploadDraft.products_services ?? formData.products_services,
  };

  const currentGuidedDocType: GuidedDocType | null = guidedSelectedDocs[guidedStepIndex] ?? null;
  const currentGuidedDocConfig = currentGuidedDocType ? GUIDED_DOC_CONFIGS[currentGuidedDocType] : null;
  const currentGuidedStatus = currentGuidedDocType ? guidedDocStatus[currentGuidedDocType] : null;
  const guidedTotalSteps = guidedSelectedDocs.length;
  const guidedStepNumber = currentGuidedDocType ? guidedStepIndex + 1 : 0;

  // ── Rules-engine normalization
  // CLAUDE-SMART-UPLOAD-NORMALIZE-RULES-032 wired this in for a fixed
  // 9-key set. CLAUDE-SMART-UPLOAD-NORMALIZATION-DYNAMIC-FIELDS-036
  // makes it dynamic: every available extracted/string field flows to
  // `normalize-member` so any admin-added rule (e.g. `city`) takes
  // effect without a `/join` code change. The runtime applies rules
  // only for keys that have an active rule and passes everything else
  // through unchanged. We never blank-overwrite a non-empty raw value
  // with an empty normalized one. Best-effort: any failure returns the
  // input unchanged so the user is never blocked by a normalization
  // outage.
  const normalizeViaRulesEngine = useCallback(
    async (fields: Record<string, string>): Promise<Record<string, string>> => {
      const payload: Record<string, string> = {};
      for (const [key, rawValue] of Object.entries(fields)) {
        if (!key || key.startsWith('_')) continue;
        // Match the runtime field-key regex so we don't ship invalid
        // keys to the edge function. Pre-existing per-field sanitisers
        // (gst/pan/pin/date/gender/location matching) already ran via
        // `normalizeSmartUploadFields` upstream, so values arriving here
        // are already canonical at the per-field level.
        if (!/^[a-z][a-z0-9_]{1,63}$/.test(key)) continue;
        const v = String(rawValue ?? '').trim();
        if (v) payload[key] = v;
      }
      if (Object.keys(payload).length === 0) return fields;

      try {
        const result = await normalizeMemberData(payload);
        const normalized = (result?.normalized ?? null) as Record<string, string> | null;
        if (!normalized) return fields;

        const merged: Record<string, string> = { ...fields };
        // Iterate over the keys we sent so we don't accidentally
        // surface noise the runtime echoed back. Blank-overwrite guard
        // protects non-empty raw values when the rule is empty / no-op.
        for (const key of Object.keys(payload)) {
          const cleanedRaw = (fields[key] ?? '').trim();
          const cleanedNorm = String(normalized[key] ?? '').trim();
          if (cleanedNorm && cleanedNorm !== cleanedRaw) {
            merged[key] = cleanedNorm;
          }
        }
        return merged;
      } catch (err) {
        console.warn('[Join] rules-engine normalization failed (using raw values):', err);
        return fields;
      }
    },
    [],
  );

  const handleSmartDraftAutofill = useCallback(async (fields: Record<string, string>) => {
    const hydratedFields = await hydrateSmartUploadLocationFields(fields);
    const ruleNormalized = await normalizeViaRulesEngine(hydratedFields);
    setSmartUploadDraft(prev => ({ ...prev, ...ruleNormalized }));
  }, [hydrateSmartUploadLocationFields, normalizeViaRulesEngine]);

  const handleSmartDraftExtractedFields = useCallback(async (fields: Record<string, string>) => {
    const hydratedFields = await hydrateSmartUploadLocationFields(fields);
    const ruleNormalized = await normalizeViaRulesEngine(hydratedFields);
    setSmartUploadReviewData(prev => ({ ...prev, ...ruleNormalized }));
  }, [hydrateSmartUploadLocationFields, normalizeViaRulesEngine]);

  const handleSmartDraftFieldOptionsDetected = useCallback(
    (incoming: Record<string, ExtractedFieldOption[]>) => {
      if (!incoming || Object.keys(incoming).length === 0) return;
      setSmartUploadFieldOptions(prev => {
        const next: Record<string, ExtractedFieldOption[]> = { ...prev };
        for (const [key, options] of Object.entries(incoming)) {
          if (!Array.isArray(options) || options.length === 0) continue;
          const existing = next[key] ?? [];
          const seen = new Set(
            existing.map(opt => opt.value.trim().replace(/\s+/g, ' ').toLowerCase())
          );
          const merged = [...existing];
          for (const opt of options) {
            if (!opt || typeof opt.value !== 'string') continue;
            const value = opt.value.trim();
            if (!value) continue;
            const normalized = value.replace(/\s+/g, ' ').toLowerCase();
            if (seen.has(normalized)) continue;
            seen.add(normalized);
            merged.push({
              value,
              ...(opt.label ? { label: opt.label } : {}),
              ...(opt.source ? { source: opt.source } : {}),
            });
          }
          if (merged.length > 0) next[key] = merged;
        }
        return next;
      });
    },
    []
  );

  const handleSmartDraftConflictResolved = useCallback(async (fields: Record<string, string>) => {
    const hydratedFields = await hydrateSmartUploadLocationFields(fields);
    const ruleNormalized = await normalizeViaRulesEngine(hydratedFields);
    setSmartUploadDraft(prev => ({ ...prev, ...ruleNormalized }));
  }, [hydrateSmartUploadLocationFields, normalizeViaRulesEngine]);

  const moveGuidedStep = useCallback((direction: 'next' | 'back') => {
    if (direction === 'back') {
      setGuidedStepIndex(prev => Math.max(0, prev - 1));
      setGuidedStepMessage('');
      setGuidedStepMessageTone('neutral');
      return;
    }

    if (guidedStepIndex >= guidedSelectedDocs.length - 1) {
      setRegistrationEntryStage('smart_review');
      setGuidedStepMessage('');
      setGuidedStepMessageTone('neutral');
      return;
    }
    setGuidedStepIndex(prev => Math.min(guidedSelectedDocs.length - 1, prev + 1));
    setGuidedStepMessage('');
    setGuidedStepMessageTone('neutral');
  }, [guidedSelectedDocs, guidedStepIndex]);

  const markCurrentGuidedDoc = useCallback((
    status: GuidedDocStatus,
    message = '',
    tone: GuidedStepMessageTone = 'neutral'
  ) => {
    if (!currentGuidedDocType) return;
    setGuidedDocStatus(prev => ({ ...prev, [currentGuidedDocType]: status }));
    setGuidedStepMessage(message);
    setGuidedStepMessageTone(tone);
  }, [currentGuidedDocType]);

  const persistDraftSkip = useCallback(async (
    docType: GuidedDocType,
    skipStatus: 'skipped' | 'no_document',
  ) => {
    try {
      const isExtractOnly = EXTRACT_ONLY_DRAFT_TYPES.has(docType);
      // If we previously saved a stored file for this doc, drop it now so
      // server state matches the user's "skip" intent.
      const existingId = draftDocumentIds[docType];
      if (existingId) {
        await registrationDraftService.deleteDocument(existingId);
        setDraftDocumentIds(prev => {
          const next = { ...prev };
          delete next[docType];
          return next;
        });
      }
      const result = await registrationDraftService.saveDocument({
        expectedDocType: docType as RegistrationDraftExpectedDocType,
        status: skipStatus,
        isExtractOnly,
        extractedFields: {},
        fieldOptions: {},
      });
      if (result.success && result.documentId) {
        setDraftDocumentIds(prev => ({ ...prev, [docType]: result.documentId! }));
      }
    } catch (err) {
      // Best effort — never block the flow on draft persistence failures.
      console.warn('[Join] persistDraftSkip failed:', err);
    }
  }, [draftDocumentIds]);

  const persistDraftExtraction = useCallback(async (
    docType: GuidedDocType,
    event: {
      status: 'extracted' | 'unreadable' | 'failed';
      detectedDocType: DetectedDocType;
      extractedFields: Record<string, string>;
      reasonCode: ReasonCode | null;
      file: File;
    },
  ) => {
    try {
      const isStorable = STORABLE_DRAFT_TYPES.has(docType);
      const isExtractOnly = EXTRACT_ONLY_DRAFT_TYPES.has(docType);
      const optionsForDoc: Record<string, ExtractedFieldOption[]> = {};
      for (const fieldKey of Object.keys(event.extractedFields ?? {})) {
        const opts = smartUploadFieldOptions[fieldKey];
        if (opts && opts.length > 0) optionsForDoc[fieldKey] = opts;
      }

      // Map smart-upload event status to the persistence enum.
      const persistedStatus =
        event.status === 'extracted' ? 'extracted'
        : event.status === 'unreadable' ? 'unreadable'
        : 'failed';

      let storagePath: string | null = null;
      let fileMime: string | null = null;
      let fileSizeBytes: number | null = null;
      let originalFilename: string | null = null;
      let documentIdFromUpload: string | undefined;

      // Replace any prior storage object for this doc-type before re-uploading.
      if (isStorable) {
        const existingId = draftDocumentIds[docType];
        if (existingId) {
          await registrationDraftService.deleteDocument(existingId);
        }
        const upload = await registrationDraftService.uploadDocumentFile(
          docType as RegistrationDraftExpectedDocType,
          event.file,
        );
        if (upload.success) {
          storagePath = upload.storagePath ?? null;
          fileMime = upload.fileMime ?? event.file.type ?? null;
          fileSizeBytes = upload.fileSizeBytes ?? event.file.size ?? null;
          originalFilename = upload.originalFilename ?? event.file.name ?? null;
          documentIdFromUpload = upload.documentId;
        } else {
          console.warn('[Join] draft upload failed (non-blocking):', upload.error);
        }
      }

      // Persist rules-engine-normalized extracted fields (CLAUDE-SMART-UPLOAD-NORMALIZE-RULES-032)
      // so a hydrated draft on resume rehydrates with the same canonical
      // values the UI will render. Best-effort: falls back to raw on error.
      const fieldsForPersist = await normalizeViaRulesEngine(event.extractedFields ?? {});

      const result = await registrationDraftService.saveDocument({
        expectedDocType: docType as RegistrationDraftExpectedDocType,
        status: persistedStatus,
        detectedDocType: event.detectedDocType ?? null,
        reasonCode: event.reasonCode ?? null,
        isExtractOnly,
        storagePath,
        fileMime,
        fileSizeBytes,
        originalFilename,
        extractedFields: fieldsForPersist,
        fieldOptions: optionsForDoc,
        selectedOptions: {},
      });
      const finalDocId = result.documentId ?? documentIdFromUpload;
      if (result.success && finalDocId) {
        setDraftDocumentIds(prev => ({ ...prev, [docType]: finalDocId }));
      }
    } catch (err) {
      console.warn('[Join] persistDraftExtraction failed:', err);
    }
  }, [draftDocumentIds, normalizeViaRulesEngine, smartUploadFieldOptions]);

  const handleGuidedSkipCurrent = useCallback(() => {
    if (!currentGuidedDocType) return;
    let skipStatus: 'skipped' | 'no_document' = 'skipped';
    if (currentGuidedDocType === 'gst_certificate') {
      setFormData(prev => ({
        ...prev,
        gst_registered: 'no',
        gst_number: '',
      }));
      handleFileChange('gstCertificate', null);
      markCurrentGuidedDoc('no_document');
      skipStatus = 'no_document';
    } else if (currentGuidedDocType === 'udyam_certificate') {
      handleFileChange('udyamCertificate', null);
      markCurrentGuidedDoc('skipped');
    } else {
      markCurrentGuidedDoc('skipped');
    }
    setPerDocExtractedFields(prev => {
      const next = { ...prev };
      delete next[currentGuidedDocType];
      return next;
    });
    void persistDraftSkip(currentGuidedDocType, skipStatus);
    setIsVerifiedForSubmit(false);
    setGuidedStepMessage('');
    setGuidedStepMessageTone('neutral');
    moveGuidedStep('next');
  }, [currentGuidedDocType, handleFileChange, markCurrentGuidedDoc, moveGuidedStep, persistDraftSkip]);

  const handleGuidedDocumentProcessed = useCallback((event: {
    status: 'extracted' | 'unreadable' | 'failed';
    detectedDocType: DetectedDocType;
    extractedFields: Record<string, string>;
    reasonCode: ReasonCode | null;
    file: File;
  }) => {
    if (!currentGuidedDocType || registrationEntryStage !== 'smart_steps') {
      return;
    }

    // Capture per-doc extracted fields for the inline review panel,
    // regardless of whether the doc is storable or extract-only.
    // Run the rules-engine normalization (CLAUDE-SMART-UPLOAD-NORMALIZE-RULES-032)
    // so the panel shows canonical, form-compatible values.
    if (event.status === 'extracted' && event.extractedFields) {
      const docTypeForUpdate = currentGuidedDocType;
      void (async () => {
        const normalized = await normalizeViaRulesEngine({ ...event.extractedFields });
        setPerDocExtractedFields(prev => ({
          ...prev,
          [docTypeForUpdate]: normalized,
        }));
      })();
    }

    if (currentGuidedDocType === 'payment_proof') {
      if (event.status === 'failed') {
        setGuidedStepMessage('Payment proof upload failed. Please retry.');
        setGuidedStepMessageTone('error');
        void persistDraftExtraction(currentGuidedDocType, event);
        return;
      }
      // Payment proof upload itself counts for submit gating; extraction can be unreadable.
      handleFileChange('paymentProof', event.file);
      if (event.status === 'unreadable') {
        markCurrentGuidedDoc('unreadable_confirmed', 'Payment proof uploaded. Extraction was unreadable; you can fill payment details manually.', 'error');
      } else {
        markCurrentGuidedDoc('completed', 'Payment proof uploaded and processed.', 'success');
      }
      void persistDraftExtraction(currentGuidedDocType, event);
      return;
    }

    if (event.status === 'failed' || event.status === 'unreadable') {
      setGuidedStepMessage('Document could not be read clearly. Retry or skip this step.');
      setGuidedStepMessageTone('error');
      void persistDraftExtraction(currentGuidedDocType, event);
      return;
    }

    if (event.detectedDocType === currentGuidedDocType) {
      markCurrentGuidedDoc('completed', `${GUIDED_DOC_CONFIGS[currentGuidedDocType].label} processed.`, 'success');
      void persistDraftExtraction(currentGuidedDocType, event);
      return;
    }

    setGuidedStepMessage(
      `Uploaded document was detected as ${
        event.detectedDocType === 'unknown' ? 'Unknown' : event.detectedDocType.replace(/_/g, ' ')
      }. Please upload a valid ${GUIDED_DOC_CONFIGS[currentGuidedDocType].label}.`
    );
    setGuidedStepMessageTone('error');
    // Persist the wrong-doc detection so the draft reflects user's last
    // attempt; skip storage upload (file is not what they expected).
    void persistDraftExtraction(currentGuidedDocType, { ...event, status: 'failed' });
  }, [currentGuidedDocType, handleFileChange, markCurrentGuidedDoc, normalizeViaRulesEngine, persistDraftExtraction, registrationEntryStage]);

  const canAdvanceCurrentGuidedStep = (() => {
    if (!currentGuidedDocType || !currentGuidedStatus) return false;
    if (currentGuidedDocType === 'payment_proof') {
      return (
        currentGuidedStatus === 'skipped' ||
        currentGuidedStatus === 'completed' || currentGuidedStatus === 'unreadable_confirmed'
      ) || Boolean(files.paymentProof);
    }
    return currentGuidedStatus === 'completed' || currentGuidedStatus === 'skipped' || currentGuidedStatus === 'no_document';
  })();

  // Single Next handler that replaces the previous Skip + Continue pattern.
  // - If the step is already in an advanceable state, just move forward.
  // - Otherwise, for non-payment optional docs, auto-skip via the existing
  //   skip pipeline (which handles persistence and advance).
  // - On payment_proof, we always allow advancing to review; the final
  //   submit gate (validateForm) still requires the file before submission.
  const handleGuidedNext = useCallback(() => {
    if (!currentGuidedDocType) return;
    if (canAdvanceCurrentGuidedStep) {
      moveGuidedStep('next');
      return;
    }
    if (currentGuidedDocType === 'payment_proof') {
      moveGuidedStep('next');
      return;
    }
    // GST / Udyam / PAN / Aadhaar — auto-skip when the user has not done
    // anything actionable on this step yet.
    handleGuidedSkipCurrent();
  }, [canAdvanceCurrentGuidedStep, currentGuidedDocType, handleGuidedSkipCurrent, moveGuidedStep]);

  const handleContinueFromSmartDraft = useCallback(async () => {
    if (Object.keys(smartUploadDraft).length > 0) {
      const hydratedFields = await hydrateSmartUploadLocationFields(smartUploadDraft);
      setFormData(prev => applySmartFieldsToJoinData(prev, hydratedFields));
    }
    setSmartUploadDraft({});
    setSmartUploadReviewData({});
    setSmartUploadFieldOptions({});
    setGuidedStepMessage('');
    setGuidedStepMessageTone('neutral');
    setRegistrationEntryStage('form');
    setIsVerifiedForSubmit(false);
  }, [applySmartFieldsToJoinData, hydrateSmartUploadLocationFields, smartUploadDraft]);

  /**
   * Display-format a Smart Upload review value. Date fields render via the
   * configured portal date format. All other fields render raw.
   * Internal/canonical values stored in `smartUploadReviewData` and `smartUploadDraft`
   * are not mutated — this is presentation-only.
   */
  const handleSmartUploadCandidateSelect = useCallback(
    (fieldKey: string, value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setSmartUploadReviewData(prev => ({ ...prev, [fieldKey]: trimmed }));
      setSmartUploadDraft(prev => ({ ...prev, [fieldKey]: trimmed }));
    },
    []
  );

  const formatSmartUploadReviewValue = useCallback((fieldKey: string, value: string) => {
    if (!value) return value;
    if (SMART_UPLOAD_DATE_FIELD_KEYS.has(fieldKey)) {
      return formatDateValue(value) || value;
    }
    return value;
  }, []);

  const getSmartUploadReviewSourceText = useCallback((fieldKey: string, extractedValue: string) => {
    const currentValue = String(formData[fieldKey as keyof JoinFormData] ?? '').trim();
    if (!currentValue) {
      return 'From your document';
    }

    const currentComparable = normalizeComparableValue(currentValue);
    const extractedComparable = normalizeComparableValue(extractedValue);
    if (currentComparable === extractedComparable) {
      return 'Matches your account';
    }

    if (fieldKey === 'gender') {
      return 'Replaces your earlier entry';
    }

    return 'Different from your earlier entry';
  }, [formData]);

  const handleSmartFileReady = useCallback(
    (slot: 'paymentProof' | 'gstCertificate' | 'udyamCertificate', file: File) => {
      handleFileChange(slot, file);
    },
    // handleFileChange is stable (no deps) — safe to omit
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      showToast('error', validation.error || 'Invalid file');
      e.target.value = '';
      return;
    }

    try {
      const imageSrc = await readFileAsDataURL(file);
      setPhotoImageSrc(imageSrc);
      setIsCropModalOpen(true);
    } catch {
      showToast('error', 'Failed to read image file');
      e.target.value = '';
    }
  };

  const handleCropComplete = (croppedImageBlob: Blob) => {
    setProfilePhoto(croppedImageBlob);
    setPhotoFileName(generatePhotoFileName());
    setIsVerifiedForSubmit(false);

    const previewUrl = URL.createObjectURL(croppedImageBlob);
    setProfilePhotoPreview(previewUrl);

    showToast('success', 'Photo cropped successfully');
  };

  const handleRemovePhoto = () => {
    setProfilePhoto(null);
    setProfilePhotoPreview('');
    setPhotoFileName('');
    setPhotoImageSrc('');
    setIsVerifiedForSubmit(false);

    const fileInput = document.getElementById('profile-photo-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleCropError = (error: string) => {
    showToast('error', error);
  };

  const validateForm = async (dataToValidate: JoinFormData = formData): Promise<boolean> => {
    console.log('[Join.tsx] Starting form validation...');
    const newErrors: { [key: string]: string } = {};

    // Define all fields with their labels for validation
    const allFields = [
      { field: 'full_name', label: 'Full Name' },
      { field: 'email', label: 'Email' },
      { field: 'mobile_number', label: 'Mobile Number' },
      { field: 'date_of_birth', label: 'Date of Birth' },
      { field: 'gender', label: 'Gender' },
      { field: 'company_name', label: 'Company Name' },
      { field: 'company_designation_id', label: 'Designation' },
      { field: 'state', label: 'State' },
      { field: 'district', label: 'District' },
      { field: 'city', label: 'City/Town/Village' },
      { field: 'pin_code', label: 'PIN Code' },
      { field: 'company_address', label: 'Company Address' },
      { field: 'industry', label: 'Industry' },
      { field: 'activity_type', label: 'Activity Type' },
      { field: 'constitution', label: 'Industry Constitution' },
      { field: 'annual_turnover', label: 'Annual Turnover' },
      { field: 'number_of_employees', label: 'Number of Employees' },
      { field: 'products_services', label: 'Products & Services' },
      { field: 'brand_names', label: 'Brand Names' },
      { field: 'website', label: 'Website' },
      { field: 'gst_registered', label: 'GST Registered' },
      { field: 'gst_number', label: 'GST Number' },
      { field: 'gst_certificate_url', label: 'GST Certificate' },
      { field: 'pan_company', label: 'PAN (Company)' },
      { field: 'esic_registered', label: 'ESIC Registered' },
      { field: 'epf_registered', label: 'EPF Registered' },
      { field: 'udyam_certificate_url', label: 'UDYAM Certificate' },
      { field: 'amount_paid', label: 'Amount Paid' },
      { field: 'payment_date', label: 'Payment Date' },
      { field: 'payment_mode', label: 'Payment Mode' },
      { field: 'payment_proof_url', label: 'Payment Proof' },
      { field: 'transaction_id', label: 'Transaction ID / Reference' },
      { field: 'bank_reference', label: 'Bank Reference' },
      { field: 'alternate_contact_name', label: 'Alternate Contact Name' },
      { field: 'alternate_mobile', label: 'Alternate Mobile' },
      { field: 'referred_by', label: 'Referred By' }
    ];

    // Check required fields based on configuration
    // Skip 'city' field here as it requires conditional validation based on is_custom_city
    allFields.forEach(({ field, label }) => {
      // Skip city field - handle it separately below due to conditional logic
      if (field === 'city') return;

      const value = field === 'gst_certificate_url'
        ? files.gstCertificate
        : field === 'udyam_certificate_url'
          ? files.udyamCertificate
          : field === 'payment_proof_url'
            ? files.paymentProof
            : dataToValidate[field as keyof JoinFormData];
      if (isFieldRequired(field) && isFieldApplicable(field, dataToValidate)) {
        if (
          !value ||
          (typeof value === 'string' && value.toString().trim() === '')
        ) {
          newErrors[field] = `${label} is required`;
        }
      }
    });

    // Product requirement: payment proof must exist before final submit,
    // even when users choose to fill the form manually first.
    if (!isPreviewMode && !files.paymentProof) {
      newErrors.payment_proof_url = 'Payment Proof is required';
    }

    // Conditional city validation based on is_custom_city flag
    // This handles both standard city selection and custom "Other" city entry
    if (isFieldRequired('city') && isFieldApplicable('city', dataToValidate)) {
      if (dataToValidate.is_custom_city) {
        // Custom city mode: "Other" was selected
        // Validate that other_city_name is provided
        const customCityName = (dataToValidate.other_city_name || '').trim();
        if (customCityName === '') {
          newErrors.city = 'Please enter a city/town/village name';
        }
      } else {
        // Standard city mode: a city from the dropdown should be selected
        // Validate that city field is populated
        const cityValue = (dataToValidate.city || '').trim();
        if (cityValue === '') {
          newErrors.city = 'City/Town/Village is required';
        }
      }
    }

    // If there are missing required fields, set the form error message
    if (Object.keys(newErrors).length > 0) {
      console.log('[Join.tsx] Validation failed - missing required fields:', Object.keys(newErrors));
      setFormErrorMessage('Please fill in all required fields marked below');
      latestErrorsRef.current = newErrors;
      setErrors(newErrors);
      return false;
    }

    // Clear form error message if all required fields are filled
    setFormErrorMessage('');

    // Dynamic validation: Loop through all form fields and validate those with assigned validation rules
    console.log('[Join.tsx] Starting dynamic field validation based on database mappings');

    for (const fieldName of Object.keys(dataToValidate)) {
      // Skip internal implementation fields that are not configured in form_field_configurations
      // other_city_name is validated indirectly through the city conditional validation block above
      // is_custom_city is a boolean flag, not a field requiring validation
      if (fieldName === 'other_city_name' || fieldName === 'is_custom_city') {
        continue;
      }

      if (!isFieldApplicable(fieldName, dataToValidate)) {
        continue;
      }

      const fieldValue = dataToValidate[fieldName as keyof JoinFormData];

      // Only validate fields that have a value
      if (fieldValue && fieldValue.toString().trim() !== '') {
        const trimmedValue = fieldValue.toString().trim();
        const charCount = trimmedValue.length;
        const minLen = getFieldMinLength(fieldName);
        const maxLen = getFieldMaxLength(fieldName);
        const label = getFieldLabel(fieldName);

        if (maxLen !== null && charCount > maxLen) {
          newErrors[fieldName] = `${label} must be at most ${maxLen} characters`;
          continue;
        } else if (minLen !== null && charCount < minLen) {
          newErrors[fieldName] = `${label} must be at least ${minLen} characters`;
          continue;
        }

        console.log(`[Join.tsx] Validating field '${fieldName}'`);

        try {
          // Pass field name directly - validation system will look up the rule internally
          const validationResult = await validateFieldByRule(fieldName, fieldValue.toString());

          if (!validationResult.isValid) {
            newErrors[fieldName] = validationResult.message;
            console.log(`[Join.tsx] Validation failed for '${fieldName}': ${validationResult.message}`);
          } else {
            console.log(`[Join.tsx] Validation passed for '${fieldName}'`);
          }
        } catch (error) {
          console.error(`[Join.tsx] Error validating field '${fieldName}':`, error);
        }
      }
    }

    latestErrorsRef.current = newErrors;
    setErrors(newErrors);

    // Show toast message if there are validation errors
    if (Object.keys(newErrors).length > 0) {
      console.log('[Join.tsx] Validation failed - field errors:', Object.keys(newErrors));
      showToast('error', 'Please fix the errors in the form before submitting');
    } else {
      console.log('[Join.tsx] Form validation passed successfully');
    }

    return Object.keys(newErrors).length === 0;
  };

  const sanitizeFormData = (data: JoinFormData) => {
    console.log('[Join.tsx] Sanitizing form data before submission');
    console.log('[Join.tsx] is_custom_city flag:', data.is_custom_city);
    console.log('[Join.tsx] city value:', data.city || 'null');
    console.log('[Join.tsx] other_city_name value:', data.other_city_name || 'null');

    const sanitized = {
      ...data,
      city: data.city as string | null,
      other_city_name: data.other_city_name as string | null,
      company_designation_id: data.company_designation_id as string | null,
      date_of_birth: data.date_of_birth as string | null,
      payment_date: data.payment_date as string | null,
      gst_registered: data.gst_registered as string | null,
      esic_registered: data.esic_registered as string | null,
      epf_registered: data.epf_registered as string | null,
      gender: data.gender as string | null
    };

    const clearWhenHiddenFields: Array<keyof JoinFormData> = [
      'full_name',
      'gender',
      'date_of_birth',
      'company_name',
      'company_designation_id',
      'company_address',
      'district',
      'city',
      'other_city_name',
      'pin_code',
      'industry',
      'activity_type',
      'constitution',
      'annual_turnover',
      'number_of_employees',
      'products_services',
      'brand_names',
      'website',
      'gst_registered',
      'gst_number',
      'pan_company',
      'esic_registered',
      'epf_registered',
      'referred_by',
      'amount_paid',
      'payment_date',
      'payment_mode',
      'transaction_id',
      'bank_reference',
      'alternate_contact_name',
      'alternate_mobile'
    ];

    clearWhenHiddenFields.forEach((fieldName) => {
      const visibilityField = fieldName === 'other_city_name' ? 'city' : fieldName;
      if (!isFieldApplicable(visibilityField, sanitized)) {
        sanitized[fieldName] = '';
      }
    });

    // Handle custom city: when is_custom_city is true, set city to null
    // The custom city name is stored in other_city_name field
    // CRITICAL: Explicitly preserve the is_custom_city flag to ensure it's saved to database
    if (!isFieldApplicable('city', sanitized)) {
      sanitized.city = null;
      sanitized.other_city_name = null;
      sanitized.is_custom_city = false;
    } else if (sanitized.is_custom_city === true) {
      console.log('[Join.tsx] Custom city detected, setting city to null and preserving other_city_name');
      sanitized.city = null;
      // Ensure other_city_name has a value when is_custom_city is true
      if (!sanitized.other_city_name || sanitized.other_city_name.trim() === '') {
        console.error('[Join] VALIDATION ERROR: is_custom_city is true but other_city_name is empty');
      }
    } else {
      console.log('[Join.tsx] Standard city selected, clearing other_city_name');
      // When is_custom_city is false, clear other_city_name to maintain data integrity
      sanitized.other_city_name = null;
      // Explicitly set is_custom_city to false to ensure it's not undefined
      sanitized.is_custom_city = false;
    }

    // Convert empty strings to null for UUID fields
    // UUID fields cannot be empty strings in PostgreSQL, they must be null or a valid UUID
    if (sanitized.company_designation_id === '' || sanitized.company_designation_id === undefined) {
      sanitized.company_designation_id = null;
    }

    // Convert empty strings to null for date fields
    // Date fields cannot be empty strings in PostgreSQL, they must be null or a valid date
    if (sanitized.date_of_birth === '' || sanitized.date_of_birth === undefined) {
      sanitized.date_of_birth = null;
    }

    if (sanitized.payment_date === '' || sanitized.payment_date === undefined) {
      sanitized.payment_date = null;
    }

    // Convert empty strings to null for registration status fields
    // These fields have CHECK constraints that allow NULL or specific values ('yes'/'no', 'male'/'female')
    // Empty strings from unfilled optional fields must be converted to NULL to pass database validation
    if (sanitized.gst_registered === '' || sanitized.gst_registered === undefined) {
      sanitized.gst_registered = null;
    }

    if (sanitized.esic_registered === '' || sanitized.esic_registered === undefined) {
      sanitized.esic_registered = null;
    }

    if (sanitized.epf_registered === '' || sanitized.epf_registered === undefined) {
      sanitized.epf_registered = null;
    }

    if (sanitized.gender === '' || sanitized.gender === undefined) {
      sanitized.gender = null;
    }

    return sanitized;
  };

  const submitFormData = async (dataToSubmit: JoinFormData) => {
    console.log('[Join.tsx] Starting form data submission');

    // Proceed with validation and submission
    const isValid = await validateForm(dataToSubmit);
    if (!isValid) {
      console.log('[Join.tsx] Form validation failed, aborting submission');
      // validateForm already shows appropriate toast message
      return;
    }

    try {
      setIsSubmitting(true);
      console.log('[Join.tsx] Checking for duplicate email and mobile...');

      // Check for duplicate email/mobile
      const emailExists = await urlUtils.checkEmailExists(dataToSubmit.email);
      if (emailExists) {
        console.log('[Join.tsx] Duplicate email found, aborting submission');
        showToast('error', 'An account with this email already exists');
        return;
      }
      console.log('[Join.tsx] Email check passed');

      const mobileExists = await urlUtils.checkMobileExists(dataToSubmit.mobile_number);
      if (mobileExists) {
        console.log('[Join.tsx] Duplicate mobile number found, aborting submission');
        showToast('error', 'An account with this mobile number already exists');
        return;
      }
      console.log('[Join.tsx] Mobile number check passed');

      // Prepare registration data and sanitize empty strings to null
      const sanitizedData = sanitizeFormData(dataToSubmit);
      console.log('[Join.tsx] Form data sanitized successfully');

      // Validate custom city data before submission
      if (sanitizedData.is_custom_city === true) {
        console.log('[Join.tsx] Validating custom city data before submission...');
        if (!sanitizedData.other_city_name || sanitizedData.other_city_name.trim() === '') {
          console.log('[Join.tsx] Custom city validation failed - other_city_name is empty');
          showToast('error', 'Please enter a city/town/village name');
          return;
        }
        if (sanitizedData.city !== null) {
          console.error('[Join] DATA INTEGRITY ERROR: is_custom_city is true but city is not null', {
            city: sanitizedData.city,
            other_city_name: sanitizedData.other_city_name
          });
        }
        console.log('[Join.tsx] Custom city validation passed');
      }

      // Link submission to authenticated user if available
      if (isAuthenticated && member && member.user_id) {
        sanitizedData.user_id = member.user_id;
        console.log('[Join] Linking submission to authenticated user:', member.user_id);
      } else {
        console.log('[Join] Submitting as unauthenticated user (no user_id link)');
      }

      // Submit registration
      console.log('[Join.tsx] Submitting registration to backend...');
      const submissionFiles = {
        ...files,
        profilePhoto,
        gstCertificate: isFieldApplicable('gst_certificate_url', sanitizedData) ? files.gstCertificate : null,
        udyamCertificate: isFieldApplicable('udyam_certificate_url', sanitizedData) ? files.udyamCertificate : null,
        paymentProof: isFieldApplicable('payment_proof_url', sanitizedData) ? files.paymentProof : null
      };

      const result = await memberRegistrationService.submitRegistration(
        sanitizedData,
        submissionFiles,
        photoFileName
      );

      if (result.success) {
        console.log('[Join.tsx] Registration submitted successfully');
        showToast('success', 'Registration submitted successfully! You will receive a confirmation email once approved.');

        try {
          await refreshMember();
        } catch (error) {
          console.error('[Join.tsx] Failed to refresh member data after registration:', error);
        }

        // Navigate to success page or home after a delay
        setTimeout(() => {
          navigate('/dashboard/profile');
        }, 3000);
      } else {
        console.log('[Join.tsx] Registration submission failed:', result.error);
        // Map technical errors to user-friendly messages
        let errorMessage = result.error || 'Failed to submit registration';

        if (errorMessage.includes('date') || errorMessage.includes('Date')) {
          errorMessage = 'Please check the date fields and ensure they are filled correctly';
        } else if (errorMessage.includes('uuid') || errorMessage.includes('UUID')) {
          errorMessage = 'There was an issue with one of the selected options. Please try again';
        } else if (errorMessage.includes('null value') || errorMessage.includes('NOT NULL')) {
          errorMessage = `Unable to submit registration. Please check all fields and try again. Error: ${result.error}`;
        }

        showToast('error', errorMessage);
      }
    } catch (error) {
      console.error('Registration error:', error);

      // Provide user-friendly error message
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';

      if (errorMessage.includes('date') || errorMessage.includes('Date')) {
        showToast('error', 'Please check the date fields and ensure they are filled correctly');
      } else if (errorMessage.includes('uuid') || errorMessage.includes('UUID')) {
        showToast('error', 'There was an issue with one of the selected options. Please try again');
      } else if (errorMessage.includes('null value') || errorMessage.includes('NOT NULL')) {
        showToast('error', `Unable to submit registration. Please check all fields and try again. Error: ${errorMessage}`);
      } else {
        showToast('error', 'An unexpected error occurred. Please try again');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const normalizeResultAdapter = (raw: unknown, fallbackOriginal: typeof formData): NormalizationResult => {
    if (raw && typeof raw === 'object') {
      const candidate = raw as {
        original?: unknown;
        normalized?: unknown;
        data?: {
          original?: unknown;
          normalized?: unknown;
        };
      };

      if (candidate.original && typeof candidate.original === 'object' && candidate.normalized && typeof candidate.normalized === 'object') {
        return candidate as NormalizationResult;
      }

      if (
        candidate.data &&
        candidate.data.original &&
        typeof candidate.data.original === 'object' &&
        candidate.data.normalized &&
        typeof candidate.data.normalized === 'object'
      ) {
        return candidate.data as NormalizationResult;
      }
    }

    return {
      original: fallbackOriginal,
      normalized: {
        full_name: fallbackOriginal.full_name,
        email: fallbackOriginal.email,
        mobile_number: fallbackOriginal.mobile_number,
        company_name: fallbackOriginal.company_name,
        company_address: fallbackOriginal.company_address,
        products_services: fallbackOriginal.products_services,
        alternate_contact_name: fallbackOriginal.alternate_contact_name,
        alternate_mobile: fallbackOriginal.alternate_mobile,
        referred_by: fallbackOriginal.referred_by
      }
    };
  };

  const handleVerify = async () => {
    console.log('[Join.tsx] Verification started');

    if (isPreviewMode) {
      showToast('error', 'Preview mode is read-only.');
      return;
    }

    if (isLoadingConfig) {
      showToast('error', 'Please wait while the form loads.');
      return;
    }

    if (!hasFormChanges()) {
      showToast('error', 'Please make changes before verifying.');
      return;
    }

    setIsVerifying(true);
    try {
      const isValid = await validateForm(formData);
      if (!isValid) {
        scrollToFirstError(latestErrorsRef.current);
        return;
      }

      const normalizationPayload: Record<string, string> = {};
      const normalizationFields: Array<keyof JoinFormData> = [
        'full_name',
        'company_name',
        'company_address',
        'products_services',
        'alternate_contact_name',
        'referred_by'
      ];

      normalizationFields.forEach((fieldName) => {
        if (!isFieldApplicable(fieldName, formData)) {
          return;
        }
        const value = String(formData[fieldName] ?? '').trim();
        if (value) {
          normalizationPayload[fieldName] = value;
        }
      });

      const raw = await normalizeMemberData(normalizationPayload);
      const adapted = normalizeResultAdapter(raw, formData);

      adapted.original.email = formData.email;
      adapted.original.mobile_number = formData.mobile_number;
      adapted.original.alternate_mobile = formData.alternate_mobile;
      adapted.normalized.email = formData.email;
      adapted.normalized.mobile_number = formData.mobile_number;
      adapted.normalized.alternate_mobile = formData.alternate_mobile;

      const correctedFields = getCorrectionFields(adapted);

      if (correctedFields.length === 0) {
        setIsVerifiedForSubmit(true);
        focusSubmitButton();
        showToast('success', 'Your details are ready. Please click Submit.');
        return;
      }

      setNormalizationOriginalSnapshot(formData);
      setCorrectionFields(correctedFields);
      setShowCorrectionStepper(true);
    } catch (error) {
      console.error('[Join.tsx] Verification failed:', error);
      setIsVerifiedForSubmit(false);
      showToast('error', 'This is a technical error. Please contact system Admin');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isPreviewMode) {
      showToast('error', 'Preview mode is read-only.');
      return;
    }

    if (!isVerifiedForSubmit) {
      showToast('error', 'Please click Verify before submitting.');
      return;
    }

    await submitFormData(formData);
  };

  const handleFieldConfirmed = useCallback((fieldName: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
  }, []);

  const handleCorrectionComplete = useCallback(() => {
    setShowCorrectionStepper(false);
    setCorrectionFields([]);
    setIsVerifiedForSubmit(true);
    focusSubmitButton();
    showToast('success', 'Your details are ready. Please click Submit.');
  }, [focusSubmitButton, showToast]);

  const handleCorrectionDiscard = useCallback(() => {
    setShowCorrectionStepper(false);
    setCorrectionFields([]);
    setIsVerifiedForSubmit(false);
    if (normalizationOriginalSnapshot) {
      setFormData(normalizationOriginalSnapshot);
    }
  }, [normalizationOriginalSnapshot]);

  const isBlockingAuthLoad =
    !isPreviewMode &&
    (isLoadingAuth || isCheckingExisting || (isAuthenticated && hasRegistrationRecord === null && !registrationStatusError));

  if (registrationStatusError) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-card rounded-lg shadow-sm border border-destructive/30 p-8 text-center">
            <h1 className="text-2xl font-semibold text-foreground mb-3">Registration status unavailable</h1>
            <p className="text-muted-foreground mb-6">{registrationStatusError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state while loading form config/validation and (for normal mode) auth checks.
  if (isLoadingConfig || isLoadingValidation || isBlockingAuthLoad) {
    return (
      <div className="flex items-center justify-center min-h-screen py-8">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">
            {isBlockingAuthLoad && isLoadingAuth ? 'Checking authentication...' :
             isBlockingAuthLoad && isCheckingExisting ? 'Checking registration status...' :
             'Loading form...'}
          </p>
        </div>
      </div>
    );
  }

  if (previewBlockReason) {
    const message = previewBlockReason === 'access_denied'
      ? "You don't have permission to preview form drafts."
      : 'Draft preview could not be loaded. Please try again or contact your administrator.';

    return (
      <div className="min-h-screen py-12 px-4 flex items-center justify-center">
        <div className="max-w-md w-full text-center space-y-4">
          <Lock className="w-10 h-10 text-muted-foreground/50 mx-auto" />
          <p className="text-sm font-medium text-foreground">{message}</p>
          <Link to="/" className="text-sm text-primary hover:text-primary/80">Back to Home</Link>
        </div>
      </div>
    );
  }

  const shouldShowRegistrationEntryStage =
    !isPreviewMode &&
    hasRegistrationRecord === false &&
    registrationEntryStage !== 'form';
  // Aadhaar-style identity context is detected whenever smart upload produced a
  // full name or date of birth. When that context is present but gender was
  // not extracted, we surface a clear notice so the member knows to pick it
  // themselves on the final registration form.
  const smartUploadIdentityContext = Boolean(
    (smartUploadReviewData.full_name ?? '').trim() || (smartUploadReviewData.date_of_birth ?? '').trim()
  );
  // Map review-screen warnings to the doc types whose extraction would
  // legitimately supply that field. Mirrors SmartUploadDocument's
  // FIELD_SOURCE_PRIORITY but kept narrow to the fields that actually
  // raise review warnings today.
  const FIELD_WARNING_CONTRIBUTORS: Partial<Record<string, GuidedDocType[]>> = {
    gender: ['aadhaar_card'],
  };
  // A contributing doc counts as "actually uploaded and processed" when
  // its guided status is 'completed' or 'unreadable_confirmed'. Skipped /
  // no_document / pending do not justify a missing-field warning, because
  // the user never gave us a chance to extract that field.
  const isWarningRelevantForField = (fieldKey: string): boolean => {
    const contributors = FIELD_WARNING_CONTRIBUTORS[fieldKey];
    if (!contributors || contributors.length === 0) return false;
    return contributors.some((docType) => {
      const status = guidedDocStatus[docType];
      return status === 'completed' || status === 'unreadable_confirmed';
    });
  };
  const smartUploadGenderMissing =
    smartUploadIdentityContext &&
    !(smartUploadReviewData.gender ?? '').trim() &&
    isWarningRelevantForField('gender');
  const smartUploadDraftEntries = Object.entries(smartUploadReviewData)
    .filter(([, value]) => value.trim() !== '');

  return (
    <div className="min-h-screen py-8">
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Member Registration</h1>
          <p className="text-muted-foreground">Complete your membership registration</p>
        </div>

        {/* Registration Form */}
        <div className="bg-card rounded-lg shadow-sm p-8">
          {shouldShowRegistrationEntryStage ? (
            registrationEntryStage === 'smart_steps' ? (
              <div className="space-y-6">
                {currentGuidedDocConfig ? (
                  <div className="space-y-3">
                    {/* Compact progress stepper */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {GUIDED_DOC_ORDER.map((docType, idx) => {
                        const isCurrent = idx === guidedStepIndex;
                        const isCompleted = idx < guidedStepIndex;
                        const shortLabels: Record<GuidedDocType, string> = {
                          gst_certificate: 'GST',
                          udyam_certificate: 'Udyam',
                          pan_card: 'PAN',
                          aadhaar_card: 'Aadhaar',
                          payment_proof: 'Payment',
                        };
                        return (
                          <React.Fragment key={docType}>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition-all ${
                                  isCurrent
                                    ? 'bg-primary text-primary-foreground ring-2 ring-primary/25 shadow-sm'
                                    : isCompleted
                                      ? 'bg-primary/15 text-primary'
                                      : 'bg-muted text-muted-foreground'
                                }`}
                                aria-current={isCurrent ? 'step' : undefined}
                              >
                                {isCompleted ? '✓' : idx + 1}
                              </span>
                              <span
                                className={`hidden sm:inline text-xs font-medium ${
                                  isCurrent
                                    ? 'text-foreground'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                {shortLabels[docType]}
                              </span>
                            </div>
                            {idx < GUIDED_DOC_ORDER.length - 1 && (
                              <span
                                aria-hidden="true"
                                className={`h-px flex-1 min-w-[8px] ${
                                  isCompleted ? 'bg-primary/40' : 'bg-border'
                                }`}
                              />
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>

                    {/* Now-uploading focus card */}
                    <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/80">
                        Now uploading · Step {guidedStepNumber} of {guidedTotalSteps}
                      </p>
                      <h2 className="mt-1 text-lg sm:text-xl font-semibold text-foreground">
                        {currentGuidedDocConfig.label}
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {currentGuidedDocConfig.guidance}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
                    <h2 className="text-section font-semibold text-foreground mb-2">Smart Upload-assisted registration</h2>
                    <p className="text-sm text-muted-foreground">Upload your selected documents in sequence.</p>
                  </div>
                )}

                <SmartUploadDocument
                  formFieldValues={smartUploadDraftFieldValues}
                  onAutofill={handleSmartDraftAutofill}
                  onConflictResolved={handleSmartDraftConflictResolved}
                  onFileReady={handleSmartFileReady}
                  onExtractedFieldsDetected={handleSmartDraftExtractedFields}
                  onExtractedFieldOptionsDetected={handleSmartDraftFieldOptionsDetected}
                  onDocumentProcessed={handleGuidedDocumentProcessed}
                  selectedDocType={currentGuidedDocType ?? 'unknown'}
                  forceDocumentPrecedenceFields={['gender']}
                  normalizeExtractedFields={normalizeSmartUploadFields}
                  disableConflictModal={registrationEntryStage === 'smart_steps'}
                  disabled={false}
                />

                {guidedStepMessage && (
                  <p className={`text-xs ${
                    guidedStepMessageTone === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : guidedStepMessageTone === 'success'
                        ? 'text-green-700 dark:text-green-400'
                        : 'text-muted-foreground'
                  }`}>
                    {guidedStepMessage}
                  </p>
                )}

                <div className="flex flex-row gap-3 justify-between items-center">
                  <button
                    type="button"
                    onClick={() => moveGuidedStep('back')}
                    disabled={guidedStepIndex === 0}
                    className={`inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors ${
                      guidedStepIndex === 0
                        ? 'text-muted-foreground/60 cursor-not-allowed'
                        : 'text-foreground hover:bg-muted/50'
                    }`}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={handleGuidedNext}
                    className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    {guidedStepIndex >= guidedSelectedDocs.length - 1 ? 'Review Details' : 'Next'}
                  </button>
                </div>

                {currentGuidedDocType && perDocExtractedFields[currentGuidedDocType] && (() => {
                  const fields = perDocExtractedFields[currentGuidedDocType] ?? {};
                  const entries = Object.entries(fields).filter(([, v]) => String(v ?? '').trim() !== '');
                  if (entries.length === 0) return null;
                  return (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                      <div className="flex items-center justify-between gap-2 mb-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/80">
                          Auto-filled details
                        </p>
                        <span className="text-[11px] text-muted-foreground">
                          {entries.length} field{entries.length === 1 ? '' : 's'} from {currentGuidedDocConfig?.label}
                        </span>
                      </div>
                      <dl className="divide-y divide-primary/10">
                        {entries.map(([fieldKey, value], idx) => {
                          const options = smartUploadFieldOptions[fieldKey] ?? [];
                          const showCandidates = options.length >= 2;
                          const normalizedSelected = String(value).trim().replace(/\s+/g, ' ').toLowerCase();
                          return (
                            <div
                              key={fieldKey}
                              className={`flex flex-col gap-1.5 py-3 ${idx === 0 ? 'pt-0' : ''} ${idx === entries.length - 1 ? 'pb-0' : ''}`}
                            >
                              <dt className="text-[11px] font-bold uppercase tracking-wide text-foreground/90">
                                {resolveFieldLabel(fieldKey, fallbackFieldLabel(fieldKey))}
                              </dt>
                              <dd className="text-sm text-foreground break-words leading-relaxed">
                                {formatSmartUploadReviewValue(fieldKey, String(value))}
                              </dd>
                              {showCandidates && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {options.map((opt) => {
                                    const optNormalized = opt.value.trim().replace(/\s+/g, ' ').toLowerCase();
                                    const isSelected = optNormalized === normalizedSelected;
                                    return (
                                      <button
                                        key={`${fieldKey}-${opt.label ?? opt.value}-${opt.value}`}
                                        type="button"
                                        onClick={() => handleSmartUploadCandidateSelect(fieldKey, opt.value)}
                                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                                          isSelected
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted/50'
                                        }`}
                                        aria-pressed={isSelected}
                                      >
                                        {opt.label ? `${opt.label}: ${opt.value}` : opt.value}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </dl>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
                  <h2 className="text-section font-semibold text-foreground mb-2">Review your details</h2>
                  <p className="text-sm text-muted-foreground">
                    Check the details below. Where we found more than one option, pick the right one. Then continue.
                  </p>
                </div>

                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Extracted data review</h3>
                  {smartUploadDraftEntries.length > 0 || smartUploadIdentityContext ? (
                    <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
                      {smartUploadDraftEntries.map(([fieldKey, value]) => {
                        const options = smartUploadFieldOptions[fieldKey] ?? [];
                        const showCandidates = options.length >= 2;
                        const normalizedSelected = value.trim().replace(/\s+/g, ' ').toLowerCase();
                        return (
                          <div key={fieldKey} className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-1.5">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              {resolveFieldLabel(fieldKey, fallbackFieldLabel(fieldKey))}
                            </p>
                            {showCandidates ? (
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-2">
                                  {options.map((opt) => {
                                    const optNormalized = opt.value.trim().replace(/\s+/g, ' ').toLowerCase();
                                    const isSelected = optNormalized === normalizedSelected;
                                    return (
                                      <button
                                        key={`${fieldKey}-${opt.label ?? opt.value}-${opt.value}`}
                                        type="button"
                                        onClick={() => handleSmartUploadCandidateSelect(fieldKey, opt.value)}
                                        className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                          isSelected
                                            ? 'border-primary bg-primary text-primary-foreground'
                                            : 'border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted/50'
                                        }`}
                                        aria-pressed={isSelected}
                                      >
                                        {opt.label ? `${opt.label}: ${opt.value}` : opt.value}
                                      </button>
                                    );
                                  })}
                                </div>
                                <p className="text-sm text-foreground break-words leading-relaxed">
                                  {formatSmartUploadReviewValue(fieldKey, value)}
                                </p>
                              </div>
                            ) : (
                              <p className="text-sm text-foreground break-words leading-relaxed">
                                {formatSmartUploadReviewValue(fieldKey, value)}
                              </p>
                            )}
                            <p className="pt-1 text-[11px] text-muted-foreground">
                              {getSmartUploadReviewSourceText(fieldKey, value)}
                            </p>
                          </div>
                        );
                      })}
                      {smartUploadGenderMissing && (
                        <p className="italic text-sm text-red-800 dark:text-red-400 pt-1">
                          Gender not found — please pick it on the form.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nothing was auto-filled. You can continue and enter details on the form.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setRegistrationEntryStage('smart_steps')}
                    className="inline-flex items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
                  >
                    Back to Uploads
                  </button>
                  <button
                    type="button"
                    onClick={handleContinueFromSmartDraft}
                    className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Continue to Form
                  </button>
                </div>
              </div>
            )
          ) : (
            <>
          {/* Form Error Banner */}
          {formErrorMessage && (
            <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start">
              <AlertCircle className="w-5 h-5 text-destructive mr-3 mt-0.5 flex-shrink-0" />
              <p className="text-destructive text-sm font-medium">{formErrorMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} onBlurCapture={handleFormBlurCapture} className="space-y-8">
            {/* Smart Upload — top-level shortcut for any registration document */}
            <SmartUploadDocument
              formFieldValues={{
                full_name: formData.full_name,
                date_of_birth: formData.date_of_birth,
                gender: formData.gender,
                payment_date: formData.payment_date,
                transaction_id: formData.transaction_id,
                bank_reference: formData.bank_reference,
                gst_registered: formData.gst_registered,
                gst_number: formData.gst_number,
                pan_company: formData.pan_company,
                company_name: formData.company_name,
                company_address: formData.company_address,
                pin_code: formData.pin_code,
                state: formData.state,
                district: formData.district,
                city: formData.city,
                industry: formData.industry,
                activity_type: formData.activity_type,
                products_services: formData.products_services,
              }}
              onAutofill={handleSmartAutofill}
              onConflictResolved={handleSmartConflictResolved}
              onFileReady={handleSmartFileReady}
              forceDocumentPrecedenceFields={['gender']}
              normalizeExtractedFields={normalizeSmartUploadFields}
              disabled={isPreviewMode}
            />

            {/* Payment Information */}
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center">
                <Phone className="w-5 h-5 mr-2 text-primary" />
                Payment Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {isFieldVisible('payment_proof_url') && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('payment_proof_url', 'Payment Proof')}{isFieldRequired('payment_proof_url') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      id="payment_proof_url"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => handleFileChange('paymentProof', e.target.files?.[0] || null)}
                      className="sr-only"
                    />
                    <label
                      htmlFor="payment_proof_url"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm text-foreground bg-card hover:bg-muted/50 cursor-pointer transition-colors ${
                        errors.payment_proof_url ? 'border-destructive' : 'border-border'
                      }`}
                    >
                      <Upload className="w-4 h-4" />
                      {files.paymentProof ? 'Upload New File' : 'Upload File'}
                    </label>
                    {files.paymentProof && (
                      <p className="text-xs text-muted-foreground mt-1">Selected: {files.paymentProof.name}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">Upload screenshot or receipt of your membership fee payment</p>
                    {errors.payment_proof_url && <p className="text-destructive text-sm mt-1">{errors.payment_proof_url}</p>}
                  </div>
                )}

                {isFieldVisible('payment_date') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('payment_date', 'Payment Date')}{isFieldRequired('payment_date') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="date"
                      name="payment_date"
                      value={formData.payment_date}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.payment_date ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('payment_date')}
                    />
                    {errors.payment_date && <p className="text-destructive text-sm mt-1">{errors.payment_date}</p>}
                  </div>
                )}

                {isFieldVisible('payment_mode') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('payment_mode', 'Payment Mode')}{isFieldRequired('payment_mode') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <select
                      name="payment_mode"
                      value={formData.payment_mode}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.payment_mode ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('payment_mode')}
                    >
                    <option value="">{resolveFieldPlaceholder('payment_mode', 'Select Payment Mode')}</option>
                    {resolveFieldOptions('payment_mode', ['QR Code / UPI', 'Bank Transfer (NEFT/RTGS/IMPS)', 'Cheque', 'Demand Draft', 'Cash']).map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                    </select>
                    {errors.payment_mode && <p className="text-destructive text-sm mt-1">{errors.payment_mode}</p>}
                  </div>
                )}

                {isFieldVisible('transaction_id') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('transaction_id', 'Transaction ID / Reference')}{isFieldRequired('transaction_id') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      id="transaction_id"
                      name="transaction_id"
                      value={formData.transaction_id}
                      onChange={handleInputChange}
                      onBlur={() => validateField('transaction_id')}
                      placeholder={resolveFieldPlaceholder('transaction_id', 'Transaction ID or reference number')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.transaction_id ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('transaction_id')}
                      maxLength={getFieldMaxLength('transaction_id') ?? undefined}
                    />
                    {errors.transaction_id && <p className="text-destructive text-sm mt-1">{errors.transaction_id}</p>}
                  </div>
                )}

                {isFieldVisible('bank_reference') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('bank_reference', 'Bank Reference')}{isFieldRequired('bank_reference') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      id="bank_reference"
                      name="bank_reference"
                      value={formData.bank_reference}
                      onChange={handleInputChange}
                      onBlur={() => validateField('bank_reference')}
                      placeholder={resolveFieldPlaceholder('bank_reference', 'Bank reference number (if any)')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.bank_reference ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('bank_reference')}
                      maxLength={getFieldMaxLength('bank_reference') ?? undefined}
                    />
                    {errors.bank_reference && <p className="text-destructive text-sm mt-1">{errors.bank_reference}</p>}
                  </div>
                )}

                {isFieldVisible('amount_paid') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('amount_paid', 'Amount Paid')}{isFieldRequired('amount_paid') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="amount_paid"
                      value={formData.amount_paid}
                      onChange={handleInputChange}
                      placeholder={resolveFieldPlaceholder('amount_paid', 'Select state and gender first')}
                      disabled
                      className={`w-full px-3 py-2 border rounded-lg bg-muted/50 cursor-not-allowed ${
                        errors.amount_paid ? 'border-destructive' : 'border-border'
                      }`}
                    />
                    {errors.amount_paid && <p className="text-destructive text-sm mt-1">{errors.amount_paid}</p>}
                  </div>
                )}
              </div>
            </section>

            {/* Personal Information */}
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center">
                <User className="w-5 h-5 mr-2 text-primary" />
                Personal Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {isFieldVisible('full_name') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('full_name', 'Full Name')}{isFieldRequired('full_name') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleInputChange}
                      onBlur={() => validateField('full_name')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.full_name ? 'border-destructive' : 'border-border'
                      }`}
                      placeholder={resolveFieldPlaceholder('full_name', 'Enter your full name')}
                      required={isFieldRequired('full_name')}
                      maxLength={getFieldMaxLength('full_name') ?? undefined}
                    />

                    {errors.full_name && <p className="text-destructive text-sm mt-1">{errors.full_name}</p>}
                  </div>
                )}

                {isFieldVisible('gender') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('gender', 'Gender')}{isFieldRequired('gender') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <select
                      name="gender"
                      value={formData.gender}
                      onChange={handleInputChange}
                      required={isFieldRequired('gender')}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.gender ? 'border-destructive' : 'border-border'
                    }`}
                  >
                    <option value="">{resolveFieldPlaceholder('gender', 'Select Gender')}</option>
                    {resolveFieldOptions('gender', ['Male', 'Female']).map(option => (
                      <option key={option} value={option.toLowerCase()}>{option}</option>
                    ))}
                  </select>
                  {errors.gender && <p className="text-destructive text-sm mt-1">{errors.gender}</p>}
                  </div>
                )}

                {isFieldVisible('date_of_birth') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('date_of_birth', 'Date of Birth')}{isFieldRequired('date_of_birth') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="date"
                      name="date_of_birth"
                      value={formData.date_of_birth}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.date_of_birth ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('date_of_birth')}
                    />
                    {errors.date_of_birth && <p className="text-destructive text-sm mt-1">{errors.date_of_birth}</p>}
                  </div>
                )}

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    <Camera className="w-4 h-4 inline mr-1" />
                    Profile Photo (Optional)
                  </label>

                  {!profilePhotoPreview ? (
                    <div>
                      <input
                        type="file"
                        id="profile-photo-input"
                        accept="image/jpeg,image/jpg,image/png"
                        onChange={handlePhotoSelect}
                        className="hidden"
                      />
                      <label
                        htmlFor="profile-photo-input"
                        className="inline-flex items-center px-4 py-2 border border-border rounded-lg text-sm font-medium text-foreground bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Choose Photo
                      </label>
                      <p className="text-xs text-muted-foreground mt-2">
                        Upload a profile photo (JPG, JPEG, or PNG). You'll be able to crop it to fit.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-start gap-4">
                      <div className="relative">
                        <img
                          src={profilePhotoPreview}
                          alt="Profile preview"
                          className="w-32 h-40 object-cover rounded-lg border-2 border-border"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-primary font-medium mb-2 flex items-center">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Photo ready
                        </p>
                        <p className="text-xs text-muted-foreground mb-3">
                          Your profile photo has been cropped and will be uploaded with your registration.
                        </p>
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-destructive bg-destructive/10 rounded-lg hover:bg-destructive/20 transition-colors"
                        >
                          <XIcon className="w-4 h-4 mr-1" />
                          Remove Photo
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {isFieldVisible('email') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('email', 'Email Address')}{isFieldRequired('email') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      onBlur={() => validateField('email')}
                      readOnly={isAuthenticated}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.email ? 'border-destructive' : 'border-border'
                      } ${isAuthenticated ? 'bg-muted/50 cursor-not-allowed' : ''}`}
                      required={isFieldRequired('email')}
                      maxLength={getFieldMaxLength('email') ?? undefined}
                  />
                  {errors.email && <p className="text-destructive text-sm mt-1">{errors.email}</p>}
                  </div>
                )}

                {isFieldVisible('mobile_number') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('mobile_number', 'Mobile Number')}{isFieldRequired('mobile_number') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="mobile_number"
                      value={formData.mobile_number}
                      onChange={handleMobileNumberChange}
                      onBlur={() => validateField('mobile_number')}
                      placeholder={resolveFieldPlaceholder('mobile_number', '10-digit mobile number')}
                      readOnly={isAuthenticated}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.mobile_number ? 'border-destructive' : 'border-border'
                      } ${isAuthenticated ? 'bg-muted/50 cursor-not-allowed' : ''}`}
                      required={isFieldRequired('mobile_number')}
                      maxLength={getFieldMaxLength('mobile_number') ?? undefined}
                  />
                  {errors.mobile_number && <p className="text-destructive text-sm mt-1">{errors.mobile_number}</p>}
                  </div>
                )}
              </div>
            </section>

            {/* Company Information */}
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center">
                <Building2 className="w-5 h-5 mr-2 text-primary" />
                Company Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {isFieldVisible('company_name') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('company_name', 'Company Name')}{isFieldRequired('company_name') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="company_name"
                      value={formData.company_name}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.company_name ? 'border-destructive' : 'border-border'
                      }`}
                      placeholder={resolveFieldPlaceholder('company_name', 'Enter your company name')}
                      required={isFieldRequired('company_name')}
                      maxLength={getFieldMaxLength('company_name') ?? undefined}
                    />
                    {errors.company_name && <p className="text-destructive text-sm mt-1">{errors.company_name}</p>}
                  </div>
                )}

                {isFieldVisible('company_designation_id') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('company_designation_id', 'Designation')}{isFieldRequired('company_designation_id') && <span className="text-destructive ml-1">*</span>}
                  </label>
                  {isLoadingDesignations ? (
                    <div className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 flex items-center">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading designations...
                    </div>
                  ) : (
                    <select
                      name="company_designation_id"
                      value={formData.company_designation_id}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.company_designation_id ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('company_designation_id')}
                    >
                      <option value="">{resolveFieldPlaceholder('company_designation_id', 'Select Designation')}</option>
                      {availableDesignations.map(designation => (
                        <option key={designation.id} value={designation.id}>
                          {designation.designation_name}
                        </option>
                      ))}
                    </select>
                  )}
                  {errors.company_designation_id && <p className="text-destructive text-sm mt-1">{errors.company_designation_id}</p>}
                  </div>
                )}
              </div>
            </section>

            {/* Location Information */}
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center">
                <MapPin className="w-5 h-5 mr-2 text-primary" />
                Location Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* State Dropdown */}
                {isFieldVisible('state') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('state', 'State')}{isFieldRequired('state') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    {isLoadingStates ? (
                    <div className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 flex items-center">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading states...
                    </div>
                  ) : (
                    <select
                      name="state"
                      value={formData.state}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.state ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('state')}
                    >
                      <option value="">{resolveFieldPlaceholder('state', 'Select State')}</option>
                      {availableStates.map(state => (
                        <option key={state.state} value={state.state}>
                          {state.state}
                        </option>
                      ))}
                    </select>
                  )}
                  {errors.state && <p className="text-destructive text-sm mt-1">{errors.state}</p>}
                  </div>
                )}

                {/* District Dropdown */}
                {isFieldVisible('district') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('district', 'District')}{isFieldRequired('district') && <span className="text-destructive ml-1">*</span>}
                    </label>
                  {isLoadingDistricts ? (
                    <div className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 flex items-center">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading districts...
                    </div>
                  ) : (
                    <select
                      name="district"
                      value={formData.district}
                      onChange={handleDistrictChange}
                      disabled={!formData.state}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring disabled:bg-muted/50 disabled:cursor-not-allowed ${
                        errors.district ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('district')}
                    >
                      <option value="">
                        {formData.state ? 'Select District' : 'Select State First'}
                      </option>
                      {availableDistricts.map(district => (
                        <option key={district.district_id} value={district.district_name}>
                          {district.district_name}
                        </option>
                      ))}
                    </select>
                  )}
                  {errors.district && <p className="text-destructive text-sm mt-1">{errors.district}</p>}
                  </div>
                )}

                {/* City Dropdown */}
                {isFieldVisible('city') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('city', 'City/Town/Village')}{isFieldRequired('city') && <span className="text-destructive ml-1">*</span>}
                    </label>
                  {isLoadingCities ? (
                    <div className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 flex items-center">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading cities...
                    </div>
                  ) : (
                    <select
                      name="city"
                      value={showOtherCity ? 'Other' : formData.city}
                      onChange={handleCityChange}
                      disabled={!selectedDistrictId}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring disabled:bg-muted/50 disabled:cursor-not-allowed ${
                        errors.city ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('city')}
                    >
                      <option value="">
                        {selectedDistrictId ? 'Select City' : 'Select District First'}
                      </option>
                      {availableCities.map(city => (
                        <option key={city.city_id} value={city.city_name}>
                          {city.city_name}
                        </option>
                      ))}
                      <option value="Other">Other</option>
                    </select>
                  )}
                  {errors.city && <p className="text-destructive text-sm mt-1">{errors.city}</p>}
                  </div>
                )}

                {/* Other City Text Input */}
                {showOtherCity && isFieldVisible('city') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('other_city_name', 'Enter City/Town/Village')}{isFieldRequired('city') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      value={otherCityText}
                      onChange={handleOtherCityChange}
                      placeholder={resolveFieldPlaceholder('other_city_name', 'Enter your city, town, or village')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.city ? 'border-destructive' : 'border-border'
                      }`}
                      required={formData.city === 'Other'}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Enter your city, town, or village name</p>
                    {errors.city && <p className="text-destructive text-sm mt-1">{errors.city}</p>}
                  </div>
                )}

                {isFieldVisible('pin_code') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('pin_code', 'PIN Code')}{isFieldRequired('pin_code') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="pin_code"
                      value={formData.pin_code}
                      onChange={handlePinCodeChange}
                      onBlur={() => validateField('pin_code')}
                      placeholder={resolveFieldPlaceholder('pin_code', '6-digit PIN code')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.pin_code ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('pin_code')}
                      maxLength={getFieldMaxLength('pin_code') ?? undefined}
                    />
                    {errors.pin_code && <p className="text-destructive text-sm mt-1">{errors.pin_code}</p>}
                  </div>
                )}

                {isFieldVisible('company_address') && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('company_address', 'Company Address')}{isFieldRequired('company_address') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <textarea
                      name="company_address"
                      value={formData.company_address}
                      onChange={handleInputChange}
                      rows={3}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.company_address ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('company_address')}
                      maxLength={getFieldMaxLength('company_address') ?? undefined}
                    />
                    {errors.company_address && <p className="text-destructive text-sm mt-1">{errors.company_address}</p>}
                  </div>
                )}
              </div>
            </section>

            {/* Business Information */}
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center">
                <Building2 className="w-5 h-5 mr-2 text-primary" />
                Business Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {isFieldVisible('industry') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('industry', 'Industry')}{isFieldRequired('industry') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <select
                      name="industry"
                      value={formData.industry}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.industry ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('industry')}
                    >
                    <option value="">{resolveFieldPlaceholder('industry', 'Select Industry')}</option>
                    {resolveFieldOptions('industry', ['Micro', 'Small', 'Medium']).map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                    </select>
                    {errors.industry && <p className="text-destructive text-sm mt-1">{errors.industry}</p>}
                  </div>
                )}

                {isFieldVisible('activity_type') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('activity_type', 'Activity Type')}{isFieldRequired('activity_type') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <select
                      name="activity_type"
                      value={formData.activity_type}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.activity_type ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('activity_type')}
                    >
                    <option value="">{resolveFieldPlaceholder('activity_type', 'Select Activity Type')}</option>
                    {resolveFieldOptions('activity_type', ['Manufacturer', 'Service Provider', 'Trader']).map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                    </select>
                  {errors.activity_type && <p className="text-destructive text-sm mt-1">{errors.activity_type}</p>}
                  </div>
                )}

                {isFieldVisible('constitution') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('constitution', 'Industry Constitution')}{isFieldRequired('constitution') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <select
                      name="constitution"
                      value={formData.constitution}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.constitution ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('constitution')}
                    >
                    <option value="">{resolveFieldPlaceholder('constitution', 'Select Industry Constitution')}</option>
                    {resolveFieldOptions('constitution', ['Proprietorship', 'Partnership', 'Limited Liability Partnership', 'One Person Company', 'Private Limited Company', 'Limited Company']).map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                    </select>
                    {errors.constitution && <p className="text-destructive text-sm mt-1">{errors.constitution}</p>}
                  </div>
                )}

                {isFieldVisible('annual_turnover') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('annual_turnover', 'Annual Turnover')}{isFieldRequired('annual_turnover') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <select
                      name="annual_turnover"
                      value={formData.annual_turnover}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.annual_turnover ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('annual_turnover')}
                    >
                    <option value="">{resolveFieldPlaceholder('annual_turnover', 'Select Annual Turnover')}</option>
                    {resolveFieldOptions('annual_turnover', ['Less than 50 Lakhs', '50 Lakhs - 1 Crore', '1 Crore - 5 Crores', '5 Crores - 10 Crores', '10 Crores - 25 Crores', 'Above 25 Crores']).map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                    </select>
                    {errors.annual_turnover && <p className="text-destructive text-sm mt-1">{errors.annual_turnover}</p>}
                  </div>
                )}

                {isFieldVisible('number_of_employees') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('number_of_employees', 'Number of Employees')}{isFieldRequired('number_of_employees') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <select
                      name="number_of_employees"
                      value={formData.number_of_employees}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.number_of_employees ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('number_of_employees')}
                    >
                    <option value="">{resolveFieldPlaceholder('number_of_employees', 'Select Number of Employees')}</option>
                    {resolveFieldOptions('number_of_employees', ['Less than 5 employees', '6 to 10 employees', '11 to 20 employees', '21 to 50 employees', '51 to 100 employees', '101 to 150 employees', 'Above 151 employees']).map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                    </select>
                    {errors.number_of_employees && <p className="text-destructive text-sm mt-1">{errors.number_of_employees}</p>}
                  </div>
                )}

                {isFieldVisible('products_services') && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('products_services', 'Products & Services')}{isFieldRequired('products_services') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <textarea
                      name="products_services"
                      value={formData.products_services}
                      onChange={handleInputChange}
                      rows={3}
                      placeholder={resolveFieldPlaceholder('products_services', 'Describe your main products and services')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.products_services ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('products_services')}
                      maxLength={getFieldMaxLength('products_services') ?? undefined}
                    />
                    {errors.products_services && <p className="text-destructive text-sm mt-1">{errors.products_services}</p>}
                  </div>
                )}

                {isFieldVisible('brand_names') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('brand_names', 'Brand Names')}{isFieldRequired('brand_names') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      id="brand_names"
                      name="brand_names"
                      value={formData.brand_names}
                      onChange={handleInputChange}
                      onBlur={() => validateField('brand_names')}
                      placeholder={resolveFieldPlaceholder('brand_names', 'Your brand names (if any)')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.brand_names ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('brand_names')}
                      maxLength={getFieldMaxLength('brand_names') ?? undefined}
                    />
                    {errors.brand_names && <p className="text-destructive text-sm mt-1">{errors.brand_names}</p>}
                  </div>
                )}

                {isFieldVisible('website') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('website', 'Website')}{isFieldRequired('website') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="website"
                      value={formData.website}
                      onChange={handleInputChange}
                      onBlur={() => validateField('website')}
                      placeholder={resolveFieldPlaceholder('website', 'www.yourcompany.com')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.website ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('website')}
                      maxLength={getFieldMaxLength('website') ?? undefined}
                    />
                    {errors.website && <p className="text-destructive text-sm mt-1">{errors.website}</p>}
                  </div>
                )}
              </div>
            </section>

            {/* Registration Information */}
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center">
                <FileText className="w-5 h-5 mr-2 text-primary" />
                Registration Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {isFieldVisible('gst_registered') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('gst_registered', 'GST Registered')}{isFieldRequired('gst_registered') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <select
                      name="gst_registered"
                      value={formData.gst_registered}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.gst_registered ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('gst_registered')}
                    >
                    <option value="">{resolveFieldPlaceholder('gst_registered', 'Select')}</option>
                    {resolveFieldOptions('gst_registered', ['Yes', 'No']).map(option => (
                      <option key={option} value={option.toLowerCase()}>{option}</option>
                    ))}
                    </select>
                    {errors.gst_registered && <p className="text-destructive text-sm mt-1">{errors.gst_registered}</p>}
                  </div>
                )}

                {formData.gst_registered === 'yes' && isFieldVisible('gst_number') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('gst_number', 'GST Number')}{isFieldRequired('gst_number') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="gst_number"
                      value={formData.gst_number}
                      onChange={handleGstChange}
                      onBlur={() => validateField('gst_number')}
                      placeholder={resolveFieldPlaceholder('gst_number', '22AAAAA0000A1Z5')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.gst_number ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('gst_number')}
                      maxLength={getFieldMaxLength('gst_number') ?? undefined}
                    />
                    {errors.gst_number && <p className="text-destructive text-sm mt-1">{errors.gst_number}</p>}
                  </div>
                )}

                {isFieldVisible('pan_company') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('pan_company', 'PAN (Company)')}{isFieldRequired('pan_company') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="pan_company"
                      value={formData.pan_company}
                      onChange={handlePanChange}
                      onBlur={() => validateField('pan_company')}
                      placeholder={resolveFieldPlaceholder('pan_company', '10 alphanumeric characters')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.pan_company ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('pan_company')}
                      maxLength={getFieldMaxLength('pan_company') ?? undefined}
                    />
                    {errors.pan_company && <p className="text-destructive text-sm mt-1">{errors.pan_company}</p>}
                  </div>
                )}

                {isFieldVisible('esic_registered') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('esic_registered', 'ESIC Registered')}{isFieldRequired('esic_registered') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <select
                      name="esic_registered"
                      value={formData.esic_registered}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.esic_registered ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('esic_registered')}
                    >
                    <option value="">{resolveFieldPlaceholder('esic_registered', 'Select')}</option>
                    {resolveFieldOptions('esic_registered', ['Yes', 'No']).map(option => (
                      <option key={option} value={option.toLowerCase()}>{option}</option>
                    ))}
                    </select>
                    {errors.esic_registered && <p className="text-destructive text-sm mt-1">{errors.esic_registered}</p>}
                  </div>
                )}

                {isFieldVisible('epf_registered') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('epf_registered', 'EPF Registered')}{isFieldRequired('epf_registered') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <select
                      name="epf_registered"
                      value={formData.epf_registered}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.epf_registered ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('epf_registered')}
                    >
                    <option value="">{resolveFieldPlaceholder('epf_registered', 'Select')}</option>
                    {resolveFieldOptions('epf_registered', ['Yes', 'No']).map(option => (
                      <option key={option} value={option.toLowerCase()}>{option}</option>
                    ))}
                    </select>
                    {errors.epf_registered && <p className="text-destructive text-sm mt-1">{errors.epf_registered}</p>}
                  </div>
                )}
              </div>
            </section>

            {/* Document Uploads */}
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center">
                <Upload className="w-5 h-5 mr-2 text-primary" />
                Document Uploads
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {formData.gst_registered === 'yes' && isFieldVisible('gst_certificate_url') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('gst_certificate_url', 'GST Certificate')}{isFieldRequired('gst_certificate_url') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      id="gst_certificate_url"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => handleFileChange('gstCertificate', e.target.files?.[0] || null)}
                      className="sr-only"
                    />
                    <label
                      htmlFor="gst_certificate_url"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm text-foreground bg-card hover:bg-muted/50 cursor-pointer transition-colors ${
                        errors.gst_certificate_url ? 'border-destructive' : 'border-border'
                      }`}
                    >
                      <Upload className="w-4 h-4" />
                      {files.gstCertificate ? 'Upload New File' : 'Upload File'}
                    </label>
                    {files.gstCertificate && (
                      <p className="text-xs text-muted-foreground mt-1">Selected: {files.gstCertificate.name}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG (Max 10MB)</p>
                    {errors.gst_certificate_url && <p className="text-destructive text-sm mt-1">{errors.gst_certificate_url}</p>}
                  </div>
                )}

                {isFieldVisible('udyam_certificate_url') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('udyam_certificate_url', 'UDYAM Certificate')}{isFieldRequired('udyam_certificate_url') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      id="udyam_certificate_url"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => handleFileChange('udyamCertificate', e.target.files?.[0] || null)}
                      className="sr-only"
                    />
                    <label
                      htmlFor="udyam_certificate_url"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm text-foreground bg-card hover:bg-muted/50 cursor-pointer transition-colors ${
                        errors.udyam_certificate_url ? 'border-destructive' : 'border-border'
                      }`}
                    >
                      <Upload className="w-4 h-4" />
                      {files.udyamCertificate ? 'Upload New File' : 'Upload File'}
                    </label>
                    {files.udyamCertificate && (
                      <p className="text-xs text-muted-foreground mt-1">Selected: {files.udyamCertificate.name}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">PDF, JPG, PNG (Max 10MB)</p>
                    {errors.udyam_certificate_url && <p className="text-destructive text-sm mt-1">{errors.udyam_certificate_url}</p>}
                  </div>
                )}

              </div>
            </section>

            {/* Additional Information */}
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-6 flex items-center">
                <User className="w-5 h-5 mr-2 text-primary" />
                Additional Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {isFieldVisible('alternate_contact_name') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('alternate_contact_name', 'Alternate Contact Name')}{isFieldRequired('alternate_contact_name') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      id="alternate_contact_name"
                      name="alternate_contact_name"
                      value={formData.alternate_contact_name}
                      onChange={handleInputChange}
                      onBlur={() => validateField('alternate_contact_name')}
                      placeholder={resolveFieldPlaceholder('alternate_contact_name', 'Alternate contact person name')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.alternate_contact_name ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('alternate_contact_name')}
                      maxLength={getFieldMaxLength('alternate_contact_name') ?? undefined}
                    />
                    {errors.alternate_contact_name && <p className="text-destructive text-sm mt-1">{errors.alternate_contact_name}</p>}
                  </div>
                )}

                {isFieldVisible('alternate_mobile') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('alternate_mobile', 'Alternate Mobile')}{isFieldRequired('alternate_mobile') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="alternate_mobile"
                      value={formData.alternate_mobile}
                      onChange={handleMobileNumberChange}
                      onBlur={() => validateField('alternate_mobile')}
                      placeholder={resolveFieldPlaceholder('alternate_mobile', 'Alternate mobile number')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.alternate_mobile ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('alternate_mobile')}
                      maxLength={getFieldMaxLength('alternate_mobile') ?? undefined}
                    />
                    {errors.alternate_mobile && <p className="text-destructive text-sm mt-1">{errors.alternate_mobile}</p>}
                  </div>
                )}

                {isFieldVisible('referred_by') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      {resolveFieldLabel('referred_by', 'Referred By')}{isFieldRequired('referred_by') && <span className="text-destructive ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      id="referred_by"
                      name="referred_by"
                      value={formData.referred_by}
                      onChange={handleInputChange}
                      onBlur={() => validateField('referred_by')}
                      placeholder={resolveFieldPlaceholder('referred_by', 'Name of the person who referred you')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.referred_by ? 'border-destructive' : 'border-border'
                      }`}
                      required={isFieldRequired('referred_by')}
                      maxLength={getFieldMaxLength('referred_by') ?? undefined}
                    />
                    {errors.referred_by && <p className="text-destructive text-sm mt-1">{errors.referred_by}</p>}
                  </div>
                )}
              </div>
            </section>

            {/* Submit Button */}
            <div className="flex flex-col sm:flex-row gap-4 justify-end pt-8 border-t border-border">
              <Link
                to={isPreviewMode ? '/' : '/dashboard'}
                className="inline-flex items-center justify-center px-6 py-3 border border-border text-base font-medium rounded-lg text-foreground bg-card hover:bg-muted/50 transition-colors duration-200 sm:order-1"
              >
                Cancel
              </Link>
              
              <button
                ref={submitButtonRef}
                type="submit"
                disabled={isPreviewMode || isSubmitting || isVerifying || !isVerifiedForSubmit}
                className={`inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-lg transition-colors duration-200 sm:order-2 ${
                  isPreviewMode || isSubmitting || isVerifying || !isVerifiedForSubmit
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-5 w-5" />
                    Submit
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleVerify()}
                disabled={isPreviewMode || isSubmitting || isVerifying || isVerifiedForSubmit || !hasFormChanges()}
                className={`inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-lg transition-colors duration-200 sm:order-3 ${
                  isPreviewMode || isSubmitting || isVerifying || isVerifiedForSubmit || !hasFormChanges()
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/90'
                }`}
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify'
                )}
              </button>
            </div>
          </form>
          </>
          )}
        </div>

        <ImageCropModal
          imageSrc={photoImageSrc}
          isOpen={isCropModalOpen}
          onClose={() => setIsCropModalOpen(false)}
          onCropComplete={handleCropComplete}
          onError={handleCropError}
        />

        <FieldCorrectionStepper
          fields={showCorrectionStepper ? correctionFields : []}
          onFieldConfirmed={handleFieldConfirmed}
          onComplete={handleCorrectionComplete}
          onDiscard={handleCorrectionDiscard}
        />
      </div>
    </div>
  );
};

export default Join;
