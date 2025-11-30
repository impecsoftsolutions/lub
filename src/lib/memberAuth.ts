import { supabase } from './supabase';
import { customAuth } from './customAuth';
import { sessionManager } from './sessionManager';

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
  account_type?: 'admin' | 'member' | 'both'; // ✅ ADDED: To check admin access
  created_at: string;
}

export const memberAuthService = {
  async signUpMember(email: string, mobile_number: string, password: string) {
    try {
      console.log('[memberAuthService] Sign up attempt for:', email);

      // Hash the password using the same function that login uses
      const { data: passwordHash, error: hashError } = await supabase.rpc(
        'hash_password',
        { password }
      );

      if (hashError || !passwordHash) {
        console.error('[memberAuthService] Password hashing error:', hashError);
        return {
          success: false,
          error: 'Failed to process password. Please try again.',
          data: null
        };
      }

      // Insert user directly into users table
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          email: email.toLowerCase(),
          mobile_number: mobile_number,
          password_hash: passwordHash,
          account_type: 'general_user',
          account_status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        console.error('[memberAuthService] User creation error:', insertError);
        return {
          success: false,
          error: 'Failed to create account. Email may already be in use.',
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
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        return { success: false, error: error.message, data: null };
      }

      return { success: true, data, error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      return { success: false, error: 'An unexpected error occurred', data: null };
    }
  },

  async signInWithMobile(mobileNumber: string, password: string) {
    try {
      const { data: memberData, error: lookupError } = await supabase
        .from('member_registrations')
        .select('email')
        .eq('mobile_number', mobileNumber)
        .maybeSingle();

      if (lookupError) {
        return { success: false, error: 'Failed to find account with this mobile number', data: null };
      }

      if (!memberData) {
        return { success: false, error: 'No account found with this mobile number', data: null };
      }

      return await this.signInMember(memberData.email, password);
    } catch (error) {
      console.error('Sign in with mobile error:', error);
      return { success: false, error: 'An unexpected error occurred', data: null };
    }
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

      // FIXED: Fetch member registration data with JOIN
      const { data: memberReg, error: memberError } = await supabase
        .from('member_registrations')
        .select('*')
        .eq('email', user.email)
        .maybeSingle();

      if (memberError) {
        console.error('[memberAuthService] Error fetching member registration:', memberError);
      }

      // Map combined user data
      const memberData: MemberData = {
        id: user.id,
        user_id: user.id,
        full_name: memberReg?.full_name || '', // FIXED: Get from member_registrations
        email: user.email,
        mobile_number: user.mobile_number || memberReg?.mobile_number || '',
        company_name: memberReg?.company_name || '',
        status: memberReg?.status as 'pending' | 'approved' | 'rejected' || 'pending',
        approval_date: memberReg?.approval_date || null,
        rejection_reason: memberReg?.rejection_reason || null,
        reapplication_count: memberReg?.reapplication_count || 0,
        member_id: memberReg?.member_id || null,
        profile_photo_url: memberReg?.profile_photo_url || null, // FIXED: Get from member_registrations
        account_type: user.account_type || 'member', // ✅ FIXED: Include account_type from users table
        created_at: memberReg?.created_at || user.created_at || new Date().toISOString()
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
      const updateData: any = { ...updates };

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
    try {
      console.log('[memberAuthService.changePassword] Starting password change process');

      // STEP 1: Get current user from session
      const cachedUser = sessionManager.getUserData();

      if (!cachedUser || !cachedUser.id) {
        console.error('[memberAuthService.changePassword] No cached user found or missing user ID');
        return { success: false, error: 'Not authenticated' };
      }

      console.log('[memberAuthService.changePassword] User ID:', cachedUser.id);
      console.log('[memberAuthService.changePassword] User email:', cachedUser.email);

      // STEP 2: Hash the new password using the same function as signup
      console.log('[memberAuthService.changePassword] Hashing new password...');
      const { data: passwordHash, error: hashError } = await supabase.rpc(
        'hash_password',
        { password: newPassword }
      );

      if (hashError || !passwordHash) {
        console.error('[memberAuthService.changePassword] Password hashing error:', hashError);
        return {
          success: false,
          error: 'Failed to process password. Please try again.'
        };
      }

      console.log('[memberAuthService.changePassword] Password hashed successfully');
      console.log('[memberAuthService.changePassword] Hash preview (first 10 chars):',
        typeof passwordHash === 'string' ? passwordHash.substring(0, 10) : 'N/A');

      // STEP 3: Update password using secure database function
      console.log('[memberAuthService.changePassword] Calling change_user_password function...');
      console.log('[memberAuthService.changePassword] Parameters: user_id =', cachedUser.id);

      const { data: changeResult, error: rpcError } = await supabase.rpc(
        'change_user_password',
        {
          p_user_id: cachedUser.id,
          p_new_password_hash: passwordHash
        }
      );

      // Handle RPC call failure (network error, function not found, etc.)
      if (rpcError) {
        console.error('[memberAuthService.changePassword] RPC call failed:', rpcError);
        console.error('[memberAuthService.changePassword] Error details:', JSON.stringify(rpcError));
        return {
          success: false,
          error: 'Failed to update password. Please try again.'
        };
      }

      console.log('[memberAuthService.changePassword] RPC call completed');
      console.log('[memberAuthService.changePassword] Response data:', changeResult);

      // Handle function response
      if (!changeResult || typeof changeResult !== 'object') {
        console.error('[memberAuthService.changePassword] Invalid response format from change_user_password');
        return {
          success: false,
          error: 'Failed to update password. Please try again.'
        };
      }

      // Check if the password change was successful
      if (changeResult.success === false || changeResult.error) {
        console.error('[memberAuthService.changePassword] Password change failed:',
          changeResult.error || changeResult.message || 'Unknown error');
        return {
          success: false,
          error: changeResult.error || 'Failed to update password. Please try again.'
        };
      }

      console.log('[memberAuthService.changePassword] Password updated successfully!');
      console.log('[memberAuthService.changePassword] Success message:',
        changeResult.message || 'Password changed');

      return { success: true, error: null };
    } catch (error) {
      console.error('[memberAuthService.changePassword] Unexpected error:', error);
      console.error('[memberAuthService.changePassword] Error stack:', error instanceof Error ? error.stack : 'N/A');
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async requestPasswordReset(email: string) {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('Request password reset error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async resetPassword(newPassword: string) {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, error: null };
    } catch (error) {
      console.error('Reset password error:', error);
      return { success: false, error: 'An unexpected error occurred' };
    }
  },

  async checkEmailExists(email: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('member_registrations')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (error) {
        console.error('Check email exists error:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('Check email exists error:', error);
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
        console.error('Check mobile exists error:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('Check mobile exists error:', error);
      return false;
    }
  },

  async createOrUpdateProfileChangeRequest(params: {
    memberId: string;
    changeType: 'email_change' | 'mobile_change' | 'profile_update';
    currentData: Record<string, any>;
    requestedData: Record<string, any>;
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
    try {
      console.log('[memberAuthService] Checking uniqueness for email:', email, 'mobile:', mobileNumber);
      console.log('[memberAuthService] Current member ID:', currentMemberId);

      const { data: memberData, error: memberError } = await supabase
        .from('member_registrations')
        .select('user_id')
        .eq('id', currentMemberId)
        .maybeSingle();

      if (memberError) {
        console.error('[memberAuthService] Error fetching member data:', memberError);
        return {
          success: false,
          emailExists: false,
          mobileExists: false,
          error: 'Failed to verify member information'
        };
      }

      if (!memberData || !memberData.user_id) {
        console.error('[memberAuthService] Member not found or no user_id linked');
        return {
          success: false,
          emailExists: false,
          mobileExists: false,
          error: 'Member account not properly linked. Please contact support.'
        };
      }

      const userId = memberData.user_id;
      console.log('[memberAuthService] Found user_id:', userId);

      let emailExists = false;
      let mobileExists = false;

      if (email) {
        const { data: emailData, error: emailError } = await supabase
          .from('users')
          .select('id')
          .eq('email', email.toLowerCase())
          .neq('id', userId)
          .maybeSingle();

        if (emailError) {
          console.error('[memberAuthService] Error checking email uniqueness:', emailError);
          return {
            success: false,
            emailExists: false,
            mobileExists: false,
            error: 'Failed to validate email'
          };
        }

        emailExists = !!emailData;
        console.log('[memberAuthService] Email exists (excluding current user):', emailExists);
      }

      if (mobileNumber) {
        const { data: mobileData, error: mobileError } = await supabase
          .from('users')
          .select('id')
          .eq('mobile_number', mobileNumber)
          .neq('id', userId)
          .maybeSingle();

        if (mobileError) {
          console.error('[memberAuthService] Error checking mobile uniqueness:', mobileError);
          return {
            success: false,
            emailExists: false,
            mobileExists: false,
            error: 'Failed to validate mobile number'
          };
        }

        mobileExists = !!mobileData;
        console.log('[memberAuthService] Mobile exists (excluding current user):', mobileExists);
      }

      return {
        success: true,
        emailExists,
        mobileExists,
        error: null
      };

    } catch (error) {
      console.error('[memberAuthService] Unexpected error in checkEmailMobileUniqueness:', error);
      return {
        success: false,
        emailExists: false,
        mobileExists: false,
        error: 'An unexpected error occurred'
      };
    }
  }
};