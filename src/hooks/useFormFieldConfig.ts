import { useState, useEffect } from 'react';
import { formFieldConfigService, FormFieldConfiguration } from '../lib/supabase';

interface FieldConfigMap {
  [fieldName: string]: {
    is_visible: boolean;
    is_required: boolean;
    validation_rule_name?: string | null;
  };
}

export const useFormFieldConfig = () => {
  const [fieldConfig, setFieldConfig] = useState<FieldConfigMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFieldConfig();
  }, []);

  const loadFieldConfig = async () => {
    try {
      setIsLoading(true);
      const configs = await formFieldConfigService.getAllFieldConfigurations();

      const configMap: FieldConfigMap = {};
      configs.forEach((config: FormFieldConfiguration) => {
        configMap[config.field_name] = {
          is_visible: config.is_visible,
          is_required: config.is_required,
          validation_rule_name: config.validation_rule?.rule_name || null
        };
      });

      setFieldConfig(configMap);
      setError(null);
    } catch (err) {
      console.error('Error loading field configuration:', err);
      setError('Failed to load form configuration');
      setFieldConfig({});
    } finally {
      setIsLoading(false);
    }
  };

  const isFieldVisible = (fieldName: string): boolean => {
    return fieldConfig[fieldName]?.is_visible ?? true;
  };

  const isFieldRequired = (fieldName: string): boolean => {
    return fieldConfig[fieldName]?.is_required ?? false;
  };

  const getValidationRuleName = (fieldName: string): string | null => {
    return fieldConfig[fieldName]?.validation_rule_name ?? null;
  };

  return {
    fieldConfig,
    isLoading,
    error,
    isFieldVisible,
    isFieldRequired,
    getValidationRuleName
  };
};
