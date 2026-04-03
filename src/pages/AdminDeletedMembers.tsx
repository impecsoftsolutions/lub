import React, { useState, useEffect, useCallback } from 'react';
import {
  Trash2,
  Search,
  RotateCcw,
  AlertTriangle,
  Clock,
  User,
  Lock
} from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { deletedMembersService, DeletedMember } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import Toast from '../components/Toast';
import { PageHeader } from '../components/ui/PageHeader';

const AdminDeletedMembers: React.FC = () => {
  const [deletedMembers, setDeletedMembers] = useState<DeletedMember[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<DeletedMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [restoreDialog, setRestoreDialog] = useState<{
    isOpen: boolean;
    memberId: string;
    memberName: string;
  }>({
    isOpen: false,
    memberId: '',
    memberName: ''
  });
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({
    type: 'success',
    message: '',
    isVisible: false
  });

  const loadDeletedMembers = useCallback(async () => {
    try {
      setIsLoading(true);
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        showToast('error', 'User not authenticated');
        setIsLoading(false);
        return;
      }

      console.debug('[AdminDeletedMembers] loading deleted members');

      const data = await deletedMembersService.getAllDeletedMembers(sessionToken, searchTerm || undefined);
      setDeletedMembers(data);

      console.debug('[AdminDeletedMembers] loaded', { count: Array.isArray(data) ? data.length : 0 });
    } catch (error: unknown) {
      console.error('[AdminDeletedMembers] fetch error', error);
      const resolvedError = error as { message?: string; code?: string };

      // Distinguish permission errors from other errors
      if (resolvedError?.message?.toLowerCase?.().includes('not authorized') ||
          resolvedError?.message?.toLowerCase?.().includes('permission') ||
          resolvedError?.code === 'PGRST301') {
        showToast('error', 'Access restricted: You do not have permission to view deleted members');
        setDeletedMembers([]);
        return;
      }

      showToast('error', 'Failed to load deleted members');
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    loadDeletedMembers();
  }, [loadDeletedMembers]);

  const filterMembers = useCallback(() => {
    let filtered = deletedMembers;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        member =>
          member.full_name.toLowerCase().includes(term) ||
          member.email.toLowerCase().includes(term) ||
          member.mobile_number.includes(term) ||
          member.company_name.toLowerCase().includes(term)
      );
    }

    setFilteredMembers(filtered);
  }, [deletedMembers, searchTerm]);

  useEffect(() => {
    filterMembers();
  }, [filterMembers]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

  const handleRestore = async () => {
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        showToast('error', 'User not authenticated');
        return;
      }

      console.log('[AdminDeletedMembers] Restoring member:', {
        memberId: restoreDialog.memberId,
        memberName: restoreDialog.memberName
      });

      const result = await deletedMembersService.restoreDeletedMember(
        restoreDialog.memberId,
        sessionToken
      );

      console.log('[AdminDeletedMembers] Restore result:', result);

      setDeletedMembers(prev => prev.filter(m => m.id !== restoreDialog.memberId));
      showToast('success', 'Member restored successfully');
      setRestoreDialog({ isOpen: false, memberId: '', memberName: '' });

      await loadDeletedMembers();
    } catch (error: unknown) {
      console.error('[AdminDeletedMembers] Error restoring member:', error);
      const errorMsg = (error as { message?: string })?.message || 'An unexpected error occurred';
      showToast('error', errorMsg);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <PermissionGate
      permission="members.restore"
      fallback={
        <div className="min-h-screen bg-gray-50 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
            <Lock className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Restricted</h2>
            <p className="text-gray-600">Only users with restore permissions can access the deleted members archive.</p>
          </div>
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

      <div>
        <PageHeader
          title="Deleted Members Archive"
          subtitle="View and restore deleted member records (Super Admin Only)"
          actions={
            <span className="text-sm text-gray-500">{deletedMembers.length} total</span>
          }
        />

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, mobile number, or company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="mt-4 text-sm text-gray-600">
            Showing {filteredMembers.length} of {deletedMembers.length} deleted members
          </div>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading deleted members...</p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Trash2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No deleted members found</h3>
            <p className="text-gray-600">
              {searchTerm ? 'Try adjusting your search criteria' : 'No members have been deleted yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredMembers.map((member) => (
              <div key={member.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex-1 mb-4 lg:mb-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                      <div>
                        <h3 className="font-semibold text-gray-900 text-lg">{member.full_name}</h3>
                        <p className="text-sm text-gray-600">{member.email}</p>
                        <p className="text-sm text-gray-600">{member.mobile_number}</p>
                      </div>

                      <div>
                        <p className="font-medium text-gray-900">{member.company_name}</p>
                        <p className="text-sm text-gray-600">{member.district}</p>
                        <p className="text-sm text-gray-600">{member.state}</p>
                      </div>

                      <div>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 mb-2">
                          Deleted
                        </span>
                        <p className="text-xs text-gray-500 flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {formatDate(member.deleted_at)}
                        </p>
                        {member.deleted_by_email && (
                          <p className="text-xs text-gray-500 flex items-center mt-1">
                            <User className="w-3 h-3 mr-1" />
                            By: {member.deleted_by_email}
                          </p>
                        )}
                      </div>
                    </div>

                    {member.deletion_reason && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-xs font-medium text-red-800 mb-1">Deletion Reason:</p>
                        <p className="text-sm text-red-700">{member.deletion_reason}</p>
                      </div>
                    )}
                  </div>

                  <div className="lg:ml-6">
                    <button
                      onClick={() =>
                        setRestoreDialog({
                          isOpen: true,
                          memberId: member.id,
                          memberName: member.full_name
                        })
                      }
                      className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Restore Member
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {restoreDialog.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center mb-4">
              <AlertTriangle className="w-6 h-6 text-green-500 mr-3" />
              <h3 className="text-lg font-semibold text-gray-900">
                Confirm Restoration
              </h3>
            </div>

            <p className="text-gray-600 mb-6">
              Are you sure you want to restore <span className="font-semibold">{restoreDialog.memberName}</span>?
              This member will be moved back to the active members list.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() =>
                  setRestoreDialog({ isOpen: false, memberId: '', memberName: '' })
                }
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRestore}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Restore Member
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PermissionGate>
  );
};

export default AdminDeletedMembers;
