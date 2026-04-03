import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, CreditCard as Edit, CheckCircle, XCircle, FileText, ExternalLink, User, Building2, MapPin, CreditCard, AlertCircle, ChevronDown, ChevronUp, Eye, Download, Loader2 } from 'lucide-react';
import { memberRegistrationService } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { useOrganisationProfile } from '../hooks/useOrganisationProfile';

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
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const pdfTemplateRef = useRef<HTMLDivElement>(null);
  const { profile: orgProfile } = useOrganisationProfile();

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

  const handleDownloadPdf = async () => {
    if (!applicationData || !pdfTemplateRef.current) return;

    const templateRoot = pdfTemplateRef.current;
    const headerTemplate = templateRoot.querySelector('[data-pdf-template="header"]') as HTMLDivElement | null;
    const summaryTemplate = templateRoot.querySelector('[data-pdf-template="summary"]') as HTMLDivElement | null;
    const footerTemplate = templateRoot.querySelector('[data-pdf-template="footer"]') as HTMLDivElement | null;
    const sectionTemplates = Array.from(templateRoot.querySelectorAll('[data-pdf-section="true"]')) as HTMLDivElement[];

    if (!headerTemplate || !summaryTemplate || !footerTemplate || sectionTemplates.length === 0) {
      return;
    }

    let pageHost: HTMLDivElement | null = null;

    try {
      setIsGeneratingPdf(true);
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas')
      ]);

      const PAGE_WIDTH = 794;
      const PAGE_HEIGHT = 1123;
      const PAGE_MARGIN = 76;

      pageHost = document.createElement('div');
      pageHost.style.position = 'fixed';
      pageHost.style.left = '-20000px';
      pageHost.style.top = '0';
      pageHost.style.width = `${PAGE_WIDTH}px`;
      pageHost.style.pointerEvents = 'none';
      pageHost.style.opacity = '0';
      pageHost.style.zIndex = '-1';
      pageHost.style.fontFamily = 'Arial, Helvetica, sans-serif';
      pageHost.style.WebkitFontSmoothing = 'antialiased';
      pageHost.style.MozOsxFontSmoothing = 'grayscale';
      pageHost.style.textRendering = 'geometricPrecision';
      document.body.appendChild(pageHost);

      const createPdfPage = (includeHeader: boolean, includeSummary: boolean) => {
        const page = document.createElement('div');
        page.style.width = `${PAGE_WIDTH}px`;
        page.style.height = `${PAGE_HEIGHT}px`;
        page.style.background = '#ffffff';
        page.style.display = 'flex';
        page.style.flexDirection = 'column';
        page.style.boxSizing = 'border-box';
        page.style.overflow = 'hidden';
        page.style.pageBreakAfter = 'always';
        page.style.fontFamily = 'Arial, Helvetica, sans-serif';
        page.style.WebkitFontSmoothing = 'antialiased';
        page.style.MozOsxFontSmoothing = 'grayscale';
        page.style.textRendering = 'geometricPrecision';

        const body = document.createElement('div');
        body.style.display = 'flex';
        body.style.flexDirection = 'column';
        body.style.flex = '1 1 auto';
        body.style.padding = `${PAGE_MARGIN}px`;
        body.style.boxSizing = 'border-box';
        body.style.height = '100%';
        body.style.background = '#ffffff';
        page.appendChild(body);

        if (includeHeader) {
          body.appendChild(headerTemplate.cloneNode(true));
        }

        if (includeSummary) {
          body.appendChild(summaryTemplate.cloneNode(true));
        }

        const content = document.createElement('div');
        content.style.flex = '1 1 auto';
        content.style.padding = '22px 0 0';
        content.style.background = '#f8fafc';
        content.style.boxSizing = 'border-box';
        content.style.overflow = 'hidden';
        content.style.minHeight = '0';
        body.appendChild(content);

        pageHost.appendChild(page);

        return { page, body, content };
      };

      const measurePage = createPdfPage(true, true);
      const firstPageCapacity = measurePage.content.clientHeight;
      measurePage.page.remove();

      const spillMeasurePage = createPdfPage(false, false);
      const spillPageCapacity = spillMeasurePage.content.clientHeight;
      spillMeasurePage.page.remove();

      const footerMeasurePage = createPdfPage(false, false);
      const footerClone = footerTemplate.cloneNode(true) as HTMLDivElement;
      footerMeasurePage.body.appendChild(footerClone);
      const footerHeight = footerClone.offsetHeight;
      footerMeasurePage.page.remove();

      let currentPage = createPdfPage(true, true);
      let remainingHeight = firstPageCapacity;

      sectionTemplates.forEach((sectionTemplate) => {
        const sectionHeight = sectionTemplate.offsetHeight;
        const needsNewPage = sectionHeight > remainingHeight && currentPage.content.children.length > 0;

        if (needsNewPage) {
          currentPage = createPdfPage(false, false);
          remainingHeight = spillPageCapacity;
        }

        currentPage.content.appendChild(sectionTemplate.cloneNode(true));
        remainingHeight -= sectionHeight;
      });

      if (remainingHeight < footerHeight && currentPage.content.children.length > 0) {
        currentPage = createPdfPage(false, false);
      }

      currentPage.body.appendChild(footerTemplate.cloneNode(true));

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = 210;
      const pdfHeight = 297;
      const pages = Array.from(pageHost.children) as HTMLDivElement[];

      for (let index = 0; index < pages.length; index += 1) {
        const pageElement = pages[index];
        const canvas = await html2canvas(pageElement, {
          scale: 4,
          useCORS: true,
          backgroundColor: '#ffffff',
          width: PAGE_WIDTH,
          height: PAGE_HEIGHT,
          windowWidth: PAGE_WIDTH,
          windowHeight: PAGE_HEIGHT,
          scrollX: 0,
          scrollY: 0,
          logging: false
        });

        const imgData = canvas.toDataURL('image/png');
        if (index > 0) {
          pdf.addPage();
        }
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      }

      const safeName = applicationData.full_name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const date = new Date().toISOString().split('T')[0];
      pdf.save(`LUB_MemberDetails_${safeName}_${date}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
    } finally {
      pageHost?.remove();
      setIsGeneratingPdf(false);
    }
  };

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
      { label: 'ESIC Registered', value: applicationData.esic_registered },
      { label: 'EPF Registered', value: applicationData.epf_registered }
    ])
  };

  const paymentSection: SectionData = {
    title: 'Payment Information',
    icon: <CreditCard className="w-5 h-5 text-blue-600" />,
    fields: [
      ...getFilledFields([
        { label: 'Amount Paid', value: applicationData.amount_paid },
        { label: 'Payment Mode', value: applicationData.payment_mode },
        { label: 'Transaction ID', value: applicationData.transaction_id },
        { label: 'Bank Reference', value: applicationData.bank_reference }
      ]),
      applicationData.payment_date
        ? { label: 'Payment Date', value: applicationData.payment_date, type: 'date' as const }
        : { label: 'Payment Date', value: 'Not Available' }
    ]
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
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingPdf ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</>
              ) : (
                <><Download className="w-4 h-4 mr-2" />Download PDF</>
              )}
            </button>
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

      {/* Off-screen PDF content — captured by html2canvas on demand */}
      <div
        ref={pdfTemplateRef}
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          width: '794px',
          backgroundColor: '#ffffff',
          fontFamily: 'Arial, Helvetica, sans-serif',
          fontSize: '13px',
          color: '#1f2937',
          lineHeight: '1.5',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textRendering: 'geometricPrecision'
        }}
      >
        {/* PDF Header — brand bar */}
        <div data-pdf-template="header" style={{ background: '#1e40af', padding: '22px 32px', display: 'flex', alignItems: 'center', gap: '18px' }}>
          {orgProfile?.organization_logo_url && (
            <img
              src={orgProfile.organization_logo_url}
              crossOrigin="anonymous"
              alt="Logo"
              style={{ width: 54, height: 54, objectFit: 'contain', background: 'white', borderRadius: 8, padding: 5, flexShrink: 0 }}
            />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ color: 'white', fontSize: 21, fontWeight: 700, letterSpacing: '-0.01em' }}>
              {orgProfile?.organization_name ?? 'Laghu Udyog Bharati'}
            </div>
            <div style={{ color: '#bfdbfe', fontSize: 11, marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Member Details
            </div>
          </div>
          {applicationData.member_id && (
            <div style={{ textAlign: 'right', color: '#e0f2fe', fontSize: 11 }}>
              Member ID: {applicationData.member_id}
            </div>
          )}
        </div>

        {/* Member Summary — clean white card with accent border */}
        <div data-pdf-template="summary" style={{ background: '#ffffff', padding: '18px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', borderLeft: '4px solid #3b82f6' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>{applicationData.full_name}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              {applicationData.company_name}
              {applicationData.company_designations?.designation_name && ` - ${applicationData.company_designations.designation_name}`}
            </div>
          </div>
          <div style={{
            background: applicationData.status === 'approved' ? '#dcfce7' : applicationData.status === 'rejected' ? '#fee2e2' : '#fef9c3',
            color: applicationData.status === 'approved' ? '#15803d' : applicationData.status === 'rejected' ? '#b91c1c' : '#a16207',
            border: `1px solid ${applicationData.status === 'approved' ? '#86efac' : applicationData.status === 'rejected' ? '#fca5a5' : '#fde047'}`,
            display: 'table',
            minWidth: 138,
            height: 32,
            borderRadius: 20,
            padding: '0 16px'
          }}>
            <div style={{
              display: 'table-cell',
              verticalAlign: 'middle',
              textAlign: 'center',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              lineHeight: 1
            }}>
              {applicationData.status ?? 'Pending'}
            </div>
          </div>
        </div>

        {/* Sections */}
        <div style={{ padding: '22px 32px', background: '#f8fafc' }}>
          {[
            { title: 'Personal Information', fields: [
              { label: 'Full Name', value: applicationData.full_name },
              { label: 'Email', value: applicationData.email },
              { label: 'Mobile Number', value: applicationData.mobile_number },
              { label: 'Gender', value: applicationData.gender },
              { label: 'Date of Birth', value: applicationData.date_of_birth ? formatDate(applicationData.date_of_birth) : null },
              { label: 'Member ID', value: applicationData.member_id }
            ]},
            { title: 'Company Information', fields: [
              { label: 'Company Name', value: applicationData.company_name },
              { label: 'Designation', value: applicationData.company_designations?.designation_name },
              { label: 'Company Address', value: applicationData.company_address },
              { label: 'Products & Services', value: applicationData.products_services },
              { label: 'Brand Names', value: applicationData.brand_names },
              { label: 'Website', value: applicationData.website }
            ]},
            { title: 'Location Details', fields: [
              { label: 'State', value: applicationData.state },
              { label: 'District', value: applicationData.district },
              { label: 'City', value: applicationData.is_custom_city ? applicationData.other_city_name : applicationData.city },
              { label: 'PIN Code', value: applicationData.pin_code }
            ]},
            { title: 'Business Details', fields: [
              { label: 'Industry', value: applicationData.industry },
              { label: 'Activity Type', value: applicationData.activity_type },
              { label: 'Constitution', value: applicationData.constitution },
              { label: 'Annual Turnover', value: applicationData.annual_turnover },
              { label: 'Number of Employees', value: applicationData.number_of_employees }
            ]},
            { title: 'Registration Information', fields: [
              { label: 'GST Registered', value: applicationData.gst_registered },
              { label: 'GST Number', value: applicationData.gst_number },
              { label: 'ESIC Registered', value: applicationData.esic_registered },
              { label: 'EPF Registered', value: applicationData.epf_registered }
            ]},
            { title: 'Payment Information', fields: [
              { label: 'Amount Paid', value: applicationData.amount_paid },
              { label: 'Payment Date', value: applicationData.payment_date ? formatDate(applicationData.payment_date) : 'Not Available' },
              { label: 'Payment Mode', value: applicationData.payment_mode },
              { label: 'Transaction ID', value: applicationData.transaction_id },
              { label: 'Bank Reference', value: applicationData.bank_reference }
            ]},
            { title: 'Additional Information', fields: [
              { label: 'Alternate Contact Name', value: applicationData.alternate_contact_name },
              { label: 'Alternate Mobile', value: applicationData.alternate_mobile },
              { label: 'Referred By', value: applicationData.referred_by }
            ]}
          ].map(section => {
            const filled = section.fields.filter(f => f.value !== null && f.value !== undefined && f.value !== '');
            if (filled.length === 0) return null;
            return (
              <div key={section.title} data-pdf-section="true" style={{ marginBottom: 16, background: '#ffffff', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                <div style={{ background: '#eff6ff', borderBottom: '1px solid #bfdbfe', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 3, height: 14, background: '#3b82f6', borderRadius: 2, flexShrink: 0 }} />
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{section.title}</div>
                </div>
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                    {filled.map(field => (
                      <div key={field.label} style={{ width: '50%', paddingRight: 16, paddingBottom: 12 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{field.label}</div>
                        <div style={{ fontSize: 12, color: '#1e293b', fontWeight: 500, wordBreak: 'break-word' }}>{String(field.value)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* PDF Footer */}
        <div data-pdf-template="footer" style={{ marginTop: '18px', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #cbd5e1', background: '#ffffff' }}>
          <div style={{ fontSize: 10, color: '#64748b' }}>
            {orgProfile?.organization_name ?? 'Laghu Udyog Bharati'} - Confidential. For internal use only.
          </div>
          <div style={{ fontSize: 10, color: '#64748b' }}>
            Generated {new Date().toLocaleDateString('en-IN')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ViewApplicationModal;
