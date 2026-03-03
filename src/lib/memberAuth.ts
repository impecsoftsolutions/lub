import { supabase } from './supabase';
import { customAuth, normalizeEmail, normalizeMobileNumber } from './customAuth';
import { sessionManager } from './sessionManager';
import type { User } from '../types/auth.types';

export interface MemberData {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  mobile_number: string;
  company_name: string;
  status: 'pending' | 'approved' | 'rejected';
  approval_date: string | null;
  rejection_reason: string | null;
  reapplication_count: number;
  member_id: string | null;
  profile_photo_url: string | null;
  account_type?: 'admin' | 'member' | 'both' | 'general_user';
  created_at: string;
}

export const memberAuthService = {
  async signUpMember(email: string, mobile_number: string) {
    try {
      const normalizedEmail = normalizeEmail(email);
      const normalizedMobile = normalizeMobileNumber(mobile_number);
      console.log('[memberAuthService] Sign up attempt for:', normalizedEmail);

      if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return {
          success: false,
          error: 'Please enter a valid email address.',
          data: null
        };
      }

      if (!/^[1-9][0-9]{9}$/.test(normalizedMobile)) {
        return {
          success: false,
          error: 'Mobile number must be exactly 10 digits.',
          data: null
        };
      }

      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          email: normalizedEmail,
          mobile_number: normalizedMobile,
          account_type: 'general_user',
          account_status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error('[memberAuthService] User creation error:', insertError);

        const duplicateField = `${insertError.details || ''} ${insertError.message || ''}`.toLowerCase();
        let errorMessage = 'Failed to create account. Please try again.';

        if (insertError.code === '23505') {
          if (duplicateField.includes('email')) {
            errorMessage = 'This email address is already registered. You can either sign in to your account or register with a different email address.';
          } else if (duplicateField.includes('mobile')) {
            errorMessage = 'This mobile number is already registered. You can either sign in to your account or register with a different mobile number.';
          } else {
            errorMessage = 'This email address or mobile number is already registered.';
          }
        }

        return {
          success: false,
          error: errorMessage,
          data: null
        };
      }

      console.log('[memberAuthService] User created successfully:', newUser.id);
      return { success: true, data: newUser, error: null };
    } catch (error) {
      console.error('[memberAuthService] Sign up error:', error);
      return {
        success: false,
        error: 'An unexpected error occurred',
        data: null
      };
    }
  },

  async signInMember(email: string, password: string) {
    console.warn('[memberAuthService] signInMember is deprecated', email, password ? 'with password input' : '');
    return {
      success: false,
      error: 'Password-based authentication is no longer supported.',
      data: null
    };
  },

  async signInWithMobile(mobileNumber: string, password: string) {
    console.warn('[memberAuthService] signInWithMobile is deprecated', mobileNumber, password ? 'with password input' : '');
    return {
      success: false,
      error: 'Password-based authentication is no longer supported.',
      data: null
    };
  },

  async signOutMember() {
    try {
      // Clear custom auth session (includes user data)
      sessionManager.clearSession();
      
      // Also clear Supabase session if exists
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.warn('Supabase sign out error (may be expected):', error.message);
      }
      return { success: true, error: null };
    } catch (error) {
      console.error('Sign out error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async getCurrentMember(bypassCache: boolean = false): Promise<MemberData | null> {
    try {
      const sessionToken = sessionManager.getSessionToken();

      if (!sessionToken || sessionManager.isSessionExpired()) {
        console.log('[memberAuthService] No valid session token found');
        return null;
      }

      // Get user data from localStorage cache (INSTANT - no database call!)
      const cachedUser = sessionManager.getUserData();

      if (cachedUser && !bypassCache) {
        console.log('[memberAuthService] Returning cached user data from localStorage');

        // Map to MemberData format
        const memberData: MemberData = {
          id: cachedUser.id,
          user_id: cachedUser.id,
          full_name: cachedUser.full_name || '',
          email: cachedUser.email,
          mobile_number: cachedUser.mobile_number,
          company_name: cachedUser.company_name || '',
          status: cachedUser.status as 'pending' | 'approved' | 'rejected',
          approval_date: cachedUser.approval_date || null,
          rejection_reason: cachedUser.rejection_reason || null,
          reapplication_count: cachedUser.reapplication_count || 0,
          member_id: cachedUser.member_id || null,
          profile_photo_url: cachedUser.profile_photo_url || null,
          account_type: cachedUser.account_type || 'member', // ✅ FIXED: Include account_type
          created_at: cachedUser.created_at || new Date().toISOString()
        };

        return memberData;
      }

      // If no cache or bypassCache is true, fetch from database
      if (bypassCache) {
        console.log('[memberAuthService] Bypassing cache, fetching fresh data from database...');
      } else {
        console.log('[memberAuthService] No cached user, fetching from database...');
      }

      const user = await customAuth.getCurrentUserFromSession();

      if (!user) {
        console.log('[memberAuthService] No user found for session token');
        return null;
      }

      console.log('[memberAuthService] User fetched from database:', user.email);
      const extendedUser = user as User & Partial<MemberData>;

      // FIXED: Fetch member registration data with JOIN
      const memberData: MemberData = {
        id: user.id,
        user_id: user.id,
        full_name: extendedUser.full_name || '',
        email: user.email,
        mobile_number: user.mobile_number || '',
        company_name: extendedUser.company_name || '',
        status: extendedUser.status || 'pending',
        approval_date: extendedUser.approval_date || null,
        rejection_reason: extendedUser.rejection_reason || null,
        reapplication_count: extendedUser.reapplication_count || 0,
        member_id: extendedUser.member_id || null,
        profile_photo_url: extendedUser.profile_photo_url || null,
        account_type: user.account_type,
        created_at: user.created_at || new Date().toISOString()
      };

      // Save combined data to cache for next time
      sessionManager.saveUserData(memberData);

      return memberData;
    } catch (error) {
      console.error('[memberAuthService] Get current member error:', error);
      return null;
    }
  },

  async forceRefreshMember(): Promise<MemberData | null> {
    try {
      console.log('[memberAuthService] Force refreshing member data - clearing cache...');

      // Clear the user data cache (but keep session token)
      sessionManager.clearUserDataCache();

      // Fetch fresh data from database
      const freshData = await this.getCurrentMember(true);

      if (freshData) {
        console.log('[memberAuthService] Fresh member data loaded successfully');
      } else {
        console.log('[memberAuthService] Failed to load fresh member data');
      }

      return freshData;
    } catch (error) {
      console.error('[memberAuthService] Error force refreshing member:', error);
      return null;
    }
  },

  async getMemberByUserId(userId: string): Promise<MemberData | null> {
    try {
      const { data, error } = await supabase
        .from('member_registrations')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return data as MemberData;
    } catch (error) {
      console.error('Get member by user ID error:', error);
      return null;
    }
  },

  async isMemberAuthenticated(): Promise<boolean> {
    try {
      const sessionToken = sessionManager.getSessionToken();
      
      if (!sessionToken || sessionManager.isSessionExpired()) {
        return false;
      }

      // Check if we have cached user data (fast check)
      const cachedUser = sessionManager.getUserData();
      if (cachedUser) {
        return true;
      }

      // Fallback to database check
      const user = await customAuth.getCurrentUserFromSession();
      return user !== null;
    } catch (error) {
      console.error('Check authentication error:', error);
      return false;
    }
  },

  async updateMemberProfile(memberId: string, updates: Partial<MemberData>) {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      const protectedFields = ['user_id', 'status', 'approval_date', 'member_id', 'is_legacy_member', 'created_at', 'updated_at'];
      const updateData: Record<string, unknown> = { ...updates };

      protectedFields.forEach(field => delete updateData[field]);

      updateData.last_modified_by = user.id;
      updateData.last_modified_at = new Date().toISOString();

      const { error } = await supabase
        .from('member_registrations')
        .update(updateData)
        .eq('id', memberId)
        .eq('user_id', user.id);

      if (error) {
        return { success: false, error: error.message };
      }

      // Update cached user data after profile update
      const cachedUser = sessionManager.getUserData();
      if (cachedUser) {
        const updatedUser = { ...cachedUser, ...updates };
        sessionManager.saveUserData(updatedUser);
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('Update member profile error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async changePassword(newPassword: string) {
    console.warn('[memberAuthService] changePassword is deprecated', newPassword ? 'with password input' : '');
    return {
      success: false,
      error: 'Password-based authentication is no longer supported.'
    };
  },

  async requestPasswordReset(email: string) {
    console.warn('[memberAuthService] requestPasswordReset is deprecated', email);
    return {
      success: false,
      error: 'Password-based authentication is no longer supported.'
    };
  },

  async resetPassword(newPassword: string) {
    console.warn('[memberAuthService] resetPassword is deprecated', newPassword ? 'with password input' : '');
    return {
      success: false,
      error: 'Password-based authentication is no longer supported.'
    };
  },

  async checkEmailExists(email: string): Promise<boolean> {
    console.warn('[memberAuthService] checkEmailExists is deprecated', email);
    return false;
  },

  async checkMobileExists(mobileNumber: string): Promise<boolean> {
    console.warn('[memberAuthService] checkMobileExists is deprecated', mobileNumber);
    return false;
  },

  async createOrUpdateProfileChangeRequest(params: {
    memberId: string;
    changeType: 'email_change' | 'mobile_change' | 'profile_update';
    currentData: Record<string, unknown>;
    requestedData: Record<string, unknown>;
    changedFields: string[];
    changeReason?: string;
  }) {
    try {
      console.log('[memberAuthService] Creating or updating profile change request for member:', params.memberId);

      const cachedUser = sessionManager.getUserData();

      if (!cachedUser || !cachedUser.id) {
        console.error('[memberAuthService] No authenticated user found');
        return {
          success: false,
          isUpdate: false,
          error: 'Not authenticated. Please log in again.'
        };
      }

      const { data: existingRequest, error: checkError } = await supabase
        .from('member_profile_change_requests')
        .select('id, current_data, requested_data, changed_fields, change_type, change_reason')
        .eq('member_id', params.memberId)
        .eq('status', 'pending')
        .maybeSingle();

      if (checkError) {
        console.error('[memberAuthService] Error checking for existing request:', checkError);
        return {
          success: false,
          isUpdate: false,
          error: 'Failed to check for existing requests'
        };
      }

      if (existingRequest) {
        console.log('[memberAuthService] Found existing pending request, updating it...');
        console.log('[memberAuthService] Existing request ID:', existingRequest.id);

        const mergedCurrentData = {
          ...existingRequest.current_data,
          ...params.currentData
        };

        const mergedRequestedData = {
          ...existingRequest.requested_data,
          ...params.requestedData
        };

        const mergedChangedFields = Array.from(
          new Set([...existingRequest.changed_fields, ...params.changedFields])
        );

        let combinedChangeType = params.changeType;

        if (mergedChangedFields.includes('email') && mergedChangedFields.includes('mobile_number')) {
          combinedChangeType = 'profile_update';
        } else if (mergedChangedFields.includes('email')) {
          combinedChangeType = 'email_change';
        } else if (mergedChangedFields.includes('mobile_number')) {
          combinedChangeType = 'mobile_change';
        }

        const { error: updateError } = await supabase
          .from('member_profile_change_requests')
          .update({
            change_type: combinedChangeType,
            current_data: mergedCurrentData,
            requested_data: mergedRequestedData,
            changed_fields: mergedChangedFields,
            change_reason: params.changeReason || existingRequest.change_reason,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRequest.id);

        if (updateError) {
          console.error('[memberAuthService] Error updating change request:', updateError);
          return {
            success: false,
            isUpdate: true,
            error: 'Failed to update change request'
          };
        }

        console.log('[memberAuthService] Successfully updated pending request');
        return {
          success: true,
          isUpdate: true,
          error: null,
          requestId: existingRequest.id
        };
      }

      console.log('[memberAuthService] No pending request found, creating new one...');

      let changeType = params.changeType;
      if (params.changedFields.includes('email') && params.changedFields.includes('mobile_number')) {
        changeType = 'profile_update';
      } else if (params.changedFields.includes('email')) {
        changeType = 'email_change';
      } else if (params.changedFields.includes('mobile_number')) {
        changeType = 'mobile_change';
      }

      const { data: newRequest, error: insertError } = await supabase
        .from('member_profile_change_requests')
        .insert({
          member_id: params.memberId,
          requested_by: cachedUser.id,
          change_type: changeType,
          current_data: params.currentData,
          requested_data: params.requestedData,
          changed_fields: params.changedFields,
          change_reason: params.changeReason || null,
          status: 'pending'
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[memberAuthService] Error creating change request:', insertError);

        if (insertError.message?.includes('duplicate') || insertError.code === '23505') {
          return {
            success: false,
            isUpdate: false,
            error: 'You already have a pending change request. Please wait for admin review.'
          };
        }

        return {
          success: false,
          isUpdate: false,
          error: 'Failed to create change request'
        };
      }

      console.log('[memberAuthService] Successfully created new change request:', newRequest.id);
      return {
        success: true,
        isUpdate: false,
        error: null,
        requestId: newRequest.id
      };

    } catch (error) {
      console.error('[memberAuthService] Unexpected error in createOrUpdateProfileChangeRequest:', error);
      return {
        success: false,
        isUpdate: false,
        error: 'An unexpected error occurred'
      };
    }
  },

  async getPendingChangeRequest(memberId: string) {
    try {
      console.log('[memberAuthService] Fetching pending change request for member:', memberId);

      const { data, error } = await supabase
        .from('member_profile_change_requests')
        .select('*')
        .eq('member_id', memberId)
        .eq('status', 'pending')
        .maybeSingle();

      if (error) {
        console.error('[memberAuthService] Error fetching pending request:', error);
        return { success: false, data: null, error: error.message };
      }

      if (!data) {
        console.log('[memberAuthService] No pending request found');
        return { success: true, data: null, error: null };
      }

      console.log('[memberAuthService] Found pending request:', data.id);
      return { success: true, data, error: null };

    } catch (error) {
      console.error('[memberAuthService] Unexpected error in getPendingChangeRequest:', error);
      return {
        success: false,
        data: null,
        error: 'An unexpected error occurred'
      };
    }
  },

  async checkEmailMobileUniqueness(
    email: string | null,
    mobileNumber: string | null,
    currentMemberId: string
  ) {
    console.warn(
      '[memberAuthService] checkEmailMobileUniqueness is deprecated',
      email,
      mobileNumber,
      currentMemberId
    );
    return {
      success: true,
      emailExists: false,
      mobileExists: false,
      error: null
    };
  }
};
