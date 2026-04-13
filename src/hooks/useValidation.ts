import { useState, useEffect, useCallback } from 'react';
import { validationService, ValidationRule, ValidationResult } from '../lib/validation';

interface UseValidationOptions {
  formKey?: string;
}

export const useValidation = (options?: UseValidationOptions) => {
  const formKey = options?.formKey || 'join_lub';
  const [rules, setRules] = useState<ValidationRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('[useValidation] Loading validation rules...');
      const fetchedRules = await validationService.fetchActiveValidationRules();
      console.log('[useValidation] Loaded', fetchedRules.length, 'validation rules');
      console.log('[useValidation] Rule names:', fetchedRules.map(r => r.rule_name).join(', '));
      setRules(fetchedRules);
    } catch (err) {
      console.error('[useValidation] Error loading validation rules:', err);
      setError('Failed to load validation rules');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const validateField = useCallback(
    async (fieldName: string, value: string): Promise<ValidationResult> => {
      try {
        console.log('[useValidation] validateField called:', { fieldName, valueLength: value.length });
        const result = await validationService.validateByFieldName(fieldName, value, formKey);
        console.log('[useValidation] Validation result for', fieldName, ':', result.isValid ? 'VALID' : 'INVALID', result.message || '(no error)');
        return result;
      } catch (err) {
        console.error('[useValidation] Error validating field:', err);
        return {
          isValid: false,
          message: 'Validation error occurred'
        };
      }
    },
    [formKey]
  );

  const getErrorMessage = useCallback(
    (ruleName: string): string => {
      const rule = rules.find(r => r.rule_name === ruleName);
      return rule?.error_message || 'Invalid value';
    },
    [rules]
  );

  const isValidEmail = useCallback(async (email: string): Promise<boolean> => {
    const result = await validationService.validateEmail(email);
    return result.isValid;
  }, []);

  const isValidMobile = useCallback(async (mobile: string): Promise<boolean> => {
    const result = await validationService.validateMobile(mobile);
    return result.isValid;
  }, []);

  const isValidPIN = useCallback(async (pin: string): Promise<boolean> => {
    const result = await validationService.validatePIN(pin);
    return result.isValid;
  }, []);

  const isValidGST = useCallback(async (gst: string): Promise<boolean> => {
    const result = await validationService.validateGST(gst);
    return result.isValid;
  }, []);

  const isValidPAN = useCallback(async (pan: string): Promise<boolean> => {
    const result = await validationService.validatePAN(pan);
    return result.isValid;
  }, []);

  const isValidAadhaar = useCallback(async (aadhaar: string): Promise<boolean> => {
    const result = await validationService.validateAadhaar(aadhaar);
    return result.isValid;
  }, []);

  const isValidWebsite = useCallback(async (website: string): Promise<boolean> => {
    const result = await validationService.validateWebsite(website);
    return result.isValid;
  }, []);

  const refreshRules = useCallback(async () => {
    validationService.clearCache();
    await loadRules();
  }, [loadRules]);

  return {
    rules,
    isLoading,
    error,
    validateField,
    getErrorMessage,
    isValidEmail,
    isValidMobile,
    isValidPIN,
    isValidGST,
    isValidPAN,
    isValidAadhaar,
    isValidWebsite,
    refreshRules
  };
};
