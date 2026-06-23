import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2, Lock, Mail } from 'lucide-react';
import { customAuth } from '../lib/customAuth';
import {
  isEmail,
  isMobileNumber,
  normalizeEmail,
  normalizeMobileNumber,
} from '../lib/credentialValidation';
import { sessionManager } from '../lib/sessionManager';
import { AuthErrorCode } from '../types/auth.types';
import Toast from '../components/Toast';
import { useOrganisationProfile } from '../hooks/useOrganisationProfile';
import { useMember } from '../contexts/useMember';
import {
  FormDraftConfigurationErrorCode,
  signinFormConfigV2Service,
  SigninFormFieldV2
} from '../lib/supabase';

type FormValue = string | boolean;
type FormDataMap = Record<string, FormValue>;
const LAST_NON_SIGNIN_ROUTE_KEY = 'lub:last_non_signin_route';

const DEFAULT_SIGNIN_FIELDS: SigninFormFieldV2[] = [
  {
    id: 'fallback-signin-identifier',
    form_key: 'signin',
    field_key: 'identifier',
    label: 'Email or Mobile Number',
    field_type: 'text',
    section_name: 'Core Details',
    placeholder: 'Email address or 10-digit mobile number',
    help_text: null,
    option_items: null,
    default_value: '',
    is_visible: true,
    is_required: true,
    is_locked: true,
    is_system_field: true,
    display_order: 1,
    min_length: null,
    max_length: null,
    validation_rule_id: null
  },
  {
    id: 'fallback-signin-password',
    form_key: 'signin',
    field_key: 'password',
    label: 'Password',
    field_type: 'password',
    section_name: 'Core Details',
    placeholder: 'Enter your password',
    help_text: 'Minimum 6 characters',
    option_items: null,
    default_value: '',
    is_visible: true,
    is_required: true,
    is_locked: true,
    is_system_field: true,
    display_order: 2,
    min_length: 6,
    max_length: null,
    validation_rule_id: null
  }
];

const ensureSigninAuthFields = (loadedFields: SigninFormFieldV2[]): SigninFormFieldV2[] => {
  const visibleKeys = new Set(
    loadedFields
      .filter(field => field.is_visible)
      .map(field => field.field_key)
  );

  return visibleKeys.has('identifier') && visibleKeys.has('password')
    ? loadedFields
    : DEFAULT_SIGNIN_FIELDS;
};

const SignIn: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreviewMode = searchParams.get('preview') === '1';

  const { profile } = useOrganisationProfile();
  const { isAuthenticated: isMemberAuthenticated, isLoading: isMemberLoading } = useMember();

  const [fields, setFields] = useState<SigninFormFieldV2[]>([]);
  const [formData, setFormData] = useState<FormDataMap>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewBlockReason, setPreviewBlockReason] = useState<FormDraftConfigurationErrorCode | null>(null);
  const [formUnavailable, setFormUnavailable] = useState(false);
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

  const hasCoreVisibleFields = useMemo(
    () => ['identifier', 'password'].every(fieldKey => visibleFields.some(field => field.field_key === fieldKey)),
    [visibleFields]
  );

  const selectOptionsByFieldKey = useMemo(() => {
    const map: Record<string, { value: string; label: string }[]> = {};
    visibleFields.forEach(field => {
      if (field.field_type !== 'select') return;
      const optionItems = Array.isArray(field.option_items) ? field.option_items : [];
      map[field.field_key] = optionItems
        .map(item => String(item).trim())
        .filter(item => item.length > 0)
        .map(item => ({ value: item, label: item }));
    });
    return map;
  }, [visibleFields]);

  const authenticatedRedirectTarget = useMemo(() => {
    if (isPreviewMode || isMemberLoading || !isMemberAuthenticated) {
      return null;
    }

    const nextParam = searchParams.get('next');
    const safeNext = nextParam && nextParam.startsWith('/') ? nextParam : null;
    if (safeNext && !safeNext.startsWith('/signin')) {
      return safeNext;
    }

    try {
      const storedRoute = sessionStorage.getItem(LAST_NON_SIGNIN_ROUTE_KEY);
      if (storedRoute && storedRoute.startsWith('/') && !storedRoute.startsWith('/signin')) {
        return storedRoute;
      }
    } catch {
      // Ignore storage errors and continue with fallbacks.
    }

    const referrer = document.referrer ? new URL(document.referrer, window.location.origin) : null;
    if (referrer && referrer.origin === window.location.origin && referrer.pathname !== '/signin') {
      return `${referrer.pathname}${referrer.search}${referrer.hash}`;
    }

    return '/dashboard';
  }, [isPreviewMode, isMemberLoading, isMemberAuthenticated, searchParams]);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        setPreviewBlockReason(null);
        setFormUnavailable(false);

        const configResult = isPreviewMode
          ? await signinFormConfigV2Service.getDraftConfiguration()
          : await signinFormConfigV2Service.getConfiguration();

        if (!configResult.success || !configResult.data) {
          if (isPreviewMode) {
            const code = configResult.errorCode ?? 'load_failed';
            if (code === 'no_session') {
              navigate(`/signin?next=${encodeURIComponent('/signin?preview=1')}`, { replace: true });
              return;
            }
            setPreviewBlockReason(code);
            return;
          }

          showToast('error', configResult.error || 'Failed to load sign-in configuration');
          setFields([]);
          return;
        }

        if (!isPreviewMode && configResult.data.length === 0) {
          setFormUnavailable(true);
          setFields([]);
          return;
        }

        const normalizedFields = ensureSigninAuthFields(configResult.data);
        setFields(normalizedFields);

        const initialState: FormDataMap = {};
        normalizedFields
          .filter(field => field.is_visible)
          .forEach(field => {
            initialState[field.field_key] = field.field_type === 'checkbox'
              ? field.default_value === 'true'
              : (field.default_value ?? '');
          });
        setFormData(initialState);
      } catch (error) {
        console.error('Failed to initialize signin form:', error);
        showToast('error', 'Failed to load sign-in form. Please refresh and try again.');
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [isPreviewMode, navigate, showToast]);

  const handleInputChange = (field: SigninFormFieldV2, rawValue: FormValue) => {
    let processedValue: FormValue = rawValue;

    if (typeof rawValue === 'string') {
      if (field.field_key === 'identifier' && rawValue.includes('@')) {
        processedValue = normalizeEmail(rawValue);
      } else if (field.field_key === 'identifier' && /^[\d\s()+-]+$/.test(rawValue)) {
        processedValue = normalizeMobileNumber(rawValue).slice(0, 10);
      }
    }

    setFormData(prev => ({ ...prev, [field.field_key]: processedValue }));

    if (errors[field.field_key]) {
      setErrors(prev => {
        const cloned = { ...prev };
        delete cloned[field.field_key];
        return cloned;
      });
    }
  };

  const getErrorMessage = (errorCode?: AuthErrorCode, error?: string, lockedUntil?: string): string => {
    switch (errorCode) {
      case AuthErrorCode.ACCOUNT_LOCKED:
        if (lockedUntil) {
          const unlockTime = new Date(lockedUntil);
          const now = new Date();
          const minutesRemaining = Math.ceil((unlockTime.getTime() - now.getTime()) / (1000 * 60));
          return `Account is locked due to too many failed login attempts. Please try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}.`;
        }
        return 'Account is locked. Please contact support.';

      case AuthErrorCode.ACCOUNT_SUSPENDED:
        return `Your account has been suspended. Please contact support${profile?.email_address ? ` at ${profile.email_address}` : ''}.`;

      case AuthErrorCode.ACCOUNT_FROZEN:
        return 'Your account is unavailable. Please contact support.';

      case AuthErrorCode.INVALID_CREDENTIALS:
        return 'Invalid credentials';

      case AuthErrorCode.PASSWORD_PENDING:
        return 'Please set your password using Forgot Password before signing in.';

      default:
        return error || 'An unexpected error occurred. Please try again.';
    }
  };

  const validateForm = (): boolean => {
    const nextErrors: Record<string, string> = {};

    visibleFields.forEach(field => {
      const value = formData[field.field_key];
      const stringValue = typeof value === 'string' ? value.trim() : value;

      if (field.is_required) {
        if (field.field_type === 'checkbox') {
          if (typeof value !== 'boolean') {
            nextErrors[field.field_key] = `${field.label} is required.`;
          }
        } else if (!stringValue) {
          nextErrors[field.field_key] = `${field.label} is required.`;
        }
      }
    });

    const identifierValue = String(formData.identifier ?? '').trim();
    if (identifierValue && !isEmail(identifierValue) && !isMobileNumber(identifierValue)) {
      nextErrors.identifier = 'Enter a valid email address or 10-digit mobile number.';
    }

    const passwordField = visibleFields.find(field => field.field_key === 'password');
    const passwordValue = String(formData.password ?? '');
    const minPasswordLength = passwordField?.min_length ?? 6;
    if (passwordValue && passwordValue.length < minPasswordLength) {
      nextErrors.password = `Password must be at least ${minPasswordLength} characters.`;
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

    if (!hasCoreVisibleFields) {
      showToast('error', 'Sign-in form is misconfigured. Please contact support.');
      return;
    }

    if (!validateForm()) return;

    try {
      setIsSubmitting(true);

      const userAgent = navigator.userAgent;
      const result = await customAuth.signInWithPassword(
        String(formData.identifier ?? '').trim(),
        String(formData.password ?? ''),
        undefined,
        userAgent
      );

      if (!result.success) {
        showToast('error', getErrorMessage(result.errorCode, result.error, result.lockedUntil));
        return;
      }

      if (!result.user || !result.sessionToken) {
        showToast('error', 'Authentication failed. Please try again.');
        return;
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      sessionManager.saveSession(result.sessionToken, expiresAt.toISOString(), result.user);

      showToast('success', 'Login successful! Redirecting...');

      setTimeout(() => {
        const nextParam = new URLSearchParams(window.location.search).get('next');
        const safeNext = nextParam && nextParam.startsWith('/') ? nextParam : null;
        window.location.href = safeNext ?? '/dashboard';
      }, 1000);
    } catch (error) {
      console.error('Login error:', error);
      showToast('error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderFieldInput = (field: SigninFormFieldV2) => {
    const value = formData[field.field_key];
    const error = errors[field.field_key];
    const inputBaseClass = `w-full py-3 border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-ring focus:border-ring ${
      error ? 'border-destructive' : 'border-border'
    }`;

    const leadingIcon = field.field_key === 'identifier'
      ? <Mail className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
      : field.field_key === 'password'
        ? <Lock className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
        : null;

    if (field.field_type === 'textarea') {
      return (
        <textarea
          id={field.field_key}
          name={field.field_key}
          value={typeof value === 'string' ? value : ''}
          onChange={e => handleInputChange(field, e.target.value)}
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
          {leadingIcon}
          <select
            id={field.field_key}
            name={field.field_key}
            value={typeof value === 'string' ? value : ''}
            onChange={e => handleInputChange(field, e.target.value)}
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
            onChange={e => handleInputChange(field, e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
          />
          <span className="text-sm text-foreground">Yes</span>
        </label>
      );
    }

    const inputType: React.HTMLInputTypeAttribute =
      field.field_type === 'password' || field.field_key === 'password'
        ? 'password'
        : field.field_type === 'tel' || field.field_type === 'email' || field.field_type === 'url' || field.field_type === 'date' || field.field_type === 'number'
        ? field.field_type
        : 'text';

    return (
      <div className="relative">
        {leadingIcon}
        <input
          id={field.field_key}
          name={field.field_key}
          type={inputType}
          required={field.is_required}
          value={typeof value === 'string' ? value : ''}
          onChange={e => handleInputChange(field, e.target.value)}
          className={`${inputBaseClass} ${leadingIcon ? 'pl-10 pr-4' : 'px-4'}`}
          placeholder={field.placeholder ?? ''}
        />
      </div>
    );
  };

  if (previewBlockReason) {
    const msg = previewBlockReason === 'access_denied'
      ? "You don't have permission to preview form drafts."
      : 'Draft preview could not be loaded. Please try again or contact your administrator.';

    return (
      <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <Lock className="w-10 h-10 text-muted-foreground/50 mx-auto" />
          <p className="text-sm font-medium text-foreground">{msg}</p>
          <Link to="/" className="text-sm text-primary hover:text-primary/80">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  if (!isPreviewMode && isMemberLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (authenticatedRedirectTarget) {
    return <Navigate to={authenticatedRedirectTarget} replace />;
  }

  if (!isPreviewMode && (formUnavailable || (!isLoading && fields.length > 0 && !hasCoreVisibleFields))) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-muted-foreground/50 mx-auto" />
          <p className="text-sm font-medium text-foreground">This form is currently unavailable.</p>
          <p className="text-sm text-muted-foreground">Please check back later.</p>
          <Link to="/" className="text-sm text-primary hover:text-primary/80">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <div className="max-w-md w-full space-y-6 sm:space-y-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground">Sign In</h2>
          <p className="mt-2 text-muted-foreground">Sign in with your email or mobile number and password</p>
        </div>

        <div className="bg-card rounded-lg shadow-sm border border-border p-6 sm:p-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {visibleFields.map(field => (
              <div key={field.field_key}>
                <label htmlFor={field.field_key} className="block text-label font-medium text-muted-foreground uppercase tracking-wider mb-2">
                  {field.label} {field.is_required && <span className="text-destructive">*</span>}
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
                  Signing In...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link to="/forgot-password" className="inline-flex min-h-11 items-center px-2 -mx-2 text-sm text-primary hover:text-primary/80 font-medium">
              Forgot Password?
            </Link>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link to="/signup" className="inline-flex min-h-11 items-center px-2 -mx-2 text-primary hover:text-primary/80 font-medium">
                Sign Up
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

export default SignIn;
