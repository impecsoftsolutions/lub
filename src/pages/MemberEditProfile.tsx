import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
  CheckCircle
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

const correctionFieldLabels: Record<string, string> = {
  full_name: 'Full Name',
  company_name: 'Company Name',
  company_address: 'Company Address',
  products_services: 'Products & Services',
  alternate_contact_name: 'Alternate Contact Name',
  referred_by: 'Referred By'
};

const MemberEditProfile: React.FC = () => {
  const navigate = useNavigate();
  const { member, isAuthenticated, isLoading, refreshMember } = useMember();
  const {
    validateField: validateFieldByRule
  } = useValidation();
  const { isFieldRequired } = useFormFieldConfig();

  // Profile photo state (same as Join.tsx)
  const [profilePhoto, setProfilePhoto] = useState<Blob | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string>('');
  const [photoFileName, setPhotoFileName] = useState<string>('');
  const [photoImageSrc, setPhotoImageSrc] = useState<string>('');
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);

  // Form state with ALL fields
  const [formData, setFormData] = useState({
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
    pan_company: '',
    esic_registered: '',
    epf_registered: '',

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

  // Original data for comparison
  const [originalData, setOriginalData] = useState(formData);

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
    if (!isLoading && !isAuthenticated) {
      navigate('/signin');
    }
  }, [isAuthenticated, isLoading, navigate]);

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
        pan_company: data.pan_company || '',
        esic_registered: data.esic_registered || '',
        epf_registered: data.epf_registered || '',
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
    if (member?.id) {
      void loadMemberProfile();
    }
  }, [loadMemberProfile, member?.id]);

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

    return changed;
  };

  const validateForm = async (): Promise<boolean> => {
    const newErrors: { [key: string]: string } = {};

    // Dynamic required field validation based on form configuration
    if (isFieldRequired('full_name') && !formData.full_name.trim()) {
      newErrors.full_name = 'Full name is required';
    }
    if (isFieldRequired('gender') && !formData.gender) {
      newErrors.gender = 'Gender is required';
    }
    if (isFieldRequired('date_of_birth') && !formData.date_of_birth) {
      newErrors.date_of_birth = 'Date of birth is required';
    }
    if (isFieldRequired('email') && !formData.email.trim()) {
      newErrors.email = 'Email is required';
    }
    if (isFieldRequired('mobile_number') && !formData.mobile_number.trim()) {
      newErrors.mobile_number = 'Mobile number is required';
    }
    if (isFieldRequired('company_name') && !formData.company_name.trim()) {
      newErrors.company_name = 'Company name is required';
    }
    if (isFieldRequired('company_address') && !formData.company_address.trim()) {
      newErrors.company_address = 'Company address is required';
    }
    if (isFieldRequired('state') && !formData.state) {
      newErrors.state = 'State is required';
    }
    if (isFieldRequired('district') && !formData.district) {
      newErrors.district = 'District is required';
    }
    if (isFieldRequired('city') && !formData.city) {
      newErrors.city = 'City is required';
    }
    if (showOtherCity && isFieldRequired('other_city_name') && !formData.other_city_name.trim()) {
      newErrors.other_city_name = 'City name is required';
    }
    if (isFieldRequired('pin_code') && !formData.pin_code.trim()) {
      newErrors.pin_code = 'PIN code is required';
    }
    if (isFieldRequired('industry') && !formData.industry) {
      newErrors.industry = 'Industry is required';
    }
    if (isFieldRequired('activity_type') && !formData.activity_type) {
      newErrors.activity_type = 'Activity type is required';
    }
    if (isFieldRequired('constitution') && !formData.constitution) {
      newErrors.constitution = 'Constitution is required';
    }
    if (isFieldRequired('annual_turnover') && !formData.annual_turnover) {
      newErrors.annual_turnover = 'Annual turnover is required';
    }
    if (isFieldRequired('number_of_employees') && !formData.number_of_employees) {
      newErrors.number_of_employees = 'Number of employees is required';
    }
    if (isFieldRequired('products_services') && !formData.products_services.trim()) {
      newErrors.products_services = 'Products & services is required';
    }
    if (isFieldRequired('gst_registered') && !formData.gst_registered) {
      newErrors.gst_registered = 'GST registration status is required';
    }
    if (formData.gst_registered === 'yes' && !formData.gst_number.trim()) {
      newErrors.gst_number = 'GST number is required when GST registered';
    }
    if (isFieldRequired('pan_company') && !formData.pan_company.trim()) {
      newErrors.pan_company = 'PAN is required';
    }
    if (isFieldRequired('esic_registered') && !formData.esic_registered) {
      newErrors.esic_registered = 'ESIC registration status is required';
    }
    if (isFieldRequired('epf_registered') && !formData.epf_registered) {
      newErrors.epf_registered = 'EPF registration status is required';
    }

    const formatValidatedFields: Array<{
      fieldName: 'email' | 'mobile_number' | 'alternate_mobile' | 'pin_code' | 'gst_number' | 'pan_company' | 'website';
      value: string;
      errorKey?: string;
    }> = [
      { fieldName: 'email', value: formData.email },
      { fieldName: 'mobile_number', value: formData.mobile_number },
      { fieldName: 'alternate_mobile', value: formData.alternate_mobile },
      { fieldName: 'pin_code', value: formData.pin_code },
      { fieldName: 'gst_number', value: formData.gst_number },
      { fieldName: 'pan_company', value: formData.pan_company },
      { fieldName: 'website', value: formData.website }
    ];

    for (const { fieldName, value, errorKey } of formatValidatedFields) {
      if (!value.trim()) {
        continue;
      }

      const validationResult = await validateFieldByRule(fieldName, value);
      if (!validationResult.isValid) {
        newErrors[errorKey ?? fieldName] = validationResult.message || 'Invalid value';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleVerify = async () => {
    if (!member) {
      showToast('error', 'Member data not available');
      return;
    }

    const isValid = await validateForm();
    if (!isValid) {
      showToast('error', 'Please fix all validation errors before verifying');
      return;
    }

    const changedFields = detectChangedFields();

    if (changedFields.length === 0) {
      showToast('error', 'No changes detected');
      return;
    }

    try {
      setIsVerifying(true);
      const result = await normalizeMemberData(formData);
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

      // Step 2: Call RPC function to update profile data
      const { data: rpcResult, error: rpcError } = await supabase.rpc('update_member_profile', {
        p_member_registration_id: memberRegistrationId,
        p_user_id: member!.id,
        p_data: {
          full_name: dataToSave.full_name?.trim(),
          email: emailChanged ? originalData.email?.trim() : dataToSave.email?.trim(),
          mobile_number: mobileChanged ? originalData.mobile_number?.trim() : dataToSave.mobile_number?.trim(),
          gender: dataToSave.gender || null,
          date_of_birth: dataToSave.date_of_birth || null,
          company_name: dataToSave.company_name?.trim(),
          company_designation_id: dataToSave.company_designation_id || null,
          company_address: dataToSave.company_address?.trim(),
          state: dataToSave.state || null,
          district: dataToSave.district || null,
          city: dataToSave.city || null,
          is_custom_city: dataToSave.is_custom_city || false,
          other_city_name: dataToSave.other_city_name || null,
          pin_code: dataToSave.pin_code || null,
          industry: dataToSave.industry || null,
          activity_type: dataToSave.activity_type || null,
          constitution: dataToSave.constitution || null,
          annual_turnover: dataToSave.annual_turnover || null,
          number_of_employees: dataToSave.number_of_employees || null,
          products_services: dataToSave.products_services?.trim(),
          brand_names: dataToSave.brand_names || null,
          website: dataToSave.website || null,
          gst_registered: dataToSave.gst_registered || null,
          gst_number: dataToSave.gst_number || null,
          pan_company: dataToSave.pan_company?.trim(),
          esic_registered: dataToSave.esic_registered || null,
          epf_registered: dataToSave.epf_registered || null,
          member_id: dataToSave.member_id || null,
          referred_by: dataToSave.referred_by?.trim() || null,
          amount_paid: dataToSave.amount_paid || null,
          payment_date: dataToSave.payment_date || null,
          payment_mode: dataToSave.payment_mode || null,
          transaction_id: dataToSave.transaction_id || null,
          bank_reference: dataToSave.bank_reference || null,
          alternate_contact_name: dataToSave.alternate_contact_name || null,
          alternate_mobile: dataToSave.alternate_mobile || null,
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
      const updatedData = { ...dataToSave, profile_photo_url: finalPhotoUrl };
      setOriginalData(updatedData);
      setFormData(updatedData);

      // Clear photo upload state but keep the preview showing the uploaded photo
      setProfilePhoto(null);
      setProfilePhotoPreview(finalPhotoUrl || ''); // Show the newly uploaded photo
      setPhotoFileName('');
      setPhotoImageSrc('');

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading profile editor...</p>
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-900 font-medium mb-2">Unable to load your profile</p>
          <p className="text-gray-600 mb-4">Please try again or contact support</p>
          <Link
            to="/dashboard"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-block"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <button
            onClick={() => navigate('/dashboard/profile')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Profile
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-6">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <User className="w-6 h-6" />
              Edit Profile
            </h1>
            <p className="text-blue-100 mt-1">Update your profile information</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-8">
            {/* Section 1: Personal Information */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2 pb-2 border-b border-gray-200">
                <User className="w-5 h-5 text-blue-600" />
                Personal Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name {isFieldRequired('full_name') && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    id="full_name"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.full_name ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required={isFieldRequired('full_name')}
                  />
                  {errors.full_name && <p className="text-red-500 text-sm mt-1">{errors.full_name}</p>}
                </div>

                <div>
                  <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-1">
                    Gender {isFieldRequired('gender') && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="gender"
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.gender ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required={isFieldRequired('gender')}
                  >
                    <option key="__placeholder" value="">Select Gender</option>
                    <option key="male" value="male">Male</option>
                    <option key="female" value="female">Female</option>
                  </select>
                  {errors.gender && <p className="text-red-500 text-sm mt-1">{errors.gender}</p>}
                </div>

                <div>
                  <label htmlFor="date_of_birth" className="block text-sm font-medium text-gray-700 mb-1">
                    Date of Birth {isFieldRequired('date_of_birth') && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="date"
                    id="date_of_birth"
                    name="date_of_birth"
                    value={formData.date_of_birth}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.date_of_birth ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required={isFieldRequired('date_of_birth')}
                  />
                  {errors.date_of_birth && <p className="text-red-500 text-sm mt-1">{errors.date_of_birth}</p>}
                </div>

                {/* Profile Photo */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                        className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Choose Photo
                      </label>
                      <p className="text-xs text-gray-500 mt-2">
                        Upload a profile photo (JPG, JPEG, or PNG). You'll be able to crop it to fit.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-start gap-4">
                      <div className="relative">
                        <img
                          src={profilePhotoPreview}
                          alt="Profile preview"
                          className="w-32 h-40 object-cover rounded-lg border-2 border-gray-200"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-green-600 font-medium mb-2 flex items-center">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Photo ready
                        </p>
                        <p className="text-xs text-gray-600 mb-3">
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
                            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer"
                          >
                            <Upload className="w-4 h-4 mr-1" />
                            Upload New
                          </label>
                          <button
                            type="button"
                            onClick={handleRemovePhoto}
                            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email Address {isFieldRequired('email') && <span className="text-red-500">*</span>}
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        disabled={!isEmailEditable}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                          !isEmailEditable ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : ''
                        } ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
                        required={isFieldRequired('email')}
                      />
                      {!isEmailEditable && (
                        <Lock className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowEmailModal(true)}
                      className="px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 whitespace-nowrap bg-blue-600 text-white hover:bg-blue-700"
                    >
                      <Unlock className="w-4 h-4" />
                      Change
                    </button>
                  </div>
                  {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
                  {!isEmailEditable && (
                    <p className="text-xs text-gray-500 mt-1">Click "Change" to edit email</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Mobile Number {isFieldRequired('mobile_number') && <span className="text-red-500">*</span>}
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        name="mobile_number"
                        value={formData.mobile_number}
                        onChange={handleMobileChange}
                        disabled={!isMobileEditable}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                          !isMobileEditable ? 'bg-gray-100 text-gray-600 cursor-not-allowed' : ''
                        } ${errors.mobile_number ? 'border-red-500' : 'border-gray-300'}`}
                        required={isFieldRequired('mobile_number')}
                      />
                      {!isMobileEditable && (
                        <Lock className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMobileModal(true)}
                      className="px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 whitespace-nowrap bg-blue-600 text-white hover:bg-blue-700"
                    >
                      <Unlock className="w-4 h-4" />
                      Change
                    </button>
                  </div>
                  {errors.mobile_number && <p className="text-red-500 text-sm mt-1">{errors.mobile_number}</p>}
                  {!isMobileEditable && (
                    <p className="text-xs text-gray-500 mt-1">Click "Change" to edit mobile</p>
                  )}
                </div>
              </div>
            </div>

            {/* Section 2: Company Information */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2 pb-2 border-b border-gray-200">
                <Building className="w-5 h-5 text-blue-600" />
                Company Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="company_name" className="block text-sm font-medium text-gray-700 mb-1">
                    Company Name {isFieldRequired('company_name') && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    id="company_name"
                    name="company_name"
                    value={formData.company_name}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.company_name ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required={isFieldRequired('company_name')}
                  />
                  {errors.company_name && <p className="text-red-500 text-sm mt-1">{errors.company_name}</p>}
                </div>

                <div>
                  <label htmlFor="company_designation_id" className="block text-sm font-medium text-gray-700 mb-1">
                    Designation {isFieldRequired('company_designation_id') && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="company_designation_id"
                    name="company_designation_id"
                    value={formData.company_designation_id}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.company_designation_id ? 'border-red-500' : 'border-gray-300'
                    }`}
                    disabled={isLoadingDesignations}
                  >
                    <option key="__placeholder" value="">Select Designation</option>
                    {availableDesignations.map(des => (
                      <option key={des.id} value={des.id}>{des.designation_name}</option>
                    ))}
                  </select>
                  {errors.company_designation_id && <p className="text-red-500 text-sm mt-1">{errors.company_designation_id}</p>}
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="company_address" className="block text-sm font-medium text-gray-700 mb-1">
                    Company Address {isFieldRequired('company_address') && <span className="text-red-500">*</span>}
                  </label>
                  <textarea
                    id="company_address"
                    name="company_address"
                    value={formData.company_address}
                    onChange={handleChange}
                    rows={3}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.company_address ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required={isFieldRequired('company_address')}
                  />
                  {errors.company_address && <p className="text-red-500 text-sm mt-1">{errors.company_address}</p>}
                </div>

                <div>
                  <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">
                    State {isFieldRequired('state') && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="state"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.state ? 'border-red-500' : 'border-gray-300'
                    }`}
                    disabled={isLoadingStates}
                    required={isFieldRequired('state')}
                  >
                    <option key="__placeholder" value="">Select State</option>
                    {availableStates.map(state => (
                      <option key={state.id} value={state.state}>{state.state}</option>
                    ))}
                  </select>
                  {errors.state && <p className="text-red-500 text-sm mt-1">{errors.state}</p>}
                </div>

                <div>
                  <label htmlFor="district" className="block text-sm font-medium text-gray-700 mb-1">
                    District {isFieldRequired('district') && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="district"
                    name="district"
                    value={formData.district}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.district ? 'border-red-500' : 'border-gray-300'
                    }`}
                    disabled={!formData.state || isLoadingDistricts}
                    required={isFieldRequired('district')}
                  >
                    <option key="__placeholder" value="">Select District</option>
                    {availableDistricts.map(district => (
                      <option key={district.district_id} value={district.district_name}>{district.district_name}</option>
                    ))}
                  </select>
                  {errors.district && <p className="text-red-500 text-sm mt-1">{errors.district}</p>}
                </div>

                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                    City {isFieldRequired('city') && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.city ? 'border-red-500' : 'border-gray-300'
                    }`}
                    disabled={!selectedDistrictId || isLoadingCities}
                    required={isFieldRequired('city')}
                  >
                    <option key="__placeholder" value="">Select City</option>
                    {availableCities.map(city => (
                      <option key={city.city_id} value={city.city_name}>{city.city_name}</option>
                    ))}
                    <option key="other" value="Other">Other</option>
                  </select>
                  {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city}</p>}
                </div>

                {showOtherCity && (
                  <div>
                    <label htmlFor="other_city_name" className="block text-sm font-medium text-gray-700 mb-1">
                      City Name {isFieldRequired('other_city_name') && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="text"
                      id="other_city_name"
                      name="other_city_name"
                      value={formData.other_city_name}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.other_city_name ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="Enter city name"
                      required={isFieldRequired('other_city_name')}
                    />
                    {errors.other_city_name && <p className="text-red-500 text-sm mt-1">{errors.other_city_name}</p>}
                  </div>
                )}

                <div>
                  <label htmlFor="pin_code" className="block text-sm font-medium text-gray-700 mb-1">
                    PIN Code {isFieldRequired('pin_code') && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    id="pin_code"
                    name="pin_code"
                    value={formData.pin_code}
                    onChange={handleMobileChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.pin_code ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required={isFieldRequired('pin_code')}
                  />
                  {errors.pin_code && <p className="text-red-500 text-sm mt-1">{errors.pin_code}</p>}
                </div>
              </div>
            </div>

            {/* Section 3: Business Details */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2 pb-2 border-b border-gray-200">
                <FileText className="w-5 h-5 text-blue-600" />
                Business Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="industry" className="block text-sm font-medium text-gray-700 mb-1">
                    Industry {isFieldRequired('industry') && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="industry"
                    name="industry"
                    value={formData.industry}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.industry ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required={isFieldRequired('industry')}
                  >
                    <option key="__placeholder" value="">Select Industry</option>
                    {INDUSTRY_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  {errors.industry && <p className="text-red-500 text-sm mt-1">{errors.industry}</p>}
                </div>

                <div>
                  <label htmlFor="activity_type" className="block text-sm font-medium text-gray-700 mb-1">
                    Activity Type {isFieldRequired('activity_type') && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="activity_type"
                    name="activity_type"
                    value={formData.activity_type}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.activity_type ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required={isFieldRequired('activity_type')}
                  >
                    <option key="__placeholder" value="">Select Activity Type</option>
                    {ACTIVITY_TYPE_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  {errors.activity_type && <p className="text-red-500 text-sm mt-1">{errors.activity_type}</p>}
                </div>

                <div>
                  <label htmlFor="constitution" className="block text-sm font-medium text-gray-700 mb-1">
                    Industry Constitution {isFieldRequired('constitution') && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="constitution"
                    name="constitution"
                    value={formData.constitution}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.constitution ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required={isFieldRequired('constitution')}
                  >
                    <option key="__placeholder" value="">Select Industry Constitution</option>
                    {CONSTITUTION_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  {errors.constitution && <p className="text-red-500 text-sm mt-1">{errors.constitution}</p>}
                </div>

                <div>
                  <label htmlFor="annual_turnover" className="block text-sm font-medium text-gray-700 mb-1">
                    Annual Turnover {isFieldRequired('annual_turnover') && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="annual_turnover"
                    name="annual_turnover"
                    value={formData.annual_turnover}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.annual_turnover ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required={isFieldRequired('annual_turnover')}
                  >
                    <option key="__placeholder" value="">Select Annual Turnover</option>
                    {ANNUAL_TURNOVER_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  {errors.annual_turnover && <p className="text-red-500 text-sm mt-1">{errors.annual_turnover}</p>}
                </div>

                <div>
                  <label htmlFor="number_of_employees" className="block text-sm font-medium text-gray-700 mb-1">
                    Number of Employees {isFieldRequired('number_of_employees') && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="number_of_employees"
                    name="number_of_employees"
                    value={formData.number_of_employees}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.number_of_employees ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required={isFieldRequired('number_of_employees')}
                  >
                    <option key="__placeholder" value="">Select Number of Employees</option>
                    {EMPLOYEE_COUNT_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  {errors.number_of_employees && <p className="text-red-500 text-sm mt-1">{errors.number_of_employees}</p>}
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="products_services" className="block text-sm font-medium text-gray-700 mb-1">
                    Products & Services {isFieldRequired('products_services') && <span className="text-red-500">*</span>}
                  </label>
                  <textarea
                    id="products_services"
                    name="products_services"
                    value={formData.products_services}
                    onChange={handleChange}
                    rows={3}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.products_services ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Describe your products and services"
                    required={isFieldRequired('products_services')}
                  />
                  {errors.products_services && <p className="text-red-500 text-sm mt-1">{errors.products_services}</p>}
                </div>

                <div>
                  <label htmlFor="brand_names" className="block text-sm font-medium text-gray-700 mb-1">
                    Brand Names {isFieldRequired('brand_names') && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    id="brand_names"
                    name="brand_names"
                    value={formData.brand_names}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter brand names"
                  />
                </div>

                <div>
                  <label htmlFor="website" className="block text-sm font-medium text-gray-700 mb-1">
                    Website {isFieldRequired('website') && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    id="website"
                    name="website"
                    value={formData.website}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.website ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="https://example.com"
                  />
                  {errors.website && <p className="text-red-500 text-sm mt-1">{errors.website}</p>}
                </div>
              </div>
            </div>

            {/* Section 4: Registration Details */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2 pb-2 border-b border-gray-200">
                <FileText className="w-5 h-5 text-blue-600" />
                Registration Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="gst_registered" className="block text-sm font-medium text-gray-700 mb-1">
                    GST Registered {isFieldRequired('gst_registered') && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="gst_registered"
                    name="gst_registered"
                    value={formData.gst_registered}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.gst_registered ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required={isFieldRequired('gst_registered')}
                  >
                    <option key="__placeholder" value="">Select</option>
                    <option key="yes" value="yes">Yes</option>
                    <option key="no" value="no">No</option>
                  </select>
                  {errors.gst_registered && <p className="text-red-500 text-sm mt-1">{errors.gst_registered}</p>}
                </div>

                {formData.gst_registered === 'yes' && (
                  <div>
                    <label htmlFor="gst_number" className="block text-sm font-medium text-gray-700 mb-1">
                      GST Number {isFieldRequired('gst_number') && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="text"
                      id="gst_number"
                      name="gst_number"
                      value={formData.gst_number}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        errors.gst_number ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="22AAAAA0000A1Z5"
                      required={formData.gst_registered === 'yes'}
                    />
                    {errors.gst_number && <p className="text-red-500 text-sm mt-1">{errors.gst_number}</p>}
                  </div>
                )}

                <div>
                  <label htmlFor="pan_company" className="block text-sm font-medium text-gray-700 mb-1">
                    PAN (Company) {isFieldRequired('pan_company') && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    id="pan_company"
                    name="pan_company"
                    value={formData.pan_company}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.pan_company ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="AAAAA0000A"
                    required={isFieldRequired('pan_company')}
                  />
                  {errors.pan_company && <p className="text-red-500 text-sm mt-1">{errors.pan_company}</p>}
                </div>

                <div>
                  <label htmlFor="esic_registered" className="block text-sm font-medium text-gray-700 mb-1">
                    ESIC Registered {isFieldRequired('esic_registered') && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="esic_registered"
                    name="esic_registered"
                    value={formData.esic_registered}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.esic_registered ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required={isFieldRequired('esic_registered')}
                  >
                    <option key="__placeholder" value="">Select</option>
                    <option key="yes" value="yes">Yes</option>
                    <option key="no" value="no">No</option>
                  </select>
                  {errors.esic_registered && <p className="text-red-500 text-sm mt-1">{errors.esic_registered}</p>}
                </div>

                <div>
                  <label htmlFor="epf_registered" className="block text-sm font-medium text-gray-700 mb-1">
                    EPF Registered {isFieldRequired('epf_registered') && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    id="epf_registered"
                    name="epf_registered"
                    value={formData.epf_registered}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.epf_registered ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required={isFieldRequired('epf_registered')}
                  >
                    <option key="__placeholder" value="">Select</option>
                    <option key="yes" value="yes">Yes</option>
                    <option key="no" value="no">No</option>
                  </select>
                  {errors.epf_registered && <p className="text-red-500 text-sm mt-1">{errors.epf_registered}</p>}
                </div>

                {/* Field 1: Member ID (Read-only) */}
                <div>
                  <label htmlFor="member_id" className="block text-sm font-medium text-gray-700 mb-1">
                    Member ID
                  </label>
                  <input
                    type="text"
                    id="member_id"
                    name="member_id"
                    value={formData.member_id || ''}
                    disabled
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 cursor-not-allowed"
                  />
                </div>

                {/* Field 2: Referred By (Editable) */}
                <div>
                  <label htmlFor="referred_by" className="block text-sm font-medium text-gray-700 mb-1">
                    Referred By {isFieldRequired('referred_by') && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    id="referred_by"
                    name="referred_by"
                    value={formData.referred_by}
                    onChange={handleChange}
                    placeholder="Name of the person who referred you"
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.referred_by ? 'border-red-500' : 'border-gray-300'
                    }`}
                    required={isFieldRequired('referred_by')}
                  />
                  {errors.referred_by && <p className="text-red-500 text-sm mt-1">{errors.referred_by}</p>}
                </div>

                {/* Field 3: Amount Paid (Read-only) */}
                <div>
                  <label htmlFor="amount_paid" className="block text-sm font-medium text-gray-700 mb-1">
                    Amount Paid
                  </label>
                  <input
                    type="text"
                    id="amount_paid"
                    name="amount_paid"
                    value={formData.amount_paid || ''}
                    disabled
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 cursor-not-allowed"
                  />
                </div>

                {/* Field 4: Payment Date (Read-only) */}
                <div>
                  <label htmlFor="payment_date" className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Date
                  </label>
                  <input
                    type="text"
                    id="payment_date"
                    name="payment_date"
                    value={formData.payment_date || ''}
                    disabled
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 cursor-not-allowed"
                  />
                </div>

                {/* Field 5: Payment Mode (Read-only) */}
                <div>
                  <label htmlFor="payment_mode" className="block text-sm font-medium text-gray-700 mb-1">
                    Payment Mode
                  </label>
                  <input
                    type="text"
                    id="payment_mode"
                    name="payment_mode"
                    value={formData.payment_mode || ''}
                    disabled
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 cursor-not-allowed"
                  />
                </div>

                {/* Field 6: Transaction ID / Reference (Read-only) */}
                <div>
                  <label htmlFor="transaction_id" className="block text-sm font-medium text-gray-700 mb-1">
                    Transaction ID / Reference
                  </label>
                  <input
                    type="text"
                    id="transaction_id"
                    name="transaction_id"
                    value={formData.transaction_id || ''}
                    disabled
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 cursor-not-allowed"
                  />
                </div>

                {/* Field 7: Bank Reference (Read-only) */}
                <div>
                  <label htmlFor="bank_reference" className="block text-sm font-medium text-gray-700 mb-1">
                    Bank Reference
                  </label>
                  <input
                    type="text"
                    id="bank_reference"
                    name="bank_reference"
                    value={formData.bank_reference || ''}
                    disabled
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* Section 5: Alternate Contact */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2 pb-2 border-b border-gray-200">
                <Users className="w-5 h-5 text-blue-600" />
                Alternate Contact Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="alternate_contact_name" className="block text-sm font-medium text-gray-700 mb-1">
                    Contact Name {isFieldRequired('alternate_contact_name') && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    id="alternate_contact_name"
                    name="alternate_contact_name"
                    value={formData.alternate_contact_name}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter alternate contact name"
                  />
                </div>

                <div>
                  <label htmlFor="alternate_mobile" className="block text-sm font-medium text-gray-700 mb-1">
                    Mobile Number {isFieldRequired('alternate_mobile') && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    id="alternate_mobile"
                    name="alternate_mobile"
                    value={formData.alternate_mobile}
                    onChange={handleMobileChange}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.alternate_mobile ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="10 digit mobile number"
                  />
                  {errors.alternate_mobile && <p className="text-red-500 text-sm mt-1">{errors.alternate_mobile}</p>}
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-200">
              <Link
                to="/dashboard/profile"
                className="px-6 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </Link>
              <button
                ref={submitButtonRef}
                type="submit"
                disabled={isSaving || isVerifying || !hasFormChanges() || !isVerifiedForSubmit}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all duration-200 ${
                  isSaving || isVerifying || !hasFormChanges() || !isVerifiedForSubmit
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
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
                disabled={isSaving || isVerifying || !hasFormChanges() || isVerifiedForSubmit}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-all duration-200 ${
                  isSaving || isVerifying || !hasFormChanges() || isVerifiedForSubmit
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
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
