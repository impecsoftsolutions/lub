import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, CreditCard, Gift, Loader2, RefreshCw, X } from 'lucide-react';
import MemberNav from '../components/MemberNav';
import { PageHeader } from '../components/ui/PageHeader';
import { useMember } from '../contexts/useMember';
import Toast from '../components/Toast';
import { logoutService } from '../lib/logoutService';
import { memberRegistrationService } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { formatDateValue } from '../lib/dateTimeManager';

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
  const [showFreeMembershipConfirm, setShowFreeMembershipConfirm] = useState(false);

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

  const handleChoosePaidMembership = () => {
    setShowFreeMembershipConfirm(false);
    const params = new URLSearchParams({ membership: 'paid' });
    if (member?.state?.trim()) {
      params.set('state', member.state.trim());
    }
    navigate(`/payment?${params.toString()}`, { state: { from: '/dashboard' } });
  };

  const handleChooseFreeMembership = () => {
    setShowFreeMembershipConfirm(false);
    navigate('/join?membership=free');
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return formatDateValue(dateString);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="min-h-screen bg-muted/50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <p className="text-foreground font-medium mb-2">Unable to load your profile</p>
          <p className="text-muted-foreground mb-4">Please try again or contact support</p>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  const effectiveStatus = registrationStatus ?? member.status;
  const statusForDisplay = registrationStatus ?? member.status;

  const getStatusLabel = () => {
    switch (statusForDisplay) {
      case 'pending':
        return 'Pending';
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      default:
        return statusForDisplay ? statusForDisplay.charAt(0).toUpperCase() + statusForDisplay.slice(1) : null;
    }
  };

  const getStatusTextClass = () => {
    switch (statusForDisplay) {
      case 'approved':
        return 'text-green-700';
      case 'pending':
        return 'text-red-800';
      case 'rejected':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusMessage = () => {
    switch (effectiveStatus) {
      case 'pending':
        return {
          title: 'Your application is under review',
          description: 'Our team is reviewing your membership application. You will receive an email once a decision has been made.'
        };
      case 'approved':
        return {
          title: 'Welcome to LUB!',
          description: `Your membership has been approved. Your Member ID is ${member.member_id || 'being generated'}. You can now access all member benefits.`,
          approvalDate: member.approval_date
        };
      case 'rejected':
        return {
          title: 'Application Not Approved',
          description: member.rejection_reason || 'Your application was not approved. Please review the requirements and re-apply.'
        };
      default:
        return null;
    }
  };

  const statusInfo = getStatusMessage();
  const statusLabel = getStatusLabel();
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
      {showFreeMembershipConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-lg">
            <div className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-section font-semibold text-foreground">Before you continue with Free Membership</h2>
                <p className="mt-1 text-sm text-muted-foreground">Paid Membership gives you the full LUB member experience.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowFreeMembershipConfirm(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close Free Membership confirmation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <p className="text-sm text-muted-foreground">
                Free Membership lets you register without payment proof, but Paid Membership unlocks the member directory,
                Business Showcase, and future leadership opportunities after admin approval.
              </p>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm font-medium text-foreground">Recommended: continue with Paid Membership if you want full benefits.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleChooseFreeMembership}
                  className="inline-flex justify-center rounded-md border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50"
                >
                  Proceed with Free Membership
                </button>
                <button
                  type="button"
                  onClick={handleChoosePaidMembership}
                  className="inline-flex justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Continue with Paid Membership
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <PageHeader
          title="Dashboard"
          subtitle={`Welcome back, ${displayName}`}
          actions={
            <button
              onClick={refreshMember}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title="Refresh"
              aria-label="Refresh dashboard"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          }
        />

          <div className="bg-card rounded-lg border border-border shadow-sm p-5">
            <h2 className="text-section font-semibold text-foreground mb-4">
              {checkingRegistration || registrationLookupError || hasRegistrationRecord ? (
                <>
                  Application Status
                  {statusLabel && !checkingRegistration && !registrationLookupError && (
                    <>
                      : <span className={`font-bold ${getStatusTextClass()}`}>{statusLabel}</span>
                    </>
                  )}
                </>
              ) : (
                'Complete Your LUB Membership'
              )}
            </h2>

            {checkingRegistration ? (
              <div className="p-4 bg-muted/50 border border-border rounded-lg text-sm text-muted-foreground">
                Checking registration status...
              </div>
            ) : registrationLookupError ? (
              <div className="p-4 bg-secondary/10 border border-secondary/25 rounded-lg flex items-start justify-between gap-4">
                <p className="text-sm text-foreground">
                  Could not load your registration status. Please try again.
                </p>
                <button
                  onClick={handleRetryRegistrationLookup}
                  className="px-4 py-2 text-sm font-medium text-secondary-foreground bg-secondary border border-secondary/30 rounded-lg hover:bg-secondary/90 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : hasRegistrationRecord ? (
              <>
                {statusInfo && (
                  <div>
                    <div>
                      <h3 className="text-section font-medium text-foreground mb-2">{statusInfo.title}</h3>
                      <p className="text-muted-foreground mb-3">{statusInfo.description}</p>
                      {statusInfo.approvalDate && (
                        <p className="text-sm text-muted-foreground">
                          Approved on: {formatDate(statusInfo.approvalDate)}
                        </p>
                      )}
                      {member.reapplication_count > 0 && (
                        <p className="text-sm text-muted-foreground mt-2">
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
                      className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      <RefreshCw className="w-5 h-5 mr-2" />
                      Edit Profile
                    </Link>
                  </div>
                )}

                {effectiveStatus === 'approved'
                  && (member.account_type === 'general_user' || !member.account_type) && (
                  <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-5">
                    <h3 className="text-section font-semibold text-foreground mb-1">
                      Upgrade to Paid Membership
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      You are a confirmed Free Member. Upgrade to Paid LUB Membership to unlock the member directory,
                      Business Showcase, and full member benefits. Paid benefits start after admin approval.
                    </p>
                    <Link
                      to="/dashboard/upgrade"
                      className="inline-flex items-center px-5 py-2.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium"
                    >
                      Upgrade to Paid
                    </Link>
                  </div>
                )}
              </>
            ) : hasRegistrationRecord === false ? (
              <div className="space-y-6">
                <p className="text-muted-foreground mb-6">
                  Choose the membership path that fits you now. You can start with Free Membership and upgrade to Paid later.
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setShowFreeMembershipConfirm(true)}
                    className="rounded-lg border-2 border-border bg-card p-5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Gift className="h-5 w-5" />
                    </div>
                    <h3 className="text-section font-semibold text-foreground mb-2">Free Membership</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Submit your member details without payment proof. Best when you want to join now and upgrade later.
                    </p>
                    <span className="inline-flex items-center text-sm font-medium text-primary">
                      Start Free Registration
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleChoosePaidMembership}
                    className="rounded-lg border-2 border-primary bg-primary/5 p-5 text-left transition-colors hover:bg-primary/10"
                  >
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <h3 className="text-section font-semibold text-foreground mb-2">Paid Membership</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Review state-wise payment details first, then submit your registration with payment proof.
                    </p>
                    <span className="inline-flex items-center text-sm font-medium text-primary">
                      View Payment Details
                    </span>
                  </button>
                </div>

                <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
                  <p className="flex items-start gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    Admin approval is required for both Free and Paid Membership applications. Paid benefits start only after Paid Membership approval.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="bg-card rounded-lg border border-border shadow-sm p-5">
            <h2 className="text-section font-semibold text-foreground mb-4">Your Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium text-foreground">{member.email}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Mobile Number</p>
                <p className="font-medium text-foreground">{member.mobile_number}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Company</p>
                <p className="font-medium text-foreground">{companyName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Member Since</p>
                <p className="font-medium text-foreground">{formatDate(member.created_at)}</p>
              </div>
            </div>
          </div>

          {member.member_id && (
            <div className="bg-card rounded-lg border border-border shadow-sm p-5">
              <p className="text-label font-medium text-muted-foreground uppercase tracking-wider mb-1">Member ID</p>
              <p className="text-xl font-semibold text-foreground">{member.member_id}</p>
              <p className="text-xs text-muted-foreground mt-1">Your unique member identifier</p>
            </div>
          )}
      </div>
    </div>
  );
};

export default MemberDashboard;
