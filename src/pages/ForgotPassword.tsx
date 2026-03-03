import React from 'react';
import { Link } from 'react-router-dom';
import { KeyRound } from 'lucide-react';

const ForgotPassword: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900">Password Reset Unavailable</h2>
          <p className="mt-2 text-gray-600">
            Password-based authentication is no longer supported on this portal.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8 text-center space-y-4">
          <p className="text-sm text-gray-600">
            Sign in using your email address and 10-digit mobile number instead.
          </p>
          <Link
            to="/signin"
            className="block w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-center transition-colors"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
