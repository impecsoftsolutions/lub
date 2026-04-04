import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, AlertCircle, Loader2, LogIn } from 'lucide-react';
import { customAuth } from '../lib/customAuth';
import {
  AUTH_VALIDATION_MESSAGES,
  normalizeEmail,
  normalizeMobileNumber,
  validateEmailInput,
  validateMobileNumberInput
} from '../lib/credentialValidation';
import { sessionManager } from '../lib/sessionManager';
import { AuthErrorCode } from '../types/auth.types';
import Toast from '../components/Toast';
import { useOrganisationProfile } from '../hooks/useOrganisationProfile';

const SignIn: React.FC = () => {
  const { profile } = useOrganisationProfile();
  const [formData, setFormData] = useState({
    email: '',
    mobile_number: ''
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({
    type: 'success',
    message: '',
    isVisible: false
  });

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let processedValue = value;

    if (name === 'email') {
      processedValue = normalizeEmail(value);
    }

    if (name === 'mobile_number') {
      processedValue = normalizeMobileNumber(value).slice(0, 10);
    }

    setFormData(prev => ({ ...prev, [name]: processedValue }));

    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
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

      default:
        return error || 'An unexpected error occurred. Please try again.';
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    const emailError = validateEmailInput(formData.email);
    if (emailError) {
      newErrors.email = emailError;
    }

    const mobileError = validateMobileNumberInput(formData.mobile_number, {
      invalidMessage: AUTH_VALIDATION_MESSAGES.mobileInvalid
    });
    if (mobileError) {
      newErrors.mobile_number = mobileError;
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showToast('error', 'Please fix the errors in the form');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;

    if (!validateForm()) return;

    try {
      setIsSubmitting(true);

      const userAgent = navigator.userAgent;
      const result = await customAuth.signIn(
        normalizeEmail(formData.email),
        normalizeMobileNumber(formData.mobile_number),
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

      console.log('[SignIn] Login successful, user data saved to localStorage');
      showToast('success', 'Login successful! Redirecting...');

      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1000);
    } catch (error) {
      console.error('Login error:', error);
      showToast('error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-primary-foreground" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">Portal Sign In</h2>
          <p className="mt-2 text-muted-foreground">Sign in with your email address and mobile number</p>
        </div>

        <div className="bg-card rounded-lg shadow-sm border border-border p-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="block text-label font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Email Address <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-ring focus:border-ring ${
                    errors.email ? 'border-destructive' : 'border-border'
                  }`}
                  placeholder="your.email@example.com"
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-sm text-destructive flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {errors.email}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="mobile_number" className="block text-label font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Mobile Number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Phone className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <input
                  id="mobile_number"
                  name="mobile_number"
                  type="tel"
                  required
                  value={formData.mobile_number}
                  onChange={handleInputChange}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-ring focus:border-ring ${
                    errors.mobile_number ? 'border-destructive' : 'border-border'
                  }`}
                  placeholder="10-digit mobile number"
                />
              </div>
              {errors.mobile_number && (
                <p className="mt-1 text-sm text-destructive flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {errors.mobile_number}
                </p>
              )}
            </div>

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

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Don't have an account?{' '}
              <Link to="/signup" className="text-primary hover:text-primary/80 font-medium">
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
