import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search, Filter, CheckCircle, XCircle, Clock, ExternalLink, AlertTriangle, CreditCard as Edit3, EyeOff, Eye, Trash2, History, Lock, MoreHorizontal, Download } from 'lucide-react';
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

const AdminRegistrations: React.FC = () => {
  const [registrations, setRegistrations] = useState<MemberRegistration[]>([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState<MemberRegistration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedOptionalExportColumns, setSelectedOptionalExportColumns] = useState<Record<OptionalExportColumnKey, boolean>>(
    DEFAULT_OPTIONAL_EXPORT_SELECTION
  );
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

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(reg => reg.status === statusFilter);
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(reg =>
        reg.full_name.toLowerCase().includes(term) ||
        reg.email.toLowerCase().includes(term) ||
        reg.mobile_number.includes(term) ||
        (reg.member_id && reg.member_id.toLowerCase().includes(term))
      );
    }

    setFilteredRegistrations(filtered);
  }, [registrations, searchTerm, statusFilter]);

  useEffect(() => {
    void loadRegistrations();
  }, [loadRegistrations]);

  useEffect(() => {
    filterRegistrations();
  }, [filterRegistrations]);

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
        <div className="p-6 text-center py-16">
          <Lock className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-1">Access Denied</h2>
          <p className="text-sm text-muted-foreground">You don't have permission to view member registrations.</p>
        </div>
      }
    >
    <div className="p-6">
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
              placeholder="Search by name, email, or mobile number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
            {searchTerm || statusFilter !== 'all'
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
                            {canEdit && (
                              <DropdownMenuItem onClick={() => handleEditMember(registration)}>
                                <Edit3 className="w-4 h-4" />Edit
                              </DropdownMenuItem>
                            )}
                            {canViewMembers && (
                              <DropdownMenuItem onClick={() => handleViewHistory(registration.id, registration.full_name)}>
                                <History className="w-4 h-4" />Audit History
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

    </div>
    </PermissionGate>
  );
};

export default AdminRegistrations;
