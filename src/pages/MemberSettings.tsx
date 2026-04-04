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
      <div className="min-h-screen bg-muted/50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="min-h-screen bg-muted/50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-foreground font-medium mb-2">Unable to load settings</p>
          <p className="text-muted-foreground mb-4">Please try again or contact support</p>
          <Link
            to="/dashboard"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 inline-block"
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

        <div className="bg-card rounded-lg border border-border shadow-sm divide-y divide-border">
          <div className="p-5">
            <h2 className="text-label font-medium text-muted-foreground uppercase tracking-wider mb-4">Account</h2>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Profile Information</p>
                  <p className="text-xs text-muted-foreground">Update your personal and company details</p>
                </div>
              </div>
              <Link
                to="/dashboard/edit"
                className="px-3.5 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-muted/50 transition-colors"
              >
                Edit Profile
              </Link>
            </div>
          </div>

          <div className="p-5">
            <h2 className="text-label font-medium text-muted-foreground uppercase tracking-wider mb-4">Additional Options</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 opacity-50 cursor-not-allowed">
                <div className="flex items-center gap-3">
                  <Bell className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Notifications</p>
                    <p className="text-xs text-muted-foreground">Manage email and push notification preferences</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-xs font-medium text-muted-foreground bg-muted border border-border rounded-full">
                  Coming Soon
                </span>
              </div>

              <div className="flex items-center justify-between py-2 opacity-50 cursor-not-allowed">
                <div className="flex items-center gap-3">
                  <Shield className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Privacy & Security</p>
                    <p className="text-xs text-muted-foreground">Password-based authentication is no longer supported</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 text-xs font-medium text-muted-foreground bg-muted border border-border rounded-full">
                  Info
                </span>
              </div>
            </div>
          </div>

          <div className="p-5">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Need Help?</span> Sign in with your email address and 10-digit mobile number. Contact support if your contact details need to be corrected.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemberSettings;
