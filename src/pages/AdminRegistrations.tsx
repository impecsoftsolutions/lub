import React, { useCallback, useEffect, useState } from 'react';
import { Users, Search, Filter, FileText, CheckCircle, XCircle, Clock, ExternalLink, AlertTriangle, Download, User, CreditCard as Edit3, EyeOff, Eye, Trash2, History, Eye as ViewIcon, Lock } from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import { supabase, memberRegistrationService } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { emailService, WelcomeEmailData } from '../lib/emailService';
import { vCardGenerator, VCardData } from '../lib/vCardGenerator';
import Toast from '../components/Toast';
import EditMemberModal from '../components/EditMemberModal';
import AuditHistoryModal from '../components/AuditHistoryModal';
import ViewApplicationModal from '../components/ViewApplicationModal';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

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
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [isGeneratingVCards, setIsGeneratingVCards] = useState(false);
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
  const canExport = useHasPermission('members.export');

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

  const handleMemberSelection = (memberId: string, isSelected: boolean) => {
    const newSelection = new Set(selectedMembers);
    if (isSelected) {
      newSelection.add(memberId);
    } else {
      newSelection.delete(memberId);
    }
    setSelectedMembers(newSelection);
  };

  const handleSelectAll = () => {
    const approvedMembers = filteredRegistrations.filter(reg => reg.status === 'approved');
    if (selectedMembers.size === approvedMembers.length) {
      // Deselect all
      setSelectedMembers(new Set());
    } else {
      // Select all approved members
      setSelectedMembers(new Set(approvedMembers.map(reg => reg.id)));
    }
  };

  const generateVCards = async () => {
    if (selectedMembers.size === 0) {
      showToast('error', 'Please select at least one approved member');
      return;
    }

    try {
      setIsGeneratingVCards(true);
      const zip = new JSZip();
      
      // Get selected members data
      const selectedMembersData = registrations.filter(reg => 
        selectedMembers.has(reg.id) && reg.status === 'approved'
      );

      if (selectedMembersData.length === 0) {
        showToast('error', 'No approved members selected');
        return;
      }

      // Generate vCard for each selected member
      selectedMembersData.forEach(member => {
        const vCardData: VCardData = {
          fullName: member.full_name,
          companyName: member.company_name,
          mobileNumber: member.mobile_number,
          district: member.district,
          state: member.state || 'Unknown',
          productsServices: member.products_services || 'Not specified',
          referredBy: member.referred_by || undefined
        };

        const vCardContent = vCardGenerator.generateVCard(vCardData);
        const fileName = vCardGenerator.generateFileName(member.full_name, member.state || 'Unknown');
        
        zip.file(fileName, vCardContent);
      });

      // Generate and download zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, 'lub-vcards.zip');
      
      showToast('success', `Generated ${selectedMembersData.length} vCard(s) successfully!`);
      setSelectedMembers(new Set()); // Clear selection
    } catch (error) {
      console.error('Error generating vCards:', error);
      showToast('error', 'Failed to generate vCards');
    } finally {
      setIsGeneratingVCards(false);
    }
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
        <div className="min-h-screen bg-gray-50 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
            <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You don't have permission to view member registrations.</p>
          </div>
        </div>
      }
    >
    <div className="min-h-screen bg-gray-50 py-8">
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                <Users className="w-8 h-8 mr-3 text-blue-600" />
                Member Registrations
              </h1>
              <p className="text-gray-600 mt-2">
                Manage and review membership applications
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Total Registrations</p>
              <p className="text-2xl font-bold text-gray-900">{registrations.length}</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, email, or mobile number..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div className="sm:w-48">
              <div className="relative">
                <Filter className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none bg-white"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
          </div>

          {/* Results count */}
          <div className="mt-4 text-sm text-gray-600">
            Showing {filteredRegistrations.length} of {registrations.length} registrations
          </div>
        </div>

        {/* vCard Generation Section */}
        {canExport && filteredRegistrations.some(reg => reg.status === 'approved') && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <User className="w-5 h-5 mr-2 text-blue-600" />
                  Member vCard Generator
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Select approved members to generate contact cards (.vcf files)
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSelectAll}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {selectedMembers.size === filteredRegistrations.filter(reg => reg.status === 'approved').length 
                    ? 'Deselect All' 
                    : 'Select All Approved'
                  }
                </button>
                <button
                  onClick={generateVCards}
                  disabled={selectedMembers.size === 0 || isGeneratingVCards}
                  className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    selectedMembers.size === 0 || isGeneratingVCards
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  <Download className="w-4 h-4 mr-2" />
                  {isGeneratingVCards 
                    ? 'Generating...' 
                    : `Download vCards (${selectedMembers.size})`
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Registrations List */}
        {isLoading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading registrations...</p>
          </div>
        ) : filteredRegistrations.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No registrations found</h3>
            <p className="text-gray-600">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your search or filter criteria'
                : 'No member registrations have been submitted yet'
              }
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRegistrations.map((registration) => (
              <div key={registration.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                {/* Selection Checkbox for Approved Members */}
                {registration.status === 'approved' && (
                  <div className="flex items-center mb-4">
                    <input
                      type="checkbox"
                      id={`select-${registration.id}`}
                      checked={selectedMembers.has(registration.id)}
                      onChange={(e) => handleMemberSelection(registration.id, e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                    />
                    <label htmlFor={`select-${registration.id}`} className="ml-2 text-sm font-medium text-gray-700">
                      Select for vCard generation
                    </label>
                  </div>
                )}
                
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
                  {/* Main Info */}
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4 lg:mb-0">
                    <div>
                      <h3 className="font-semibold text-gray-900 text-lg">{registration.full_name}</h3>
                      <p className="text-sm text-gray-600">{registration.email}</p>
                      <p className="text-sm text-gray-600">{registration.mobile_number}</p>
                      {registration.member_id && (
                        <p className="text-sm font-medium text-blue-600 mt-1">
                          ID: {registration.member_id}
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="font-medium text-gray-900">{registration.company_name}</p>
                      <p className="text-sm text-gray-600">
                        {registration.company_designations?.designation_name || 'N/A'}
                      </p>
                      <p className="text-sm text-gray-600">{registration.district}</p>
                    </div>
                    
                    <div>
                      <div className="mb-2 flex flex-wrap gap-2 items-center">
                        {getStatusBadge(registration.status)}
                        {registration.is_active === false && registration.status === 'approved' && (
                          <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-orange-800 bg-orange-100 rounded">
                            <EyeOff className="w-3 h-3 mr-1" />
                            Hidden from Directory
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        Submitted: {formatDate(registration.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row gap-3 lg:ml-6">
                    {/* File Links */}
                    <div className="flex gap-2">
                      {registration.gst_certificate_url && (
                        <a
                          href={registration.gst_certificate_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-full hover:bg-blue-100 transition-colors"
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          GST
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      )}
                      {registration.udyam_certificate_url && (
                        <a
                          href={registration.udyam_certificate_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1 text-xs font-medium text-purple-600 bg-purple-50 rounded-full hover:bg-purple-100 transition-colors"
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          UDYAM
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      )}
                      {registration.payment_proof_url && (
                        <a
                          href={registration.payment_proof_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1 text-xs font-medium text-green-600 bg-green-50 rounded-full hover:bg-green-100 transition-colors"
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          Payment
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      )}
                    </div>

                    {/* Status Actions */}
                    {registration.status === 'pending' && canViewMembers && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleViewApplication(registration.id)}
                          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <ViewIcon className="w-4 h-4 mr-1" />
                          View Details
                        </button>
                      </div>
                    )}

                    {/* Re-approval Action for Rejected */}
                    {registration.status === 'rejected' && canApprove && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => openConfirmDialog(registration.id, 'approved', registration.full_name)}
                          disabled={actionLoading === registration.id}
                          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Re-approve this rejected registration"
                        >
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Approve
                        </button>
                      </div>
                    )}

                    {/* Management Actions for Approved/Rejected Members */}
                    {registration.status !== 'pending' && (
                      <div className="flex flex-wrap gap-2">
                        {canEdit && (
                          <button
                            onClick={() => handleEditMember(registration)}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                            title="Edit Member"
                          >
                            <Edit3 className="w-3.5 h-3.5 mr-1" />
                            Edit
                          </button>
                        )}

                        {canEdit && registration.status === 'approved' && (
                          <button
                            onClick={() => handleToggleActive(registration.id, registration.is_active !== false)}
                            className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                              registration.is_active === false
                                ? 'text-green-600 bg-green-50 hover:bg-green-100'
                                : 'text-orange-600 bg-orange-50 hover:bg-orange-100'
                            }`}
                            title={registration.is_active === false ? 'Activate Member' : 'Deactivate Member'}
                          >
                            {registration.is_active === false ? (
                              <>
                                <Eye className="w-3.5 h-3.5 mr-1" />
                                Activate
                              </>
                            ) : (
                              <>
                                <EyeOff className="w-3.5 h-3.5 mr-1" />
                                Deactivate
                              </>
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => handleViewHistory(registration.id, registration.full_name)}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                          title="View Change History"
                        >
                          <History className="w-3.5 h-3.5 mr-1" />
                          History
                        </button>

                        {canDelete && (
                          <button
                            onClick={() => setDeleteDialog({ isOpen: true, memberId: registration.id, memberName: registration.full_name })}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                            title="Delete Member"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Delete
                          </button>
                        )}
                      </div>
                    )}

                    {registration.rejection_reason && registration.status === 'rejected' && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs">
                        <p className="font-medium text-red-800">Rejection Reason:</p>
                        <p className="text-red-700 mt-1">{registration.rejection_reason}</p>
                      </div>
                    )}

                    {actionLoading === registration.id && (
                      <div className="flex items-center text-sm text-gray-600">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                        Processing...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
    </div>
    </PermissionGate>
  );
};

export default AdminRegistrations;
