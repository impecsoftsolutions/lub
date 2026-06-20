import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, AlertCircle, CheckCircle, Loader2, Shield } from 'lucide-react';
import MemberNav from '../components/MemberNav';
import { PageHeader } from '../components/ui/PageHeader';
import { useMember } from '../contexts/useMember';
import { memberAuthService } from '../lib/memberAuth';

const MemberChangePassword: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useMember();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/signin');
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    setError('');
    setSuccess('');

    if (!currentPassword) {
      setError('Enter your current password.');
      return;
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirm password do not match.');
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await memberAuthService.changePassword(currentPassword, newPassword);

      if (!result.success) {
        setError(result.error || 'Unable to change password. Please try again.');
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Password changed successfully. Other active sessions have been signed out.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading security settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <MemberNav />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-5">
          <Link
            to="/dashboard/settings"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Settings
          </Link>
        </div>

        <PageHeader
          title="Change Password"
          subtitle="Update the password used to sign in to your LUB account"
        />

        <div className="bg-card rounded-lg border border-border shadow-sm">
          <div className="p-5 border-b border-border">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-primary" />
              <div>
                <h2 className="text-sm font-medium text-foreground">Privacy & Security</h2>
                <p className="text-xs text-muted-foreground">Changing your password signs out other active sessions.</p>
              </div>
            </div>
          </div>

          <form className="p-5 space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>{success}</p>
              </div>
            )}

            <div>
              <label htmlFor="current-password" className="block text-sm font-medium text-foreground mb-2">
                Current Password
              </label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={event => setCurrentPassword(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-foreground focus:border-ring focus:ring-1 focus:ring-ring"
                autoComplete="current-password"
              />
            </div>

            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-foreground mb-2">
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={event => setNewPassword(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-foreground focus:border-ring focus:ring-1 focus:ring-ring"
                placeholder="Minimum 6 characters"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-foreground mb-2">
                Confirm New Password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-foreground focus:border-ring focus:ring-1 focus:ring-ring"
                autoComplete="new-password"
              />
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Link
                to="/dashboard/settings"
                className="inline-flex justify-center rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Updating...
                  </span>
                ) : (
                  'Update Password'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default MemberChangePassword;
