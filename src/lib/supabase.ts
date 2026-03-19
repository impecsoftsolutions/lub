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
  role: 'super_admin' | 'admin' | 'editor' | 'viewer';
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
      
      data?.forEach((roleData: any) => {
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

      const { data, error } = await supabase.storage
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

      const { data, error } = await supabase.storage
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

  async getMyMemberRegistrationByToken(sessionToken: string): Promise<{ data: any | null; error: string | null }> {
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

      let row: any | null = null;
      if (Array.isArray(data)) {
        row = data.length > 0 ? data[0] : null;
      } else if (data && typeof data === 'object') {
        row = data;
      }

      return { data: row, error: null };
    } catch (error) {
      console.error('[getMyMemberRegistrationByToken] Unexpected error:', error);
      return { data: null, error: 'An unexpected error occurred' };
    }
  },

  async submitRegistration(
    registrationData: any,
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
    updates: any,
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
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to delete member' };
    }
  },

  async updateStatusWithReason(
    memberId: string,
    status: 'approved' | 'rejected',
    sessionToken: string,
    rejectionReason?: string
  ): Promise<{ success: boolean; error?: string; data?: any }> {
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
      const result = data as { success: boolean; error?: string; registration?: any };

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

  async getApplicationDetails(applicationId: string, sessionToken: string): Promise<{ success: boolean; data?: any; error?: string }> {
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
      const registration = data && data.length > 0 ? data[0] : null;

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
      const mappedData = data.map((row: any) => ({
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

export const validationRulesService = {
  async getAllValidationRules(): Promise<ValidationRule[]> {
    try {
      const { data, error } = await supabase
        .from('validation_rules')
        .select('*')
        .order('display_order');

      if (error) {
        throw error;
      }

      return data || [];
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
    updates: { validation_pattern?: string; error_message?: string; is_active?: boolean }
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
        p_error_message: updates.error_message ?? null
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
      const { data, error } = await supabase
        .from('validation_rules')
        .select('category')
        .order('category');

      if (error) {
        throw error;
      }

      const uniqueCategories = [...new Set((data || []).map(item => item.category))];
      return uniqueCategories.sort();
    } catch (error) {
      console.error('Error fetching categories:', error);
      return [];
    }
  },

  async checkRuleNameExists(ruleName: string, excludeId?: string): Promise<boolean> {
    try {
      const lowerRuleName = ruleName.toLowerCase();

      let query = supabase
        .from('validation_rules')
        .select('id')
        .ilike('rule_name', lowerRuleName);

      if (excludeId) {
        query = query.neq('id', excludeId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error('Error checking rule name:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('Error checking rule name:', error);
      return false;
    }
  },

  async getMaxDisplayOrder(): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('validation_rules')
        .select('display_order')
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error getting max display order:', error);
        return 0;
      }

      return data?.display_order || 0;
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
