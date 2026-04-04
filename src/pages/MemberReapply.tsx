import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, AlertCircle, RefreshCw, Loader2, CheckCircle } from 'lucide-react';
import { useMember } from '../contexts/useMember';

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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-foreground font-medium mb-2">Unable to load your profile</p>
          <p className="text-muted-foreground mb-4">Please try again or contact support</p>
          <Link
            to="/dashboard"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 inline-block"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (member.status !== 'rejected') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <p className="text-foreground font-medium mb-2">Your application is {member.status}</p>
          <p className="text-muted-foreground mb-4">You can only re-apply if your application was rejected</p>
          <Link
            to="/dashboard"
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 inline-block"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </button>
        </div>

        <div className="bg-card rounded-lg shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-orange-600 to-red-600 px-6 py-6">
            <h1 className="text-xl font-semibold text-white flex items-center gap-2">
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
                <h2 className="text-section font-semibold text-foreground mb-2">About Re-application</h2>
                <p className="text-muted-foreground">
                  We understand that circumstances change. You're welcome to submit a new application for membership.
                  Please review the rejection reason above and ensure your new application addresses any issues mentioned.
                </p>
              </div>

              <div className="bg-primary/5 border border-border rounded-lg p-4">
                <h3 className="text-sm font-semibold text-foreground mb-2">What happens when you re-apply?</h3>
                <ul className="text-sm text-foreground space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>You'll be redirected to the registration form</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>Your email and mobile number will be pre-filled (these cannot be changed)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>You can update all other information in your application</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
                    <span>Your new application will be reviewed by our team</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-1">•</span>
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
                <h3 className="text-base font-semibold text-foreground">Before you continue:</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
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

            <div className="flex items-center justify-between pt-6 border-t border-border">
              <Link
                to="/dashboard"
                className="px-6 py-2 text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                Cancel
              </Link>
              <button
                onClick={handleReapply}
                className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Continue to Registration Form
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 bg-card rounded-lg shadow-md p-6">
          <h3 className="text-base font-semibold text-foreground mb-3">Need help?</h3>
          <p className="text-sm text-muted-foreground mb-4">
            If you have questions about the rejection reason or membership requirements, please contact our support team.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="mailto:support@lub.org"
              className="text-sm text-primary hover:text-primary/80 font-medium"
            >
              Email Support
            </a>
            <span className="text-muted-foreground/30">|</span>
            <a
              href="tel:+919876543210"
              className="text-sm text-primary hover:text-primary/80 font-medium"
            >
              Call Us
            </a>
            <span className="text-muted-foreground/30">|</span>
            <Link
              to="/"
              className="text-sm text-primary hover:text-primary/80 font-medium"
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
