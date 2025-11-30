import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Save,
  AlertCircle,
  CheckCircle,
  Lock
} from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import { directoryVisibilityService, DirectoryFieldVisibility } from '../lib/supabase';

const AdminDirectoryVisibility: React.FC = () => {
  const [fieldSettings, setFieldSettings] = useState<DirectoryFieldVisibility[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();

  // Permission checks
  const canViewSettings = useHasPermission('settings.directory.view');
  const canConfigureSettings = useHasPermission('settings.directory.configure');

  useEffect(() => {
    loadFieldSettings();
  }, []);

  const loadFieldSettings = async () => {
    try {
      setIsLoading(true);
      const settings = await directoryVisibilityService.getAllFieldSettings();
      setFieldSettings(settings);
    } catch (error) {
      console.error('Error loading field settings:', error);
      setErrorMessage('Failed to load field visibility settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = (fieldName: string, type: 'public' | 'members') => {
    setFieldSettings(prev =>
      prev.map(field => {
        if (field.field_name === fieldName) {
          if (type === 'public') {
            return { ...field, show_to_public: !field.show_to_public };
          } else {
            return { ...field, show_to_members: !field.show_to_members };
          }
        }
        return field;
      })
    );
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setErrorMessage('');
      setSuccessMessage('');

      const updates = fieldSettings.map(field => ({
        field_name: field.field_name,
        show_to_public: field.show_to_public,
        show_to_members: field.show_to_members
      }));

      const result = await directoryVisibilityService.updateMultipleFieldVisibilities(updates);

      if (result.success) {
        setSuccessMessage('Visibility settings saved successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setErrorMessage(result.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving field settings:', error);
      setErrorMessage('An unexpected error occurred while saving');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <PermissionGate
      permission="settings.directory.view"
      fallback={
        <div className="min-h-screen bg-gray-50 py-8">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
            <Lock className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">You don't have permission to view directory settings.</p>
          </div>
        </div>
      }
    >
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Back Button */}
        <div className="mb-6">
        </div>

        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Directory Field Visibility Settings
              </h1>
              <p className="text-gray-600">
                Control which member information is visible to public visitors and logged-in members in the directory
              </p>
            </div>
            <Eye className="w-12 h-12 text-blue-600" />
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-1">How visibility works:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Public Visitors:</strong> Can see fields marked "Show to Public Visitors" when they expand member details</li>
                <li><strong>Logged-in Members:</strong> Can see fields marked "Show to Logged-in Members" when they expand member details</li>
                <li><strong>Admins:</strong> Always see all fields regardless of these settings</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Success/Error Messages */}
        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
              <p className="text-green-900 font-medium">{successMessage}</p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
              <p className="text-red-900 font-medium">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Field Settings Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading visibility settings...</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                        Field Name
                      </th>
                      <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                        <div className="flex items-center justify-center">
                          <Eye className="w-4 h-4 mr-2" />
                          Show to Public Visitors
                        </div>
                      </th>
                      <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                        <div className="flex items-center justify-center">
                          <Eye className="w-4 h-4 mr-2" />
                          Show to Logged-in Members
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {fieldSettings.map((field) => (
                      <tr key={field.field_name} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-gray-900">{field.field_label}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{field.field_name}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => canConfigureSettings && handleToggle(field.field_name, 'public')}
                            disabled={!canConfigureSettings}
                            className={`inline-flex items-center justify-center w-12 h-6 rounded-full transition-colors ${
                              field.show_to_public
                                ? 'bg-green-500 hover:bg-green-600'
                                : 'bg-gray-300 hover:bg-gray-400'
                            } ${!canConfigureSettings ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <span
                              className={`block w-4 h-4 bg-white rounded-full transition-transform ${
                                field.show_to_public ? 'translate-x-3' : '-translate-x-3'
                              }`}
                            />
                          </button>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => canConfigureSettings && handleToggle(field.field_name, 'members')}
                            disabled={!canConfigureSettings}
                            className={`inline-flex items-center justify-center w-12 h-6 rounded-full transition-colors ${
                              field.show_to_members
                                ? 'bg-green-500 hover:bg-green-600'
                                : 'bg-gray-300 hover:bg-gray-400'
                            } ${!canConfigureSettings ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <span
                              className={`block w-4 h-4 bg-white rounded-full transition-transform ${
                                field.show_to_members ? 'translate-x-3' : '-translate-x-3'
                              }`}
                            />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Save Button */}
              <div className="bg-gray-50 border-t border-gray-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    Changes will take effect immediately after saving
                  </p>
                  {canConfigureSettings ? (
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {isSaving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-2" />
                          Save Changes
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="text-sm text-gray-500 flex items-center">
                      <Lock className="w-4 h-4 mr-1" />
                      You don't have permission to save changes
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    </PermissionGate>
  );
};

export default AdminDirectoryVisibility;
