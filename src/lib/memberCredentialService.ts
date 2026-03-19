import { supabase } from './supabase';
import { sessionManager } from './sessionManager';
import {
  AUTH_VALIDATION_MESSAGES,
  normalizeEmail,
  normalizeMobileNumber,
  validateEmailInput,
  validateMobileNumberInput
} from './credentialValidation';

/**
 * Service for handling immediate member credential changes (email and mobile)
 * Changes take effect immediately without admin approval, similar to password changes
 */

/**
 * Change user's email address immediately (no admin approval needed)
 * @param newEmail - The new email address
 * @returns {success: boolean, error?: string}
 */
export async function changeEmail(newEmail: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[memberCredentialService.changeEmail] Starting email change process');

    // STEP 1: Validate email format
    if (!newEmail || !newEmail.trim()) {
      console.error('[memberCredentialService.changeEmail] Empty email provided');
      return { success: false, error: 'Email address is required' };
    }

    const trimmedEmail = normalizeEmail(newEmail);
    const emailError = validateEmailInput(trimmedEmail);
    if (emailError) {
      console.error('[memberCredentialService.changeEmail] Invalid email format');
      return { success: false, error: emailError };
    }

    // STEP 2: Get current user from session
    const cachedUser = sessionManager.getUserData();
    const sessionToken = sessionManager.getSessionToken();

    if (!cachedUser || !cachedUser.id || !sessionToken) {
      console.error('[memberCredentialService.changeEmail] No valid authenticated session found');
      return { success: false, error: 'Not authenticated' };
    }

    console.log('[memberCredentialService.changeEmail] User ID:', cachedUser.id);
    console.log('[memberCredentialService.changeEmail] Current email:', cachedUser.email);
    console.log('[memberCredentialService.changeEmail] New email:', trimmedEmail);

    // STEP 3: Call the RPC function to change email
    console.log('[memberCredentialService.changeEmail] Calling change_user_email function...');
    console.log('[memberCredentialService.changeEmail] Parameters: session token present = true, new_email =', trimmedEmail);

    const { data: changeResult, error: rpcError } = await supabase.rpc(
      'change_user_email',
      {
        p_session_token: sessionToken,
        p_new_email: trimmedEmail
      }
    );

    // Handle RPC call failure (network error, function not found, etc.)
    if (rpcError) {
      console.error('[memberCredentialService.changeEmail] RPC call failed:', rpcError);
      console.error('[memberCredentialService.changeEmail] Error details:', JSON.stringify(rpcError));
      return {
        success: false,
        error: 'Failed to update email. Please try again.'
      };
    }

    console.log('[memberCredentialService.changeEmail] RPC call completed');
    console.log('[memberCredentialService.changeEmail] Response data:', changeResult);

    // Handle function response
    if (!changeResult || typeof changeResult !== 'object') {
      console.error('[memberCredentialService.changeEmail] Invalid response format from change_user_email');
      return {
        success: false,
        error: 'Failed to update email. Please try again.'
      };
    }

    // Check if the email change was successful
    if (changeResult.success === false || changeResult.error) {
      console.error('[memberCredentialService.changeEmail] Email change failed:',
        changeResult.error || 'Unknown error');
      return {
        success: false,
        error: changeResult.error || 'Failed to update email. Please try again.'
      };
    }

    console.log('[memberCredentialService.changeEmail] Email updated successfully!');

    // STEP 4: Update cached user data with new email
    const updatedUser = { ...cachedUser, email: trimmedEmail };
    sessionManager.saveUserData(updatedUser);
    console.log('[memberCredentialService.changeEmail] Updated cached user data with new email');

    return { success: true, error: null };
  } catch (error) {
    console.error('[memberCredentialService.changeEmail] Unexpected error:', error);
    console.error('[memberCredentialService.changeEmail] Error stack:', error instanceof Error ? error.stack : 'N/A');
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Change user's mobile number immediately (no admin approval needed)
 * @param newMobile - The new mobile number (10 digits)
 * @returns {success: boolean, error?: string}
 */
export async function changeMobile(newMobile: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[memberCredentialService.changeMobile] Starting mobile change process');

    // STEP 1: Validate mobile format
    if (!newMobile || !newMobile.trim()) {
      console.error('[memberCredentialService.changeMobile] Empty mobile number provided');
      return { success: false, error: 'Mobile number is required' };
    }

    const trimmedMobile = normalizeMobileNumber(newMobile);
    const mobileError = validateMobileNumberInput(trimmedMobile, {
      invalidMessage: AUTH_VALIDATION_MESSAGES.mobileInvalidStrict
    });
    if (mobileError) {
      console.error('[memberCredentialService.changeMobile] Invalid mobile format');
      return { success: false, error: mobileError };
    }

    // STEP 2: Get current user from session
    const cachedUser = sessionManager.getUserData();
    const sessionToken = sessionManager.getSessionToken();

    if (!cachedUser || !cachedUser.id || !sessionToken) {
      console.error('[memberCredentialService.changeMobile] No valid authenticated session found');
      return { success: false, error: 'Not authenticated' };
    }

    console.log('[memberCredentialService.changeMobile] User ID:', cachedUser.id);
    console.log('[memberCredentialService.changeMobile] Current mobile:', cachedUser.mobile_number);
    console.log('[memberCredentialService.changeMobile] New mobile:', trimmedMobile);

    // STEP 3: Call the RPC function to change mobile
    console.log('[memberCredentialService.changeMobile] Calling change_user_mobile function...');
    console.log('[memberCredentialService.changeMobile] Parameters: session token present = true, new_mobile =', trimmedMobile);

    const { data: changeResult, error: rpcError } = await supabase.rpc(
      'change_user_mobile',
      {
        p_session_token: sessionToken,
        p_new_mobile: trimmedMobile
      }
    );

    // Handle RPC call failure (network error, function not found, etc.)
    if (rpcError) {
      console.error('[memberCredentialService.changeMobile] RPC call failed:', rpcError);
      console.error('[memberCredentialService.changeMobile] Error details:', JSON.stringify(rpcError));
      return {
        success: false,
        error: 'Failed to update mobile number. Please try again.'
      };
    }

    console.log('[memberCredentialService.changeMobile] RPC call completed');
    console.log('[memberCredentialService.changeMobile] Response data:', changeResult);

    // Handle function response
    if (!changeResult || typeof changeResult !== 'object') {
      console.error('[memberCredentialService.changeMobile] Invalid response format from change_user_mobile');
      return {
        success: false,
        error: 'Failed to update mobile number. Please try again.'
      };
    }

    // Check if the mobile change was successful
    if (changeResult.success === false || changeResult.error) {
      console.error('[memberCredentialService.changeMobile] Mobile change failed:',
        changeResult.error || 'Unknown error');
      return {
        success: false,
        error: changeResult.error || 'Failed to update mobile number. Please try again.'
      };
    }

    console.log('[memberCredentialService.changeMobile] Mobile number updated successfully!');

    // STEP 4: Update cached user data with new mobile
    const updatedUser = { ...cachedUser, mobile_number: trimmedMobile };
    sessionManager.saveUserData(updatedUser);
    console.log('[memberCredentialService.changeMobile] Updated cached user data with new mobile');

    return { success: true, error: null };
  } catch (error) {
    console.error('[memberCredentialService.changeMobile] Unexpected error:', error);
    console.error('[memberCredentialService.changeMobile] Error stack:', error instanceof Error ? error.stack : 'N/A');
    return { success: false, error: 'An unexpected error occurred' };
  }
}
