import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useMember } from '../contexts/useMember';

interface RedirectIfAuthenticatedProps {
  children: React.ReactNode;
}

/**
 * Guards public auth-only pages (forgot password, reset password) from logged-in users.
 * An authenticated member has no use for these recovery flows — they are sent to the
 * dashboard instead. Mirrors the redirect pattern already used inline by SignIn/SignUpV2.
 *
 * Note: intentionally NOT applied to /signin and /signup, which carry a `?preview=1`
 * form-builder mode that must remain reachable while authenticated.
 */
const RedirectIfAuthenticated: React.FC<RedirectIfAuthenticatedProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useMember();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default RedirectIfAuthenticated;
