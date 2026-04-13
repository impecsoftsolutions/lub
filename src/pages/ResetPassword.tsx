import React from 'react';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';

const ResetPassword: React.FC = () => {
  return (
    <div className="min-h-screen bg-muted/50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-8 h-8 text-foreground" />
          </div>
          <h2 className="text-3xl font-bold text-foreground">Password Reset Unavailable</h2>
          <p className="mt-2 text-muted-foreground">
            Password reset links are no longer supported on this portal.
          </p>
        </div>

        <div className="bg-card rounded-lg border border-border shadow-sm p-8 text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Use your email address and 10-digit mobile number to sign in.
          </p>
          <Link
            to="/signin"
            className="block w-full py-3 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-lg text-center transition-colors"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;


