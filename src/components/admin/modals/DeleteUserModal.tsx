import React, { useState, useEffect } from 'react';
import { X, Mail, Phone, Loader2, CheckCircle, AlertTriangle, Trash2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { sessionManager } from '../../../lib/sessionManager';

interface DeleteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: string;
    email: string;
    mobile_number: string;
    account_type: 'admin' | 'member' | 'both' | 'general_user';
  };
  onSuccess: () => void;
}

const DeleteUserModal: React.FC<DeleteUserModalProps> = ({
  isOpen,
  onClose,
  user,
  onSuccess
}) => {
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [purgedCount, setPurgedCount] = useState<number>(0);

  const isGeneralUser = user.account_type === 'general_user';

  useEffect(() => {
    if (!isOpen) {
      setIsConfirmed(false);
      setError('');
      setSuccess(false);
      setPurgedCount(0);
    }
  }, [isOpen]);

  const handleDelete = async () => {
    console.log('[DeleteUserModal] Starting delete for user:', user.id);
    console.log('[DeleteUserModal] User account_type:', user.account_type);

    if (!isConfirmed) {
      setError('Please confirm that you understand this action cannot be undone');
      return;
    }

    if (!isGeneralUser) {
      setError('Only general user accounts can be deleted from this interface');
      return;
    }

    try {
      setIsDeleting(true);
      setError('');

      console.log('[DeleteUserModal] Executing delete query');

      // Get current user ID from session
      const userData = sessionManager.getUserData();
      if (!userData?.id) {
        throw new Error('Unable to get current user ID');
      }

      console.debug('[DeleteUserModal] calling admin_delete_user_and_purge_deleted_members', {
        targetUserId: user.id,
        byUserId: userData.id,
      });

      const { data, error: rpcError } = await supabase
        .rpc('admin_delete_user_and_purge_deleted_members', {
          p_user_id: user.id,
          p_requesting_user_id: userData.id
        });

      console.log('[DeleteUserModal] Delete result:', { error: rpcError, data });

      if (rpcError) {
        console.error('[DeleteUserModal] RPC transport error', rpcError);
        throw new Error(rpcError.message || 'RPC transport error');
      }

      if (!data || data.success !== true) {
        const msg = (data && (data.error || JSON.stringify(data))) || 'Unknown error deleting user';
        console.error('[DeleteUserModal] RPC domain error', data);
        throw new Error(msg);
      }

      console.debug('[DeleteUserModal] success', data);

      // Log and store purge results
      if (typeof data.purged_deleted_members === 'number') {
        console.log('[DeleteUserModal] Purged deleted_members records:', data.purged_deleted_members);
        setPurgedCount(data.purged_deleted_members);
      }

      setSuccess(true);

      setTimeout(() => {
        setSuccess(false);
        onSuccess();
        onClose();
      }, 1000);

    } catch (error: any) {
      console.error('[DeleteUserModal] Delete failed', error);
      setError(error?.message || 'Failed to delete user');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (!isDeleting) {
      setIsConfirmed(false);
      setError('');
      setSuccess(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={handleClose}
        />

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">

          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-red-100 rounded-full">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Delete User Account</h3>
                  <p className="text-sm text-red-600 font-medium">This action cannot be undone</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={isDeleting}
                className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!isGeneralUser && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">Cannot Delete This User</p>
                    <p className="text-sm text-red-700 mt-1">
                      This user has account type <span className="font-semibold">{user.account_type}</span>.
                      Only general user accounts can be deleted from this interface.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {success && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-800">User deleted successfully!</p>
                    {purgedCount > 0 && (
                      <p className="text-xs text-green-700 mt-1">Purged {purgedCount} deleted member record{purgedCount !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
              </div>
            )}

            {isGeneralUser && (
              <>
                <div className="mb-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-600 font-medium">Email:</span>
                    <span className="text-gray-900">{user.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-600 font-medium">Mobile:</span>
                    <span className="text-gray-900">{user.mobile_number || 'Not provided'}</span>
                  </div>
                </div>

                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-red-800">Warning</p>
                      <p className="text-sm text-red-700 mt-1">
                        This will permanently delete the user account and all associated data.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <input
                    type="checkbox"
                    id="confirm-delete"
                    checked={isConfirmed}
                    onChange={(e) => {
                      setIsConfirmed(e.target.checked);
                      setError('');
                    }}
                    disabled={isDeleting || success}
                    className="mt-1 w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500 disabled:opacity-50"
                  />
                  <label
                    htmlFor="confirm-delete"
                    className="text-sm text-gray-700 font-medium cursor-pointer select-none"
                  >
                    I understand this action cannot be undone
                  </label>
                </div>
              </>
            )}
          </div>

          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
            <button
              onClick={handleDelete}
              disabled={!isConfirmed || !isGeneralUser || isDeleting || success}
              className="w-full inline-flex justify-center items-center gap-2 rounded-lg border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deleting...
                </>
              ) : success ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Deleted!
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  Delete User
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={isDeleting}
              className="mt-3 w-full inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DeleteUserModal;
