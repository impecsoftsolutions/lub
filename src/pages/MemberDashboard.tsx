import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, FileText, Edit, Key, LogOut, AlertCircle, CheckCircle, Clock, Loader2, RefreshCw } from 'lucide-react';
import { useMember } from '../contexts/MemberContext';
import Toast from '../components/Toast';
import { logoutService } from '../lib/logoutService';
import { supabase } from '../lib/supabase';

const MemberDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { member, isAuthenticated, isLoading, refreshMember, signOut } = useMember();
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
      if (!member || !member.user_id) {
        setCheckingRegistration(false);
        return;
      }

      try {
        setRegistrationLookupError(null);
        console.log('[MemberDashboard] Checking for member_registrations record for:', member.user_id);

        const { data, error } = await supabase
          .from('member_registrations')
          .select('id,status,approval_date,member_id,updated_at,created_at')
          .eq('user_id', member.user_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[MemberDashboard] Error checking registration:', error);
          setHasRegistrationRecord(false);
          setRegistrationStatus(null);
          setRegistrationLookupError(error.message || 'Unknown error');
        } else {
          const hasRecord = !!data;
          console.log('[MemberDashboard] Has registration record:', hasRecord);
          setHasRegistrationRecord(hasRecord);
          setRegistrationStatus(data?.status ?? null);
        }
      } catch (error) {
        console.error('[MemberDashboard] Unexpected error checking registration:', error);
        setHasRegistrationRecord(false);
        setRegistrationStatus(null);
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

  if (isLoading || checkingRegistration) {
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

  const getStatusBadge = () => {
    switch (effectiveStatus) {
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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="mb-8 flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Member Dashboard</h1>
              <p className="mt-1 text-gray-600">Welcome back, {member.full_name}!</p>
            </div>
            <button
              onClick={refreshMember}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors mt-1"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>


          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              {registrationLookupError || hasRegistrationRecord ? 'Application Status' : 'Complete Your LUB Membership'}
            </h2>

            {registrationLookupError ? (
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
                      to="/dashboard/reapply"
                      className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <RefreshCw className="w-5 h-5 mr-2" />
                      Re-apply for Membership
                    </Link>
                  </div>
                )}
              </>
            ) : (
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
            )}
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Information</h2>
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
                <p className="font-medium text-gray-900">{member.company_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Member Since</p>
                <p className="font-medium text-gray-900">{formatDate(member.created_at)}</p>
              </div>
            </div>
          </div>

          {member.member_id && (
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg shadow-md p-6 text-white">
              <h3 className="text-lg font-semibold mb-2">Member ID</h3>
              <p className="text-3xl font-bold">{member.member_id}</p>
              <p className="text-sm text-blue-100 mt-2">Your unique member identifier</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemberDashboard;
