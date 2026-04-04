import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Mail, Phone, Building, Calendar, CreditCard, Edit, Loader2, AlertCircle } from 'lucide-react';
import MemberNav from '../components/MemberNav';
import { useMember } from '../contexts/useMember';
import { memberRegistrationService } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';

interface MemberRegistrationSummary {
  status?: string | null;
  rejection_reason?: string | null;
  full_name?: string | null;
  company_name?: string | null;
}

const MemberViewProfile: React.FC = () => {
  const navigate = useNavigate();
  const { member, isAuthenticated, isLoading, refreshMember } = useMember();
  const [registration, setRegistration] = useState<MemberRegistrationSummary | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const getFirstTwoWords = (name: string | null | undefined): string => {
    if (!name) return '';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).join(' ');
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/signin');
    }
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    const fetchRegistration = async () => {
      if (!isAuthenticated) {
        return;
      }

      try {
        setRegistrationError(null);

        const sessionToken = sessionManager.getSessionToken();
        if (!sessionToken || sessionManager.isSessionExpired()) {
          setRegistrationError('User session not found. Please log in again.');
          return;
        }

        const { data, error } = await memberRegistrationService.getMyMemberRegistrationByToken(sessionToken);

        if (error) {
          setRegistrationError(error);
          return;
        }

        setRegistration(data);
        setRegistrationError(null);
      } catch {
        setRegistrationError('Unknown error');
      }
    };

    refreshMember().catch(fetchError => {
      console.error('[MemberViewProfile] Failed to refresh member data:', fetchError);
    });

    fetchRegistration();
  }, [isAuthenticated, member?.user_id, refreshMember]);

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
      <div className="min-h-screen bg-muted/50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="min-h-screen bg-muted/50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-foreground font-medium mb-2">Unable to load your profile</p>
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

  const effectiveStatus = registration?.status ?? null;
  const effectiveRejectionReason = registration?.rejection_reason ?? null;
  const statusLabel = effectiveStatus === 'pending'
    ? 'Pending Review'
    : effectiveStatus === 'approved'
      ? 'Approved'
      : effectiveStatus === 'rejected'
        ? 'Rejected'
        : '';
  const displayNameRaw = registration?.full_name || member.full_name || '';
  const displayName = getFirstTwoWords(displayNameRaw);

  return (
    <div>
      <MemberNav />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
                  {member.profile_photo_url ? (
                    <img
                      src={member.profile_photo_url}
                      alt={member.full_name}
                      className="w-14 h-14 rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-7 h-7 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <h1 className="text-section font-semibold text-foreground">{displayName}</h1>
                  {registration?.company_name && (
                    <p className="text-sm text-muted-foreground mt-0.5">{registration.company_name}</p>
                  )}
                </div>
              </div>
              <Link
                to="/dashboard/edit"
                className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-muted/50 transition-colors"
              >
                <Edit className="w-4 h-4" />
                Edit Profile
              </Link>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-6">
                <div>
                  <h2 className="text-section font-semibold text-foreground mb-4 flex items-center gap-2">
                    <User className="w-5 h-5 text-primary" />
                    Personal Information
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-muted-foreground flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        Email Address
                      </label>
                      <p className="mt-1 text-foreground font-medium">{member.email}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        Mobile Number
                      </label>
                      <p className="mt-1 text-foreground font-medium">{member.mobile_number}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="text-section font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Building className="w-5 h-5 text-primary" />
                    Company Information
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-muted-foreground">Company Name</label>
                      <p className="mt-1 text-foreground font-medium">{registration?.company_name}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h2 className="text-section font-semibold text-foreground mb-4 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-primary" />
                    Membership Details
                  </h2>
                  {effectiveStatus === 'pending' && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                      {statusLabel}
                    </div>
                  )}
                  {effectiveStatus === 'approved' && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                      {statusLabel}
                    </div>
                  )}
                  {effectiveStatus === 'rejected' && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                      {statusLabel}
                    </div>
                  )}
                  {registrationError && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                      Could not refresh registration status. Showing last known status.
                    </div>
                  )}
                  <div className="space-y-4">
                    {member.member_id && (
                      <div>
                        <label className="text-sm text-muted-foreground">Member ID</label>
                        <p className="mt-1 text-foreground font-semibold text-sm">{member.member_id}</p>
                      </div>
                    )}

                    <div>
                      <label className="text-sm text-muted-foreground flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Member Since
                      </label>
                      <p className="mt-1 text-foreground font-medium">{formatDate(member.created_at)}</p>
                    </div>

                    {member.approval_date && (
                      <div>
                        <label className="text-sm text-muted-foreground">Approval Date</label>
                        <p className="mt-1 text-foreground font-medium">{formatDate(member.approval_date)}</p>
                      </div>
                    )}

                    {member.reapplication_count > 0 && (
                      <div>
                        <label className="text-sm text-muted-foreground">Application Attempts</label>
                        <p className="mt-1 text-foreground font-medium">{member.reapplication_count + 1}</p>
                      </div>
                    )}
                  </div>
                </div>

                {effectiveStatus === 'rejected' && effectiveRejectionReason && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-red-900 mb-2">Rejection Reason</h3>
                    <p className="text-sm text-red-700">{effectiveRejectionReason}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemberViewProfile;
