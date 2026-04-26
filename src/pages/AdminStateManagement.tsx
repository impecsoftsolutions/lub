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
import { formatDateTimeValue } from '../lib/dateTimeManager';
import Toast from '../components/Toast';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import { PageHeader } from '../components/ui/PageHeader';

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
    return formatDateTimeValue(dateString);
  };

  return (
    <PermissionGate
      permission="locations.states.view"
      fallback={
        <div className="min-h-screen bg-muted/50 flex items-center justify-center">
          <div className="text-center">
            <Lock className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to view state management.</p>
          </div>
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

      <div>
        <PageHeader
          title="State Management"
          subtitle="Manage states, payment details, and locations"
          actions={canManageStates ? (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add State
            </button>
          ) : undefined}
        />
        {/* Search */}
        <div className="bg-card rounded-lg shadow-sm border border-border p-6 mb-6">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search states..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border bg-background rounded-md focus:ring-1 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>

        {/* States Table */}
        {isLoading ? (
          <div className="bg-card rounded-lg shadow-sm border border-border p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading states...</p>
          </div>
        ) : filteredStates.length === 0 ? (
          <div className="bg-card rounded-lg shadow-sm border border-border p-12 text-center">
            <MapPin className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h3 className="text-sm font-medium text-foreground mb-2">
              {searchTerm ? 'No states found' : 'No states yet'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm 
                ? 'Try adjusting your search criteria'
                : 'Click "Add State" to start managing states'
              }
            </p>
            {!searchTerm && canManageStates && (
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add State
              </button>
            )}
          </div>
        ) : (
          <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                      State Name
                    </th>
                    <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                      Created
                    </th>
                    <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                      Updated
                    </th>
                    <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {filteredStates.map((state) => (
                    <tr key={state.id} className="hover:bg-muted/50">
                      <td className="whitespace-nowrap">
                        <div className="flex items-center">
                          <MapPin className="w-4 h-4 text-muted-foreground mr-2" />
                          <span className="text-sm font-medium text-foreground">{state.state_name}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        {canManageStates ? (
                          <button
                            onClick={() => handleToggleActive(state.id, state.is_active)}
                            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                              state.is_active
                                ? 'bg-primary/10 text-primary hover:bg-primary/20'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
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
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground'
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
                      <td className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(state.created_at)}
                      </td>
                      <td className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(state.updated_at)}
                      </td>
                      <td className="whitespace-nowrap text-sm font-medium">
                        <Link
                          to={`/admin/locations/states/${encodeURIComponent(state.state_name)}/locations`}
                          className="inline-flex items-center px-3 py-1 text-sm font-medium text-primary bg-primary/10 rounded-md hover:bg-primary/20 transition-colors"
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
        <div className="fixed inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg shadow-sm max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-section font-semibold text-foreground">Add New State</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  State Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={newStateName}
                  onChange={(e) => setNewStateName(e.target.value)}
                  placeholder="Enter state name"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                />
                {newStateName.trim().length > 0 && newStateName.trim().length < 3 && (
                  <p className="text-destructive text-sm mt-1">State name must be at least 3 characters long</p>
                )}
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="newIsActive"
                  checked={newIsActive}
                  onChange={(e) => setNewIsActive(e.target.checked)}
                  className="w-4 h-4 text-primary bg-muted border-border rounded focus:ring-ring focus:ring-2"
                />
                <label htmlFor="newIsActive" className="ml-2 text-sm font-medium text-foreground">
                  Set as active state
                </label>
              </div>
            </div>
            
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddState}
                disabled={isSaving || !newStateName.trim() || newStateName.trim().length < 3}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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



