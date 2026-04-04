import React, { useState, useEffect } from 'react';
import {
  Eye,
  Save,
  AlertCircle,
  CheckCircle,
  Lock
} from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { PageHeader } from '../components/ui/PageHeader';
import { useHasPermission } from '../hooks/usePermissions';
import { directoryVisibilityService, DirectoryFieldVisibility } from '../lib/supabase';

const AdminDirectoryVisibility: React.FC = () => {
  const [fieldSettings, setFieldSettings] = useState<DirectoryFieldVisibility[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

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
        <div className="py-8">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
            <Lock className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to view directory settings.</p>
          </div>
        </div>
      }
    >
    <div className="p-6">
      <div>
        <PageHeader
          title="Directory Field Visibility Settings"
          subtitle="Control which member information is visible to public visitors and logged-in members"
        />

        {/* Info Box */}
        <div className="bg-primary/5 border border-border rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-primary mr-3 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-foreground">
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
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <CheckCircle className="w-5 h-5 text-primary mr-3" />
              <p className="text-primary font-medium">{successMessage}</p>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-destructive mr-3" />
              <p className="text-destructive font-medium">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Field Settings Table */}
        <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading visibility settings...</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-6 py-4 text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                        Field Name
                      </th>
                      <th className="px-6 py-4 text-center text-label font-medium text-muted-foreground uppercase tracking-wider">
                        <div className="flex items-center justify-center">
                          <Eye className="w-4 h-4 mr-2" />
                          Show to Public Visitors
                        </div>
                      </th>
                      <th className="px-6 py-4 text-center text-label font-medium text-muted-foreground uppercase tracking-wider">
                        <div className="flex items-center justify-center">
                          <Eye className="w-4 h-4 mr-2" />
                          Show to Logged-in Members
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {fieldSettings.map((field) => (
                      <tr key={field.field_name} className="hover:bg-muted/30">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-foreground">{field.field_label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{field.field_name}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => canConfigureSettings && handleToggle(field.field_name, 'public')}
                            disabled={!canConfigureSettings}
                            className={`inline-flex items-center justify-center w-12 h-6 rounded-full transition-colors ${
                              field.show_to_public
                                ? 'bg-primary hover:bg-primary/90'
                                : 'bg-muted hover:bg-muted/80'
                            } ${!canConfigureSettings ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <span
                              className={`block w-4 h-4 bg-background rounded-full transition-transform ${
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
                                ? 'bg-primary hover:bg-primary/90'
                                : 'bg-muted hover:bg-muted/80'
                            } ${!canConfigureSettings ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <span
                              className={`block w-4 h-4 bg-background rounded-full transition-transform ${
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
              <div className="bg-muted/50 border-t border-border px-6 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Changes will take effect immediately after saving
                  </p>
                  {canConfigureSettings ? (
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-background mr-2"></div>
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
                    <div className="text-sm text-muted-foreground flex items-center">
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
