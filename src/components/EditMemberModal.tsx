import React, { useState, useEffect, useCallback } from 'react';
import { X, Save, AlertCircle, Loader2, Camera, Upload, X as XIcon, CheckCircle } from 'lucide-react';
import {
  supabase,
  memberRegistrationService,
  statesService,
  locationsService,
  companyDesignationsService,
  fileUploadService,
  CompanyDesignation,
  PublicPaymentState,
  DistrictOption,
  CityOption
} from '../lib/supabase';
import { customAuth } from '../lib/customAuth';
import { useFormFieldConfig } from '../hooks/useFormFieldConfig';
import { useValidation } from '../hooks/useValidation';
import ImageCropModal from './ImageCropModal';
import { readFileAsDataURL, validateImageFile, generatePhotoFileName } from '../lib/imageProcessing';

type MemberEditFormValue = string | boolean | null | undefined;

interface EditableMember {
  id: string;
  full_name?: string | null;
  email?: string | null;
  mobile_number?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  member_id?: string | null;
  company_name?: string | null;
  company_designation_id?: string | null;
  company_address?: string | null;
  city?: string | null;
  other_city_name?: string | null;
  is_custom_city?: boolean | null;
  district?: string | null;
  state?: string | null;
  pin_code?: string | null;
  industry?: string | null;
  activity_type?: string | null;
  constitution?: string | null;
  annual_turnover?: string | null;
  number_of_employees?: string | null;
  products_services?: string | null;
  brand_names?: string | null;
  website?: string | null;
  gst_registered?: string | null;
  gst_number?: string | null;
  pan_company?: string | null;
  esic_registered?: string | null;
  epf_registered?: string | null;
  alternate_contact_name?: string | null;
  alternate_mobile?: string | null;
  referred_by?: string | null;
  amount_paid?: string | null;
  payment_date?: string | null;
  payment_mode?: string | null;
  transaction_id?: string | null;
  bank_reference?: string | null;
  profile_photo_url?: string | null;
}

interface MemberEditFormData {
  [key: string]: MemberEditFormValue;
  full_name: string;
  email: string;
  mobile_number: string;
  gender: string;
  date_of_birth: string;
  member_id: string;
  company_name: string;
  company_designation_id: string;
  company_address: string;
  city: string;
  other_city_name: string;
  is_custom_city: boolean;
  district: string;
  state: string;
  pin_code: string;
  industry: string;
  activity_type: string;
  constitution: string;
  annual_turnover: string;
  number_of_employees: string;
  products_services: string;
  brand_names: string;
  website: string;
  gst_registered: string;
  gst_number: string;
  pan_company: string;
  esic_registered: string;
  epf_registered: string;
  alternate_contact_name: string;
  alternate_mobile: string;
  referred_by: string;
  amount_paid: string;
  payment_date: string;
  payment_mode: string;
  transaction_id: string;
  bank_reference: string;
  profile_photo_url?: string | null;
}

interface EditMemberModalProps {
  member: EditableMember;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
}

const EditMemberModal: React.FC<EditMemberModalProps> = ({
  member,
  isOpen,
  onClose,
  onSuccess,
  onError
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [formData, setFormData] = useState<MemberEditFormData>({
    full_name: '',
    email: '',
    mobile_number: '',
    gender: 'male',
    date_of_birth: '',
    member_id: '',
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
    alternate_contact_name: '',
    alternate_mobile: '',
    referred_by: '',
    amount_paid: '',
    payment_date: '',
    payment_mode: '',
    transaction_id: '',
    bank_reference: '',
  });
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  // Location state
  const [availableStates, setAvailableStates] = useState<PublicPaymentState[]>([]);
  const [availableDistricts, setAvailableDistricts] = useState<DistrictOption[]>([]);
  const [availableCities, setAvailableCities] = useState<CityOption[]>([]);
  const [availableDesignations, setAvailableDesignations] = useState<CompanyDesignation[]>([]);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string>('');
  const [showOtherCity, setShowOtherCity] = useState(false);
  const [otherCityText, setOtherCityText] = useState('');
  const [cachedOtherCityText, setCachedOtherCityText] = useState('');

  // Loading states
  const [isLoadingStates, setIsLoadingStates] = useState(true);
  const [isLoadingDesignations, setIsLoadingDesignations] = useState(true);
  const [isLoadingDistricts, setIsLoadingDistricts] = useState(false);
  const [isLoadingCities, setIsLoadingCities] = useState(false);

  // Profile photo state
  const [profilePhoto, setProfilePhoto] = useState<Blob | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string>('');
  const [photoFileName, setPhotoFileName] = useState<string>('');
  const [photoImageSrc, setPhotoImageSrc] = useState<string>('');
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);


  const { isFieldVisible, isFieldRequired, isLoading: isLoadingFieldConfig } = useFormFieldConfig();
  const { validateField: validateFieldByRule, isLoading: isLoadingValidation } = useValidation();

  const normalizePaymentMode = (value: string | null | undefined): string => {
    if (!value) return '';

    // Handle old format values (safety backup)
    if (value === 'Bank Transfer') return 'Bank Transfer (NEFT/RTGS/IMPS)';
    if (value === 'QR Code') return 'QR Code / UPI';

    // Clear invalid values
    if (value === '-' || (value.includes('Cash') && value.includes('Bank'))) return '';

    return value;
  };

  const checkUserRole = useCallback(async () => {
    try {
      const isSuperAdminUser = await customAuth.isUserSuperAdmin();
      setIsSuperAdmin(isSuperAdminUser);
    } catch (error) {
      console.error('Error checking user role:', error);
      setIsSuperAdmin(false);
    }
  }, []);

  const loadStates = useCallback(async () => {
    try {
      console.log('[EditMemberModal] Loading states...');
      setIsLoadingStates(true);
      const states = await statesService.getPublicPaymentStates();
      console.log('[EditMemberModal] States loaded:', states.length, 'states');
      setAvailableStates(states.sort((a, b) => a.state.localeCompare(b.state)));
    } catch (error) {
      console.error('Error loading states:', error);
    } finally {
      setIsLoadingStates(false);
    }
  }, []);

  const loadDesignations = useCallback(async () => {
    try {
      console.log('[EditMemberModal] Loading designations...');
      setIsLoadingDesignations(true);
      const designations = await companyDesignationsService.getActiveDesignations();
      console.log('[EditMemberModal] Designations loaded:', designations.length);
      setAvailableDesignations(designations);
    } catch (error) {
      console.error('Error loading designations:', error);
    } finally {
      setIsLoadingDesignations(false);
    }
  }, []);

  const loadDistricts = useCallback(async (stateName: string) => {
    try {
      console.log('[EditMemberModal] Loading districts for state:', stateName);
      setIsLoadingDistricts(true);
      const districts = await locationsService.getActiveDistrictsByStateName(stateName);
      console.log('[EditMemberModal] Districts loaded:', districts.length, 'districts');
      setAvailableDistricts(districts);
    } catch (error) {
      console.error('Error loading districts:', error);
    } finally {
      setIsLoadingDistricts(false);
    }
  }, []);

  const loadCities = useCallback(async (districtId: string) => {
    try {
      console.log('[EditMemberModal] Loading cities for district:', districtId);
      setIsLoadingCities(true);
      const cities = await locationsService.getActiveCitiesByDistrictId(districtId);
      console.log('[EditMemberModal] Cities loaded:', cities.length, 'cities');
      setAvailableCities(cities);

      // Only auto-show "Other" if no cities available AND we don't already have a custom city loaded
      if (cities.length === 0 && !formData.is_custom_city) {
        console.log('[EditMemberModal] No cities available, showing custom city option');
        setShowOtherCity(true);
      }
    } catch (error) {
      console.error('Error loading cities:', error);
    } finally {
      setIsLoadingCities(false);
    }
  }, [formData.is_custom_city]);

  useEffect(() => {
    void checkUserRole();
    void loadStates();
    void loadDesignations();
  }, [checkUserRole, loadStates, loadDesignations]);

  useEffect(() => {
    if (member) {
      console.log('[EditMemberModal] Loading member data for editing:', member.id);
      console.log('[EditMemberModal] Member has custom city:', member.is_custom_city);
      console.log('[EditMemberModal] City value:', member.city);
      console.log('[EditMemberModal] Other city name:', member.other_city_name);
      console.log('[EditMemberModal] Loaded payment_mode value:', member.payment_mode);
      const isCustomCity = member.is_custom_city || false;

      // Reset photo deletion flag when loading new member
      setPhotoToDelete(null);

      setFormData({
        full_name: member.full_name || '',
        email: member.email || '',
        mobile_number: member.mobile_number || '',
        gender: member.gender || 'male',
        date_of_birth: member.date_of_birth || '',
        member_id: member.member_id || '',
        company_name: member.company_name || '',
        company_designation_id: member.company_designation_id || '',
        company_address: member.company_address || '',
        city: isCustomCity ? '' : (member.city || ''),
        other_city_name: member.other_city_name || '',
        is_custom_city: isCustomCity,
        district: member.district || '',
        state: member.state || '',
        pin_code: member.pin_code || '',
        industry: member.industry || '',
        activity_type: member.activity_type || '',
        constitution: member.constitution || '',
        annual_turnover: member.annual_turnover || '',
        number_of_employees: member.number_of_employees || '',
        products_services: member.products_services || '',
        brand_names: member.brand_names || '',
        website: member.website || '',
        gst_registered: member.gst_registered || '',
        gst_number: member.gst_number || '',
        pan_company: member.pan_company || '',
        esic_registered: member.esic_registered || '',
        epf_registered: member.epf_registered || '',
        alternate_contact_name: member.alternate_contact_name || '',
        alternate_mobile: member.alternate_mobile || '',
        referred_by: member.referred_by || '',
        amount_paid: member.amount_paid || '',
        payment_date: member.payment_date || '',
        payment_mode: normalizePaymentMode(member.payment_mode),
        transaction_id: member.transaction_id || '',
        bank_reference: member.bank_reference || ''
      });

      console.log('[EditMemberModal] formData.payment_mode after setFormData:', normalizePaymentMode(member.payment_mode));

      // Set showOtherCity state if this is a custom city
      if (isCustomCity) {
        console.log('[EditMemberModal] Member has custom city, showing custom city input');
        setShowOtherCity(true);
        const loadedCustomCity = member.other_city_name || '';
        setOtherCityText(loadedCustomCity);
        setCachedOtherCityText(loadedCustomCity);
      } else {
        console.log('[EditMemberModal] Member has standard city');
        setShowOtherCity(false);
        setOtherCityText('');
        setCachedOtherCityText(member.other_city_name || '');
      }

      // Initialize profile photo preview if member has a photo
      if (member.profile_photo_url) {
        setProfilePhotoPreview(member.profile_photo_url);
      } else {
        setProfilePhotoPreview('');
        setProfilePhoto(null);
        setPhotoFileName('');
      }
    }
  }, [member]);

  // Load states when district changes
  useEffect(() => {
    if (formData.state) {
      void loadDistricts(formData.state);
    } else {
      setAvailableDistricts([]);
      setAvailableCities([]);
      setSelectedDistrictId('');
      setShowOtherCity(false);
      setOtherCityText('');
    }
  }, [formData.state, loadDistricts]);

  // Load cities when district changes
  useEffect(() => {
    if (selectedDistrictId) {
      void loadCities(selectedDistrictId);
    } else {
      setAvailableCities([]);
      // Don't clear showOtherCity if we have a custom city loaded
      if (!formData.is_custom_city) {
        setShowOtherCity(false);
        setOtherCityText('');
      }
    }
  }, [selectedDistrictId, formData.is_custom_city, loadCities]);

  // When member data loads, set the selected district ID
  useEffect(() => {
    if (member && member.district && availableDistricts.length > 0) {
      const selectedDistrict = availableDistricts.find(d => d.district_name === member.district);

      if (selectedDistrict) {
        setSelectedDistrictId(selectedDistrict.district_id);
      }
    }
  }, [member, availableDistricts]);

  // Preserve custom city state after cities load
  useEffect(() => {
    if (formData.is_custom_city && formData.other_city_name && !isLoadingCities) {
      if (!showOtherCity || otherCityText !== formData.other_city_name) {
        setShowOtherCity(true);
        setOtherCityText(formData.other_city_name);
      }
    }
  }, [availableCities, isLoadingCities, formData.is_custom_city, formData.other_city_name, otherCityText, showOtherCity]);

  const shouldShowField = (fieldName: string): boolean => {
    if (isSuperAdmin) {
      return true;
    }
    return isFieldVisible(fieldName);
  };

  const isFieldRequiredForUser = (fieldName: string): boolean => {
    if (!shouldShowField(fieldName)) {
      return false;
    }
    return isFieldRequired(fieldName);
  };

  const renderRequiredIndicator = (fieldName: string) => {
    if (isFieldRequiredForUser(fieldName)) {
      return <span className="text-red-500">*</span>;
    }
    return null;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const stateName = e.target.value;
    console.log('[EditMemberModal] State changed to:', stateName);

    setFormData(prev => ({
      ...prev,
      state: stateName,
      district: '',
      city: '',
      other_city_name: '',
      is_custom_city: false
    }));
    setSelectedDistrictId('');
    setShowOtherCity(false);
    setOtherCityText('');
    setCachedOtherCityText('');

    if (validationErrors.state) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.state;
        return newErrors;
      });
    }
  };

  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const districtName = e.target.value;
    const selectedDistrict = availableDistricts.find(d => d.district_name === districtName);

    setFormData(prev => ({ ...prev, district: districtName, city: '', other_city_name: '', is_custom_city: false }));
    setSelectedDistrictId(selectedDistrict?.district_id || '');
    setShowOtherCity(false);
    setOtherCityText('');
    setCachedOtherCityText('');

    if (validationErrors.district) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.district;
        return newErrors;
      });
    }
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const cityName = e.target.value;
    console.log('[EditMemberModal] City changed to:', cityName);

    if (cityName === 'Other') {
      console.log('[EditMemberModal] "Other" city selected, enabling custom city input');
      const restoredCustomCity = formData.other_city_name || cachedOtherCityText || '';
      setShowOtherCity(true);
      setFormData(prev => ({ ...prev, city: '', other_city_name: restoredCustomCity, is_custom_city: true }));
      setOtherCityText(restoredCustomCity);
    } else {
      console.log('[EditMemberModal] Standard city selected');
      if (formData.other_city_name?.trim()) {
        setCachedOtherCityText(formData.other_city_name.trim());
      } else if (otherCityText.trim()) {
        setCachedOtherCityText(otherCityText.trim());
      }
      setShowOtherCity(false);
      setOtherCityText('');
      setFormData(prev => ({ ...prev, city: cityName, other_city_name: '', is_custom_city: false }));
    }

    if (validationErrors.city) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.city;
        return newErrors;
      });
    }
  };

  const handleOtherCityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    console.log('[EditMemberModal] Custom city name changed to:', value);
    setOtherCityText(value);
    setCachedOtherCityText(value);

    setFormData(prev => ({
      ...prev,
      other_city_name: value,
      is_custom_city: true
    }));

    if (validationErrors.city) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.city;
        return newErrors;
      });
    }
  };

  const handleAlternateMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let numericValue = value.replace(/\D/g, '');
    if (numericValue.length > 0 && numericValue[0] === '0') {
      numericValue = numericValue.substring(1);
    }
    // No length limit - let validation handle it
    setFormData(prev => ({ ...prev, [name]: numericValue }));
    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleGstChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Remove all non-alphanumeric characters and convert to uppercase
    const alphanumericValue = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    // No length limit - let validation handle it

    setFormData(prev => ({ ...prev, [name]: alphanumericValue }));

    // Clear error when user starts typing
    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handlePanChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    // Remove all non-alphanumeric characters and convert to uppercase
    const alphanumericValue = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    // No length limit - let validation handle it

    setFormData(prev => ({ ...prev, [name]: alphanumericValue }));

    // Clear error when user starts typing
    if (validationErrors[name]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateSingleField = async (fieldName: string) => {
    const value = formData[fieldName];

    console.log('[EditModal] validateSingleField called for:', fieldName, 'value:', value ? (value.toString().substring(0, 20) + '...') : '(empty)');

    // Clear error if field is empty
    if (!value || value.toString().trim() === '') {
      if (validationErrors[fieldName]) {
        setValidationErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[fieldName];
          return newErrors;
        });
      }
      return;
    }

    // Pass field name directly to validateFieldByRule
    console.log('[EditModal] Validating field:', fieldName);
    const result = await validateFieldByRule(fieldName, value.toString());
    console.log('[EditModal] Validation result for', fieldName, ':', result.isValid ? 'VALID' : 'INVALID', '-', result.message || '(no error)');
    if (!result.isValid) {
      setValidationErrors(prev => ({ ...prev, [fieldName]: result.message }));
    } else {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
    }
  };

  const validateForm = async (): Promise<boolean> => {
    console.log('[EditMemberModal] Starting form validation...');
    const errors: { [key: string]: string } = {};

    const fieldsToValidate = [
      'full_name',
      'email',
      'mobile_number',
      'gender',
      'date_of_birth',
      'company_name',
      'company_designation_id',
      'company_address',
      'state',
      'district',
      'city',
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
      'alternate_contact_name',
      'alternate_mobile',
      'referred_by'
    ];

    if (isSuperAdmin) {
      fieldsToValidate.push('amount_paid', 'payment_date', 'payment_mode');
    }

    fieldsToValidate.forEach(fieldName => {
      if (fieldName === 'city' && formData.is_custom_city) {
        return;
      }
      if (isFieldRequiredForUser(fieldName)) {
        const value = formData[fieldName];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          const fieldLabel = fieldName
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
          errors[fieldName] = `${fieldLabel} is required`;
        }
      }
    });

    // Validate that other_city_name is provided when is_custom_city is true
    if (formData.is_custom_city && isFieldRequiredForUser('city')) {
      if (!formData.other_city_name || formData.other_city_name.trim() === '') {
        errors.city = 'Please enter a city/town/village name';
      }
    }

    // Email validation using centralized validation
    if (formData.email) {
      const emailResult = await validateFieldByRule('email', formData.email);
      if (!emailResult.isValid) {
        errors.email = emailResult.message;
      }
    }

    // Mobile number validation using centralized validation
    if (formData.mobile_number) {
      const mobileResult = await validateFieldByRule('mobile_number', formData.mobile_number);
      if (!mobileResult.isValid) {
        errors.mobile_number = mobileResult.message;
      }
    }

    // Alternate mobile validation using centralized validation
    if (formData.alternate_mobile) {
      const altMobileResult = await validateFieldByRule('alternate_mobile', formData.alternate_mobile);
      if (!altMobileResult.isValid) {
        errors.alternate_mobile = altMobileResult.message;
      }
    }

    // PIN code validation using centralized validation
    if (formData.pin_code) {
      const pinResult = await validateFieldByRule('pin_code', formData.pin_code);
      if (!pinResult.isValid) {
        errors.pin_code = pinResult.message;
      }
    }

    // PAN validation using centralized validation
    if (formData.pan_company) {
      const panResult = await validateFieldByRule('pan_company', formData.pan_company);
      if (!panResult.isValid) {
        errors.pan_company = panResult.message;
      }
    }

    // GST validation using centralized validation
    if (formData.gst_number) {
      const gstResult = await validateFieldByRule('gst_number', formData.gst_number);
      if (!gstResult.isValid) {
        errors.gst_number = gstResult.message;
      }
    }

    // Website validation using centralized validation
    if (formData.website) {
      const websiteResult = await validateFieldByRule('website', formData.website);
      if (!websiteResult.isValid) {
        errors.website = websiteResult.message;
      }
    }

    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      console.log('[EditMemberModal] Validation failed with errors:', Object.keys(errors));
    } else {
      console.log('[EditMemberModal] Validation passed');
    }
    return Object.keys(errors).length === 0;
  };

  const sanitizeFormData = (data: MemberEditFormData): MemberEditFormData => {
    console.log('[EditMemberModal] Sanitizing form data');
    console.log('[EditMemberModal] is_custom_city:', data.is_custom_city);
    console.log('[EditMemberModal] city:', data.city);
    console.log('[EditMemberModal] other_city_name:', data.other_city_name);
    const sanitized: MemberEditFormData = { ...data };

    // DEFENSIVE CHECK: If other_city_name has a value but city is empty/null, infer custom city
    if (sanitized.other_city_name && sanitized.other_city_name.trim() !== '' &&
        (!sanitized.city || sanitized.city.trim() === '')) {
      console.log('[EditMemberModal] Defensive check: inferring custom city from other_city_name');
      sanitized.is_custom_city = true;
    }

    // Handle custom city: when is_custom_city is true, set city to null
    // The custom city name is stored in other_city_name field
    // CRITICAL: Explicitly preserve the is_custom_city flag to ensure it's saved to database
    if (sanitized.is_custom_city === true) {
      console.log('[EditMemberModal] Custom city detected, setting city to null');
      sanitized.city = null;
      // Ensure other_city_name has a value when is_custom_city is true
      if (!sanitized.other_city_name || sanitized.other_city_name.trim() === '') {
        console.error('[EditMemberModal] VALIDATION ERROR: is_custom_city is true but other_city_name is empty');
      }
    } else {
      // When is_custom_city is false, clear other_city_name to maintain data integrity
      sanitized.other_city_name = null;
      // Explicitly set is_custom_city to false to ensure it's not undefined
      sanitized.is_custom_city = false;
    }

    // Convert empty strings to null for UUID fields
    if (sanitized.company_designation_id === '' || sanitized.company_designation_id === undefined) {
      sanitized.company_designation_id = null;
    }

    // Convert empty strings to null for date fields
    if (sanitized.date_of_birth === '' || sanitized.date_of_birth === undefined) {
      sanitized.date_of_birth = null;
    }

    if (sanitized.payment_date === '' || sanitized.payment_date === undefined) {
      sanitized.payment_date = null;
    }

    // Convert empty strings to null for registration status fields
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

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      onError(validation.error || 'Invalid file');
      e.target.value = '';
      return;
    }

    try {
      const imageSrc = await readFileAsDataURL(file);
      setPhotoImageSrc(imageSrc);
      setIsCropModalOpen(true);
    } catch {
      onError('Failed to read image file');
      e.target.value = '';
    }
  };

  const handleCropComplete = (croppedImageBlob: Blob) => {
    console.log('[EditMemberModal] Profile photo cropped successfully');
    setProfilePhoto(croppedImageBlob);
    setPhotoFileName(generatePhotoFileName());

    const previewUrl = URL.createObjectURL(croppedImageBlob);
    setProfilePhotoPreview(previewUrl);
  };

  const handleRemovePhoto = () => {
    if (member.profile_photo_url) {
      const confirmDelete = window.confirm('Are you sure you want to remove this photo? The change will be saved when you click "Save Changes".');
      if (!confirmDelete) return;

      // Mark the existing photo for deletion when form is saved
      setPhotoToDelete(member.profile_photo_url);

      // Update form data to indicate photo should be removed
      setFormData(prev => ({ ...prev, profile_photo_url: null }));
    }

    // Clear the photo preview and any pending new photo
    setProfilePhoto(null);
    setProfilePhotoPreview('');
    setPhotoFileName('');

    // Clear the file input
    const fileInput = document.getElementById('edit-profile-photo-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleCropError = (error: string) => {
    onError(error);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[EditMemberModal] Form submission started for member:', member.id);

    if (isLoadingFieldConfig) {
      console.log('[EditMemberModal] Field configuration still loading, aborting');
      onError('Loading field configuration, please wait...');
      return;
    }

    // Proceed with validation and submission (normalization removed for editing)
    const isValid = await validateForm();
    if (!isValid) {
      console.log('[EditMemberModal] Validation failed, aborting submission');
      onError('Please fill in all required fields');
      return;
    }

    setIsSaving(true);
    console.log('[EditMemberModal] Proceeding with member update...');

    try {
      const user = await customAuth.getCurrentUserFromSession();
      if (!user) {
        onError('User not authenticated');
        return;
      }

      // Check member_id uniqueness if it's being set
      if (isSuperAdmin && formData.member_id && formData.member_id.trim()) {
        console.log('[EditMemberModal] Checking member_id uniqueness:', formData.member_id);
        const { data: existingMember } = await supabase
          .from('member_registrations')
          .select('id, full_name')
          .eq('member_id', formData.member_id.trim())
          .neq('id', member.id)
          .maybeSingle();

        if (existingMember) {
          console.log('[EditMemberModal] Member ID already exists:', formData.member_id);
          onError(`Member ID "${formData.member_id}" is already assigned to ${existingMember.full_name}`);
          setIsSaving(false);
          return;
        }
        console.log('[EditMemberModal] Member ID is unique');
      }

      // ============================================================================
      // CHECK EMAIL DUPLICATE (only if email changed)
      // ============================================================================
      if (formData.email && formData.email.trim() !== member.email) {
        console.log('[EditMemberModal] Email changed, checking for duplicates:', formData.email);
        const emailDuplicateCheck = await memberRegistrationService.checkEmailDuplicate(
          formData.email.trim(),
          member.id
        );

        if (emailDuplicateCheck.isDuplicate) {
          console.log('[EditMemberModal] Duplicate email found:', formData.email);
          onError(`This email is already registered to another member: ${emailDuplicateCheck.memberName || 'Unknown'}`);
          setIsSaving(false);
          return;
        }
        console.log('[EditMemberModal] Email is unique');
      }

      // ============================================================================
      // CHECK MOBILE DUPLICATE (only if mobile number changed)
      // ============================================================================
      if (formData.mobile_number && formData.mobile_number.trim() !== member.mobile_number) {
        console.log('[EditMemberModal] Mobile number changed, checking for duplicates:', formData.mobile_number);
        const mobileDuplicateCheck = await memberRegistrationService.checkMobileDuplicate(
          formData.mobile_number.trim(),
          member.id
        );

        if (mobileDuplicateCheck.isDuplicate) {
          console.log('[EditMemberModal] Duplicate mobile number found:', formData.mobile_number);
          onError(`This mobile number is already registered to another member: ${mobileDuplicateCheck.memberName || 'Unknown'}`);
          setIsSaving(false);
          return;
        }
        console.log('[EditMemberModal] Mobile number is unique');
      }

      // Handle photo deletion if photo was marked for removal
      if (photoToDelete) {
        console.log('[EditMemberModal] Deleting removed profile photo...');
        setIsUploadingPhoto(true);
        try {
          await fileUploadService.deleteProfilePhoto(photoToDelete);
          console.log('[EditMemberModal] Old profile photo deleted successfully');
          formData.profile_photo_url = null;
          setPhotoToDelete(null); // Clear the deletion flag
        } catch (error) {
          console.error('Error deleting old photo:', error);
          onError('Failed to delete old photo, but continuing with other updates');
        } finally {
          setIsUploadingPhoto(false);
        }
      }

      // Upload new profile photo if one was selected
      if (profilePhoto && photoFileName) {
        console.log('[EditMemberModal] Uploading new profile photo...');
        setIsUploadingPhoto(true);
        try {
          // Delete old photo if exists (and wasn't already deleted above)
          if (member.profile_photo_url && !photoToDelete) {
            console.log('[EditMemberModal] Deleting old profile photo before uploading new one');
            await fileUploadService.deleteProfilePhoto(member.profile_photo_url);
          }

          // Upload new photo
          const profilePhotoUrl = await fileUploadService.uploadProfilePhoto(
            profilePhoto,
            photoFileName
          );

          if (profilePhotoUrl) {
            console.log('[EditMemberModal] Profile photo uploaded successfully');
            formData.profile_photo_url = profilePhotoUrl;
          } else {
            console.log('[EditMemberModal] Profile photo upload failed');
            onError('Failed to upload profile photo, but continuing with other updates');
          }
        } catch (error) {
          console.error('Error uploading photo:', error);
          onError('Failed to upload profile photo, but continuing with other updates');
        } finally {
          setIsUploadingPhoto(false);
        }
      }

      // Sanitize form data before submitting
      const sanitizedData = sanitizeFormData(formData);
      console.log('[EditMemberModal] Data sanitized, submitting update...');

      const result = await memberRegistrationService.updateMemberRegistration(
        member.id,
        sanitizedData
      );

      if (result.success) {
        console.log('[EditMemberModal] Member updated successfully');
        onSuccess();
        onClose();
      } else {
        console.log('[EditMemberModal] Member update failed:', result.error);
        onError(result.error || 'Failed to update member');
      }
    } catch (error) {
      console.error('Error updating member:', error);
      onError('An unexpected error occurred');
    } finally {
      setIsSaving(false);
    }
  };


  if (!isOpen) return null;

  if (isLoadingFieldConfig || isLoadingValidation) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-card rounded-lg shadow-xl p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading form configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-card rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-section font-semibold text-foreground">Edit Member Information</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {isSuperAdmin === false && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start">
              <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium">Limited Editing Access</p>
                <p className="mt-1">You cannot edit payment-related fields. Only super admins can modify payment information.</p>
              </div>
            </div>
          )}

          {isSuperAdmin && (
            <div className="mb-6 p-4 bg-primary/5 border border-border rounded-lg flex items-start">
              <AlertCircle className="w-5 h-5 text-primary mr-3 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-foreground">
                <p className="font-medium">Super Admin Mode</p>
                <p className="mt-1">You can see and edit all fields, including those hidden in the registration form. Required fields match the registration form settings.</p>
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div>
              <h3 className="text-section font-medium text-foreground mb-4">Personal Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {shouldShowField('full_name') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Full Name {renderRequiredIndicator('full_name')}
                    </label>
                    <input
                      type="text"
                      name="full_name"
                      value={formData.full_name}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.full_name ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {validationErrors.full_name && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.full_name}</p>
                    )}
                  </div>
                )}

                {shouldShowField('email') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Email {renderRequiredIndicator('email')}
                    </label>
                    <input
                      type="text"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      onBlur={() => validateSingleField('email')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.email ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {validationErrors.email && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.email}</p>
                    )}
                  </div>
                )}

                {shouldShowField('mobile_number') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Mobile Number {renderRequiredIndicator('mobile_number')}
                    </label>
                    <input
                      type="text"
                      name="mobile_number"
                      value={formData.mobile_number}
                      onChange={handleChange}
                      onBlur={() => validateSingleField('mobile_number')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.mobile_number ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {validationErrors.mobile_number && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.mobile_number}</p>
                    )}
                  </div>
                )}

                {shouldShowField('gender') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Gender {renderRequiredIndicator('gender')}
                    </label>
                    <select
                      name="gender"
                      value={formData.gender}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.gender ? 'border-red-500' : 'border-border'
                      }`}
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                    {validationErrors.gender && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.gender}</p>
                    )}
                  </div>
                )}

                {shouldShowField('date_of_birth') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Date of Birth {renderRequiredIndicator('date_of_birth')}
                    </label>
                    <input
                      type="date"
                      name="date_of_birth"
                      value={formData.date_of_birth}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.date_of_birth ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {validationErrors.date_of_birth && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.date_of_birth}</p>
                    )}
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
                        id="edit-profile-photo-input"
                        accept="image/jpeg,image/jpg,image/png"
                        onChange={handlePhotoSelect}
                        className="hidden"
                        disabled={isUploadingPhoto}
                      />
                      <label
                        htmlFor="edit-profile-photo-input"
                        className={`inline-flex items-center px-4 py-2 border border-border rounded-lg text-sm font-medium text-foreground bg-card hover:bg-muted/50 cursor-pointer transition-colors ${
                          isUploadingPhoto ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {isUploadingPhoto ? 'Uploading...' : 'Upload Photo'}
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
                        <p className="text-sm text-green-600 font-medium mb-2 flex items-center">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          {profilePhoto ? 'New photo ready' : 'Current photo'}
                        </p>
                        <p className="text-xs text-muted-foreground mb-3">
                          {profilePhoto
                            ? 'This photo will be uploaded when you save changes.'
                            : 'This is the current profile photo. You can replace or remove it.'}
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="file"
                            id="edit-replace-photo-input"
                            accept="image/jpeg,image/jpg,image/png"
                            onChange={handlePhotoSelect}
                            className="hidden"
                            disabled={isUploadingPhoto}
                          />
                          <label
                            htmlFor="edit-replace-photo-input"
                            className={`inline-flex items-center px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 cursor-pointer transition-colors ${
                              isUploadingPhoto ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                          >
                            <Upload className="w-4 h-4 mr-1" />
                            Replace
                          </label>
                          <button
                            type="button"
                            onClick={handleRemovePhoto}
                            disabled={isUploadingPhoto}
                            className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <XIcon className="w-4 h-4 mr-1" />
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {isSuperAdmin && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Member ID (Certificate Number)
                    </label>
                    <input
                      type="text"
                      name="member_id"
                      value={formData.member_id}
                      onChange={handleChange}
                      placeholder="e.g., LUB-2024-001"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.member_id ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Certificate number printed on official certificates (optional, must be unique)
                    </p>
                    {validationErrors.member_id && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.member_id}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-section font-medium text-foreground mb-4">Company Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {shouldShowField('company_name') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Company Name {renderRequiredIndicator('company_name')}
                    </label>
                    <input
                      type="text"
                      name="company_name"
                      value={formData.company_name}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.company_name ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {validationErrors.company_name && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.company_name}</p>
                    )}
                  </div>
                )}

                {shouldShowField('company_designation_id') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Designation {renderRequiredIndicator('company_designation_id')}
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
                        onChange={handleChange}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                          validationErrors.company_designation_id ? 'border-red-500' : 'border-border'
                        }`}
                      >
                        <option value="">Select Designation</option>
                        {availableDesignations.map(designation => (
                          <option key={designation.id} value={designation.id}>
                            {designation.designation_name}
                          </option>
                        ))}
                      </select>
                    )}
                    {validationErrors.company_designation_id && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.company_designation_id}</p>
                    )}
                  </div>
                )}

                {shouldShowField('company_address') && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Company Address {renderRequiredIndicator('company_address')}
                    </label>
                    <textarea
                      name="company_address"
                      value={formData.company_address}
                      onChange={handleChange}
                      rows={2}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.company_address ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {validationErrors.company_address && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.company_address}</p>
                    )}
                  </div>
                )}

                {shouldShowField('state') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      State {renderRequiredIndicator('state')}
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
                        onChange={handleStateChange}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                          validationErrors.state ? 'border-red-500' : 'border-border'
                        }`}
                      >
                        <option value="">Select State</option>
                        {availableStates.map(state => (
                          <option key={state.state} value={state.state}>
                            {state.state}
                          </option>
                        ))}
                      </select>
                    )}
                    {validationErrors.state && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.state}</p>
                    )}
                  </div>
                )}

                {shouldShowField('district') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      District {renderRequiredIndicator('district')}
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
                          validationErrors.district ? 'border-red-500' : 'border-border'
                        }`}
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
                    {validationErrors.district && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.district}</p>
                    )}
                  </div>
                )}

                {shouldShowField('city') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      City {renderRequiredIndicator('city')}
                    </label>
                    {isLoadingCities ? (
                      <div className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 flex items-center">
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Loading cities...
                      </div>
                    ) : (
                      <select
                        name="city"
                        value={showOtherCity ? 'Other' : (formData.city || '')}
                        onChange={handleCityChange}
                        disabled={!selectedDistrictId && !showOtherCity}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring disabled:bg-muted/50 disabled:cursor-not-allowed ${
                          validationErrors.city ? 'border-red-500' : 'border-border'
                        }`}
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
                    {validationErrors.city && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.city}</p>
                    )}
                  </div>
                )}

                {showOtherCity && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Enter City/Town/Village {renderRequiredIndicator('city')}
                    </label>
                    <input
                      type="text"
                      value={otherCityText}
                      onChange={handleOtherCityChange}
                      placeholder="Enter your city, town, or village"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.city ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Enter your city, town, or village name</p>
                    {validationErrors.city && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.city}</p>
                    )}
                  </div>
                )}

                {shouldShowField('pin_code') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      PIN Code {renderRequiredIndicator('pin_code')}
                    </label>
                    <input
                      type="text"
                      name="pin_code"
                      value={formData.pin_code}
                      onChange={handleChange}
                      onBlur={() => validateSingleField('pin_code')}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.pin_code ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {validationErrors.pin_code && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.pin_code}</p>
                    )}
                  </div>
                )}

                {shouldShowField('products_services') && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Products & Services {renderRequiredIndicator('products_services')}
                    </label>
                    <textarea
                      name="products_services"
                      value={formData.products_services}
                      onChange={handleChange}
                      rows={2}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.products_services ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {validationErrors.products_services && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.products_services}</p>
                    )}
                  </div>
                )}

                {shouldShowField('website') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Website {renderRequiredIndicator('website')}
                    </label>
                    <input
                      type="text"
                      name="website"
                      value={formData.website}
                      onChange={handleChange}
                      onBlur={() => validateSingleField('website')}
                      placeholder="www.yourcompany.com"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.website ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {validationErrors.website && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.website}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-section font-medium text-foreground mb-4">Business Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {shouldShowField('industry') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Industry {renderRequiredIndicator('industry')}
                    </label>
                    <select
                      name="industry"
                      value={formData.industry}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.industry ? 'border-red-500' : 'border-border'
                      }`}
                    >
                      <option value="">Select Industry</option>
                      <option value="Micro">Micro</option>
                      <option value="Small">Small</option>
                      <option value="Medium">Medium</option>
                    </select>
                    {validationErrors.industry && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.industry}</p>
                    )}
                  </div>
                )}

                {shouldShowField('activity_type') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Activity Type {renderRequiredIndicator('activity_type')}
                    </label>
                    <select
                      name="activity_type"
                      value={formData.activity_type}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.activity_type ? 'border-red-500' : 'border-border'
                      }`}
                    >
                      <option value="">Select Activity Type</option>
                      <option value="Manufacturer">Manufacturer</option>
                      <option value="Service Provider">Service Provider</option>
                      <option value="Trader">Trader</option>
                    </select>
                    {validationErrors.activity_type && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.activity_type}</p>
                    )}
                  </div>
                )}

                {shouldShowField('constitution') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Industry Constitution {renderRequiredIndicator('constitution')}
                    </label>
                    <select
                      name="constitution"
                      value={formData.constitution}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.constitution ? 'border-red-500' : 'border-border'
                      }`}
                    >
                      <option value="">Select Industry Constitution</option>
                      <option value="Proprietorship">Proprietorship</option>
                      <option value="Partnership">Partnership</option>
                      <option value="Limited Liability Partnership">Limited Liability Partnership</option>
                      <option value="One Person Company">One Person Company</option>
                      <option value="Private Limited Company">Private Limited Company</option>
                      <option value="Limited Company">Limited Company</option>
                    </select>
                    {validationErrors.constitution && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.constitution}</p>
                    )}
                  </div>
                )}

                {shouldShowField('annual_turnover') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Annual Turnover {renderRequiredIndicator('annual_turnover')}
                    </label>
                    <select
                      name="annual_turnover"
                      value={formData.annual_turnover}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.annual_turnover ? 'border-red-500' : 'border-border'
                      }`}
                    >
                      <option value="">Select Annual Turnover</option>
                      <option value="Less than 50 Lakhs">Less than 50 Lakhs</option>
                      <option value="50 Lakhs - 1 Crore">50 Lakhs - 1 Crore</option>
                      <option value="1 Crore - 5 Crores">1 Crore - 5 Crores</option>
                      <option value="5 Crores - 10 Crores">5 Crores - 10 Crores</option>
                      <option value="10 Crores - 25 Crores">10 Crores - 25 Crores</option>
                      <option value="Above 25 Crores">Above 25 Crores</option>
                    </select>
                    {validationErrors.annual_turnover && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.annual_turnover}</p>
                    )}
                  </div>
                )}

                {shouldShowField('number_of_employees') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Number of Employees {renderRequiredIndicator('number_of_employees')}
                    </label>
                    <select
                      name="number_of_employees"
                      value={formData.number_of_employees}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.number_of_employees ? 'border-red-500' : 'border-border'
                      }`}
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
                    {validationErrors.number_of_employees && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.number_of_employees}</p>
                    )}
                  </div>
                )}

                {shouldShowField('brand_names') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Brand Names {renderRequiredIndicator('brand_names')}
                    </label>
                    <input
                      type="text"
                      name="brand_names"
                      value={formData.brand_names}
                      onChange={handleChange}
                      placeholder="Your brand names (if any)"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.brand_names ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {validationErrors.brand_names && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.brand_names}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-section font-medium text-foreground mb-4">Registration Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {shouldShowField('gst_registered') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      GST Registered {renderRequiredIndicator('gst_registered')}
                    </label>
                    <select
                      name="gst_registered"
                      value={formData.gst_registered}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.gst_registered ? 'border-red-500' : 'border-border'
                      }`}
                    >
                      <option value="">Select</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                    {validationErrors.gst_registered && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.gst_registered}</p>
                    )}
                  </div>
                )}

                {formData.gst_registered === 'yes' && shouldShowField('gst_number') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      GST Number {renderRequiredIndicator('gst_number')}
                    </label>
                    <input
                      type="text"
                      name="gst_number"
                      value={formData.gst_number}
                      onChange={handleGstChange}
                      onBlur={() => validateSingleField('gst_number')}
                      placeholder="22AAAAA0000A1Z5"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.gst_number ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {validationErrors.gst_number && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.gst_number}</p>
                    )}
                  </div>
                )}

                {shouldShowField('pan_company') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      PAN (Company) {renderRequiredIndicator('pan_company')}
                    </label>
                    <input
                      type="text"
                      name="pan_company"
                      value={formData.pan_company}
                      onChange={handlePanChange}
                      onBlur={() => validateSingleField('pan_company')}
                      placeholder="10 alphanumeric characters"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.pan_company ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {validationErrors.pan_company && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.pan_company}</p>
                    )}
                  </div>
                )}

                {shouldShowField('esic_registered') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      ESIC Registered {renderRequiredIndicator('esic_registered')}
                    </label>
                    <select
                      name="esic_registered"
                      value={formData.esic_registered}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.esic_registered ? 'border-red-500' : 'border-border'
                      }`}
                    >
                      <option value="">Select</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                    {validationErrors.esic_registered && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.esic_registered}</p>
                    )}
                  </div>
                )}

                {shouldShowField('epf_registered') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      EPF Registered {renderRequiredIndicator('epf_registered')}
                    </label>
                    <select
                      name="epf_registered"
                      value={formData.epf_registered}
                      onChange={handleChange}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.epf_registered ? 'border-red-500' : 'border-border'
                      }`}
                    >
                      <option value="">Select</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                    {validationErrors.epf_registered && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.epf_registered}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-section font-medium text-foreground mb-4">Additional Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {shouldShowField('alternate_contact_name') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Alternate Contact Name {renderRequiredIndicator('alternate_contact_name')}
                    </label>
                    <input
                      type="text"
                      name="alternate_contact_name"
                      value={formData.alternate_contact_name}
                      onChange={handleChange}
                      placeholder="Alternate contact person name"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.alternate_contact_name ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {validationErrors.alternate_contact_name && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.alternate_contact_name}</p>
                    )}
                  </div>
                )}

                {shouldShowField('alternate_mobile') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Alternate Mobile {renderRequiredIndicator('alternate_mobile')}
                    </label>
                    <input
                      type="text"
                      name="alternate_mobile"
                      value={formData.alternate_mobile}
                      onChange={handleAlternateMobileChange}
                      onBlur={() => validateSingleField('alternate_mobile')}
                      placeholder="10-digit mobile number"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.alternate_mobile ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {validationErrors.alternate_mobile && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.alternate_mobile}</p>
                    )}
                  </div>
                )}

                {shouldShowField('referred_by') && (
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">
                      Referred By {renderRequiredIndicator('referred_by')}
                    </label>
                    <input
                      type="text"
                      name="referred_by"
                      value={formData.referred_by}
                      onChange={handleChange}
                      placeholder="Name of the person who referred you"
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                        validationErrors.referred_by ? 'border-red-500' : 'border-border'
                      }`}
                    />
                    {validationErrors.referred_by && (
                      <p className="text-red-600 text-xs mt-1">{validationErrors.referred_by}</p>
                    )}
                  </div>
                )}
              </div>
            </div>


            {isSuperAdmin && (
              <div>
                <h3 className="text-section font-medium text-foreground mb-4">Payment Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {shouldShowField('amount_paid') && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Amount Paid {renderRequiredIndicator('amount_paid')}
                      </label>
                      <input
                        type="text"
                        name="amount_paid"
                        value={formData.amount_paid}
                        onChange={handleChange}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                          validationErrors.amount_paid ? 'border-red-500' : 'border-border'
                        }`}
                      />
                      {validationErrors.amount_paid && (
                        <p className="text-red-600 text-xs mt-1">{validationErrors.amount_paid}</p>
                      )}
                    </div>
                  )}

                  {shouldShowField('payment_date') && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Payment Date {renderRequiredIndicator('payment_date')}
                      </label>
                      <input
                        type="date"
                        name="payment_date"
                        value={formData.payment_date}
                        onChange={handleChange}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                          validationErrors.payment_date ? 'border-red-500' : 'border-border'
                        }`}
                      />
                      {validationErrors.payment_date && (
                        <p className="text-red-600 text-xs mt-1">{validationErrors.payment_date}</p>
                      )}
                    </div>
                  )}

                  {shouldShowField('payment_mode') && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Payment Mode {renderRequiredIndicator('payment_mode')}
                      </label>
                      {console.log('[EditMemberModal] Dropdown rendering with value:', formData.payment_mode)}
                      <select
                        name="payment_mode"
                        value={formData.payment_mode}
                        onChange={handleChange}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                          validationErrors.payment_mode ? 'border-red-500' : 'border-border'
                        }`}
                      >
                        <option value="">Select Payment Mode</option>
                        <option value="QR Code / UPI">QR Code / UPI</option>
                        <option value="Bank Transfer (NEFT/RTGS/IMPS)">Bank Transfer (NEFT/RTGS/IMPS)</option>
                        <option value="Cheque">Cheque</option>
                        <option value="Demand Draft">Demand Draft</option>
                        <option value="Cash">Cash</option>
                      </select>
                      {validationErrors.payment_mode && (
                        <p className="text-red-600 text-xs mt-1">{validationErrors.payment_mode}</p>
                      )}
                    </div>
                  )}

                  {shouldShowField('transaction_id') && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Transaction ID {renderRequiredIndicator('transaction_id')}
                      </label>
                      <input
                        type="text"
                        name="transaction_id"
                        value={formData.transaction_id}
                        onChange={handleChange}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                          validationErrors.transaction_id ? 'border-red-500' : 'border-border'
                        }`}
                      />
                      {validationErrors.transaction_id && (
                        <p className="text-red-600 text-xs mt-1">{validationErrors.transaction_id}</p>
                      )}
                    </div>
                  )}

                  {shouldShowField('bank_reference') && (
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Bank Reference {renderRequiredIndicator('bank_reference')}
                      </label>
                      <input
                        type="text"
                        name="bank_reference"
                        value={formData.bank_reference}
                        onChange={handleChange}
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring ${
                          validationErrors.bank_reference ? 'border-red-500' : 'border-border'
                        }`}
                      />
                      {validationErrors.bank_reference && (
                        <p className="text-red-600 text-xs mt-1">{validationErrors.bank_reference}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end mt-6 pt-6 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || isLoadingFieldConfig}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
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
    </div>
  );
};

export default EditMemberModal;
