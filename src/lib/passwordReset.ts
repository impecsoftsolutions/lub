import {
  ResetRequestResult,
  TokenValidation,
  ResetResult,
  AdminResetResult,
  AuthErrorCode,
} from '../types/auth.types';
import { supabase } from './supabase';

const mapAuthErrorCode = (value?: string): AuthErrorCode | undefined => {
  if (!value) return undefined;
  return Object.values(AuthErrorCode).includes(value as AuthErrorCode)
    ? (value as AuthErrorCode)
    : undefined;
};

export const passwordReset = {
  async requestReset(identifier: string): Promise<ResetRequestResult> {
    try {
      const cleanIdentifier = identifier.trim();

      if (!cleanIdentifier) {
        return {
          success: false,
          error: 'Please enter your email address or mobile number.',
          errorCode: AuthErrorCode.INVALID_CREDENTIALS,
        };
      }

      const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string; maskedEmail?: string }>(
        'request-password-reset',
        { body: { identifier: cleanIdentifier } }
      );

      if (error) {
        console.error('[passwordReset] Reset request failed:', error);
        return {
          success: false,
          error: 'Unable to send reset email. Please try again.',
          errorCode: AuthErrorCode.EMAIL_SEND_FAILED,
        };
      }

      if (data?.success === false) {
        return {
          success: false,
          error: data.error || 'Unable to send reset email. Please try again.',
          errorCode: AuthErrorCode.EMAIL_SEND_FAILED,
        };
      }

      return { success: true, maskedEmail: data?.maskedEmail };
    } catch (error) {
      console.error('[passwordReset] Reset request error:', error);
      return {
        success: false,
        error: 'Unable to send reset email. Please try again.',
        errorCode: AuthErrorCode.NETWORK_ERROR,
      };
    }
  },

  async validateResetToken(token: string): Promise<TokenValidation> {
    try {
      const { data, error } = await supabase.rpc('validate_member_password_token', {
        p_token: token,
      });

      if (error) {
        console.error('[passwordReset] Token validation failed:', error);
        return {
          isValid: false,
          error: 'Unable to validate reset link.',
          errorCode: AuthErrorCode.NETWORK_ERROR,
        };
      }

      const result = Array.isArray(data) ? data[0] : data;

      if (!result?.success) {
        return {
          isValid: false,
          error: result?.error || 'Invalid or expired reset link.',
          errorCode: mapAuthErrorCode(result?.error_code) ?? AuthErrorCode.TOKEN_INVALID,
        };
      }

      return {
        isValid: true,
        email: result.email,
        expiresAt: result.expiresAt,
      };
    } catch (error) {
      console.error('[passwordReset] Token validation error:', error);
      return {
        isValid: false,
        error: 'Unable to validate reset link.',
        errorCode: AuthErrorCode.NETWORK_ERROR,
      };
    }
  },

  async resetPassword(token: string, password: string): Promise<ResetResult> {
    try {
      if (password.length < 6) {
        return {
          success: false,
          error: 'Password must be at least 6 characters.',
          errorCode: AuthErrorCode.WEAK_PASSWORD,
        };
      }

      const { data, error } = await supabase.rpc('complete_member_password_reset', {
        p_token: token,
        p_password: password,
      });

      if (error) {
        console.error('[passwordReset] Password reset failed:', error);
        return {
          success: false,
          error: 'Unable to reset password. Please try again.',
          errorCode: AuthErrorCode.NETWORK_ERROR,
        };
      }

      const result = Array.isArray(data) ? data[0] : data;

      if (!result?.success) {
        return {
          success: false,
          error: result?.error || 'Unable to reset password.',
          errorCode: mapAuthErrorCode(result?.error_code) ?? AuthErrorCode.TOKEN_INVALID,
        };
      }

      return { success: true };
    } catch (error) {
      console.error('[passwordReset] Password reset error:', error);
      return {
        success: false,
        error: 'Unable to reset password. Please try again.',
        errorCode: AuthErrorCode.NETWORK_ERROR,
      };
    }
  },

  async adminResetPassword(): Promise<AdminResetResult> {
    return {
      success: false,
      error: 'Admin-initiated password reset is not available in this flow.',
      errorCode: AuthErrorCode.INVALID_CREDENTIALS,
    };
  },
};
