import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, AlertCircle, Key } from 'lucide-react';
import { useMember } from '../contexts/useMember';

const MemberChangePassword: React.FC = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useMember();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/signin');
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <button
            onClick={() => navigate('/dashboard/settings')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Settings
          </button>
        </div>

        <div className="bg-card rounded-lg shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-gray-700 to-gray-800 px-6 py-6">
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
              <Key className="w-6 h-6" />
              Password Change Unavailable
            </h1>
          </div>

          <div className="p-6 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
              <p className="text-sm text-amber-800">
                Password-based authentication is no longer supported. Use your email address and 10-digit mobile number to sign in.
              </p>
            </div>

            <Link
              to="/dashboard/settings"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Return to Settings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemberChangePassword;
