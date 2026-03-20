import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MapPin,
  Plus,
  Search,
  ToggleLeft,
  ToggleRight,
  X,
  Lock
} from 'lucide-react';
import { statesService, StateMaster } from '../lib/supabase';
import Toast from '../components/Toast';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';

const AdminStateManagement: React.FC = () => {
  const canManageStates = useHasPermission('locations.states.manage');
  const [states, setStates] = useState<StateMaster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStateName, setNewStateName] = useState('');
  const [newIsActive, setNewIsActive] = useState(true);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({
    type: 'success',
    message: '',
    isVisible: false
  });

  const loadStates = useCallback(async () => {
    try {
      setIsLoading(true);
      const statesData = await statesService.getAllStates();
      setStates(statesData);
    } catch (error) {
      console.error('Error loading states:', error);
      showToast('error', 'Failed to load states');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStates();
  }, [loadStates]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

  const handleAddState = async () => {
    if (!newStateName.trim()) {
      showToast('error', 'Please enter a state name');
      return;
    }

    if (newStateName.trim().length < 3) {
      showToast('error', 'State name must be at least 3 characters long');
      return;
    }

    try {
      setIsSaving(true);
      const result = await statesService.upsertState(newStateName, newIsActive);

      if (result.success) {
        showToast('success', 'State added successfully');
        setShowAddModal(false);
        setNewStateName('');
        setNewIsActive(true);
        await loadStates();
      } else {
        showToast('error', result.error || 'Failed to add state');
      }
    } catch (error) {
      console.error('Error adding state:', error);
      showToast('error', 'An unexpected error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (stateId: string, currentStatus: boolean) => {
    try {
      const result = await statesService.updateStateActiveStatus(stateId, !currentStatus);

      if (result.success) {
        showToast('success', `State ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
        await loadStates();
      } else {
        showToast('error', result.error || 'Failed to update state status');
      }
    } catch (error) {
      console.error('Error toggling state status:', error);
      showToast('error', 'An unexpected error occurred');
    }
  };

  const filteredStates = states.filter(state =>
    state.state_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
      permission="locations.states.view"
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You don't have permission to view state management.</p>
          </div>
        </div>
      }
    >
      <div className="min-h-screen bg-gray-50">
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
                <MapPin className="w-8 h-8 mr-3 text-blue-600" />
                State Management
              </h1>
              <p className="text-gray-600 mt-2">
                Manage states, payment details, and locations
              </p>
            </div>
            {canManageStates && (
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add State
              </button>
            )}
          </div>
        </div>
        {/* Search */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search states..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* States Table */}
        {isLoading ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading states...</p>
          </div>
        ) : filteredStates.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No states found' : 'No states yet'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm 
                ? 'Try adjusting your search criteria'
                : 'Click "Add State" to start managing states'
              }
            </p>
            {!searchTerm && canManageStates && (
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add State
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      State Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Updated
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredStates.map((state) => (
                    <tr key={state.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <MapPin className="w-4 h-4 text-gray-400 mr-2" />
                          <span className="font-medium text-gray-900">{state.state_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {canManageStates ? (
                          <button
                            onClick={() => handleToggleActive(state.id, state.is_active)}
                            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                              state.is_active
                                ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                            }`}
                          >
                            {state.is_active ? (
                              <>
                                <ToggleRight className="w-4 h-4 mr-1" />
                                Active
                              </>
                            ) : (
                              <>
                                <ToggleLeft className="w-4 h-4 mr-1" />
                                Inactive
                              </>
                            )}
                          </button>
                        ) : (
                          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                            state.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {state.is_active ? (
                              <>
                                <ToggleRight className="w-4 h-4 mr-1" />
                                Active
                              </>
                            ) : (
                              <>
                                <ToggleLeft className="w-4 h-4 mr-1" />
                                Inactive
                              </>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(state.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(state.updated_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <Link
                          to={`/admin/state-management/${encodeURIComponent(state.state_name)}/locations`}
                          className="inline-flex items-center px-3 py-1 text-sm font-medium text-green-600 bg-green-50 rounded hover:bg-green-100 transition-colors"
                        >
                          <MapPin className="w-3 h-3 mr-1" />
                          Manage Locations
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add State Modal */}
      {showAddModal && canManageStates && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add New State</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  State Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newStateName}
                  onChange={(e) => setNewStateName(e.target.value)}
                  placeholder="Enter state name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {newStateName.trim().length > 0 && newStateName.trim().length < 3 && (
                  <p className="text-red-500 text-sm mt-1">State name must be at least 3 characters long</p>
                )}
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="newIsActive"
                  checked={newIsActive}
                  onChange={(e) => setNewIsActive(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
                <label htmlFor="newIsActive" className="ml-2 text-sm font-medium text-gray-700">
                  Set as active state
                </label>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddState}
                disabled={isSaving || !newStateName.trim() || newStateName.trim().length < 3}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Adding...' : 'Add State'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PermissionGate>
  );
};

export default AdminStateManagement;
