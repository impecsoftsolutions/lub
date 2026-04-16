import React, { useState, useEffect } from 'react';
import { X, Mail, Loader2, CheckCircle, AlertTriangle, Lock, Unlock } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { sessionManager } from '../../../lib/sessionManager';

interface BlockUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: string;
    email: string;
    account_type: 'admin' | 'member' | 'both' | 'general_user';
    is_frozen: boolean;
  };
  action: 'block' | 'unblock';
  onSuccess: () => void;
}

const BlockUserModal: React.FC<BlockUserModalProps> = ({
  isOpen,
  onClose,
  user,
  action,
  onSuccess
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);

  const isGeneralUser = user.account_type === 'general_user';
  const isBlock = action === 'block';

  const getTitle = () => {
    if (isBlock) {
      return isGeneralUser ? 'Block User' : 'Block Account';
    }
    return isGeneralUser ? 'Unblock User' : 'Unblock Account';
  };

  const getButtonText = () => {
    if (isBlock) {
      return isGeneralUser ? 'Block' : 'Block';
    }
    return isGeneralUser ? 'Unblock' : 'Unblock';
  };

  const getWarningMessage = () => {
    if (isBlock) {
      return 'User will not be able to login until unblocked';
    }
    return 'User will be able to login again';
  };

  const getAccountTypeBadge = () => {
    const colors = {
      admin: 'bg-red-100 text-red-800',
      member: 'bg-primary/10 text-primary',
      both: 'bg-purple-100 text-purple-800',
      general_user: 'bg-muted text-muted-foreground'
    };

    const labels = {
      admin: 'Admin',
      member: 'Member',
      both: 'Admin & Member',
      general_user: 'General User'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[user.account_type]}`}>
        {labels[user.account_type]}
      </span>
    );
  };

  useEffect(() => {
    if (!isOpen) {
      setError('');
      setSuccess(false);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    try {
      setIsProcessing(true);
      setError('');

      // Get current user ID from session
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        throw new Error('Unable to get current session token');
      }

      const { data, error: updateError } = await supabase
        .rpc('admin_block_unblock_user_with_session', {
          p_user_id: user.id,
          p_session_token: sessionToken,
          p_is_frozen: action === 'block'
        });

      if (updateError) {
        throw new Error(updateError.message);
      }

      // Check RPC result
      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        throw new Error(result?.error || `Failed to ${action} user`);
      }

      setSuccess(true);

      setTimeout(() => {
        setSuccess(false);
        onSuccess();
        onClose();
      }, 1000);

    } catch (error: unknown) {
      console.error('Block/unblock user error:', error);
      setError((error as { message?: string }).message || `Failed to ${action} user`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (!isProcessing) {
      setError('');
      setSuccess(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  const iconColor = isBlock ? 'bg-orange-100' : 'bg-green-100';
  const iconTextColor = isBlock ? 'text-orange-600' : 'text-green-600';
  const warningBgColor = isBlock ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200';
  const warningTextColor = isBlock ? 'text-orange-800' : 'text-green-800';
  const warningTitleColor = isBlock ? 'text-orange-900' : 'text-green-900';
  const buttonBgColor = isBlock ? 'bg-orange-600 hover:bg-orange-700 focus:ring-orange-500' : 'bg-green-600 hover:bg-green-700 focus:ring-green-500';

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto">
      <div className="relative flex min-h-screen items-center justify-center px-4 py-6 text-center sm:p-0">
        <div
          className="fixed inset-0 transition-opacity bg-black/50"
          onClick={handleClose}
        />

        <div className="relative z-10 inline-block w-full max-w-lg transform overflow-hidden rounded-xl border border-border bg-card text-left shadow-2xl transition-all">

          <div className="bg-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-10 h-10 ${iconColor} rounded-full`}>
                  {isBlock ? (
                    <Lock className={`w-5 h-5 ${iconTextColor}`} />
                  ) : (
                    <Unlock className={`w-5 h-5 ${iconTextColor}`} />
                  )}
                </div>
                <div>
                  <h3 className="text-section font-semibold text-foreground">{getTitle()}</h3>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={isProcessing}
                className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {success && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="text-sm font-medium text-green-800">
                    User {isBlock ? 'blocked' : 'unblocked'} successfully!
                  </p>
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

            <div className="mb-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground font-medium">Email:</span>
                <span className="text-foreground">{user.email}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground font-medium">Account Type:</span>
                {getAccountTypeBadge()}
              </div>
            </div>

            <div className={`p-4 ${warningBgColor} border rounded-lg`}>
              <div className="flex items-start gap-2">
                {isBlock ? (
                  <AlertTriangle className={`w-5 h-5 ${iconTextColor} flex-shrink-0 mt-0.5`} />
                ) : (
                  <CheckCircle className={`w-5 h-5 ${iconTextColor} flex-shrink-0 mt-0.5`} />
                )}
                <div>
                  <p className={`text-sm font-medium ${warningTitleColor}`}>
                    {isBlock ? 'Warning' : 'Info'}
                  </p>
                  <p className={`text-sm ${warningTextColor} mt-1`}>
                    {getWarningMessage()}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-muted/50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
            <button
              onClick={handleConfirm}
              disabled={isProcessing || success}
              className={`w-full inline-flex justify-center items-center gap-2 rounded-lg border border-transparent shadow-sm px-4 py-2 ${buttonBgColor} text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : success ? (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Done!
                </>
              ) : (
                <>
                  {isBlock ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                  {getButtonText()}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={isProcessing}
              className="mt-3 w-full inline-flex justify-center rounded-lg border border-border shadow-sm px-4 py-2 bg-card text-base font-medium text-foreground hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default BlockUserModal;
