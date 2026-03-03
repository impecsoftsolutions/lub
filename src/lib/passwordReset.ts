import {
  ResetRequestResult,
  TokenValidation,
  ResetResult,
  AdminResetResult,
  AuthErrorCode,
} from '../types/auth.types';

const unsupportedMessage = 'Password-based authentication is no longer supported.';

export const passwordReset = {
  async requestReset(): Promise<ResetRequestResult> {
    return {
      success: false,
      error: unsupportedMessage,
      errorCode: AuthErrorCode.INVALID_CREDENTIALS,
    };
  },

  async validateResetToken(): Promise<TokenValidation> {
    return {
      isValid: false,
      error: unsupportedMessage,
      errorCode: AuthErrorCode.TOKEN_INVALID,
    };
  },

  async resetPassword(): Promise<ResetResult> {
    return {
      success: false,
      error: unsupportedMessage,
      errorCode: AuthErrorCode.INVALID_CREDENTIALS,
    };
  },

  async adminResetPassword(): Promise<AdminResetResult> {
    return {
      success: false,
      error: unsupportedMessage,
      errorCode: AuthErrorCode.INVALID_CREDENTIALS,
    };
  },
};
