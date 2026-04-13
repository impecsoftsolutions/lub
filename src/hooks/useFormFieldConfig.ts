import { useState, useEffect, useCallback } from 'react';
import {
  formFieldConfigService,
  FormFieldConfiguration,
  joinFormConfigV2Service,
  memberEditFormConfigV2Service,
  type FormDraftConfigurationErrorCode
} from '../lib/supabase';

interface FieldConfigMap {
  [fieldName: string]: {
    is_visible: boolean;
    is_required: boolean;
    validation_rule_id?: string | null;
    validation_rule_name?: string | null;
    field_label?: string | null;
    section_name?: string | null;
    placeholder?: string | null;
    help_text?: string | null;
    field_type?: string | null;
    option_items?: string[] | null;
    min_length?: number | null;
    max_length?: number | null;
  };
}

interface UseFormFieldConfigOptions {
  source?: 'legacy' | 'builder_live' | 'builder_draft';
  formKey?: string;
}

export const useFormFieldConfig = (options?: UseFormFieldConfigOptions) => {
  const source = options?.source ?? 'legacy';
  const formKey = options?.formKey ?? 'join_lub';
  const [fieldConfig, setFieldConfig] = useState<FieldConfigMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<FormDraftConfigurationErrorCode | null>(null);

  const loadFieldConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      const configMap: FieldConfigMap = {};

      if (source === 'builder_live' && formKey === 'join_lub') {
        const result = await joinFormConfigV2Service.getConfiguration();

        if (!result.success || !result.data) {
          throw new Error(result.error || 'Failed to load Join form configuration');
        }

        result.data.forEach(config => {
          configMap[config.field_key] = {
            is_visible: config.is_visible,
            is_required: config.is_required,
            validation_rule_id: config.validation_rule_id ?? null,
            validation_rule_name: null,
            field_label: config.label ?? null,
            section_name: config.section_name ?? null,
            placeholder: config.placeholder ?? null,
            help_text: config.help_text ?? null,
            field_type: config.field_type ?? null,
            option_items: config.option_items ?? null,
            min_length: config.min_length ?? null,
            max_length: config.max_length ?? null
          };
        });
        setErrorCode(null);
      } else if (source === 'builder_live' && formKey === 'member_edit') {
        const result = await memberEditFormConfigV2Service.getConfiguration();

        if (!result.success || !result.data) {
          setErrorCode(result.errorCode ?? 'load_failed');
          throw new Error(result.error || 'Failed to load Member Edit form configuration');
        }

        result.data.forEach(config => {
          configMap[config.field_key] = {
            is_visible: config.is_visible,
            is_required: config.is_required,
            validation_rule_id: config.validation_rule_id ?? null,
            validation_rule_name: null,
            field_label: config.label ?? null,
            section_name: config.section_name ?? null,
            placeholder: config.placeholder ?? null,
            help_text: config.help_text ?? null,
            field_type: config.field_type ?? null,
            option_items: config.option_items ?? null,
            min_length: config.min_length ?? null,
            max_length: config.max_length ?? null
          };
        });
        setErrorCode(null);
      } else if (source === 'builder_draft' && formKey === 'join_lub') {
        const result = await joinFormConfigV2Service.getDraftConfiguration();

        if (!result.success || !result.data) {
          setErrorCode(result.errorCode ?? 'load_failed');
          throw new Error(result.error || 'Failed to load Join form draft configuration');
        }

        result.data.forEach(config => {
          configMap[config.field_key] = {
            is_visible: config.is_visible,
            is_required: config.is_required,
            validation_rule_id: config.validation_rule_id ?? null,
            validation_rule_name: null,
            field_label: config.label ?? null,
            section_name: config.section_name ?? null,
            placeholder: config.placeholder ?? null,
            help_text: config.help_text ?? null,
            field_type: config.field_type ?? null,
            option_items: config.option_items ?? null,
            min_length: config.min_length ?? null,
            max_length: config.max_length ?? null
          };
        });
        setErrorCode(null);
      } else if (source === 'builder_draft' && formKey === 'member_edit') {
        const result = await memberEditFormConfigV2Service.getDraftConfiguration();

        if (!result.success || !result.data) {
          setErrorCode(result.errorCode ?? 'load_failed');
          throw new Error(result.error || 'Failed to load Member Edit form draft configuration');
        }

        result.data.forEach(config => {
          configMap[config.field_key] = {
            is_visible: config.is_visible,
            is_required: config.is_required,
            validation_rule_id: config.validation_rule_id ?? null,
            validation_rule_name: null,
            field_label: config.label ?? null,
            section_name: config.section_name ?? null,
            placeholder: config.placeholder ?? null,
            help_text: config.help_text ?? null,
            field_type: config.field_type ?? null,
            option_items: config.option_items ?? null,
            min_length: config.min_length ?? null,
            max_length: config.max_length ?? null
          };
        });
        setErrorCode(null);
      } else {
        const configs = await formFieldConfigService.getAllFieldConfigurations();
        configs.forEach((config: FormFieldConfiguration) => {
          configMap[config.field_name] = {
            is_visible: config.is_visible,
            is_required: config.is_required,
            validation_rule_id: config.validation_rule_id ?? null,
            validation_rule_name: config.validation_rule?.rule_name || null,
            field_label: config.field_label ?? null,
            section_name: config.section_name ?? null
          };
        });
        setErrorCode(null);
      }

      setFieldConfig(configMap);
      setError(null);
    } catch (err) {
      console.error('Error loading field configuration:', err);
      setError('Failed to load form configuration');
      if (source !== 'builder_draft') {
        setErrorCode(null);
      }
      setFieldConfig({});
    } finally {
      setIsLoading(false);
    }
  }, [source, formKey]);

  useEffect(() => {
    void loadFieldConfig();
  }, [loadFieldConfig]);

  const isFieldVisible = (fieldName: string): boolean => {
    return fieldConfig[fieldName]?.is_visible ?? true;
  };

  const isFieldRequired = (fieldName: string): boolean => {
    return fieldConfig[fieldName]?.is_required ?? false;
  };

  const getValidationRuleName = (fieldName: string): string | null => {
    return fieldConfig[fieldName]?.validation_rule_name ?? null;
  };

  const getValidationRuleId = (fieldName: string): string | null => {
    return fieldConfig[fieldName]?.validation_rule_id ?? null;
  };

  const humanizeFieldName = (fieldName: string): string =>
    fieldName
      .split('_')
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

  const getFieldLabel = (fieldName: string, fallback?: string): string => {
    const configuredLabel = fieldConfig[fieldName]?.field_label?.trim();
    if (configuredLabel) return configuredLabel;
    if (fallback && fallback.trim()) return fallback;
    return humanizeFieldName(fieldName);
  };

  const getFieldPlaceholder = (fieldName: string, fallback?: string): string => {
    const configuredPlaceholder = fieldConfig[fieldName]?.placeholder?.trim();
    if (configuredPlaceholder) return configuredPlaceholder;
    return fallback ?? '';
  };

  const getFieldSection = (fieldName: string, fallback?: string): string => {
    const configuredSection = fieldConfig[fieldName]?.section_name?.trim();
    if (configuredSection) return configuredSection;
    return fallback ?? '';
  };

  const getFieldHelpText = (fieldName: string, fallback?: string): string => {
    const configuredHelpText = fieldConfig[fieldName]?.help_text?.trim();
    if (configuredHelpText) return configuredHelpText;
    return fallback ?? '';
  };

  const getFieldOptions = (fieldName: string): string[] => {
    return fieldConfig[fieldName]?.option_items ?? [];
  };

  const getFieldType = (fieldName: string, fallback?: string): string => {
    const configuredType = fieldConfig[fieldName]?.field_type?.trim();
    if (configuredType) return configuredType;
    return fallback ?? '';
  };

  const getFieldMinLength = (fieldName: string): number | null => {
    return fieldConfig[fieldName]?.min_length ?? null;
  };

  const getFieldMaxLength = (fieldName: string): number | null => {
    return fieldConfig[fieldName]?.max_length ?? null;
  };

  return {
    fieldConfig,
    isLoading,
    error,
    errorCode,
    isFieldVisible,
    isFieldRequired,
    getValidationRuleName,
    getValidationRuleId,
    getFieldLabel,
    getFieldPlaceholder,
    getFieldSection,
    getFieldHelpText,
    getFieldOptions,
    getFieldType,
    getFieldMinLength,
    getFieldMaxLength
  };
};
