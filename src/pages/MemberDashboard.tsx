import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle, CheckCircle, Clock, Loader2, RefreshCw } from 'lucide-react';
import MemberNav from '../components/MemberNav';
import { PageHeader } from '../components/ui/PageHeader';
import { useMember } from '../contexts/useMember';
import Toast from '../components/Toast';
import { logoutService } from '../lib/logoutService';
import { memberRegistrationService } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';

interface RegistrationSummary {
  full_name?: string | null;
  company_name?: string | null;
  status?: string | null;
}

const MemberDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { member, isAuthenticated, isLoading, refreshMember } = useMember();
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({
    type: 'success',
    message: '',
    isVisible: false
  });
  const [hasRegistrationRecord, setHasRegistrationRecord] = useState<boolean | null>(null);
  const [registrationStatus, setRegistrationStatus] = useState<string | null>(null);
  const [registrationRow, setRegistrationRow] = useState<RegistrationSummary | null>(null);
  const [registrationLookupError, setRegistrationLookupError] = useState<string | null>(null);
  const [checkingRegistration, setCheckingRegistration] = useState(true);
  const [registrationRetryCounter, setRegistrationRetryCounter] = useState(0);

  useEffect(() => {
    // Only redirect if loading is complete AND not authenticated
    if (!isLoading && !isAuthenticated) {
      console.log('[MemberDashboard] Not authenticated, redirecting to login');
      navigate('/signin', { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Check if user has a member_registrations record
  useEffect(() => {
    const checkMemberRegistration = async () => {
      setCheckingRegistration(true);
      const sessionToken = sessionManager.getSessionToken();

      if (!sessionToken || sessionManager.isSessionExpired()) {
        setRegistrationLookupError('User session not found. Please log in again.');
        setHasRegistrationRecord(null);
        setRegistrationStatus(null);
        setRegistrationRow(null);
        setCheckingRegistration(false);
        return;
      }

      try {
        setRegistrationLookupError(null);
        console.log('[MemberDashboard] Checking for member_registrations record via session token');

        const { data, error } = await memberRegistrationService.getMyMemberRegistrationByToken(sessionToken);

        if (error) {
          console.error('[MemberDashboard] Error checking registration:', error);
          setHasRegistrationRecord(null);
          setRegistrationStatus(null);
          setRegistrationRow(null);
          setRegistrationLookupError(error);
        } else {
          const hasRecord = !!data;
          console.log('[MemberDashboard] Has registration record:', hasRecord);
          setHasRegistrationRecord(hasRecord);
          setRegistrationStatus(data?.status ?? null);
          setRegistrationRow(data ?? null);
        }
      } catch (error) {
        console.error('[MemberDashboard] Unexpected error checking registration:', error);
        setHasRegistrationRecord(null);
        setRegistrationStatus(null);
        setRegistrationRow(null);
        setRegistrationLookupError('Unknown error');
      } finally {
        setCheckingRegistration(false);
      }
    };

    if (member) {
      checkMemberRegistration();
    }
  }, [member, registrationRetryCounter]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

  const getFirstTwoWords = (name: string | null | undefined): string => {
    if (!name) return '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).join(' ');
  };

  const handleRetryRegistrationLookup = () => {
    setCheckingRegistration(true);
    setRegistrationRetryCounter(prev => prev + 1);
  };

  const handleSignOut = async () => {
    try {
      showToast('success', 'Logging out...');

      // Use unified logout service (handles redirect automatically)
      await logoutService.logoutMember();
    } catch (error) {
      console.error('[MemberDashboard] Error during logout:', error);
      // logoutService handles redirect even on error
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-900 font-medium mb-2">Unable to load your profile</p>
          <p className="text-gray-600 mb-4">Please try again or contact support</p>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  const effectiveStatus = registrationStatus ?? member.status;
  const statusForDisplay = registrationStatus ?? member.status;

  const getStatusBadge = () => {
    switch (statusForDisplay) {
      case 'pending':
        return (
          <div className="flex items-center gap-2 px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg">
            <Clock className="w-5 h-5" />
            <span className="font-medium">Pending Review</span>
          </div>
        );
      case 'approved':
        return (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-lg">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">Approved</span>
          </div>
        );
      case 'rejected':
        return (
          <div className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-800 rounded-lg">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">Rejected</span>
          </div>
        );
      default:
        return null;
    }
  };

  const getStatusMessage = () => {
    switch (effectiveStatus) {
      case 'pending':
        return {
          title: 'Your application is under review',
          description: 'Our team is reviewing your membership application. You will receive an email once a decision has been made.',
          icon: <Clock className="w-12 h-12 text-yellow-500" />
        };
      case 'approved':
        return {
          title: 'Welcome to LUB!',
          description: `Your membership has been approved. Your Member ID is ${member.member_id || 'being generated'}. You can now access all member benefits.`,
          icon: <CheckCircle className="w-12 h-12 text-green-500" />,
          approvalDate: member.approval_date
        };
      case 'rejected':
        return {
          title: 'Application Not Approved',
          description: member.rejection_reason || 'Your application was not approved. Please review the requirements and re-apply.',
          icon: <AlertCircle className="w-12 h-12 text-red-500" />
        };
      default:
        return null;
    }
  };

  const statusInfo = getStatusMessage();
  const displayNameRaw = registrationRow?.full_name || member?.full_name || '';
  const displayName = getFirstTwoWords(displayNameRaw);
  const companyName = registrationRow?.company_name || member?.company_name || '';

  return (
    <div>
      <MemberNav />
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <PageHeader
          title="Dashboard"
          subtitle={`Welcome back, ${displayName}`}
          actions={
            <button
              onClick={refreshMember}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          }
        />

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-5">
              {checkingRegistration || registrationLookupError || hasRegistrationRecord ? 'Application Status' : 'Complete Your LUB Membership'}
            </h2>

            {checkingRegistration ? (
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
                Checking registration status...
              </div>
            ) : registrationLookupError ? (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start justify-between gap-4">
                <p className="text-sm text-yellow-800">
                  Could not load your registration status. Please try again.
                </p>
                <button
                  onClick={handleRetryRegistrationLookup}
                  className="px-4 py-2 text-sm font-medium text-yellow-800 border border-yellow-300 rounded-lg hover:bg-yellow-100 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : hasRegistrationRecord ? (
              <>
                <div className="flex items-start justify-between mb-6">
                  <div>
                    {getStatusBadge()}
                  </div>
                </div>

                {statusInfo && (
                  <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg">
                    <div className="flex-shrink-0">{statusInfo.icon}</div>
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-gray-900 mb-2">{statusInfo.title}</h3>
                      <p className="text-gray-600 mb-3">{statusInfo.description}</p>
                      {statusInfo.approvalDate && (
                        <p className="text-sm text-gray-500">
                          Approved on: {formatDate(statusInfo.approvalDate)}
                        </p>
                      )}
                      {member.reapplication_count > 0 && (
                        <p className="text-sm text-gray-500 mt-2">
                          Application attempts: {member.reapplication_count + 1}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {effectiveStatus === 'rejected' && (
                  <div className="mt-6">
                    <Link
                      to="/dashboard/edit"
                      className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <RefreshCw className="w-5 h-5 mr-2" />
                      Edit Profile
                    </Link>
                  </div>
                )}
              </>
            ) : hasRegistrationRecord === false ? (
              <div className="space-y-6">
                <p className="text-gray-600 mb-6">
                  Complete these two simple steps to become a LUB member:
                </p>

                <div className="flex items-start gap-4 p-5 border-2 border-gray-200 rounded-lg hover:border-blue-300 transition-colors">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-100">
                      <span className="text-blue-600 font-semibold">1</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Step 1: View Payment Details
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Review the membership fee and payment methods available.
                    </p>
                    <Link
                      to="/payment"
                      className="inline-flex items-center px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      View Payment Details
                    </Link>
                  </div>
                </div>

                <div className="flex items-start gap-4 p-5 border-2 border-gray-200 rounded-lg hover:border-blue-300 transition-colors">
                  <div className="flex-shrink-0 mt-1">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-100">
                      <span className="text-blue-600 font-semibold">2</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Step 2: Submit Registration Form
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Fill out your complete business details and submit supporting documents along with payment proof.
                    </p>
                    <Link
                      to="/join"
                      className="inline-flex items-center px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      Complete Registration
                    </Link>
                  </div>
                </div>

                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> Make your payment first, then submit the registration form with payment proof.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-4">Your Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Email</p>
                <p className="font-medium text-gray-900">{member.email}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Mobile Number</p>
                <p className="font-medium text-gray-900">{member.mobile_number}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Company</p>
                <p className="font-medium text-gray-900">{companyName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Member Since</p>
                <p className="font-medium text-gray-900">{formatDate(member.created_at)}</p>
              </div>
            </div>
          </div>

          {member.member_id && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Member ID</p>
              <p className="text-2xl font-semibold text-gray-900">{member.member_id}</p>
              <p className="text-xs text-gray-400 mt-1">Your unique member identifier</p>
            </div>
          )}
      </div>
    </div>
  );
};

export default MemberDashboard;
