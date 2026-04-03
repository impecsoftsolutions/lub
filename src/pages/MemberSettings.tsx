import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Loader2, AlertCircle, User, Bell, Shield } from 'lucide-react';
import MemberNav from '../components/MemberNav';
import { useMember } from '../contexts/useMember';
import { PageHeader } from '../components/ui/PageHeader';

const MemberSettings: React.FC = () => {
  const navigate = useNavigate();
  const { member, isAuthenticated, isLoading } = useMember();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/signin');
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-900 font-medium mb-2">Unable to load settings</p>
          <p className="text-gray-600 mb-4">Please try again or contact support</p>
          <Link
            to="/dashboard"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-block"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <MemberNav />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <PageHeader
          title="Settings"
          subtitle="Manage your account preferences"
        />

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm divide-y divide-gray-200">
          <div className="p-5">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">Account</h2>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Profile Information</p>
                  <p className="text-xs text-gray-500">Update your personal and company details</p>
                </div>
              </div>
              <Link
                to="/dashboard/edit"
                className="px-3.5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Edit Profile
              </Link>
            </div>
          </div>

          <div className="p-5">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">Additional Options</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 opacity-50 cursor-not-allowed">
                <div className="flex items-center gap-3">
                  <Bell className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Notifications</p>
                    <p className="text-xs text-gray-500">Manage email and push notification preferences</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-full">
                  Coming Soon
                </span>
              </div>

              <div className="flex items-center justify-between py-2 opacity-50 cursor-not-allowed">
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Privacy & Security</p>
                    <p className="text-xs text-gray-500">Password-based authentication is no longer supported</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-xs font-medium text-gray-500 bg-gray-100 border border-gray-200 rounded-full">
                  Info
                </span>
              </div>
            </div>
          </div>

          <div className="p-5">
            <p className="text-sm text-gray-600">
              <span className="font-medium">Need Help?</span> Sign in with your email address and 10-digit mobile number. Contact support if your contact details need to be corrected.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemberSettings;
