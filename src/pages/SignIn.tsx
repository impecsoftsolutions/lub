import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, LogIn } from 'lucide-react';
import { customAuth, isEmail, isMobileNumber } from '../lib/customAuth';
import { sessionManager } from '../lib/sessionManager';
import { AuthErrorCode } from '../types/auth.types';
import Toast from '../components/Toast';

const SignIn: React.FC = () => {
  const [formData, setFormData] = useState({
    emailOrMobile: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
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
    setFormData(prev => ({ ...prev, [name]: value }));

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
        return 'Your account has been suspended. Please contact support at support@lub.org.in.';

      case AuthErrorCode.PASSWORD_PENDING:
        return 'Please use "Forgot Password" below to set your password for the first time.';

      case AuthErrorCode.INVALID_CREDENTIALS:
        return error || 'Invalid email/mobile number or password.';

      default:
        return error || 'An unexpected error occurred. Please try again.';
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.emailOrMobile) {
      newErrors.emailOrMobile = 'Email or mobile number is required';
    } else if (!isEmail(formData.emailOrMobile) && !isMobileNumber(formData.emailOrMobile)) {
      newErrors.emailOrMobile = 'Please enter a valid email address or 10-digit mobile number';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
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
        formData.emailOrMobile.toLowerCase().trim(),
        formData.password,
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

      // Save session token AND user data
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      sessionManager.saveSession(result.sessionToken, expiresAt.toISOString(), result.user);

      // Set user context for RLS policies
      console.log('[SignIn] Setting user context for RLS policies...');
      try {
        const contextSet = await customAuth.setUserContext(result.user.id);
        if (!contextSet) {
          console.warn('[SignIn] Failed to set user context, but proceeding with login');
        }
      } catch (contextError) {
        console.warn('[SignIn] Error setting user context:', contextError);
        // Continue with login even if context setting fails
      }

      console.log('[SignIn] Login successful, user data saved to localStorage');

      showToast('success', 'Login successful! Redirecting...');

      // Force full page reload to reinitialize MemberContext with new session
      setTimeout(() => {
        if (result.user!.account_type === 'admin') {
          window.location.href = '/admin';
        } else {
          window.location.href = '/dashboard';
        }
      }, 1000);
    } catch (error) {
      console.error('Login error:', error);
      showToast('error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900">Member Login</h2>
          <p className="mt-2 text-gray-600">Sign in to access your dashboard</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="emailOrMobile" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address or Mobile Number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  id="emailOrMobile"
                  name="emailOrMobile"
                  type="text"
                  required
                  value={formData.emailOrMobile}
                  onChange={handleInputChange}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.emailOrMobile ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="your.email@example.com or mobile number"
                />
              </div>
              {errors.emailOrMobile && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {errors.emailOrMobile}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={handleInputChange}
                  className={`w-full pl-10 pr-12 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    errors.password ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {errors.password}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm">
                <Link
                  to="/forgot-password"
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Forgot your password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                isSubmitting
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
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
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <Link to="/signup" className="text-blue-600 hover:text-blue-700 font-medium">
                Sign Up
              </Link>
            </p>
          </div>
        </div>

        <div className="text-center">
          <Link to="/" className="text-sm text-gray-600 hover:text-gray-900">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SignIn;