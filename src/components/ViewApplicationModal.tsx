import React, { useCallback, useEffect, useState } from 'react';
import { X, CreditCard as Edit, CheckCircle, XCircle, FileText, ExternalLink, User, Building2, MapPin, CreditCard, AlertCircle, ChevronDown, ChevronUp, Eye, Download, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { memberRegistrationService } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { useOrganisationProfile } from '../hooks/useOrganisationProfile';
import { formatDateValue } from '../lib/dateTimeManager';

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
  readOnly?: boolean;
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
  onReject,
  readOnly = false
}) => {
  const [applicationData, setApplicationData] = useState<ApplicationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['personal', 'company']));
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string>('');
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
    if (!applicationData) {
      setPdfError('Application data is not available for PDF export.');
      return;
    }

    try {
      setIsGeneratingPdf(true);
      setPdfError('');
      const { default: jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 14;
      const contentWidth = pageWidth - margin * 2;
      const footerY = pageHeight - 10;
      let y = margin;

      const ensureSpace = (requiredHeight: number) => {
        if (y + requiredHeight > pageHeight - 18) {
          pdf.addPage();
          y = margin;
        }
      };

      const writeWrapped = (text: string, x: number, maxWidth: number, lineHeight = 5): number => {
        const lines = pdf.splitTextToSize(text, maxWidth) as string[];
        lines.forEach((line) => {
          pdf.text(line, x, y);
          y += lineHeight;
        });
        return lines.length;
      };

      const writeField = (label: string, rawValue: string | null | undefined) => {
        const value = (rawValue ?? '').trim();
        if (!value) return;
        ensureSpace(10);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.text(`${label}:`, margin, y);
        y += 4.5;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        writeWrapped(value, margin, contentWidth, 4.5);
        y += 1.5;
      };

      const writeSection = (title: string, fields: Array<{ label: string; value: string | null | undefined }>) => {
        const presentFields = fields.filter((field) => (field.value ?? '').toString().trim().length > 0);
        if (presentFields.length === 0) return;

        ensureSpace(10);
        pdf.setDrawColor(226, 232, 240);
        pdf.setFillColor(248, 250, 252);
        pdf.rect(margin, y - 4, contentWidth, 7, 'FD');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.text(title, margin + 2, y + 1);
        y += 8;

        presentFields.forEach((field) => writeField(field.label, field.value));
        y += 1;
      };

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.text(orgProfile?.organization_name ?? 'Laghu Udyog Bharati', margin, y);
      y += 7;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(12);
      pdf.text('Application Review', margin, y);
      y += 8;

      pdf.setFontSize(10);
      pdf.text(`Name: ${applicationData.full_name}`, margin, y);
      y += 5;
      pdf.text(`Company: ${applicationData.company_name}`, margin, y);
      y += 5;
      pdf.text(`Status: ${applicationData.status ?? 'pending'}`, margin, y);
      y += 7;

      pdf.setDrawColor(203, 213, 225);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 6;

      writeSection('Personal Information', [
        { label: 'Full Name', value: applicationData.full_name },
        { label: 'Email', value: applicationData.email },
        { label: 'Mobile Number', value: applicationData.mobile_number },
        { label: 'Gender', value: applicationData.gender ?? null },
        { label: 'Date of Birth', value: applicationData.date_of_birth ? formatDate(applicationData.date_of_birth) : null },
        { label: 'Reference Name', value: applicationData.referred_by ?? null },
        { label: 'Member ID', value: applicationData.member_id ?? null },
      ]);

      writeSection('Company Information', [
        { label: 'Company Name', value: applicationData.company_name },
        { label: 'Designation', value: applicationData.company_designations?.designation_name ?? null },
        { label: 'Company Address', value: applicationData.company_address ?? null },
        { label: 'Products & Services', value: applicationData.products_services ?? null },
        { label: 'Brand Names', value: applicationData.brand_names ?? null },
        { label: 'Website', value: applicationData.website ?? null },
      ]);

      writeSection('Location Details', [
        { label: 'State', value: applicationData.state ?? null },
        { label: 'District', value: applicationData.district ?? null },
        { label: 'City', value: applicationData.is_custom_city ? applicationData.other_city_name ?? null : applicationData.city ?? null },
        { label: 'PIN Code', value: applicationData.pin_code ?? null },
      ]);

      writeSection('Business Details', [
        { label: 'Industry', value: applicationData.industry ?? null },
        { label: 'Activity Type', value: applicationData.activity_type ?? null },
        { label: 'Constitution', value: applicationData.constitution ?? null },
        { label: 'Annual Turnover', value: applicationData.annual_turnover ?? null },
        { label: 'Number of Employees', value: applicationData.number_of_employees ?? null },
      ]);

      writeSection('Registration Information', [
        { label: 'GST Registered', value: applicationData.gst_registered ?? null },
        { label: 'GST Number', value: applicationData.gst_number ?? null },
        { label: 'ESIC Registered', value: applicationData.esic_registered ?? null },
        { label: 'EPF Registered', value: applicationData.epf_registered ?? null },
      ]);

      writeSection('Payment Information', [
        { label: 'Amount Paid', value: applicationData.amount_paid ?? null },
        { label: 'Payment Date', value: applicationData.payment_date ? formatDate(applicationData.payment_date) : null },
        { label: 'Payment Mode', value: applicationData.payment_mode ?? null },
        { label: 'Transaction ID', value: applicationData.transaction_id ?? null },
        { label: 'Bank Reference', value: applicationData.bank_reference ?? null },
      ]);

      writeSection('Additional Information', [
        { label: 'Alternate Contact Name', value: applicationData.alternate_contact_name ?? null },
        { label: 'Alternate Mobile', value: applicationData.alternate_mobile ?? null },
      ]);

      const totalPages = pdf.getNumberOfPages();
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        pdf.setPage(pageNumber);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.text(`Generated ${formatDateValue(new Date())}`, margin, footerY);
        pdf.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin, footerY, { align: 'right' });
      }

      const safeName = applicationData.full_name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      const date = new Date().toISOString().split('T')[0];
      pdf.save(`LUB_MemberDetails_${safeName}_${date}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      setPdfError(`Failed to generate PDF. ${message}`);
    } finally {
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
    return formatDateValue(dateString);
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
      <div className="py-3 border-b border-border last:border-0">
        <dt className="text-sm font-medium text-muted-foreground mb-1">{label}</dt>
        <dd className={`text-sm ${isEmpty ? 'text-muted-foreground/60 italic' : 'text-foreground'}`}>
          {formattedValue}
        </dd>
      </div>
    );
  };

  const renderSection = (section: SectionData, sectionId: string) => {
    const isExpanded = expandedSections.has(sectionId);

    return (
      <div key={sectionId} className="bg-card border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection(sectionId)}
          className="w-full px-6 py-4 flex items-center justify-between bg-muted/50 hover:bg-muted transition-colors"
        >
          <div className="flex items-center">
            {section.icon}
            <h3 className="text-section font-semibold text-foreground ml-3">{section.title}</h3>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
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
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-card rounded-lg shadow-xl p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading application details...</p>
        </div>
      </div>
    );
  }

  if (error || !applicationData) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-card rounded-lg shadow-xl max-w-md w-full p-6">
          <div className="flex items-center mb-4">
            <AlertCircle className="w-6 h-6 text-destructive mr-3" />
            <h3 className="text-section font-semibold text-foreground">Error Loading Application</h3>
          </div>
          <p className="text-muted-foreground mb-6">{error || 'Failed to load application details'}</p>
          <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
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
    icon: <User className="w-5 h-5 text-primary" />,
    fields: [
      ...getFilledFields([
        { label: 'Full Name', value: applicationData.full_name },
        { label: 'Email', value: applicationData.email },
        { label: 'Mobile Number', value: applicationData.mobile_number },
        { label: 'Gender', value: applicationData.gender },
        { label: 'Date of Birth', value: applicationData.date_of_birth, type: 'date' },
      ]),
      { label: 'Reference Name', value: applicationData.referred_by },
      ...getFilledFields([
        { label: 'Member ID', value: applicationData.member_id }
      ])
    ]
  };

  const companySection: SectionData = {
    title: 'Company Information',
    icon: <Building2 className="w-5 h-5 text-primary" />,
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
    icon: <MapPin className="w-5 h-5 text-primary" />,
    fields: getFilledFields([
      { label: 'State', value: applicationData.state },
      { label: 'District', value: applicationData.district },
      { label: 'City', value: applicationData.is_custom_city ? applicationData.other_city_name : applicationData.city },
      { label: 'PIN Code', value: applicationData.pin_code }
    ])
  };

  const businessSection: SectionData = {
    title: 'Business Details',
    icon: <Building2 className="w-5 h-5 text-primary" />,
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
    icon: <FileText className="w-5 h-5 text-primary" />,
    fields: getFilledFields([
      { label: 'GST Registered', value: applicationData.gst_registered },
      { label: 'GST Number', value: applicationData.gst_number },
      { label: 'ESIC Registered', value: applicationData.esic_registered },
      { label: 'EPF Registered', value: applicationData.epf_registered }
    ])
  };

  const paymentSection: SectionData = {
    title: 'Payment Information',
    icon: <CreditCard className="w-5 h-5 text-primary" />,
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
    icon: <User className="w-5 h-5 text-primary" />,
    fields: getFilledFields([
      { label: 'Alternate Contact Name', value: applicationData.alternate_contact_name },
      { label: 'Alternate Mobile', value: applicationData.alternate_mobile },
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-card rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto my-8">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-section font-semibold text-foreground">Application Review</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {applicationData.full_name} - {applicationData.company_name}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Status Badge */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Badge variant={applicationData.status === 'approved' ? 'success' : applicationData.status === 'rejected' ? 'destructive' : 'warning'}>
                Status: {applicationData.status || 'Pending'}
              </Badge>
              {applicationData.first_viewed_at && (
                <span className="inline-flex items-center text-sm text-muted-foreground">
                  <Eye className="w-4 h-4 mr-1" />
                  Viewed {applicationData.reviewed_count || 1} time(s)
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                disabled={isGeneratingPdf}
              >
                {isGeneratingPdf ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating...</>
                ) : (
                  <><Download className="w-4 h-4 mr-2" />Download PDF</>
                )}
              </Button>
              {!readOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(applicationData)}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit Application
                </Button>
              )}
            </div>
          </div>
          {pdfError && (
            <p className="mb-4 text-sm text-destructive">{pdfError}</p>
          )}

          {/* Documents Section */}
          {(applicationData.gst_certificate_url || applicationData.udyam_certificate_url || applicationData.payment_proof_url || applicationData.profile_photo_url) && (
            <div className="mb-6 bg-muted/50 border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-foreground mb-3">Uploaded Documents</h3>
              <div className="flex flex-wrap gap-3">
                {applicationData.profile_photo_url && (
                  <a
                    href={applicationData.profile_photo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors"
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
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-primary bg-primary/10 border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors"
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
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-primary bg-primary/10 border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors"
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
                    className="inline-flex items-center px-3 py-2 text-sm font-medium text-primary bg-primary/10 border border-primary/20 rounded-lg hover:bg-primary/20 transition-colors"
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
        {!readOnly && applicationData.status === 'pending' && (
          <div className="sticky bottom-0 bg-muted border-t px-6 py-4 flex gap-3 justify-end">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button variant="destructive" onClick={() => onReject(applicationId)}>
              <XCircle className="w-4 h-4 mr-2" />
              Reject
            </Button>
            <Button onClick={() => onApprove(applicationId)}>
              <CheckCircle className="w-4 h-4 mr-2" />
              Approve
            </Button>
          </div>
        )}

        {!readOnly && applicationData.status === 'rejected' && (
          <div className="sticky bottom-0 bg-muted border-t px-6 py-4 flex gap-3 justify-end">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => onApprove(applicationId)}>
              <CheckCircle className="w-4 h-4 mr-2" />
              Approve
            </Button>
          </div>
        )}

        {applicationData.status === 'approved' && (
          <div className="sticky bottom-0 bg-muted border-t px-6 py-4 flex gap-3 justify-end">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewApplicationModal;
