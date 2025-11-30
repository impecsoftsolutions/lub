/*
  # Create Custom Authentication System - Core Tables

  1. New Tables
    - users: Unified authentication table for admins and members
    - auth_sessions: Active session management
    - password_reset_tokens: Password reset flow

  2. Security
    - Password hashing using pgcrypto extension
    - Session tokens with expiration
    - Account status tracking

  3. Features
    - Support for email and mobile login
    - Activity-based session refresh
    - Password pending status for legacy members
*/

-- Enable pgcrypto extension for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create users table (replaces auth.users)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  mobile_number text UNIQUE,
  password_hash text NOT NULL,
  email_verified boolean DEFAULT false,
  mobile_verified boolean DEFAULT false,
  account_type text NOT NULL CHECK (account_type IN ('admin', 'member', 'both')),
  account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN (
    'active',
    'password_pending',
    'locked',
    'suspended'
  )),
  is_active boolean DEFAULT true,
  last_login_at timestamptz,
  failed_login_attempts integer DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for users table
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_mobile ON users(mobile_number) WHERE mobile_number IS NOT NULL;
CREATE INDEX idx_users_account_type ON users(account_type);
CREATE INDEX idx_users_account_status ON users(account_status);

-- Create auth_sessions table
CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token text UNIQUE NOT NULL,
  ip_address text,
  user_agent text,
  expires_at timestamptz NOT NULL,
  last_activity_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create indexes for auth_sessions table
CREATE INDEX idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_token ON auth_sessions(session_token);
CREATE INDEX idx_auth_sessions_expires_at ON auth_sessions(expires_at);

-- Create password_reset_tokens table
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for password_reset_tokens table
CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- Create function to hash passwords
CREATE OR REPLACE FUNCTION hash_password(password text)
RETURNS text AS $$
BEGIN
  RETURN crypt(password, gen_salt('bf', 10));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to verify passwords
CREATE OR REPLACE FUNCTION verify_password(password text, password_hash text)
RETURNS boolean AS $$
BEGIN
  RETURN password_hash = crypt(password, password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to generate session token
CREATE OR REPLACE FUNCTION generate_session_token()
RETURNS text AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'base64');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to clean expired sessions
CREATE OR REPLACE FUNCTION clean_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM auth_sessions WHERE expires_at < now();
  DELETE FROM password_reset_tokens WHERE expires_at < now() AND used_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get current user from session
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS uuid AS $$
DECLARE
  session_user_id uuid;
BEGIN
  -- This will be called from application context with session token
  -- For now, return NULL (will be implemented in application layer)
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments
COMMENT ON TABLE users IS 'Unified authentication table for all users (admins and members)';
COMMENT ON TABLE auth_sessions IS 'Active user sessions with 7-day activity-based expiration';
COMMENT ON TABLE password_reset_tokens IS 'Temporary tokens for password reset flow';

COMMENT ON COLUMN users.password_hash IS 'Bcrypt password hash. Set to PENDING_FIRST_LOGIN for legacy members who need to set password on first login';
COMMENT ON COLUMN users.account_type IS 'User type: admin (admin only), member (member only), both (admin + member)';
COMMENT ON COLUMN users.account_status IS 'Account status: active, password_pending, locked, suspended';
COMMENT ON COLUMN users.mobile_number IS 'Mobile number for members. Optional for admins. Used for mobile login.';
