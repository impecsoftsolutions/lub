import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, AlertCircle, RefreshCw, Loader2, CheckCircle } from 'lucide-react';
import { useMember } from '../contexts/MemberContext';

const MemberReapply: React.FC = () => {
  const navigate = useNavigate();
  const { member, isAuthenticated, isLoading } = useMember();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/signin');
    }
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    if (member && member.status !== 'rejected') {
      navigate('/dashboard');
    }
  }, [member, navigate]);

  const handleReapply = () => {
    navigate('/join');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
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

  if (member.status !== 'rejected') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-gray-900 font-medium mb-2">Your application is {member.status}</p>
          <p className="text-gray-600 mb-4">You can only re-apply if your application was rejected</p>
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
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
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
          <div className="bg-gradient-to-r from-orange-600 to-red-600 px-6 py-6">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <RefreshCw className="w-6 h-6" />
              Re-apply for Membership
            </h1>
            <p className="text-orange-100 mt-1">Submit a new application for LUB membership</p>
          </div>

          <div className="p-6 space-y-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-red-900 mb-1">Previous Application Rejected</h3>
                  <p className="text-sm text-red-700">
                    {member.rejection_reason || 'Your previous application did not meet our membership criteria.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">About Re-application</h2>
                <p className="text-gray-600">
                  We understand that circumstances change. You're welcome to submit a new application for membership.
                  Please review the rejection reason above and ensure your new application addresses any issues mentioned.
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-2">What happens when you re-apply?</h3>
                <ul className="text-sm text-blue-800 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-1">•</span>
                    <span>You'll be redirected to the registration form</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-1">•</span>
                    <span>Your email and mobile number will be pre-filled (these cannot be changed)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-1">•</span>
                    <span>You can update all other information in your application</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-1">•</span>
                    <span>Your new application will be reviewed by our team</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-1">•</span>
                    <span>You'll receive an email notification once a decision is made</span>
                  </li>
                </ul>
              </div>

              {member.reapplication_count > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    <strong>Note:</strong> This will be your {member.reapplication_count + 2}{getOrdinalSuffix(member.reapplication_count + 2)} application attempt.
                    Please carefully review all requirements before submitting.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-gray-900">Before you continue:</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Review the rejection reason and ensure you can address it</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Prepare all required documents (GST certificate, Udyam certificate, payment proof)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Ensure all information you provide is accurate and complete</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>Have your payment details ready (if required)</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-between pt-6 border-t border-gray-200">
              <Link
                to="/dashboard"
                className="px-6 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </Link>
              <button
                onClick={handleReapply}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Continue to Registration Form
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 bg-white rounded-lg shadow-md p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-3">Need help?</h3>
          <p className="text-sm text-gray-600 mb-4">
            If you have questions about the rejection reason or membership requirements, please contact our support team.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="mailto:support@lub.org"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Email Support
            </a>
            <span className="text-gray-300">|</span>
            <a
              href="tel:+919876543210"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Call Us
            </a>
            <span className="text-gray-300">|</span>
            <Link
              to="/"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              View Membership Requirements
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

function getOrdinalSuffix(num: number): string {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

export default MemberReapply;
