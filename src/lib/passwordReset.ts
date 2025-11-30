import { supabase } from './supabase';
import {
  ResetRequestResult,
  TokenValidation,
  ResetResult,
  AdminResetResult,
  AuthErrorCode,
} from '../types/auth.types';
import { isEmail, isMobileNumber } from './customAuth';

const RESET_TOKEN_EXPIRY_HOURS = 1;

const maskEmail = (email: string): string => {
  const [username, domain] = email.split('@');
  if (!username || !domain) return email;

  const visibleChars = Math.min(3, Math.floor(username.length / 2));
  const masked = username.substring(0, visibleChars) + '***';
  return `${masked}@${domain}`;
};

const sendResetEmail = async (
  email: string,
  resetToken: string,
  userType: 'admin' | 'member' | 'both'
): Promise<{ success: boolean; error?: string }> => {
  try {
    const resetUrl = `${window.location.origin}/reset-password?token=${resetToken}`;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset - LUB Membership</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 30px 40px; text-align: center; border-bottom: 3px solid #2563eb;">
              <h1 style="margin: 0; color: #1f2937; font-size: 24px; font-weight: 600;">LUB Membership</h1>
              <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 14px;">Password Reset Request</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px 0; color: #1f2937; font-size: 20px; font-weight: 600;">Reset Your Password</h2>

              <p style="margin: 0 0 16px 0; color: #4b5563; font-size: 16px; line-height: 24px;">
                We received a request to reset your password. Click the button below to create a new password:
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding: 24px 0; text-align: center;">
                    <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">Reset Password</a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 16px 0; color: #4b5563; font-size: 14px; line-height: 20px;">
                Or copy and paste this link into your browser:
              </p>

              <p style="margin: 0 0 24px 0; padding: 12px; background-color: #f3f4f6; border-radius: 4px; word-break: break-all; font-size: 13px; color: #6b7280;">
                ${resetUrl}
              </p>

              <div style="padding: 16px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px; margin-bottom: 24px;">
                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 20px;">
                  <strong>⏱️ Important:</strong> This link will expire in ${RESET_TOKEN_EXPIRY_HOURS} hour${RESET_TOKEN_EXPIRY_HOURS !== 1 ? 's' : ''}.
                </p>
              </div>

              <p style="margin: 0 0 8px 0; color: #4b5563; font-size: 14px; line-height: 20px;">
                If you didn't request this password reset, you can safely ignore this email. Your password will not be changed.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 13px; line-height: 18px;">
                Need help? Contact us at <a href="mailto:support@lub.org.in" style="color: #2563eb; text-decoration: none;">support@lub.org.in</a>
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px; line-height: 16px;">
                © ${new Date().getFullYear()} LUB Membership. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const emailText = `
LUB Membership - Password Reset Request

We received a request to reset your password.

To reset your password, click the link below or copy and paste it into your browser:

${resetUrl}

⏱️ Important: This link will expire in ${RESET_TOKEN_EXPIRY_HOURS} hour${RESET_TOKEN_EXPIRY_HOURS !== 1 ? 's' : ''}.

If you didn't request this password reset, you can safely ignore this email. Your password will not be changed.

Need help? Contact us at support@lub.org.in

© ${new Date().getFullYear()} LUB Membership. All rights reserved.
`;

    const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        to: email,
        subject: 'Reset Your Password - LUB Membership',
        html: emailHtml,
        text: emailText,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[passwordReset] Email send failed:', errorData);
      return {
        success: false,
        error: 'Failed to send email',
      };
    }

    return { success: true };
  } catch (error) {
    console.error('[passwordReset] Send email error:', error);
    return {
      success: false,
      error: 'Failed to send email',
    };
  }
};

export const passwordReset = {
  async requestReset(identifier: string): Promise<ResetRequestResult> {
    try {
      console.log('[passwordReset] Reset request for:', identifier.substring(0, 3) + '***');

      const isEmailInput = isEmail(identifier);
      const isMobileInput = isMobileNumber(identifier);

      if (!isEmailInput && !isMobileInput) {
        return {
          success: false,
          error: 'Please enter a valid email address or 10-digit mobile number',
          errorCode: AuthErrorCode.INVALID_CREDENTIALS,
        };
      }

      // Use the secure database function to lookup user
      const { data: users, error: fetchError } = await supabase.rpc(
        'lookup_user_for_password_reset',
        { identifier: identifier }
      );

      if (fetchError) {
        console.error('[passwordReset] Database error:', fetchError);
        return {
          success: false,
          error: 'An error occurred. Please try again.',
          errorCode: AuthErrorCode.NETWORK_ERROR,
        };
      }

      // The function returns an array, get the first result
      const user = users && users.length > 0 ? users[0] : null;

      // For security, always return success even if user not found
      // This prevents email/mobile enumeration attacks
      if (!user) {
        console.log('[passwordReset] User not found, but returning success for security');
        return {
          success: true,
          maskedEmail: isEmailInput ? maskEmail(identifier) : 'your registered email',
        };
      }

      const resetToken = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + RESET_TOKEN_EXPIRY_HOURS);

      const { error: insertError } = await supabase
        .from('password_reset_tokens')
        .insert({
          user_id: user.user_id,
          token: resetToken,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        console.error('[passwordReset] Token creation error:', insertError);
        return {
          success: false,
          error: 'Failed to create reset token',
          errorCode: AuthErrorCode.NETWORK_ERROR,
        };
      }

      const emailResult = await sendResetEmail(user.user_email, resetToken, user.account_type);

      if (!emailResult.success) {
        await supabase
          .from('password_reset_tokens')
          .delete()
          .eq('token', resetToken);

        return {
          success: false,
          error: 'Failed to send reset email. Please try again.',
          errorCode: AuthErrorCode.EMAIL_SEND_FAILED,
        };
      }

      console.log('[passwordReset] Reset email sent successfully');

      return {
        success: true,
        maskedEmail: maskEmail(user.user_email),
      };
    } catch (error) {
      console.error('[passwordReset] Request reset error:', error);
      return {
        success: false,
        error: 'An unexpected error occurred. Please try again.',
        errorCode: AuthErrorCode.NETWORK_ERROR,
      };
    }
  },

  async validateResetToken(token: string): Promise<TokenValidation> {
    try {
      if (!token) {
        return {
          isValid: false,
          error: 'No reset token provided',
          errorCode: AuthErrorCode.TOKEN_INVALID,
        };
      }

      // Use the secure database function to validate token
      const { data: validationResults, error: fetchError } = await supabase.rpc(
        'validate_password_reset_token',
        { token_value: token }
      );

      if (fetchError) {
        console.error('[passwordReset] Token validation error:', fetchError);
        return {
          isValid: false,
          error: 'Failed to validate token',
          errorCode: AuthErrorCode.TOKEN_INVALID,
        };
      }

      const validation = validationResults && validationResults.length > 0 ? validationResults[0] : null;

      if (!validation || !validation.is_valid) {
        const errorCode = validation?.error_message?.includes('expired')
          ? AuthErrorCode.TOKEN_EXPIRED
          : validation?.error_message?.includes('used')
          ? AuthErrorCode.TOKEN_USED
          : AuthErrorCode.TOKEN_INVALID;

        return {
          isValid: false,
          error: validation?.error_message || 'Invalid reset token',
          errorCode,
        };
      }

      return {
        isValid: true,
        userId: validation.user_id,
        email: validation.user_email,
        expiresAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('[passwordReset] Validate token error:', error);
      return {
        isValid: false,
        error: 'An unexpected error occurred',
        errorCode: AuthErrorCode.NETWORK_ERROR,
      };
    }
  },

  async resetPassword(token: string, newPassword: string): Promise<ResetResult> {
    try {
      // Validate password strength first
      if (newPassword.length < 6) {
        return {
          success: false,
          error: 'Password must be at least 6 characters long',
          errorCode: AuthErrorCode.WEAK_PASSWORD,
        };
      }

      // Use the secure database function to reset password
      // This function validates the token, hashes the password, updates the user,
      // marks the token as used, and invalidates all sessions in a single transaction
      const { data: resetResults, error: resetError } = await supabase.rpc(
        'reset_user_password',
        {
          reset_token: token,
          new_password: newPassword,
        }
      );

      if (resetError) {
        console.error('[passwordReset] Password reset error:', resetError);
        return {
          success: false,
          error: 'Failed to reset password. Please try again.',
          errorCode: AuthErrorCode.NETWORK_ERROR,
        };
      }

      const result = resetResults && resetResults.length > 0 ? resetResults[0] : null;

      if (!result || !result.success) {
        return {
          success: false,
          error: result?.error_message || 'Failed to reset password',
          errorCode: AuthErrorCode.NETWORK_ERROR,
        };
      }

      console.log('[passwordReset] Password reset successful');

      return {
        success: true,
      };
    } catch (error) {
      console.error('[passwordReset] Reset password error:', error);
      return {
        success: false,
        error: 'An unexpected error occurred. Please try again.',
        errorCode: AuthErrorCode.NETWORK_ERROR,
      };
    }
  },

  async adminResetPassword(userId: string, adminId: string): Promise<AdminResetResult> {
    try {
      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .maybeSingle();

      if (fetchError || !user) {
        return {
          success: false,
          error: 'User not found',
          errorCode: AuthErrorCode.USER_NOT_FOUND,
        };
      }

      const resetToken = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + RESET_TOKEN_EXPIRY_HOURS);

      const { error: insertError } = await supabase
        .from('password_reset_tokens')
        .insert({
          user_id: userId,
          token: resetToken,
          expires_at: expiresAt.toISOString(),
        });

      if (insertError) {
        console.error('[passwordReset] Admin token creation error:', insertError);
        return {
          success: false,
          error: 'Failed to create reset token',
          errorCode: AuthErrorCode.NETWORK_ERROR,
        };
      }

      const resetUrl = `${window.location.origin}/reset-password?token=${resetToken}`;

      console.log('[passwordReset] Admin-triggered reset for user:', userId, 'by admin:', adminId);

      return {
        success: true,
        resetToken,
        resetUrl,
      };
    } catch (error) {
      console.error('[passwordReset] Admin reset password error:', error);
      return {
        success: false,
        error: 'An unexpected error occurred',
        errorCode: AuthErrorCode.NETWORK_ERROR,
      };
    }
  },
};
