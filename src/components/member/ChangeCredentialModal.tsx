import React, { useState, useEffect } from 'react';
import { X, Mail, Phone, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { changeEmail, changeMobile } from '../../lib/memberCredentialService';
import { useValidation } from '../../hooks/useValidation';
import {
  AUTH_VALIDATION_MESSAGES,
  normalizeEmail,
  normalizeMobileNumber,
  validateEmailInput,
  validateMobileNumberInput
} from '../../lib/credentialValidation';

interface ChangeCredentialModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'email' | 'mobile';
  currentValue: string;
  onSuccess: () => void;
}

const ChangeCredentialModal: React.FC<ChangeCredentialModalProps> = ({
  isOpen,
  onClose,
  type,
  currentValue,
  onSuccess
}) => {
  const [newValue, setNewValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [validationError, setValidationError] = useState<string>('');

  const { validateField } = useValidation();

  const isEmail = type === 'email';
  const title = isEmail ? 'Change Email Address' : 'Change Mobile Number';
  const currentLabel = isEmail ? 'Current Email:' : 'Current Mobile:';
  const newLabel = isEmail ? 'New Email:' : 'New Mobile:';
  const placeholder = isEmail ? 'Enter new email address' : 'Enter new mobile number';
  const successMessage = isEmail ? 'Email updated successfully!' : 'Mobile updated successfully!';
  const Icon = isEmail ? Mail : Phone;

  // Reset form when modal opens/closes or type changes
  useEffect(() => {
    if (isOpen) {
      setNewValue('');
      setError('');
      setShowSuccess(false);
      setValidationError('');
    }
  }, [isOpen, type]);

  const handleClose = () => {
    if (!loading) {
      setNewValue('');
      setError('');
      setShowSuccess(false);
      setValidationError('');
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !loading) {
      handleClose();
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) {
      handleClose();
    }
  };

  const handleSave = async () => {
    const normalizedValue = isEmail
      ? normalizeEmail(newValue)
      : normalizeMobileNumber(newValue).slice(0, 10);

    const localValidationError = isEmail
      ? validateEmailInput(normalizedValue)
      : validateMobileNumberInput(normalizedValue, {
          invalidMessage: AUTH_VALIDATION_MESSAGES.mobileInvalidStrict
        });

    if (localValidationError) {
      setError(localValidationError);
      return;
    }

    setError('');
    setLoading(true);

    try {
      let result;
      if (isEmail) {
        result = await changeEmail(normalizedValue);
      } else {
        result = await changeMobile(normalizedValue);
      }

      if (result.success) {
        setShowSuccess(true);

        // Wait 2 seconds, then call callbacks and close
        setTimeout(() => {
          onSuccess();
          onClose();
          setNewValue('');
          setShowSuccess(false);
        }, 2000);
      } else {
        setError(result.error || `Failed to update ${type}`);
      }
    } catch (err) {
      console.error(`Error updating ${type}:`, err);
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full">
              <Icon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <p className="text-sm text-gray-600">Update your {isEmail ? 'email address' : 'mobile number'}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Success Alert */}
          {showSuccess && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <p className="text-sm font-medium text-green-800">{successMessage}</p>
              </div>
            </div>
          )}

          {/* Error Alert */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            </div>
          )}

          {/* Current Value (Read-only) */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {currentLabel}
            </label>
            <input
              type="text"
              value={currentValue}
              readOnly
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
            />
          </div>

          {/* New Value Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {newLabel} <span className="text-red-500">*</span>
            </label>
            <input
              type={isEmail ? 'email' : 'text'}
              value={newValue}
              onChange={async (e) => {
                const inputValue = isEmail
                  ? normalizeEmail(e.target.value)
                  : normalizeMobileNumber(e.target.value).slice(0, 10);

                setNewValue(inputValue);
                if (error) setError('');

                if (inputValue.trim() === '') {
                  setValidationError('');
                } else {
                  const localValidationError = isEmail
                    ? validateEmailInput(inputValue)
                    : validateMobileNumberInput(inputValue);

                  if (localValidationError) {
                    setValidationError(localValidationError);
                    return;
                  }

                  const ruleName = isEmail ? 'email' : 'mobile_number';
                  const result = await validateField(ruleName, inputValue);
                  setValidationError(result.isValid ? '' : (result.message || 'Invalid value'));
                }
              }}
              placeholder={placeholder}
              disabled={loading || showSuccess}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                error || validationError ? 'border-red-500' : 'border-gray-300'
              } disabled:bg-gray-50 disabled:cursor-not-allowed`}
            />
            {validationError && (
              <p className="mt-1 text-xs text-red-600">{validationError}</p>
            )}
            {!validationError && isEmail && (
              <p className="mt-1 text-xs text-gray-500">Enter a valid email address</p>
            )}
            {!validationError && !isEmail && (
              <p className="mt-1 text-xs text-gray-500">Enter a 10-digit mobile number</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 justify-end p-6 bg-gray-50 border-t border-gray-200 rounded-b-lg">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || showSuccess || !!validationError}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : showSuccess ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Saved!
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChangeCredentialModal;
