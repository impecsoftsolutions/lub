import { createClient } from '@supabase/supabase-js';
import { sessionManager } from './sessionManager';
import { normalizeEmail } from './credentialValidation';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === '' || supabaseAnonKey === '') {
  const missingVars = [];
  if (!supabaseUrl || supabaseUrl === '') missingVars.push('VITE_SUPABASE_URL');
  if (!supabaseAnonKey || supabaseAnonKey === '') missingVars.push('VITE_SUPABASE_ANON_KEY');

  console.error('Supabase initialization failed. Missing environment variables:', missingVars);
  console.error('Please check your .env file in the project root.');
  console.error('Expected format:');
  console.error('VITE_SUPABASE_URL=your_supabase_url');
  console.error('VITE_SUPABASE_ANON_KEY=your_supabase_anon_key');

  throw new Error(`Missing Supabase environment variables: ${missingVars.join(', ')}`);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types
export interface UserRole {
  id?: string;
  user_id: string;
  role: 'super_admin' | 'admin' | 'manager' | 'editor' | 'viewer';
  state?: string;
  district?: string;
  is_member_linked: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AdminUser {
  id: string;
  email: string;
  roles: UserRole[];
  member_info?: {
    full_name: string;
    company_name: string;
    mobile_number: string;
  } | null;
}

export interface StateMaster {
  id: string;
  state_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DistrictOption {
  district_id: string;
  district_name: string;
}

export interface CityOption {
  city_id: string;
  city_name: string;
  is_popular: boolean;
}

export interface PublicPaymentState {
  state: string;
  account_holder_name: string;
  bank_name: string;
  branch: string;
  account_number: string;
  ifsc_code: string;
  male_fee: number;
  female_fee: number;
  validity_years: number;
  qr_code_image_url: string;
  created_at?: string;
  updated_at?: string;
}

export interface OrganizationProfile {
  id: string;
  organization_name: string;
  organization_logo_url: string;
  contact_number: string;
  email_address: string;
  organization_website?: string;
  address: string;
  social_media_handles: SocialMediaHandle[];
  created_at: string;
  updated_at: string;
}

export interface SocialMediaHandle {
  platform: string;
  url: string;
  username: string;
}

export interface CompanyDesignation {
  id: string;
  designation_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LubRole {
  id: string;
  role_name: string;
  is_active: boolean;
  display_order?: number;
  created_at: string;
  updated_at: string;
}

export interface MemberLubRoleAssignment {
  id: string;
  member_id: string;
  role_id: string;
  level: 'national' | 'state' | 'district' | 'city';
  state?: string;
  district?: string;
  created_at: string;
  updated_at: string;
  member_registrations?: {
    full_name: string;
    company_name: string;
    email: string;
    mobile_number: string;
  };
  lub_roles_master?: {
    role_name: string;
  };
  member_name?: string;
  member_email?: string;
  role_name?: string;
  lub_role_display_order?: number | null;
}

export interface FormFieldConfiguration {
  id: string;
  field_name: string;
  section_name: string;
  field_label: string;
  is_visible: boolean;
  is_required: boolean;
  display_order: number;
  is_system_field: boolean;
  validation_rule_id?: string | null;
  validation_rule?: ValidationRule | null;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}

export type SignupV2FieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'checkbox'
  | 'number'
  | 'date'
  | 'url'
  | 'email'
  | 'tel';

export interface SignupFormFieldV2 {
  id: string;
  form_key: 'signup';
  field_key: string;
  label: string;
  field_type: SignupV2FieldType;
  section_name: string;
  placeholder?: string | null;
  help_text?: string | null;
  option_items?: string[] | null;
  default_value?: string | null;
  is_visible: boolean;
  is_required: boolean;
  is_locked: boolean;
  is_system_field: boolean;
  display_order: number;
  min_length?: number | null;
  max_length?: number | null;
  validation_rule_id?: string | null;
}

export interface SigninFormFieldV2 {
  id: string;
  form_key: 'signin';
  field_key: string;
  label: string;
  field_type: SignupV2FieldType;
  section_name: string;
  placeholder?: string | null;
  help_text?: string | null;
  option_items?: string[] | null;
  default_value?: string | null;
  is_visible: boolean;
  is_required: boolean;
  is_locked: boolean;
  is_system_field: boolean;
  display_order: number;
  min_length?: number | null;
  max_length?: number | null;
  validation_rule_id?: string | null;
}

export interface JoinFormFieldV2 {
  id: string;
  form_key: 'join_lub';
  field_key: string;
  label: string;
  field_type: SignupV2FieldType;
  section_name: string;
  placeholder?: string | null;
  help_text?: string | null;
  option_items?: string[] | null;
  default_value?: string | null;
  is_visible: boolean;
  is_required: boolean;
  is_locked: boolean;
  is_system_field: boolean;
  display_order: number;
  min_length?: number | null;
  max_length?: number | null;
  validation_rule_id?: string | null;
}

export type FormDraftConfigurationErrorCode = 'no_session' | 'access_denied' | 'load_failed';
export type SignupDraftConfigurationErrorCode = FormDraftConfigurationErrorCode;
export type JoinDraftConfigurationErrorCode = FormDraftConfigurationErrorCode;
export type MemberEditDraftConfigurationErrorCode = FormDraftConfigurationErrorCode;

export interface MemberEditFormFieldV2 {
  id: string;
  form_key: 'member_edit';
  field_key: string;
  label: string;
  field_type: SignupV2FieldType;
  section_name: string;
  placeholder?: string | null;
  help_text?: string | null;
  option_items?: string[] | null;
  default_value?: string | null;
  is_visible: boolean;
  is_required: boolean;
  is_locked: boolean;
  is_system_field: boolean;
  display_order: number;
  min_length?: number | null;
  max_length?: number | null;
  validation_rule_id?: string | null;
}

export interface SignupFormFieldV2UpsertInput {
  field_key: string;
  label: string;
  field_type: SignupV2FieldType;
  section_name: string;
  placeholder?: string | null;
  help_text?: string | null;
  option_items?: string[] | null;
  default_value?: string | null;
  is_visible: boolean;
  is_required: boolean;
  display_order: number;
  validation_rule_id?: string | null;
}

export interface SignupFormFieldV2CreateInput {
  field_key: string;
  label: string;
  field_type: SignupV2FieldType;
  section_name: string;
  placeholder?: string | null;
  help_text?: string | null;
  option_items?: string[] | null;
  default_value?: string | null;
  is_visible?: boolean;
  is_required?: boolean;
  display_order?: number;
  validation_rule_id?: string | null;
}

export interface FormConfigV2FormSummary {
  id: string;
  form_key: string;
  form_name: string;
  description?: string | null;
  is_active: boolean;
  field_count: number;
}

export interface FormBuilderV2FormSummary extends FormConfigV2FormSummary {
  updated_at: string;
  live_published_at?: string | null;
  live_published_by?: string | null;
  live_published_by_email?: string | null;
  live_publish_origin?: FormLivePublishOrigin;
}

export type FormLivePublishOrigin = 'never_published' | 'legacy_seeded' | 'manual_publish' | 'unpublished';

export interface FormLivePublishStatus {
  form_id: string;
  form_key: string;
  form_name: string;
  live_published_at?: string | null;
  live_published_by?: string | null;
  live_published_by_email?: string | null;
  live_publish_origin: FormLivePublishOrigin;
}

export interface FormConfigV2FormCreateInput {
  form_key: string;
  form_name: string;
  description?: string | null;
}

export interface FormConfigV2Field {
  id: string;
  form_key: string;
  field_key: string;
  label: string;
  field_type: SignupV2FieldType;
  section_name: string;
  placeholder?: string | null;
  help_text?: string | null;
  option_items?: string[] | null;
  default_value?: string | null;
  is_visible: boolean;
  is_required: boolean;
  is_locked: boolean;
  is_system_field: boolean;
  display_order: number;
  min_length?: number | null;
  max_length?: number | null;
  validation_rule_id?: string | null;
}

export interface FormConfigV2FieldCreateInput {
  form_key: string;
  field_key: string;
  label: string;
  field_type: SignupV2FieldType;
  section_name: string;
  placeholder?: string | null;
  help_text?: string | null;
  option_items?: string[] | null;
  default_value?: string | null;
  is_visible?: boolean;
  is_required?: boolean;
  display_order?: number;
  validation_rule_id?: string | null;
}

export interface FormBuilderSchemaFieldV2 extends FormConfigV2Field {
  form_name: string;
  description?: string | null;
  is_active: boolean;
  library_is_archived: boolean;
}

export interface FormBuilderSchemaV2 {
  form: {
    id: string;
    form_key: string;
    form_name: string;
    description?: string | null;
    is_active: boolean;
    live_published_at?: string | null;
    live_published_by?: string | null;
    live_published_by_email?: string | null;
    live_publish_origin?: FormLivePublishOrigin;
  };
  fields: FormBuilderSchemaFieldV2[];
}

export interface FormBuilderV2CloneInput {
  source_form_key: string;
  target_form_key: string;
  target_form_name: string;
  description?: string | null;
}

export interface FormBuilderV2AttachFieldInput {
  form_key: string;
  field_key: string;
  is_visible?: boolean;
  is_required?: boolean;
  display_order?: number | null;
}

export interface FormBuilderV2FieldSettingsInput {
  field_key: string;
  is_visible: boolean;
  is_required: boolean;
  display_order?: number | null;
}

export interface FieldLibraryItemV2 {
  field_key: string;
  label: string;
  field_type: SignupV2FieldType;
  section_name: string;
  placeholder?: string | null;
  help_text?: string | null;
  option_items?: string[] | null;
  min_length?: number | null;
  max_length?: number | null;
  validation_rule_id?: string | null;
  is_locked: boolean;
  is_system_field: boolean;
  is_archived: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface FieldLibraryItemV2UpsertInput {
  field_key: string;
  label: string;
  field_type: SignupV2FieldType;
  section_name: string;
  placeholder?: string | null;
  help_text?: string | null;
  option_items?: string[] | null;
  min_length?: number | null;
  max_length?: number | null;
  validation_rule_id?: string | null;
  is_system_field?: boolean;
  is_locked?: boolean;
}

export type AIProvider = 'openai' | 'google' | 'anthropic' | 'azure_openai' | 'custom';
export type AIRuntimeReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

export interface AIRuntimeSettings {
  setting_key: string;
  provider: AIProvider;
  model: string;
  reasoning_effort?: AIRuntimeReasoningEffort | null;
  is_enabled: boolean;
  has_api_key: boolean;
  api_key_masked?: string | null;
  updated_at?: string | null;
  updated_by_email?: string | null;
  live_updated_via?: string | null;
}

export interface AIRuntimeProfile {
  provider: AIProvider;
  model: string;
  reasoning_effort?: AIRuntimeReasoningEffort | null;
  is_enabled: boolean;
}

export type PortalDateFormat = 'dd-mm-yyyy' | 'mm-dd-yyyy' | 'yyyy-mm-dd' | 'dd-mmm-yyyy';
export type PortalTimeFormat = '12h' | '24h';

export interface DateTimeFormatSettings {
  setting_key: string;
  date_format: PortalDateFormat;
  time_format: PortalTimeFormat;
  updated_at?: string | null;
  updated_by_email?: string | null;
  live_updated_via?: string | null;
}

export interface DateTimeFormatProfile {
  date_format: PortalDateFormat;
  time_format: PortalTimeFormat;
}

type JsonRecord = Record<string, unknown>;

interface UserRoleQueryRow {
  id: string;
  user_id: string;
  role: UserRole['role'];
  state?: string;
  district?: string;
  is_member_linked: boolean;
  created_at?: string;
  updated_at?: string;
  user?: {
    email?: string | null;
  } | null;
}

interface MemberRegistrationRpcRow extends JsonRecord {
  company_designation_name?: string | null;
}

const mapApprovedMemberExportRow = (value: unknown): ApprovedMemberExportRow => {
  const row = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const readString = (input: unknown): string => (typeof input === 'string' ? input : '');
  return {
    company_name: readString(row.company_name),
    member_name: readString(row.member_name),
    city: readString(row.city),
    district: readString(row.district),
    mobile_number: readString(row.mobile_number),
    email: readString(row.email),
    member_id: readString(row.member_id),
    company_address: readString(row.company_address),
    gender: readString(row.gender),
  };
};

interface SubmitRegistrationPayload extends JsonRecord {
  user_id?: string | null;
  is_custom_city?: boolean;
}

interface SignupPrefillPayloadRpcResult extends JsonRecord {
  success?: boolean;
  error?: string;
  data?: JsonRecord;
  core_payload?: JsonRecord;
  custom_payload?: JsonRecord;
  submission_created_at?: string | null;
}

interface UpdateStatusResult {
  success: boolean;
  error?: string;
  registration?: JsonRecord;
}

interface MemberLubRoleAssignmentRpcRow {
  assignment_id: string;
  member_id: string;
  lub_role_id: string;
  level: MemberLubRoleAssignment['level'];
  state?: string;
  district?: string;
  committee_year?: string | null;
  role_start_date?: string | null;
  role_end_date?: string | null;
  created_at: string;
  updated_at: string;
  member_full_name: string;
  member_email: string;
  member_mobile_number: string;
  member_company_name: string;
  lub_role_name: string;
  lub_role_display_order?: number | null;
}

// User Roles Service
export const userRolesService = {
  async getCurrentUserRoles(): Promise<UserRole[]> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching user roles:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getCurrentUserRoles:', error);
      return [];
    }
  },

  async getAllAdminUsers(): Promise<AdminUser[]> {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          id,
          user_id,
          role,
          state,
          district,
          is_member_linked,
          created_at,
          updated_at,
          user:user_id(email)
        `);

      if (error) {
        throw error;
      }

      // Group roles by user
      const userMap = new Map<string, AdminUser>();
      
      data?.forEach((roleData: UserRoleQueryRow) => {
        const userId = roleData.user_id;
        const userEmail = roleData.user?.email;
        
        if (!userMap.has(userId)) {
          userMap.set(userId, {
            id: userId,
            email: userEmail || 'Unknown',
            roles: [],
            member_info: null
          });
        }
        
        const user = userMap.get(userId)!;
        user.roles.push({
          id: roleData.id,
          user_id: roleData.user_id,
          role: roleData.role,
          state: roleData.state,
          district: roleData.district,
          is_member_linked: roleData.is_member_linked,
          created_at: roleData.created_at,
          updated_at: roleData.updated_at
        });
      });

      // Fetch member info for users with member_linked roles
      const usersArray = Array.from(userMap.values());
      for (const user of usersArray) {
        const hasLinkedRole = user.roles.some(role => role.is_member_linked);
        if (hasLinkedRole) {
          const memberInfo = await this.searchMemberByEmail(user.email);
          if (memberInfo) {
            user.member_info = memberInfo;
          }
        }
      }

      return usersArray;
    } catch (error) {
      console.error('Error fetching admin users:', error);
      throw error;
    }
  },

  async searchMemberByEmail(email: string): Promise<{ full_name: string; company_name: string; mobile_number: string } | null> {
    try {
      const { data, error } = await supabase
        .from('member_registrations')
        .select('full_name, company_name, mobile_number')
        .eq('email', email)
        .eq('status', 'approved')
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error searching member by email:', error);
      return null;
    }
  },

  async addUserRole(email: string, role: UserRole['role'], isMemberLinked: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const normalizedEmail = normalizeEmail(email);
      if (!normalizedEmail) {
        return { success: false, error: 'Please enter a valid email address.' };
      }

      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('id')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (fetchError) {
        return { success: false, error: fetchError.message };
      }

      if (!existingUser) {
        return {
          success: false,
          error: 'User must sign up first before an admin role can be assigned.'
        };
      }

      const { data, error: roleError } = await supabase.rpc('add_user_role_with_session', {
        p_session_token: sessionToken,
        p_user_id: existingUser.id,
        p_role: role,
        p_is_member_linked: isMemberLinked
      });

      if (roleError) {
        return { success: false, error: roleError.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to add user role' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error adding user role:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async updateUserRole(roleId: string, updates: Partial<UserRole>): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('update_user_role_with_session', {
        p_session_token: sessionToken,
        p_role_id: roleId,
        p_updates: updates
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to update user role' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating user role:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async removeUserRole(roleId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('remove_user_role_with_session', {
        p_session_token: sessionToken,
        p_role_id: roleId
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to remove user role' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error removing user role:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
};

// States Service
export const statesService = {
  async getAllStates(): Promise<StateMaster[]> {
    try {
      const { data, error } = await supabase
        .from('states_master')
        .select('*')
        .order('state_name');

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching states:', error);
      throw error;
    }
  },

  async getActiveStates(): Promise<StateMaster[]> {
    try {
      const { data, error } = await supabase
        .from('states_master')
        .select('*')
        .eq('is_active', true)
        .order('state_name');

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching active states:', error);
      throw error;
    }
  },

  async getPublicPaymentStates(): Promise<PublicPaymentState[]> {
    try {
      const { data, error } = await supabase
        .from('v_active_payment_settings')
        .select('*')
        .order('state');

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching public payment states:', error);
      throw error;
    }
  },

  async getPublicPaymentStateByName(stateName: string): Promise<PublicPaymentState | null> {
    try {
      const { data, error } = await supabase
        .from('v_active_payment_settings')
        .select('*')
        .eq('state', stateName)
        .maybeSingle();

      if (error) {
        console.error('Error fetching payment state by name:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching payment state by name:', error);
      return null;
    }
  },

  async upsertState(stateName: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('upsert_state_with_session', {
        p_session_token: sessionToken,
        p_state_name: stateName,
        p_is_active: isActive
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to upsert state' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error upserting state:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async updateStateActiveStatus(stateId: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('update_state_active_status_with_session', {
        p_session_token: sessionToken,
        p_state_id: stateId,
        p_is_active: isActive
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to update state status' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating state status:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
};

// Locations Service
export const locationsService = {
  async getActiveDistrictsByStateName(stateName: string): Promise<DistrictOption[]> {
    try {
      const { data, error } = await supabase
        .from('v_active_districts')
        .select('district_id, district_name')
        .eq('state_name', stateName)
        .order('district_name');

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching districts:', error);
      throw error;
    }
  },

  async getActiveCitiesByDistrictId(districtId: string): Promise<CityOption[]> {
    try {
      const { data, error } = await supabase
        .from('cities_master')
        .select('id, city_name')
        .eq('district_id', districtId)
        .eq('status', 'approved')
        .order('city_name');

      if (error) {
        throw error;
      }

      const cities = (data || []).map(city => ({
        city_id: city.id,
        city_name: city.city_name,
        is_popular: false
      }));

      return cities;
    } catch (error) {
      console.error('Error fetching cities:', error);
      throw error;
    }
  },

  async addDistrict(stateId: string, districtName: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('add_district_with_session', {
        p_session_token: sessionToken,
        p_state_id: stateId,
        p_district_name: districtName,
        p_is_active: isActive
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to add district' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error adding district:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async addCity(
    sessionToken: string,
    stateId: string,
    districtId: string,
    cityName: string,
    isPopular: boolean,
    isActive: boolean,
    notes?: string | null
  ): Promise<{ success: boolean; error?: string; city_id?: string; city_name?: string }> {
    try {
      void isActive;
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('admin_add_city_approved_with_session', {
        p_session_token: sessionToken,
        p_city_name: cityName,
        p_state_id: stateId,
        p_district_id: districtId,
        p_notes: notes ?? null,
        p_is_popular: isPopular ?? false
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string; city_id?: string; city_name?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to add city' };
      }

      return { success: true, city_id: result.city_id, city_name: result.city_name };
    } catch (error) {
      console.error('Error adding city:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async updateDistrict(districtId: string, districtName: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('update_district_with_session', {
        p_session_token: sessionToken,
        p_district_id: districtId,
        p_district_name: districtName,
        p_is_active: isActive
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to update district' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating district:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async canDeleteDistrict(districtId: string): Promise<{ canDelete: boolean; reason?: string }> {
    try {
      const { data, error } = await supabase
        .from('cities_master')
        .select('id')
        .eq('district_id', districtId)
        .limit(1);

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        return { canDelete: false, reason: 'District has cities mapped to it' };
      }

      return { canDelete: true };
    } catch (error) {
      console.error('Error checking district deletion:', error);
      return { canDelete: false, reason: 'Error checking dependencies' };
    }
  },

  async deleteDistrictHard(districtId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('delete_district_hard_with_session', {
        p_session_token: sessionToken,
        p_district_id: districtId
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to delete district' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting district:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async toggleDistrictActive(districtId: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('toggle_district_active_with_session', {
        p_session_token: sessionToken,
        p_district_id: districtId,
        p_is_active: isActive
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to update district status' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error toggling district status:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
};

export interface PendingCityListItem {
  key: string;
  pending_city_id?: string;
  other_city_name_normalized: string;
  other_city_name_display: string;
  state_name: string;
  district_name: string;
  state_id: string | null;
  district_id: string | null;
  registrations_count: number;
  associated_records_count?: number;
  latest_created_at: string | null;
}

export interface PendingCityAssociationRecord {
  registration_id: string;
  full_name: string | null;
  email: string | null;
  mobile_number: string | null;
  company_name: string | null;
  status: string | null;
  state: string | null;
  district: string | null;
  city: string | null;
  other_city_name: string | null;
  created_at: string | null;
}

export const adminCitiesService = {
  async listPendingCustomCities(sessionToken: string): Promise<{ success: boolean; items?: PendingCityListItem[]; error?: string }> {
    try {
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('admin_list_pending_cities_with_associations_with_session', {
        p_session_token: sessionToken
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; items?: PendingCityListItem[]; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to load pending cities' };
      }

      return { success: true, items: result.items || [] };
    } catch (error) {
      console.error('Error listing pending custom cities:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async getPendingCityAssociations(
    sessionToken: string,
    pendingCityId: string
  ): Promise<{ success: boolean; items?: PendingCityAssociationRecord[]; count?: number; error?: string }> {
    try {
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('admin_get_pending_city_associations_with_session', {
        p_session_token: sessionToken,
        p_pending_city_id: pendingCityId
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as {
        success: boolean;
        items?: PendingCityAssociationRecord[];
        count?: number;
        error?: string;
      };

      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to load associated records' };
      }

      return {
        success: true,
        items: result.items || [],
        count: typeof result.count === 'number' ? result.count : (result.items?.length ?? 0)
      };
    } catch (error) {
      console.error('Error fetching pending city associations:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async resolvePendingCity(
    sessionToken: string,
    pendingCityId: string,
    finalCityName: string
  ): Promise<{ success: boolean; updatedCount?: number; assignedCityId?: string; assignedCityName?: string; error?: string }> {
    try {
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('admin_resolve_pending_city_with_session', {
        p_session_token: sessionToken,
        p_pending_city_id: pendingCityId,
        p_final_city_name: finalCityName
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as {
        success: boolean;
        updated_count?: number;
        assigned_city_id?: string;
        assigned_city_name?: string;
        error?: string;
      };

      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to resolve pending city' };
      }

      return {
        success: true,
        updatedCount: result.updated_count || 0,
        assignedCityId: result.assigned_city_id,
        assignedCityName: result.assigned_city_name
      };
    } catch (error) {
      console.error('Error resolving pending city:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async assignCustomCity(
    sessionToken: string,
    stateName: string,
    districtName: string,
    otherCityNameNormalized: string,
    approvedCityId: string
  ): Promise<{ success: boolean; updatedCount?: number; assignedCityName?: string; error?: string }> {
    try {
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('admin_assign_custom_city_with_session', {
        p_session_token: sessionToken,
        p_state_name: stateName,
        p_district_name: districtName,
        p_other_city_name_normalized: otherCityNameNormalized,
        p_approved_city_id: approvedCityId
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; updated_count?: number; assigned_city_name?: string; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to assign custom city' };
      }

      return {
        success: true,
        updatedCount: result.updated_count || 0,
        assignedCityName: result.assigned_city_name
      };
    } catch (error) {
      console.error('Error assigning custom city:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
};

export const citiesService = {
  async adminUpdateCity(params: {
    cityId: string;
    cityName: string;
    stateId: string;
    districtId: string;
    notes?: string | null;
    sessionToken: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { cityId, cityName, stateId, districtId, notes, sessionToken } = params;

      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('admin_update_city_with_session', {
        p_session_token: sessionToken,
        p_city_id: cityId,
        p_city_name: cityName,
        p_state_id: stateId,
        p_district_id: districtId,
        p_notes: notes ?? null
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to update city' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating city:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async adminDeleteCity(
    cityId: string,
    sessionToken: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('admin_delete_city_with_session', {
        p_session_token: sessionToken,
        p_city_id: cityId
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to delete city' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting city:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
};

// Organization Profile Service
export const organizationProfileService = {
  async getProfile(): Promise<OrganizationProfile | null> {
    try {
      const { data, error } = await supabase
        .from('organization_profile')
        .select('*')
        .maybeSingle();

      if (error) {
        console.error('Error fetching organization profile:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching organization profile:', error);
      return null;
    }
  },

  async updateProfile(profile: Partial<OrganizationProfile>): Promise<OrganizationProfile | null> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        console.error('Error updating organization profile: User session not found');
        return null;
      }

      const { data, error } = await supabase.rpc('update_organization_profile_with_session', {
        p_session_token: sessionToken,
        p_profile: profile
      });

      if (error) {
        console.error('Error updating organization profile:', error);
        return null;
      }

      const result = data as { success: boolean; error?: string; profile?: OrganizationProfile | null };
      if (!result?.success) {
        console.error('Error updating organization profile:', result?.error || 'RPC returned failure');
        return null;
      }

      return result.profile ?? null;
    } catch (error) {
      console.error('Error updating organization profile:', error);
      return null;
    }
  }
};

// Company Designations Service
export const companyDesignationsService = {
  async getAllDesignations(): Promise<CompanyDesignation[]> {
    try {
      const { data, error } = await supabase
        .from('company_designations')
        .select('*')
        .order('designation_name');

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching company designations:', error);
      throw error;
    }
  },

  async getActiveDesignations(): Promise<CompanyDesignation[]> {
    try {
      const { data, error } = await supabase
        .from('company_designations')
        .select('*')
        .eq('is_active', true)
        .order('designation_name');

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching active designations:', error);
      throw error;
    }
  },

  async addDesignation(designationName: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('create_company_designation_with_session', {
        p_session_token: sessionToken,
        p_designation_name: designationName,
        p_is_active: isActive
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to add designation' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error adding designation:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async createDesignation(designationName: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    return this.addDesignation(designationName, isActive);
  },

  async updateDesignation(id: string, designationName?: string, isActive?: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('update_company_designation_with_session', {
        p_session_token: sessionToken,
        p_designation_id: id,
        p_designation_name: designationName ?? null,
        p_is_active: typeof isActive === 'boolean' ? isActive : null
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to update designation' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating designation:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async deleteDesignation(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('delete_company_designation_with_session', {
        p_session_token: sessionToken,
        p_designation_id: id
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to delete designation' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting designation:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
};

// State Leaders Service
export const stateLeadersService = {
  async getStateLeader(state: string) {
    try {
      const { data, error } = await supabase
        .from('state_leaders')
        .select('*')
        .eq('state', state)
        .maybeSingle();

      if (error) {
        console.error('Error fetching state leader:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching state leader:', error);
      return null;
    }
  }
};

// File Upload Service
export const fileUploadService = {
  async uploadFile(file: File, fileName: string, folder: string = 'uploads'): Promise<string | null> {
    try {
      const filePath = `${folder}/${fileName}`;

      const { error } = await supabase.storage
        .from('public-files')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Upload error:', error);
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('public-files')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading file:', error);
      return null;
    }
  },

  async uploadProfilePhoto(photoBlob: Blob, fileName: string): Promise<string | null> {
    try {
      const filePath = fileName;

      const { error } = await supabase.storage
        .from('member-photos')
        .upload(filePath, photoBlob, {
          cacheControl: '3600',
          upsert: false,
          contentType: 'image/jpeg'
        });

      if (error) {
        console.error('Photo upload error:', error);
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('member-photos')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading profile photo:', error);
      return null;
    }
  },

  async deleteProfilePhoto(photoUrl: string): Promise<boolean> {
    try {
      const fileName = photoUrl.split('/').pop();
      if (!fileName) {
        return false;
      }

      const { error } = await supabase.storage
        .from('member-photos')
        .remove([fileName]);

      if (error) {
        console.error('Photo delete error:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error deleting profile photo:', error);
      return false;
    }
  }
};

// Member Registration Service
export const memberRegistrationService = {
  async checkEmailDuplicate(email: string, excludeMemberId?: string): Promise<{ isDuplicate: boolean; memberName?: string }> {
    try {
      let query = supabase
        .from('member_registrations')
        .select('id, full_name, is_legacy_member')
        .eq('email', email);

      if (excludeMemberId) {
        query = query.neq('id', excludeMemberId);
      }

      const { data, error } = await query.limit(1).maybeSingle();

      if (error) {
        console.error('[checkEmailDuplicate] Error:', error);
        return { isDuplicate: false };
      }

      if (data) {
        return { isDuplicate: true, memberName: data.full_name };
      }

      return { isDuplicate: false };
    } catch (error) {
      console.error('[checkEmailDuplicate] Unexpected error:', error);
      return { isDuplicate: false };
    }
  },

  async checkMobileDuplicate(mobileNumber: string, excludeMemberId?: string): Promise<{ isDuplicate: boolean; memberName?: string }> {
    try {
      let query = supabase
        .from('member_registrations')
        .select('id, full_name, is_legacy_member')
        .eq('mobile_number', mobileNumber);

      if (excludeMemberId) {
        query = query.neq('id', excludeMemberId);
      }

      const { data, error } = await query.limit(1).maybeSingle();

      if (error) {
        console.error('[checkMobileDuplicate] Error:', error);
        return { isDuplicate: false };
      }

      if (data) {
        return { isDuplicate: true, memberName: data.full_name };
      }

      return { isDuplicate: false };
    } catch (error) {
      console.error('[checkMobileDuplicate] Unexpected error:', error);
      return { isDuplicate: false };
    }
  },

  async getAllRegistrations() {
    try {
      const { data, error } = await supabase
        .from('member_registrations')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching member registrations:', error);
      throw error;
    }
  },

  async getRegistrationById(id: string) {
    try {
      const { data, error } = await supabase
        .from('member_registrations')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching registration by ID:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error fetching registration by ID:', error);
      return null;
    }
  },

  async getMyMemberRegistrationByToken(sessionToken: string): Promise<{ data: JsonRecord | null; error: string | null }> {
    try {
      if (!sessionToken) {
        return { data: null, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('get_my_member_registration_by_token', {
        p_session_token: sessionToken
      });

      if (error) {
        console.error('[getMyMemberRegistrationByToken] RPC error:', error);
        return { data: null, error: error.message };
      }

      let row: JsonRecord | null = null;
      if (Array.isArray(data)) {
        row = data.length > 0 ? (data[0] as JsonRecord) : null;
      } else if (data && typeof data === 'object') {
        row = data as JsonRecord;
      }

      return { data: row, error: null };
    } catch (error) {
      console.error('[getMyMemberRegistrationByToken] Unexpected error:', error);
      return { data: null, error: 'An unexpected error occurred' };
    }
  },

  async getSignupPrefillPayloadByToken(
    sessionToken?: string
  ): Promise<{
    data: JsonRecord;
    corePayload: JsonRecord;
    customPayload: JsonRecord;
    submissionCreatedAt: string | null;
    error: string | null;
  }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return {
          data: {},
          corePayload: {},
          customPayload: {},
          submissionCreatedAt: null,
          error: 'User session not found. Please log in again.'
        };
      }

      const { data, error } = await supabase.rpc('get_signup_prefill_payload_with_session', {
        p_session_token: resolvedSessionToken
      });

      if (error) {
        console.error('[getSignupPrefillPayloadByToken] RPC error:', error);
        return {
          data: {},
          corePayload: {},
          customPayload: {},
          submissionCreatedAt: null,
          error: error.message
        };
      }

      const result = (data ?? {}) as SignupPrefillPayloadRpcResult;
      if (!result.success) {
        return {
          data: {},
          corePayload: {},
          customPayload: {},
          submissionCreatedAt: null,
          error: result.error || 'Failed to load signup prefill payload'
        };
      }

      return {
        data: (result.data as JsonRecord) || {},
        corePayload: (result.core_payload as JsonRecord) || {},
        customPayload: (result.custom_payload as JsonRecord) || {},
        submissionCreatedAt: result.submission_created_at ?? null,
        error: null
      };
    } catch (error) {
      console.error('[getSignupPrefillPayloadByToken] Unexpected error:', error);
      return {
        data: {},
        corePayload: {},
        customPayload: {},
        submissionCreatedAt: null,
        error: 'An unexpected error occurred'
      };
    }
  },

  async submitRegistration(
    registrationData: SubmitRegistrationPayload,
    files: {
      gstCertificate: File | null;
      udyamCertificate: File | null;
      paymentProof: File | null;
      profilePhoto?: Blob | null;
    },
    photoFileName?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      let gstCertificateUrl = null;
      let udyamCertificateUrl = null;
      let paymentProofUrl = null;
      let profilePhotoUrl = null;

      if (files.gstCertificate) {
        const fileName = `gst_${Date.now()}_${files.gstCertificate.name}`;
        gstCertificateUrl = await fileUploadService.uploadFile(
          files.gstCertificate,
          fileName,
          'registrations'
        );
      }

      if (files.udyamCertificate) {
        const fileName = `udyam_${Date.now()}_${files.udyamCertificate.name}`;
        udyamCertificateUrl = await fileUploadService.uploadFile(
          files.udyamCertificate,
          fileName,
          'registrations'
        );
      }

      if (files.paymentProof) {
        const fileName = `payment_${Date.now()}_${files.paymentProof.name}`;
        paymentProofUrl = await fileUploadService.uploadFile(
          files.paymentProof,
          fileName,
          'registrations'
        );
      }

      if (files.profilePhoto && photoFileName) {
        profilePhotoUrl = await fileUploadService.uploadProfilePhoto(
          files.profilePhoto,
          photoFileName
        );
        if (!profilePhotoUrl) {
          console.warn('Failed to upload profile photo, continuing without it');
        }
      }

      // Extract user_id before preparing registration data
      const userId = registrationData.user_id;

      if (!userId) {
        console.error('[submitRegistration] Missing user_id in registration data');
        return { success: false, error: 'User ID is required for registration' };
      }

      // Prepare registration data (excluding file URLs and user_id)
      const registrationDataForRpc = { ...registrationData };
      delete registrationDataForRpc.gst_certificate_url;
      delete registrationDataForRpc.udyam_certificate_url;
      delete registrationDataForRpc.payment_proof_url;
      delete registrationDataForRpc.profile_photo_url;
      delete registrationDataForRpc.status;
      delete registrationDataForRpc.is_legacy_member;
      delete registrationDataForRpc.user_id;

      // Ensure is_custom_city has a value
      registrationDataForRpc.is_custom_city = registrationData.is_custom_city ?? false;

      console.log('[submitRegistration] Calling RPC with parameters:', {
        timestamp: new Date().toISOString(),
        userId: userId,
        city: registrationDataForRpc.city,
        other_city_name: registrationDataForRpc.other_city_name,
        is_custom_city: registrationDataForRpc.is_custom_city,
        hasGstCert: !!gstCertificateUrl,
        hasUdyamCert: !!udyamCertificateUrl,
        hasPaymentProof: !!paymentProofUrl,
        hasProfilePhoto: !!profilePhotoUrl
      });

      // Call RPC function to bypass RLS
      const { data, error } = await supabase.rpc('submit_member_registration', {
        p_user_id: userId,
        p_registration_data: registrationDataForRpc,
        p_gst_certificate_url: gstCertificateUrl || null,
        p_udyam_certificate_url: udyamCertificateUrl || null,
        p_payment_proof_url: paymentProofUrl || null,
        p_profile_photo_url: profilePhotoUrl || null
      });

      if (error) {
        console.error('[submitRegistration] RPC error:', error);
        return { success: false, error: error.message };
      }

      console.log('[submitRegistration] RPC response:', data);

      // Parse the JSONB response
      const result = data as { success: boolean; error?: string; registration_id?: string; message?: string };

      if (!result.success) {
        console.error('[submitRegistration] RPC returned failure:', result.error);

        // Handle uniqueness constraint errors with user-friendly messages
        if (result.error?.includes('email')) {
          return { success: false, error: 'This email address is already registered. You can either sign in to your account or register with a different email address.' };
        }

        if (result.error?.includes('mobile')) {
          return { success: false, error: 'This mobile number is already registered. You can either sign in to your account or register with a different mobile number.' };
        }

        return { success: false, error: result.error || 'Failed to submit registration' };
      }

      console.log('[submitRegistration] Registration successful, ID:', result.registration_id);
      return { success: true };
    } catch (error) {
      console.error('[submitRegistration] Unexpected error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async updateMemberRegistration(
    memberId: string,
    updates: JsonRecord,
    sessionToken?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const token = sessionToken || sessionManager.getSessionToken();
      if (!token) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      console.log('[updateMemberRegistration] Calling RPC function with:', {
        memberId,
        updateFields: Object.keys(updates)
      });

      // Prepare updates object - remove system fields that should not be sent
      const updateData = { ...updates };
      delete updateData.id;
      delete updateData.created_at;
      delete updateData.is_legacy_member;
      delete updateData.user_id;
      delete updateData.submission_id;
      delete updateData.last_modified_by;
      delete updateData.last_modified_at;

      // Call SECURITY DEFINER RPC function
      // This bypasses RLS and validates permissions internally
      const { data, error } = await supabase.rpc('update_member_registration_with_session', {
        p_member_id: memberId,
        p_session_token: token,
        p_updates: updateData
      });

      if (error) {
        console.error('[updateMemberRegistration] RPC error:', error);
        return { success: false, error: error.message };
      }

      // Parse the JSONB response
      const result = data as { success: boolean; error?: string; rows_updated?: number };

      if (!result.success) {
        console.error('[updateMemberRegistration] RPC returned failure:', result.error);
        return { success: false, error: result.error || 'Failed to update member' };
      }

      console.log('[updateMemberRegistration] Successfully updated member registration');
      console.log('[updateMemberRegistration] Rows updated:', result.rows_updated);

      return { success: true };
    } catch (error) {
      console.error('[updateMemberRegistration] Unexpected error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async toggleMemberActive(
    memberId: string,
    isActive: boolean,
    sessionToken?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const token = sessionToken || sessionManager.getSessionToken();
      if (!token) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('toggle_member_registration_active_with_session', {
        p_member_id: memberId,
        p_session_token: token,
        p_is_active: isActive
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to update member status' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error toggling member active status:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async softDeleteMember(
    memberId: string,
    deletionReason: string,
    sessionToken: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('admin_soft_delete_member_with_session', {
        p_registration_id: memberId,
        p_session_token: sessionToken,
        p_reason: deletionReason || null,
      });

      if (error) {
        return { success: false, error: error.message || 'Failed to delete member' };
      }

      const result = data as { success: boolean; error?: string; deleted_id?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to delete member' };
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete member';
      return { success: false, error: message };
    }
  },

  async updateStatusWithReason(
    memberId: string,
    status: 'approved' | 'rejected',
    sessionToken: string,
    rejectionReason?: string
  ): Promise<{ success: boolean; error?: string; data?: JsonRecord }> {
    try {
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      // ALWAYS pass all 4 parameters to avoid PostgREST function overload ambiguity
      // PostgREST/Supabase does not properly support function overloading
      // Conditionally including/excluding parameters causes "cannot pass more than 100 arguments" error
      const rpcParams = {
        p_registration_id: memberId,
        p_session_token: sessionToken,
        p_new_status: status,
        p_rejection_reason: rejectionReason || null
      };

      console.log('[updateStatusWithReason] Calling RPC with parameters:', rpcParams);

      // Call SECURITY DEFINER RPC function
      // This bypasses RLS and validates permissions internally
      // NOTE: This uses the session-token wrapper to keep browser callers off the legacy UUID-based signature
      const { data, error } = await supabase.rpc('update_member_registration_status_with_session', rpcParams);

      if (error) {
        console.error('[updateStatusWithReason] RPC error:', error);
        return { success: false, error: error.message };
      }

      // Parse the JSONB response
      const result = data as UpdateStatusResult;

      if (!result.success) {
        console.error('[updateStatusWithReason] RPC returned failure:', result.error);
        return { success: false, error: result.error || 'Failed to update status' };
      }

      console.log('[updateStatusWithReason] Successfully updated registration status');

      return { success: true, data: result.registration };
    } catch (error) {
      console.error('[updateStatusWithReason] Unexpected error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async getApplicationDetails(applicationId: string, sessionToken: string): Promise<{ success: boolean; data?: MemberRegistrationRpcRow; error?: string }> {
    try {
      if (!sessionToken) {
        console.error('[getApplicationDetails] Session token not found');
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      console.log('[getApplicationDetails] Fetching registration:', applicationId);

      // Call RPC function to bypass RLS
      const { data, error } = await supabase.rpc('get_admin_member_registration_by_id_with_session', {
        p_session_token: sessionToken,
        p_registration_id: applicationId
      });

      if (error) {
        console.error('[getApplicationDetails] RPC error:', error);
        return { success: false, error: error.message };
      }

      // RPC returns an array (SETOF), take the first item
      const registration = Array.isArray(data) && data.length > 0
        ? (data[0] as MemberRegistrationRpcRow)
        : null;

      if (!registration) {
        return { success: false, error: 'Application not found' };
      }

      // Transform data to match expected structure (RPC returns flat data with company_designation_name)
      const transformedData = {
        ...registration,
        company_designations: registration.company_designation_name
          ? { designation_name: registration.company_designation_name }
          : null
      };

      console.log('[getApplicationDetails] Successfully fetched registration');
      return { success: true, data: transformedData };
    } catch (error) {
      console.error('[getApplicationDetails] Unexpected error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async markApplicationAsViewed(
    applicationId: string,
    sessionToken: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('admin_mark_member_registration_viewed_with_session', {
        p_application_id: applicationId,
        p_session_token: sessionToken
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to mark application as viewed' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error marking application as viewed:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async getApprovedMembersExport(
    sessionToken?: string
  ): Promise<{ success: boolean; data?: ApprovedMemberExportRow[]; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('get_admin_approved_members_export_with_session', {
        p_session_token: resolvedSessionToken,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = (data ?? null) as ApprovedMembersExportRpcResult | null;
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to load approved members export' };
      }

      const rows = Array.isArray(result.data) ? result.data.map(mapApprovedMemberExportRow) : [];
      return { success: true, data: rows };
    } catch (error) {
      console.error('[getApprovedMembersExport] Unexpected error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
};

// LUB Roles Service
export const lubRolesService = {
  async getAllRoles(): Promise<LubRole[]> {
    try {
      const { data, error } = await supabase
        .from('lub_roles_master')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching LUB roles:', error);
      throw error;
    }
  },

  async getActiveRoles(): Promise<LubRole[]> {
    try {
      const { data, error } = await supabase
        .from('lub_roles_master')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching active LUB roles:', error);
      throw error;
    }
  },

  async addRole(roleName: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('create_lub_role_with_session', {
        p_session_token: sessionToken,
        p_role_name: roleName,
        p_is_active: isActive
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to add LUB role' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error adding LUB role:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async createRole(roleName: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    return this.addRole(roleName, isActive);
  },

  async updateRole(id: string, roleName: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('update_lub_role_with_session', {
        p_session_token: sessionToken,
        p_role_id: id,
        p_role_name: roleName,
        p_is_active: isActive
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to update LUB role' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating LUB role:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async deleteRole(id: string): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('delete_lub_role_with_session', {
        p_session_token: sessionToken,
        p_role_id: id
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to delete LUB role' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting LUB role:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async updateDisplayOrder(roleId: string, newOrder: number): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('update_lub_role_display_order_with_session', {
        p_session_token: sessionToken,
        p_role_id: roleId,
        p_display_order: newOrder
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to update display order' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating display order:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async reorderRoles(params: { roleIdsInOrder: string[] }): Promise<{ success: boolean; error?: string; updated_count?: number }> {
    try {
      const { roleIdsInOrder } = params;

      if (!roleIdsInOrder || roleIdsInOrder.length === 0) {
        console.error('[lubRolesService.reorderRoles] Missing or empty roleIdsInOrder');
        return { success: false, error: 'Role IDs are required' };
      }

      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      console.log('[lubRolesService.reorderRoles] Sending new order:', roleIdsInOrder);

      const { data, error } = await supabase.rpc('admin_reorder_lub_roles_with_session', {
        p_session_token: sessionToken,
        p_role_ids: roleIdsInOrder
      });

      if (error) {
        console.error('[lubRolesService.reorderRoles] RPC error:', error);
        console.error('[lubRolesService.reorderRoles] Error details:', {
          message: error.message,
          code: error.code,
          hint: error.hint,
          details: error.details
        });
        return { success: false, error: error.message };
      }

      if (!data || data.success !== true) {
        const errorMsg = data?.error || 'Unknown error reordering roles';
        console.error('[lubRolesService.reorderRoles] RPC returned error:', errorMsg);
        return { success: false, error: errorMsg };
      }

      console.log('[lubRolesService.reorderRoles] Successfully reordered roles:', data);
      return {
        success: true,
        updated_count: data.updated_count
      };
    } catch (error) {
      console.error('[lubRolesService.reorderRoles] Exception:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
};

// ─── Registration Draft (Smart Upload temp persist) ─────────────────────────

export type RegistrationDraftDocStatus =
  | 'pending'
  | 'extracting'
  | 'extracted'
  | 'unreadable'
  | 'failed'
  | 'skipped'
  | 'no_document';

export type RegistrationDraftExpectedDocType =
  | 'gst_certificate'
  | 'udyam_certificate'
  | 'pan_card'
  | 'aadhaar_card'
  | 'payment_proof';

export interface RegistrationDraftDocumentRow {
  id: string;
  expected_doc_type: RegistrationDraftExpectedDocType;
  detected_doc_type: string | null;
  status: RegistrationDraftDocStatus;
  reason_code: string | null;
  is_extract_only: boolean;
  storage_path: string | null;
  file_mime: string | null;
  file_size_bytes: number | null;
  original_filename: string | null;
  extracted_fields: Record<string, unknown>;
  field_options: Record<string, unknown>;
  selected_options: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RegistrationDraftRow {
  id: string;
  status: 'in_progress' | 'finalized' | 'expired';
  last_activity_at: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface RegistrationDraftFetchResult {
  success: boolean;
  draft: RegistrationDraftRow | null;
  documents: RegistrationDraftDocumentRow[];
  error?: string;
  errorCode?: string;
}

export interface RegistrationDraftSaveDocumentInput {
  expectedDocType: RegistrationDraftExpectedDocType;
  status: RegistrationDraftDocStatus;
  detectedDocType?: string | null;
  reasonCode?: string | null;
  isExtractOnly?: boolean;
  storagePath?: string | null;
  fileMime?: string | null;
  fileSizeBytes?: number | null;
  originalFilename?: string | null;
  extractedFields?: Record<string, unknown>;
  fieldOptions?: Record<string, unknown>;
  selectedOptions?: Record<string, unknown>;
}

export interface RegistrationDraftSaveDocumentResult {
  success: boolean;
  draftId?: string;
  documentId?: string;
  expiresAt?: string;
  error?: string;
  errorCode?: string;
}

export interface RegistrationDraftUploadResult {
  success: boolean;
  draftId?: string;
  documentId?: string;
  expiresAt?: string;
  storagePath?: string;
  fileMime?: string | null;
  fileSizeBytes?: number;
  originalFilename?: string;
  error?: string;
  errorCode?: string;
}

export interface RegistrationDraftDeleteResult {
  success: boolean;
  releasedStoragePath: string | null;
  error?: string;
}

const DRAFT_UPLOAD_FUNCTION_PATH = '/functions/v1/registration-draft-upload';
const DRAFT_DELETE_FUNCTION_PATH = '/functions/v1/registration-draft-delete';

const SUPABASE_FUNCTION_BASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');

function buildFunctionUrl(path: string): string {
  if (!SUPABASE_FUNCTION_BASE_URL) {
    throw new Error('VITE_SUPABASE_URL is not configured');
  }
  return `${SUPABASE_FUNCTION_BASE_URL}${path}`;
}

export const registrationDraftService = {
  async getDraft(): Promise<RegistrationDraftFetchResult> {
    const sessionToken = sessionManager.getSessionToken();
    if (!sessionToken) {
      return { success: false, draft: null, documents: [], errorCode: 'invalid_session', error: 'No session' };
    }
    try {
      const { data, error } = await supabase.rpc('get_registration_draft_with_session', {
        p_session_token: sessionToken,
      });
      if (error) {
        console.error('[registrationDraftService.getDraft] RPC error:', error);
        return { success: false, draft: null, documents: [], error: error.message };
      }
      const payload = (data ?? {}) as {
        success?: boolean;
        global_error_code?: string;
        global_error?: string;
        draft?: RegistrationDraftRow | null;
        documents?: RegistrationDraftDocumentRow[];
      };
      if (!payload.success) {
        return {
          success: false,
          draft: null,
          documents: [],
          errorCode: payload.global_error_code,
          error: payload.global_error,
        };
      }
      return {
        success: true,
        draft: payload.draft ?? null,
        documents: Array.isArray(payload.documents) ? payload.documents : [],
      };
    } catch (err) {
      console.error('[registrationDraftService.getDraft] Exception:', err);
      return { success: false, draft: null, documents: [], error: 'Unexpected error' };
    }
  },

  async saveDocument(input: RegistrationDraftSaveDocumentInput): Promise<RegistrationDraftSaveDocumentResult> {
    const sessionToken = sessionManager.getSessionToken();
    if (!sessionToken) {
      return { success: false, errorCode: 'invalid_session', error: 'No session' };
    }
    try {
      const { data, error } = await supabase.rpc(
        'save_registration_draft_document_with_session',
        {
          p_session_token: sessionToken,
          p_expected_doc_type: input.expectedDocType,
          p_status: input.status,
          p_detected_doc_type: input.detectedDocType ?? null,
          p_reason_code: input.reasonCode ?? null,
          p_is_extract_only: input.isExtractOnly ?? false,
          p_storage_path: input.storagePath ?? null,
          p_file_mime: input.fileMime ?? null,
          p_file_size_bytes: input.fileSizeBytes ?? null,
          p_original_filename: input.originalFilename ?? null,
          p_extracted_fields: input.extractedFields ?? {},
          p_field_options: input.fieldOptions ?? {},
          p_selected_options: input.selectedOptions ?? {},
        },
      );
      if (error) {
        console.error('[registrationDraftService.saveDocument] RPC error:', error);
        return { success: false, error: error.message };
      }
      const payload = (data ?? {}) as {
        success?: boolean;
        global_error_code?: string;
        global_error?: string;
        draft_id?: string;
        document_id?: string;
        expires_at?: string;
      };
      if (!payload.success) {
        return {
          success: false,
          errorCode: payload.global_error_code,
          error: payload.global_error,
        };
      }
      return {
        success: true,
        draftId: payload.draft_id,
        documentId: payload.document_id,
        expiresAt: payload.expires_at,
      };
    } catch (err) {
      console.error('[registrationDraftService.saveDocument] Exception:', err);
      return { success: false, error: 'Unexpected error' };
    }
  },

  async uploadDocumentFile(
    expectedDocType: RegistrationDraftExpectedDocType,
    file: File,
  ): Promise<RegistrationDraftUploadResult> {
    const sessionToken = sessionManager.getSessionToken();
    if (!sessionToken) {
      return { success: false, errorCode: 'invalid_session', error: 'No session' };
    }
    try {
      const formData = new FormData();
      formData.append('session_token', sessionToken);
      formData.append('expected_doc_type', expectedDocType);
      formData.append('file', file, file.name);

      const response = await fetch(buildFunctionUrl(DRAFT_UPLOAD_FUNCTION_PATH), {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json().catch(() => ({})) as {
        success?: boolean;
        error?: string;
        error_code?: string;
        draft_id?: string;
        document_id?: string;
        expires_at?: string;
        storage_path?: string;
        file_mime?: string | null;
        file_size_bytes?: number;
        original_filename?: string;
      };
      if (!response.ok || !payload.success) {
        return {
          success: false,
          errorCode: payload.error_code,
          error: payload.error ?? `HTTP ${response.status}`,
        };
      }
      return {
        success: true,
        draftId: payload.draft_id,
        documentId: payload.document_id,
        expiresAt: payload.expires_at,
        storagePath: payload.storage_path,
        fileMime: payload.file_mime,
        fileSizeBytes: payload.file_size_bytes,
        originalFilename: payload.original_filename,
      };
    } catch (err) {
      console.error('[registrationDraftService.uploadDocumentFile] Exception:', err);
      return { success: false, error: 'Unexpected error' };
    }
  },

  async deleteDocument(documentId: string): Promise<RegistrationDraftDeleteResult> {
    const sessionToken = sessionManager.getSessionToken();
    if (!sessionToken) {
      return { success: false, releasedStoragePath: null, error: 'No session' };
    }
    try {
      const response = await fetch(buildFunctionUrl(DRAFT_DELETE_FUNCTION_PATH), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_token: sessionToken,
          document_id: documentId,
        }),
      });
      const payload = await response.json().catch(() => ({})) as {
        success?: boolean;
        error?: string;
        released_storage_path?: string | null;
      };
      if (!response.ok || !payload.success) {
        return {
          success: false,
          releasedStoragePath: payload.released_storage_path ?? null,
          error: payload.error ?? `HTTP ${response.status}`,
        };
      }
      return {
        success: true,
        releasedStoragePath: payload.released_storage_path ?? null,
      };
    } catch (err) {
      console.error('[registrationDraftService.deleteDocument] Exception:', err);
      return { success: false, releasedStoragePath: null, error: 'Unexpected error' };
    }
  },
};

// ─── Bulk Assignment Types ────────────────────────────────────────────────────

export interface MemberRoleAssignmentBulkSkip {
  member_id: string;
  reason_code: string;
  reason: string;
}

export interface MemberRoleAssignmentBulkResult {
  success: boolean;
  addedCount: number;
  skippedCount: number;
  addedMemberIds: string[];
  skipped: MemberRoleAssignmentBulkSkip[];
  error?: string;
}

// Member LUB Role Assignments Service
export const memberLubRolesService = {
  async getAllAssignments(params: { search?: string }): Promise<MemberLubRoleAssignment[]> {
    try {
      const { search } = params;
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        throw new Error('User session not found. Please log in again.');
      }

      const { data, error } = await supabase.rpc('admin_get_member_lub_role_assignments_with_session', {
        p_session_token: sessionToken,
        p_search: search || null
      });

      if (error) {
        console.error('[memberLubRolesService.getAllAssignments] RPC error:', error);
        console.error('[memberLubRolesService.getAllAssignments] Error details:', {
          message: error.message,
          code: error.code,
          hint: error.hint,
          details: error.details
        });
        throw error;
      }

      if (!data) {
        console.log('[memberLubRolesService.getAllAssignments] No data returned from RPC');
        return [];
      }

      // Map RPC result to match interface
      const mappedData = data.map((row: MemberLubRoleAssignmentRpcRow) => ({
        id: row.assignment_id,
        member_id: row.member_id,
        role_id: row.lub_role_id,
        level: row.level,
        state: row.state,
        district: row.district,
        committee_year: row.committee_year,
        role_start_date: row.role_start_date,
        role_end_date: row.role_end_date,
        created_at: row.created_at,
        updated_at: row.updated_at,
        member_name: row.member_full_name,
        member_email: row.member_email,
        role_name: row.lub_role_name,
        lub_role_display_order: row.lub_role_display_order ?? null,
        member_registrations: {
          full_name: row.member_full_name,
          company_name: row.member_company_name,
          email: row.member_email,
          mobile_number: row.member_mobile_number
        },
        lub_roles_master: {
          role_name: row.lub_role_name
        }
      }));

      console.log(`[memberLubRolesService.getAllAssignments] Successfully loaded ${mappedData.length} assignments via RPC`);
      return mappedData;
    } catch (error) {
      console.error('[memberLubRolesService.getAllAssignments] Exception:', error);
      throw error;
    }
  },

  async createAssignment(params: {
    member_id: string;
    role_id: string;
    level: 'national' | 'state' | 'district' | 'city';
    state?: string;
    district?: string;
    role_start_date?: string | null;
    role_end_date?: string | null;
    committee_year: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      if (params.committee_year && !/^\d{4}$/.test(params.committee_year)) {
        return { success: false, error: 'Committee year must be a 4-digit year (e.g., 2025)' };
      }

      if (params.role_start_date && params.role_end_date) {
        const startDate = new Date(params.role_start_date);
        const endDate = new Date(params.role_end_date);
        if (endDate < startDate) {
          return { success: false, error: 'Period To date cannot be before Period From date' };
        }
      }

      const { data, error } = await supabase
        .rpc('admin_assign_member_lub_role_with_session', {
          p_session_token: sessionToken,
          p_member_id: params.member_id,
          p_role_id: params.role_id,
          p_level: params.level,
          p_state: params.state || null,
          p_district: params.district || null,
          p_role_start_date: params.role_start_date || null,
          p_role_end_date: params.role_end_date || null,
          p_committee_year: params.committee_year || null
        });

      if (error) {
        console.error('Database error adding member LUB role assignment:', error);
        return { success: false, error: error.message };
      }

      if (data && !data.success) {
        console.error('RPC error adding member LUB role assignment:', data.error);
        return { success: false, error: data.error };
      }

      return { success: true };
    } catch (error) {
      console.error('Error adding member LUB role assignment:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async updateAssignment(params: {
    id: string;
    role_id: string;
    level: 'national' | 'state' | 'district' | 'city';
    state?: string;
    district?: string;
    committee_year?: string;
    role_start_date?: string | null;
    role_end_date?: string | null;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { id, role_id, level, state, district, committee_year, role_start_date, role_end_date } = params;

      if (!id) {
        console.error('[memberLubRolesService.updateAssignment] Missing assignment ID');
        return { success: false, error: 'Assignment ID is required' };
      }

      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('admin_update_member_lub_role_assignment_with_session', {
        p_session_token: sessionToken,
        p_assignment_id: id,
        p_role_id: role_id,
        p_level: level,
        p_state: state || null,
        p_district: district || null,
        p_committee_year: committee_year || null,
        p_role_start_date: role_start_date || null,
        p_role_end_date: role_end_date || null
      });

      if (error) {
        console.error('[memberLubRolesService.updateAssignment] RPC error:', error);
        console.error('[memberLubRolesService.updateAssignment] Error details:', {
          message: error.message,
          code: error.code,
          hint: error.hint,
          details: error.details
        });
        return { success: false, error: error.message };
      }

      if (!data || data.success !== true) {
        const errorMsg = data?.error || 'Unknown error updating assignment';
        console.error('[memberLubRolesService.updateAssignment] RPC returned error:', errorMsg);
        return { success: false, error: errorMsg };
      }

      console.log('[memberLubRolesService.updateAssignment] Successfully updated assignment:', id);
      return { success: true };
    } catch (error) {
      console.error('[memberLubRolesService.updateAssignment] Exception:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async deleteAssignment(params: { assignmentId: string }): Promise<{ success: boolean; error?: string }> {
    try {
      const { assignmentId } = params;

      if (!assignmentId) {
        console.error('[memberLubRolesService.deleteAssignment] Missing assignmentId');
        return { success: false, error: 'Assignment ID is required' };
      }

      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('admin_delete_member_lub_role_assignment_with_session', {
        p_session_token: sessionToken,
        p_assignment_id: assignmentId
      });

      if (error) {
        console.error('[memberLubRolesService.deleteAssignment] RPC error:', error);
        console.error('[memberLubRolesService.deleteAssignment] Error details:', {
          message: error.message,
          code: error.code,
          hint: error.hint,
          details: error.details
        });
        return { success: false, error: error.message };
      }

      if (!data || data.success !== true) {
        const errorMsg = data?.error || 'Unknown error deleting assignment';
        console.error('[memberLubRolesService.deleteAssignment] RPC returned error:', errorMsg);
        return { success: false, error: errorMsg };
      }

      console.log('[memberLubRolesService.deleteAssignment] Successfully deleted assignment:', assignmentId);
      return { success: true };
    } catch (error) {
      console.error('[memberLubRolesService.deleteAssignment] Exception:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async searchMembers(searchTerm: string): Promise<Array<{ id: string; full_name: string; company_name: string; email: string; city: string; district: string }>> {
    try {
      const { data, error } = await supabase
        .from('member_registrations')
        .select('id, full_name, company_name, email, city, district')
        .eq('status', 'approved')
        .or(`full_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,company_name.ilike.%${searchTerm}%`)
        .limit(10);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error searching members:', error);
      return [];
    }
  },

  async createAssignmentsBulk(params: {
    member_ids: string[];
    role_id: string;
    level: 'national' | 'state' | 'district' | 'city';
    state?: string;
    district?: string;
    role_start_date?: string | null;
    role_end_date?: string | null;
    committee_year?: string;
  }): Promise<MemberRoleAssignmentBulkResult> {
    const empty: MemberRoleAssignmentBulkResult = {
      success: false,
      addedCount: 0,
      skippedCount: 0,
      addedMemberIds: [],
      skipped: [],
    };

    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { ...empty, error: 'User session not found. Please log in again.' };
      }

      if (params.member_ids.length === 0) {
        return { ...empty, error: 'At least one member must be selected.' };
      }

      if (params.member_ids.length > 50) {
        return { ...empty, error: 'Cannot assign more than 50 members at once.' };
      }

      if (params.committee_year && !/^\d{4}$/.test(params.committee_year)) {
        return { ...empty, error: 'Committee year must be a 4-digit year (e.g., 2025)' };
      }

      if (params.role_start_date && params.role_end_date) {
        if (new Date(params.role_end_date) < new Date(params.role_start_date)) {
          return { ...empty, error: 'Period To date cannot be before Period From date' };
        }
      }

      const { data, error } = await supabase.rpc('admin_assign_member_lub_roles_bulk_with_session', {
        p_session_token:   sessionToken,
        p_member_ids:      params.member_ids,
        p_role_id:         params.role_id,
        p_level:           params.level,
        p_state:           params.state || null,
        p_district:        params.district || null,
        p_role_start_date: params.role_start_date || null,
        p_role_end_date:   params.role_end_date || null,
        p_committee_year:  params.committee_year || null,
      });

      if (error) {
        console.error('[memberLubRolesService.createAssignmentsBulk] RPC error:', error);
        return { ...empty, error: error.message };
      }

      if (!data || data.success === false) {
        const errorMsg = (data?.global_error as string | undefined) || 'Unknown error during bulk assignment';
        console.error('[memberLubRolesService.createAssignmentsBulk] RPC returned error:', errorMsg);
        return { ...empty, error: errorMsg };
      }

      return {
        success:        true,
        addedCount:     (data.added_count as number)   ?? 0,
        skippedCount:   (data.skipped_count as number) ?? 0,
        addedMemberIds: (data.added_member_ids as string[]) ?? [],
        skipped:        (data.skipped as MemberRoleAssignmentBulkSkip[]) ?? [],
      };
    } catch (error) {
      console.error('[memberLubRolesService.createAssignmentsBulk] Exception:', error);
      return { ...empty, error: 'An unexpected error occurred' };
    }
  }
};

// Directory Field Visibility Service
export interface DirectoryFieldVisibility {
  id: string;
  field_name: string;
  field_label: string;
  show_to_public: boolean;
  show_to_members: boolean;
  created_at: string;
  updated_at: string;
}

export const directoryVisibilityService = {
  async getAllFieldSettings(): Promise<DirectoryFieldVisibility[]> {
    try {
      const { data, error } = await supabase
        .from('directory_field_visibility')
        .select('*')
        .order('field_label');

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching field visibility settings:', error);
      throw error;
    }
  },

  async updateFieldVisibility(
    fieldName: string,
    showToPublic: boolean,
    showToMembers: boolean
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('update_field_visibility_with_session', {
        p_session_token: sessionToken,
        p_field_name: fieldName,
        p_show_to_public: showToPublic,
        p_show_to_members: showToMembers
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to update field visibility' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating field visibility:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async updateMultipleFieldVisibilities(
    updates: Array<{ field_name: string; show_to_public: boolean; show_to_members: boolean }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('update_multiple_field_visibilities_with_session', {
        p_session_token: sessionToken,
        p_updates: updates
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to update field visibilities' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating multiple field visibilities:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
};

// URL utilities
export const urlUtils = {
  generateMemberUrl(id: string, companyName: string, fullName: string): string {
    const companySlug = companyName.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);

    const nameSlug = fullName.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);

    return `/member/${id}/${companySlug}/${nameSlug}`;
  },

  async checkEmailExists(email: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('member_registrations')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (error) {
        console.error('Error checking email:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('Error checking email:', error);
      return false;
    }
  },

  async checkMobileExists(mobileNumber: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('member_registrations')
        .select('id')
        .eq('mobile_number', mobileNumber)
        .maybeSingle();

      if (error) {
        console.error('Error checking mobile number:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('Error checking mobile number:', error);
      return false;
    }
  }
};

export const formFieldConfigService = {
  async getAllFieldConfigurations(): Promise<FormFieldConfiguration[]> {
    try {
      const { data, error } = await supabase
        .from('form_field_configurations')
        .select(`
          *,
          validation_rule:validation_rules(
            id,
            rule_name,
            rule_type,
            category,
            validation_pattern,
            error_message,
            description,
            is_active,
            display_order
          )
        `)
        .eq('is_system_field', false)
        .order('section_name')
        .order('display_order');

      if (error) {
        console.error('Error fetching field configurations:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAllFieldConfigurations:', error);
      throw error;
    }
  },

  async getFieldConfigurationsBySection(): Promise<Record<string, FormFieldConfiguration[]>> {
    try {
      const configs = await this.getAllFieldConfigurations();

      const grouped: Record<string, FormFieldConfiguration[]> = {};
      configs.forEach(config => {
        if (!grouped[config.section_name]) {
          grouped[config.section_name] = [];
        }
        grouped[config.section_name].push(config);
      });

      return grouped;
    } catch (error) {
      console.error('Error in getFieldConfigurationsBySection:', error);
      throw error;
    }
  },

  async updateFieldVisibility(
    fieldName: string,
    isVisible: boolean,
    userId?: string
  ): Promise<{ success: boolean; error?: string }> {
    void userId;
    return this.updateFieldConfiguration(fieldName, { is_visible: isVisible });
  },

  async updateFieldRequired(
    fieldName: string,
    isRequired: boolean,
    userId?: string
  ): Promise<{ success: boolean; error?: string }> {
    void userId;
    return this.updateFieldConfiguration(fieldName, { is_required: isRequired });
  },

  async updateFieldConfiguration(
    fieldName: string,
    updates: Partial<FormFieldConfiguration>,
    sessionToken?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('[updateFieldConfiguration] Starting update for field:', fieldName);
      console.log('[updateFieldConfiguration] Updates:', updates);

      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();

      console.log('[updateFieldConfiguration] Session token present:', !!resolvedSessionToken);

      if (!resolvedSessionToken) {
        console.error('[updateFieldConfiguration] No session token found');
        return { success: false, error: 'User not authenticated' };
      }

      // Extract is_visible and is_required from updates
      // Default to true for is_visible and false for is_required if not provided
      const isVisible = updates.is_visible !== undefined ? updates.is_visible : true;
      const isRequired = updates.is_required !== undefined ? updates.is_required : false;

      console.log('[updateFieldConfiguration] Calling RPC with params:', {
        p_field_name: fieldName,
        p_is_visible: isVisible,
        p_is_required: isRequired,
        p_session_token: resolvedSessionToken
      });

      // Call RPC function instead of direct update
      const { data, error } = await supabase
        .rpc('update_form_field_configuration_with_session', {
          p_field_name: fieldName,
          p_is_visible: isVisible,
          p_is_required: isRequired,
          p_session_token: resolvedSessionToken
        });

      if (error) {
        console.error('[updateFieldConfiguration] RPC error:', error);
        return { success: false, error: error.message };
      }

      console.log('[updateFieldConfiguration] RPC response:', data);

      // Parse RPC response
      const result = data as { success: boolean; error?: string; rows_updated?: number };

      if (!result.success) {
        console.error('[updateFieldConfiguration] RPC returned failure:', result.error);
        return { success: false, error: result.error || 'Update failed' };
      }

      console.log('[updateFieldConfiguration] Update successful');
      return { success: true };
    } catch (error) {
      console.error('[updateFieldConfiguration] Exception caught:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async updateDisplayOrders(
    updates: Array<{ field_name: string; display_order: number }>,
    userId?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      void userId;
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User not authenticated' };
      }

      const { data, error } = await supabase.rpc('update_form_field_display_orders_with_session', {
        p_session_token: sessionToken,
        p_updates: updates
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to update display orders' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating display orders:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async resetToDefaults(sessionToken?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();

      if (!resolvedSessionToken) {
        return { success: false, error: 'User not authenticated' };
      }

      const { data, error } = await supabase.rpc('reset_form_field_configuration_defaults_with_session', {
        p_session_token: resolvedSessionToken
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to reset configuration' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error resetting to defaults:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
};

interface FormConfigV2FieldRpcRow extends Omit<FormConfigV2Field, 'option_items'> {
  option_items?: unknown;
}

interface SignupFormFieldV2RpcRow extends Omit<SignupFormFieldV2, 'option_items' | 'form_key'> {
  form_key: string;
  option_items?: unknown;
}

interface SigninFormFieldV2RpcRow extends Omit<SigninFormFieldV2, 'option_items' | 'form_key'> {
  form_key: string;
  option_items?: unknown;
}

interface JoinFormFieldV2RpcRow extends Omit<JoinFormFieldV2, 'option_items' | 'form_key'> {
  form_key: string;
  option_items?: unknown;
}

interface MemberEditFormFieldV2RpcRow extends Omit<MemberEditFormFieldV2, 'option_items' | 'form_key'> {
  form_key: string;
  option_items?: unknown;
}

type FormConfigV2FormSummaryRpcRow = FormConfigV2FormSummary;
type FormBuilderV2FormSummaryRpcRow = FormBuilderV2FormSummary;

interface FormLivePublishStatusRpcRow {
  form_id: string;
  form_key: string;
  form_name: string;
  live_published_at?: string | null;
  live_published_by?: string | null;
  live_published_by_email?: string | null;
  live_publish_origin?: string | null;
}

interface FormBuilderSchemaFieldV2RpcRow {
  form_id: string;
  id?: string | null;
  form_key: string;
  form_name: string;
  description?: string | null;
  is_active: boolean;
  live_published_at?: string | null;
  live_published_by?: string | null;
  live_published_by_email?: string | null;
  live_publish_origin?: string | null;
  field_key?: string | null;
  label?: string | null;
  field_type?: SignupV2FieldType | null;
  section_name?: string | null;
  placeholder?: string | null;
  help_text?: string | null;
  option_items?: unknown;
  min_length?: number | null;
  max_length?: number | null;
  default_value?: string | null;
  is_visible?: boolean | null;
  is_required?: boolean | null;
  is_locked?: boolean | null;
  is_system_field?: boolean | null;
  display_order?: number | null;
  validation_rule_id?: string | null;
  library_is_archived?: boolean | null;
}

interface FieldLibraryItemV2RpcRow extends Omit<FieldLibraryItemV2, 'option_items'> {
  option_items?: unknown;
}

const AI_PROVIDER_VALUES: AIProvider[] = ['openai', 'google', 'anthropic', 'azure_openai', 'custom'];
const AI_RUNTIME_REASONING_VALUES: AIRuntimeReasoningEffort[] = ['low', 'medium', 'high', 'xhigh'];
const PORTAL_DATE_FORMAT_VALUES: PortalDateFormat[] = ['dd-mm-yyyy', 'mm-dd-yyyy', 'yyyy-mm-dd', 'dd-mmm-yyyy'];
const PORTAL_TIME_FORMAT_VALUES: PortalTimeFormat[] = ['12h', '24h'];

const normalizeAIProvider = (value: unknown): AIProvider => {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (AI_PROVIDER_VALUES.includes(candidate as AIProvider)) {
    return candidate as AIProvider;
  }
  return 'openai';
};

const normalizeAIRuntimeReasoningEffort = (value: unknown): AIRuntimeReasoningEffort | null => {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (AI_RUNTIME_REASONING_VALUES.includes(candidate as AIRuntimeReasoningEffort)) {
    return candidate as AIRuntimeReasoningEffort;
  }
  return null;
};

const normalizePortalDateFormat = (value: unknown): PortalDateFormat => {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (PORTAL_DATE_FORMAT_VALUES.includes(candidate as PortalDateFormat)) {
    return candidate as PortalDateFormat;
  }
  return 'dd-mm-yyyy';
};

const normalizePortalTimeFormat = (value: unknown): PortalTimeFormat => {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (PORTAL_TIME_FORMAT_VALUES.includes(candidate as PortalTimeFormat)) {
    return candidate as PortalTimeFormat;
  }
  return '12h';
};

const mapAIRuntimeSettings = (raw: unknown): AIRuntimeSettings => {
  const row = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  return {
    setting_key: typeof row.setting_key === 'string' && row.setting_key.trim() !== ''
      ? row.setting_key
      : 'member_normalization',
    provider: normalizeAIProvider(row.provider),
    model: typeof row.model === 'string' && row.model.trim() !== ''
      ? row.model
      : 'gpt-4o-mini',
    reasoning_effort: normalizeAIRuntimeReasoningEffort(row.reasoning_effort),
    is_enabled: Boolean(row.is_enabled),
    has_api_key: Boolean(row.has_api_key),
    api_key_masked: typeof row.api_key_masked === 'string' ? row.api_key_masked : null,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
    updated_by_email: typeof row.updated_by_email === 'string' ? row.updated_by_email : null,
    live_updated_via: typeof row.live_updated_via === 'string' ? row.live_updated_via : null
  };
};

const mapDateTimeFormatSettings = (raw: unknown): DateTimeFormatSettings => {
  const row = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  return {
    setting_key: typeof row.setting_key === 'string' && row.setting_key.trim() !== ''
      ? row.setting_key
      : 'global_display',
    date_format: normalizePortalDateFormat(row.date_format),
    time_format: normalizePortalTimeFormat(row.time_format),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
    updated_by_email: typeof row.updated_by_email === 'string' ? row.updated_by_email : null,
    live_updated_via: typeof row.live_updated_via === 'string' ? row.live_updated_via : null,
  };
};

const normalizeLivePublishOrigin = (
  origin?: string | null,
  livePublishedAt?: string | null,
  livePublishedBy?: string | null
): FormLivePublishOrigin => {
  if (
    origin === 'manual_publish'
    || origin === 'legacy_seeded'
    || origin === 'never_published'
    || origin === 'unpublished'
  ) {
    return origin;
  }
  if (livePublishedAt) {
    return livePublishedBy ? 'manual_publish' : 'legacy_seeded';
  }
  return 'never_published';
};

const normalizeFormDraftConfigurationErrorCode = (errorMessage?: string): FormDraftConfigurationErrorCode => {
  const message = (errorMessage || '').toLowerCase();
  if (message.includes('session') || message.includes('invalid session') || message.includes('not found. please log in again')) {
    return 'no_session';
  }
  if (message.includes('not authorized') || message.includes('permission')) {
    return 'access_denied';
  }
  return 'load_failed';
};

const mapFormLivePublishStatusRow = (row: FormLivePublishStatusRpcRow): FormLivePublishStatus => ({
  form_id: row.form_id,
  form_key: row.form_key,
  form_name: row.form_name,
  live_published_at: row.live_published_at ?? null,
  live_published_by: row.live_published_by ?? null,
  live_published_by_email: row.live_published_by_email ?? null,
  live_publish_origin: normalizeLivePublishOrigin(
    row.live_publish_origin,
    row.live_published_at ?? null,
    row.live_published_by ?? null
  )
});

const toNullableLengthValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return null;
};

const mapFormConfigV2FieldRow = (row: FormConfigV2FieldRpcRow): FormConfigV2Field => ({
  id: row.id,
  form_key: row.form_key,
  field_key: row.field_key,
  label: row.label,
  field_type: row.field_type,
  section_name: row.section_name,
  placeholder: row.placeholder ?? null,
  help_text: row.help_text ?? null,
  option_items: Array.isArray(row.option_items)
    ? (row.option_items as unknown[]).map(value => String(value))
    : null,
  default_value: row.default_value ?? null,
  is_visible: row.is_visible,
  is_required: row.is_required,
  is_locked: row.is_locked,
  is_system_field: row.is_system_field,
  display_order: row.display_order,
  min_length: toNullableLengthValue((row as { min_length?: unknown }).min_length),
  max_length: toNullableLengthValue((row as { max_length?: unknown }).max_length),
  validation_rule_id: row.validation_rule_id ?? null
});

const mapSignupV2FieldRow = (row: SignupFormFieldV2RpcRow): SignupFormFieldV2 => ({
  ...mapFormConfigV2FieldRow(row as FormConfigV2FieldRpcRow),
  form_key: 'signup'
});

const mapSigninV2FieldRow = (row: SigninFormFieldV2RpcRow): SigninFormFieldV2 => ({
  ...mapFormConfigV2FieldRow(row as FormConfigV2FieldRpcRow),
  form_key: 'signin'
});

const mapJoinV2FieldRow = (row: JoinFormFieldV2RpcRow): JoinFormFieldV2 => ({
  ...mapFormConfigV2FieldRow(row as FormConfigV2FieldRpcRow),
  form_key: 'join_lub'
});

const mapMemberEditV2FieldRow = (row: MemberEditFormFieldV2RpcRow): MemberEditFormFieldV2 => ({
  ...mapFormConfigV2FieldRow(row as FormConfigV2FieldRpcRow),
  form_key: 'member_edit'
});

const mapFormBuilderSchemaFieldRow = (row: FormBuilderSchemaFieldV2RpcRow): FormBuilderSchemaFieldV2 => ({
  id: row.id ?? '',
  form_key: row.form_key,
  field_key: row.field_key ?? '',
  label: row.label ?? '',
  field_type: (row.field_type ?? 'text') as SignupV2FieldType,
  section_name: row.section_name ?? 'General',
  placeholder: row.placeholder ?? null,
  help_text: row.help_text ?? null,
  option_items: Array.isArray(row.option_items)
    ? (row.option_items as unknown[]).map(value => String(value))
    : null,
  default_value: row.default_value ?? null,
  is_visible: Boolean(row.is_visible),
  is_required: Boolean(row.is_required),
  is_locked: Boolean(row.is_locked),
  is_system_field: Boolean(row.is_system_field),
  display_order: row.display_order ?? 0,
  min_length: toNullableLengthValue(row.min_length),
  max_length: toNullableLengthValue(row.max_length),
  validation_rule_id: row.validation_rule_id ?? null,
  form_name: row.form_name,
  description: row.description ?? null,
  is_active: row.is_active,
  library_is_archived: Boolean(row.library_is_archived)
});

const mapFieldLibraryItemV2Row = (row: FieldLibraryItemV2RpcRow): FieldLibraryItemV2 => ({
  field_key: row.field_key,
  label: row.label,
  field_type: row.field_type,
  section_name: row.section_name,
  placeholder: row.placeholder ?? null,
  help_text: row.help_text ?? null,
  option_items: Array.isArray(row.option_items)
    ? (row.option_items as unknown[]).map(value => String(value))
    : null,
  min_length: toNullableLengthValue((row as { min_length?: unknown }).min_length),
  max_length: toNullableLengthValue((row as { max_length?: unknown }).max_length),
  validation_rule_id: row.validation_rule_id ?? null,
  is_locked: row.is_locked,
  is_system_field: row.is_system_field,
  is_archived: row.is_archived,
  usage_count: row.usage_count,
  created_at: row.created_at,
  updated_at: row.updated_at
});

export const signupFormConfigV2Service = {
  async getConfiguration(): Promise<{ success: boolean; data?: SignupFormFieldV2[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_signup_form_configuration_v2');

      if (error) {
        return { success: false, error: error.message };
      }

      const rows = Array.isArray(data) ? (data as SignupFormFieldV2RpcRow[]) : [];
      return {
        success: true,
        data: rows.map(mapSignupV2FieldRow)
      };
    } catch (error) {
      console.error('Error fetching signup v2 configuration:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async getDraftConfiguration(
    sessionToken?: string
  ): Promise<{ success: boolean; data?: SignupFormFieldV2[]; error?: string; errorCode?: SignupDraftConfigurationErrorCode }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return {
          success: false,
          error: 'User session not found. Please log in again.',
          errorCode: 'no_session'
        };
      }

      const { data, error } = await supabase.rpc('get_signup_form_configuration_v2_draft_with_session', {
        p_session_token: resolvedSessionToken
      });

      if (error) {
        return {
          success: false,
          error: error.message,
          errorCode: normalizeFormDraftConfigurationErrorCode(error.message)
        };
      }

      const rows = Array.isArray(data) ? (data as SignupFormFieldV2RpcRow[]) : [];
      return {
        success: true,
        data: rows.map(mapSignupV2FieldRow)
      };
    } catch (error) {
      console.error('Error fetching signup v2 draft configuration:', error);
      return {
        success: false,
        error: 'An unexpected error occurred',
        errorCode: 'load_failed'
      };
    }
  },

  async saveConfiguration(
    fields: SignupFormFieldV2UpsertInput[],
    sessionToken?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('upsert_signup_form_configuration_v2_with_session', {
        p_session_token: resolvedSessionToken,
        p_fields: fields
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to save configuration' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error saving signup v2 configuration:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async createCustomField(
    input: SignupFormFieldV2CreateInput,
    sessionToken?: string
  ): Promise<{ success: boolean; data?: SignupFormFieldV2; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('create_signup_custom_field_v2_with_session', {
        p_session_token: resolvedSessionToken,
        p_field_key: input.field_key,
        p_label: input.label,
        p_field_type: input.field_type,
        p_section_name: input.section_name,
        p_placeholder: input.placeholder ?? null,
        p_help_text: input.help_text ?? null,
        p_option_items: input.option_items ?? null,
        p_default_value: input.default_value ?? null,
        p_is_visible: input.is_visible ?? true,
        p_is_required: input.is_required ?? false,
        p_display_order: input.display_order ?? null,
        p_validation_rule_id: input.validation_rule_id ?? null
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string; data?: SignupFormFieldV2RpcRow };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to create custom field' };
      }

      return {
        success: true,
        data: result.data ? mapSignupV2FieldRow(result.data) : undefined
      };
    } catch (error) {
      console.error('Error creating signup v2 custom field:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async deleteCustomField(
    field_key: string,
    sessionToken?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('delete_signup_custom_field_v2_with_session', {
        p_session_token: resolvedSessionToken,
        p_field_key: field_key
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to delete custom field' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting signup v2 custom field:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
};

export const signinFormConfigV2Service = {
  async getConfiguration(): Promise<{ success: boolean; data?: SigninFormFieldV2[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_signin_form_configuration_v2');

      if (error) {
        return { success: false, error: error.message };
      }

      const rows = Array.isArray(data) ? (data as SigninFormFieldV2RpcRow[]) : [];
      return {
        success: true,
        data: rows.map(mapSigninV2FieldRow)
      };
    } catch (error) {
      console.error('Error fetching signin v2 configuration:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async getDraftConfiguration(
    sessionToken?: string
  ): Promise<{ success: boolean; data?: SigninFormFieldV2[]; error?: string; errorCode?: FormDraftConfigurationErrorCode }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return {
          success: false,
          error: 'User session not found. Please log in again.',
          errorCode: 'no_session'
        };
      }

      const { data, error } = await supabase.rpc('get_signin_form_configuration_v2_draft_with_session', {
        p_session_token: resolvedSessionToken
      });

      if (error) {
        return {
          success: false,
          error: error.message,
          errorCode: normalizeFormDraftConfigurationErrorCode(error.message)
        };
      }

      const rows = Array.isArray(data) ? (data as SigninFormFieldV2RpcRow[]) : [];
      return {
        success: true,
        data: rows.map(mapSigninV2FieldRow)
      };
    } catch (error) {
      console.error('Error fetching signin v2 draft configuration:', error);
      return {
        success: false,
        error: 'An unexpected error occurred',
        errorCode: 'load_failed'
      };
    }
  }
};

export const joinFormConfigV2Service = {
  async getConfiguration(): Promise<{ success: boolean; data?: JoinFormFieldV2[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_join_form_configuration_v2');

      if (error) {
        return { success: false, error: error.message };
      }

      const rows = Array.isArray(data) ? (data as JoinFormFieldV2RpcRow[]) : [];
      return {
        success: true,
        data: rows.map(mapJoinV2FieldRow)
      };
    } catch (error) {
      console.error('Error fetching join v2 configuration:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async getDraftConfiguration(
    sessionToken?: string
  ): Promise<{ success: boolean; data?: JoinFormFieldV2[]; error?: string; errorCode?: JoinDraftConfigurationErrorCode }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return {
          success: false,
          error: 'User session not found. Please log in again.',
          errorCode: 'no_session'
        };
      }

      const { data, error } = await supabase.rpc('get_join_form_configuration_v2_draft_with_session', {
        p_session_token: resolvedSessionToken
      });

      if (error) {
        return {
          success: false,
          error: error.message,
          errorCode: normalizeFormDraftConfigurationErrorCode(error.message)
        };
      }

      const rows = Array.isArray(data) ? (data as JoinFormFieldV2RpcRow[]) : [];
      return {
        success: true,
        data: rows.map(mapJoinV2FieldRow)
      };
    } catch (error) {
      console.error('Error fetching join v2 draft configuration:', error);
      return {
        success: false,
        error: 'An unexpected error occurred',
        errorCode: 'load_failed'
      };
    }
  }
};

export const memberEditFormConfigV2Service = {
  async getConfiguration(
    sessionToken?: string
  ): Promise<{ success: boolean; data?: MemberEditFormFieldV2[]; error?: string; errorCode?: MemberEditDraftConfigurationErrorCode }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return {
          success: false,
          error: 'User session not found. Please log in again.',
          errorCode: 'no_session'
        };
      }

      const { data, error } = await supabase.rpc('get_member_edit_form_configuration_v2_with_session', {
        p_session_token: resolvedSessionToken
      });

      if (error) {
        return {
          success: false,
          error: error.message,
          errorCode: normalizeFormDraftConfigurationErrorCode(error.message)
        };
      }

      const rows = Array.isArray(data) ? (data as MemberEditFormFieldV2RpcRow[]) : [];
      return {
        success: true,
        data: rows.map(mapMemberEditV2FieldRow)
      };
    } catch (error) {
      console.error('Error fetching member-edit v2 configuration:', error);
      return {
        success: false,
        error: 'An unexpected error occurred',
        errorCode: 'load_failed'
      };
    }
  },

  async getDraftConfiguration(
    sessionToken?: string
  ): Promise<{ success: boolean; data?: MemberEditFormFieldV2[]; error?: string; errorCode?: MemberEditDraftConfigurationErrorCode }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return {
          success: false,
          error: 'User session not found. Please log in again.',
          errorCode: 'no_session'
        };
      }

      const { data, error } = await supabase.rpc('get_member_edit_form_configuration_v2_draft_with_session', {
        p_session_token: resolvedSessionToken
      });

      if (error) {
        return {
          success: false,
          error: error.message,
          errorCode: normalizeFormDraftConfigurationErrorCode(error.message)
        };
      }

      const rows = Array.isArray(data) ? (data as MemberEditFormFieldV2RpcRow[]) : [];
      return {
        success: true,
        data: rows.map(mapMemberEditV2FieldRow)
      };
    } catch (error) {
      console.error('Error fetching member-edit v2 draft configuration:', error);
      return {
        success: false,
        error: 'An unexpected error occurred',
        errorCode: 'load_failed'
      };
    }
  }
};

export const formBuilderV2Service = {
  async listForms(): Promise<{ success: boolean; data?: FormConfigV2FormSummary[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('list_form_config_v2_forms');

      if (error) {
        return { success: false, error: error.message };
      }

      const rows = Array.isArray(data) ? (data as FormConfigV2FormSummaryRpcRow[]) : [];
      return { success: true, data: rows };
    } catch (error) {
      console.error('Error listing form config v2 forms:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async getFormConfiguration(formKey: string): Promise<{ success: boolean; data?: FormConfigV2Field[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_form_configuration_v2', {
        p_form_key: formKey
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const rows = Array.isArray(data) ? (data as FormConfigV2FieldRpcRow[]) : [];
      return { success: true, data: rows.map(mapFormConfigV2FieldRow) };
    } catch (error) {
      console.error('Error fetching form config v2 fields:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async createForm(
    input: FormConfigV2FormCreateInput,
    sessionToken?: string
  ): Promise<{ success: boolean; data?: FormConfigV2FormSummary; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('create_form_config_v2_form_with_session', {
        p_session_token: resolvedSessionToken,
        p_form_key: input.form_key,
        p_form_name: input.form_name,
        p_description: input.description ?? null
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string; data?: FormConfigV2FormSummary };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to create form' };
      }

      return { success: true, data: result.data };
    } catch (error) {
      console.error('Error creating form config v2 form:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async createField(
    input: FormConfigV2FieldCreateInput,
    sessionToken?: string
  ): Promise<{ success: boolean; data?: FormConfigV2Field; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('attach_field_to_form_v2_with_session', {
        p_session_token: resolvedSessionToken,
        p_form_key: input.form_key,
        p_field_key: input.field_key,
        p_is_visible: input.is_visible ?? true,
        p_is_required: input.is_required ?? false,
        p_display_order: input.display_order ?? null
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string; data?: FormConfigV2FieldRpcRow };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to create field' };
      }

      return {
        success: true,
        data: result.data ? mapFormConfigV2FieldRow(result.data) : undefined
      };
    } catch (error) {
      console.error('Error creating form config v2 field:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async deleteField(
    formKey: string,
    fieldKey: string,
    sessionToken?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('detach_field_from_form_v2_with_session', {
        p_session_token: resolvedSessionToken,
        p_form_key: formKey,
        p_field_key: fieldKey
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to delete field' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting form config v2 field:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
};

export const formBuilderV21Service = {
  async listForms(): Promise<{ success: boolean; data?: FormBuilderV2FormSummary[]; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('list_forms_builder_v2');
      if (error) {
        return { success: false, error: error.message };
      }
      const rows = Array.isArray(data) ? (data as FormBuilderV2FormSummaryRpcRow[]) : [];
      return { success: true, data: rows };
    } catch (error) {
      console.error('Error listing form builder v2.1 forms:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async listLivePublishStatus(sessionToken?: string): Promise<{ success: boolean; data?: FormLivePublishStatus[]; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }
      const { data, error } = await supabase.rpc('list_form_builder_live_publish_status_with_session', {
        p_session_token: resolvedSessionToken
      });
      if (error) {
        return { success: false, error: error.message };
      }
      const rows = Array.isArray(data) ? (data as FormLivePublishStatusRpcRow[]) : [];
      return { success: true, data: rows.map(mapFormLivePublishStatusRow) };
    } catch (error) {
      console.error('Error listing form builder live publish status:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async getLivePublishStatus(formKey: string, sessionToken?: string): Promise<{ success: boolean; data?: FormLivePublishStatus | null; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }
      const { data, error } = await supabase.rpc('get_form_builder_live_publish_status_with_session', {
        p_session_token: resolvedSessionToken,
        p_form_key: formKey
      });
      if (error) {
        return { success: false, error: error.message };
      }
      const rows = Array.isArray(data) ? (data as FormLivePublishStatusRpcRow[]) : [];
      if (rows.length === 0) {
        return { success: true, data: null };
      }
      return { success: true, data: mapFormLivePublishStatusRow(rows[0]) };
    } catch (error) {
      console.error('Error fetching form builder live publish status:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async getFormSchema(formKey: string): Promise<{ success: boolean; data?: FormBuilderSchemaV2; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('get_form_builder_schema_v2', {
        p_form_key: formKey
      });
      if (error) {
        return { success: false, error: error.message };
      }
      const rows = Array.isArray(data) ? (data as FormBuilderSchemaFieldV2RpcRow[]) : [];
      if (rows.length === 0) {
        return { success: false, error: 'Form not found' };
      }

      const fields = rows
        .filter(row => Boolean(row.id && row.field_key))
        .map(mapFormBuilderSchemaFieldRow);
      const first = rows[0];
        return {
          success: true,
          data: {
            form: {
              id: first.form_id,
              form_key: first.form_key,
              form_name: first.form_name,
              description: first.description ?? null,
              is_active: first.is_active,
              live_published_at: first.live_published_at ?? null,
              live_published_by: first.live_published_by ?? null,
              live_published_by_email: first.live_published_by_email ?? null,
              live_publish_origin: normalizeLivePublishOrigin(
                first.live_publish_origin,
                first.live_published_at ?? null,
                first.live_published_by ?? null
              )
            },
            fields
          }
      };
    } catch (error) {
      console.error('Error fetching form builder v2.1 schema:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async createForm(
    input: FormConfigV2FormCreateInput,
    sessionToken?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }
      const { data, error } = await supabase.rpc('create_form_builder_v2_with_session', {
        p_session_token: resolvedSessionToken,
        p_form_key: input.form_key,
        p_form_name: input.form_name,
        p_description: input.description ?? null
      });
      if (error) {
        return { success: false, error: error.message };
      }
      const result = data as { success: boolean; error?: string };
      return result?.success ? { success: true } : { success: false, error: result?.error || 'Failed to create form' };
    } catch (error) {
      console.error('Error creating form builder v2.1 form:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async cloneForm(input: FormBuilderV2CloneInput, sessionToken?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }
      const { data, error } = await supabase.rpc('clone_form_builder_v2_with_session', {
        p_session_token: resolvedSessionToken,
        p_source_form_key: input.source_form_key,
        p_target_form_key: input.target_form_key,
        p_target_form_name: input.target_form_name,
        p_description: input.description ?? null
      });
      if (error) {
        return { success: false, error: error.message };
      }
      const result = data as { success: boolean; error?: string };
      return result?.success ? { success: true } : { success: false, error: result?.error || 'Failed to clone form' };
    } catch (error) {
      console.error('Error cloning form builder v2.1 form:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async archiveForm(formKey: string, archive = true, sessionToken?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }
      const { data, error } = await supabase.rpc('archive_form_builder_v2_with_session', {
        p_session_token: resolvedSessionToken,
        p_form_key: formKey,
        p_archive: archive
      });
      if (error) {
        return { success: false, error: error.message };
      }
      const result = data as { success: boolean; error?: string };
      return result?.success ? { success: true } : { success: false, error: result?.error || 'Failed to archive form' };
    } catch (error) {
      console.error('Error archiving form builder v2.1 form:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async publishFormToLive(formKey: string, sessionToken?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }
      const { data, error } = await supabase.rpc('publish_form_builder_v2_to_live_with_session', {
        p_session_token: resolvedSessionToken,
        p_form_key: formKey
      });
      if (error) {
        return { success: false, error: error.message };
      }
      const result = data as { success: boolean; error?: string };
      return result?.success ? { success: true } : { success: false, error: result?.error || 'Failed to publish form' };
    } catch (error) {
      console.error('Error publishing form builder v2.1 form:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async unpublishForm(formKey: string, sessionToken?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }
      const { data, error } = await supabase.rpc('unpublish_form_builder_v2_with_session', {
        p_session_token: resolvedSessionToken,
        p_form_key: formKey
      });
      if (error) {
        return { success: false, error: error.message };
      }
      const result = data as { success: boolean; error?: string };
      return result?.success ? { success: true } : { success: false, error: result?.error || 'Failed to unpublish form' };
    } catch (error) {
      console.error('Error unpublishing form builder v2.1 form:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async attachField(input: FormBuilderV2AttachFieldInput, sessionToken?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }
      const { data, error } = await supabase.rpc('attach_field_to_form_v2_with_session', {
        p_session_token: resolvedSessionToken,
        p_form_key: input.form_key,
        p_field_key: input.field_key,
        p_is_visible: input.is_visible ?? true,
        p_is_required: input.is_required ?? false,
        p_display_order: input.display_order ?? null
      });
      if (error) {
        return { success: false, error: error.message };
      }
      const result = data as { success: boolean; error?: string };
      return result?.success ? { success: true } : { success: false, error: result?.error || 'Failed to attach field' };
    } catch (error) {
      console.error('Error attaching field in form builder v2.1:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async detachField(formKey: string, fieldKey: string, sessionToken?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }
      const { data, error } = await supabase.rpc('detach_field_from_form_v2_with_session', {
        p_session_token: resolvedSessionToken,
        p_form_key: formKey,
        p_field_key: fieldKey
      });
      if (error) {
        return { success: false, error: error.message };
      }
      const result = data as { success: boolean; error?: string };
      return result?.success ? { success: true } : { success: false, error: result?.error || 'Failed to detach field' };
    } catch (error) {
      console.error('Error detaching field in form builder v2.1:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async reorderFields(formKey: string, fieldKeys: string[], sessionToken?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }
      const { data, error } = await supabase.rpc('reorder_form_fields_v2_with_session', {
        p_session_token: resolvedSessionToken,
        p_form_key: formKey,
        p_field_keys: fieldKeys
      });
      if (error) {
        return { success: false, error: error.message };
      }
      const result = data as { success: boolean; error?: string };
      return result?.success ? { success: true } : { success: false, error: result?.error || 'Failed to reorder fields' };
    } catch (error) {
      console.error('Error reordering fields in form builder v2.1:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async saveFieldSettings(
    formKey: string,
    fields: FormBuilderV2FieldSettingsInput[],
    sessionToken?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }
      const { data, error } = await supabase.rpc('upsert_form_builder_v2_field_settings_with_session', {
        p_session_token: resolvedSessionToken,
        p_form_key: formKey,
        p_fields: fields
      });
      if (error) {
        return { success: false, error: error.message };
      }
      const result = data as { success: boolean; error?: string };
      return result?.success ? { success: true } : { success: false, error: result?.error || 'Failed to save field settings' };
    } catch (error) {
      console.error('Error saving form builder v2.1 field settings:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
};

export const fieldLibraryV2Service = {
  async listItems(sessionToken?: string): Promise<{ success: boolean; data?: FieldLibraryItemV2[]; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }
      const { data, error } = await supabase.rpc('list_field_library_v2_with_session', {
        p_session_token: resolvedSessionToken
      });
      if (error) {
        return { success: false, error: error.message };
      }
      const rows = Array.isArray(data) ? (data as FieldLibraryItemV2RpcRow[]) : [];
      return { success: true, data: rows.map(mapFieldLibraryItemV2Row) };
    } catch (error) {
      console.error('Error listing field library v2 items:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async createItem(input: FieldLibraryItemV2UpsertInput, sessionToken?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }
      const { data, error } = await supabase.rpc('create_field_library_item_v2_with_session', {
        p_session_token: resolvedSessionToken,
        p_field_key: input.field_key,
        p_label: input.label,
        p_field_type: input.field_type,
        p_section_name: input.section_name,
        p_placeholder: input.placeholder ?? null,
        p_help_text: input.help_text ?? null,
        p_option_items: input.option_items ?? null,
        p_validation_rule_id: input.validation_rule_id ?? null,
        p_min_length: input.min_length ?? null,
        p_max_length: input.max_length ?? null,
        p_is_system_field: input.is_system_field ?? false,
        p_is_locked: input.is_locked ?? false
      });
      if (error) {
        return { success: false, error: error.message };
      }
      const result = data as { success: boolean; error?: string };
      return result?.success ? { success: true } : { success: false, error: result?.error || 'Failed to create field library item' };
    } catch (error) {
      console.error('Error creating field library v2 item:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async updateItem(input: FieldLibraryItemV2UpsertInput, sessionToken?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }
      const { data, error } = await supabase.rpc('update_field_library_item_v2_with_session', {
        p_session_token: resolvedSessionToken,
        p_field_key: input.field_key,
        p_label: input.label,
        p_field_type: input.field_type,
        p_section_name: input.section_name,
        p_placeholder: input.placeholder ?? null,
        p_help_text: input.help_text ?? null,
        p_option_items: input.option_items ?? null,
        p_validation_rule_id: input.validation_rule_id ?? null,
        p_min_length: input.min_length ?? null,
        p_max_length: input.max_length ?? null,
        p_is_system_field: input.is_system_field ?? false,
        p_is_locked: input.is_locked ?? false
      });
      if (error) {
        return { success: false, error: error.message };
      }
      const result = data as { success: boolean; error?: string };
      return result?.success ? { success: true } : { success: false, error: result?.error || 'Failed to update field library item' };
    } catch (error) {
      console.error('Error updating field library v2 item:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async archiveItem(fieldKey: string, archive = true, sessionToken?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }
      const { data, error } = await supabase.rpc('archive_field_library_item_v2_with_session', {
        p_session_token: resolvedSessionToken,
        p_field_key: fieldKey,
        p_archive: archive
      });
      if (error) {
        return { success: false, error: error.message };
      }
      const result = data as { success: boolean; error?: string };
      return result?.success ? { success: true } : { success: false, error: result?.error || 'Failed to archive field library item' };
    } catch (error) {
      console.error('Error archiving field library v2 item:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
};

export const aiSettingsService = {
  async getSettings(sessionToken?: string): Promise<{ success: boolean; data?: AIRuntimeSettings; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('get_ai_runtime_settings_with_session', {
        p_session_token: resolvedSessionToken
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success?: boolean; error?: string; data?: unknown } | null;
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to load AI settings' };
      }

      return { success: true, data: mapAIRuntimeSettings(result.data) };
    } catch (error) {
      console.error('Error loading AI settings:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async saveSettings(
    input: {
      provider: AIProvider;
      model: string;
      reasoningEffort?: AIRuntimeReasoningEffort | null;
      isEnabled: boolean;
      apiKey?: string | null;
    },
    sessionToken?: string
  ): Promise<{ success: boolean; error?: string; data?: AIRuntimeSettings }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('upsert_ai_runtime_settings_with_session', {
        p_session_token: resolvedSessionToken,
        p_provider: input.provider,
        p_model: input.model,
        p_reasoning_effort: input.reasoningEffort ?? null,
        p_is_enabled: input.isEnabled,
        p_api_key: input.apiKey && input.apiKey.trim() !== '' ? input.apiKey.trim() : null
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success?: boolean; error?: string; data?: unknown } | null;
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to save AI settings' };
      }

      const refresh = await aiSettingsService.getSettings(resolvedSessionToken);
      if (!refresh.success) {
        return { success: true };
      }

      return { success: true, data: refresh.data };
    } catch (error) {
      console.error('Error saving AI settings:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async getRuntimeProfile(): Promise<AIRuntimeProfile | null> {
    try {
      const { data, error } = await supabase.rpc('get_ai_runtime_normalization_profile');
      if (error) {
        return null;
      }

      const result = data as { success?: boolean; error?: string; data?: unknown } | null;
      if (!result?.success || !result.data || typeof result.data !== 'object') {
        return null;
      }

      const payload = result.data as Record<string, unknown>;
      return {
        provider: normalizeAIProvider(payload.provider),
        model: typeof payload.model === 'string' && payload.model.trim() !== ''
          ? payload.model
          : 'gpt-4o-mini',
        reasoning_effort: normalizeAIRuntimeReasoningEffort(payload.reasoning_effort),
        is_enabled: Boolean(payload.is_enabled)
      };
    } catch (error) {
      console.warn('Unable to load AI runtime profile:', error);
      return null;
    }
  }
};

export const dateTimeSettingsService = {
  async getSettings(sessionToken?: string): Promise<{ success: boolean; data?: DateTimeFormatSettings; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('get_datetime_format_settings_with_session', {
        p_session_token: resolvedSessionToken
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success?: boolean; error?: string; data?: unknown } | null;
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to load date and time settings' };
      }

      return { success: true, data: mapDateTimeFormatSettings(result.data) };
    } catch (error) {
      console.error('Error loading date/time settings:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async saveSettings(
    input: {
      dateFormat: PortalDateFormat;
      timeFormat: PortalTimeFormat;
    },
    sessionToken?: string
  ): Promise<{ success: boolean; error?: string; data?: DateTimeFormatSettings }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('upsert_datetime_format_settings_with_session', {
        p_session_token: resolvedSessionToken,
        p_date_format: input.dateFormat,
        p_time_format: input.timeFormat,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success?: boolean; error?: string } | null;
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to save date and time settings' };
      }

      const refresh = await dateTimeSettingsService.getSettings(resolvedSessionToken);
      if (!refresh.success) {
        return { success: true };
      }

      return { success: true, data: refresh.data };
    } catch (error) {
      console.error('Error saving date/time settings:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async getRuntimeProfile(): Promise<DateTimeFormatProfile | null> {
    try {
      const { data, error } = await supabase.rpc('get_datetime_format_runtime_profile');
      if (error) {
        return null;
      }

      const result = data as { success?: boolean; error?: string; data?: unknown } | null;
      if (!result?.success || !result.data || typeof result.data !== 'object') {
        return null;
      }

      const payload = result.data as Record<string, unknown>;
      return {
        date_format: normalizePortalDateFormat(payload.date_format),
        time_format: normalizePortalTimeFormat(payload.time_format),
      };
    } catch (error) {
      console.warn('Unable to load date/time runtime profile:', error);
      return null;
    }
  }
};

export interface AuditHistoryEntry {
  id: string;
  member_id: string;
  action_type: 'update' | 'status_change' | 'deactivate' | 'activate' | 'delete' | 'restore' | 'create';
  field_name?: string;
  old_value?: string;
  new_value?: string;
  changed_by?: string;
  change_reason?: string;
  created_at: string;
  admin_email?: string;
}

export const memberAuditService = {
  async getMemberAuditHistory(memberId: string): Promise<AuditHistoryEntry[]> {
    try {
      const { data, error } = await supabase
        .from('member_audit_history')
        .select('*')
        .eq('member_id', memberId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const historyWithEmails = await Promise.all(
        (data || []).map(async (entry) => {
          if (entry.changed_by) {
            const { data: userData } = await supabase.auth.admin.getUserById(entry.changed_by);
            return {
              ...entry,
              admin_email: userData?.user?.email || 'Unknown'
            };
          }
          return entry;
        })
      );

      return historyWithEmails;
    } catch (error) {
      console.error('Error fetching audit history:', error);
      return [];
    }
  }
};

export interface DeletedMember {
  id: string;
  original_id: string;
  full_name: string;
  email: string;
  mobile_number: string;
  company_name: string;
  state: string;
  district: string;
  status: string;
  deleted_by: string;
  deleted_at: string;
  deletion_reason: string;
  deleted_by_email?: string;
  member_id?: string;
  first_viewed_at?: string | null;
  first_viewed_by?: string | null;
  reviewed_count?: number;
  profile_photo_url?: string | null;
}

export interface ApprovedMemberExportRow {
  company_name: string;
  member_name: string;
  city: string;
  district: string;
  mobile_number: string;
  email: string;
  member_id: string;
  company_address: string;
  gender: string;
}

export const deletedMembersService = {
  async getAllDeletedMembers(
    sessionToken: string,
    search?: string
  ): Promise<DeletedMember[]> {
    try {
      if (!sessionToken) {
        throw new Error('User session not found. Please log in again.');
      }

      const { data, error } = await supabase.rpc('get_deleted_members_with_session', {
        p_session_token: sessionToken,
        p_search: search || null
      });

      if (error) {
        throw error;
      }

      const membersWithEmails = await Promise.all(
        (data || []).map(async (member) => {
          try {
            const { data: { user: userData } } = await supabase.auth.admin.getUserById(member.deleted_by);
            return {
              ...member,
              deleted_by_email: userData?.email || 'Unknown'
            };
          } catch {
            return {
              ...member,
              deleted_by_email: 'Unknown'
            };
          }
        })
      );

      return membersWithEmails;
    } catch (error) {
      console.error('[DeletedMembers] fetch error:', error);
      throw error;
    }
  },

  async restoreDeletedMember(deletedMemberId: string, sessionToken: string) {
    if (!deletedMemberId) throw new Error("restoreDeletedMember: deletedMemberId is required");
    if (!sessionToken) throw new Error("restoreDeletedMember: sessionToken is required");

    console.debug("[restoreDeletedMember] starting", { deletedMemberId });

    const { data, error } = await supabase.rpc("admin_restore_deleted_member_with_session", {
      p_deleted_member_id: deletedMemberId,
      p_session_token: sessionToken,
    });

    if (error) {
      console.error("[restoreDeletedMember] RPC transport error", error);
      throw new Error(error.message || "RPC transport error");
    }

    if (!data || data.success !== true) {
      const msg = (data && data.error) ? data.error : "Unknown RPC failure";
      console.warn("[restoreDeletedMember] RPC domain error", data);
      throw new Error(msg);
    }

    console.debug("[restoreDeletedMember] success", data);
    return data;
  }
};

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

export type NormalizationRuleCategory = 'identity' | 'contact' | 'company' | 'business' | 'referral';

export interface NormalizationRule {
  id: string;
  field_key: string;
  label: string;
  category: NormalizationRuleCategory;
  instruction_text: string;
  default_instruction_text: string;
  is_enabled: boolean;
  display_order: number;
  updated_at?: string | null;
  updated_by?: string | null;
  updated_by_email?: string | null;
}

const normalizeNormalizationRuleCategory = (value: unknown): NormalizationRuleCategory => {
  switch (typeof value === 'string' ? value.trim().toLowerCase() : '') {
    case 'identity':
    case 'contact':
    case 'company':
    case 'business':
    case 'referral':
      return value as NormalizationRuleCategory;
    default:
      return 'contact';
  }
};

const mapNormalizationRule = (raw: unknown): NormalizationRule => {
  const payload = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return {
    id: typeof payload.id === 'string' ? payload.id : '',
    field_key: typeof payload.field_key === 'string' ? payload.field_key : '',
    label: typeof payload.label === 'string' ? payload.label : '',
    category: normalizeNormalizationRuleCategory(payload.category),
    instruction_text: typeof payload.instruction_text === 'string' ? payload.instruction_text : '',
    default_instruction_text: typeof payload.default_instruction_text === 'string' ? payload.default_instruction_text : '',
    is_enabled: Boolean(payload.is_enabled),
    display_order: typeof payload.display_order === 'number'
      ? payload.display_order
      : Number(payload.display_order ?? 0),
    updated_at: typeof payload.updated_at === 'string' ? payload.updated_at : null,
    updated_by: typeof payload.updated_by === 'string' ? payload.updated_by : null,
    updated_by_email: typeof payload.updated_by_email === 'string' ? payload.updated_by_email : null
  };
};

export const normalizationRulesService = {
  async getRules(sessionToken?: string): Promise<{ success: boolean; data?: NormalizationRule[]; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('get_normalization_rules_with_session', {
        p_session_token: resolvedSessionToken
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success?: boolean; error?: string; data?: unknown } | null;
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to load normalization rules' };
      }

      const rows = Array.isArray(result.data) ? result.data.map(mapNormalizationRule) : [];
      return { success: true, data: rows };
    } catch (error) {
      console.error('Error loading normalization rules:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async updateRule(
    input: {
      fieldKey: string;
      instructionText?: string | null;
      isEnabled?: boolean;
    },
    sessionToken?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('update_normalization_rule_with_session', {
        p_session_token: resolvedSessionToken,
        p_field_key: input.fieldKey,
        p_instruction_text: input.instructionText ?? null,
        p_is_enabled: typeof input.isEnabled === 'boolean' ? input.isEnabled : null
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success?: boolean; error?: string } | null;
      return result?.success
        ? { success: true }
        : { success: false, error: result?.error || 'Failed to update normalization rule' };
    } catch (error) {
      console.error('Error updating normalization rule:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async reorderRules(
    updates: Array<{ fieldKey: string; displayOrder: number }>,
    sessionToken?: string
  ): Promise<{ success: boolean; error?: string; updatedCount?: number }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('reorder_normalization_rules_with_session', {
        p_session_token: resolvedSessionToken,
        p_updates: updates.map((update) => ({
          field_key: update.fieldKey,
          display_order: update.displayOrder
        }))
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success?: boolean; error?: string; updated_count?: number } | null;
      return result?.success
        ? { success: true, updatedCount: typeof result.updated_count === 'number' ? result.updated_count : undefined }
        : { success: false, error: result?.error || 'Failed to reorder normalization rules' };
    } catch (error) {
      console.error('Error reordering normalization rules:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  // COD-NORMALIZATION-RULES-ADD-DELETE-034
  async createRule(
    input: {
      fieldKey: string;
      label: string;
      category: NormalizationRuleCategory;
      instructionText: string;
      isEnabled?: boolean;
    },
    sessionToken?: string
  ): Promise<{
    success: boolean;
    error?: string;
    errorCode?: string;
    id?: string;
    reactivated?: boolean;
  }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('create_normalization_rule_with_session', {
        p_session_token: resolvedSessionToken,
        p_field_key: input.fieldKey,
        p_label: input.label,
        p_category: input.category,
        p_instruction_text: input.instructionText,
        p_is_enabled: typeof input.isEnabled === 'boolean' ? input.isEnabled : true
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as {
        success?: boolean;
        error?: string;
        error_code?: string;
        id?: string;
        reactivated?: boolean;
      } | null;
      if (!result?.success) {
        return {
          success: false,
          error: result?.error || 'Failed to create normalization rule',
          errorCode: result?.error_code
        };
      }
      return {
        success: true,
        id: result.id,
        reactivated: Boolean(result.reactivated)
      };
    } catch (error) {
      console.error('Error creating normalization rule:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async deleteRule(
    fieldKey: string,
    sessionToken?: string
  ): Promise<{ success: boolean; error?: string; alreadyRetired?: boolean }> {
    try {
      const resolvedSessionToken = sessionToken || sessionManager.getSessionToken();
      if (!resolvedSessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('delete_normalization_rule_with_session', {
        p_session_token: resolvedSessionToken,
        p_field_key: fieldKey
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as {
        success?: boolean;
        error?: string;
        already_retired?: boolean;
      } | null;
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to delete normalization rule' };
      }
      return { success: true, alreadyRetired: Boolean(result.already_retired) };
    } catch (error) {
      console.error('Error deleting normalization rule:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
};

interface ApprovedMembersExportRpcResult {
  success?: boolean;
  error?: string;
  data?: unknown;
}

export const validationRulesService = {
  async getAllValidationRules(): Promise<ValidationRule[]> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        throw new Error('User session not found. Please log in again.');
      }

      const { data, error } = await supabase.rpc('get_validation_rules_with_session', {
        p_session_token: sessionToken
      });

      if (error) {
        throw error;
      }

      return (data as ValidationRule[] | null) || [];
    } catch (error) {
      console.error('Error fetching all validation rules:', error);
      throw error;
    }
  },

  async getActiveValidationRules(): Promise<ValidationRule[]> {
    try {
      const { data, error } = await supabase
        .from('validation_rules')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching active validation rules:', error);
      throw error;
    }
  },

  async getValidationRulesByCategory(category: string): Promise<ValidationRule[]> {
    try {
      const { data, error } = await supabase
        .from('validation_rules')
        .select('*')
        .eq('category', category)
        .eq('is_active', true)
        .order('display_order');

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching validation rules by category:', error);
      throw error;
    }
  },

  async updateValidationRule(
    id: string,
    updates: {
      validation_pattern?: string;
      error_message?: string;
      description?: string | null;
      is_active?: boolean;
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('update_validation_rule_with_session', {
        p_session_token: sessionToken,
        p_rule_id: id,
        p_validation_pattern: updates.validation_pattern ?? null,
        p_error_message: updates.error_message ?? null,
        p_description: updates.description ?? null
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to update validation rule' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating validation rule:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async toggleValidationRuleActive(id: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('toggle_validation_rule_active_with_session', {
        p_session_token: sessionToken,
        p_rule_id: id,
        p_is_active: isActive
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to update validation rule status' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error toggling validation rule status:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async updateDisplayOrder(id: string, displayOrder: number): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('update_validation_rule_display_order_with_session', {
        p_session_token: sessionToken,
        p_rule_id: id,
        p_display_order: displayOrder
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to update display order' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating display order:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async testValidationRule(pattern: string, value: string): Promise<{ isValid: boolean; error?: string }> {
    try {
      const regex = new RegExp(pattern);
      const isValid = regex.test(value);

      return { isValid };
    } catch (error) {
      console.error('Error testing validation rule:', error);
      return { isValid: false, error: 'Invalid regular expression pattern' };
    }
  },

  async getAllCategories(): Promise<string[]> {
    try {
      const rules = await validationRulesService.getAllValidationRules();
      const uniqueCategories = [...new Set(rules.map(item => item.category))];
      return uniqueCategories.sort();
    } catch (error) {
      console.error('Error fetching categories:', error);
      return [];
    }
  },

  async checkRuleNameExists(ruleName: string, excludeId?: string): Promise<boolean> {
    try {
      const lowerRuleName = ruleName.toLowerCase();
      const rules = await validationRulesService.getAllValidationRules();
      return rules.some(rule =>
        rule.rule_name.toLowerCase() === lowerRuleName &&
        (!excludeId || rule.id !== excludeId)
      );
    } catch (error) {
      console.error('Error checking rule name:', error);
      return false;
    }
  },

  async getMaxDisplayOrder(): Promise<number> {
    try {
      const rules = await validationRulesService.getAllValidationRules();
      if (rules.length === 0) {
        return 0;
      }

      return rules.reduce((max, rule) => Math.max(max, rule.display_order || 0), 0);
    } catch (error) {
      console.error('Error getting max display order:', error);
      return 0;
    }
  },

  async createValidationRule(rule: {
    rule_name: string;
    rule_type: string;
    category: string;
    validation_pattern: string;
    error_message: string;
    description: string;
    display_order: number;
  }): Promise<{ success: boolean; error?: string; data?: ValidationRule }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('create_validation_rule_with_session', {
        p_session_token: sessionToken,
        p_rule_name: rule.rule_name,
        p_rule_type: rule.rule_type,
        p_category: rule.category,
        p_validation_pattern: rule.validation_pattern,
        p_error_message: rule.error_message,
        p_description: rule.description,
        p_display_order: rule.display_order
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string; data?: ValidationRule };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to create validation rule' };
      }

      return { success: true, data: result.data };
    } catch (error) {
      console.error('Error creating validation rule:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async updateRuleCategory(ruleId: string, newCategory: string): Promise<{ success: boolean; error?: string }> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        return { success: false, error: 'User session not found. Please log in again.' };
      }

      const { data, error } = await supabase.rpc('update_validation_rule_category_with_session', {
        p_session_token: sessionToken,
        p_rule_id: ruleId,
        p_new_category: newCategory
      });

      if (error) {
        return { success: false, error: error.message };
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        return { success: false, error: result?.error || 'Failed to update rule category' };
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating rule category:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }
};

// ─────────────────────────────────────────────────────────────
// Activities CMS — types
// ─────────────────────────────────────────────────────────────

export type ActivityStatus = 'draft' | 'published' | 'archived';
export type ActivityMediaStorageProvider = 'supabase_storage' | 'cloudflare_r2' | string;

/** Returned by get_published_activities (public) */
export interface PublicActivity {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  activity_date: string | null;
  location: string | null;
  cover_image_url: string | null;
  is_featured: boolean;
  published_at: string | null;
}

/** Returned by get_activity_by_slug (public) */
export interface PublicActivityDetail extends PublicActivity {
  description: string | null;
  youtube_urls: string[];
  media: ActivityMediaItem[];
}

/** Returned by get_all_activities_with_session (admin list) */
export interface AdminActivityListItem {
  id: string;
  slug: string;
  title: string;
  status: ActivityStatus;
  is_featured: boolean;
  activity_date: string | null;
  location: string | null;
  cover_image_url: string | null;
  first_media_url?: string | null;
  published_at: string | null;
  created_at: string;
  created_by_name: string | null;
  media_count: number;
}

/** Returned by get_activity_by_id_with_session (admin edit) */
export interface AdminActivityDetail {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  description: string | null;
  activity_date: string | null;
  location: string | null;
  status: ActivityStatus;
  is_featured: boolean;
  cover_image_url: string | null;
  cover_storage_provider?: ActivityMediaStorageProvider | null;
  cover_original_object_key?: string | null;
  cover_original_filename?: string | null;
  cover_original_mime_type?: string | null;
  cover_original_bytes?: number | null;
  cover_original_width?: number | null;
  cover_original_height?: number | null;
  youtube_urls: string[];
  created_by: string | null;
  created_at: string;
  published_by: string | null;
  published_at: string | null;
  media: ActivityMediaItem[];
}

export interface ActivityMediaItem {
  id: string;
  activity_id: string;
  storage_url: string;
  storage_provider?: ActivityMediaStorageProvider | null;
  original_object_key?: string | null;
  original_filename?: string | null;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  width?: number | null;
  height?: number | null;
  display_order: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface ActivityCoverMediaPayload {
  cover_image_url?: string | null;
  cover_storage_provider?: ActivityMediaStorageProvider | null;
  cover_original_object_key?: string | null;
  cover_original_filename?: string | null;
  cover_original_mime_type?: string | null;
  cover_original_bytes?: number | null;
  cover_original_width?: number | null;
  cover_original_height?: number | null;
}

export interface ActivityGalleryMediaPayload {
  storage_url: string;
  storage_provider?: ActivityMediaStorageProvider | null;
  original_object_key?: string | null;
  original_filename?: string | null;
  mime_type?: string | null;
  file_size_bytes?: number | null;
  width?: number | null;
  height?: number | null;
  display_order?: number | null;
}

export interface ActivitySettings {
  max_gallery_images?: string;
  max_youtube_links?: string;
}

/**
 * Structured error codes returned by `draft-activity-content` edge function.
 * Mirrored on the client so the AI panel can render the right tone/copy
 * instead of dumping raw error strings.
 */
export type ActivityDraftErrorCode =
  | 'ai_disabled'
  | 'provider_unsupported'
  | 'no_api_key'
  | 'session_invalid'
  | 'permission_denied'
  | 'generation_failed';

/**
 * AI providers that the Activities drafting edge function actually supports
 * end-to-end today. Keep in sync with the provider router inside
 * `supabase/functions/draft-activity-content/index.ts`. Frontend gating uses
 * this set so the UI stops over-promising.
 */
export const ACTIVITY_AI_SUPPORTED_PROVIDERS: readonly AIProvider[] = ['openai'] as const;

export interface ActivityLimits {
  maxGalleryImages: number;
  maxYoutubeLinks: number;
}

export interface ActivitySummaryMetrics {
  total: number;
  published: number;
  drafts: number;
  archived: number;
  featured: number;
  total_photos: number;
  last_published_at: string | null;
}

interface ActivitiesRpcEnvelope<T> {
  success?: boolean;
  data?: T;
  total?: number;
  error?: string;
}

export interface ActivityMediaUploadResult {
  success: boolean;
  error?: string;
  storage_provider?: ActivityMediaStorageProvider;
  original_object_key?: string;
  original_filename?: string;
  mime_type?: string;
  bytes?: number | null;
  width?: number | null;
  height?: number | null;
  display_url_seed?: string;
}

export interface ActivityOriginalDownloadResult {
  success: boolean;
  error?: string;
  url?: string;
  filename?: string | null;
}

async function invokeEdgeFormData<T>(
  functionName: string,
  formData: FormData
): Promise<T> {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      apikey: supabaseAnonKey,
    },
    body: formData,
  });

  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) as T : ({} as T);
  if (!response.ok) {
    throw new Error((parsed as { error?: string })?.error || `Edge function ${functionName} failed`);
  }
  return parsed;
}

// ─────────────────────────────────────────────────────────────
// Activities Service
// ─────────────────────────────────────────────────────────────

export const activitiesService = {
  defaultLimits: {
    maxGalleryImages: 20,
    maxYoutubeLinks: 5,
  } satisfies ActivityLimits,

  // ── Public RPCs ──────────────────────────────────────────

  async getPublished(limit = 20, offset = 0): Promise<PublicActivity[]> {
    const { data, error } = await supabase.rpc('get_published_activities', {
      p_limit: limit,
      p_offset: offset,
    });
    if (error) {
      console.error('[activitiesService.getPublished]', error);
      throw error;
    }
    const result = data as ActivitiesRpcEnvelope<PublicActivity[]> | null;
    if (!result?.success) {
      throw new Error(result?.error || 'Failed to load published activities');
    }
    return result.data ?? [];
  },

  async getBySlug(slug: string): Promise<PublicActivityDetail | null> {
    const { data, error } = await supabase.rpc('get_activity_by_slug', {
      p_slug: slug,
    });
    if (error) {
      console.error('[activitiesService.getBySlug]', error);
      throw error;
    }
    const result = data as ActivitiesRpcEnvelope<PublicActivityDetail> | null;
    if (!result?.success) {
      if (result?.error === 'Activity not found') {
        return null;
      }
      throw new Error(result?.error || 'Failed to load activity');
    }
    return result.data ?? null;
  },

  // ── Admin read RPCs ──────────────────────────────────────

  async getAll(
    sessionToken: string
  ): Promise<AdminActivityListItem[]> {
    const { data, error } = await supabase.rpc(
      'get_all_activities_with_session',
      { p_session_token: sessionToken }
    );
    if (error) {
      console.error('[activitiesService.getAll]', error);
      throw error;
    }
    const result = data as ActivitiesRpcEnvelope<AdminActivityListItem[]> | null;
    if (!result?.success) {
      throw new Error(result?.error || 'Failed to load activities');
    }
    return result.data ?? [];
  },

  async getById(
    sessionToken: string,
    activityId: string
  ): Promise<AdminActivityDetail | null> {
    const { data, error } = await supabase.rpc(
      'get_activity_by_id_with_session',
      { p_session_token: sessionToken, p_activity_id: activityId }
    );
    if (error) {
      console.error('[activitiesService.getById]', error);
      throw error;
    }
    const result = data as ActivitiesRpcEnvelope<AdminActivityDetail> | null;
    if (!result?.success) {
      if (result?.error === 'Activity not found') {
        return null;
      }
      throw new Error(result?.error || 'Failed to load activity');
    }
    return result.data ?? null;
  },

  async getSettings(sessionToken: string): Promise<ActivitySettings> {
    const { data, error } = await supabase.rpc(
      'get_activity_settings_with_session',
      { p_session_token: sessionToken }
    );
    if (error) {
      console.error('[activitiesService.getSettings]', error);
      throw error;
    }
    const result = data as ActivitiesRpcEnvelope<ActivitySettings> | null;
    if (!result?.success) {
      throw new Error(result?.error || 'Failed to load activity settings');
    }
    return result.data ?? {};
  },

  getLimits(settings?: ActivitySettings | null): ActivityLimits {
    const parsePositiveInt = (value: string | undefined, fallback: number): number => {
      if (!value) return fallback;
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };

    return {
      maxGalleryImages: parsePositiveInt(
        settings?.max_gallery_images,
        activitiesService.defaultLimits.maxGalleryImages
      ),
      maxYoutubeLinks: parsePositiveInt(
        settings?.max_youtube_links,
        activitiesService.defaultLimits.maxYoutubeLinks
      ),
    };
  },

  // ── Admin write RPCs ─────────────────────────────────────

  async create(
    sessionToken: string,
    payload: {
      title: string;
      slug: string;
      excerpt?: string | null;
      description?: string | null;
      activity_date?: string | null;
      location?: string | null;
      is_featured?: boolean;
      cover_image_url?: string | null;
      clear_cover?: boolean;
      cover_storage_provider?: ActivityMediaStorageProvider | null;
      cover_original_object_key?: string | null;
      cover_original_filename?: string | null;
      cover_original_mime_type?: string | null;
      cover_original_bytes?: number | null;
      cover_original_width?: number | null;
      cover_original_height?: number | null;
      youtube_urls?: string[];
    }
  ): Promise<{ success: boolean; activity_id?: string; slug?: string; error?: string }> {
    const { data, error } = await supabase.rpc('create_activity_with_session', {
      p_session_token: sessionToken,
      p_title: payload.title,
      p_slug: payload.slug,
      p_excerpt: payload.excerpt ?? null,
      p_description: payload.description ?? null,
      p_activity_date: payload.activity_date ?? null,
      p_location: payload.location ?? null,
      p_is_featured: payload.is_featured ?? false,
      p_cover_image_url: payload.cover_image_url ?? null,
      p_cover_storage_provider: payload.cover_storage_provider ?? null,
      p_cover_original_object_key: payload.cover_original_object_key ?? null,
      p_cover_original_filename: payload.cover_original_filename ?? null,
      p_cover_original_mime_type: payload.cover_original_mime_type ?? null,
      p_cover_original_bytes: payload.cover_original_bytes ?? null,
      p_cover_original_width: payload.cover_original_width ?? null,
      p_cover_original_height: payload.cover_original_height ?? null,
      p_youtube_urls: payload.youtube_urls ?? [],
    });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; activity_id?: string; id?: string; slug?: string; error?: string };
    return result?.success
      ? { success: true, activity_id: result.activity_id ?? result.id, slug: result.slug }
      : (result ?? { success: false, error: 'Unknown error' });
  },

  async update(
    sessionToken: string,
    activityId: string,
    payload: {
      title?: string;
      slug?: string;
      excerpt?: string | null;
      description?: string | null;
      activity_date?: string | null;
      location?: string | null;
      is_featured?: boolean;
      cover_image_url?: string | null;
      clear_cover?: boolean;
      cover_storage_provider?: ActivityMediaStorageProvider | null;
      cover_original_object_key?: string | null;
      cover_original_filename?: string | null;
      cover_original_mime_type?: string | null;
      cover_original_bytes?: number | null;
      cover_original_width?: number | null;
      cover_original_height?: number | null;
      youtube_urls?: string[];
    }
  ): Promise<{ success: boolean; slug?: string; error?: string }> {
    const { data, error } = await supabase.rpc('update_activity_with_session', {
      p_session_token: sessionToken,
      p_activity_id: activityId,
      p_title: payload.title ?? null,
      p_slug: payload.slug ?? null,
      p_excerpt: payload.excerpt ?? null,
      p_description: payload.description ?? null,
      p_activity_date: payload.activity_date ?? null,
      p_location: payload.location ?? null,
      p_is_featured: payload.is_featured ?? null,
      p_cover_image_url: payload.cover_image_url ?? null,
      p_clear_cover: payload.clear_cover ?? false,
      p_cover_storage_provider: payload.cover_storage_provider ?? null,
      p_cover_original_object_key: payload.cover_original_object_key ?? null,
      p_cover_original_filename: payload.cover_original_filename ?? null,
      p_cover_original_mime_type: payload.cover_original_mime_type ?? null,
      p_cover_original_bytes: payload.cover_original_bytes ?? null,
      p_cover_original_width: payload.cover_original_width ?? null,
      p_cover_original_height: payload.cover_original_height ?? null,
      p_youtube_urls: payload.youtube_urls ?? null,
    });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; slug?: string; error?: string };
    return result ?? { success: false, error: 'Unknown error' };
  },

  async publish(
    sessionToken: string,
    activityId: string
  ): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('publish_activity_with_session', {
      p_session_token: sessionToken,
      p_activity_id: activityId,
    });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; error?: string };
    return result ?? { success: false, error: 'Unknown error' };
  },

  async unpublish(
    sessionToken: string,
    activityId: string
  ): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('unpublish_activity_with_session', {
      p_session_token: sessionToken,
      p_activity_id: activityId,
    });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; error?: string };
    return result ?? { success: false, error: 'Unknown error' };
  },

  async archive(
    sessionToken: string,
    activityId: string
  ): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('archive_activity_with_session', {
      p_session_token: sessionToken,
      p_activity_id: activityId,
    });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; error?: string };
    return result ?? { success: false, error: 'Unknown error' };
  },

  async delete(
    sessionToken: string,
    activityId: string
  ): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('delete_activity_with_session', {
      p_session_token: sessionToken,
      p_activity_id: activityId,
    });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; error?: string };
    return result ?? { success: false, error: 'Unknown error' };
  },

  async addMedia(
    sessionToken: string,
    activityId: string,
    payload: ActivityGalleryMediaPayload
  ): Promise<{ success: boolean; media_id?: string; error?: string }> {
    const { data, error } = await supabase.rpc('add_activity_media_with_session', {
      p_session_token: sessionToken,
      p_activity_id: activityId,
      p_storage_url: payload.storage_url,
      p_storage_provider: payload.storage_provider ?? null,
      p_original_object_key: payload.original_object_key ?? null,
      p_original_filename: payload.original_filename ?? null,
      p_mime_type: payload.mime_type ?? null,
      p_file_size_bytes: payload.file_size_bytes ?? null,
      p_width: payload.width ?? null,
      p_height: payload.height ?? null,
      p_display_order: payload.display_order ?? 0,
    });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; media_id?: string; id?: string; error?: string };
    return result?.success
      ? { success: true, media_id: result.media_id ?? result.id }
      : (result ?? { success: false, error: 'Unknown error' });
  },

  async removeMedia(
    sessionToken: string,
    mediaId: string
  ): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('remove_activity_media_with_session', {
      p_session_token: sessionToken,
      p_media_id: mediaId,
    });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; error?: string };
    return result ?? { success: false, error: 'Unknown error' };
  },

  async reorderMedia(
    sessionToken: string,
    activityId: string,
    orderedIds: string[]
  ): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('reorder_activity_media_with_session', {
      p_session_token: sessionToken,
      p_activity_id: activityId,
      p_media_ids: orderedIds,
    });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; error?: string };
    return result ?? { success: false, error: 'Unknown error' };
  },

  async uploadMedia(
    sessionToken: string,
    activityId: string,
    mediaKind: 'cover' | 'gallery',
    file: File,
    transform?: {
      trim?: {
        left: number;
        top: number;
        width: number;
        height: number;
      } | null;
    }
  ): Promise<ActivityMediaUploadResult> {
    try {
      const formData = new FormData();
      formData.set('session_token', sessionToken);
      formData.set('activity_id', activityId);
      formData.set('media_kind', mediaKind);
      formData.set('file', file);
      if (transform) {
        formData.set('transform', JSON.stringify(transform));
      }
      return await invokeEdgeFormData<ActivityMediaUploadResult>('activity-media-upload', formData);
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Media upload failed.',
      };
    }
  },

  async deleteOriginalObject(
    sessionToken: string,
    activityId: string,
    objectKey: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('activity-media-delete', {
        body: {
          session_token: sessionToken,
          activity_id: activityId,
          object_key: objectKey,
        },
      });
      if (error) {
        return { success: false, error: error.message };
      }
      return (data as { success: boolean; error?: string }) ?? { success: false, error: 'Delete failed.' };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Delete failed.',
      };
    }
  },

  async getOriginalDownloadUrl(
    sessionToken: string,
    payload: { activityId: string; mediaId?: string | null }
  ): Promise<ActivityOriginalDownloadResult> {
    try {
      const { data, error } = await supabase.functions.invoke('activity-media-original-download', {
        body: {
          session_token: sessionToken,
          activity_id: payload.activityId,
          media_id: payload.mediaId ?? null,
        },
      });
      if (error) {
        return { success: false, error: error.message };
      }
      return (data as ActivityOriginalDownloadResult) ?? { success: false, error: 'Download link failed.' };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Download link failed.',
      };
    }
  },

  async updateSetting(
    sessionToken: string,
    key: string,
    value: string
  ): Promise<{ success: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('update_activity_setting_with_session', {
      p_session_token: sessionToken,
      p_key: key,
      p_value: value,
    });
    if (error) return { success: false, error: error.message };
    const result = data as { success: boolean; error?: string };
    return result ?? { success: false, error: 'Unknown error' };
  },

  /**
   * Generate AI-assisted draft content (title, slug, excerpt, description) for
   * an Activities post. Routes through the `draft-activity-content` edge
   * function which validates the session token + permission server-side and
   * loads the AI provider/model/key from `ai_runtime_settings` via service
   * role. Browser never sees the API key.
   *
   * Optional `source_files` (≤ 3 items, JPEG / PNG / PDF) are sent to the
   * edge function as base64 + mime + name and consumed via OpenAI Responses
   * API on the server side as additional source material. Caller is
   * responsible for size limiting before encoding.
   */
  async draftContent(
    sessionToken: string,
    inputs: {
      activity_date?: string | null;
      location?: string | null;
      participants?: string | null;
      purpose?: string | null;
      host?: string | null;
      highlights?: string | null;
      outcome?: string | null;
      additional_notes?: string | null;
    },
    sourceFiles?: Array<{ name: string; mime: string; base64: string }>
  ): Promise<{
    success: boolean;
    error?: string;
    error_code?: ActivityDraftErrorCode;
    data?: { title: string; slug: string; excerpt: string; description: string };
  }> {
    try {
      const body: Record<string, unknown> = { session_token: sessionToken, inputs };
      if (Array.isArray(sourceFiles) && sourceFiles.length > 0) {
        body.source_files = sourceFiles;
      }
      const { data, error } = await supabase.functions.invoke('draft-activity-content', {
        body,
      });
      if (error) {
        return {
          success: false,
          error: error.message ?? 'AI drafting failed.',
          error_code: 'generation_failed',
        };
      }
      const result = data as {
        success?: boolean;
        error?: string;
        error_code?: ActivityDraftErrorCode;
        data?: { title?: string; slug?: string; excerpt?: string; description?: string };
      } | null;
      if (!result?.success || !result.data) {
        return {
          success: false,
          error: result?.error ?? 'AI drafting returned no content.',
          error_code: result?.error_code ?? 'generation_failed',
        };
      }
      return {
        success: true,
        data: {
          title: typeof result.data.title === 'string' ? result.data.title : '',
          slug: typeof result.data.slug === 'string' ? result.data.slug : '',
          excerpt: typeof result.data.excerpt === 'string' ? result.data.excerpt : '',
          description: typeof result.data.description === 'string' ? result.data.description : '',
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI drafting failed.';
      return { success: false, error: message, error_code: 'generation_failed' };
    }
  },

  /**
   * Calls `draft-activity-content` in `extract_fields` mode. Sends source
   * files and returns structured guided-input field values extracted by AI
   * from the document content. Used for auto-prefill in the AI panel.
   *
   * Returns `{ success: true, fields: {...} }` on success where each field
   * key is only present when the AI was able to determine it from the
   * documents. Returns `{ success: false, fields: {} }` on any failure —
   * callers should fall through gracefully (no error surface to the user).
   */
  async extractFields(
    sessionToken: string,
    sourceFiles: Array<{ name: string; mime: string; base64: string }>
  ): Promise<{
    success: boolean;
    error?: string;
    error_code?: ActivityDraftErrorCode;
    fields: {
      activity_date?: string;
      activity_date_options?: string[];
      location?: string;
      location_options?: string[];
      participants?: string;
      host?: string;
      purpose?: string;
      highlights?: string;
      outcome?: string;
      additional_notes?: string;
    };
  }> {
    try {
      const { data, error } = await supabase.functions.invoke('draft-activity-content', {
        body: {
          session_token: sessionToken,
          mode: 'extract_fields',
          source_files: sourceFiles,
        },
      });
      if (error) {
        return {
          success: false,
          error: error.message ?? 'Extraction failed.',
          error_code: 'generation_failed',
          fields: {},
        };
      }
      const result = data as {
        success?: boolean;
        error?: string;
        error_code?: ActivityDraftErrorCode;
        fields?: Record<string, unknown>;
      } | null;
      if (!result?.success) {
        return {
          success: false,
          error: result?.error ?? 'Extraction returned no content.',
          error_code: result?.error_code ?? 'generation_failed',
          fields: {},
        };
      }
      const raw = result.fields ?? {};
      const readStringArray = (key: string): string[] | undefined => {
        const value = raw[key];
        if (!Array.isArray(value)) return undefined;
        const values = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
        return values.length > 0 ? values : undefined;
      };
      return {
        success: true,
        fields: {
          activity_date: typeof raw.activity_date === 'string' ? raw.activity_date : undefined,
          activity_date_options: readStringArray('activity_date_options'),
          location: typeof raw.location === 'string' ? raw.location : undefined,
          location_options: readStringArray('location_options'),
          participants: typeof raw.participants === 'string' ? raw.participants : undefined,
          host: typeof raw.host === 'string' ? raw.host : undefined,
          purpose: typeof raw.purpose === 'string' ? raw.purpose : undefined,
          highlights: typeof raw.highlights === 'string' ? raw.highlights : undefined,
          outcome: typeof raw.outcome === 'string' ? raw.outcome : undefined,
          additional_notes: typeof raw.additional_notes === 'string' ? raw.additional_notes : undefined,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed.';
      return { success: false, error: message, error_code: 'generation_failed', fields: {} };
    }
  },

  // ── Derived helpers ──────────────────────────────────────

  /** Compute summary metrics from a list returned by getAll(). */
  computeMetrics(items: AdminActivityListItem[]): ActivitySummaryMetrics {
    const total = items.length;
    const published = items.filter((a) => a.status === 'published').length;
    const drafts = items.filter((a) => a.status === 'draft').length;
    const archived = items.filter((a) => a.status === 'archived').length;
    const featured = items.filter((a) => a.is_featured).length;
    const total_photos = items.reduce((sum, a) => sum + (a.media_count ?? 0), 0);
    const publishedItems = items.filter((a) => a.published_at);
    publishedItems.sort((a, b) =>
      (b.published_at ?? '').localeCompare(a.published_at ?? '')
    );
    const last_published_at = publishedItems.length > 0 ? publishedItems[0].published_at : null;
    return { total, published, drafts, archived, featured, total_photos, last_published_at };
  },
};

// ─── Roles & Privileges Types ────────────────────────────────────────────────

export interface RoleCatalog {
  name: string;
  display_name: string;
  description: string | null;
  is_system: boolean;
  is_paused: boolean;
  sort_order: number;
  created_by: string | null;
  permission_count: number;
  user_count: number;
}

export interface UserSearchResult {
  user_id: string;
  email: string;
  mobile_number: string | null;
  account_type: string;
  current_role: string | null;
  role_record_id: string | null;
  full_name: string | null;
  company_name: string | null;
}

export interface RolePermissionItem {
  code: string;
  name: string;
  category: string;
  description: string | null;
  is_granted: boolean;
}

export interface PermissionCatalogItem {
  code: string;
  name: string;
  description: string | null;
  category: string;
}

export interface UserWithRole {
  user_id: string;
  email: string;
  account_type: string;
  role: string | null;
  role_record_id: string | null;
  override_count: number;
}

export interface UserPermissionOverride {
  id: string;
  permission_code: string;
  permission_name: string;
  category: string;
  override_type: 'grant' | 'revoke';
  reason: string | null;
  created_at: string;
}

export interface UserEffectivePermission {
  code: string;
  name: string;
  category: string;
  source: 'role' | 'grant';
}

export interface RolesMetrics {
  total_roles: number;
  users_with_overrides: number;
  total_overrides: number;
  users_per_role: Record<string, number>;
}

export interface RolesManagementAccess {
  can_manage: boolean;
  can_view: boolean;
  is_super_admin: boolean;
}

// ─── Roles Service ────────────────────────────────────────────────────────────

export const rolesService = {
  async listRoles(sessionToken: string): Promise<RoleCatalog[]> {
    const { data, error } = await supabase.rpc('list_roles_with_session', {
      p_session_token: sessionToken,
    });
    if (error) throw error;
    const result = data as { success: boolean; data?: RoleCatalog[]; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to list roles');
    return result.data ?? [];
  },

  async listRolePermissions(sessionToken: string, roleName: string): Promise<RolePermissionItem[]> {
    const { data, error } = await supabase.rpc('list_role_permissions_with_session', {
      p_session_token: sessionToken,
      p_role_name: roleName,
    });
    if (error) throw error;
    const result = data as { success: boolean; data?: RolePermissionItem[]; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to list role permissions');
    return result.data ?? [];
  },

  async listPermissionsCatalog(sessionToken: string): Promise<PermissionCatalogItem[]> {
    const { data, error } = await supabase.rpc('list_permissions_catalog_with_session', {
      p_session_token: sessionToken,
    });
    if (error) throw error;
    const result = data as { success: boolean; data?: PermissionCatalogItem[]; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to list permissions');
    return result.data ?? [];
  },

  async listUsersWithRoles(sessionToken: string): Promise<UserWithRole[]> {
    const { data, error } = await supabase.rpc('list_users_with_roles_for_admin_with_session', {
      p_session_token: sessionToken,
    });
    if (error) throw error;
    const result = data as { success: boolean; data?: UserWithRole[]; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to list users');
    return result.data ?? [];
  },

  async getUserPermissionOverrides(sessionToken: string, targetUserId: string): Promise<UserPermissionOverride[]> {
    const { data, error } = await supabase.rpc('get_user_permission_overrides_with_session', {
      p_session_token: sessionToken,
      p_target_user_id: targetUserId,
    });
    if (error) throw error;
    const result = data as { success: boolean; data?: UserPermissionOverride[]; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to get overrides');
    return result.data ?? [];
  },

  async getUserEffectivePermissions(sessionToken: string, targetUserId: string): Promise<{ permissions: UserEffectivePermission[]; role: string | null }> {
    const { data, error } = await supabase.rpc('get_user_effective_permissions_with_session', {
      p_session_token: sessionToken,
      p_target_user_id: targetUserId,
    });
    if (error) throw error;
    const result = data as { success: boolean; data?: UserEffectivePermission[]; role?: string | null; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to get effective permissions');
    return { permissions: result.data ?? [], role: result.role ?? null };
  },

  async getMetrics(sessionToken: string): Promise<RolesMetrics> {
    const { data, error } = await supabase.rpc('get_roles_metrics_with_session', {
      p_session_token: sessionToken,
    });
    if (error) throw error;
    const result = data as { success: boolean; error?: string } & RolesMetrics;
    if (!result.success) throw new Error(result.error ?? 'Failed to get metrics');
    return {
      total_roles: result.total_roles,
      users_with_overrides: result.users_with_overrides,
      total_overrides: result.total_overrides,
      users_per_role: result.users_per_role,
    };
  },

  async grantRolePermission(sessionToken: string, role: string, permissionCode: string): Promise<void> {
    const { data, error } = await supabase.rpc('grant_role_permission_with_session', {
      p_session_token: sessionToken,
      p_role: role,
      p_permission_code: permissionCode,
    });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to grant permission');
  },

  async revokeRolePermission(sessionToken: string, role: string, permissionCode: string): Promise<void> {
    const { data, error } = await supabase.rpc('revoke_role_permission_with_session', {
      p_session_token: sessionToken,
      p_role: role,
      p_permission_code: permissionCode,
    });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to revoke permission');
  },

  async addUserGrantOverride(sessionToken: string, targetUserId: string, permissionCode: string, reason?: string): Promise<void> {
    const { data, error } = await supabase.rpc('add_user_grant_override_with_session', {
      p_session_token: sessionToken,
      p_target_user_id: targetUserId,
      p_permission_code: permissionCode,
      p_reason: reason ?? null,
    });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to add grant override');
  },

  async addUserRevokeOverride(sessionToken: string, targetUserId: string, permissionCode: string, reason?: string): Promise<void> {
    const { data, error } = await supabase.rpc('add_user_revoke_override_with_session', {
      p_session_token: sessionToken,
      p_target_user_id: targetUserId,
      p_permission_code: permissionCode,
      p_reason: reason ?? null,
    });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to add revoke override');
  },

  async removeUserOverride(sessionToken: string, overrideId: string): Promise<void> {
    const { data, error } = await supabase.rpc('remove_user_permission_override_with_session', {
      p_session_token: sessionToken,
      p_override_id: overrideId,
    });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to remove override');
  },

  async clearUserOverrides(sessionToken: string, targetUserId: string): Promise<number> {
    const { data, error } = await supabase.rpc('clear_user_permission_overrides_with_session', {
      p_session_token: sessionToken,
      p_target_user_id: targetUserId,
    });
    if (error) throw error;
    const result = data as { success: boolean; deleted_count?: number; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to clear overrides');
    return result.deleted_count ?? 0;
  },

  async checkManagementAccess(sessionToken: string): Promise<RolesManagementAccess> {
    const { data, error } = await supabase.rpc('check_roles_management_access_with_session', {
      p_session_token: sessionToken,
    });
    if (error) throw error;
    const result = data as { success: boolean; error?: string } & RolesManagementAccess;
    if (!result.success) throw new Error(result.error ?? 'Failed to check access');
    return {
      can_manage: result.can_manage,
      can_view: result.can_view,
      is_super_admin: result.is_super_admin,
    };
  },

  // ─── Custom role lifecycle ────────────────────────────────────────────────

  async createRole(
    sessionToken: string,
    name: string,
    displayName: string,
    description?: string,
  ): Promise<{ name: string }> {
    const { data, error } = await supabase.rpc('create_role_with_session', {
      p_session_token: sessionToken,
      p_name: name,
      p_display_name: displayName,
      p_description: description ?? null,
    });
    if (error) throw error;
    const result = data as { success: boolean; name?: string; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to create role');
    return { name: result.name ?? name };
  },

  async updateRole(
    sessionToken: string,
    roleName: string,
    updates: { display_name?: string; description?: string | null },
  ): Promise<void> {
    const { data, error } = await supabase.rpc('update_role_with_session', {
      p_session_token: sessionToken,
      p_role_name: roleName,
      p_display_name: updates.display_name ?? null,
      p_description: updates.description ?? null,
    });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to update role');
  },

  async cloneRole(
    sessionToken: string,
    sourceRole: string,
    newName: string,
    newDisplayName: string,
    newDescription?: string,
  ): Promise<{ name: string; permissions_copied: number }> {
    const { data, error } = await supabase.rpc('clone_role_with_session', {
      p_session_token: sessionToken,
      p_source_role: sourceRole,
      p_new_name: newName,
      p_new_display: newDisplayName,
      p_new_description: newDescription ?? null,
    });
    if (error) throw error;
    const result = data as { success: boolean; name?: string; permissions_copied?: number; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to clone role');
    return { name: result.name ?? newName, permissions_copied: result.permissions_copied ?? 0 };
  },

  async pauseRole(sessionToken: string, roleName: string): Promise<void> {
    const { data, error } = await supabase.rpc('pause_role_with_session', {
      p_session_token: sessionToken,
      p_role_name: roleName,
    });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to pause role');
  },

  async unpauseRole(sessionToken: string, roleName: string): Promise<void> {
    const { data, error } = await supabase.rpc('unpause_role_with_session', {
      p_session_token: sessionToken,
      p_role_name: roleName,
    });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to unpause role');
  },

  async deleteRole(sessionToken: string, roleName: string): Promise<void> {
    const { data, error } = await supabase.rpc('delete_role_with_session', {
      p_session_token: sessionToken,
      p_role_name: roleName,
    });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to delete role');
  },

  // ─── User-role assignment ─────────────────────────────────────────────────

  async assignUserRole(
    sessionToken: string,
    targetUserId: string,
    roleName: string,
  ): Promise<void> {
    const { data, error } = await supabase.rpc('assign_user_role_with_session', {
      p_session_token: sessionToken,
      p_target_user_id: targetUserId,
      p_role_name: roleName,
    });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to assign role');
  },

  async changeUserRole(
    sessionToken: string,
    roleRecordId: string,
    newRoleName: string,
  ): Promise<void> {
    const { data, error } = await supabase.rpc('change_user_role_with_session', {
      p_session_token: sessionToken,
      p_role_record_id: roleRecordId,
      p_new_role_name: newRoleName,
    });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to change role');
  },

  async removeUserRoleSafe(sessionToken: string, roleRecordId: string): Promise<void> {
    const { data, error } = await supabase.rpc('remove_user_role_safe_with_session', {
      p_session_token: sessionToken,
      p_role_record_id: roleRecordId,
    });
    if (error) throw error;
    const result = data as { success: boolean; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to remove role');
  },

  async searchUsersForRoleAssignment(
    sessionToken: string,
    query: string,
    limit = 25,
  ): Promise<UserSearchResult[]> {
    const { data, error } = await supabase.rpc('search_users_for_role_assignment_with_session', {
      p_session_token: sessionToken,
      p_query: query,
      p_limit: limit,
    });
    if (error) throw error;
    const result = data as { success: boolean; data?: UserSearchResult[]; error?: string };
    if (!result.success) throw new Error(result.error ?? 'Failed to search users');
    return result.data ?? [];
  },
};

// Leadership Service
export const leadershipService = {
  async getCommitteeYears(): Promise<string[]> {
    const { data, error } = await supabase.rpc('get_public_committee_years');

    if (error) {
      console.error('[leadershipService.getCommitteeYears] RPC error:', error);
      throw error;
    }

    const years = (data as { committee_year: string | null }[] | null | undefined) ?? [];

    // Filter out null/empty, dedupe defensively, and sort descending
    const filtered = Array.from(
      new Set(
        years
          .map((row) => (row?.committee_year ?? '').trim())
          .filter((y) => y.length > 0)
      )
    ).sort((a, b) => b.localeCompare(a));

    return filtered;
  }
};
