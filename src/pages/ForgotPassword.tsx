import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, AlertCircle, Loader2, KeyRound, CheckCircle } from 'lucide-react';
import { passwordReset } from '../lib/passwordReset';
import { isEmail, isMobileNumber } from '../lib/customAuth';
import { AuthErrorCode } from '../types/auth.types';
import Toast from '../components/Toast';

const ForgotPassword: React.FC = () => {
  const [identifier, setIdentifier] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');
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

  const validateInput = (): boolean => {
    if (!identifier.trim()) {
      setError('Email or mobile number is required');
      return false;
    }

    if (!isEmail(identifier) && !isMobileNumber(identifier)) {
      setError('Please enter a valid email address or 10-digit mobile number');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateInput()) {
      return;
    }

    try {
      setIsSubmitting(true);

      const result = await passwordReset.requestReset(identifier.trim());

      if (!result.success) {
        if (result.errorCode === AuthErrorCode.EMAIL_SEND_FAILED) {
          setError('Failed to send reset email. Please try again.');
          showToast('error', 'Failed to send email. Please try again.');
        } else {
          setError(result.error || 'An error occurred. Please try again.');
          showToast('error', result.error || 'An error occurred. Please try again.');
        }
        return;
      }

      setSuccess(true);
      setMaskedEmail(result.maskedEmail || '');
      showToast('success', 'Password reset email sent successfully!');
    } catch (error) {
      console.error('Password reset request error:', error);
      setError('An unexpected error occurred. Please try again.');
      showToast('error', 'An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIdentifier(e.target.value);
    if (error) {
      setError('');
    }
  };

  if (success) {
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
            <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-gray-900">Check Your Email</h2>
            <p className="mt-2 text-gray-600">Password reset instructions sent</p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-8">
            <div className="text-center space-y-4">
              <p className="text-gray-700">
                We've sent password reset instructions to:
              </p>
              <p className="font-semibold text-gray-900">{maskedEmail}</p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
                <p className="text-sm text-blue-800">
                  Please check your email inbox (and spam folder) for the password reset link.
                  The link will expire in 1 hour for security purposes.
                </p>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
                <p className="text-sm text-yellow-800">
                  <strong>First-time users:</strong> If you're a legacy member setting up your password
                  for the first time, use the link in the email to create your password.
                </p>
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <Link
                to="/signin"
                className="block w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-center transition-colors"
              >
                Back to Login
              </Link>

              <button
                onClick={() => {
                  setSuccess(false);
                  setIdentifier('');
                  setMaskedEmail('');
                }}
                className="block w-full py-3 px-4 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-lg text-center border border-gray-300 transition-colors"
              >
                Send Another Email
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
            <KeyRound className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900">Forgot Password?</h2>
          <p className="mt-2 text-gray-600">No worries, we'll send you reset instructions</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
                <AlertCircle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                <span className="text-red-700 text-sm">{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address or Mobile Number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  id="identifier"
                  name="identifier"
                  type="text"
                  required
                  value={identifier}
                  onChange={handleInputChange}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    error ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="your.email@example.com or mobile number"
                  disabled={isSubmitting}
                />
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Enter the email or mobile number associated with your account
              </p>
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
                  Sending...
                </span>
              ) : (
                'Send Reset Instructions'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              to="/signin"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Back to Login
            </Link>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800 text-center">
            For admin login, use the{' '}
            <Link to="/admin-login" className="font-semibold underline">
              Admin Login Page
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
