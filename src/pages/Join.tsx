import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  FileText,
  User,
  Building2,
  MapPin,
  Phone,
  Mail,
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
  DesignationMaster
} from '../lib/supabase';
import Toast from '../components/Toast';
import { useFormFieldConfig } from '../hooks/useFormFieldConfig';
import { useValidation } from '../hooks/useValidation';
import ImageCropModal from '../components/ImageCropModal';
import { readFileAsDataURL, validateImageFile, generatePhotoFileName } from '../lib/imageProcessing';
import { normalizeMemberData } from '../lib/normalization';
import NormalizationPreviewModal from '../components/NormalizationPreviewModal';
import { useMember } from '../contexts/MemberContext';
import { supabase } from '../lib/supabase';

// Type definition for existing registration record
interface ExistingRegistration {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  full_name: string;
  email: string;
  mobile_number: string;
  company_name: string;
  rejection_reason: string | null;
  reapplication_count: number;
  created_at: string;
}

const Join: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isFieldVisible, isFieldRequired, isLoading: isLoadingConfig } = useFormFieldConfig();
  const { validateField: validateFieldByRule, isLoading: isLoadingValidation } = useValidation();

  // Authentication and existing registration state
  const { member, isAuthenticated, isLoading: isLoadingAuth } = useMember();
  const [isCheckingExisting, setIsCheckingExisting] = useState(false);
  const [existingRegistration, setExistingRegistration] = useState<ExistingRegistration | null>(null);

  // Form state
  const [formData, setFormData] = useState({
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
  });

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
  const [isLoadingPaymentSettings, setIsLoadingPaymentSettings] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [photoImageSrc, setPhotoImageSrc] = useState<string>('');
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);

  // Normalization state
  const [showNormalizationModal, setShowNormalizationModal] = useState(false);
  const [normalizationResult, setNormalizationResult] = useState<any>(null);

  // Validation and UI state
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [formErrorMessage, setFormErrorMessage] = useState<string>('');
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({
    type: 'success',
    message: '',
    isVisible: false
  });

  // Check authentication - redirect to sign in if not authenticated
  useEffect(() => {
    if (!isLoadingAuth && !isAuthenticated) {
      console.log('[Join] Not authenticated, redirecting to sign in');
      navigate('/signin', { replace: true });
    }
  }, [isLoadingAuth, isAuthenticated, navigate]);

  // Check for existing registration and handle based on status
  useEffect(() => {
    const checkExistingRegistration = async () => {
      // Only check if authenticated and member data is available
      if (!isAuthenticated || !member || !member.user_id) {
        setIsCheckingExisting(false);
        return;
      }

      try {
        setIsCheckingExisting(true);
        console.log('[Join] Checking for existing registration for user:', member.user_id);

        const { data, error } = await supabase
          .from('member_registrations')
          .select('id, status, full_name, email, mobile_number, company_name, rejection_reason, reapplication_count, created_at')
          .eq('user_id', member.user_id)
          .maybeSingle();

        if (error) {
          console.error('[Join] Error checking registration:', error);
          setExistingRegistration(null);
          setIsCheckingExisting(false);
          return;
        }

        // Handle different registration statuses
        if (data) {
          console.log('[Join] Found existing registration with status:', data.status);
          setExistingRegistration(data);

          // Pending: Redirect to dashboard
          if (data.status === 'pending') {
            console.log('[Join] User has pending registration, redirecting to dashboard');
            navigate('/dashboard', { replace: true });
            return;
          }

          // Approved: Redirect to dashboard
          if (data.status === 'approved') {
            console.log('[Join] User is already approved, redirecting to dashboard');
            navigate('/dashboard', { replace: true });
            return;
          }

          // Rejected: Redirect to reapply page
          if (data.status === 'rejected') {
            console.log('[Join] User has rejected registration, redirecting to reapply page');
            navigate('/dashboard/reapply', { replace: true });
            return;
          }
        } else {
          console.log('[Join] No existing registration found - user can proceed with form');
          setExistingRegistration(null);

          // Pre-fill email and mobile from authenticated user account
          if (isAuthenticated && member) {
            setFormData(prev => ({
              ...prev,
              email: member.email || '',
              mobile_number: member.mobile_number || ''
            }));
            console.log('[Join] Pre-filled email and mobile from user account');
          }
        }
      } catch (error) {
        console.error('[Join] Unexpected error checking registration:', error);
        setExistingRegistration(null);
      } finally {
        setIsCheckingExisting(false);
      }
    };

    // Only run check if user is authenticated
    if (isAuthenticated && member) {
      checkExistingRegistration();
    } else {
      setIsCheckingExisting(false);
    }
  }, [isAuthenticated, member, navigate]);

  // Load initial data and handle URL parameters
  useEffect(() => {
    console.log('[Join.tsx] Component mounted, loading initial data');
    loadStates();
    loadDesignations();

    // Handle state parameter from URL
    const stateParam = searchParams.get('state');
    if (stateParam) {
      console.log('[Join.tsx] State parameter from URL:', stateParam);
      setFormData(prev => ({ ...prev, state: stateParam }));
    }
  }, [searchParams]);

  // Load districts and payment settings when state changes
  useEffect(() => {
    if (formData.state) {
      loadDistricts(formData.state);
      loadPaymentSettingsForState(formData.state);
    } else {
      // Clear dependent fields when state is cleared
      setAvailableDistricts([]);
      setAvailableCities([]);
      setSelectedDistrictId('');
      setShowOtherCity(false);
      setOtherCityText('');
      setCurrentStatePaymentSettings(null);
      setFormData(prev => ({ ...prev, district: '', city: '', other_city_name: '', is_custom_city: false, amount_paid: '' }));
    }
  }, [formData.state]);

  // Load cities when district changes
  useEffect(() => {
    if (selectedDistrictId) {
      loadCities(selectedDistrictId);
    } else {
      // Clear dependent fields when district is cleared
      setAvailableCities([]);
      setShowOtherCity(false);
      setOtherCityText('');
      setFormData(prev => ({ ...prev, city: '', other_city_name: '', is_custom_city: false }));
    }
  }, [selectedDistrictId]);

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

  const loadStates = async () => {
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
  };

  const loadDesignations = async () => {
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
  };

  const loadDistricts = async (stateName: string) => {
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
  };

  const loadCities = async (districtId: string) => {
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
  };

  const loadPaymentSettingsForState = async (stateName: string) => {
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
  };

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    // Auto-convert email and website to lowercase
    const processedValue = (name === 'email' || name === 'website') ? value.toLowerCase() : value;

    setFormData(prev => ({ ...prev, [name]: processedValue }));

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
    let numericValue = value.replace(/\D/g, '');

    // No length limit - let validation handle it

    setFormData(prev => ({ ...prev, [name]: numericValue }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handlePanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Remove all non-alphanumeric characters and convert to uppercase
    let alphanumericValue = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    // No length limit - let validation handle it

    setFormData(prev => ({ ...prev, [name]: alphanumericValue }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleGstChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Remove all non-alphanumeric characters and convert to uppercase
    let alphanumericValue = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    // No length limit - let validation handle it

    setFormData(prev => ({ ...prev, [name]: alphanumericValue }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateField = async (fieldName: string) => {
    const value = formData[fieldName as keyof typeof formData];

    console.log('[Join] validateField called for:', fieldName, 'value:', value ? (value.toString().substring(0, 20) + '...') : '(empty)');

    // Only validate if field has a value (all fields are optional unless required)
    if (!value || value.toString().trim() === '') {
      // Clear error if field is empty
      if (errors[fieldName]) {
        setErrors(prev => ({ ...prev, [fieldName]: '' }));
      }
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

  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const districtName = e.target.value;
    const selectedDistrict = availableDistricts.find(d => d.district_name === districtName);

    setFormData(prev => ({ ...prev, district: districtName, city: '', other_city_name: '', is_custom_city: false }));
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

    if (errors.city) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.city;
        return newErrors;
      });
    }
  };

  const handleFileChange = (fileType: keyof typeof files, file: File | null) => {
    setFiles(prev => ({ ...prev, [fileType]: file }));
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
      setSelectedPhotoFile(file);
      setPhotoImageSrc(imageSrc);
      setIsCropModalOpen(true);
    } catch (error) {
      showToast('error', 'Failed to read image file');
      e.target.value = '';
    }
  };

  const handleCropComplete = (croppedImageBlob: Blob) => {
    setProfilePhoto(croppedImageBlob);
    setPhotoFileName(generatePhotoFileName());

    const previewUrl = URL.createObjectURL(croppedImageBlob);
    setProfilePhotoPreview(previewUrl);

    showToast('success', 'Photo cropped successfully');
  };

  const handleRemovePhoto = () => {
    setProfilePhoto(null);
    setProfilePhotoPreview('');
    setPhotoFileName('');
    setSelectedPhotoFile(null);
    setPhotoImageSrc('');

    const fileInput = document.getElementById('profile-photo-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleCropError = (error: string) => {
    showToast('error', error);
  };

  const validateForm = async (dataToValidate: typeof formData = formData): Promise<boolean> => {
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
      { field: 'pan_company', label: 'PAN (Company)' },
      { field: 'esic_registered', label: 'ESIC Registered' },
      { field: 'epf_registered', label: 'EPF Registered' },
      { field: 'amount_paid', label: 'Amount Paid' },
      { field: 'payment_date', label: 'Payment Date' },
      { field: 'payment_mode', label: 'Payment Mode' },
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

      const value = dataToValidate[field as keyof typeof formData];
      if (isFieldRequired(field) && isFieldVisible(field)) {
        if (!value || value.toString().trim() === '') {
          newErrors[field] = `${label} is required`;
        }
      }
    });

    // Conditional city validation based on is_custom_city flag
    // This handles both standard city selection and custom "Other" city entry
    if (isFieldRequired('city') && isFieldVisible('city')) {
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

      const fieldValue = dataToValidate[fieldName as keyof typeof formData];

      // Only validate fields that have a value
      if (fieldValue && fieldValue.toString().trim() !== '') {
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

  const sanitizeFormData = (data: typeof formData) => {
    console.log('[Join.tsx] Sanitizing form data before submission');
    console.log('[Join.tsx] is_custom_city flag:', data.is_custom_city);
    console.log('[Join.tsx] city value:', data.city || 'null');
    console.log('[Join.tsx] other_city_name value:', data.other_city_name || 'null');

    const sanitized: any = { ...data };

    // Handle custom city: when is_custom_city is true, set city to null
    // The custom city name is stored in other_city_name field
    // CRITICAL: Explicitly preserve the is_custom_city flag to ensure it's saved to database
    if (sanitized.is_custom_city === true) {
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

  const submitFormData = async (dataToSubmit: typeof formData) => {
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
      const result = await memberRegistrationService.submitRegistration(
        sanitizedData,
        { ...files, profilePhoto },
        photoFileName
      );

      if (result.success) {
        console.log('[Join.tsx] Registration submitted successfully');
        showToast('success', 'Registration submitted successfully! You will receive a confirmation email once approved.');

        // Navigate to success page or home after a delay
        setTimeout(() => {
          navigate('/');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[Join.tsx] Form submission started');

    // Prevent submission if field configurations are still loading
    if (isLoadingConfig) {
      showToast('info', 'Please wait while the form loads...');
      return;
    }

    try {
      setIsSubmitting(true);
      console.log('[Join.tsx] Normalizing member data...');

      const result = await normalizeMemberData(formData);

      setNormalizationResult(result);
      setShowNormalizationModal(true);
      setIsSubmitting(false);
    } catch (error) {
      console.error('[Join.tsx] Normalization failed:', error);
      // If normalization fails, proceed with original data
      showToast('error', 'Data normalization failed. Proceeding with original data.');
      setIsSubmitting(false);
      // Submit with original data if normalization fails
      await submitFormData(formData);
    }
  };

  const handleAcceptNormalization = async (acceptedData: any) => {
    console.log('[Join.tsx] User accepted normalized data');
    setFormData(acceptedData);
    setShowNormalizationModal(false);
    // Submit with normalized data directly
    await submitFormData(acceptedData);
  };

  const handleRejectNormalization = async () => {
    console.log('[Join.tsx] User rejected normalization, using original data');
    setShowNormalizationModal(false);
    // Submit with original form data directly
    await submitFormData(formData);
  };

  // Show loading state while checking authentication or existing registration
  if (isLoadingConfig || isLoadingValidation || isLoadingAuth || isCheckingExisting) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">
            {isLoadingAuth ? 'Checking authentication...' :
             isCheckingExisting ? 'Checking registration status...' :
             'Loading form...'}
          </p>
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
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Join LUB</h1>
          <p className="text-gray-600">Complete your membership registration</p>
        </div>

        {/* Registration Form */}
        <div className="bg-white rounded-lg shadow-md p-8">
          {/* Form Error Banner */}
          {formErrorMessage && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
              <AlertCircle className="w-5 h-5 text-red-600 mr-3 mt-0.5 flex-shrink-0" />
              <p className="text-red-800 text-sm font-medium">{formErrorMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Personal Information */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <User className="w-5 h-5 mr-2 text-blue-600" />
                Personal Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {isFieldVisible('full_name') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Full Name{isFieldRequired('full_name') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleInputChange}
                      onBlur={() => validateField('full_name')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.full_name ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="Enter your full name"
                      required={isFieldRequired('full_name')}
                    />

                    {errors.full_name && <p className="text-red-500 text-sm mt-1">{errors.full_name}</p>}
                  </div>
                )}

                {isFieldVisible('gender') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Gender{isFieldRequired('gender') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <select
                      name="gender"
                      value={formData.gender}
                      onChange={handleInputChange}
                      required={isFieldRequired('gender')}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.gender ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                  {errors.gender && <p className="text-red-500 text-sm mt-1">{errors.gender}</p>}
                  </div>
                )}

                {isFieldVisible('date_of_birth') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Date of Birth{isFieldRequired('date_of_birth') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="date"
                      name="date_of_birth"
                      value={formData.date_of_birth}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.date_of_birth ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('date_of_birth')}
                    />
                    {errors.date_of_birth && <p className="text-red-500 text-sm mt-1">{errors.date_of_birth}</p>}
                  </div>
                )}

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
                          Your profile photo has been cropped and will be uploaded with your registration.
                        </p>
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
                  )}
                </div>

                {isFieldVisible('email') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address{isFieldRequired('email') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      onBlur={() => validateField('email')}
                      readOnly={isAuthenticated}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.email ? 'border-red-500' : 'border-gray-300'
                      } ${isAuthenticated ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                      required={isFieldRequired('email')}
                  />
                  {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
                  </div>
                )}

                {isFieldVisible('mobile_number') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Mobile Number{isFieldRequired('mobile_number') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="mobile_number"
                      value={formData.mobile_number}
                      onChange={handleMobileNumberChange}
                      onBlur={() => validateField('mobile_number')}
                      placeholder="10-digit mobile number"
                      readOnly={isAuthenticated}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.mobile_number ? 'border-red-500' : 'border-gray-300'
                      } ${isAuthenticated ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                      required={isFieldRequired('mobile_number')}
                  />
                  {errors.mobile_number && <p className="text-red-500 text-sm mt-1">{errors.mobile_number}</p>}
                  </div>
                )}
              </div>
            </section>

            {/* Company Information */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <Building2 className="w-5 h-5 mr-2 text-blue-600" />
                Company Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {isFieldVisible('company_name') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Name{isFieldRequired('company_name') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="company_name"
                      value={formData.company_name}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.company_name ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="Enter your company name"
                      required={isFieldRequired('company_name')}
                    />
                    {errors.company_name && <p className="text-red-500 text-sm mt-1">{errors.company_name}</p>}
                  </div>
                )}

                {isFieldVisible('company_designation_id') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Designation{isFieldRequired('company_designation_id') && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {isLoadingDesignations ? (
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 flex items-center">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading designations...
                    </div>
                  ) : (
                    <select
                      name="company_designation_id"
                      value={formData.company_designation_id}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.company_designation_id ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('company_designation_id')}
                    >
                      <option value="">Select Designation</option>
                      {availableDesignations.map(designation => (
                        <option key={designation.id} value={designation.id}>
                          {designation.designation_name}
                        </option>
                      ))}
                    </select>
                  )}
                  {errors.company_designation_id && <p className="text-red-500 text-sm mt-1">{errors.company_designation_id}</p>}
                  </div>
                )}
              </div>
            </section>

            {/* Location Information */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <MapPin className="w-5 h-5 mr-2 text-blue-600" />
                Location Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* State Dropdown */}
                {isFieldVisible('state') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      State{isFieldRequired('state') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {isLoadingStates ? (
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 flex items-center">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading states...
                    </div>
                  ) : (
                    <select
                      name="state"
                      value={formData.state}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.state ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('state')}
                    >
                      <option value="">Select State</option>
                      {availableStates.map(state => (
                        <option key={state.state} value={state.state}>
                          {state.state}
                        </option>
                      ))}
                    </select>
                  )}
                  {errors.state && <p className="text-red-500 text-sm mt-1">{errors.state}</p>}
                  </div>
                )}

                {/* District Dropdown */}
                {isFieldVisible('district') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      District{isFieldRequired('district') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                  {isLoadingDistricts ? (
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 flex items-center">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading districts...
                    </div>
                  ) : (
                    <select
                      name="district"
                      value={formData.district}
                      onChange={handleDistrictChange}
                      disabled={!formData.state}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed ${
                        errors.district ? 'border-red-500' : 'border-gray-300'
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
                  {errors.district && <p className="text-red-500 text-sm mt-1">{errors.district}</p>}
                  </div>
                )}

                {/* City Dropdown */}
                {isFieldVisible('city') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      City/Town/Village{isFieldRequired('city') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                  {isLoadingCities ? (
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 flex items-center">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading cities...
                    </div>
                  ) : (
                    <select
                      name="city"
                      value={showOtherCity ? 'Other' : formData.city}
                      onChange={handleCityChange}
                      disabled={!selectedDistrictId}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed ${
                        errors.city ? 'border-red-500' : 'border-gray-300'
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
                  {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city}</p>}
                  </div>
                )}

                {/* Other City Text Input */}
                {showOtherCity && isFieldVisible('city') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Enter City/Town/Village{isFieldRequired('city') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      value={otherCityText}
                      onChange={handleOtherCityChange}
                      placeholder="Enter your city, town, or village"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.city ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={formData.city === 'Other'}
                    />
                    <p className="text-xs text-gray-500 mt-1">Enter your city, town, or village name</p>
                    {errors.city && <p className="text-red-500 text-sm mt-1">{errors.city}</p>}
                  </div>
                )}

                {isFieldVisible('pin_code') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      PIN Code{isFieldRequired('pin_code') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="pin_code"
                      value={formData.pin_code}
                      onChange={handlePinCodeChange}
                      onBlur={() => validateField('pin_code')}
                      placeholder="6-digit PIN code"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.pin_code ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('pin_code')}
                    />
                    {errors.pin_code && <p className="text-red-500 text-sm mt-1">{errors.pin_code}</p>}
                  </div>
                )}

                {isFieldVisible('company_address') && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Address{isFieldRequired('company_address') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <textarea
                      name="company_address"
                      value={formData.company_address}
                      onChange={handleInputChange}
                      rows={3}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.company_address ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('company_address')}
                    />
                    {errors.company_address && <p className="text-red-500 text-sm mt-1">{errors.company_address}</p>}
                  </div>
                )}
              </div>
            </section>

            {/* Business Information */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <Building2 className="w-5 h-5 mr-2 text-blue-600" />
                Business Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {isFieldVisible('industry') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Industry{isFieldRequired('industry') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <select
                      name="industry"
                      value={formData.industry}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.industry ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('industry')}
                    >
                    <option value="">Select Industry</option>
                    <option value="Micro">Micro</option>
                    <option value="Small">Small</option>
                    <option value="Medium">Medium</option>
                    </select>
                    {errors.industry && <p className="text-red-500 text-sm mt-1">{errors.industry}</p>}
                  </div>
                )}

                {isFieldVisible('activity_type') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Activity Type{isFieldRequired('activity_type') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <select
                      name="activity_type"
                      value={formData.activity_type}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.activity_type ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('activity_type')}
                    >
                    <option value="">Select Activity Type</option>
                    <option value="Manufacturer">Manufacturer</option>
                    <option value="Service Provider">Service Provider</option>
                    <option value="Trader">Trader</option>
                  </select>
                  {errors.activity_type && <p className="text-red-500 text-sm mt-1">{errors.activity_type}</p>}
                  </div>
                )}

                {isFieldVisible('constitution') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Industry Constitution{isFieldRequired('constitution') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <select
                      name="constitution"
                      value={formData.constitution}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.constitution ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('constitution')}
                    >
                    <option value="">Select Industry Constitution</option>
                    <option value="Proprietorship">Proprietorship</option>
                    <option value="Partnership">Partnership</option>
                    <option value="Limited Liability Partnership">Limited Liability Partnership</option>
                    <option value="One Person Company">One Person Company</option>
                    <option value="Private Limited Company">Private Limited Company</option>
                    <option value="Limited Company">Limited Company</option>
                    </select>
                    {errors.constitution && <p className="text-red-500 text-sm mt-1">{errors.constitution}</p>}
                  </div>
                )}

                {isFieldVisible('annual_turnover') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Annual Turnover{isFieldRequired('annual_turnover') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <select
                      name="annual_turnover"
                      value={formData.annual_turnover}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.annual_turnover ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('annual_turnover')}
                    >
                    <option value="">Select Annual Turnover</option>
                    <option value="Less than 50 Lakhs">Less than 50 Lakhs</option>
                    <option value="50 Lakhs - 1 Crore">50 Lakhs - 1 Crore</option>
                    <option value="1 Crore - 5 Crores">1 Crore - 5 Crores</option>
                    <option value="5 Crores - 10 Crores">5 Crores - 10 Crores</option>
                    <option value="10 Crores - 25 Crores">10 Crores - 25 Crores</option>
                    <option value="Above 25 Crores">Above 25 Crores</option>
                    </select>
                    {errors.annual_turnover && <p className="text-red-500 text-sm mt-1">{errors.annual_turnover}</p>}
                  </div>
                )}

                {isFieldVisible('number_of_employees') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Number of Employees{isFieldRequired('number_of_employees') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <select
                      name="number_of_employees"
                      value={formData.number_of_employees}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.number_of_employees ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('number_of_employees')}
                    >
                    <option value="">Select Number of Employees</option>
                    <option value="Less than 5 employees">Less than 5 employees</option>
                    <option value="6 to 10 employees">6 to 10 employees</option>
                    <option value="11 to 20 employees">11 to 20 employees</option>
                    <option value="21 to 50 employees">21 to 50 employees</option>
                    <option value="51 to 100 employees">51 to 100 employees</option>
                    <option value="101 to 150 employees">101 to 150 employees</option>
                    <option value="Above 151 employees">Above 151 employees</option>
                    </select>
                    {errors.number_of_employees && <p className="text-red-500 text-sm mt-1">{errors.number_of_employees}</p>}
                  </div>
                )}

                {isFieldVisible('products_services') && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Products & Services{isFieldRequired('products_services') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <textarea
                      name="products_services"
                      value={formData.products_services}
                      onChange={handleInputChange}
                      rows={3}
                      placeholder="Describe your main products and services"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.products_services ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('products_services')}
                    />
                    {errors.products_services && <p className="text-red-500 text-sm mt-1">{errors.products_services}</p>}
                  </div>
                )}

                {isFieldVisible('brand_names') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Brand Names{isFieldRequired('brand_names') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="brand_names"
                      value={formData.brand_names}
                      onChange={handleInputChange}
                      placeholder="Your brand names (if any)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required={isFieldRequired('brand_names')}
                    />
                  </div>
                )}

                {isFieldVisible('website') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Website{isFieldRequired('website') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="website"
                      value={formData.website}
                      onChange={handleInputChange}
                      onBlur={() => validateField('website')}
                      placeholder="www.yourcompany.com"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.website ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('website')}
                    />
                    {errors.website && <p className="text-red-500 text-sm mt-1">{errors.website}</p>}
                  </div>
                )}
              </div>
            </section>

            {/* Registration Information */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <FileText className="w-5 h-5 mr-2 text-blue-600" />
                Registration Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {isFieldVisible('gst_registered') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      GST Registered{isFieldRequired('gst_registered') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <select
                      name="gst_registered"
                      value={formData.gst_registered}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.gst_registered ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('gst_registered')}
                    >
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                    </select>
                    {errors.gst_registered && <p className="text-red-500 text-sm mt-1">{errors.gst_registered}</p>}
                  </div>
                )}

                {formData.gst_registered === 'yes' && isFieldVisible('gst_number') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      GST Number{isFieldRequired('gst_number') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="gst_number"
                      value={formData.gst_number}
                      onChange={handleGstChange}
                      onBlur={() => validateField('gst_number')}
                      placeholder="22AAAAA0000A1Z5"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.gst_number ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('gst_number')}
                    />
                    {errors.gst_number && <p className="text-red-500 text-sm mt-1">{errors.gst_number}</p>}
                  </div>
                )}

                {isFieldVisible('pan_company') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      PAN (Company){isFieldRequired('pan_company') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="pan_company"
                      value={formData.pan_company}
                      onChange={handlePanChange}
                      onBlur={() => validateField('pan_company')}
                      placeholder="10 alphanumeric characters"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.pan_company ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('pan_company')}
                    />
                    {errors.pan_company && <p className="text-red-500 text-sm mt-1">{errors.pan_company}</p>}
                  </div>
                )}

                {isFieldVisible('esic_registered') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ESIC Registered{isFieldRequired('esic_registered') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <select
                      name="esic_registered"
                      value={formData.esic_registered}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.esic_registered ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('esic_registered')}
                    >
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                    </select>
                    {errors.esic_registered && <p className="text-red-500 text-sm mt-1">{errors.esic_registered}</p>}
                  </div>
                )}

                {isFieldVisible('epf_registered') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      EPF Registered{isFieldRequired('epf_registered') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <select
                      name="epf_registered"
                      value={formData.epf_registered}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.epf_registered ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('epf_registered')}
                    >
                    <option value="">Select</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                    </select>
                    {errors.epf_registered && <p className="text-red-500 text-sm mt-1">{errors.epf_registered}</p>}
                  </div>
                )}
              </div>
            </section>

            {/* Document Uploads */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <Upload className="w-5 h-5 mr-2 text-blue-600" />
                Document Uploads
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {formData.gst_registered === 'yes' && isFieldVisible('gst_certificate_url') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      GST Certificate{isFieldRequired('gst_certificate_url') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => handleFileChange('gstCertificate', e.target.files?.[0] || null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">PDF, JPG, PNG (Max 10MB)</p>
                  </div>
                )}

                {isFieldVisible('udyam_certificate_url') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      UDYAM Certificate{isFieldRequired('udyam_certificate_url') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => handleFileChange('udyamCertificate', e.target.files?.[0] || null)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">PDF, JPG, PNG (Max 10MB)</p>
                  </div>
                )}

                {isFieldVisible('payment_proof_url') && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Payment Proof{isFieldRequired('payment_proof_url') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => handleFileChange('paymentProof', e.target.files?.[0] || null)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.payment_proof ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    <p className="text-xs text-gray-500 mt-1">Upload screenshot or receipt of your membership fee payment</p>
                    {errors.payment_proof && <p className="text-red-500 text-sm mt-1">{errors.payment_proof}</p>}
                  </div>
                )}
              </div>
            </section>

            {/* Payment Information */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <Phone className="w-5 h-5 mr-2 text-blue-600" />
                Payment Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {isFieldVisible('amount_paid') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount Paid{isFieldRequired('amount_paid') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="amount_paid"
                      value={formData.amount_paid}
                      onChange={handleInputChange}
                      placeholder="Select state and gender first"
                      disabled
                      className={`w-full px-3 py-2 border rounded-lg bg-gray-50 cursor-not-allowed ${
                        errors.amount_paid ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    {errors.amount_paid && <p className="text-red-500 text-sm mt-1">{errors.amount_paid}</p>}
                  </div>
                )}

                {isFieldVisible('payment_date') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Payment Date{isFieldRequired('payment_date') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="date"
                      name="payment_date"
                      value={formData.payment_date}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.payment_date ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('payment_date')}
                    />
                    {errors.payment_date && <p className="text-red-500 text-sm mt-1">{errors.payment_date}</p>}
                  </div>
                )}

                {isFieldVisible('payment_mode') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Payment Mode{isFieldRequired('payment_mode') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <select
                      name="payment_mode"
                      value={formData.payment_mode}
                      onChange={handleInputChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.payment_mode ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('payment_mode')}
                    >
                    <option value="">Select Payment Mode</option>
                    <option value="QR Code / UPI">QR Code / UPI</option>
                    <option value="Bank Transfer (NEFT/RTGS/IMPS)">Bank Transfer (NEFT/RTGS/IMPS)</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Demand Draft">Demand Draft</option>
                    <option value="Cash">Cash</option>
                    </select>
                    {errors.payment_mode && <p className="text-red-500 text-sm mt-1">{errors.payment_mode}</p>}
                  </div>
                )}

                {isFieldVisible('transaction_id') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Transaction ID / Reference{isFieldRequired('transaction_id') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="transaction_id"
                      value={formData.transaction_id}
                      onChange={handleInputChange}
                      placeholder="Transaction ID or reference number"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required={isFieldRequired('transaction_id')}
                    />
                  </div>
                )}

                {isFieldVisible('bank_reference') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bank Reference{isFieldRequired('bank_reference') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="bank_reference"
                      value={formData.bank_reference}
                      onChange={handleInputChange}
                      placeholder="Bank reference number (if any)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required={isFieldRequired('bank_reference')}
                    />
                  </div>
                )}
              </div>
            </section>

            {/* Additional Information */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <User className="w-5 h-5 mr-2 text-blue-600" />
                Additional Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {isFieldVisible('alternate_contact_name') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Alternate Contact Name{isFieldRequired('alternate_contact_name') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="alternate_contact_name"
                      value={formData.alternate_contact_name}
                      onChange={handleInputChange}
                      placeholder="Alternate contact person name"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required={isFieldRequired('alternate_contact_name')}
                    />
                  </div>
                )}

                {isFieldVisible('alternate_mobile') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Alternate Mobile{isFieldRequired('alternate_mobile') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="alternate_mobile"
                      value={formData.alternate_mobile}
                      onChange={handleMobileNumberChange}
                      onBlur={() => validateField('alternate_mobile')}
                      placeholder="Alternate mobile number"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.alternate_mobile ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required={isFieldRequired('alternate_mobile')}
                    />
                    {errors.alternate_mobile && <p className="text-red-500 text-sm mt-1">{errors.alternate_mobile}</p>}
                  </div>
                )}

                {isFieldVisible('referred_by') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Referred By{isFieldRequired('referred_by') && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <input
                      type="text"
                      name="referred_by"
                      value={formData.referred_by}
                      onChange={handleInputChange}
                      placeholder="Name of the person who referred you"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required={isFieldRequired('referred_by')}
                    />
                  </div>
                )}
              </div>
            </section>

            {/* Submit Button */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between pt-8 border-t border-gray-200">
              <Link
                to="/payment"
                className="inline-flex items-center justify-center px-6 py-3 border border-gray-300 text-base font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors duration-200 sm:order-1"
              >
                <ArrowLeft className="mr-2 h-5 w-5" />
                View Payment Details
              </Link>
              
              <button
                type="submit"
                disabled={isSubmitting}
                className={`inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-lg text-white transition-colors duration-200 sm:order-2 ${
                  isSubmitting
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
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
                    Submit Registration
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <ImageCropModal
          imageSrc={photoImageSrc}
          isOpen={isCropModalOpen}
          onClose={() => setIsCropModalOpen(false)}
          onCropComplete={handleCropComplete}
          onError={handleCropError}
        />

        <NormalizationPreviewModal
          isOpen={showNormalizationModal}
          original={normalizationResult?.original || {}}
          normalized={normalizationResult?.normalized || {}}
          onAccept={handleAcceptNormalization}
          onReject={handleRejectNormalization}
        />
      </div>
    </div>
  );
};

export default Join;