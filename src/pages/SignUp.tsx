import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Phone, AlertCircle, Loader2, MapPin } from 'lucide-react';
import { memberAuthService } from '../lib/memberAuth';
import { PublicPaymentState, statesService } from '../lib/supabase';
import {
  AUTH_VALIDATION_MESSAGES,
  normalizeEmail,
  normalizeMobileNumber,
  validateEmailInput,
  validateMobileNumberInput
} from '../lib/credentialValidation';
import { sessionManager } from '../lib/sessionManager';
import Toast from '../components/Toast';

const SignUp: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    mobile_number: '',
    state: ''
  });
  const [availableStates, setAvailableStates] = useState<PublicPaymentState[]>([]);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingStates, setIsLoadingStates] = useState(true);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({
    type: 'success',
    message: '',
    isVisible: false
  });

  useEffect(() => {
    const checkIfAlreadyAuthenticated = async () => {
      const isAuth = await memberAuthService.isMemberAuthenticated();
      if (isAuth) {
        navigate('/dashboard');
      }
    };

    void checkIfAlreadyAuthenticated();
  }, [navigate]);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, isVisible: false }));
  }, []);

  useEffect(() => {
    const loadStates = async () => {
      try {
        setIsLoadingStates(true);
        const states = await statesService.getPublicPaymentStates();
        setAvailableStates(states);
      } catch (error) {
        console.error('Failed to load states for signup:', error);
        showToast('error', 'Failed to load states. Please refresh and try again.');
      } finally {
        setIsLoadingStates(false);
      }
    };

    void loadStates();
  }, [showToast]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let processedValue = value;

    if (name === 'email') {
      processedValue = normalizeEmail(value);
    } else if (name === 'mobile_number') {
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

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    const emailError = validateEmailInput(formData.email, {
      requiredMessage: AUTH_VALIDATION_MESSAGES.emailRequired
    });
    if (emailError) {
      newErrors.email = emailError;
    }

    const mobileError = validateMobileNumberInput(formData.mobile_number, {
      invalidMessage: AUTH_VALIDATION_MESSAGES.mobileInvalid
    });
    if (mobileError) {
      newErrors.mobile_number = mobileError;
    }

    if (!formData.state.trim()) {
      newErrors.state = 'Please select a state.';
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

      const result = await memberAuthService.signUpMember(
        normalizeEmail(formData.email),
        normalizeMobileNumber(formData.mobile_number),
        formData.state
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
      }, 1500);
    } catch (error) {
      console.error('Signup error:', error);
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
          <h2 className="text-xl font-semibold text-foreground">Create Your Account</h2>
          <p className="mt-2 text-muted-foreground">Sign up with your email address, mobile number, and state</p>
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

            <div>
              <label htmlFor="state" className="block text-label font-medium text-muted-foreground uppercase tracking-wider mb-2">
                State <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <MapPin className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <select
                  id="state"
                  name="state"
                  required
                  value={formData.state}
                  onChange={handleInputChange}
                  disabled={isLoadingStates}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-ring focus:border-ring ${
                    errors.state ? 'border-destructive' : 'border-border'
                  } ${isLoadingStates ? 'bg-muted/50 cursor-not-allowed' : ''}`}
                >
                  <option value="">{isLoadingStates ? 'Loading states...' : 'Select State'}</option>
                  {availableStates.map(state => (
                    <option key={state.state} value={state.state}>
                      {state.state}
                    </option>
                  ))}
                </select>
              </div>
              {errors.state && (
                <p className="mt-1 text-sm text-destructive flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {errors.state}
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
                  Creating Account...
                </span>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

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

export default SignUp;
