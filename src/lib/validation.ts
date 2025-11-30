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

  async validateByFieldName(fieldName: string, value: string): Promise<ValidationResult> {
    try {
      console.log('[Validation] validateByFieldName called with:', { fieldName, value: value.substring(0, 20) + '...' });

      // Step 1: Query form_field_configurations to get validation_rule_id for the field_name
      const { data: fieldConfig, error: fieldError } = await supabase
        .from('form_field_configurations')
        .select('validation_rule_id')
        .eq('field_name', fieldName)
        .maybeSingle();

      if (fieldError) {
        console.error('[Validation] Error fetching field configuration:', fieldError);
        return {
          isValid: false,
          message: 'Error fetching field configuration'
        };
      }

      if (!fieldConfig) {
        console.error('[Validation] Field configuration not found for:', fieldName);
        return {
          isValid: false,
          message: `Field configuration not found for "${fieldName}"`
        };
      }

      // If no validation rule is assigned, consider the field valid (no validation required)
      if (!fieldConfig.validation_rule_id) {
        console.log('[Validation] No validation rule assigned for field:', fieldName);
        return {
          isValid: true,
          message: ''
        };
      }

      // Step 2: Query validation_rules table using the validation_rule_id
      const { data: validationRule, error: ruleError } = await supabase
        .from('validation_rules')
        .select('validation_pattern, error_message, rule_name')
        .eq('id', fieldConfig.validation_rule_id)
        .eq('is_active', true)
        .maybeSingle();

      if (ruleError) {
        console.error('[Validation] Error fetching validation rule:', ruleError);
        return {
          isValid: false,
          message: 'Error fetching validation rule'
        };
      }

      if (!validationRule) {
        console.error('[Validation] Validation rule not found for ID:', fieldConfig.validation_rule_id);
        return {
          isValid: false,
          message: 'Validation rule not found or inactive'
        };
      }

      console.log('[Validation] Found validation rule:', validationRule.rule_name, '- Pattern:', validationRule.validation_pattern);

      // Step 3: Apply validation pattern
      const regex = new RegExp(validationRule.validation_pattern);
      const isValid = regex.test(value);

      console.log('[Validation] Validation result for', fieldName, ':', isValid ? 'VALID' : 'INVALID');

      // Step 4: Return result with error_message if validation fails
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
