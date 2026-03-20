import React, { useState, useEffect, useCallback } from 'react';
import { X, Clock, User, File as FileEdit, Activity } from 'lucide-react';
import { memberAuditService, AuditHistoryEntry } from '../lib/supabase';

interface AuditHistoryModalProps {
  memberId: string;
  memberName: string;
  isOpen: boolean;
  onClose: () => void;
}

const AuditHistoryModal: React.FC<AuditHistoryModalProps> = ({
  memberId,
  memberName,
  isOpen,
  onClose
}) => {
  const [history, setHistory] = useState<AuditHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await memberAuditService.getMemberAuditHistory(memberId);
      setHistory(data);
    } catch (error) {
      console.error('Error loading audit history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    if (isOpen && memberId) {
      void loadHistory();
    }
  }, [isOpen, memberId, loadHistory]);

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'update':
        return <FileEdit className="w-5 h-5 text-blue-600" />;
      case 'status_change':
        return <Activity className="w-5 h-5 text-green-600" />;
      case 'deactivate':
        return <Activity className="w-5 h-5 text-orange-600" />;
      case 'activate':
        return <Activity className="w-5 h-5 text-green-600" />;
      case 'delete':
        return <Activity className="w-5 h-5 text-red-600" />;
      case 'restore':
        return <Activity className="w-5 h-5 text-purple-600" />;
      case 'create':
        return <Activity className="w-5 h-5 text-blue-600" />;
      default:
        return <Activity className="w-5 h-5 text-gray-600" />;
    }
  };

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'update':
        return 'bg-blue-100 text-blue-800';
      case 'status_change':
        return 'bg-green-100 text-green-800';
      case 'deactivate':
        return 'bg-orange-100 text-orange-800';
      case 'activate':
        return 'bg-green-100 text-green-800';
      case 'delete':
        return 'bg-red-100 text-red-800';
      case 'restore':
        return 'bg-purple-100 text-purple-800';
      case 'create':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatActionType = (actionType: string) => {
    const labels: Record<string, string> = {
      update: 'Field Update',
      status_change: 'Status Change',
      deactivate: 'Deactivated',
      activate: 'Activated',
      delete: 'Deleted',
      restore: 'Restored',
      create: 'Created'
    };
    return labels[actionType] || actionType;
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

  const formatFieldName = (fieldName: string) => {
    return fieldName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Change History</h2>
            <p className="text-sm text-gray-600 mt-1">{memberName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No History Available</h3>
              <p className="text-gray-600">No changes have been recorded for this member yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center">
                      <div className="mr-3">
                        {getActionIcon(entry.action_type)}
                      </div>
                      <div>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(entry.action_type)}`}>
                          {formatActionType(entry.action_type)}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      {formatDate(entry.created_at)}
                    </div>
                  </div>

                  {entry.action_type === 'update' && entry.field_name && (
                    <div className="mb-3">
                      <p className="text-sm font-medium text-gray-900 mb-2">
                        Field: <span className="text-blue-600">{formatFieldName(entry.field_name)}</span>
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Previous Value:</p>
                          <p className="text-sm text-gray-700 bg-white rounded px-3 py-2 break-words">
                            {entry.old_value || <span className="text-gray-400 italic">Empty</span>}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">New Value:</p>
                          <p className="text-sm text-gray-700 bg-white rounded px-3 py-2 break-words">
                            {entry.new_value || <span className="text-gray-400 italic">Empty</span>}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {entry.change_reason && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-1">Reason:</p>
                      <p className="text-sm text-gray-700 bg-white rounded px-3 py-2">
                        {entry.change_reason}
                      </p>
                    </div>
                  )}

                  {entry.admin_email && (
                    <div className="flex items-center text-xs text-gray-600">
                      <User className="w-3 h-3 mr-1" />
                      Changed by: <span className="ml-1 font-medium">{entry.admin_email}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuditHistoryModal;
