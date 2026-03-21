export enum AuthErrorCode {
  INVALID_CREDENTIALS = 'invalid_credentials',
  ACCOUNT_LOCKED = 'account_locked',
  ACCOUNT_SUSPENDED = 'account_suspended',
  ACCOUNT_FROZEN = 'account_frozen',
  PASSWORD_PENDING = 'password_pending',
  SESSION_EXPIRED = 'session_expired',
  SESSION_INVALID = 'session_invalid',
  TOKEN_EXPIRED = 'token_expired',
  TOKEN_INVALID = 'token_invalid',
  TOKEN_USED = 'token_used',
  USER_NOT_FOUND = 'user_not_found',
  WEAK_PASSWORD = 'weak_password',
  EMAIL_SEND_FAILED = 'email_send_failed',
  NETWORK_ERROR = 'network_error',
}

export interface User {
  id: string;
  email: string;
  mobile_number: string | null;
  state?: string | null;
  account_type: 'admin' | 'member' | 'both' | 'general_user';
  account_status: 'active' | 'password_pending' | 'locked' | 'suspended';
  email_verified: boolean;
  mobile_verified: boolean;
  is_active: boolean;
  last_login_at: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthResult {
  success: boolean;
  sessionToken?: string;
  user?: User;
  error?: string;
  errorCode?: AuthErrorCode;
  accountStatus?: 'active' | 'password_pending' | 'locked' | 'suspended';
  lockedUntil?: string;
}

export interface SessionData {
  sessionToken: string;
  expiresAt: string;
  userId: string;
}

export interface SessionValidation {
  isValid: boolean;
  userId?: string;
  user?: User;
  error?: string;
  errorCode?: AuthErrorCode;
}

export interface AccountStatus {
  status: 'active' | 'password_pending' | 'locked' | 'suspended';
  isLocked: boolean;
  lockedUntil?: string;
  failedAttempts: number;
}

export interface PasswordChangeResult {
  success: boolean;
  error?: string;
  errorCode?: AuthErrorCode;
}

export interface ResetRequestResult {
  success: boolean;
  maskedEmail?: string;
  error?: string;
  errorCode?: AuthErrorCode;
}

export interface TokenValidation {
  isValid: boolean;
  userId?: string;
  email?: string;
  error?: string;
  errorCode?: AuthErrorCode;
  expiresAt?: string;
}

export interface ResetResult {
  success: boolean;
  error?: string;
  errorCode?: AuthErrorCode;
}

export interface AdminResetResult {
  success: boolean;
  resetToken?: string;
  resetUrl?: string;
  error?: string;
  errorCode?: AuthErrorCode;
}

export interface SessionConfig {
  sessionDurationDays: number;
  refreshIntervalMinutes: number;
  storageKey: string;
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  sessionDurationDays: 7,
  refreshIntervalMinutes: 5,
  storageKey: 'lub_session_token',
};
