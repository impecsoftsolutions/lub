import React, { useState, useEffect } from 'react';
import { X, Mail, Phone, Loader2, CheckCircle, AlertCircle, Lock } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useValidation } from '../../../hooks/useValidation';
import { sessionManager } from '../../../lib/sessionManager';

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
    mobile_number: '',
    password: ''
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
        mobile_number: user.mobile_number || '',
        password: ''
      });
    }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
    setValidationErrors(prev => ({
      ...prev,
      [name]: ''
    }));
  };

  const handleBlur = async (fieldName: 'email' | 'mobile_number') => {
    const value = formData[fieldName];

    if (!value) {
      setValidationErrors(prev => ({
        ...prev,
        [fieldName]: `${fieldName === 'email' ? 'Email' : 'Mobile number'} is required`
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
    const emailResult = await validateField('email', formData.email);
    if (!emailResult.isValid) {
      setValidationErrors(prev => ({
        ...prev,
        email: emailResult.message || 'Invalid email'
      }));
      return false;
    }

    const mobileResult = await validateField('mobile_number', formData.mobile_number);
    if (!mobileResult.isValid) {
      setValidationErrors(prev => ({
        ...prev,
        mobile_number: mobileResult.message || 'Invalid mobile number'
      }));
      return false;
    }

    return true;
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

      // Get current user ID from session
      const userData = sessionManager.getUserData();
      if (!userData?.id) {
        throw new Error('Unable to get current user ID');
      }

      const { data, error: updateError } = await supabase
        .rpc('admin_update_user_details', {
          p_user_id: user.id,
          p_requesting_user_id: userData.id,
          p_email: formData.email?.trim() || null,
          p_mobile_number: formData.mobile_number?.trim() || null,
          p_new_password: formData.password ? formData.password : null
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

    } catch (error: any) {
      console.error('Update user error:', error);
      setError(error.message || 'Failed to update user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData({
        email: user.email || '',
        mobile_number: user.mobile_number || '',
        password: ''
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
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={handleClose}
        />

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">

          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full">
                  <Mail className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Edit User</h3>
                  <p className="text-sm text-gray-600">Update email and mobile number</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={isSubmitting}
                className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
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
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    onBlur={() => handleBlur('email')}
                    className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      validationErrors.email ? 'border-red-500' : 'border-gray-300'
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
                <label htmlFor="mobile_number" className="block text-sm font-medium text-gray-700 mb-1">
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="tel"
                    id="mobile_number"
                    name="mobile_number"
                    value={formData.mobile_number}
                    onChange={handleChange}
                    onBlur={() => handleBlur('mobile_number')}
                    className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      validationErrors.mobile_number ? 'border-red-500' : 'border-gray-300'
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

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password (optional)
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Leave empty to keep current password"
                    disabled={isSubmitting || success}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">No rules. Admin override.</p>
              </div>

            </form>
          </div>

          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || success || validationLoading}
              className="w-full inline-flex justify-center items-center gap-2 rounded-lg border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="mt-3 w-full inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
