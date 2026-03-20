import React, { useCallback, useEffect, useState } from 'react';
import { X, CreditCard as Edit, CheckCircle, XCircle, FileText, ExternalLink, User, Building2, MapPin, CreditCard, AlertCircle, ChevronDown, ChevronUp, Eye } from 'lucide-react';
import { memberRegistrationService } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';

interface CompanyDesignationSummary {
  designation_name: string;
}

interface ApplicationDetails {
  id: string;
  full_name: string;
  email: string;
  mobile_number: string;
  gender?: string | null;
  date_of_birth?: string | null;
  member_id?: string | null;
  company_name: string;
  company_designations?: CompanyDesignationSummary | null;
  company_address?: string | null;
  products_services?: string | null;
  brand_names?: string | null;
  website?: string | null;
  state?: string | null;
  district?: string | null;
  city?: string | null;
  other_city_name?: string | null;
  is_custom_city?: boolean;
  pin_code?: string | null;
  industry?: string | null;
  activity_type?: string | null;
  constitution?: string | null;
  annual_turnover?: string | null;
  number_of_employees?: string | null;
  gst_registered?: string | null;
  gst_number?: string | null;
  pan_company?: string | null;
  esic_registered?: string | null;
  epf_registered?: string | null;
  amount_paid?: string | null;
  payment_date?: string | null;
  payment_mode?: string | null;
  transaction_id?: string | null;
  bank_reference?: string | null;
  alternate_contact_name?: string | null;
  alternate_mobile?: string | null;
  referred_by?: string | null;
  gst_certificate_url?: string | null;
  udyam_certificate_url?: string | null;
  payment_proof_url?: string | null;
  profile_photo_url?: string | null;
  status?: 'pending' | 'approved' | 'rejected';
  first_viewed_at?: string | null;
  reviewed_count?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface SectionField {
  label: string;
  value: string | number | boolean | null | undefined;
  type?: 'date';
}

interface ViewApplicationModalProps {
  applicationId: string;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (applicationData: ApplicationDetails) => void;
  onApprove: (applicationId: string) => void;
  onReject: (applicationId: string) => void;
}

interface SectionData {
  title: string;
  icon: React.ReactNode;
  fields: SectionField[];
}

const ViewApplicationModal: React.FC<ViewApplicationModalProps> = ({
  applicationId,
  isOpen,
  onClose,
  onEdit,
  onApprove,
  onReject
}) => {
  const [applicationData, setApplicationData] = useState<ApplicationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['personal', 'company']));

  const loadApplicationDetails = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');

      const sessionToken = sessionManager.getSessionToken();
      const result = await memberRegistrationService.getApplicationDetails(applicationId, sessionToken || '');

      if (!result.success || !result.data) {
        setError(result.error || 'Failed to load application details');
        return;
      }

      setApplicationData(result.data);

      // Mark application as viewed
      if (sessionToken) {
        await memberRegistrationService.markApplicationAsViewed(applicationId, sessionToken);
      }
    } catch (err) {
      console.error('Error loading application:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    if (isOpen && applicationId) {
      void loadApplicationDetails();
    }
  }, [applicationId, isOpen, loadApplicationDetails]);

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not provided';
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatValue = (value: SectionField['value'], type?: SectionField['type']): string => {
    if (value === null || value === undefined || value === '') {
      return 'Not provided';
    }
    if (type === 'date') {
      return formatDate(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    return String(value);
  };

  const renderField = (label: string, value: SectionField['value'], type?: SectionField['type']) => {
    const formattedValue = formatValue(value, type);
    const isEmpty = formattedValue === 'Not provided';

    return (
      <div className="py-3 border-b border-gray-100 last:border-0">
        <dt className="text-sm font-medium text-gray-600 mb-1">{label}</dt>
        <dd className={`text-sm ${isEmpty ? 'text-gray-400 italic' : 'text-gray-900'}`}>
          {formattedValue}
        </dd>
      </div>
    );
  };

  const renderSection = (section: SectionData, sectionId: string) => {
    const isExpanded = expandedSections.has(sectionId);

    return (
      <div key={sectionId} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection(sectionId)}
          className="w-full px-6 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center">
            {section.icon}
            <h3 className="text-lg font-semibold text-gray-900 ml-3">{section.title}</h3>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </button>
        {isExpanded && (
          <dl className="px-6 py-2">
            {section.fields.map((field, index) => (
              <React.Fragment key={index}>
                {renderField(field.label, field.value, field.type)}
              </React.Fragment>
            ))}
          </dl>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg shadow-xl p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading application details...</p>
        </div>
      </div>
    );
  }

  if (error || !applicationData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <div className="flex items-center mb-4">
            <AlertCircle className="w-6 h-6 text-red-500 mr-3" />
            <h3 className="text-lg font-semibold text-gray-900">Error Loading Application</h3>
          </div>
          <p className="text-gray-600 mb-6">{error || 'Failed to load application details'}</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Only show filled fields
  const getFilledFields = (fields: SectionField[]) => {
    return fields.filter(field => {
      const value = field.value;
      return value !== null && value !== undefined && value !== '';
    });
  };

  const personalSection: SectionData = {
    title: 'Personal Information',
    icon: <User className="w-5 h-5 text-blue-600" />,
    fields: getFilledFields([
      { label: 'Full Name', value: applicationData.full_name },
      { label: 'Email', value: applicationData.email },
      { label: 'Mobile Number', value: applicationData.mobile_number },
      { label: 'Gender', value: applicationData.gender },
      { label: 'Date of Birth', value: applicationData.date_of_birth, type: 'date' },
      { label: 'Member ID', value: applicationData.member_id }
    ])
  };

  const companySection: SectionData = {
    title: 'Company Information',
    icon: <Building2 className="w-5 h-5 text-blue-600" />,
    fields: getFilledFields([
      { label: 'Company Name', value: applicationData.company_name },
      { label: 'Designation', value: applicationData.company_designations?.designation_name },
      { label: 'Company Address', value: applicationData.company_address },
      { label: 'Products & Services', value: applicationData.products_services },
      { label: 'Brand Names', value: applicationData.brand_names },
      { label: 'Website', value: applicationData.website }
    ])
  };

  const locationSection: SectionData = {
    title: 'Location Details',
    icon: <MapPin className="w-5 h-5 text-blue-600" />,
    fields: getFilledFields([
      { label: 'State', value: applicationData.state },
      { label: 'District', value: applicationData.district },
      { label: 'City', value: applicationData.is_custom_city ? applicationData.other_city_name : applicationData.city },
      { label: 'PIN Code', value: applicationData.pin_code }
    ])
  };

  const businessSection: SectionData = {
    title: 'Business Details',
    icon: <Building2 className="w-5 h-5 text-blue-600" />,
    fields: getFilledFields([
      { label: 'Industry', value: applicationData.industry },
      { label: 'Activity Type', value: applicationData.activity_type },
      { label: 'Constitution', value: applicationData.constitution },
      { label: 'Annual Turnover', value: applicationData.annual_turnover },
      { label: 'Number of Employees', value: applicationData.number_of_employees }
    ])
  };

  const registrationSection: SectionData = {
    title: 'Registration Information',
    icon: <FileText className="w-5 h-5 text-blue-600" />,
    fields: getFilledFields([
      { label: 'GST Registered', value: applicationData.gst_registered },
      { label: 'GST Number', value: applicationData.gst_number },
      { label: 'PAN (Company)', value: applicationData.pan_company },
      { label: 'ESIC Registered', value: applicationData.esic_registered },
      { label: 'EPF Registered', value: applicationData.epf_registered }
    ])
  };

  const paymentSection: SectionData = {
    title: 'Payment Information',
    icon: <CreditCard className="w-5 h-5 text-blue-600" />,
    fields: getFilledFields([
      { label: 'Amount Paid', value: applicationData.amount_paid },
      { label: 'Payment Date', value: applicationData.payment_date, type: 'date' },
      { label: 'Payment Mode', value: applicationData.payment_mode },
      { label: 'Transaction ID', value: applicationData.transaction_id },
      { label: 'Bank Reference', value: applicationData.bank_reference }
    ])
  };

  const additionalSection: SectionData = {
    title: 'Additional Information',
    icon: <User className="w-5 h-5 text-blue-600" />,
    fields: getFilledFields([
      { label: 'Alternate Contact Name', value: applicationData.alternate_contact_name },
      { label: 'Alternate Mobile', value: applicationData.alternate_mobile },
      { label: 'Referred By', value: applicationData.referred_by }
    ])
  };

  const sections = [
    { data: personalSection, id: 'personal' },
    { data: companySection, id: 'company' },
    { data: locationSection, id: 'location' },
    { data: businessSection, id: 'business' },
    { data: registrationSection, id: 'registration' },
    { data: paymentSection, id: 'payment' },
    { data: additionalSection, id: 'additional' }
  ].filter(section => section.data.fields.length > 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto my-8">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Application Review</h2>
            <p className="text-sm text-gray-600 mt-1">
              {applicationData.full_name} - {applicationData.company_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Status Badge */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                Status: {applicationData.status || 'Pending'}
              </span>
              {applicationData.first_viewed_at && (
                <span className="inline-flex items-center text-sm text-gray-600">
                  <Eye className="w-4 h-4 mr-1" />
                  Viewed {applicationData.reviewed_count || 1} time(s)
                </span>
              )}
            </div>
            <button
              onClick={() => onEdit(applicationData)}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit Application
            </button>
          </div>

          {/* Documents Section */}
          {(applicationData.gst_certificate_url || applicationData.udyam_certificate_url || applicationData.payment_proof_url || applicationData.profile_photo_url) && (
            <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Uploaded Documents</h3>
              <div className="flex flex-wrap gap-3">
                {applicationData.profile_photo_url && (
                  <a
                    href={applicationData.profile_photo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <User className="w-4 h-4 mr-2" />
                    Profile Photo
                    <ExternalLink className="w-3 h-3 ml-2" />
                  </a>
                )}
                {applicationData.gst_certificate_url && (
                  <a
                    href={applicationData.gst_certificate_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    GST Certificate
                    <ExternalLink className="w-3 h-3 ml-2" />
                  </a>
                )}
                {applicationData.udyam_certificate_url && (
                  <a
                    href={applicationData.udyam_certificate_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    UDYAM Certificate
                    <ExternalLink className="w-3 h-3 ml-2" />
                  </a>
                )}
                {applicationData.payment_proof_url && (
                  <a
                    href={applicationData.payment_proof_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Payment Proof
                    <ExternalLink className="w-3 h-3 ml-2" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Application Details Sections */}
          <div className="space-y-4">
            {sections.map(section => renderSection(section.data, section.id))}
          </div>

          {/* Submission Info */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              <p><span className="font-medium">Submitted:</span> {formatDate(applicationData.created_at)}</p>
              {applicationData.updated_at && applicationData.updated_at !== applicationData.created_at && (
                <p className="mt-1"><span className="font-medium">Last Updated:</span> {formatDate(applicationData.updated_at)}</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        {applicationData.status === 'pending' && (
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => onReject(applicationId)}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject
            </button>
            <button
              onClick={() => onApprove(applicationId)}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Approve
            </button>
          </div>
        )}

        {applicationData.status === 'rejected' && (
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => onApprove(applicationId)}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Approve
            </button>
          </div>
        )}

        {applicationData.status === 'approved' && (
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewApplicationModal;
