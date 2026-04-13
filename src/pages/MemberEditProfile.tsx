import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Loader2,
  AlertCircle,
  User,
  Building,
  Phone,
  Mail,
  FileText,
  Users,
  Lock,
  Unlock,
  X as XIcon,
  Camera,
  Upload,
  CheckCircle,
  Eye
} from 'lucide-react';
import { useMember } from '../contexts/useMember';
import Toast from '../components/Toast';
import ChangeCredentialModal from '../components/member/ChangeCredentialModal';
import ImageCropModal from '../components/ImageCropModal';
import FieldCorrectionStepper, { type FieldCorrectionStep } from '../components/FieldCorrectionStepper';
import { changeEmail, changeMobile } from '../lib/memberCredentialService';
import { normalizeMemberData, type NormalizationResult } from '../lib/normalization';
import { useValidation } from '../hooks/useValidation';
import { useFormFieldConfig } from '../hooks/useFormFieldConfig';
import { readFileAsDataURL, validateImageFile, generatePhotoFileName } from '../lib/imageProcessing';
import { sessionManager } from '../lib/sessionManager';
import {
  supabase,
  memberRegistrationService,
  statesService,
  locationsService,
  companyDesignationsService,
  fileUploadService,
  PublicPaymentState,
  DistrictOption,
  CityOption,
  DesignationMaster
} from '../lib/supabase';

// Static option arrays for form dropdowns
const INDUSTRY_OPTIONS = ['Micro', 'Small', 'Medium'];

const ACTIVITY_TYPE_OPTIONS = ['Manufacturer', 'Service Provider', 'Trader'];

const CONSTITUTION_OPTIONS = [
  'Proprietorship',
  'Partnership',
  'Limited Liability Partnership',
  'One Person Company',
  'Private Limited Company',
  'Limited Company'
];

const ANNUAL_TURNOVER_OPTIONS = [
  'Less than 50 Lakhs',
  '50 Lakhs - 1 Crore',
  '1 Crore - 5 Crores',
  '5 Crores - 10 Crores',
  '10 Crores - 25 Crores',
  'Above 25 Crores'
];

const EMPLOYEE_COUNT_OPTIONS = [
  'Less than 5 employees',
  '6 to 10 employees',
  '11 to 20 employees',
  '21 to 50 employees',
  '51 to 100 employees',
  '101 to 150 employees',
  'Above 151 employees'
];

const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const correctionFieldLabels: Record<string, string> = {
  full_name: 'Full Name',
  company_name: 'Company Name',
  company_address: 'Company Address',
  products_services: 'Products & Services',
  alternate_contact_name: 'Alternate Contact Name',
  referred_by: 'Referred By'
};

const MEMBER_EDIT_NON_VALIDATED_FIELDS = new Set<string>([
  'is_custom_city',
  'profile_photo_url',
  'gst_certificate_url',
  'udyam_certificate_url',
  'payment_proof_url'
]);

const REQUIRED_MESSAGE_OVERRIDES: Record<string, string> = {
  gst_registered: 'GST registration status is required',
  esic_registered: 'ESIC registration status is required',
  epf_registered: 'EPF registration status is required',
  gst_number: 'GST number is required when GST registered',
  gst_certificate_url: 'GST certificate is required',
  udyam_certificate_url: 'UDYAM certificate is required',
  payment_proof_url: 'Payment proof is required',
  pin_code: 'PIN code is required',
  products_services: 'Products & services is required'
};

const MemberEditProfile: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreviewMode = searchParams.get('preview') === '1';

  const { member, isAuthenticated, isLoading, refreshMember } = useMember();
  const {
    validateField: validateFieldByRule
  } = useValidation({ formKey: 'member_edit' });
  const {
    isFieldVisible,
    isFieldRequired,
    getFieldLabel,
    getFieldPlaceholder,
    getFieldOptions,
    getFieldMinLength,
    getFieldMaxLength,
    errorCode: fieldConfigErrorCode
  } = useFormFieldConfig({
    source: isPreviewMode ? 'builder_draft' : 'builder_live',
    formKey: 'member_edit'
  });

  // Profile photo state (same as Join.tsx)
  const [profilePhoto, setProfilePhoto] = useState<Blob | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string>('');
  const [photoFileName, setPhotoFileName] = useState<string>('');
  const [photoImageSrc, setPhotoImageSrc] = useState<string>('');
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [documentFiles, setDocumentFiles] = useState<{
    gstCertificate: File | null;
    udyamCertificate: File | null;
    paymentProof: File | null;
  }>({
    gstCertificate: null,
    udyamCertificate: null,
    paymentProof: null
  });

  const createEmptyFormData = () => ({
    // Personal Information
    full_name: '',
    gender: '',
    date_of_birth: '',
    email: '',
    mobile_number: '',

    // Company Information
    company_name: '',
    company_designation_id: '',
    company_address: '',
    state: '',
    district: '',
    city: '',
    pin_code: '',
    other_city_name: '',
    is_custom_city: false,

    // Business Details
    industry: '',
    activity_type: '',
    constitution: '',
    annual_turnover: '',
    number_of_employees: '',
    products_services: '',
    brand_names: '',
    website: '',

    // Registration Details
    gst_registered: '',
    gst_number: '',
    gst_certificate_url: '',
    pan_company: '',
    esic_registered: '',
    epf_registered: '',
    udyam_certificate_url: '',
    payment_proof_url: '',

    // Membership & Payment Information
    member_id: '',
    referred_by: '',
    amount_paid: '',
    payment_date: '',
    payment_mode: '',
    transaction_id: '',
    bank_reference: '',

    // Alternate Contact
    alternate_contact_name: '',
    alternate_mobile: '',

    // Profile Photo
    profile_photo_url: ''
  });

  // Form state with ALL fields
  const [formData, setFormData] = useState(createEmptyFormData);

  // Original data for comparison
  const [originalData, setOriginalData] = useState(createEmptyFormData);

  // Email/Mobile editing states
  const [isEmailEditable] = useState(false);
  const [isMobileEditable] = useState(false);

  // Modal states for credential changes
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showMobileModal, setShowMobileModal] = useState(false);

  // Location data states
  const [availableStates, setAvailableStates] = useState<PublicPaymentState[]>([]);
  const [availableDistricts, setAvailableDistricts] = useState<DistrictOption[]>([]);
  const [availableCities, setAvailableCities] = useState<CityOption[]>([]);
  const [availableDesignations, setAvailableDesignations] = useState<DesignationMaster[]>([]);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string>('');
  const [showOtherCity, setShowOtherCity] = useState(false);
  const [memberRegistrationId, setMemberRegistrationId] = useState<string | null>(null);

  // Loading states
  const [isLoadingStates, setIsLoadingStates] = useState(true);
  const [isLoadingDesignations, setIsLoadingDesignations] = useState(true);
  const [isLoadingDistricts, setIsLoadingDistricts] = useState(false);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Normalization states
  const [isVerifiedForSubmit, setIsVerifiedForSubmit] = useState(false);
  const [correctionFields, setCorrectionFields] = useState<FieldCorrectionStep[]>([]);
  const [showCorrectionStepper, setShowCorrectionStepper] = useState(false);
  const [correctionSnapshot, setCorrectionSnapshot] = useState<typeof formData | null>(null);

  // Validation errors
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Toast state
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
  const submitButtonRef = useRef<HTMLButtonElement | null>(null);
  const latestErrorsRef = useRef<Record<string, string>>({});

  const scrollToFirstError = (errorMap: Record<string, string>) => {
    for (const key of Object.keys(errorMap)) {
      const el = document.getElementById(key);
      if (el && el.offsetParent !== null) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
        return;
      }
    }
  };

  const isFieldApplicable = useCallback(
    (fieldName: string, data: typeof formData = formData): boolean => {
      if (!isFieldVisible(fieldName)) {
        return false;
      }

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

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isPreviewMode) {
      navigate('/signin');
    }
  }, [isAuthenticated, isLoading, isPreviewMode, navigate]);

  // Preview gate: redirect to sign-in if no session
  useEffect(() => {
    if (isPreviewMode && fieldConfigErrorCode === 'no_session') {
      navigate(`/signin?next=${encodeURIComponent('/dashboard/edit?preview=1')}`);
    }
  }, [isPreviewMode, fieldConfigErrorCode, navigate]);

  // Preview mode must never load or display live member data.
  useEffect(() => {
    if (!isPreviewMode) {
      return;
    }

    const emptyData = {
      // Personal Information
      full_name: '',
      gender: '',
      date_of_birth: '',
      email: '',
      mobile_number: '',

      // Company Information
      company_name: '',
      company_designation_id: '',
      company_address: '',
      state: '',
      district: '',
      city: '',
      pin_code: '',
      other_city_name: '',
      is_custom_city: false,

      // Business Details
      industry: '',
      activity_type: '',
      constitution: '',
      annual_turnover: '',
      number_of_employees: '',
      products_services: '',
      brand_names: '',
      website: '',

      // Registration Details
      gst_registered: '',
      gst_number: '',
      gst_certificate_url: '',
      pan_company: '',
      esic_registered: '',
      epf_registered: '',
      udyam_certificate_url: '',
      payment_proof_url: '',

      // Membership & Payment Information
      member_id: '',
      referred_by: '',
      amount_paid: '',
      payment_date: '',
      payment_mode: '',
      transaction_id: '',
      bank_reference: '',

      // Alternate Contact
      alternate_contact_name: '',
      alternate_mobile: '',

      // Profile Photo
      profile_photo_url: ''
    };

    setFormData(emptyData);
    setOriginalData(emptyData);
    setProfilePhoto(null);
    setProfilePhotoPreview('');
    setPhotoFileName('');
    setPhotoImageSrc('');
    setDocumentFiles({
      gstCertificate: null,
      udyamCertificate: null,
      paymentProof: null
    });
    setSelectedDistrictId('');
    setShowOtherCity(false);
    setMemberRegistrationId(null);
    setErrors({});
    setIsVerifiedForSubmit(false);
  }, [isPreviewMode]);

  // Load complete member profile data from database
  const loadMemberProfile = useCallback(async () => {
    if (!member?.id) return;

    console.log('[MemberEditProfile] Loading complete profile for member:', member.id);
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken || sessionManager.isSessionExpired()) {
        showToast('error', 'User session not found. Please log in again.');
        return;
      }

      const { data, error } = await memberRegistrationService.getMyMemberRegistrationByToken(sessionToken);

      if (error) {
        showToast('error', error);
        return;
      }

      if (!data) {
        showToast('error', 'Failed to load profile data');
        return;
      }

      console.log('[MemberEditProfile] Profile data loaded:', data);

      // Store the member_registrations.id
      setMemberRegistrationId(data.id);

      const isCustomCity = data.is_custom_city || data.city === 'Other';

      const initialFormData = {
        full_name: data.full_name || '',
        email: data.email || '',
        mobile_number: data.mobile_number || '',
        gender: data.gender || '',
        date_of_birth: data.date_of_birth || '',
        company_name: data.company_name || '',
        company_designation_id: data.company_designation_id || '',
        company_address: data.company_address || '',
        state: data.state || '',
        district: data.district || '',
        city: isCustomCity ? 'Other' : (data.city || ''),
        is_custom_city: isCustomCity,
        other_city_name: data.other_city_name || '',
        pin_code: data.pin_code || '',
        industry: data.industry || '',
        activity_type: data.activity_type || '',
        constitution: data.constitution || '',
        annual_turnover: data.annual_turnover || '',
        number_of_employees: data.number_of_employees || '',
        products_services: data.products_services || '',
        brand_names: data.brand_names || '',
        website: data.website || '',
        gst_registered: data.gst_registered || '',
        gst_number: data.gst_number || '',
        gst_certificate_url: data.gst_certificate_url || '',
        pan_company: data.pan_company || '',
        esic_registered: data.esic_registered || '',
        epf_registered: data.epf_registered || '',
        udyam_certificate_url: data.udyam_certificate_url || '',
        payment_proof_url: data.payment_proof_url || '',
        member_id: data.member_id || '',
        referred_by: data.referred_by || '',
        amount_paid: data.amount_paid || '',
        payment_date: data.payment_date || '',
        payment_mode: data.payment_mode || '',
        transaction_id: data.transaction_id || '',
        bank_reference: data.bank_reference || '',
        alternate_contact_name: data.alternate_contact_name || '',
        alternate_mobile: data.alternate_mobile || '',
        profile_photo_url: data.profile_photo_url || ''
      };

      setFormData(initialFormData);
      setOriginalData(initialFormData);

      // Handle "Other" city display
      if (isCustomCity) {
        setShowOtherCity(true);
      }

      // Load existing profile photo if it exists
      if (data.profile_photo_url) {
        setProfilePhotoPreview(data.profile_photo_url);
        console.log('[MemberEditProfile] Loaded existing photo:', data.profile_photo_url);
      }
    } catch (error) {
      console.error('[MemberEditProfile] Error loading member profile:', error);
      showToast('error', 'Failed to load profile data');
    }
  }, [member, showToast]);

  const loadStates = useCallback(async () => {
    try {
      setIsLoadingStates(true);
      const states = await statesService.getPublicPaymentStates();
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
      setIsLoadingDesignations(true);
      const designations = await companyDesignationsService.getActiveDesignations();
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
      console.log('[loadDistricts] Loading districts for state:', stateName);
      setIsLoadingDistricts(true);
      const districts = await locationsService.getActiveDistrictsByStateName(stateName);
      console.log('[loadDistricts] Loaded districts:', districts.length, districts);
      setAvailableDistricts(districts);
    } catch (error) {
      console.error('[loadDistricts] Error loading districts:', error);
      showToast('error', 'Failed to load districts');
    } finally {
      setIsLoadingDistricts(false);
    }
  }, [showToast]);

  const loadCities = useCallback(async (districtId: string) => {
    try {
      setIsLoadingCities(true);
      const cities = await locationsService.getActiveCitiesByDistrictId(districtId);
      setAvailableCities(cities);

      if (cities.length === 0) {
        setShowOtherCity(true);
      }
    } catch (error) {
      console.error('Error loading cities:', error);
      showToast('error', 'Failed to load cities');
    } finally {
      setIsLoadingCities(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadStates();
    void loadDesignations();
  }, [loadDesignations, loadStates]);

  useEffect(() => {
    if (!isPreviewMode && member?.id) {
      void loadMemberProfile();
    }
  }, [isPreviewMode, loadMemberProfile, member?.id]);

  useEffect(() => {
    console.log('[useEffect state] State changed to:', formData.state);
    if (formData.state) {
      console.log('[useEffect state] Calling loadDistricts...');
      void loadDistricts(formData.state);
    } else {
      console.log('[useEffect state] Clearing districts');
      setAvailableDistricts([]);
      setAvailableCities([]);
      setSelectedDistrictId('');
      setShowOtherCity(false);
    }
  }, [formData.state, loadDistricts]);

  useEffect(() => {
    if (selectedDistrictId) {
      void loadCities(selectedDistrictId);
    } else {
      setAvailableCities([]);
      setShowOtherCity(false);
    }
  }, [loadCities, selectedDistrictId]);

  useEffect(() => {
    if (formData.district && availableDistricts.length > 0) {
      const selectedDistrict = availableDistricts.find(d => d.district_name === formData.district);
      if (selectedDistrict) {
        setSelectedDistrictId(selectedDistrict.district_id);
      }
    }
  }, [availableDistricts, formData.district]);

  useEffect(() => {
    if (member && member.state && !isLoadingStates) {
      console.log('[useEffect initial] Loading districts for member state:', member.state);
      void loadDistricts(member.state);
    }
  }, [isLoadingStates, loadDistricts, member]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    // Auto-convert email and website to lowercase
    const processedValue = (name === 'email' || name === 'website') ? value.toLowerCase() : value;

    setFormData(prev => ({
      ...prev,
      [name]: processedValue
    }));
    setIsVerifiedForSubmit(false);

    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }

    // Handle special cases
    if (name === 'city' && value === 'Other') {
      setShowOtherCity(true);
      setFormData(prev => ({ ...prev, is_custom_city: true }));
    } else if (name === 'city' && value !== 'Other') {
      setShowOtherCity(false);
      setFormData(prev => ({ ...prev, is_custom_city: false, other_city_name: '' }));
    }

    if (name === 'district') {
      const selectedDistrict = availableDistricts.find(d => d.district_name === value);
      if (selectedDistrict) {
        setSelectedDistrictId(selectedDistrict.district_id);
      } else {
        setSelectedDistrictId('');
      }
      // Clear city when district changes
      setFormData(prev => ({ ...prev, city: '', other_city_name: '', is_custom_city: false }));
    }

    if (name === 'state') {
      console.log('[handleChange] State changed to:', value);
      // Clear dependent fields when state changes
      setFormData(prev => ({
        ...prev,
        district: '',
        city: '',
        other_city_name: '',
        is_custom_city: false
      }));
      setSelectedDistrictId('');
      setShowOtherCity(false);
      // Note: Districts will be loaded by useEffect when formData.state changes
    }
  };

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Remove non-numeric characters
    let numericValue = value.replace(/\D/g, '');

    // Prevent 0 as first digit
    if (numericValue.length > 0 && numericValue[0] === '0') {
      numericValue = numericValue.substring(1);
    }

    setFormData(prev => ({ ...prev, [name]: numericValue }));
    setIsVerifiedForSubmit(false);

    // Clear error
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateDocumentFile = (file: File): string | null => {
    if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
      return 'Only PDF, JPG, JPEG, and PNG files are allowed';
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      return 'File size must be 10MB or less';
    }
    return null;
  };

  const handleDocumentFileChange = (fileType: keyof typeof documentFiles, file: File | null) => {
    if (!file) {
      setDocumentFiles(prev => ({ ...prev, [fileType]: null }));
      return;
    }

    const validationError = validateDocumentFile(file);
    if (validationError) {
      showToast('error', validationError);
      return;
    }

    setDocumentFiles(prev => ({ ...prev, [fileType]: file }));
    setIsVerifiedForSubmit(false);
  };

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

    // Mark as changed to enable Submit button - use a marker value
    setFormData(prev => ({ ...prev, profile_photo_url: '__NEW_PHOTO__' }));
  };

  const handleRemovePhoto = () => {
    setProfilePhoto(null);
    setProfilePhotoPreview('');
    setPhotoFileName('');
    setPhotoImageSrc('');

    const fileInput = document.getElementById('profile-photo-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }

    // Mark as removed to enable Submit button
    setFormData(prev => ({ ...prev, profile_photo_url: '' }));
    setIsVerifiedForSubmit(false);
  };

  const handleCropError = (error: string) => {
    showToast('error', error);
  };

  const hasFormChanges = (): boolean => {
    if (documentFiles.gstCertificate || documentFiles.udyamCertificate || documentFiles.paymentProof) {
      return true;
    }
    return JSON.stringify(formData) !== JSON.stringify(originalData);
  };

  const detectChangedFields = (): string[] => {
    const changed: string[] = [];

    Object.keys(formData).forEach(key => {
      const typedKey = key as keyof typeof formData;
      const currentValue = formData[typedKey];
      const originalValue = originalData[typedKey];

      // Convert to strings for comparison
      const currentStr = String(currentValue || '').trim();
      const originalStr = String(originalValue || '').trim();

      if (currentStr !== originalStr) {
        changed.push(key);
      }
    });

    if (documentFiles.gstCertificate) {
      changed.push('gst_certificate_url');
    }
    if (documentFiles.udyamCertificate) {
      changed.push('udyam_certificate_url');
    }
    if (documentFiles.paymentProof) {
      changed.push('payment_proof_url');
    }

    return changed;
  };

  const fallbackFieldLabel = useCallback((fieldName: string): string => {
    return fieldName
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }, []);

  const getRequiredValidationIssue = useCallback(
    (fieldName: string, data: typeof formData = formData): { errorKey: string; message: string } | null => {
      if (fieldName === 'is_custom_city' || fieldName === 'profile_photo_url' || fieldName === 'other_city_name') {
        return null;
      }

      if (fieldName === 'city') {
        if (!isFieldRequired('city') || !isFieldApplicable('city', data)) {
          return null;
        }

        const usesOtherCity = Boolean(data.is_custom_city || showOtherCity);
        if (usesOtherCity) {
          if (!String(data.other_city_name ?? '').trim()) {
            return { errorKey: 'other_city_name', message: 'City name is required' };
          }
          return null;
        }

        if (!String(data.city ?? '').trim()) {
          return { errorKey: 'city', message: 'City is required' };
        }
        return null;
      }

      if (!isFieldRequired(fieldName) || !isFieldApplicable(fieldName, data)) {
        return null;
      }

      if (fieldName === 'gst_certificate_url') {
        const hasExisting = Boolean(String(data.gst_certificate_url ?? '').trim());
        const hasSelected = Boolean(documentFiles.gstCertificate);
        if (!hasExisting && !hasSelected) {
          return { errorKey: 'gst_certificate_url', message: REQUIRED_MESSAGE_OVERRIDES.gst_certificate_url };
        }
        return null;
      }

      if (fieldName === 'udyam_certificate_url') {
        const hasExisting = Boolean(String(data.udyam_certificate_url ?? '').trim());
        const hasSelected = Boolean(documentFiles.udyamCertificate);
        if (!hasExisting && !hasSelected) {
          return { errorKey: 'udyam_certificate_url', message: REQUIRED_MESSAGE_OVERRIDES.udyam_certificate_url };
        }
        return null;
      }

      if (fieldName === 'payment_proof_url') {
        const hasExisting = Boolean(String(data.payment_proof_url ?? '').trim());
        const hasSelected = Boolean(documentFiles.paymentProof);
        if (!hasExisting && !hasSelected) {
          return { errorKey: 'payment_proof_url', message: REQUIRED_MESSAGE_OVERRIDES.payment_proof_url };
        }
        return null;
      }

      const rawValue = data[fieldName as keyof typeof formData];
      if (String(rawValue ?? '').trim()) {
        return null;
      }

      const fallbackLabel = fallbackFieldLabel(fieldName);
      const label = resolveFieldLabel(fieldName, fallbackLabel);
      return {
        errorKey: fieldName,
        message: REQUIRED_MESSAGE_OVERRIDES[fieldName] ?? `${label} is required`
      };
    },
    [documentFiles.gstCertificate, documentFiles.paymentProof, documentFiles.udyamCertificate, fallbackFieldLabel, formData, isFieldApplicable, isFieldRequired, resolveFieldLabel, showOtherCity]
  );

  const validateFieldLive = useCallback(
    async (fieldName: string, data: typeof formData = formData): Promise<{ errorKey: string; message: string }> => {
      if (fieldName === 'other_city_name') {
        const cityRequiredIssue = getRequiredValidationIssue('city', data);
        if (cityRequiredIssue?.errorKey === 'other_city_name') {
          return cityRequiredIssue;
        }
        return { errorKey: 'other_city_name', message: '' };
      }

      if (MEMBER_EDIT_NON_VALIDATED_FIELDS.has(fieldName)) {
        return { errorKey: fieldName, message: '' };
      }

      if (!isFieldApplicable(fieldName, data)) {
        return { errorKey: fieldName, message: '' };
      }

      const requiredIssue = getRequiredValidationIssue(fieldName, data);
      if (requiredIssue) {
        return requiredIssue;
      }

      const rawValue = data[fieldName as keyof typeof formData];
      const value = String(rawValue ?? '').trim();
      if (!value) {
        return { errorKey: fieldName, message: '' };
      }

      const validationResult = await validateFieldByRule(fieldName, value);
      return {
        errorKey: fieldName,
        message: validationResult.isValid ? '' : (validationResult.message || 'Invalid value')
      };
    },
    [formData, getRequiredValidationIssue, isFieldApplicable, validateFieldByRule]
  );

  const handleFormBlurCapture = useCallback(
    (event: React.FocusEvent<HTMLFormElement>) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const fieldName = target.name;
      if (!fieldName) {
        return;
      }

      if (fieldName !== 'other_city_name' && !Object.prototype.hasOwnProperty.call(formData, fieldName)) {
        return;
      }

      void validateFieldLive(fieldName).then(({ errorKey, message }) => {
        setErrors(prev => ({ ...prev, [errorKey]: message }));
      });
    },
    [formData, validateFieldLive]
  );

  const validateForm = async (): Promise<boolean> => {
    const newErrors: { [key: string]: string } = {};
    const requiredCheckFields = new Set<string>(Object.keys(formData));
    requiredCheckFields.add('city');

    for (const fieldName of requiredCheckFields) {
      const issue = getRequiredValidationIssue(fieldName, formData);
      if (issue && !newErrors[issue.errorKey]) {
        newErrors[issue.errorKey] = issue.message;
      }
    }

    for (const fieldName of Object.keys(formData)) {
      if (MEMBER_EDIT_NON_VALIDATED_FIELDS.has(fieldName)) {
        continue;
      }

      if (!isFieldApplicable(fieldName, formData)) {
        continue;
      }

      if (newErrors[fieldName]) {
        continue;
      }

      const rawValue = formData[fieldName as keyof typeof formData];
      const value = String(rawValue ?? '').trim();
      if (!value) {
        continue;
      }

      const charCount = value.length;
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

      const validationResult = await validateFieldByRule(fieldName, value);
      if (!validationResult.isValid) {
        newErrors[fieldName] = validationResult.message || 'Invalid value';
      }
    }

    latestErrorsRef.current = newErrors;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleVerify = async () => {
    if (!member) {
      showToast('error', 'Member data not available');
      return;
    }

    setIsVerifying(true);
    try {
      const isValid = await validateForm();
      if (!isValid) {
        showToast('error', 'Please fix all validation errors before verifying');
        scrollToFirstError(latestErrorsRef.current);
        return;
      }

      const changedFields = detectChangedFields();

      if (changedFields.length === 0) {
        showToast('error', 'No changes detected');
        return;
      }

      const normalizationPayload: Record<string, string> = {};
      const normalizationFields: Array<keyof typeof formData> = [
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

      const result = await normalizeMemberData(normalizationPayload);
      const correctedFields = getCorrectionFields(result);

      if (correctedFields.length > 0) {
        setCorrectionSnapshot(formData);
        setCorrectionFields(correctedFields);
        setShowCorrectionStepper(true);
      } else {
        setIsVerifiedForSubmit(true);
        focusSubmitButton();
        showToast('success', 'Your details are ready. Please click Submit.');
      }
    } catch (error) {
      console.error('[MemberEditProfile] Error in handleVerify:', error);
      setIsVerifiedForSubmit(false);
      showToast('error', 'This is a technical error. Please contact system Admin');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!member) {
      showToast('error', 'Member data not available');
      return;
    }

    if (!isVerifiedForSubmit) {
      showToast('error', 'Please click Verify before submitting.');
      return;
    }

    await saveProfileData(formData);
  };

  const saveProfileData = async (dataToSave: typeof formData) => {
    setIsSaving(true);

    try {
      console.log('[saveProfileData] Starting profile save process...');

      // Step 1: Handle profile photo upload if there's a new photo
      let finalPhotoUrl = dataToSave.profile_photo_url;
      let oldPhotoUrl: string | null = null;
      let finalGstCertificateUrl = dataToSave.gst_certificate_url || null;
      let finalUdyamCertificateUrl = dataToSave.udyam_certificate_url || null;
      let finalPaymentProofUrl = dataToSave.payment_proof_url || null;

      if (dataToSave.profile_photo_url === '__NEW_PHOTO__' && profilePhoto && photoFileName) {
        console.log('[saveProfileData] New photo detected, uploading to storage...');

        // Store old photo URL for cleanup after successful upload
        oldPhotoUrl = originalData.profile_photo_url || null;

        try {
          // Upload new photo to Supabase storage
          const uploadedPhotoUrl = await fileUploadService.uploadProfilePhoto(
            profilePhoto,
            photoFileName
          );

          if (!uploadedPhotoUrl) {
            throw new Error('Failed to upload profile photo');
          }

          console.log('[saveProfileData] Photo uploaded successfully:', uploadedPhotoUrl);
          finalPhotoUrl = uploadedPhotoUrl;

        } catch (photoError) {
          console.error('[saveProfileData] Photo upload failed:', photoError);
          showToast('error', 'Failed to upload profile photo. Please try again.');
          setIsSaving(false);
          return; // Stop the save process if photo upload fails
        }
      } else if (dataToSave.profile_photo_url === '__NEW_PHOTO__') {
        // Shouldn't happen, but handle edge case where __NEW_PHOTO__ is set but no blob exists
        console.warn('[saveProfileData] __NEW_PHOTO__ flag set but no photo blob found');
        finalPhotoUrl = originalData.profile_photo_url || null;
      }

      const documentUploadQueue: Array<{
        file: File | null;
        prefix: string;
        fieldLabel: string;
        onSuccess: (url: string) => void;
      }> = [
        {
          file: documentFiles.gstCertificate,
          prefix: 'gst',
          fieldLabel: 'GST certificate',
          onSuccess: (url: string) => {
            finalGstCertificateUrl = url;
          }
        },
        {
          file: documentFiles.udyamCertificate,
          prefix: 'udyam',
          fieldLabel: 'UDYAM certificate',
          onSuccess: (url: string) => {
            finalUdyamCertificateUrl = url;
          }
        },
        {
          file: documentFiles.paymentProof,
          prefix: 'payment',
          fieldLabel: 'Payment proof',
          onSuccess: (url: string) => {
            finalPaymentProofUrl = url;
          }
        }
      ];

      for (const uploadTask of documentUploadQueue) {
        if (!uploadTask.file) {
          continue;
        }

        const extension = uploadTask.file.name.includes('.')
          ? uploadTask.file.name.split('.').pop()?.toLowerCase()
          : null;
        const fileName = `${uploadTask.prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${extension ? `.${extension}` : ''}`;
        const uploadedUrl = await fileUploadService.uploadFile(uploadTask.file, fileName, 'registrations');
        if (!uploadedUrl) {
          throw new Error(`Failed to upload ${uploadTask.fieldLabel}`);
        }
        uploadTask.onSuccess(uploadedUrl);
      }

      if (!memberRegistrationId) {
        showToast('error', 'Failed to load profile data');
        setIsSaving(false);
        return;
      }

      console.log('[saveProfileData] Calling update_member_profile RPC...');
      console.log('[saveProfileData] Parameters:', {
        p_member_registration_id: memberRegistrationId,
        p_user_id: member!.id,
        finalPhotoUrl
      });

      const emailChanged = dataToSave.email !== originalData.email;
      const mobileChanged = dataToSave.mobile_number !== originalData.mobile_number;
      const mergedData = { ...originalData, ...dataToSave };

      // Step 2: Call RPC function to update profile data
      const { data: rpcResult, error: rpcError } = await supabase.rpc('update_member_profile', {
        p_member_registration_id: memberRegistrationId,
        p_user_id: member!.id,
        p_data: {
          full_name: mergedData.full_name?.trim(),
          email: emailChanged ? originalData.email?.trim() : mergedData.email?.trim(),
          mobile_number: mobileChanged ? originalData.mobile_number?.trim() : mergedData.mobile_number?.trim(),
          gender: mergedData.gender || null,
          date_of_birth: mergedData.date_of_birth || null,
          company_name: mergedData.company_name?.trim(),
          company_designation_id: mergedData.company_designation_id || null,
          company_address: mergedData.company_address?.trim(),
          state: mergedData.state || null,
          district: mergedData.district || null,
          city: mergedData.city || null,
          is_custom_city: mergedData.is_custom_city || false,
          other_city_name: mergedData.other_city_name || null,
          pin_code: mergedData.pin_code || null,
          industry: mergedData.industry || null,
          activity_type: mergedData.activity_type || null,
          constitution: mergedData.constitution || null,
          annual_turnover: mergedData.annual_turnover || null,
          number_of_employees: mergedData.number_of_employees || null,
          products_services: mergedData.products_services?.trim(),
          brand_names: mergedData.brand_names || null,
          website: mergedData.website || null,
          gst_registered: mergedData.gst_registered || null,
          gst_number: mergedData.gst_number || null,
          gst_certificate_url: finalGstCertificateUrl,
          pan_company: mergedData.pan_company?.trim(),
          esic_registered: mergedData.esic_registered || null,
          epf_registered: mergedData.epf_registered || null,
          udyam_certificate_url: finalUdyamCertificateUrl,
          member_id: mergedData.member_id || null,
          referred_by: mergedData.referred_by?.trim() || null,
          amount_paid: mergedData.amount_paid || null,
          payment_date: mergedData.payment_date || null,
          payment_mode: mergedData.payment_mode || null,
          transaction_id: mergedData.transaction_id || null,
          bank_reference: mergedData.bank_reference || null,
          payment_proof_url: finalPaymentProofUrl,
          alternate_contact_name: mergedData.alternate_contact_name || null,
          alternate_mobile: mergedData.alternate_mobile || null,
          profile_photo_url: finalPhotoUrl || null
        }
      });

      if (rpcError) {
        console.error('[saveProfileData] Error calling update_member_profile RPC:', rpcError);
        throw rpcError;
      }

      console.log('[saveProfileData] RPC call successful:', rpcResult);
      console.log('[saveProfileData] member_registrations updated successfully');

      // Step 3: Delete old photo from storage if new photo was uploaded successfully
      if (oldPhotoUrl && finalPhotoUrl && oldPhotoUrl !== finalPhotoUrl) {
        console.log('[saveProfileData] Deleting old photo from storage:', oldPhotoUrl);
        try {
          const deleted = await fileUploadService.deleteProfilePhoto(oldPhotoUrl);
          if (deleted) {
            console.log('[saveProfileData] Old photo deleted successfully');
          } else {
            console.warn('[saveProfileData] Failed to delete old photo, but continuing');
          }
        } catch (deleteError) {
          // Non-critical error - log but don't fail the save
          console.warn('[saveProfileData] Error deleting old photo:', deleteError);
        }
      }

      // Step 4: Update login credentials through credential RPCs if needed
      if (emailChanged || mobileChanged) {
        console.log('[saveProfileData] Updating login credentials through RPCs...');

        if (emailChanged) {
          const emailResult = await changeEmail(dataToSave.email.trim());
          if (!emailResult.success) {
            throw new Error(emailResult.error || 'Failed to update email address');
          }
        }

        if (mobileChanged) {
          const mobileResult = await changeMobile(dataToSave.mobile_number.trim());
          if (!mobileResult.success) {
            throw new Error(mobileResult.error || 'Failed to update mobile number');
          }
        }
      }

      // Step 6: Success - update originalData and display the new photo
      const updatedData = {
        ...mergedData,
        profile_photo_url: finalPhotoUrl || '',
        gst_certificate_url: finalGstCertificateUrl || '',
        udyam_certificate_url: finalUdyamCertificateUrl || '',
        payment_proof_url: finalPaymentProofUrl || ''
      };
      setOriginalData(updatedData);
      setFormData(updatedData);

      // Clear photo upload state but keep the preview showing the uploaded photo
      setProfilePhoto(null);
      setProfilePhotoPreview(finalPhotoUrl || ''); // Show the newly uploaded photo
      setPhotoFileName('');
      setPhotoImageSrc('');
      setDocumentFiles({
        gstCertificate: null,
        udyamCertificate: null,
        paymentProof: null
      });

      // Refresh MemberContext to update the cache and Header photo
      console.log('[saveProfileData] Refreshing MemberContext cache...');
      await refreshMember();
      console.log('[saveProfileData] MemberContext cache refreshed');

      showToast('success', 'Profile updated successfully!');

      console.log('[saveProfileData] All updates completed successfully');

    } catch (error) {
      console.error('[saveProfileData] Error:', error);
      showToast('error', 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
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
    if (correctionSnapshot) {
      setFormData(correctionSnapshot);
    }
  }, [correctionSnapshot]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading profile editor...</p>
        </div>
      </div>
    );
  }

  if (!member && !isPreviewMode) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-foreground font-medium mb-2">Unable to load your profile</p>
          <p className="text-muted-foreground mb-4">Please try again or contact support</p>
          <Link
            to="/dashboard"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 inline-block"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (isPreviewMode && fieldConfigErrorCode === 'access_denied') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md px-6">
          <Lock className="w-12 h-12 text-muted-foreground/60 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Admin Preview Only</h2>
          <p className="text-muted-foreground mb-4">Draft form preview requires admin permissions. Sign in with an admin account to preview the member edit form.</p>
          <Link to="/dashboard" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 inline-block">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (isPreviewMode && fieldConfigErrorCode === 'load_failed') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md px-6">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Preview Unavailable</h2>
          <p className="text-muted-foreground mb-4">Failed to load draft form configuration for preview.</p>
          <Link to="/dashboard" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 inline-block">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <button
            onClick={() => navigate(isPreviewMode ? '/admin/form-studio/member_edit' : '/dashboard/profile')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            {isPreviewMode ? 'Back to Studio' : 'Back to Profile'}
          </button>
        </div>

        <div className="bg-card rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-6 border-b border-border">
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <User className="w-6 h-6" />
              Edit Profile
            </h1>
            <p className="text-muted-foreground mt-1">Update your profile information</p>
          </div>

          {isPreviewMode && (
            <div className="bg-muted/40 border-b border-border px-6 py-3 flex items-center gap-2 text-muted-foreground text-sm">
              <Eye className="w-4 h-4 flex-shrink-0" />
              <span><strong className="text-foreground">Draft Preview</strong> — Viewing draft field configuration. Changes cannot be saved in preview mode.</span>
            </div>
          )}

          <form onSubmit={handleSubmit} onBlurCapture={handleFormBlurCapture} className="p-6 space-y-8">
            {/* Section 1: Personal Information */}
            <div>
              <h2 className="text-section font-semibold text-foreground mb-4 flex items-center gap-2 pb-2 border-b border-border">
                <User className="w-5 h-5 text-primary" />
                Personal Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isFieldVisible('full_name') && (
                <div>
                  <label htmlFor="full_name" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('full_name', 'Full Name')} {isFieldRequired('full_name') && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    type="text"
                    id="full_name"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    placeholder={resolveFieldPlaceholder('full_name', 'Enter your full name')}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.full_name ? 'border-destructive' : 'border-border'
                    }`}
                    required={isFieldRequired('full_name')}
                    maxLength={getFieldMaxLength('full_name') ?? undefined}
                  />
                  {errors.full_name && <p className="text-destructive text-sm mt-1">{errors.full_name}</p>}
                </div>
                )}

                {isFieldVisible('gender') && (
                <div>
                  <label htmlFor="gender" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('gender', 'Gender')} {isFieldRequired('gender') && <span className="text-destructive">*</span>}
                  </label>
                  <select
                    id="gender"
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.gender ? 'border-destructive' : 'border-border'
                    }`}
                    required={isFieldRequired('gender')}
                  >
                    <option key="__placeholder" value="">
                      {resolveFieldPlaceholder('gender', 'Select Gender')}
                    </option>
                    {resolveFieldOptions('gender', ['Male', 'Female']).map(option => (
                      <option key={option} value={option.toLowerCase()}>{option}</option>
                    ))}
                  </select>
                  {errors.gender && <p className="text-destructive text-sm mt-1">{errors.gender}</p>}
                </div>
                )}

                {isFieldVisible('date_of_birth') && (
                <div>
                  <label htmlFor="date_of_birth" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('date_of_birth', 'Date of Birth')} {isFieldRequired('date_of_birth') && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    type="date"
                    id="date_of_birth"
                    name="date_of_birth"
                    value={formData.date_of_birth}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.date_of_birth ? 'border-destructive' : 'border-border'
                    }`}
                    required={isFieldRequired('date_of_birth')}
                  />
                  {errors.date_of_birth && <p className="text-destructive text-sm mt-1">{errors.date_of_birth}</p>}
                </div>
                )}

                {/* Profile Photo */}
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
                          Your profile photo has been cropped and will be uploaded with your profile changes.
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="file"
                            id="profile-photo-input"
                            accept="image/jpeg,image/jpg,image/png"
                            onChange={handlePhotoSelect}
                            className="hidden"
                          />
                          <label
                            htmlFor="profile-photo-input"
                            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors cursor-pointer"
                          >
                            <Upload className="w-4 h-4 mr-1" />
                            Upload New
                          </label>
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
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1 flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    {resolveFieldLabel('email', 'Email Address')} {isFieldRequired('email') && <span className="text-destructive">*</span>}
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        disabled={!isEmailEditable}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                          !isEmailEditable ? 'bg-muted/50 text-muted-foreground cursor-not-allowed' : ''
                        } ${errors.email ? 'border-destructive' : 'border-border'}`}
                        required={isFieldRequired('email')}
                        maxLength={getFieldMaxLength('email') ?? undefined}
                      />
                      {!isEmailEditable && (
                        <Lock className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowEmailModal(true)}
                      className="px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <Unlock className="w-4 h-4" />
                      Change
                    </button>
                  </div>
                  {errors.email && <p className="text-destructive text-sm mt-1">{errors.email}</p>}
                  {!isEmailEditable && (
                    <p className="text-xs text-muted-foreground mt-1">Click "Change" to edit email</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1 flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    {resolveFieldLabel('mobile_number', 'Mobile Number')} {isFieldRequired('mobile_number') && <span className="text-destructive">*</span>}
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        name="mobile_number"
                        value={formData.mobile_number}
                        onChange={handleMobileChange}
                        disabled={!isMobileEditable}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                          !isMobileEditable ? 'bg-muted/50 text-muted-foreground cursor-not-allowed' : ''
                        } ${errors.mobile_number ? 'border-destructive' : 'border-border'}`}
                        required={isFieldRequired('mobile_number')}
                        maxLength={getFieldMaxLength('mobile_number') ?? undefined}
                      />
                      {!isMobileEditable && (
                        <Lock className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMobileModal(true)}
                      className="px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <Unlock className="w-4 h-4" />
                      Change
                    </button>
                  </div>
                  {errors.mobile_number && <p className="text-destructive text-sm mt-1">{errors.mobile_number}</p>}
                  {!isMobileEditable && (
                    <p className="text-xs text-muted-foreground mt-1">Click "Change" to edit mobile</p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 2: Company Information */}
            <div>
              <h2 className="text-section font-semibold text-foreground mb-4 flex items-center gap-2 pb-2 border-b border-border">
                <Building className="w-5 h-5 text-primary" />
                Company Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isFieldVisible('company_name') && (
                <div>
                  <label htmlFor="company_name" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('company_name', 'Company Name')} {isFieldRequired('company_name') && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    type="text"
                    id="company_name"
                    name="company_name"
                    value={formData.company_name}
                    onChange={handleChange}
                    placeholder={resolveFieldPlaceholder('company_name', 'Enter company name')}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.company_name ? 'border-destructive' : 'border-border'
                    }`}
                    required={isFieldRequired('company_name')}
                    maxLength={getFieldMaxLength('company_name') ?? undefined}
                  />
                  {errors.company_name && <p className="text-destructive text-sm mt-1">{errors.company_name}</p>}
                </div>
                )}

                {isFieldVisible('company_designation_id') && (
                <div>
                  <label htmlFor="company_designation_id" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('company_designation_id', 'Designation')} {isFieldRequired('company_designation_id') && <span className="text-destructive">*</span>}
                  </label>
                  <select
                    id="company_designation_id"
                    name="company_designation_id"
                    value={formData.company_designation_id}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.company_designation_id ? 'border-destructive' : 'border-border'
                    }`}
                    disabled={isLoadingDesignations}
                  >
                    <option key="__placeholder" value="">
                      {resolveFieldPlaceholder('company_designation_id', 'Select Designation')}
                    </option>
                    {availableDesignations.map(des => (
                      <option key={des.id} value={des.id}>{des.designation_name}</option>
                    ))}
                  </select>
                  {errors.company_designation_id && <p className="text-destructive text-sm mt-1">{errors.company_designation_id}</p>}
                </div>
                )}

                {isFieldVisible('company_address') && (
                <div className="md:col-span-2">
                  <label htmlFor="company_address" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('company_address', 'Company Address')} {isFieldRequired('company_address') && <span className="text-destructive">*</span>}
                  </label>
                  <textarea
                    id="company_address"
                    name="company_address"
                    value={formData.company_address}
                    onChange={handleChange}
                    rows={3}
                    placeholder={resolveFieldPlaceholder('company_address', 'Enter company address')}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.company_address ? 'border-destructive' : 'border-border'
                    }`}
                    required={isFieldRequired('company_address')}
                    maxLength={getFieldMaxLength('company_address') ?? undefined}
                  />
                  {errors.company_address && <p className="text-destructive text-sm mt-1">{errors.company_address}</p>}
                </div>
                )}

                {isFieldVisible('state') && (
                <div>
                  <label htmlFor="state" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('state', 'State')} {isFieldRequired('state') && <span className="text-destructive">*</span>}
                  </label>
                  <select
                    id="state"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.state ? 'border-destructive' : 'border-border'
                    }`}
                    disabled={isLoadingStates}
                    required={isFieldRequired('state')}
                  >
                    <option key="__placeholder" value="">{resolveFieldPlaceholder('state', 'Select State')}</option>
                    {availableStates.map(state => (
                      <option key={state.id} value={state.state}>{state.state}</option>
                    ))}
                  </select>
                  {errors.state && <p className="text-destructive text-sm mt-1">{errors.state}</p>}
                </div>
                )}

                {isFieldVisible('district') && (
                <div>
                  <label htmlFor="district" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('district', 'District')} {isFieldRequired('district') && <span className="text-destructive">*</span>}
                  </label>
                  <select
                    id="district"
                    name="district"
                    value={formData.district}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.district ? 'border-destructive' : 'border-border'
                    }`}
                    disabled={!formData.state || isLoadingDistricts}
                    required={isFieldRequired('district')}
                  >
                    <option key="__placeholder" value="">{resolveFieldPlaceholder('district', 'Select District')}</option>
                    {availableDistricts.map(district => (
                      <option key={district.district_id} value={district.district_name}>{district.district_name}</option>
                    ))}
                  </select>
                  {errors.district && <p className="text-destructive text-sm mt-1">{errors.district}</p>}
                </div>
                )}

                {isFieldVisible('city') && (
                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('city', 'City')} {isFieldRequired('city') && <span className="text-destructive">*</span>}
                  </label>
                  <select
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.city ? 'border-destructive' : 'border-border'
                    }`}
                    disabled={!selectedDistrictId || isLoadingCities}
                    required={isFieldRequired('city')}
                  >
                    <option key="__placeholder" value="">{resolveFieldPlaceholder('city', 'Select City')}</option>
                    {availableCities.map(city => (
                      <option key={city.city_id} value={city.city_name}>{city.city_name}</option>
                    ))}
                    <option key="other" value="Other">Other</option>
                  </select>
                  {errors.city && <p className="text-destructive text-sm mt-1">{errors.city}</p>}
                </div>
                )}

                {showOtherCity && isFieldVisible('city') && (
                  <div>
                    <label htmlFor="other_city_name" className="block text-sm font-medium text-foreground mb-1">
                      {resolveFieldLabel('other_city_name', 'City Name')} {isFieldRequired('other_city_name') && <span className="text-destructive">*</span>}
                    </label>
                    <input
                      type="text"
                      id="other_city_name"
                      name="other_city_name"
                      value={formData.other_city_name}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.other_city_name ? 'border-destructive' : 'border-border'
                      }`}
                      placeholder={resolveFieldPlaceholder('other_city_name', 'Enter city name')}
                      required={isFieldRequired('other_city_name')}
                    />
                    {errors.other_city_name && <p className="text-destructive text-sm mt-1">{errors.other_city_name}</p>}
                  </div>
                )}

                {isFieldVisible('pin_code') && (
                <div>
                  <label htmlFor="pin_code" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('pin_code', 'PIN Code')} {isFieldRequired('pin_code') && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    type="text"
                    id="pin_code"
                    name="pin_code"
                    value={formData.pin_code}
                    onChange={handleMobileChange}
                    placeholder={resolveFieldPlaceholder('pin_code', 'Enter PIN code')}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.pin_code ? 'border-destructive' : 'border-border'
                    }`}
                    required={isFieldRequired('pin_code')}
                    maxLength={getFieldMaxLength('pin_code') ?? undefined}
                  />
                  {errors.pin_code && <p className="text-destructive text-sm mt-1">{errors.pin_code}</p>}
                </div>
                )}
              </div>
            </div>

            {/* Section 3: Business Details */}
            <div>
              <h2 className="text-section font-semibold text-foreground mb-4 flex items-center gap-2 pb-2 border-b border-border">
                <FileText className="w-5 h-5 text-primary" />
                Business Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isFieldVisible('industry') && (
                <div>
                  <label htmlFor="industry" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('industry', 'Industry')} {isFieldRequired('industry') && <span className="text-destructive">*</span>}
                  </label>
                  <select
                    id="industry"
                    name="industry"
                    value={formData.industry}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.industry ? 'border-destructive' : 'border-border'
                    }`}
                    required={isFieldRequired('industry')}
                  >
                    <option key="__placeholder" value="">{resolveFieldPlaceholder('industry', 'Select Industry')}</option>
                    {resolveFieldOptions('industry', INDUSTRY_OPTIONS).map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  {errors.industry && <p className="text-destructive text-sm mt-1">{errors.industry}</p>}
                </div>
                )}

                {isFieldVisible('activity_type') && (
                <div>
                  <label htmlFor="activity_type" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('activity_type', 'Activity Type')} {isFieldRequired('activity_type') && <span className="text-destructive">*</span>}
                  </label>
                  <select
                    id="activity_type"
                    name="activity_type"
                    value={formData.activity_type}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.activity_type ? 'border-destructive' : 'border-border'
                    }`}
                    required={isFieldRequired('activity_type')}
                  >
                    <option key="__placeholder" value="">{resolveFieldPlaceholder('activity_type', 'Select Activity Type')}</option>
                    {resolveFieldOptions('activity_type', ACTIVITY_TYPE_OPTIONS).map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  {errors.activity_type && <p className="text-destructive text-sm mt-1">{errors.activity_type}</p>}
                </div>
                )}

                {isFieldVisible('constitution') && (
                <div>
                  <label htmlFor="constitution" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('constitution', 'Industry Constitution')} {isFieldRequired('constitution') && <span className="text-destructive">*</span>}
                  </label>
                  <select
                    id="constitution"
                    name="constitution"
                    value={formData.constitution}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.constitution ? 'border-destructive' : 'border-border'
                    }`}
                    required={isFieldRequired('constitution')}
                  >
                    <option key="__placeholder" value="">{resolveFieldPlaceholder('constitution', 'Select Industry Constitution')}</option>
                    {resolveFieldOptions('constitution', CONSTITUTION_OPTIONS).map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  {errors.constitution && <p className="text-destructive text-sm mt-1">{errors.constitution}</p>}
                </div>
                )}

                {isFieldVisible('annual_turnover') && (
                <div>
                  <label htmlFor="annual_turnover" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('annual_turnover', 'Annual Turnover')} {isFieldRequired('annual_turnover') && <span className="text-destructive">*</span>}
                  </label>
                  <select
                    id="annual_turnover"
                    name="annual_turnover"
                    value={formData.annual_turnover}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.annual_turnover ? 'border-destructive' : 'border-border'
                    }`}
                    required={isFieldRequired('annual_turnover')}
                  >
                    <option key="__placeholder" value="">{resolveFieldPlaceholder('annual_turnover', 'Select Annual Turnover')}</option>
                    {resolveFieldOptions('annual_turnover', ANNUAL_TURNOVER_OPTIONS).map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  {errors.annual_turnover && <p className="text-destructive text-sm mt-1">{errors.annual_turnover}</p>}
                </div>
                )}

                {isFieldVisible('number_of_employees') && (
                <div>
                  <label htmlFor="number_of_employees" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('number_of_employees', 'Number of Employees')} {isFieldRequired('number_of_employees') && <span className="text-destructive">*</span>}
                  </label>
                  <select
                    id="number_of_employees"
                    name="number_of_employees"
                    value={formData.number_of_employees}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.number_of_employees ? 'border-destructive' : 'border-border'
                    }`}
                    required={isFieldRequired('number_of_employees')}
                  >
                    <option key="__placeholder" value="">{resolveFieldPlaceholder('number_of_employees', 'Select Number of Employees')}</option>
                    {resolveFieldOptions('number_of_employees', EMPLOYEE_COUNT_OPTIONS).map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  {errors.number_of_employees && <p className="text-destructive text-sm mt-1">{errors.number_of_employees}</p>}
                </div>
                )}

                {isFieldVisible('products_services') && (
                <div className="md:col-span-2">
                  <label htmlFor="products_services" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('products_services', 'Products & Services')} {isFieldRequired('products_services') && <span className="text-destructive">*</span>}
                  </label>
                  <textarea
                    id="products_services"
                    name="products_services"
                    value={formData.products_services}
                    onChange={handleChange}
                    rows={3}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.products_services ? 'border-destructive' : 'border-border'
                    }`}
                    placeholder={resolveFieldPlaceholder('products_services', 'Describe your products and services')}
                    required={isFieldRequired('products_services')}
                    maxLength={getFieldMaxLength('products_services') ?? undefined}
                  />
                  {errors.products_services && <p className="text-destructive text-sm mt-1">{errors.products_services}</p>}
                </div>
                )}

                {isFieldVisible('brand_names') && (
                <div>
                  <label htmlFor="brand_names" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('brand_names', 'Brand Names')} {isFieldRequired('brand_names') && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    type="text"
                    id="brand_names"
                    name="brand_names"
                    value={formData.brand_names}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                    placeholder={resolveFieldPlaceholder('brand_names', 'Enter brand names')}
                    maxLength={getFieldMaxLength('brand_names') ?? undefined}
                  />
                </div>
                )}

                {isFieldVisible('website') && (
                <div>
                  <label htmlFor="website" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('website', 'Website')} {isFieldRequired('website') && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    type="text"
                    id="website"
                    name="website"
                    value={formData.website}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.website ? 'border-destructive' : 'border-border'
                    }`}
                    placeholder={resolveFieldPlaceholder('website', 'https://example.com')}
                    maxLength={getFieldMaxLength('website') ?? undefined}
                  />
                  {errors.website && <p className="text-destructive text-sm mt-1">{errors.website}</p>}
                </div>
                )}
              </div>
            </div>

            {/* Section 4: Registration Details */}
            <div>
              <h2 className="text-section font-semibold text-foreground mb-4 flex items-center gap-2 pb-2 border-b border-border">
                <FileText className="w-5 h-5 text-primary" />
                Registration Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isFieldVisible('gst_registered') && (
                <div>
                  <label htmlFor="gst_registered" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('gst_registered', 'GST Registered')} {isFieldRequired('gst_registered') && <span className="text-destructive">*</span>}
                  </label>
                  <select
                    id="gst_registered"
                    name="gst_registered"
                    value={formData.gst_registered}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.gst_registered ? 'border-destructive' : 'border-border'
                    }`}
                    required={isFieldRequired('gst_registered')}
                  >
                    <option key="__placeholder" value="">{resolveFieldPlaceholder('gst_registered', 'Select')}</option>
                    {resolveFieldOptions('gst_registered', ['Yes', 'No']).map(option => (
                      <option key={option} value={option.toLowerCase()}>{option}</option>
                    ))}
                  </select>
                  {errors.gst_registered && <p className="text-destructive text-sm mt-1">{errors.gst_registered}</p>}
                </div>
                )}

                {isFieldApplicable('gst_number') && (
                  <div>
                    <label htmlFor="gst_number" className="block text-sm font-medium text-foreground mb-1">
                      {resolveFieldLabel('gst_number', 'GST Number')} {isFieldRequired('gst_number') && <span className="text-destructive">*</span>}
                    </label>
                    <input
                      type="text"
                      id="gst_number"
                      name="gst_number"
                      value={formData.gst_number}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        errors.gst_number ? 'border-destructive' : 'border-border'
                      }`}
                      placeholder={resolveFieldPlaceholder('gst_number', '22AAAAA0000A1Z5')}
                      required={isFieldRequired('gst_number')}
                      maxLength={getFieldMaxLength('gst_number') ?? undefined}
                    />
                    {errors.gst_number && <p className="text-destructive text-sm mt-1">{errors.gst_number}</p>}
                  </div>
                )}

                {isFieldApplicable('gst_certificate_url') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      {resolveFieldLabel('gst_certificate_url', 'GST Certificate')} {isFieldRequired('gst_certificate_url') && <span className="text-destructive">*</span>}
                    </label>
                    <input
                      id="gst_certificate_url"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(event) => handleDocumentFileChange('gstCertificate', event.target.files?.[0] || null)}
                      className="sr-only"
                    />
                    <label
                      htmlFor="gst_certificate_url"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm text-foreground bg-card hover:bg-muted/50 cursor-pointer transition-colors ${
                        errors.gst_certificate_url ? 'border-destructive' : 'border-border'
                      }`}
                    >
                      <Upload className="w-4 h-4" />
                      {(formData.gst_certificate_url || documentFiles.gstCertificate) ? 'Upload New File' : 'Upload File'}
                    </label>
                    {documentFiles.gstCertificate && (
                      <p className="text-xs text-muted-foreground mt-1">Selected: {documentFiles.gstCertificate.name}</p>
                    )}
                    {!documentFiles.gstCertificate && formData.gst_certificate_url && (
                      <a
                        href={formData.gst_certificate_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline mt-1 inline-block"
                      >
                        View current GST certificate
                      </a>
                    )}
                    {errors.gst_certificate_url && <p className="text-destructive text-sm mt-1">{errors.gst_certificate_url}</p>}
                  </div>
                )}

                {isFieldVisible('pan_company') && (
                <div>
                  <label htmlFor="pan_company" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('pan_company', 'PAN (Company)')} {isFieldRequired('pan_company') && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    type="text"
                    id="pan_company"
                    name="pan_company"
                    value={formData.pan_company}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.pan_company ? 'border-destructive' : 'border-border'
                    }`}
                    placeholder={resolveFieldPlaceholder('pan_company', 'AAAAA0000A')}
                    required={isFieldRequired('pan_company')}
                    maxLength={getFieldMaxLength('pan_company') ?? undefined}
                  />
                  {errors.pan_company && <p className="text-destructive text-sm mt-1">{errors.pan_company}</p>}
                </div>
                )}

                {isFieldVisible('esic_registered') && (
                <div>
                  <label htmlFor="esic_registered" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('esic_registered', 'ESIC Registered')} {isFieldRequired('esic_registered') && <span className="text-destructive">*</span>}
                  </label>
                  <select
                    id="esic_registered"
                    name="esic_registered"
                    value={formData.esic_registered}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.esic_registered ? 'border-destructive' : 'border-border'
                    }`}
                    required={isFieldRequired('esic_registered')}
                  >
                    <option key="__placeholder" value="">{resolveFieldPlaceholder('esic_registered', 'Select')}</option>
                    {resolveFieldOptions('esic_registered', ['Yes', 'No']).map(option => (
                      <option key={option} value={option.toLowerCase()}>{option}</option>
                    ))}
                  </select>
                  {errors.esic_registered && <p className="text-destructive text-sm mt-1">{errors.esic_registered}</p>}
                </div>
                )}

                {isFieldVisible('epf_registered') && (
                <div>
                  <label htmlFor="epf_registered" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('epf_registered', 'EPF Registered')} {isFieldRequired('epf_registered') && <span className="text-destructive">*</span>}
                  </label>
                  <select
                    id="epf_registered"
                    name="epf_registered"
                    value={formData.epf_registered}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.epf_registered ? 'border-destructive' : 'border-border'
                    }`}
                    required={isFieldRequired('epf_registered')}
                  >
                    <option key="__placeholder" value="">{resolveFieldPlaceholder('epf_registered', 'Select')}</option>
                    {resolveFieldOptions('epf_registered', ['Yes', 'No']).map(option => (
                      <option key={option} value={option.toLowerCase()}>{option}</option>
                    ))}
                  </select>
                  {errors.epf_registered && <p className="text-destructive text-sm mt-1">{errors.epf_registered}</p>}
                </div>
                )}

                {isFieldVisible('udyam_certificate_url') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      {resolveFieldLabel('udyam_certificate_url', 'UDYAM Certificate')} {isFieldRequired('udyam_certificate_url') && <span className="text-destructive">*</span>}
                    </label>
                    <input
                      id="udyam_certificate_url"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(event) => handleDocumentFileChange('udyamCertificate', event.target.files?.[0] || null)}
                      className="sr-only"
                    />
                    <label
                      htmlFor="udyam_certificate_url"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm text-foreground bg-card hover:bg-muted/50 cursor-pointer transition-colors ${
                        errors.udyam_certificate_url ? 'border-destructive' : 'border-border'
                      }`}
                    >
                      <Upload className="w-4 h-4" />
                      {(formData.udyam_certificate_url || documentFiles.udyamCertificate) ? 'Upload New File' : 'Upload File'}
                    </label>
                    {documentFiles.udyamCertificate && (
                      <p className="text-xs text-muted-foreground mt-1">Selected: {documentFiles.udyamCertificate.name}</p>
                    )}
                    {!documentFiles.udyamCertificate && formData.udyam_certificate_url && (
                      <a
                        href={formData.udyam_certificate_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline mt-1 inline-block"
                      >
                        View current UDYAM certificate
                      </a>
                    )}
                    {errors.udyam_certificate_url && <p className="text-destructive text-sm mt-1">{errors.udyam_certificate_url}</p>}
                  </div>
                )}

                {/* Field 1: Member ID (Read-only) */}
                <div>
                  <label htmlFor="member_id" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('member_id', 'Member ID')}
                  </label>
                  <input
                    type="text"
                    id="member_id"
                    name="member_id"
                    value={formData.member_id || ''}
                    disabled
                    readOnly
                    className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 text-foreground cursor-not-allowed"
                  />
                </div>

                {/* Field 2: Referred By (Editable) */}
                {isFieldVisible('referred_by') && (
                <div>
                  <label htmlFor="referred_by" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('referred_by', 'Referred By')} {isFieldRequired('referred_by') && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    type="text"
                    id="referred_by"
                    name="referred_by"
                    value={formData.referred_by}
                    onChange={handleChange}
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

                {/* Field 3: Amount Paid (Read-only) */}
                {isFieldVisible('amount_paid') && (
                <div>
                  <label htmlFor="amount_paid" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('amount_paid', 'Amount Paid')}
                  </label>
                  <input
                    type="text"
                    id="amount_paid"
                    name="amount_paid"
                    value={formData.amount_paid || ''}
                    disabled
                    readOnly
                    className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 text-foreground cursor-not-allowed"
                  />
                </div>
                )}

                {/* Field 4: Payment Date (Read-only) */}
                {isFieldVisible('payment_date') && (
                <div>
                  <label htmlFor="payment_date" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('payment_date', 'Payment Date')}
                  </label>
                  <input
                    type="text"
                    id="payment_date"
                    name="payment_date"
                    value={formData.payment_date || ''}
                    disabled
                    readOnly
                    className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 text-foreground cursor-not-allowed"
                  />
                </div>
                )}

                {/* Field 5: Payment Mode (Read-only) */}
                {isFieldVisible('payment_mode') && (
                <div>
                  <label htmlFor="payment_mode" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('payment_mode', 'Payment Mode')}
                  </label>
                  <input
                    type="text"
                    id="payment_mode"
                    name="payment_mode"
                    value={formData.payment_mode || ''}
                    disabled
                    readOnly
                    className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 text-foreground cursor-not-allowed"
                  />
                </div>
                )}

                {/* Field 6: Transaction ID / Reference (Read-only) */}
                {isFieldVisible('transaction_id') && (
                <div>
                  <label htmlFor="transaction_id" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('transaction_id', 'Transaction ID / Reference')}
                  </label>
                  <input
                    type="text"
                    id="transaction_id"
                    name="transaction_id"
                    value={formData.transaction_id || ''}
                    disabled
                    readOnly
                    className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 text-foreground cursor-not-allowed"
                  />
                </div>
                )}

                {/* Field 7: Bank Reference (Read-only) */}
                {isFieldVisible('bank_reference') && (
                <div>
                  <label htmlFor="bank_reference" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('bank_reference', 'Bank Reference')}
                  </label>
                  <input
                    type="text"
                    id="bank_reference"
                    name="bank_reference"
                    value={formData.bank_reference || ''}
                    disabled
                    readOnly
                    className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 text-foreground cursor-not-allowed"
                  />
                </div>
                )}

                {isFieldVisible('payment_proof_url') && (
                  <div>
                    <label htmlFor="payment_proof_upload" className="block text-sm font-medium text-foreground mb-1">
                      {resolveFieldLabel('payment_proof_url', 'Payment Proof')} {isFieldRequired('payment_proof_url') && <span className="text-destructive">*</span>}
                    </label>
                    <input
                      id="payment_proof_upload"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(event) => handleDocumentFileChange('paymentProof', event.target.files?.[0] || null)}
                      className="sr-only"
                    />
                    <label
                      htmlFor="payment_proof_upload"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm text-foreground bg-card hover:bg-muted/50 cursor-pointer transition-colors ${
                        errors.payment_proof_url ? 'border-destructive' : 'border-border'
                      }`}
                    >
                      <Upload className="w-4 h-4" />
                      {(formData.payment_proof_url || documentFiles.paymentProof) ? 'Upload New File' : 'Upload File'}
                    </label>
                    {documentFiles.paymentProof && (
                      <p className="text-xs text-muted-foreground mt-1">Selected: {documentFiles.paymentProof.name}</p>
                    )}
                    {!documentFiles.paymentProof && formData.payment_proof_url && (
                      <a
                        href={formData.payment_proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline mt-1 inline-block"
                      >
                        View current payment proof
                      </a>
                    )}
                    {errors.payment_proof_url && <p className="text-destructive text-sm mt-1">{errors.payment_proof_url}</p>}
                  </div>
                )}
              </div>
            </div>

            {/* Section 5: Alternate Contact */}
            <div>
              <h2 className="text-section font-semibold text-foreground mb-4 flex items-center gap-2 pb-2 border-b border-border">
                <Users className="w-5 h-5 text-primary" />
                Alternate Contact Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isFieldVisible('alternate_contact_name') && (
                <div>
                  <label htmlFor="alternate_contact_name" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('alternate_contact_name', 'Contact Name')} {isFieldRequired('alternate_contact_name') && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    type="text"
                    id="alternate_contact_name"
                    name="alternate_contact_name"
                    value={formData.alternate_contact_name}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                    placeholder={resolveFieldPlaceholder('alternate_contact_name', 'Enter alternate contact name')}
                    maxLength={getFieldMaxLength('alternate_contact_name') ?? undefined}
                  />
                </div>
                )}

                {isFieldVisible('alternate_mobile') && (
                <div>
                  <label htmlFor="alternate_mobile" className="block text-sm font-medium text-foreground mb-1">
                    {resolveFieldLabel('alternate_mobile', 'Mobile Number')} {isFieldRequired('alternate_mobile') && <span className="text-destructive">*</span>}
                  </label>
                  <input
                    type="text"
                    id="alternate_mobile"
                    name="alternate_mobile"
                    value={formData.alternate_mobile}
                    onChange={handleMobileChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                      errors.alternate_mobile ? 'border-destructive' : 'border-border'
                    }`}
                    placeholder={resolveFieldPlaceholder('alternate_mobile', '10 digit mobile number')}
                    maxLength={getFieldMaxLength('alternate_mobile') ?? undefined}
                  />
                  {errors.alternate_mobile && <p className="text-destructive text-sm mt-1">{errors.alternate_mobile}</p>}
                </div>
                )}
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-4 pt-6 border-t border-border">
              <Link
                to={isPreviewMode ? "/admin/form-studio/member_edit" : "/dashboard/profile"}
                className="px-6 py-2 text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                {isPreviewMode ? 'Back to Studio' : 'Cancel'}
              </Link>
              <button
                ref={submitButtonRef}
                type="submit"
                disabled={isPreviewMode || isSaving || isVerifying || !hasFormChanges() || !isVerifiedForSubmit}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all duration-200 ${
                  isPreviewMode || isSaving || isVerifying || !hasFormChanges() || !isVerifiedForSubmit
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Submit
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleVerify()}
                disabled={isPreviewMode || isSaving || isVerifying || !hasFormChanges() || isVerifiedForSubmit}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all duration-200 ${
                  isPreviewMode || isSaving || isVerifying || !hasFormChanges() || isVerifiedForSubmit
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/90'
                }`}
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Verify
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Credential Change Modals */}
      <ChangeCredentialModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        type="email"
        currentValue={formData.email}
        onSuccess={() => {
          console.log('Email changed successfully, refreshing member data...');
          window.location.reload();
        }}
      />

      <ChangeCredentialModal
        isOpen={showMobileModal}
        onClose={() => setShowMobileModal(false)}
        type="mobile"
        currentValue={formData.mobile_number}
        onSuccess={() => {
          console.log('Mobile changed successfully, refreshing member data...');
          window.location.reload();
        }}
      />

      {/* Image Crop Modal */}
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
  );
};

export default MemberEditProfile;
