import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, AlertCircle } from 'lucide-react';
import { customAuth } from '../lib/customAuth';
import { sessionManager } from '../lib/sessionManager';
import { AuthErrorCode } from '../types/auth.types';

const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const getErrorMessage = (errorCode?: AuthErrorCode, error?: string, lockedUntil?: string): string => {
    switch (errorCode) {
      case AuthErrorCode.ACCOUNT_LOCKED:
        if (lockedUntil) {
          const unlockTime = new Date(lockedUntil);
          const now = new Date();
          const minutesRemaining = Math.ceil((unlockTime.getTime() - now.getTime()) / (1000 * 60));
          return `Account is locked due to too many failed login attempts. Please try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}.`;
        }
        return 'Account is locked. Please contact support.';

      case AuthErrorCode.ACCOUNT_SUSPENDED:
        return 'Your account has been suspended. Please contact support.';

      case AuthErrorCode.PASSWORD_PENDING:
        return 'Please use "Forgot Password" to set your password for the first time.';

      case AuthErrorCode.INVALID_CREDENTIALS:
        return error || 'Invalid email or password.';

      default:
        return error || 'An unexpected error occurred. Please try again.';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[AdminLogin] Login attempt started for email:', email.substring(0, 3) + '***');
    setIsLoading(true);
    setError('');

    try {
      // Get IP address and user agent for security tracking
      const userAgent = navigator.userAgent;

      const result = await customAuth.signIn(email, password, undefined, userAgent);

      if (!result.success) {
        console.error('[AdminLogin] Sign in failed:', result.errorCode);
        setError(getErrorMessage(result.errorCode, result.error, result.lockedUntil));
        setIsLoading(false);
        return;
      }

      console.log('[AdminLogin] Sign in successful');

      if (!result.user || !result.sessionToken) {
        console.error('[AdminLogin] No user data or session token returned');
        setError('Authentication failed. Please try again.');
        setIsLoading(false);
        return;
      }

      // Check if user has admin access (account_type must be 'admin' or 'both')
      if (result.user.account_type !== 'admin' && result.user.account_type !== 'both') {
        console.log('[AdminLogin] User does not have admin access');
        setError('You do not have admin access. Please contact your system administrator.');
        setIsLoading(false);
        return;
      }

      // Save session token
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
      sessionManager.saveSession(result.sessionToken, expiresAt.toISOString());

      // Set user context for RLS
      await customAuth.setUserContext(result.user.id);

      console.log('[AdminLogin] Admin access verified, redirecting to dashboard');
      navigate('/admin');
    } catch (err) {
      console.error('[AdminLogin] Unexpected login error:', err);
      setError('An unexpected error occurred. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900">Admin Login</h2>
          <p className="mt-2 text-gray-600">Sign in to access the admin dashboard</p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
              <AlertCircle className="w-5 h-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
              <span className="text-red-700 text-sm">{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <div className="relative">
                <User className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="admin@lub.org.in"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your password"
                  disabled={isLoading}
                />
              </div>
            </div>
          </div>

          <div className="text-sm">
            <a
              href="/forgot-password"
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Forgot your password?
            </a>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
              isLoading
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="text-center">
          <p className="text-sm text-gray-600">
            For admin access, contact your system administrator
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
