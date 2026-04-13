import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, CreditCard as Edit3, Save, X, Upload, MapPin, QrCode, Lock, AlertCircle, Trash2, ArrowLeft } from 'lucide-react';
import { PermissionGate } from '../../components/permissions/PermissionGate';
import { PageHeader } from '../../components/ui/PageHeader';
import { useHasPermission } from '../../hooks/usePermissions';
import { supabase, fileUploadService, statesService, StateMaster } from '../../lib/supabase';
import { sessionManager } from '../../lib/sessionManager';
import Toast from '../../components/Toast';

interface StatePaymentSettings {
  state: string;
  qr_code_image_url: string;
  account_holder_name: string;
  bank_name: string;
  branch: string;
  account_number: string;
  ifsc_code: string;
  male_fee: number;
  female_fee: number;
  validity_years: number;
  created_at?: string;
  updated_at?: string;
}

const PaymentSettings: React.FC = () => {
  const [paymentSettings, setPaymentSettings] = useState<StatePaymentSettings[]>([]);
  const [allMasterStates, setAllMasterStates] = useState<StateMaster[]>([]);
  const [isLoadingStates, setIsLoadingStates] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [editingState, setEditingState] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [qrCodeFiles, setQrCodeFiles] = useState<{ [key: string]: File }>({});
  const [searchParams] = useSearchParams();
  const [specificStateNotFound, setSpecificStateNotFound] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({
    type: 'success',
    message: '',
    isVisible: false
  });

  // Form state for editing
  const [editForm, setEditForm] = useState<Partial<StatePaymentSettings>>({});
  
  // Form state for adding new state
  const [addForm, setAddForm] = useState<Partial<StatePaymentSettings>>({
    state: '',
    qr_code_image_url: '',
    account_holder_name: '',
    bank_name: '',
    branch: '',
    account_number: '',
    ifsc_code: '',
    male_fee: undefined,
    female_fee: undefined,
    validity_years: undefined
  });

  const canManagePayment = useHasPermission('settings.payment.manage');

  const loadPaymentSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('payment_settings')
        .select('*')
        .order('state');

      if (error) {
        throw error;
      }

      setPaymentSettings(data || []);
    } catch (error) {
      console.error('Error loading payment settings:', error);
      showToast('error', 'Failed to load payment settings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadAllStates = useCallback(async () => {
    try {
      setIsLoadingStates(true);
      const states = await statesService.getAllStates();
      setAllMasterStates(states);
    } catch (error) {
      console.error('Error loading states:', error);
      showToast('error', 'Failed to load states list');
    } finally {
      setIsLoadingStates(false);
    }
  }, []);

  useEffect(() => {
    loadPaymentSettings();
    loadAllStates();
  }, [loadAllStates, loadPaymentSettings]);

  // Handle state parameter from URL after payment settings are loaded
  useEffect(() => {
    if (!isLoading && paymentSettings.length > 0) {
      const stateParam = searchParams.get('state');
      if (stateParam) {
        const matchingState = paymentSettings.find(s => s.state === stateParam);
        if (matchingState) {
          handleEdit(matchingState);
          setSpecificStateNotFound(null);
        } else {
          setSpecificStateNotFound(stateParam);
        }
      } else {
        setSpecificStateNotFound(null);
      }
    }
  }, [isLoading, paymentSettings, searchParams]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  };

  const hideToast = () => {
    setToast(prev => ({ ...prev, isVisible: false }));
  };

  const handleEdit = (settings: StatePaymentSettings) => {
    setEditingState(settings.state);
    setEditForm({ ...settings });
  };

  const handleCancelEdit = () => {
    setEditingState(null);
    setEditForm({});
    setQrCodeFiles({});
  };

  const handleEditInputChange = (field: keyof StatePaymentSettings, value: string | number) => {
    setEditForm(prev => ({
      ...prev,
      [field]: field.includes('fee') || field === 'validity_years' ? Number(value) : value
    }));
  };

  const handleAddInputChange = (field: keyof StatePaymentSettings, value: string | number) => {
    setAddForm(prev => ({
      ...prev,
      [field]: field.includes('fee') || field === 'validity_years' ? Number(value) : value
    }));
  };

  const handleQrCodeFileChange = (state: string, file: File | null) => {
    if (file) {
      setQrCodeFiles(prev => ({ ...prev, [state]: file }));
    } else {
      setQrCodeFiles(prev => {
        const updated = { ...prev };
        delete updated[state];
        return updated;
      });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingState || !editForm.state) return;

    try {
      setIsSaving(true);
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        throw new Error('User session not found. Please log in again.');
      }

      const updatedSettings = { ...editForm };

      // Upload new QR code if selected
      if (qrCodeFiles[editingState]) {
        const fileName = `qr-${editingState}-${Date.now()}.${qrCodeFiles[editingState].name.split('.').pop()}`;
        const qrCodeUrl = await fileUploadService.uploadFile(qrCodeFiles[editingState], fileName, 'qr-codes');
        
        if (qrCodeUrl) {
          updatedSettings.qr_code_image_url = qrCodeUrl;
        } else {
          throw new Error('Failed to upload QR code image');
        }
      }

      const { data, error } = await supabase.rpc('update_payment_settings_with_session', {
        p_session_token: sessionToken,
        p_state: editingState,
        p_updates: updatedSettings
      });

      if (error) {
        throw error;
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to update payment settings');
      }

      showToast('success', `Payment settings for ${editingState} updated successfully`);
      setEditingState(null);
      setEditForm({});
      setQrCodeFiles({});
      await loadPaymentSettings();
    } catch (error) {
      console.error('Error updating payment settings:', error);
      showToast('error', 'Failed to update payment settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSettings = async (state: string) => {
    if (!confirm(`Delete payment settings for "${state}"?`)) {
      return;
    }

    try {
      setIsSaving(true);
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        throw new Error('User session not found. Please log in again.');
      }

      const { data, error } = await supabase.rpc('delete_payment_settings_with_session', {
        p_session_token: sessionToken,
        p_state: state
      });

      if (error) {
        throw error;
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to delete payment settings');
      }

      showToast('success', `Payment settings for ${state} deleted successfully`);
      handleCancelEdit();
      await loadPaymentSettings();
    } catch (error) {
      console.error('Error deleting payment settings:', error);
      showToast('error', 'Failed to delete payment settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNew = async () => {
    if (!addForm.state) {
      showToast('error', 'Please select a state');
      return;
    }

    // Check if state already exists
    const existingState = paymentSettings.find(s => s.state === addForm.state);
    if (existingState) {
      showToast('error', `Payment settings for ${addForm.state} already exist`);
      return;
    }

    try {
      setIsSaving(true);
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        throw new Error('User session not found. Please log in again.');
      }

      const newSettings = { ...addForm };

      // Upload QR code if selected
      if (qrCodeFiles['new']) {
        const fileName = `qr-${addForm.state}-${Date.now()}.${qrCodeFiles['new'].name.split('.').pop()}`;
        const qrCodeUrl = await fileUploadService.uploadFile(qrCodeFiles['new'], fileName, 'qr-codes');
        
        if (qrCodeUrl) {
          newSettings.qr_code_image_url = qrCodeUrl;
        }
      }

      const { data, error } = await supabase.rpc('create_payment_settings_with_session', {
        p_session_token: sessionToken,
        p_payload: newSettings
      });

      if (error) {
        throw error;
      }

      const result = data as { success: boolean; error?: string };
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to add payment settings');
      }

      showToast('success', `Payment settings for ${addForm.state} added successfully`);
      setShowAddModal(false);
      
      // Reset form to blank state
      setAddForm({
        state: '',
        qr_code_image_url: '',
        account_holder_name: '',
        bank_name: '',
        branch: '',
        account_number: '',
        ifsc_code: '',
        male_fee: undefined,
        female_fee: undefined,
        validity_years: undefined
      });
      setQrCodeFiles({});
      await loadPaymentSettings();
    } catch (error) {
      console.error('Error adding payment settings:', error);
      showToast('error', 'Failed to add payment settings');
    } finally {
      setIsSaving(false);
    }
  };

  const getAvailableStatesForAdd = () => {
    const existingStates = paymentSettings.map(s => s.state.toLowerCase().trim());
    return allMasterStates.filter(state => 
      !existingStates.includes(state.state_name.toLowerCase().trim())
    );
  };

  const isAddFormValid = () => {
    return (
      addForm.state &&
      addForm.account_holder_name &&
      addForm.bank_name &&
      addForm.branch &&
      addForm.account_number &&
      addForm.ifsc_code &&
      addForm.male_fee && addForm.male_fee > 0 &&
      addForm.female_fee && addForm.female_fee > 0 &&
      addForm.validity_years && addForm.validity_years > 0
    );
  };

  if (isLoading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading payment settings...</p>
      </div>
    );
  }

  return (
    <PermissionGate
      permission="settings.payment.view"
      fallback={
        <div className="py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
            <Lock className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to view payment settings.</p>
          </div>
        </div>
      }
    >
    <div className="p-6">
    <div className="space-y-6">
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <PageHeader
        title="State Payment Settings"
        subtitle="Manage payment settings for different states"
        actions={
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{paymentSettings.length} total</span>
            {canManagePayment && (
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add New State
              </button>
            )}
          </div>
        }
      />

      <div className="mt-2">
        <Link
          to="/admin/settings"
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Settings Hub
        </Link>
      </div>

      {/* Payment Settings Table */}
      <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        {paymentSettings.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-sm font-medium text-foreground mb-2">No Payment Settings Found</h3>
            <p className="text-muted-foreground mb-4">Add payment settings for your first state</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Payment Settings
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">State</th>
                  <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">Bank Details</th>
                  <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">Fees</th>
                  <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">QR Code</th>
                  <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
              {paymentSettings.map((settings) => (
                <tr key={settings.state} className="hover:bg-muted/50">
                  <td className="whitespace-nowrap">
                    <div className="flex items-center">
                      <MapPin className="w-4 h-4 text-muted-foreground mr-2" />
                      <span className="text-sm font-medium text-foreground">{settings.state}</span>
                    </div>
                  </td>
                  <td className="text-sm text-foreground">
                    {editingState === settings.state ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editForm.account_holder_name || ''}
                          onChange={(e) => handleEditInputChange('account_holder_name', e.target.value)}
                          placeholder="Account Holder Name"
                          className="w-full px-2 py-1 text-sm border border-border rounded focus:ring-1 focus:ring-ring focus:border-ring"
                        />
                        <input
                          type="text"
                          value={editForm.bank_name || ''}
                          onChange={(e) => handleEditInputChange('bank_name', e.target.value)}
                          placeholder="Bank Name"
                          className="w-full px-2 py-1 text-sm border border-border rounded focus:ring-1 focus:ring-ring focus:border-ring"
                        />
                        <input
                          type="text"
                          value={editForm.branch || ''}
                          onChange={(e) => handleEditInputChange('branch', e.target.value)}
                          placeholder="Branch"
                          className="w-full px-2 py-1 text-sm border border-border rounded focus:ring-1 focus:ring-ring focus:border-ring"
                        />
                        <input
                          type="text"
                          value={editForm.account_number || ''}
                          onChange={(e) => handleEditInputChange('account_number', e.target.value)}
                          placeholder="Account Number"
                          className="w-full px-2 py-1 text-sm border border-border rounded focus:ring-1 focus:ring-ring focus:border-ring"
                        />
                        <input
                          type="text"
                          value={editForm.ifsc_code || ''}
                          onChange={(e) => handleEditInputChange('ifsc_code', e.target.value)}
                          placeholder="IFSC Code"
                          className="w-full px-2 py-1 text-sm border border-border rounded focus:ring-1 focus:ring-ring focus:border-ring"
                        />
                      </div>
                    ) : (
                      <div className="text-sm text-foreground">
                        <div className="font-medium">{settings.account_holder_name}</div>
                        <div>{settings.bank_name}</div>
                        <div>{settings.branch}</div>
                        <div>A/c: {settings.account_number}</div>
                        <div>IFSC: {settings.ifsc_code}</div>
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-sm text-foreground">
                    {editingState === settings.state ? (
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-muted-foreground">Male:</span>
                          <input
                            type="number"
                            value={editForm.male_fee || ''}
                            onChange={(e) => handleEditInputChange('male_fee', e.target.value)}
                            className="w-20 px-2 py-1 text-sm border border-border rounded focus:ring-1 focus:ring-ring focus:border-ring"
                          />
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-muted-foreground">Female:</span>
                          <input
                            type="number"
                            value={editForm.female_fee || ''}
                            onChange={(e) => handleEditInputChange('female_fee', e.target.value)}
                            className="w-20 px-2 py-1 text-sm border border-border rounded focus:ring-1 focus:ring-ring focus:border-ring"
                          />
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-muted-foreground">Validity:</span>
                          <input
                            type="number"
                            value={editForm.validity_years || ''}
                            onChange={(e) => handleEditInputChange('validity_years', e.target.value)}
                            className="w-16 px-2 py-1 text-sm border border-border rounded focus:ring-1 focus:ring-ring focus:border-ring"
                          />
                          <span className="text-xs text-muted-foreground">years</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm">
                        <div className="text-foreground">Male: ₹{settings.male_fee.toLocaleString()}</div>
                        <div className="text-foreground">Female: ₹{settings.female_fee.toLocaleString()}</div>
                        <div className="text-muted-foreground">{settings.validity_years} years</div>
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap">
                    {editingState === settings.state ? (
                      <div className="space-y-2">
                        <img 
                          src={editForm.qr_code_image_url || settings.qr_code_image_url} 
                          alt="QR Code" 
                          className="w-16 h-16 object-cover rounded border border-border"
                        />
                        <div className="text-center">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleQrCodeFileChange(settings.state, e.target.files?.[0] || null)}
                            className="hidden"
                            id={`qr-upload-${settings.state}`}
                          />
                          <label
                            htmlFor={`qr-upload-${settings.state}`}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium text-primary bg-primary/10 rounded cursor-pointer hover:bg-primary/20"
                          >
                            <Upload className="w-3 h-3 mr-1" />
                            Upload
                          </label>
                        </div>
                      </div>
                    ) : (
                      <img 
                        src={settings.qr_code_image_url} 
                        alt="QR Code" 
                        className="w-16 h-16 object-cover rounded border border-border"
                      />
                    )}
                  </td>
                  <td className="whitespace-nowrap text-sm font-medium">
                    {editingState === settings.state ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDeleteSettings(settings.state)}
                          disabled={isSaving}
                          className="inline-flex items-center px-3 py-1 text-sm font-medium text-destructive-foreground bg-destructive rounded-md hover:bg-destructive/90 disabled:opacity-50"
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Delete
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          disabled={isSaving}
                          className="inline-flex items-center px-3 py-1 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
                        >
                          <Save className="w-3 h-3 mr-1" />
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          disabled={isSaving}
                          className="inline-flex items-center px-3 py-1 text-sm font-medium text-foreground bg-muted rounded-md hover:bg-muted/80 disabled:opacity-50"
                        >
                          <X className="w-3 h-3 mr-1" />
                          Cancel
                        </button>
                      </div>
                    ) : (
                      canManagePayment && (
                        <button
                          onClick={() => handleEdit(settings)}
                          className="text-primary hover:text-primary/80"
                          title="Edit"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        )}
        {paymentSettings.length > 0 && (
          <div className="bg-muted/50 border-t border-border">
            <p className="text-sm text-muted-foreground px-6 py-4">
              Showing {paymentSettings.length} of {paymentSettings.length} states
            </p>
          </div>
        )}
      </div>

      {/* Specific State Not Found Message */}
      {specificStateNotFound && (
        <div className="bg-muted/50 border border-border rounded-lg p-6 mt-6">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-primary mr-2" />
            <div>
              <h3 className="text-sm font-medium text-foreground">
                Payment Settings Not Found
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                No payment settings found for "{specificStateNotFound}". 
                You can add payment settings for this state using the "Add New State" button above.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add New State Modal */}
      {showAddModal && canManagePayment && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-[1px] flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-lg shadow-sm max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-section font-semibold text-foreground">Add New State Payment Settings</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-6">
                {/* State Selection */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    State <span className="text-destructive">*</span>
                  </label>
                  {isLoadingStates ? (
                    <div className="w-full px-3 py-2 border border-border rounded-lg bg-muted/50 text-muted-foreground">
                      Loading states...
                    </div>
                  ) : (
                    <select
                      value={addForm.state || ''}
                      onChange={(e) => handleAddInputChange('state', e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                    >
                      <option value="">Select State or Union Territory</option>
                      {getAvailableStatesForAdd().length === 0 ? (
                        <option value="" disabled>
                          All states configured
                        </option>
                      ) : (
                        getAvailableStatesForAdd().map(state => (
                          <option key={state.id} value={state.state_name}>
                            {state.state_name}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                </div>

                {/* Bank Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      value={addForm.account_holder_name || ''}
                      onChange={(e) => handleAddInputChange('account_holder_name', e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={addForm.bank_name || ''}
                      onChange={(e) => handleAddInputChange('bank_name', e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Branch
                    </label>
                    <input
                      type="text"
                      value={addForm.branch || ''}
                      onChange={(e) => handleAddInputChange('branch', e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={addForm.account_number || ''}
                      onChange={(e) => handleAddInputChange('account_number', e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-foreground mb-2">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      value={addForm.ifsc_code || ''}
                      onChange={(e) => handleAddInputChange('ifsc_code', e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                    />
                  </div>
                </div>

                {/* Fees */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Male Fee (₹)
                    </label>
                    <input
                      type="number"
                      value={addForm.male_fee || ''}
                      onChange={(e) => handleAddInputChange('male_fee', e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Female Fee (₹)
                    </label>
                    <input
                      type="number"
                      value={addForm.female_fee || ''}
                      onChange={(e) => handleAddInputChange('female_fee', e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Validity (Years)
                    </label>
                    <input
                      type="number"
                      value={addForm.validity_years || ''}
                      onChange={(e) => handleAddInputChange('validity_years', e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring"
                    />
                  </div>
                </div>

                {/* QR Code */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    QR Code
                  </label>
                  <div className="flex items-start space-x-4">
                    {addForm.qr_code_image_url && (
                      <img 
                        src={addForm.qr_code_image_url} 
                        alt="QR Code Preview" 
                        className="w-24 h-24 object-cover rounded border"
                      />
                    )}
                    {!addForm.qr_code_image_url && (
                      <div className="w-24 h-24 border-2 border-dashed border-border rounded flex items-center justify-center">
                        <QrCode className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleQrCodeFileChange('new', e.target.files?.[0] || null)}
                        className="hidden"
                        id="qr-upload-new"
                      />
                      <label
                        htmlFor="qr-upload-new"
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-primary bg-primary/10 rounded-lg cursor-pointer hover:bg-primary/20"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Upload QR Code
                      </label>
                      <p className="text-xs text-muted-foreground mt-2">
                        Upload a QR code image for this state's payments
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 justify-end mt-8 pt-6 border-t border-border">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddNew}
                  disabled={isSaving || !isAddFormValid() || getAvailableStatesForAdd().length === 0}
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSaving ? 'Adding...' : 'Add Payment Settings'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
    </PermissionGate>
  );
};

export default PaymentSettings;

