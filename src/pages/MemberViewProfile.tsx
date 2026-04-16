import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  User, Building2, CreditCard, Edit, Loader2, AlertCircle,
  Briefcase, FileText, ExternalLink, Users, Wallet, ShieldCheck, Paperclip
} from 'lucide-react';
import MemberNav from '../components/MemberNav';
import { useMember } from '../contexts/useMember';
import { memberRegistrationService } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { formatDateValue } from '../lib/dateTimeManager';

interface MemberRegistrationData {
  status?: string | null;
  rejection_reason?: string | null;
  // Personal
  full_name?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  email?: string | null;
  mobile_number?: string | null;
  profile_photo_url?: string | null;
  // Company
  company_name?: string | null;
  designation?: string | null;
  company_address?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  pin_code?: string | null;
  // Business
  industry?: string | null;
  activity_type?: string | null;
  constitution?: string | null;
  annual_turnover?: string | null;
  number_of_employees?: string | null;
  products_services?: string | null;
  brand_names?: string | null;
  website?: string | null;
  // Registration & Compliance
  gst_registered?: string | null;
  gst_number?: string | null;
  pan_company?: string | null;
  esic_registered?: string | null;
  epf_registered?: string | null;
  // Documents
  gst_certificate_url?: string | null;
  udyam_certificate_url?: string | null;
  payment_proof_url?: string | null;
  // Payment
  amount_paid?: string | null;
  payment_date?: string | null;
  payment_mode?: string | null;
  transaction_id?: string | null;
  bank_reference?: string | null;
  // Alternate contact
  alternate_contact_name?: string | null;
  alternate_mobile?: string | null;
  referred_by?: string | null;
  // Membership
  member_id?: string | null;
  approval_date?: string | null;
  created_at?: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function v(s: string | null | undefined): string {
  return s?.trim() ?? '';
}

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
      <Icon className="w-4 h-4 text-primary shrink-0" />
      {title}
    </h2>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function WideField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="col-span-full">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-foreground whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function YesNoField({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <span
        className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          value === 'yes' ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'
        }`}
      >
        {value === 'yes' ? 'Yes' : 'No'}
      </span>
    </div>
  );
}

function DocLink({ label, url }: { label: string; url: string }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/50 transition-colors"
    >
      <FileText className="w-4 h-4 text-primary shrink-0" />
      {label}
      <ExternalLink className="w-3 h-3 text-muted-foreground ml-1" />
    </a>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

const MemberViewProfile: React.FC = () => {
  const navigate = useNavigate();
  const { member, isAuthenticated, isLoading, refreshMember } = useMember();
  const [registration, setRegistration] = useState<MemberRegistrationData | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/signin');
    }
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    const fetchRegistration = async () => {
      if (!isAuthenticated) return;

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
        setRegistration(data as MemberRegistrationData);
      } catch {
        setRegistrationError('Unknown error');
      }
    };

    refreshMember().catch((err) => {
      console.error('[MemberViewProfile] Failed to refresh member data:', err);
    });
    fetchRegistration();
  }, [isAuthenticated, member?.user_id, refreshMember]);

  const formatDate = (d: string | null | undefined) => (d ? formatDateValue(d) : '');

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

  const r = registration;

  // Effective values (registration row wins, member context as fallback)
  const effectiveStatus = v(r?.status) || v(member.status);
  const effectiveRejectionReason = v(r?.rejection_reason) || v(member.rejection_reason);
  const displayName = v(r?.full_name) || v(member.full_name);
  const displayCompany = v(r?.company_name) || v(member.company_name);
  const photoUrl = v(r?.profile_photo_url) || v(member.profile_photo_url) || '';
  const memberId = v(r?.member_id) || v(member.member_id);
  const approvalDate = v(r?.approval_date) || v(member.approval_date);

  const statusLabel =
    effectiveStatus === 'pending' ? 'Pending Review'
    : effectiveStatus === 'approved' ? 'Approved'
    : effectiveStatus === 'rejected' ? 'Rejected'
    : '';

  const statusClass =
    effectiveStatus === 'approved'
      ? 'bg-green-50 border-green-200 text-green-800'
      : effectiveStatus === 'rejected'
      ? 'bg-red-50 border-red-200 text-red-800'
      : 'bg-yellow-50 border-yellow-200 text-yellow-800';

  // Section visibility
  const hasBusinessDetails =
    v(r?.industry) || v(r?.activity_type) || v(r?.constitution) ||
    v(r?.annual_turnover) || v(r?.number_of_employees) || v(r?.products_services) ||
    v(r?.brand_names) || v(r?.website);

  const hasComplianceDetails =
    v(r?.gst_registered) || v(r?.pan_company) || v(r?.esic_registered) || v(r?.epf_registered);

  const hasAlternateContact = v(r?.alternate_contact_name) || v(r?.alternate_mobile);

  const hasPaymentInfo = v(r?.amount_paid) || v(r?.payment_date) || v(r?.payment_mode);

  const hasDocuments =
    v(r?.gst_certificate_url) || v(r?.udyam_certificate_url) || v(r?.payment_proof_url);

  return (
    <div>
      <MemberNav />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="px-6 py-5 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                  {photoUrl ? (
                    <img src={photoUrl} alt={displayName} className="w-14 h-14 rounded-full object-cover" />
                  ) : (
                    <User className="w-7 h-7 text-muted-foreground" />
                  )}
                </div>
                <div>
                  <h1 className="text-section font-semibold text-foreground">{displayName}</h1>
                  {displayCompany && (
                    <p className="text-sm text-muted-foreground mt-0.5">{displayCompany}</p>
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

          {/* ── Registration error notice ──────────────────────────────── */}
          {registrationError && (
            <div className="mx-6 mt-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
              Could not load full registration details. Showing available information only.
            </div>
          )}

          <div className="divide-y divide-border">

            {/* ── 1. Personal Information ────────────────────────────── */}
            <section className="p-6">
              <SectionHeader icon={User} title="Personal Information" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                <Field label="Full Name" value={displayName} />
                <Field
                  label="Gender"
                  value={v(r?.gender) ? v(r?.gender).charAt(0).toUpperCase() + v(r?.gender).slice(1) : ''}
                />
                <Field label="Date of Birth" value={formatDate(r?.date_of_birth)} />
                <Field label="Email Address" value={v(r?.email) || v(member.email)} />
                <Field label="Mobile Number" value={v(r?.mobile_number) || v(member.mobile_number)} />
              </div>
            </section>

            {/* ── 2. Company & Location ──────────────────────────────── */}
            <section className="p-6">
              <SectionHeader icon={Building2} title="Company & Location" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                <Field label="Company Name" value={displayCompany} />
                <Field label="Designation" value={v(r?.designation)} />
                <WideField label="Company Address" value={v(r?.company_address)} />
                <Field label="City" value={v(r?.city)} />
                <Field label="District" value={v(r?.district)} />
                <Field label="State" value={v(r?.state) || v(member.state)} />
                <Field label="Pin Code" value={v(r?.pin_code)} />
              </div>
            </section>

            {/* ── 3. Business Details ────────────────────────────────── */}
            {hasBusinessDetails && (
              <section className="p-6">
                <SectionHeader icon={Briefcase} title="Business Details" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                  <Field label="Industry" value={v(r?.industry)} />
                  <Field label="Activity Type" value={v(r?.activity_type)} />
                  <Field label="Constitution" value={v(r?.constitution)} />
                  <Field label="Annual Turnover" value={v(r?.annual_turnover)} />
                  <Field label="Number of Employees" value={v(r?.number_of_employees)} />
                  <WideField label="Products / Services" value={v(r?.products_services)} />
                  <Field label="Brand Names" value={v(r?.brand_names)} />
                  <Field label="Website" value={v(r?.website)} />
                </div>
              </section>
            )}

            {/* ── 4. Registration & Compliance ──────────────────────── */}
            {hasComplianceDetails && (
              <section className="p-6">
                <SectionHeader icon={ShieldCheck} title="Registration & Compliance" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                  <YesNoField label="GST Registered" value={v(r?.gst_registered)} />
                  {v(r?.gst_registered) === 'yes' && (
                    <Field label="GST Number" value={v(r?.gst_number)} />
                  )}
                  <Field label="PAN (Company)" value={v(r?.pan_company)} />
                  <YesNoField label="ESIC Registered" value={v(r?.esic_registered)} />
                  <YesNoField label="EPF Registered" value={v(r?.epf_registered)} />
                </div>
              </section>
            )}

            {/* ── 5. Membership Details ──────────────────────────────── */}
            <section className="p-6">
              <SectionHeader icon={CreditCard} title="Membership Details" />
              {statusLabel && (
                <div className={`mb-4 inline-block rounded-lg border px-3 py-1.5 text-sm font-medium ${statusClass}`}>
                  {statusLabel}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                {memberId && <Field label="Member ID" value={memberId} />}
                <Field label="Member Since" value={formatDate(member.created_at)} />
                {approvalDate && <Field label="Approval Date" value={formatDate(approvalDate)} />}
                {member.reapplication_count > 0 && (
                  <Field label="Application Attempts" value={String(member.reapplication_count + 1)} />
                )}
              </div>
            </section>

            {/* ── 6. Alternate Contact ───────────────────────────────── */}
            {hasAlternateContact && (
              <section className="p-6">
                <SectionHeader icon={Users} title="Alternate Contact" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                  <Field label="Name" value={v(r?.alternate_contact_name)} />
                  <Field label="Mobile" value={v(r?.alternate_mobile)} />
                </div>
              </section>
            )}

            {/* ── 7. Referral ────────────────────────────────────────── */}
            {v(r?.referred_by) && (
              <section className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                  <Field label="Referred By" value={v(r?.referred_by)} />
                </div>
              </section>
            )}

            {/* ── 8. Payment Information ─────────────────────────────── */}
            {hasPaymentInfo && (
              <section className="p-6">
                <SectionHeader icon={Wallet} title="Payment Information" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                  <Field label="Amount Paid" value={v(r?.amount_paid)} />
                  <Field label="Payment Date" value={formatDate(r?.payment_date)} />
                  <Field label="Payment Mode" value={v(r?.payment_mode)} />
                  <Field label="Transaction ID" value={v(r?.transaction_id)} />
                  <Field label="Bank Reference" value={v(r?.bank_reference)} />
                </div>
              </section>
            )}

            {/* ── 9. Documents ───────────────────────────────────────── */}
            {hasDocuments && (
              <section className="p-6">
                <SectionHeader icon={Paperclip} title="Documents" />
                <div className="flex flex-wrap gap-3">
                  <DocLink label="GST Certificate" url={v(r?.gst_certificate_url)} />
                  <DocLink label="UDYAM Certificate" url={v(r?.udyam_certificate_url)} />
                  <DocLink label="Payment Proof" url={v(r?.payment_proof_url)} />
                </div>
              </section>
            )}

            {/* ── 10. Rejection reason ───────────────────────────────── */}
            {effectiveStatus === 'rejected' && effectiveRejectionReason && (
              <section className="p-6">
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <h3 className="text-sm font-semibold text-red-900 mb-2">Rejection Reason</h3>
                  <p className="text-sm text-red-700">{effectiveRejectionReason}</p>
                </div>
              </section>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default MemberViewProfile;
