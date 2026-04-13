import { supabase } from './supabase';

export interface ValidationRule {
  id: string;
  rule_name: string;
  rule_type: string;
  category: string;
  validation_pattern: string;
  error_message: string;
  description: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface ValidationResult {
  isValid: boolean;
  message: string;
  matchedPattern?: string;
}

export type ValidationCategory = 'Contact Validation' | 'Document Validation' | 'Address Validation';

let cachedRules: ValidationRule[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000;

export const validationService = {
  async fetchAllValidationRules(): Promise<ValidationRule[]> {
    try {
      const { data, error } = await supabase
        .from('validation_rules')
        .select('*')
        .order('display_order');

      if (error) {
        console.error('Error fetching validation rules:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in fetchAllValidationRules:', error);
      throw error;
    }
  },

  async fetchActiveValidationRules(): Promise<ValidationRule[]> {
    const now = Date.now();

    if (cachedRules && (now - cacheTimestamp) < CACHE_TTL) {
      console.log('[Validation] Using cached rules:', cachedRules.length, 'rules');
      console.log('[Validation] Cached rule names:', cachedRules.map(r => r.rule_name).join(', '));
      return cachedRules;
    }

    try {
      console.log('[Validation] Fetching active validation rules from database...');
      const { data, error } = await supabase
        .from('validation_rules')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (error) {
        console.error('[Validation] Error fetching active validation rules:', error);
        throw error;
      }

      cachedRules = data || [];
      cacheTimestamp = now;

      console.log('[Validation] Loaded', cachedRules.length, 'active validation rules from database');
      console.log('[Validation] Rule names:', cachedRules.map(r => r.rule_name).join(', '));

      return cachedRules;
    } catch (error) {
      console.error('[Validation] Error in fetchActiveValidationRules:', error);
      throw error;
    }
  },

  async fetchValidationRulesByCategory(category: ValidationCategory): Promise<ValidationRule[]> {
    try {
      const { data, error } = await supabase
        .from('validation_rules')
        .select('*')
        .eq('category', category)
        .eq('is_active', true)
        .order('display_order');

      if (error) {
        console.error('Error fetching validation rules by category:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in fetchValidationRulesByCategory:', error);
      throw error;
    }
  },

  clearCache(): void {
    cachedRules = null;
    cacheTimestamp = 0;
  },

  async validateByRuleName(ruleName: string, value: string): Promise<ValidationResult> {
    try {
      console.log('[Validation] validateByRuleName called with:', { ruleName, value: value.substring(0, 20) + '...' });

      const rules = await this.fetchActiveValidationRules();
      console.log('[Validation] Searching for rule:', ruleName);
      console.log('[Validation] Available rules:', rules.map(r => r.rule_name).join(', '));

      const rule = rules.find(r => r.rule_name === ruleName);

      if (!rule) {
        console.error('[Validation] Rule not found:', ruleName);
        console.error('[Validation] Available rule names:', rules.map(r => r.rule_name));
        return {
          isValid: false,
          message: `Validation rule "${ruleName}" not found`
        };
      }

      console.log('[Validation] Found rule:', ruleName, '- Pattern:', rule.validation_pattern);

      const regex = new RegExp(rule.validation_pattern);
      const isValid = regex.test(value);

      console.log('[Validation] Validation result for', ruleName, ':', isValid ? 'VALID' : 'INVALID');

      return {
        isValid,
        message: isValid ? '' : rule.error_message,
        matchedPattern: rule.validation_pattern
      };
    } catch (error) {
      console.error('[Validation] Error in validateByRuleName:', error);
      return {
        isValid: false,
        message: 'Validation error occurred'
      };
    }
  },

  async validateEmail(email: string): Promise<ValidationResult> {
    return this.validateByRuleName('email_format', email);
  },

  async validateMobile(mobile: string): Promise<ValidationResult> {
    return this.validateByRuleName('mobile_number', mobile);
  },

  async validatePIN(pin: string): Promise<ValidationResult> {
    return this.validateByRuleName('pin_code', pin);
  },

  async validateGST(gst: string): Promise<ValidationResult> {
    return this.validateByRuleName('gst_number', gst);
  },

  async validatePAN(pan: string): Promise<ValidationResult> {
    return this.validateByRuleName('pan_number', pan);
  },

  async validateAadhaar(aadhaar: string): Promise<ValidationResult> {
    return this.validateByRuleName('aadhaar_number', aadhaar);
  },

  async validateWebsite(website: string): Promise<ValidationResult> {
    return this.validateByRuleName('website', website);
  },

  validateSync(pattern: string, value: string, errorMessage: string): ValidationResult {
    try {
      const regex = new RegExp(pattern);
      const isValid = regex.test(value);

      return {
        isValid,
        message: isValid ? '' : errorMessage,
        matchedPattern: pattern
      };
    } catch (error) {
      console.error('Error in validateSync:', error);
      return {
        isValid: false,
        message: 'Invalid validation pattern'
      };
    }
  },

  async validateByFieldName(
    fieldName: string,
    value: string,
    formKey: string = 'join_lub'
  ): Promise<ValidationResult> {
    try {
      console.log('[Validation] validateByFieldName called with:', {
        formKey,
        fieldName,
        value: value.substring(0, 20) + '...'
      });

      // Prefer Builder live mapping for form runtime.
      const { data: liveRuleData, error: liveRuleError } = await supabase.rpc(
        'get_form_field_validation_rule_v2',
        {
          p_form_key: formKey,
          p_field_key: fieldName
        }
      );

      if (!liveRuleError) {
        const liveRule = Array.isArray(liveRuleData) ? liveRuleData[0] : null;

        if (liveRule) {
          if (!liveRule.validation_rule_id) {
            return { isValid: true, message: '' };
          }

          // If mapped rule is inactive/missing, do not block submission.
          if (!liveRule.validation_pattern) {
            return { isValid: true, message: '' };
          }

          const regex = new RegExp(liveRule.validation_pattern);
          const isValid = regex.test(value);
          return {
            isValid,
            message: isValid ? '' : (liveRule.error_message || 'Invalid value'),
            matchedPattern: liveRule.validation_pattern
          };
        }
      }

      // Legacy fallback remains only for Join form compatibility in older environments.
      if (formKey !== 'join_lub') {
        return { isValid: true, message: '' };
      }

      const { data: fieldConfig, error: fieldError } = await supabase
        .from('form_field_configurations')
        .select('validation_rule_id')
        .eq('field_name', fieldName)
        .maybeSingle();

      if (fieldError || !fieldConfig) {
        return { isValid: true, message: '' };
      }

      if (!fieldConfig.validation_rule_id) {
        return { isValid: true, message: '' };
      }

      const { data: validationRule, error: ruleError } = await supabase
        .from('validation_rules')
        .select('validation_pattern, error_message')
        .eq('id', fieldConfig.validation_rule_id)
        .eq('is_active', true)
        .maybeSingle();

      if (ruleError || !validationRule) {
        return { isValid: true, message: '' };
      }

      const regex = new RegExp(validationRule.validation_pattern);
      const isValid = regex.test(value);
      return {
        isValid,
        message: isValid ? '' : validationRule.error_message,
        matchedPattern: validationRule.validation_pattern
      };
    } catch (error) {
      console.error('[Validation] Error in validateByFieldName:', error);
      return {
        isValid: false,
        message: 'Validation error occurred'
      };
    }
  }
};
