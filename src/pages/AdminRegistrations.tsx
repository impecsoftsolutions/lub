import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search, Filter, CheckCircle, XCircle, Clock, ExternalLink, AlertTriangle, CreditCard as Edit3, EyeOff, Eye, Trash2, History, Lock, MoreHorizontal, Download, MessageSquare, Copy, ShieldCheck } from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { PageHeader } from '../components/ui/PageHeader';
import { useHasPermission } from '../hooks/usePermissions';
import { supabase, memberRegistrationService, type ApprovedMemberExportRow } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { emailService, WelcomeEmailData } from '../lib/emailService';
import Toast from '../components/Toast';
// EditMemberModal import removed — admin editing now uses /admin/members/registrations/:id/edit route (CLAUDE-UNIFIED-EDIT-UI-001)
import AuditHistoryModal from '../components/AuditHistoryModal';
import ViewApplicationModal from '../components/ViewApplicationModal';
import VerifyDocumentModal from '../components/VerifyDocumentModal';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useAdmin } from '../contexts/useAdmin';
import { downloadSingleSheetXlsx } from '../lib/xlsxExport';
import { formatDateTimeValue } from '../lib/dateTimeManager';

interface MemberRegistration {
  id: string;
  full_name: string;
  email: string;
  mobile_number: string;
  gender?: string | null;
  company_name: string;
  company_designation_id: string;
  company_designations?: { designation_name: string } | null;
  district: string;
  state: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  gst_certificate_url?: string;
  udyam_certificate_url?: string;
  payment_proof_url?: string;
  products_services?: string;
  referred_by?: string;
  is_active?: boolean;
  rejection_reason?: string;
  member_id?: string;
  // Extended fields returned by the RPC and used for smart search
  company_address?: string | null;
  city?: string | null;
  other_city_name?: string | null;
  is_custom_city?: boolean | null;
  date_of_birth?: string | null;
  brand_names?: string | null;
  gst_number?: string | null;
  pan_company?: string | null;
  pin_code?: string | null;
  amount_paid?: string | null;
  payment_date?: string | null;
  payment_mode?: string | null;
  transaction_id?: string | null;
  bank_reference?: string | null;
  alternate_contact_name?: string | null;
  alternate_mobile?: string | null;
  website?: string | null;
}

interface RegistrationRpcRow extends Omit<MemberRegistration, 'company_designations'> {
  company_designation_name?: string | null;
}

type ExportColumnKey = keyof ApprovedMemberExportRow;
type OptionalExportColumnKey = 'mobile_number' | 'email' | 'member_id' | 'company_address' | 'gender';

const CORE_EXPORT_COLUMNS: Array<{ key: ExportColumnKey; header: string }> = [
  { key: 'company_name', header: 'Company Name' },
  { key: 'member_name', header: 'Member Name' },
  { key: 'city', header: 'City' },
  { key: 'district', header: 'District' },
];

const OPTIONAL_EXPORT_COLUMNS: Array<{ key: OptionalExportColumnKey; header: string }> = [
  { key: 'mobile_number', header: 'Mobile' },
  { key: 'email', header: 'Email' },
  { key: 'member_id', header: 'Membership ID' },
  { key: 'company_address', header: 'Address' },
  { key: 'gender', header: 'Gender' },
];

const DEFAULT_OPTIONAL_EXPORT_SELECTION: Record<OptionalExportColumnKey, boolean> = {
  mobile_number: false,
  email: false,
  member_id: false,
  company_address: false,
  gender: false,
};

const GOOGLE_CONTACT_HEADERS = [
  'First Name',
  'Middle Name',
  'Last Name',
  'Phonetic First Name',
  'Phonetic Middle Name',
  'Phonetic Last Name',
  'Name Prefix',
  'Name Suffix',
  'Nickname',
  'File As',
  'Organization Name',
  'Organization Title',
  'Organization Department',
  'Birthday',
  'Notes',
  'Photo',
  'Labels',
  'E-mail 1 - Label',
  'E-mail 1 - Value',
  'Phone 1 - Label',
  'Phone 1 - Value',
  'Address 1 - Label',
  'Address 1 - Formatted',
  'Address 1 - Street',
  'Address 1 - City',
  'Address 1 - PO Box',
  'Address 1 - Region',
  'Address 1 - Postal Code',
  'Address 1 - Country',
  'Address 1 - Extended Address',
] as const;

type GoogleContactHeader = typeof GOOGLE_CONTACT_HEADERS[number];
type GoogleContactRow = Record<GoogleContactHeader, string>;

interface GenerateWelcomeMessageResponse {
  success?: boolean;
  data?: {
    welcome_message?: string;
  };
  error?: string;
  error_code?: string;
}

const STATE_ABBREVIATIONS: Record<string, string> = {
  'andhra pradesh': 'AP',
  telangana: 'TG',
};

const cleanContactValue = (value?: string | null) => (value ?? '').trim();

const getStateShortCode = (state?: string | null) => {
  const cleanState = cleanContactValue(state);
  if (!cleanState) return '';

  const mapped = STATE_ABBREVIATIONS[cleanState.toLowerCase()];
  if (mapped) return mapped;

  return cleanState
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
};

const getContactCity = (registration: MemberRegistration) => {
  if (registration.is_custom_city) {
    return cleanContactValue(registration.other_city_name) || cleanContactValue(registration.city);
  }

  return cleanContactValue(registration.city) || cleanContactValue(registration.other_city_name);
};

const getGoogleContactName = (registration: MemberRegistration) => {
  const stateCode = getStateShortCode(registration.state);
  const district = cleanContactValue(registration.district);
  const fullName = cleanContactValue(registration.full_name);
  const locationPrefix = ['LUB', stateCode, district].filter(Boolean).join(' ');

  return [locationPrefix || 'LUB', fullName].filter(Boolean).join(' - ');
};

const formatGoogleContactBirthday = (value?: string | null) => {
  const cleanValue = cleanContactValue(value);
  if (!cleanValue) return '';

  return cleanValue.slice(0, 10);
};

const formatGoogleContactPhone = (value?: string | null) => {
  const cleanValue = cleanContactValue(value);
  if (!cleanValue) return '';

  const digits = cleanValue.replace(/\D/g, '');
  const localDigits = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;

  if (localDigits.length === 10) {
    return `+91 ${localDigits.slice(0, 5)} ${localDigits.slice(5)}`;
  }

  return cleanValue;
};

const formatGoogleContactAddressLine = (registration: MemberRegistration) => {
  const street = cleanContactValue(registration.company_address);
  const city = getContactCity(registration);
  const district = cleanContactValue(registration.district);
  const state = cleanContactValue(registration.state);
  const pinCode = cleanContactValue(registration.pin_code);
  const districtLine = district ? `${district} District` : '';
  const cityStatePin = [
    city,
    [state, pinCode].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
  const hasAddressData = Boolean(street || city || district || state || pinCode);

  return [street, districtLine, cityStatePin, hasAddressData ? 'IN' : '']
    .filter(Boolean)
    .join('\n');
};

const buildGoogleContactRow = (registration: MemberRegistration): GoogleContactRow => {
  const contactName = getGoogleContactName(registration);
  const state = cleanContactValue(registration.state);
  const city = getContactCity(registration);
  const district = cleanContactValue(registration.district);
  const companyAddress = cleanContactValue(registration.company_address);
  const pinCode = cleanContactValue(registration.pin_code);
  const hasAddressData = Boolean(companyAddress || city || district || state || pinCode);
  const notes = [
    cleanContactValue(registration.referred_by) ? `Referred by: ${cleanContactValue(registration.referred_by)}` : '',
    cleanContactValue(registration.products_services) ? `Products: ${cleanContactValue(registration.products_services)}` : '',
  ].filter(Boolean).join('\n');

  return {
    'First Name': contactName,
    'Middle Name': '',
    'Last Name': '',
    'Phonetic First Name': '',
    'Phonetic Middle Name': '',
    'Phonetic Last Name': '',
    'Name Prefix': '',
    'Name Suffix': '',
    Nickname: '',
    'File As': contactName,
    'Organization Name': cleanContactValue(registration.company_name),
    'Organization Title': cleanContactValue(registration.company_designations?.designation_name),
    'Organization Department': '',
    Birthday: formatGoogleContactBirthday(registration.date_of_birth),
    Notes: notes,
    Photo: '',
    Labels: `${state ? `LUB ${state}` : 'LUB'} ::: LUB ::: * myContacts`,
    'E-mail 1 - Label': cleanContactValue(registration.email) ? '* ' : '',
    'E-mail 1 - Value': cleanContactValue(registration.email),
    'Phone 1 - Label': '',
    'Phone 1 - Value': formatGoogleContactPhone(registration.mobile_number),
    'Address 1 - Label': '',
    'Address 1 - Formatted': formatGoogleContactAddressLine(registration),
    'Address 1 - Street': companyAddress,
    'Address 1 - City': city,
    'Address 1 - PO Box': '',
    'Address 1 - Region': state,
    'Address 1 - Postal Code': pinCode,
    'Address 1 - Country': hasAddressData ? 'IN' : '',
    'Address 1 - Extended Address': district ? `${district} District` : '',
  };
};

const escapeCsvValue = (value: string) => {
  const normalizedValue = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (/[",\n]/.test(normalizedValue)) {
    return `"${normalizedValue.replace(/"/g, '""')}"`;
  }

  return normalizedValue;
};

const serializeGoogleContactsCsv = (rows: GoogleContactRow[]) => {
  const headerRow = GOOGLE_CONTACT_HEADERS.map(escapeCsvValue).join(',');
  const dataRows = rows.map((row) =>
    GOOGLE_CONTACT_HEADERS.map((header) => escapeCsvValue(row[header])).join(',')
  );

  return [headerRow, ...dataRows].join('\r\n');
};

const downloadTextFile = (fileName: string, contents: string, mimeType: string) => {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const getSafeContactFileName = (registration: MemberRegistration) => {
  const baseName = getGoogleContactName(registration)
    .split('')
    .filter((character) => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);

  return `${baseName || 'LUB Google Contact'}.csv`;
};

const AdminRegistrations: React.FC = () => {
  const [registrations, setRegistrations] = useState<MemberRegistration[]>([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState<MemberRegistration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedOptionalExportColumns, setSelectedOptionalExportColumns] = useState<Record<OptionalExportColumnKey, boolean>>(
    DEFAULT_OPTIONAL_EXPORT_SELECTION
  );
  const [welcomeDialog, setWelcomeDialog] = useState<{
    isOpen: boolean;
    registration: MemberRegistration | null;
  }>({
    isOpen: false,
    registration: null,
  });
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [welcomeError, setWelcomeError] = useState('');
  const [isWelcomeGenerating, setIsWelcomeGenerating] = useState(false);
  const [isWelcomeCopied, setIsWelcomeCopied] = useState(false);
  const [verifyRegistration, setVerifyRegistration] = useState<MemberRegistration | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    registrationId: string;
    action: 'approved' | 'rejected';
    memberName: string;
  }>({
    isOpen: false,
    registrationId: '',
    action: 'approved',
    memberName: ''
  });
  const [rejectionReason, setRejectionReason] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyMemberId, setHistoryMemberId] = useState<string>('');
  const [historyMemberName, setHistoryMemberName] = useState<string>('');
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingApplicationId, setViewingApplicationId] = useState<string>('');
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    memberId: string;
    memberName: string;
  }>({
    isOpen: false,
    memberId: '',
    memberName: ''
  });
  const [deletionReason, setDeletionReason] = useState('');
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({
    type: 'success',
    message: '',
    isVisible: false
  });

  // Permission checks
  const canViewMembers = useHasPermission('members.view');
  const canApprove = useHasPermission('members.approve');
  const canEdit = useHasPermission('members.edit');
  const canDelete = useHasPermission('members.delete');
  const { refreshCounts } = useAdmin();
  const navigate = useNavigate();


  const loadRegistrations = useCallback(async () => {
    try {
      setIsLoading(true);

      const sessionToken = sessionManager.getSessionToken();

      if (!sessionToken) {
        console.error('[AdminRegistrations] Session token not found');
        showToast('error', 'User session not found. Please log in again.');
        setIsLoading(false);
        return;
      }

      console.log('[AdminRegistrations] Fetching registrations with session token');

      // Call RPC function instead of direct query
      const { data, error } = await supabase.rpc('get_admin_member_registrations_with_session', {
        p_session_token: sessionToken,
        p_status_filter: null, // Get all statuses
        p_search_query: null,  // No search filter at load time
        p_state_filter: null,  // Get all states
        p_limit: 1000,         // Get all records (increase if you have more)
        p_offset: 0
      });

      if (error) {
        console.error('[AdminRegistrations] RPC error:', error);
        throw error;
      }

      console.log('[AdminRegistrations] Fetched registrations:', data?.length || 0);

      // Transform data to match expected structure (RPC returns flat data with company_designation_name)
      const transformedData = ((data || []) as RegistrationRpcRow[]).map((reg) => ({
        ...reg,
        company_designations: reg.company_designation_name
          ? { designation_name: reg.company_designation_name }
          : null
      }));

      setRegistrations(transformedData);
      refreshCounts();
    } catch (error) {
      console.error('[AdminRegistrations] Error loading registrations:', error);
      showToast('error', 'Failed to load registrations');
    } finally {
      setIsLoading(false);
    }
  }, [refreshCounts]);

  const filterRegistrations = useCallback(() => {
    let filtered = registrations;

    // Status filter is always applied immediately (no debounce)
    if (statusFilter !== 'all') {
      filtered = filtered.filter(reg => reg.status === statusFilter);
    }

    // Smart AND-token search across all available fields.
    // Each whitespace-separated token must appear somewhere in the combined
    // search blob — matches name, email, mobile, company, address, city,
    // district, state, products/services, member ID, GST, PAN, referrer, etc.
    if (debouncedSearchTerm.trim()) {
      const tokens = debouncedSearchTerm.trim().toLowerCase().split(/\s+/).filter(Boolean);
      filtered = filtered.filter(reg => {
        const blob = [
          reg.full_name,
          reg.email,
          reg.mobile_number,
          reg.company_name,
          reg.member_id,
          reg.district,
          reg.state,
          reg.pin_code,
          reg.products_services,
          reg.referred_by,
          reg.company_address,
          reg.city,
          reg.brand_names,
          reg.gst_number,
          reg.pan_company,
          reg.alternate_contact_name,
          reg.alternate_mobile,
          reg.website,
          reg.company_designations?.designation_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return tokens.every(tok => blob.includes(tok));
      });
    }

    setFilteredRegistrations(filtered);
  }, [registrations, debouncedSearchTerm, statusFilter]);

  useEffect(() => {
    void loadRegistrations();
  }, [loadRegistrations]);

  useEffect(() => {
    filterRegistrations();
  }, [filterRegistrations]);

  // Clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

  const handleStatusUpdate = async (registrationId: string, newStatus: 'approved' | 'rejected') => {
    try {
      setActionLoading(registrationId);

      if (newStatus === 'rejected' && !rejectionReason.trim()) {
        showToast('error', 'Please provide a reason for rejection');
        setActionLoading(null);
        return;
      }

      const sessionToken = sessionManager.getSessionToken();

      if (!sessionToken) {
        console.error('[handleStatusUpdate] Session token not found');
        showToast('error', 'User session not found. Please log in again.');
        setActionLoading(null);
        return;
      }

      console.log('[handleStatusUpdate] Session token present:', !!sessionToken);
      console.log('[handleStatusUpdate] Fetching registration data via RPC');

      // Fetch registration data using RPC to bypass RLS
      const registrationResult = await memberRegistrationService.getApplicationDetails(registrationId, sessionToken);

      if (!registrationResult.success || !registrationResult.data) {
        throw new Error(registrationResult.error || 'Failed to fetch registration');
      }

      const registrationData = registrationResult.data;

      console.log('[handleStatusUpdate] Updating status via RPC');

      // Update status using RPC (this also handles account_type update for approved registrations)
      const result = await memberRegistrationService.updateStatusWithReason(
        registrationId,
        newStatus,
        sessionToken,
        newStatus === 'rejected' ? rejectionReason : undefined
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to update status');
      }

      console.log('[handleStatusUpdate] Status updated successfully, updating local state');

      // Update local state with the returned data
      setRegistrations(prev =>
        prev.map(reg =>
          reg.id === registrationId
            ? { ...reg, status: newStatus, rejection_reason: newStatus === 'rejected' ? rejectionReason : undefined }
            : reg
        )
      );
      refreshCounts();

      // Send welcome email if approved
      if (newStatus === 'approved' && registrationData) {
        console.log('[handleStatusUpdate] Sending welcome email');
        try {
          const emailData: WelcomeEmailData = {
            full_name: registrationData.full_name,
            email: registrationData.email,
            mobile_number: registrationData.mobile_number,
            state: registrationData.state,
            referred_by: registrationData.referred_by || undefined
          };

          const emailResult = await emailService.sendWelcomeEmail(emailData);

          if (!emailResult.success) {
            showToast('success', `Registration approved successfully. Note: Welcome email could not be sent.`);
          } else {
            showToast('success', `Registration approved and welcome email sent successfully!`);
          }
        } catch (emailError) {
          console.error('[handleStatusUpdate] Error sending welcome email:', emailError);
          showToast('success', `Registration approved successfully. Note: Welcome email could not be sent.`);
        }
      } else {
        showToast('success', `Registration ${newStatus} successfully`);
      }
    } catch (error) {
      console.error('[handleStatusUpdate] Error updating status:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showToast('error', `Failed to ${newStatus === 'approved' ? 'approve' : 'reject'} registration: ${errorMessage}`);
    } finally {
      setActionLoading(null);
      setConfirmDialog({ isOpen: false, registrationId: '', action: 'approved', memberName: '' });
      setRejectionReason('');
    }
  };

  const handleToggleActive = async (memberId: string, currentActive: boolean) => {
    try {
      const result = await memberRegistrationService.toggleMemberActive(memberId, !currentActive);

      if (result.success) {
        setRegistrations(prev =>
          prev.map(reg =>
            reg.id === memberId
              ? { ...reg, is_active: !currentActive }
              : reg
          )
        );
        showToast('success', `Member ${!currentActive ? 'activated' : 'deactivated'} successfully`);
      } else {
        showToast('error', result.error || 'Failed to update member status');
      }
    } catch (error) {
      console.error('Error toggling member active status:', error);
      showToast('error', 'An unexpected error occurred');
    }
  };

  const handleExportApprovedMembers = async () => {
    try {
      setIsExporting(true);
      const result = await memberRegistrationService.getApprovedMembersExport();

      if (!result.success || !result.data) {
        showToast('error', result.error || 'Failed to export approved members');
        return;
      }

      if (result.data.length === 0) {
        showToast('error', 'No approved members available to export');
        return;
      }

      const selectedColumns = [
        ...CORE_EXPORT_COLUMNS,
        ...OPTIONAL_EXPORT_COLUMNS.filter((column) => selectedOptionalExportColumns[column.key]),
      ];

      await downloadSingleSheetXlsx({
        fileName: `LUB_Members_${new Date().toISOString().slice(0, 10)}.xlsx`,
        sheetName: 'Members',
        columns: selectedColumns,
        rows: result.data,
      });

      showToast('success', `Approved members exported successfully (${result.data.length} rows)`);
      setIsExportDialogOpen(false);
    } catch (error) {
      console.error('[AdminRegistrations] Error exporting approved members:', error);
      showToast('error', 'Failed to export approved members');
    } finally {
      setIsExporting(false);
    }
  };

  const openExportDialog = () => {
    setSelectedOptionalExportColumns(DEFAULT_OPTIONAL_EXPORT_SELECTION);
    setIsExportDialogOpen(true);
  };

  const handleExportColumnToggle = (key: OptionalExportColumnKey) => {
    setSelectedOptionalExportColumns((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const handleDownloadGoogleContact = (registration: MemberRegistration) => {
    try {
      const csv = serializeGoogleContactsCsv([buildGoogleContactRow(registration)]);
      downloadTextFile(
        getSafeContactFileName(registration),
        csv,
        'text/csv;charset=utf-8'
      );
      showToast('success', 'Google contact CSV downloaded');
    } catch (error) {
      console.error('[AdminRegistrations] Error downloading Google contact CSV:', error);
      showToast('error', 'Failed to download Google contact CSV');
    }
  };

  const handleGenerateWelcomeMessage = async (registration: MemberRegistration) => {
    setWelcomeDialog({ isOpen: true, registration });
    setWelcomeMessage('');
    setWelcomeError('');
    setIsWelcomeCopied(false);
    setIsWelcomeGenerating(true);

    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        setWelcomeError('User session not found. Please log in again.');
        return;
      }

      const { data, error } = await supabase.functions.invoke<GenerateWelcomeMessageResponse>(
        'generate-member-welcome-message',
        {
          body: {
            session_token: sessionToken,
            member: {
              full_name: registration.full_name,
              gender: registration.gender,
              mobile_number: registration.mobile_number,
              company_name: registration.company_name,
              company_designation: registration.company_designations?.designation_name,
              district: registration.district,
              state: registration.state,
              products_services: registration.products_services,
              brand_names: registration.brand_names,
              referred_by: registration.referred_by,
              website: registration.website,
            },
          },
        }
      );

      if (error) {
        throw new Error(error.message);
      }
      if (!data?.success || !data.data?.welcome_message) {
        throw new Error(data?.error || 'Failed to generate welcome message');
      }

      setWelcomeMessage(data.data.welcome_message);
    } catch (error) {
      console.error('[AdminRegistrations] Error generating welcome message:', error);
      setWelcomeError(error instanceof Error ? error.message : 'Failed to generate welcome message');
    } finally {
      setIsWelcomeGenerating(false);
    }
  };

  const handleCopyWelcomeMessage = async () => {
    if (!welcomeMessage.trim()) return;

    try {
      await navigator.clipboard.writeText(welcomeMessage);
      setIsWelcomeCopied(true);
      showToast('success', 'Welcome message copied');
      window.setTimeout(() => setIsWelcomeCopied(false), 2000);
    } catch (error) {
      console.error('[AdminRegistrations] Error copying welcome message:', error);
      showToast('error', 'Failed to copy welcome message');
    }
  };

  const handleEditMember = (member: MemberRegistration) => {
    navigate(`/admin/members/registrations/${member.id}/edit`);
  };

  const handleViewHistory = (memberId: string, memberName: string) => {
    setHistoryMemberId(memberId);
    setHistoryMemberName(memberName);
    setShowHistoryModal(true);
  };

  const handleViewApplication = (applicationId: string) => {
    setViewingApplicationId(applicationId);
    setShowViewModal(true);
  };

  const handleEditFromView = (applicationData: MemberRegistration) => {
    setShowViewModal(false);
    navigate(`/admin/members/registrations/${applicationData.id}/edit`);
  };

  const handleApproveFromView = (applicationId: string) => {
    setShowViewModal(false);
    const registration = registrations.find(reg => reg.id === applicationId);
    if (registration) {
      openConfirmDialog(applicationId, 'approved', registration.full_name);
    }
  };

  const handleRejectFromView = (applicationId: string) => {
    setShowViewModal(false);
    const registration = registrations.find(reg => reg.id === applicationId);
    if (registration) {
      openConfirmDialog(applicationId, 'rejected', registration.full_name);
    }
  };

  const handleDeleteMember = async () => {
    if (!deletionReason.trim()) {
      showToast('error', 'Please provide a reason for deletion');
      return;
    }

    try {
      const sessionToken = sessionManager.getSessionToken();

      if (!sessionToken) {
        showToast('error', 'User session not found. Please log in again.');
        return;
      }

      const result = await memberRegistrationService.softDeleteMember(
        deleteDialog.memberId,
        deletionReason,
        sessionToken
      );

      if (result.success) {
        setRegistrations(prev => prev.filter(reg => reg.id !== deleteDialog.memberId));
        refreshCounts();
        showToast('success', 'Member deleted successfully');
        setDeleteDialog({ isOpen: false, memberId: '', memberName: '' });
        setDeletionReason('');
      } else {
        showToast('error', result.error || 'Failed to delete member');
      }
    } catch (error) {
      console.error('Error deleting member:', error);
      showToast('error', 'An unexpected error occurred');
    }
  };

  const openConfirmDialog = (registrationId: string, action: 'approved' | 'rejected', memberName: string) => {
    setConfirmDialog({
      isOpen: true,
      registrationId,
      action,
      memberName
    });
  };

  const openDeleteDialog = (memberId: string, memberName: string) => {
    setDeleteDialog({
      isOpen: true,
      memberId,
      memberName
    });
    setDeletionReason('');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge variant="success">
            <CheckCircle className="w-3 h-3" />
            Approved
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3" />
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge variant="warning">
            <Clock className="w-3 h-3" />
            Pending
          </Badge>
        );
    }
  };

  const formatDate = (dateString: string) => {
    return formatDateTimeValue(dateString);
  };

  return (
    <PermissionGate
      permission="members.view"
      fallback={
        <div className="text-center py-16">
          <Lock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-1">Access Denied</h2>
          <p className="text-sm text-muted-foreground">You don't have permission to view member registrations.</p>
        </div>
      }
    >
    <div>
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <PageHeader
        title="Member Registrations"
        subtitle="Manage and review membership applications"
        actions={
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{registrations.length} total</span>
            {canViewMembers && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openExportDialog}
                disabled={isExporting}
                className="gap-1.5"
              >
                {isExporting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Export Members
              </Button>
            )}
          </div>
        }
      />

      {/* Filter bar */}
      <div className="bg-card rounded-lg border shadow-sm p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name, email, mobile, company, address, products…"
              value={searchTerm}
              onChange={(e) => {
                const value = e.target.value;
                setSearchTerm(value);
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                searchTimerRef.current = setTimeout(() => setDebouncedSearchTerm(value), 300);
              }}
              className="pl-9"
            />
          </div>
          <div className="sm:w-44 relative">
            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-input rounded-md text-sm bg-transparent focus:ring-1 focus:ring-ring appearance-none"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2.5">
          Showing {filteredRegistrations.length} of {registrations.length} registrations
        </p>
      </div>

      {/* Registrations Table */}
      {isLoading ? (
        <div className="bg-card rounded-lg border border-border shadow-sm p-12 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading registrations...</p>
        </div>
      ) : filteredRegistrations.length === 0 ? (
        <div className="bg-card rounded-lg border border-border shadow-sm p-12 text-center">
          <Users className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-foreground mb-1">No registrations found</h3>
          <p className="text-sm text-muted-foreground">
            {debouncedSearchTerm || statusFilter !== 'all'
              ? 'Try adjusting your search or filter criteria'
              : 'No member registrations have been submitted yet'}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left text-label text-muted-foreground uppercase tracking-wider">Member</th>
                  <th className="text-left text-label text-muted-foreground uppercase tracking-wider">Company</th>
                  <th className="text-left text-label text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left text-label text-muted-foreground uppercase tracking-wider">Docs</th>
                  <th className="text-right text-label text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
              {filteredRegistrations.map((registration) => (
                <React.Fragment key={registration.id}>
                  <tr className="hover:bg-muted/50">
                    {/* Member */}
                    <td className="align-top">
                      <div className="space-y-0.5">
                        {canViewMembers ? (
                          <button
                            type="button"
                            onClick={() => handleViewApplication(registration.id)}
                            className={cn(
                              'leading-tight text-left text-foreground hover:text-primary hover:underline underline-offset-2 transition-colors',
                              registration.status === 'pending' ? 'font-semibold' : 'font-normal'
                            )}
                          >
                            {registration.full_name}
                          </button>
                        ) : (
                          <p className={cn('leading-tight text-foreground', registration.status === 'pending' ? 'font-semibold' : 'font-normal')}>
                            {registration.full_name}
                          </p>
                        )}
                        <p className="text-muted-foreground leading-tight">{registration.email}</p>
                        <p className="text-muted-foreground leading-tight">{registration.mobile_number}</p>
                        {registration.member_id && (
                          <p className="text-primary mt-1">ID: {registration.member_id}</p>
                        )}
                      </div>
                    </td>
                    {/* Company */}
                    <td className="align-top">
                      <p className="leading-tight text-foreground">{registration.company_name}</p>
                      <p className="text-muted-foreground mt-0.5 leading-tight">
                        {registration.company_designations?.designation_name || '—'} · {registration.district}
                      </p>
                    </td>
                    {/* Status */}
                    <td className="align-top">
                      <div className="flex items-center gap-1.5">
                        {getStatusBadge(registration.status)}
                        {registration.is_active === false && registration.status === 'approved' && (
                          <Badge variant="warning">
                            <EyeOff className="w-3 h-3" />Hidden
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-1">{formatDate(registration.created_at)}</p>
                    </td>
                    {/* Documents */}
                    <td className="align-top">
                      <div className="flex gap-1 flex-wrap">
                        {registration.gst_certificate_url && (
                          <a href={registration.gst_certificate_url} target="_blank" rel="noopener noreferrer">
                            <Badge variant="info" className="cursor-pointer">
                              GST <ExternalLink className="w-3 h-3" />
                            </Badge>
                          </a>
                        )}
                        {registration.udyam_certificate_url && (
                          <a href={registration.udyam_certificate_url} target="_blank" rel="noopener noreferrer">
                            <Badge variant="secondary" className="cursor-pointer">
                              UDYAM <ExternalLink className="w-3 h-3" />
                            </Badge>
                          </a>
                        )}
                        {registration.payment_proof_url && (
                          <a href={registration.payment_proof_url} target="_blank" rel="noopener noreferrer">
                            <Badge variant="success" className="cursor-pointer">
                              Pay <ExternalLink className="w-3 h-3" />
                            </Badge>
                          </a>
                        )}
                        {!registration.gst_certificate_url && !registration.udyam_certificate_url && !registration.payment_proof_url && (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                    </td>
                    {/* Actions */}
                    <td className="align-top">
                      <div className="flex items-center justify-end gap-1">
                        {registration.status === 'pending' && canApprove && (
                          <Button
                            size="sm"
                            onClick={() => openConfirmDialog(registration.id, 'approved', registration.full_name)}
                            disabled={actionLoading === registration.id}
                            className="h-7 px-2 gap-1"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />Approve
                          </Button>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'h-7 w-7')}
                          >
                            <span className="sr-only">Open actions menu</span>
                            <span aria-hidden="true">
                              <MoreHorizontal className="w-4 h-4" />
                            </span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleDownloadGoogleContact(registration)}>
                              <Download className="w-4 h-4" />Download Google Contact
                            </DropdownMenuItem>
                            {canViewMembers && (
                              <DropdownMenuItem onClick={() => void handleGenerateWelcomeMessage(registration)}>
                                <MessageSquare className="w-4 h-4" />Generate Welcome Message
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setVerifyRegistration(registration)}>
                              <ShieldCheck className="w-4 h-4" />Verify
                            </DropdownMenuItem>
                            {canEdit && (
                              <DropdownMenuItem onClick={() => handleEditMember(registration)}>
                                <Edit3 className="w-4 h-4" />Edit
                              </DropdownMenuItem>
                            )}
                            {registration.status === 'approved' && canApprove && (
                              <DropdownMenuItem onClick={() => handleToggleActive(registration.id, registration.is_active ?? true)}>
                                {registration.is_active !== false ? (
                                  <><EyeOff className="w-4 h-4" />Hide from Directory</>
                                ) : (
                                  <><Eye className="w-4 h-4" />Show in Directory</>
                                )}
                              </DropdownMenuItem>
                            )}
                            {canViewMembers && (
                              <DropdownMenuItem onClick={() => handleViewHistory(registration.id, registration.full_name)}>
                                <History className="w-4 h-4" />Audit History
                              </DropdownMenuItem>
                            )}
                            {registration.status === 'pending' && canApprove && (
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => openConfirmDialog(registration.id, 'rejected', registration.full_name)}
                              >
                                <XCircle className="w-4 h-4" />Reject
                              </DropdownMenuItem>
                            )}
                            {canDelete && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => openDeleteDialog(registration.id, registration.full_name)}
                                >
                                  <Trash2 className="w-4 h-4" />Delete
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {actionLoading === registration.id && (
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-primary" />
                        )}
                      </div>
                    </td>
                  </tr>
                  {registration.rejection_reason && registration.status === 'rejected' && (
                    <tr className="bg-destructive/5">
                      <td colSpan={5}>
                        <p className="text-destructive">
                          <span>Rejection reason:</span> {registration.rejection_reason}
                        </p>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog
        open={isExportDialogOpen}
        onOpenChange={(open) => {
          if (!isExporting) {
            setIsExportDialogOpen(open);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Approved Members</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This export always includes approved members only. Current page filters do not affect the downloaded file.
            </p>

            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">Core Columns</h3>
                <span className="text-xs text-muted-foreground">Always included</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {CORE_EXPORT_COLUMNS.map((column) => (
                  <label
                    key={column.key}
                    className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <input type="checkbox" checked readOnly className="h-4 w-4 accent-primary" />
                    <span>{column.header}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-foreground">Optional Columns</h3>
                <span className="text-xs text-muted-foreground">Unchecked by default</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {OPTIONAL_EXPORT_COLUMNS.map((column) => (
                  <label
                    key={column.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={selectedOptionalExportColumns[column.key]}
                      onChange={() => handleExportColumnToggle(column.key)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span>{column.header}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsExportDialogOpen(false)}
              disabled={isExporting}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleExportApprovedMembers()}
              disabled={isExporting}
              className="gap-1.5"
            >
              {isExporting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download XLSX
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Welcome Message Dialog */}
      <Dialog
        open={welcomeDialog.isOpen}
        onOpenChange={(open) => {
          if (!open && !isWelcomeGenerating) {
            setWelcomeDialog({ isOpen: false, registration: null });
            setWelcomeMessage('');
            setWelcomeError('');
            setIsWelcomeCopied(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Generate Welcome Message
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {welcomeDialog.registration && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-sm font-medium text-foreground">{welcomeDialog.registration.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  {welcomeDialog.registration.company_name}
                  {welcomeDialog.registration.district ? ` · ${welcomeDialog.registration.district}` : ''}
                </p>
              </div>
            )}

            {isWelcomeGenerating && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-primary" />
                  Generating welcome message...
                </div>
              </div>
            )}

            {welcomeError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {welcomeError}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-foreground">WhatsApp message</label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void handleCopyWelcomeMessage()}
                  disabled={isWelcomeGenerating || !welcomeMessage.trim()}
                  aria-label="Copy welcome message"
                  title="Copy welcome message"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Textarea
                value={welcomeMessage}
                onChange={(e) => {
                  setWelcomeMessage(e.target.value);
                  setIsWelcomeCopied(false);
                }}
                placeholder={isWelcomeGenerating ? 'AI is generating the message...' : 'Generated welcome message will appear here.'}
                rows={15}
                className="resize-y text-sm leading-relaxed"
                disabled={isWelcomeGenerating}
              />
              <p className="text-xs text-muted-foreground">
                Review and edit the text if needed before copying it to WhatsApp.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setWelcomeDialog({ isOpen: false, registration: null });
                setWelcomeMessage('');
                setWelcomeError('');
                setIsWelcomeCopied(false);
              }}
              disabled={isWelcomeGenerating}
            >
              Close
            </Button>
            <Button
              onClick={() => void handleCopyWelcomeMessage()}
              disabled={isWelcomeGenerating || !welcomeMessage.trim()}
              className="gap-1.5"
            >
              <Copy className="h-4 w-4" />
              {isWelcomeCopied ? 'Copied' : 'Copy Message'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialog({ isOpen: false, registrationId: '', action: 'approved', memberName: '' });
            setRejectionReason('');
          }
        }}
      >
        <DialogContent showCloseIcon={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-primary" />
              Confirm {confirmDialog.action === 'approved' ? 'Approval' : 'Rejection'}
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Are you sure you want to {confirmDialog.action === 'approved' ? 'approve' : 'reject'} the registration for{' '}
            <span className="font-semibold text-foreground">{confirmDialog.memberName}</span>?
          </p>

          {confirmDialog.action === 'rejected' && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Rejection Reason <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Please provide a reason for rejecting this registration..."
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">{rejectionReason.length} characters</p>
            </div>
          )}

          {actionLoading === confirmDialog.registrationId && (
            <div className="p-3 bg-primary/5 rounded-lg flex items-center text-sm text-primary">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
              Processing your request...
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDialog({ isOpen: false, registrationId: '', action: 'approved', memberName: '' });
                setRejectionReason('');
              }}
              disabled={actionLoading === confirmDialog.registrationId}
            >
              Cancel
            </Button>
            <Button
              variant={confirmDialog.action === 'approved' ? 'default' : 'destructive'}
              onClick={() => handleStatusUpdate(confirmDialog.registrationId, confirmDialog.action)}
              disabled={actionLoading === confirmDialog.registrationId}
            >
              {actionLoading === confirmDialog.registrationId && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-1" />
              )}
              {actionLoading === confirmDialog.registrationId ? 'Processing...' :
                confirmDialog.action === 'approved' ? 'Approve' : 'Reject'
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDialog({ isOpen: false, memberId: '', memberName: '' });
            setDeletionReason('');
          }
        }}
      >
        <DialogContent showCloseIcon={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Confirm Deletion
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <span className="font-semibold text-foreground">{deleteDialog.memberName}</span>?
            This member will be moved to the deleted members archive.
          </p>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              Deletion Reason <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={deletionReason}
              onChange={(e) => setDeletionReason(e.target.value)}
              placeholder="Please provide a reason for deleting this member..."
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">{deletionReason.length} characters</p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialog({ isOpen: false, memberId: '', memberName: '' });
                setDeletionReason('');
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteMember}>
              Delete Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Member: navigates to /admin/members/registrations/:registrationId/edit */}

      {/* Audit History Modal */}
      {showHistoryModal && (
        <AuditHistoryModal
          memberId={historyMemberId}
          memberName={historyMemberName}
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
        />
      )}

      {/* View Application Modal */}
      {showViewModal && viewingApplicationId && (
        <ViewApplicationModal
          applicationId={viewingApplicationId}
          isOpen={showViewModal}
          onClose={() => {
            setShowViewModal(false);
            setViewingApplicationId('');
            loadRegistrations();
          }}
          onEdit={handleEditFromView}
          onApprove={handleApproveFromView}
          onReject={handleRejectFromView}
        />
      )}

      <VerifyDocumentModal
        registration={verifyRegistration}
        isOpen={Boolean(verifyRegistration)}
        onClose={() => setVerifyRegistration(null)}
      />

    </div>
    </PermissionGate>
  );
};

export default AdminRegistrations;
