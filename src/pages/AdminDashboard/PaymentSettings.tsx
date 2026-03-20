import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, CreditCard as Edit3, Save, X, Upload, MapPin, QrCode, Lock, AlertCircle } from 'lucide-react';
import { PermissionGate } from '../../components/permissions/PermissionGate';
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading payment settings...</p>
      </div>
    );
  }

  return (
    <PermissionGate
      permission="settings.payment.view"
      fallback={
        <div className="min-h-screen bg-gray-50 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
            <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You don't have permission to view payment settings.</p>
          </div>
        </div>
      }
    >
    <div className="space-y-6">
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center">
            <MapPin className="w-6 h-6 mr-2 text-blue-600" />
            State Payment Settings
          </h2>
          <p className="text-gray-600 mt-1">Manage payment settings for different states</p>
        </div>
        {canManagePayment && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add New State
          </button>
        )}
      </div>

      {/* Payment Settings Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {paymentSettings.length === 0 ? (
          <div className="text-center py-12">
            <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Payment Settings Found</h3>
            <p className="text-gray-600 mb-4">Add payment settings for your first state</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Payment Settings
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    State
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bank Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fees
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    QR Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paymentSettings.map((settings) => (
                  <tr key={settings.state} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <MapPin className="w-4 h-4 text-gray-400 mr-2" />
                        <span className="font-medium text-gray-900">{settings.state}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {editingState === settings.state ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editForm.account_holder_name || ''}
                            onChange={(e) => handleEditInputChange('account_holder_name', e.target.value)}
                            placeholder="Account Holder Name"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <input
                            type="text"
                            value={editForm.bank_name || ''}
                            onChange={(e) => handleEditInputChange('bank_name', e.target.value)}
                            placeholder="Bank Name"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <input
                            type="text"
                            value={editForm.branch || ''}
                            onChange={(e) => handleEditInputChange('branch', e.target.value)}
                            placeholder="Branch"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <input
                            type="text"
                            value={editForm.account_number || ''}
                            onChange={(e) => handleEditInputChange('account_number', e.target.value)}
                            placeholder="Account Number"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <input
                            type="text"
                            value={editForm.ifsc_code || ''}
                            onChange={(e) => handleEditInputChange('ifsc_code', e.target.value)}
                            placeholder="IFSC Code"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      ) : (
                        <div className="text-sm text-gray-900">
                          <div className="font-medium">{settings.account_holder_name}</div>
                          <div className="text-gray-600">{settings.bank_name}</div>
                          <div className="text-gray-600">{settings.branch}</div>
                          <div className="text-gray-600">A/c: {settings.account_number}</div>
                          <div className="text-gray-600">IFSC: {settings.ifsc_code}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingState === settings.state ? (
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500">Male:</span>
                            <input
                              type="number"
                              value={editForm.male_fee || ''}
                              onChange={(e) => handleEditInputChange('male_fee', e.target.value)}
                              className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500">Female:</span>
                            <input
                              type="number"
                              value={editForm.female_fee || ''}
                              onChange={(e) => handleEditInputChange('female_fee', e.target.value)}
                              className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-500">Validity:</span>
                            <input
                              type="number"
                              value={editForm.validity_years || ''}
                              onChange={(e) => handleEditInputChange('validity_years', e.target.value)}
                              className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            />
                            <span className="text-xs text-gray-500">years</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm">
                          <div className="text-gray-900">Male: ₹{settings.male_fee.toLocaleString()}</div>
                          <div className="text-gray-900">Female: ₹{settings.female_fee.toLocaleString()}</div>
                          <div className="text-gray-600">{settings.validity_years} years</div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingState === settings.state ? (
                        <div className="space-y-2">
                          <img 
                            src={editForm.qr_code_image_url || settings.qr_code_image_url} 
                            alt="QR Code" 
                            className="w-16 h-16 object-cover rounded border"
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
                              className="inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded cursor-pointer hover:bg-blue-100"
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
                          className="w-16 h-16 object-cover rounded border"
                        />
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {editingState === settings.state ? (
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={handleSaveEdit}
                            disabled={isSaving}
                            className="inline-flex items-center px-3 py-1 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                          >
                            <Save className="w-3 h-3 mr-1" />
                            {isSaving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            disabled={isSaving}
                            className="inline-flex items-center px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
                          >
                            <X className="w-3 h-3 mr-1" />
                            Cancel
                          </button>
                        </div>
                      ) : (
                        canManagePayment && (
                          <button
                            onClick={() => handleEdit(settings)}
                            className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100"
                          >
                            <Edit3 className="w-3 h-3 mr-1" />
                            Edit
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
      </div>

      {/* Specific State Not Found Message */}
      {specificStateNotFound && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mt-6">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-yellow-600 mr-2" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">
                Payment Settings Not Found
              </h3>
              <p className="text-sm text-yellow-700 mt-1">
                No payment settings found for "{specificStateNotFound}". 
                You can add payment settings for this state using the "Add New State" button above.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add New State Modal */}
      {showAddModal && canManagePayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">Add New State Payment Settings</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-6">
                {/* State Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    State <span className="text-red-500">*</span>
                  </label>
                  {isLoadingStates ? (
                    <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                      Loading states...
                    </div>
                  ) : (
                    <select
                      value={addForm.state || ''}
                      onChange={(e) => handleAddInputChange('state', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      value={addForm.account_holder_name || ''}
                      onChange={(e) => handleAddInputChange('account_holder_name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={addForm.bank_name || ''}
                      onChange={(e) => handleAddInputChange('bank_name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Branch
                    </label>
                    <input
                      type="text"
                      value={addForm.branch || ''}
                      onChange={(e) => handleAddInputChange('branch', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={addForm.account_number || ''}
                      onChange={(e) => handleAddInputChange('account_number', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      value={addForm.ifsc_code || ''}
                      onChange={(e) => handleAddInputChange('ifsc_code', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Fees */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Male Fee (₹)
                    </label>
                    <input
                      type="number"
                      value={addForm.male_fee || ''}
                      onChange={(e) => handleAddInputChange('male_fee', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Female Fee (₹)
                    </label>
                    <input
                      type="number"
                      value={addForm.female_fee || ''}
                      onChange={(e) => handleAddInputChange('female_fee', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Validity (Years)
                    </label>
                    <input
                      type="number"
                      value={addForm.validity_years || ''}
                      onChange={(e) => handleAddInputChange('validity_years', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* QR Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                      <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded flex items-center justify-center">
                        <QrCode className="w-8 h-8 text-gray-400" />
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
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg cursor-pointer hover:bg-blue-100"
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Upload QR Code
                      </label>
                      <p className="text-xs text-gray-500 mt-2">
                        Upload a QR code image for this state's payments
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 justify-end mt-8 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddNew}
                  disabled={isSaving || !isAddFormValid() || getAvailableStatesForAdd().length === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSaving ? 'Adding...' : 'Add Payment Settings'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </PermissionGate>
  );
};

export default PaymentSettings;
