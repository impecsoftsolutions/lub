import React, { useState, useEffect } from 'react';
import { X, Mail, Phone, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useValidation } from '../../../hooks/useValidation';
import { sessionManager } from '../../../lib/sessionManager';
import {
  normalizeEmail,
  normalizeMobileNumber,
  validateEmailInput,
  validateMobileNumberInput
} from '../../../lib/credentialValidation';

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: string;
    email: string;
    mobile_number: string;
  };
  onSuccess: () => void;
}

const EditUserModal: React.FC<EditUserModalProps> = ({
  isOpen,
  onClose,
  user,
  onSuccess
}) => {
  const [formData, setFormData] = useState({
    email: '',
    mobile_number: ''
  });

  const [validationErrors, setValidationErrors] = useState({
    email: '',
    mobile_number: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);

  const { validateField, isLoading: validationLoading } = useValidation();

  useEffect(() => {
    if (user) {
      setFormData({
        email: user.email || '',
        mobile_number: user.mobile_number || ''
      });
    }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const processedValue = name === 'email'
      ? normalizeEmail(value)
      : normalizeMobileNumber(value).slice(0, 10);

    setFormData(prev => ({
      ...prev,
      [name]: processedValue
    }));
    setError('');
    setValidationErrors(prev => ({
      ...prev,
      [name]: ''
    }));
  };

  const handleBlur = async (fieldName: 'email' | 'mobile_number') => {
    const value = fieldName === 'email'
      ? normalizeEmail(formData[fieldName])
      : normalizeMobileNumber(formData[fieldName]).slice(0, 10);

    const localValidationError = fieldName === 'email'
      ? validateEmailInput(value)
      : validateMobileNumberInput(value);

    if (localValidationError) {
      setValidationErrors(prev => ({
        ...prev,
        [fieldName]: localValidationError
      }));
      return;
    }

    const result = await validateField(fieldName, value);

    if (!result.isValid) {
      setValidationErrors(prev => ({
        ...prev,
        [fieldName]: result.message || 'Invalid value'
      }));
    }
  };

  const validateForm = async (): Promise<boolean> => {
    const nextErrors = {
      email: '',
      mobile_number: ''
    };

    const normalizedEmailValue = normalizeEmail(formData.email);
    const normalizedMobileValue = normalizeMobileNumber(formData.mobile_number).slice(0, 10);

    const emailLocalError = validateEmailInput(normalizedEmailValue);
    if (emailLocalError) {
      nextErrors.email = emailLocalError;
    } else {
      const emailResult = await validateField('email', normalizedEmailValue);
      if (!emailResult.isValid) {
        nextErrors.email = emailResult.message || 'Invalid email';
      }
    }

    const mobileLocalError = validateMobileNumberInput(normalizedMobileValue);
    if (mobileLocalError) {
      nextErrors.mobile_number = mobileLocalError;
    } else {
      const mobileResult = await validateField('mobile_number', normalizedMobileValue);
      if (!mobileResult.isValid) {
        nextErrors.mobile_number = mobileResult.message || 'Invalid mobile number';
      }
    }

    setValidationErrors(nextErrors);
    return !nextErrors.email && !nextErrors.mobile_number;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const isValid = await validateForm();
    if (!isValid) {
      return;
    }

    try {
      setIsSubmitting(true);

      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        throw new Error('Unable to get current session');
      }

      const { data, error: updateError } = await supabase
        .rpc('admin_update_user_details', {
          p_session_token: sessionToken,
          p_user_id: user.id,
          p_email: normalizeEmail(formData.email) || null,
          p_mobile_number: normalizeMobileNumber(formData.mobile_number).slice(0, 10) || null,
          p_new_password: null
        });

      if (updateError) {
        throw updateError;
      }

      // Check RPC result
      const result = data as { success: boolean; error?: string; user_id?: string };
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to update user');
      }

      setSuccess(true);

      setTimeout(() => {
        setSuccess(false);
        onSuccess();
        onClose();
      }, 1500);

    } catch (error: unknown) {
      console.error('Update user error:', error);
      setError(error instanceof Error ? error.message : 'Failed to update user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData({
        email: user.email || '',
        mobile_number: user.mobile_number || ''
      });
      setValidationErrors({ email: '', mobile_number: '' });
      setError('');
      setSuccess(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 transition-opacity bg-black/50"
          onClick={handleClose}
        />

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

        <div className="inline-block align-bottom bg-card rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">

          <div className="bg-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-full">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-section font-semibold text-foreground">Edit User</h3>
                  <p className="text-sm text-muted-foreground">Update email and mobile number</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={isSubmitting}
                className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {success && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="text-sm font-medium text-green-800">User updated successfully!</p>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    onBlur={() => handleBlur('email')}
                    className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent ${
                      validationErrors.email ? 'border-red-500' : 'border-border'
                    }`}
                    placeholder="user@example.com"
                    disabled={isSubmitting || success || validationLoading}
                    required
                  />
                </div>
                {validationErrors.email && (
                  <p className="mt-1 text-xs text-red-600">{validationErrors.email}</p>
                )}
              </div>

              <div>
                <label htmlFor="mobile_number" className="block text-sm font-medium text-foreground mb-1">
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="tel"
                    id="mobile_number"
                    name="mobile_number"
                    value={formData.mobile_number}
                    onChange={handleChange}
                    onBlur={() => handleBlur('mobile_number')}
                    className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent ${
                      validationErrors.mobile_number ? 'border-red-500' : 'border-border'
                    }`}
                    placeholder="10-digit mobile number"
                    disabled={isSubmitting || success || validationLoading}
                    required
                  />
                </div>
                {validationErrors.mobile_number && (
                  <p className="mt-1 text-xs text-red-600">{validationErrors.mobile_number}</p>
                )}
              </div>

            </form>
          </div>

          <div className="bg-muted/50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || success || validationLoading}
              className="w-full inline-flex justify-center items-center gap-2 rounded-lg border border-transparent shadow-sm px-4 py-2 bg-primary text-base font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Updating...
                </>
              ) : success ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Updated!
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Update User
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="mt-3 w-full inline-flex justify-center rounded-lg border border-border shadow-sm px-4 py-2 bg-card text-base font-medium text-foreground hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default EditUserModal;
