import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Users, Search, Filter, CheckCircle, XCircle, Clock, ExternalLink, AlertTriangle, CreditCard as Edit3, EyeOff, Eye, Trash2, History, Eye as ViewIcon, Lock, MoreHorizontal } from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { PageHeader } from '../components/ui/PageHeader';
import { useHasPermission } from '../hooks/usePermissions';
import { supabase, memberRegistrationService } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { emailService, WelcomeEmailData } from '../lib/emailService';
import Toast from '../components/Toast';
import EditMemberModal from '../components/EditMemberModal';
import AuditHistoryModal from '../components/AuditHistoryModal';
import ViewApplicationModal from '../components/ViewApplicationModal';

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

const AdminRegistrations: React.FC = () => {
  const [registrations, setRegistrations] = useState<MemberRegistration[]>([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState<MemberRegistration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
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
  const [editingMember, setEditingMember] = useState<MemberRegistration | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
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

  // Close dropdown on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenuId]);

  const handleMenuToggle = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setOpenMenuId(prev => (prev === id ? null : id));
  };

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
    } catch (error) {
      console.error('[AdminRegistrations] Error loading registrations:', error);
      showToast('error', 'Failed to load registrations');
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  const handleEditMember = (member: MemberRegistration) => {
    setEditingMember(member);
    setShowEditModal(true);
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
    setEditingMember(applicationData);
    setShowEditModal(true);
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

  const getStatusBadge = (status: string) => {
    const baseClasses = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
    
    switch (status) {
      case 'approved':
        return (
          <span className={`${baseClasses} bg-green-100 text-green-800`}>
            <CheckCircle className="w-3 h-3 mr-1" />
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className={`${baseClasses} bg-red-100 text-red-800`}>
            <XCircle className="w-3 h-3 mr-1" />
            Rejected
          </span>
        );
      default:
        return (
          <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </span>
        );
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <PermissionGate
      permission="members.view"
      fallback={
        <div className="p-6 text-center py-16">
          <Lock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Access Denied</h2>
          <p className="text-sm text-gray-500">You don't have permission to view member registrations.</p>
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
        actions={<span className="text-sm text-gray-500">{registrations.length} total</span>}
      />

      {/* Filter bar */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or mobile number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-400"
            />
          </div>
          <div className="sm:w-44 relative">
            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2.5">
          Showing {filteredRegistrations.length} of {registrations.length} registrations
        </p>
      </div>

      {/* Registrations Table */}
      {isLoading ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-sm text-gray-500">Loading registrations...</p>
        </div>
      ) : filteredRegistrations.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-sm font-medium text-gray-900 mb-1">No registrations found</h3>
          <p className="text-sm text-gray-500">
            {searchTerm || statusFilter !== 'all'
              ? 'Try adjusting your search or filter criteria'
              : 'No member registrations have been submitted yet'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Member</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Docs</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRegistrations.map((registration) => (
                  <React.Fragment key={registration.id}>
                    <tr className="hover:bg-gray-50 transition-colors group">
                      {/* Member */}
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 leading-tight">{registration.full_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{registration.email}</p>
                        <p className="text-xs text-gray-400">{registration.mobile_number}</p>
                        {registration.member_id && (
                          <p className="text-xs font-medium text-blue-600 mt-0.5">ID: {registration.member_id}</p>
                        )}
                      </td>
                      {/* Company */}
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900 leading-tight">{registration.company_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {registration.company_designations?.designation_name || '—'} · {registration.district}
                        </p>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {getStatusBadge(registration.status)}
                          {registration.is_active === false && registration.status === 'approved' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-full">
                              <EyeOff className="w-3 h-3 mr-1" />Hidden
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{formatDate(registration.created_at)}</p>
                      </td>
                      {/* Documents */}
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {registration.gst_certificate_url && (
                            <a href={registration.gst_certificate_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors" title="GST Certificate">
                              GST <ExternalLink className="w-3 h-3 ml-0.5" />
                            </a>
                          )}
                          {registration.udyam_certificate_url && (
                            <a href={registration.udyam_certificate_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded hover:bg-purple-100 transition-colors" title="UDYAM Certificate">
                              UDYAM <ExternalLink className="w-3 h-3 ml-0.5" />
                            </a>
                          )}
                          {registration.payment_proof_url && (
                            <a href={registration.payment_proof_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded hover:bg-green-100 transition-colors" title="Payment Proof">
                              Pay <ExternalLink className="w-3 h-3 ml-0.5" />
                            </a>
                          )}
                          {!registration.gst_certificate_url && !registration.udyam_certificate_url && !registration.payment_proof_url && (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </div>
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Pending: show Approve button prominently */}
                          {registration.status === 'pending' && canApprove && (
                            <button
                              onClick={() => openConfirmDialog(registration.id, 'approved', registration.full_name)}
                              disabled={actionLoading === registration.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />Approve
                            </button>
                          )}
                          {/* View — always visible */}
                          {canViewMembers && (
                            <button
                              onClick={() => handleViewApplication(registration.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                            >
                              <ViewIcon className="w-3.5 h-3.5" />View
                            </button>
                          )}
                          {/* ⋯ overflow menu */}
                          <button
                            onClick={(e) => handleMenuToggle(e, registration.id)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                            title="More actions"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                          {actionLoading === registration.id && (
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-blue-600" />
                          )}
                        </div>
                      </td>
                    </tr>
                    {registration.rejection_reason && registration.status === 'rejected' && (
                      <tr className="bg-red-50">
                        <td colSpan={5} className="px-4 py-2">
                          <p className="text-xs text-red-700">
                            <span className="font-medium">Rejection reason:</span> {registration.rejection_reason}
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
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center mb-4">
              <AlertTriangle className="w-6 h-6 text-orange-500 mr-3" />
              <h3 className="text-lg font-semibold text-gray-900">
                Confirm {confirmDialog.action === 'approved' ? 'Approval' : 'Rejection'}
              </h3>
            </div>

            <p className="text-gray-600 mb-4">
              Are you sure you want to {confirmDialog.action === 'approved' ? 'approve' : 'reject'} the registration for{' '}
              <span className="font-semibold">{confirmDialog.memberName}</span>?
            </p>

            {confirmDialog.action === 'rejected' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Please provide a reason for rejecting this registration..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {rejectionReason.length} characters
                </p>
              </div>
            )}

            {actionLoading === confirmDialog.registrationId && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg flex items-center text-sm text-blue-700">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                Processing your request...
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setConfirmDialog({ isOpen: false, registrationId: '', action: 'approved', memberName: '' });
                  setRejectionReason('');
                }}
                disabled={actionLoading === confirmDialog.registrationId}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={() => handleStatusUpdate(confirmDialog.registrationId, confirmDialog.action)}
                disabled={actionLoading === confirmDialog.registrationId}
                className={`inline-flex items-center px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  confirmDialog.action === 'approved'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {actionLoading === confirmDialog.registrationId && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                )}
                {actionLoading === confirmDialog.registrationId ? 'Processing...' :
                  confirmDialog.action === 'approved' ? 'Approve' : 'Reject'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500 mr-3" />
              <h3 className="text-lg font-semibold text-gray-900">
                Confirm Deletion
              </h3>
            </div>

            <p className="text-gray-600 mb-4">
              Are you sure you want to delete <span className="font-semibold">{deleteDialog.memberName}</span>?
              This member will be moved to the deleted members archive.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Deletion Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={deletionReason}
                onChange={(e) => setDeletionReason(e.target.value)}
                placeholder="Please provide a reason for deleting this member..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                {deletionReason.length} characters
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setDeleteDialog({ isOpen: false, memberId: '', memberName: '' });
                  setDeletionReason('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteMember}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete Member
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {showEditModal && editingMember && (
        <EditMemberModal
          member={editingMember}
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingMember(null);
            // If we came from the view modal, return to it
            if (viewingApplicationId) {
              setShowViewModal(true);
            }
          }}
          onSuccess={() => {
            loadRegistrations();
            showToast('success', 'Member updated successfully');
            // If we came from the view modal, return to it
            if (viewingApplicationId) {
              setShowViewModal(true);
            }
          }}
          onError={(message) => showToast('error', message)}
        />
      )}

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

      {/* ⋯ Overflow dropdown — fixed position, outside any overflow container */}
      {openMenuId && (() => {
        const reg = filteredRegistrations.find(r => r.id === openMenuId);
        if (!reg) return null;
        return (
          <div
            ref={menuRef}
            className="fixed z-50 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1"
            style={{ top: menuPosition.top, right: menuPosition.right }}
          >
            {/* Reject — only for pending */}
            {reg.status === 'pending' && canApprove && (
              <button
                onClick={() => { setOpenMenuId(null); openConfirmDialog(reg.id, 'rejected', reg.full_name); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <XCircle className="w-4 h-4" />Reject
              </button>
            )}
            {/* Re-approve — only for rejected */}
            {reg.status === 'rejected' && canApprove && (
              <button
                onClick={() => { setOpenMenuId(null); openConfirmDialog(reg.id, 'approved', reg.full_name); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-700 hover:bg-green-50 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />Approve
              </button>
            )}
            {/* Edit */}
            {reg.status !== 'pending' && canEdit && (
              <button
                onClick={() => { setOpenMenuId(null); handleEditMember(reg); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Edit3 className="w-4 h-4" />Edit
              </button>
            )}
            {/* Activate / Deactivate */}
            {reg.status === 'approved' && canEdit && (
              <button
                onClick={() => { setOpenMenuId(null); handleToggleActive(reg.id, reg.is_active !== false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {reg.is_active === false
                  ? <><Eye className="w-4 h-4 text-green-600" />Activate</>
                  : <><EyeOff className="w-4 h-4 text-orange-500" />Deactivate</>
                }
              </button>
            )}
            {/* History */}
            {reg.status !== 'pending' && (
              <button
                onClick={() => { setOpenMenuId(null); handleViewHistory(reg.id, reg.full_name); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <History className="w-4 h-4" />History
              </button>
            )}
            {/* Delete — separated with a divider */}
            {reg.status !== 'pending' && canDelete && (
              <>
                <div className="my-1 border-t border-gray-100" />
                <button
                  onClick={() => { setOpenMenuId(null); setDeleteDialog({ isOpen: true, memberId: reg.id, memberName: reg.full_name }); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />Delete
                </button>
              </>
            )}
          </div>
        );
      })()}
    </div>
    </PermissionGate>
  );
};

export default AdminRegistrations;
