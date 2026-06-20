import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { passwordReset } from '../lib/passwordReset';

const ForgotPassword: React.FC = () => {
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    const cleanIdentifier = identifier.trim();
    if (!cleanIdentifier) {
      setError('Enter your email address or mobile number.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const result = await passwordReset.requestReset(cleanIdentifier);

      if (!result.success) {
        setError(result.error || 'Unable to send reset email. Please try again.');
        return;
      }

      setSent(true);
      setMaskedEmail(result.maskedEmail || '');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground">Forgot Password</h2>
          {!sent && (
            <p className="mt-2 text-muted-foreground">
              Enter your email address or mobile number to receive a password reset link.
            </p>
          )}
        </div>

        <div className="bg-card rounded-lg border border-border shadow-sm p-8">
          {sent ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                A password reset link has been sent to your registered email address{maskedEmail ? `: ${maskedEmail}.` : '.'}
              </p>
              <Link
                to="/signin"
                className="block w-full py-3 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg text-center transition-colors"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="identifier" className="block text-sm font-medium text-foreground mb-2">
                  Email or Mobile Number
                </label>
                <input
                  id="identifier"
                  name="identifier"
                  value={identifier}
                  onChange={event => {
                    setIdentifier(event.target.value);
                    if (error) setError('');
                  }}
                  className={`w-full py-3 px-4 border rounded-lg bg-background text-foreground focus:ring-1 focus:ring-ring focus:border-ring ${
                    error ? 'border-destructive' : 'border-border'
                  }`}
                  placeholder="Email address or 10-digit mobile number"
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
                    Sending...
                  </span>
                ) : (
                  'Send Reset Link'
                )}
              </button>

              <Link
                to="/signin"
                className="block w-full py-3 px-4 bg-background hover:bg-muted text-foreground font-medium rounded-lg text-center border border-border transition-colors"
              >
                Back to Sign In
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
