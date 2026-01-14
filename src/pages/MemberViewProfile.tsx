import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, User, Mail, Phone, Building, MapPin, Calendar, CreditCard, Edit, Loader2, AlertCircle } from 'lucide-react';
import { useMember } from '../contexts/MemberContext';
import { supabase } from '../lib/supabase';

const MemberViewProfile: React.FC = () => {
  const navigate = useNavigate();
  const { member, isAuthenticated, isLoading, refreshMember } = useMember();
  const [registration, setRegistration] = useState<any | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/signin');
    }
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    const fetchRegistration = async () => {
      if (!isAuthenticated || !member?.user_id) {
        return;
      }

      try {
        setRegistrationError(null);

        const { data, error } = await supabase
          .from('member_registrations')
          .select('status,approval_date,member_id,updated_at,created_at,rejection_reason')
          .eq('user_id', member.user_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          setRegistrationError(error.message || 'Unknown error');
          return;
        }

        setRegistration(data);
      } catch (error) {
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading your profile...</p>
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

  const effectiveStatus = registration?.status ?? member.status;
  const effectiveRejectionReason = registration?.rejection_reason ?? member.rejection_reason;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center">
                  {member.profile_photo_url ? (
                    <img
                      src={member.profile_photo_url}
                      alt={member.full_name}
                      className="w-20 h-20 rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-10 h-10 text-blue-600" />
                  )}
                </div>
                <div className="text-white">
                  <h1 className="text-2xl font-bold">{member.full_name}</h1>
                  <p className="text-blue-100">{member.company_name}</p>
                </div>
              </div>
              <Link
                to="/dashboard/edit"
                className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
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
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <User className="w-5 h-5 text-blue-600" />
                    Personal Information
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-600 flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        Email Address
                      </label>
                      <p className="mt-1 text-gray-900 font-medium">{member.email}</p>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        Mobile Number
                      </label>
                      <p className="mt-1 text-gray-900 font-medium">{member.mobile_number}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Building className="w-5 h-5 text-blue-600" />
                    Company Information
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-600">Company Name</label>
                      <p className="mt-1 text-gray-900 font-medium">{member.company_name}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-blue-600" />
                    Membership Details
                  </h2>
                  {effectiveStatus === 'pending' && (
                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                      Your membership application is pending review.
                    </div>
                  )}
                  {effectiveStatus === 'approved' && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                      Your membership has been approved.
                    </div>
                  )}
                  {effectiveStatus === 'rejected' && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                      {effectiveRejectionReason || 'Your membership application was rejected.'}
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
                        <label className="text-sm text-gray-600">Member ID</label>
                        <p className="mt-1 text-gray-900 font-bold text-lg">{member.member_id}</p>
                      </div>
                    )}

                    <div>
                      <label className="text-sm text-gray-600 flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        Member Since
                      </label>
                      <p className="mt-1 text-gray-900 font-medium">{formatDate(member.created_at)}</p>
                    </div>

                    {member.approval_date && (
                      <div>
                        <label className="text-sm text-gray-600">Approval Date</label>
                        <p className="mt-1 text-gray-900 font-medium">{formatDate(member.approval_date)}</p>
                      </div>
                    )}

                    {member.reapplication_count > 0 && (
                      <div>
                        <label className="text-sm text-gray-600">Application Attempts</label>
                        <p className="mt-1 text-gray-900 font-medium">{member.reapplication_count + 1}</p>
                      </div>
                    )}
                  </div>
                </div>

                {member.status === 'rejected' && member.rejection_reason && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-red-900 mb-2">Rejection Reason</h3>
                    <p className="text-sm text-red-700">{member.rejection_reason}</p>
                    <Link
                      to="/dashboard/reapply"
                      className="mt-4 inline-flex items-center text-sm font-medium text-red-800 hover:text-red-900"
                    >
                      Re-apply for membership →
                    </Link>
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
