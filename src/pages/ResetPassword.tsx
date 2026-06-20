import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, KeyRound, Loader2 } from 'lucide-react';
import { passwordReset } from '../lib/passwordReset';

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidToken, setIsValidToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    const validate = async () => {
      if (!token) {
        setError('Invalid or expired reset link.');
        setIsValidating(false);
        return;
      }

      const result = await passwordReset.validateResetToken(token);
      if (!result.isValid) {
        setError(result.error || 'Invalid or expired reset link.');
        setIsValidating(false);
        return;
      }

      setMaskedEmail(result.email ?? null);
      setIsValidToken(true);
      setIsValidating(false);
    };

    void validate();
  }, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const result = await passwordReset.resetPassword(token, password);
      if (!result.success) {
        setError(result.error || 'Unable to reset password.');
        return;
      }

      setIsComplete(true);
      setTimeout(() => {
        navigate('/signin', { replace: true });
      }, 1500);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-8 h-8 text-foreground" />
          </div>
          <h2 className="text-3xl font-bold text-foreground">Set Password</h2>
          <p className="mt-2 text-muted-foreground">
            Create a password for your LUB portal account.
          </p>
        </div>

        <div className="bg-card rounded-lg border border-border shadow-sm p-8">
          {isValidating ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Validating reset link...
            </div>
          ) : isComplete ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Password updated successfully. Redirecting to sign in...
              </p>
              <Link
                to="/signin"
                className="block w-full py-3 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg text-center transition-colors"
              >
                Back to Sign In
              </Link>
            </div>
          ) : !isValidToken ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Link
                to="/forgot-password"
                className="block w-full py-3 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg text-center transition-colors"
              >
                Request New Link
              </Link>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              {maskedEmail && (
                <p className="text-sm text-muted-foreground">
                  Resetting password for {maskedEmail}
                </p>
              )}

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                  New Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={event => {
                    setPassword(event.target.value);
                    if (error) setError('');
                  }}
                  className={`w-full py-3 px-4 border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-ring focus:border-ring ${
                    error ? 'border-destructive' : 'border-border'
                  }`}
                  placeholder="Minimum 6 characters"
                />
                {error && (
                  <p className="mt-2 text-sm text-destructive flex items-center">
                    <AlertCircle className="w-4 h-4 mr-1" />
                    {error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                  isSubmitting
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-primary hover:bg-primary/90 text-primary-foreground'
                }`}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center">
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Updating...
                  </span>
                ) : (
                  'Update Password'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
