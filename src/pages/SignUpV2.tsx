import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Lock, Loader2, Mail, MapPin, Phone } from 'lucide-react';
import { memberAuthService } from '../lib/memberAuth';
import {
  CityOption,
  companyDesignationsService,
  CompanyDesignation,
  DistrictOption,
  ValidationRule,
  validationRulesService,
  SignupFormFieldV2,
  SignupDraftConfigurationErrorCode,
  signupFormConfigV2Service,
  PublicPaymentState,
  statesService
} from '../lib/supabase';
import { canSelectFieldBeRequired, resolveSelectOptions } from '../lib/formFieldOptionResolver';
import {
  AUTH_VALIDATION_MESSAGES,
  normalizeEmail,
  normalizeMobileNumber,
  validateEmailInput,
  validateMobileNumberInput
} from '../lib/credentialValidation';
import { sessionManager } from '../lib/sessionManager';
import Toast from '../components/Toast';

type FormValue = string | boolean;

type FormDataMap = Record<string, FormValue>;

const CORE_SIGNUP_FIELDS = new Set(['email', 'mobile_number', 'state']);

const SignUpV2: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreviewMode = searchParams.get('preview') === '1';

  // preview-mode access gate — set when draft fetch fails due to auth
  const [previewBlockReason, setPreviewBlockReason] = useState<SignupDraftConfigurationErrorCode | null>(null);
  // set when the published form has no fields (unpublished state)
  const [formUnavailable, setFormUnavailable] = useState(false);

  const [fields, setFields] = useState<SignupFormFieldV2[]>([]);
  const [availableStates, setAvailableStates] = useState<PublicPaymentState[]>([]);
  const [availableDistricts, setAvailableDistricts] = useState<DistrictOption[]>([]);
  const [availableCities, setAvailableCities] = useState<CityOption[]>([]);
  const [availableDesignations, setAvailableDesignations] = useState<CompanyDesignation[]>([]);
  const [activeValidationRules, setActiveValidationRules] = useState<ValidationRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormDataMap>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
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

  const visibleFields = useMemo(
    () => fields.filter(field => field.is_visible).sort((a, b) => a.display_order - b.display_order),
    [fields]
  );

  const isFieldEffectivelyRequired = useCallback(
    (field: SignupFormFieldV2) => field.is_required && canSelectFieldBeRequired(field),
    []
  );

  const validationRuleById = useMemo(() => {
    const map = new Map<string, ValidationRule>();
    activeValidationRules.forEach(rule => {
      map.set(rule.id, rule);
    });
    return map;
  }, [activeValidationRules]);

  const loadActiveValidationRules = useCallback(async (): Promise<ValidationRule[]> => {
    try {
      return await validationRulesService.getActiveValidationRules();
    } catch (error) {
      console.error('Failed to load active validation rules for signup runtime:', error);
      return [];
    }
  }, []);

  // ── auth redirect (non-preview only) ────────────────────────────────────
  useEffect(() => {
    if (isPreviewMode) return; // preview gate is handled in the load effect below
    const checkIfAlreadyAuthenticated = async () => {
      const isAuth = await memberAuthService.isMemberAuthenticated();
      if (isAuth) navigate('/dashboard');
    };
    void checkIfAlreadyAuthenticated();
  }, [navigate, isPreviewMode]);

  // ── form data load ───────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setPreviewBlockReason(null);
        setFormUnavailable(false);

        if (isPreviewMode) {
          // Hard gate: never fall back to live config in preview mode
          const draftResult = await signupFormConfigV2Service.getDraftConfiguration();

          if (!draftResult.success || !draftResult.data) {
            const code = draftResult.errorCode ?? 'load_failed';
            if (code === 'no_session') {
              // Redirect to sign-in; ?next= param enables post-login return
              navigate(`/signin?next=${encodeURIComponent('/signup?preview=1')}`);
              return;
            }
            // access_denied or load_failed → show blocking message, no form
            setPreviewBlockReason(code);
            return;
          }

          const [states, designations, rules] = await Promise.all([
            statesService.getPublicPaymentStates(),
            companyDesignationsService.getActiveDesignations(),
            loadActiveValidationRules()
          ]);

          setFields(draftResult.data);
          setAvailableStates(states);
          setAvailableDesignations(designations);
          setActiveValidationRules(rules);
          setAvailableDistricts([]);
          setAvailableCities([]);

          const initialState: FormDataMap = {};
          draftResult.data
            .filter(field => field.is_visible)
            .forEach(field => {
              initialState[field.field_key] = field.field_type === 'checkbox'
                ? field.default_value === 'true'
                : (field.default_value ?? '');
            });
          setFormData(initialState);
          return;
        }

        // ── normal public load ─────────────────────────────────────────────
        const configResult = await signupFormConfigV2Service.getConfiguration();

        if (!configResult.success || !configResult.data) {
          showToast('error', configResult.error || 'Failed to load signup configuration');
          setFields([]);
          return;
        }

        // Empty field list means the form is unpublished / taken offline
        if (configResult.data.length === 0) {
          setFormUnavailable(true);
          return;
        }

        const [states, designations, rules] = await Promise.all([
          statesService.getPublicPaymentStates(),
          companyDesignationsService.getActiveDesignations(),
          loadActiveValidationRules()
        ]);

        setFields(configResult.data);
        setAvailableStates(states);
        setAvailableDesignations(designations);
        setActiveValidationRules(rules);
        setAvailableDistricts([]);
        setAvailableCities([]);

        const initialState: FormDataMap = {};
        configResult.data
          .filter(field => field.is_visible)
          .forEach(field => {
            initialState[field.field_key] = field.field_type === 'checkbox'
              ? field.default_value === 'true'
              : (field.default_value ?? '');
          });
        setFormData(initialState);
      } catch (error) {
        console.error('Failed to initialize signup v2:', error);
        showToast('error', 'Failed to load signup form. Please refresh and try again.');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [isPreviewMode, loadActiveValidationRules, navigate, showToast]);

  const hasVisibleField = useCallback(
    (fieldKey: string) => visibleFields.some(field => field.field_key === fieldKey),
    [visibleFields]
  );

  useEffect(() => {
    const selectedState = typeof formData.state === 'string' ? formData.state.trim() : '';
    if (!selectedState || !hasVisibleField('district')) {
      setAvailableDistricts([]);
      if (!hasVisibleField('city')) {
        setAvailableCities([]);
      }
      return;
    }

    let isCancelled = false;
    const loadDistricts = async () => {
      const districts = await statesService.getActiveDistrictsByStateName(selectedState);
      if (isCancelled) return;

      setAvailableDistricts(districts);

      const selectedDistrict = typeof formData.district === 'string' ? formData.district.trim() : '';
      if (selectedDistrict && !districts.some(item => item.district_name === selectedDistrict || item.district_id === selectedDistrict)) {
        setFormData(prev => ({ ...prev, district: '', city: '' }));
        setAvailableCities([]);
      }
    };

    void loadDistricts();
    return () => { isCancelled = true; };
  }, [formData.state, formData.district, hasVisibleField]);

  useEffect(() => {
    const selectedDistrict = typeof formData.district === 'string' ? formData.district.trim() : '';
    if (!selectedDistrict || !hasVisibleField('city')) {
      setAvailableCities([]);
      return;
    }

    const districtMatch = availableDistricts.find(
      district => district.district_name === selectedDistrict || district.district_id === selectedDistrict
    );
    if (!districtMatch) {
      setAvailableCities([]);
      return;
    }

    let isCancelled = false;
    const loadCities = async () => {
      const cities = await statesService.getActiveCitiesByDistrictId(districtMatch.district_id);
      if (isCancelled) return;

      setAvailableCities(cities);
      const selectedCity = typeof formData.city === 'string' ? formData.city.trim() : '';
      if (selectedCity && !cities.some(item => item.city_name === selectedCity || item.city_id === selectedCity)) {
        setFormData(prev => ({ ...prev, city: '' }));
      }
    };

    void loadCities();
    return () => { isCancelled = true; };
  }, [availableDistricts, formData.city, formData.district, hasVisibleField]);

  const selectOptionsByFieldKey = useMemo(() => {
    const map: Record<string, { value: string; label: string }[]> = {};
    visibleFields.forEach(field => {
      if (field.field_type !== 'select') return;
      map[field.field_key] = resolveSelectOptions(field, {
        states: availableStates,
        districts: availableDistricts,
        cities: availableCities,
        designations: availableDesignations
      });
    });
    return map;
  }, [availableCities, availableDesignations, availableDistricts, availableStates, visibleFields]);

  const handleValueChange = (field: SignupFormFieldV2, rawValue: FormValue) => {
    let nextValue: FormValue = rawValue;

    if (typeof rawValue === 'string') {
      if (field.field_key === 'email') {
        nextValue = normalizeEmail(rawValue);
      } else if (field.field_key === 'mobile_number') {
        nextValue = normalizeMobileNumber(rawValue).slice(0, 10);
      }
    }

    setFormData(prev => {
      const nextState: FormDataMap = { ...prev, [field.field_key]: nextValue };
      if (field.field_key === 'state') {
        nextState.district = '';
        nextState.city = '';
      } else if (field.field_key === 'district') {
        nextState.city = '';
      }
      return nextState;
    });

    if (errors[field.field_key]) {
      setErrors(prev => {
        const cloned = { ...prev };
        delete cloned[field.field_key];
        return cloned;
      });
    }
  };

  const validateForm = (): boolean => {
    const nextErrors: Record<string, string> = {};

    visibleFields.forEach(field => {
      const value = formData[field.field_key];
      const stringValue = typeof value === 'string' ? value.trim() : value;

      if (isFieldEffectivelyRequired(field)) {
        if (field.field_type === 'checkbox') {
          if (typeof value !== 'boolean') {
            nextErrors[field.field_key] = `${field.label} is required.`;
          }
        } else if (!stringValue) {
          nextErrors[field.field_key] = `${field.label} is required.`;
        }
      }
    });

    visibleFields.forEach(field => {
      if (!field.validation_rule_id) return;
      if (field.field_type === 'checkbox') return;

      const value = formData[field.field_key];
      const textValue = typeof value === 'string' ? value.trim() : '';
      if (!textValue) return;

      const mappedRule = validationRuleById.get(field.validation_rule_id);
      if (!mappedRule) {
        // Rule is inactive/removed in Validation Settings; skip validation gracefully.
        return;
      }

      try {
        const regex = new RegExp(mappedRule.validation_pattern);
        if (!regex.test(textValue)) {
          nextErrors[field.field_key] = mappedRule.error_message || `${field.label} is invalid.`;
        }
      } catch (error) {
        console.error('Invalid validation regex pattern for field:', field.field_key, error);
      }
    });

    const emailValue = String(formData.email ?? '');
    const emailError = validateEmailInput(emailValue, { requiredMessage: AUTH_VALIDATION_MESSAGES.emailRequired });
    if (emailError && !nextErrors.email) {
      nextErrors.email = emailError;
    }

    const mobileValue = String(formData.mobile_number ?? '');
    const mobileError = validateMobileNumberInput(mobileValue, {
      invalidMessage: AUTH_VALIDATION_MESSAGES.mobileInvalid
    });
    if (mobileError && !nextErrors.mobile_number) {
      nextErrors.mobile_number = mobileError;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      showToast('error', 'Please fix the errors in the form');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;
    if (isPreviewMode) return;
    if (!validateForm()) return;

    try {
      setIsSubmitting(true);

      const email = String(formData.email ?? '');
      const mobile = String(formData.mobile_number ?? '');
      const stateValue = formData.state;
      const state = typeof stateValue === 'string' ? stateValue : '';

      const dynamicPayload: Record<string, unknown> = {};
      visibleFields.forEach(field => {
        if (CORE_SIGNUP_FIELDS.has(field.field_key)) return;

        const value = formData[field.field_key];
        if (field.field_type === 'checkbox') {
          dynamicPayload[field.field_key] = Boolean(value);
          return;
        }

        const trimmed = String(value ?? '').trim();
        if (trimmed !== '') {
          dynamicPayload[field.field_key] = trimmed;
        }
      });

      const result = await memberAuthService.signUpMemberV2(
        normalizeEmail(email),
        normalizeMobileNumber(mobile),
        state.trim() ? state : null,
        dynamicPayload
      );

      if (!result.success) {
        showToast('error', result.error || 'Signup failed. Please try again.');
        return;
      }

      if (!result.user || !result.sessionToken || !result.expiresAt) {
        showToast('error', 'Account created but session setup failed. Please sign in.');
        return;
      }

      sessionManager.saveSession(result.sessionToken, result.expiresAt, result.user);
      showToast('success', 'Account created successfully! Redirecting to dashboard...');

      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1200);
    } catch (error) {
      console.error('Signup V2 error:', error);
      showToast('error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getLeadingIcon = (field: SignupFormFieldV2) => {
    if (field.field_key === 'email') {
      return <Mail className="w-5 h-5 text-muted-foreground" />;
    }
    if (field.field_key === 'mobile_number') {
      return <Phone className="w-5 h-5 text-muted-foreground" />;
    }
    if (field.field_key === 'state') {
      return <MapPin className="w-5 h-5 text-muted-foreground" />;
    }
    return null;
  };

  const renderFieldInput = (field: SignupFormFieldV2) => {
    const value = formData[field.field_key];
    const error = errors[field.field_key];
    const leadingIcon = getLeadingIcon(field);
    const inputBaseClass = `w-full py-3 border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-ring focus:border-ring ${
      error ? 'border-destructive' : 'border-border'
    }`;

    if (field.field_type === 'textarea') {
      return (
        <textarea
          id={field.field_key}
          name={field.field_key}
          value={typeof value === 'string' ? value : ''}
          onChange={e => handleValueChange(field, e.target.value)}
          placeholder={field.placeholder ?? ''}
          className={`${inputBaseClass} px-4`}
          rows={3}
        />
      );
    }

    if (field.field_type === 'select') {
      const options = selectOptionsByFieldKey[field.field_key] || [];
      return (
        <div className="relative">
          {leadingIcon && <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">{leadingIcon}</div>}
          <select
            id={field.field_key}
            name={field.field_key}
            value={typeof value === 'string' ? value : ''}
            onChange={e => handleValueChange(field, e.target.value)}
            className={`${inputBaseClass} ${leadingIcon ? 'pl-10 pr-4' : 'px-4'}`}
          >
            <option value="">Select {field.label}</option>
            {options.map(option => (
              <option key={`${field.field_key}-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    if (field.field_type === 'checkbox') {
      return (
        <label className="inline-flex items-center gap-2">
          <input
            id={field.field_key}
            name={field.field_key}
            type="checkbox"
            checked={Boolean(value)}
            onChange={e => handleValueChange(field, e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
          />
          <span className="text-sm text-foreground">Yes</span>
        </label>
      );
    }

    const inputType: React.HTMLInputTypeAttribute =
      field.field_type === 'tel' || field.field_type === 'email' || field.field_type === 'url' || field.field_type === 'date' || field.field_type === 'number'
        ? field.field_type
        : 'text';

    return (
      <div className="relative">
        {leadingIcon && <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">{leadingIcon}</div>}
        <input
          id={field.field_key}
          name={field.field_key}
          type={inputType}
          value={typeof value === 'string' ? value : ''}
          onChange={e => handleValueChange(field, e.target.value)}
          placeholder={field.placeholder ?? ''}
          className={`${inputBaseClass} ${leadingIcon ? 'pl-10 pr-4' : 'px-4'}`}
        />
      </div>
    );
  };

  // ── preview access-denied static screens ──────────────────────────────────
  if (previewBlockReason) {
    const msg = previewBlockReason === 'access_denied'
      ? "You don't have permission to preview form drafts."
      : "Draft preview could not be loaded. Please try again or contact your administrator.";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <Lock className="w-10 h-10 text-muted-foreground/50 mx-auto" />
          <p className="text-sm font-medium text-foreground">{msg}</p>
          <Link to="/" className="text-sm text-primary hover:text-primary/80">Back to Home</Link>
        </div>
      </div>
    );
  }

  // ── form unavailable (unpublished) static screen ───────────────────────────
  if (!isPreviewMode && formUnavailable) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-muted-foreground/50 mx-auto" />
          <p className="text-sm font-medium text-foreground">This form is currently unavailable.</p>
          <p className="text-sm text-muted-foreground">Please check back later.</p>
          <Link to="/" className="text-sm text-primary hover:text-primary/80">Back to Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground">Create Your Account</h2>
          <p className="mt-2 text-muted-foreground">Sign up with your email address, mobile number, and state</p>
        </div>

        <div className="bg-card rounded-lg shadow-sm border border-border p-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">Loading signup form...</span>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              {visibleFields.map(field => (
                <div key={field.field_key}>
                  <label htmlFor={field.field_key} className="block text-label font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    {field.label} {isFieldEffectivelyRequired(field) && <span className="text-destructive">*</span>}
                  </label>
                  {renderFieldInput(field)}
                  {errors[field.field_key] && (
                    <p className="mt-1 text-sm text-destructive flex items-center">
                      <AlertCircle className="w-4 h-4 mr-1" />
                      {errors[field.field_key]}
                    </p>
                  )}
                </div>
              ))}

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                  isSubmitting
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center">
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Creating Account...
                  </span>
                ) : (
                  'Create Account'
                )}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/signin" className="text-primary hover:text-primary/80 font-medium">
                Sign In
              </Link>
            </p>
          </div>
        </div>

        <div className="text-center">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SignUpV2;
