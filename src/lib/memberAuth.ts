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

interface SignUpResult {
  success: boolean;
  error: string | null;
  data: User | null;
  user?: User;
  sessionToken?: string;
  expiresAt?: string;
}

export const memberAuthService = {
  async signUpMember(email: string, mobile_number: string): Promise<SignUpResult> {
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

      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;
      const { data, error: rpcError } = await supabase.rpc('create_portal_user_with_session', {
        p_email: normalizedEmail,
        p_mobile_number: normalizedMobile,
        p_ip_address: null,
        p_user_agent: userAgent
      });

      if (rpcError) {
        console.error('[memberAuthService] User creation RPC error:', rpcError);
        return {
          success: false,
          error: 'Failed to create account. Please try again.',
          data: null
        };
      }

      const result = Array.isArray(data) ? data[0] : data;

      if (!result?.success || !result?.user || !result?.sessionToken || !result?.expiresAt) {
        return {
          success: false,
          error: result?.error || 'Failed to create account. Please try again.',
          data: null
        };
      }

      console.log('[memberAuthService] User created successfully:', result.user.id);
      return {
        success: true,
        data: result.user as User,
        user: result.user as User,
        sessionToken: result.sessionToken as string,
        expiresAt: result.expiresAt as string,
        error: null
      };
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
      const sessionToken = sessionManager.getSessionToken();

      if (sessionToken) {
        await customAuth.signOut(sessionToken);
      }

      sessionManager.clearSession();
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
        sessionManager.clearSession();
        return null;
      }

      // Cached user data exists for diagnostics and write helpers, but current reads
      // intentionally validate the active session instead of returning a local fast-path.
      sessionManager.getUserData();

      // If no cache or bypassCache is true, fetch from database
      if (bypassCache) {
        console.log('[memberAuthService] Bypassing cache, fetching fresh data from database...');
      } else {
        console.log('[memberAuthService] Validating session before using cached user data...');
      }

      const validation = await customAuth.validateSession(sessionToken);

      if (!validation.isValid || !validation.user) {
        console.log('[memberAuthService] No user found for session token');
        sessionManager.clearSession();
        return null;
      }

      const user = validation.user;

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
      const member = await this.getCurrentMember();
      return member !== null;
    } catch (error) {
      console.error('Check authentication error:', error);
      return false;
    }
  },

  async updateMemberProfile(memberId: string, updates: Partial<MemberData>) {
    try {
      const cachedUser = sessionManager.getUserData();

      if (!cachedUser?.id) {
        return { success: false, error: 'Not authenticated' };
      }

      const protectedFields = ['user_id', 'status', 'approval_date', 'member_id', 'is_legacy_member', 'created_at', 'updated_at'];
      const updateData: Record<string, unknown> = { ...updates };

      protectedFields.forEach(field => delete updateData[field]);

      updateData.last_modified_by = cachedUser.id;
      updateData.last_modified_at = new Date().toISOString();

      const { error } = await supabase
        .from('member_registrations')
        .update(updateData)
        .eq('id', memberId)
        .eq('user_id', cachedUser.id);

      if (error) {
        return { success: false, error: error.message };
      }

      // Update cached user data after profile update
      const cachedUserData = sessionManager.getUserData();
      if (cachedUserData) {
        const updatedUser = { ...cachedUserData, ...updates };
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
