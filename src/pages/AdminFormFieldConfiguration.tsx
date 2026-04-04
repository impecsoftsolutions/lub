import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Save,
  RotateCcw,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Shield,
  Lock
} from 'lucide-react';
import { formFieldConfigService, FormFieldConfiguration, validationRulesService, ValidationRule } from '../lib/supabase';
import Toast from '../components/Toast';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';

const AdminFormFieldConfiguration: React.FC = () => {
  const canManageFormConfig = useHasPermission('settings.forms.configure');
  const navigate = useNavigate();
  const [fieldConfigs, setFieldConfigs] = useState<Record<string, FormFieldConfiguration[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [availableValidationRules, setAvailableValidationRules] = useState<ValidationRule[]>([]);
  const [isLoadingRules, setIsLoadingRules] = useState(true);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({
    type: 'success',
    message: '',
    isVisible: false
  });

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, isVisible: false }));
  }, []);

  const loadValidationRules = useCallback(async () => {
    try {
      setIsLoadingRules(true);
      const rules = await validationRulesService.getActiveValidationRules();
      setAvailableValidationRules(rules);
    } catch (error) {
      console.error('Error loading validation rules:', error);
      showToast('error', 'Failed to load validation rules');
    } finally {
      setIsLoadingRules(false);
    }
  }, [showToast]);

  const loadFieldConfigurations = useCallback(async () => {
    try {
      setIsLoading(true);
      const configs = await formFieldConfigService.getFieldConfigurationsBySection();
      setFieldConfigs(configs);

      const initialExpandedState: Record<string, boolean> = {};
      Object.keys(configs).forEach(section => {
        initialExpandedState[section] = true;
      });
      setExpandedSections(initialExpandedState);
    } catch (error) {
      console.error('Error loading field configurations:', error);
      showToast('error', 'Failed to load field configurations');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadFieldConfigurations();
    void loadValidationRules();
  }, [loadFieldConfigurations, loadValidationRules]);

  const toggleSection = (sectionName: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }));
  };

  const handleVisibilityToggle = (fieldName: string, sectionName: string) => {
    setFieldConfigs(prev => {
      const updated = { ...prev };
      const section = [...updated[sectionName]];
      const fieldIndex = section.findIndex(f => f.field_name === fieldName);

      if (fieldIndex !== -1) {
        section[fieldIndex] = {
          ...section[fieldIndex],
          is_visible: !section[fieldIndex].is_visible,
          is_required: section[fieldIndex].is_visible ? false : section[fieldIndex].is_required
        };
        updated[sectionName] = section;
      }

      return updated;
    });
    setHasChanges(true);
  };

  const handleRequiredToggle = (fieldName: string, sectionName: string) => {
    setFieldConfigs(prev => {
      const updated = { ...prev };
      const section = [...updated[sectionName]];
      const fieldIndex = section.findIndex(f => f.field_name === fieldName);

      if (fieldIndex !== -1) {
        section[fieldIndex] = {
          ...section[fieldIndex],
          is_required: !section[fieldIndex].is_required
        };
        updated[sectionName] = section;
      }

      return updated;
    });
    setHasChanges(true);
  };

  const handleValidationRuleChange = (fieldName: string, sectionName: string, validationRuleId: string | null) => {
    setFieldConfigs(prev => {
      const updated = { ...prev };
      const section = [...updated[sectionName]];
      const fieldIndex = section.findIndex(f => f.field_name === fieldName);

      if (fieldIndex !== -1) {
        const selectedRule = validationRuleId
          ? availableValidationRules.find(r => r.id === validationRuleId) || null
          : null;

        section[fieldIndex] = {
          ...section[fieldIndex],
          validation_rule_id: validationRuleId,
          validation_rule: selectedRule
        };
        updated[sectionName] = section;
      }

      return updated;
    });
    setHasChanges(true);
  };

  const handleSaveChanges = async () => {
    console.log('[handleSaveChanges] Save button clicked');
    console.log('[handleSaveChanges] hasChanges:', hasChanges);
    console.log('[handleSaveChanges] isSaving:', isSaving);

    try {
      setIsSaving(true);

      const allFields = Object.values(fieldConfigs).flat();
      console.log('[handleSaveChanges] Updating', allFields.length, 'fields');

      for (const field of allFields) {
        console.log('[handleSaveChanges] Updating field:', field.field_name);
        const result = await formFieldConfigService.updateFieldConfiguration(
          field.field_name,
          {
            is_visible: field.is_visible,
            is_required: field.is_required,
            validation_rule_id: field.validation_rule_id
          }
        );
        console.log('[handleSaveChanges] Result for', field.field_name, ':', result);
      }

      showToast('success', 'Configuration saved successfully');
      setHasChanges(false);
      await loadFieldConfigurations();
    } catch (error) {
      console.error('[handleSaveChanges] Error saving changes:', error);
      showToast('error', 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefaults = async () => {
    if (!confirm('Are you sure you want to reset all fields to default settings? This will make all fields visible.')) {
      return;
    }

    try {
      setIsSaving(true);
      const result = await formFieldConfigService.resetToDefaults();

      if (result.success) {
        showToast('success', 'Configuration reset to defaults');
        setHasChanges(false);
        await loadFieldConfigurations();
      } else {
        showToast('error', result.error || 'Failed to reset configuration');
      }
    } catch (error) {
      console.error('Error resetting to defaults:', error);
      showToast('error', 'Failed to reset configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const getSectionStats = (sectionName: string) => {
    const fields = fieldConfigs[sectionName] || [];
    const visibleCount = fields.filter(f => f.is_visible).length;
    const requiredCount = fields.filter(f => f.is_required && f.is_visible).length;
    return { total: fields.length, visible: visibleCount, required: requiredCount };
  };

  const getTotalStats = () => {
    const allFields = Object.values(fieldConfigs).flat();
    const visibleCount = allFields.filter(f => f.is_visible).length;
    const requiredCount = allFields.filter(f => f.is_required && f.is_visible).length;
    return { total: allFields.length, visible: visibleCount, required: requiredCount };
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Loading configuration...</span>
          </div>
        </div>
      </div>
    );
  }

  const totalStats = getTotalStats();

  return (
    <PermissionGate
      permission="settings.forms.view"
      fallback={
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <Lock className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to view form field configuration.</p>
          </div>
        </div>
      }
    >
      <div className="p-8">
      <Toast
        type={toast.type}
        message={toast.message}
        isVisible={toast.isVisible}
        onClose={hideToast}
      />

      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate('/admin/settings/forms')}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Form Configuration
          </button>
        </div>

        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">Join LUB Form - Field Configuration</h1>
              <p className="text-muted-foreground mt-2">Configure which fields appear in the member registration form</p>
            </div>

            <div className="text-right">
              <div className="text-sm text-muted-foreground">Total Statistics</div>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-sm font-medium text-foreground">
                  {totalStats.visible} of {totalStats.total} visible
                </span>
                <span className="text-sm font-medium text-foreground">
                  {totalStats.required} required
                </span>
              </div>
            </div>
          </div>
        </div>

        {hasChanges && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start">
            <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-yellow-800 text-sm font-medium">You have unsaved changes</p>
              <p className="text-yellow-700 text-sm mt-1">Click "Save Changes" to apply your configuration updates</p>
            </div>
          </div>
        )}

        <div className="bg-card rounded-lg shadow-md mb-6">
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-section font-semibold text-foreground">Configuration Actions</h2>
                <p className="text-sm text-muted-foreground mt-1">Save your changes or reset to defaults</p>
              </div>
              {canManageFormConfig && (
                <div className="flex gap-3">
                  <button
                    onClick={handleResetToDefaults}
                    disabled={isSaving}
                    className="inline-flex items-center px-4 py-2 border border-border rounded-lg text-foreground bg-card hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset to Defaults
                  </button>
                  <button
                    onClick={handleSaveChanges}
                    disabled={isSaving || !hasChanges}
                    className="inline-flex items-center px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {Object.entries(fieldConfigs).map(([sectionName, fields]) => {
            const stats = getSectionStats(sectionName);
            const isExpanded = expandedSections[sectionName];

            return (
              <div key={sectionName} className="bg-card rounded-lg shadow-md overflow-hidden">
                <button
                  onClick={() => toggleSection(sectionName)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/30 transition-colors duration-200"
                >
                  <div className="flex items-center gap-4">
                    <div>
                      <h3 className="text-section font-semibold text-foreground text-left">{sectionName}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {stats.visible} of {stats.total} visible · {stats.required} required
                      </p>
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-border">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-6 py-3 text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                            Field
                          </th>
                          <th className="px-6 py-3 text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                            Database Column
                          </th>
                          <th className="px-6 py-3 text-left text-label font-medium text-muted-foreground uppercase tracking-wider">
                            Validation Rule
                          </th>
                          <th className="px-6 py-3 text-center text-label font-medium text-muted-foreground uppercase tracking-wider">
                            Visible
                          </th>
                          <th className="px-6 py-3 text-center text-label font-medium text-muted-foreground uppercase tracking-wider">
                            Required
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {fields.map((field) => (
                          <tr key={field.field_name} className="hover:bg-muted/30">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-foreground">{field.field_label}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                                {field.field_name}
                              </code>
                            </td>
                            <td className="px-6 py-4">
                              <select
                                value={field.validation_rule_id || ''}
                                onChange={(e) => handleValidationRuleChange(
                                  field.field_name,
                                  sectionName,
                                  e.target.value || null
                                )}
                                className="w-full text-sm border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                                disabled={isLoadingRules || !canManageFormConfig}
                              >
                                <option value="">No Validation</option>
                                {availableValidationRules.map(rule => (
                                  <option key={rule.id} value={rule.id} title={rule.description}>
                                    {rule.rule_name} ({rule.category})
                                  </option>
                                ))}
                              </select>
                              {field.validation_rule && (
                                <div className="flex items-start gap-1 mt-1">
                                  <Shield className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
                                  <p className="text-xs text-muted-foreground">{field.validation_rule.description}</p>
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              {canManageFormConfig ? (
                                <button
                                  onClick={() => handleVisibilityToggle(field.field_name, sectionName)}
                                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors duration-200 ${
                                    field.is_visible
                                      ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                  }`}
                                >
                                  {field.is_visible ? (
                                    <>
                                      <Eye className="w-3 h-3 mr-1" />
                                      Visible
                                    </>
                                  ) : (
                                    <>
                                      <EyeOff className="w-3 h-3 mr-1" />
                                      Hidden
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                  field.is_visible
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-muted text-muted-foreground'
                                }`}>
                                  {field.is_visible ? (
                                    <>
                                      <Eye className="w-3 h-3 mr-1" />
                                      Visible
                                    </>
                                  ) : (
                                    <>
                                      <EyeOff className="w-3 h-3 mr-1" />
                                      Hidden
                                    </>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              {canManageFormConfig ? (
                                <button
                                  onClick={() => handleRequiredToggle(field.field_name, sectionName)}
                                  disabled={!field.is_visible}
                                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors duration-200 ${
                                    !field.is_visible
                                      ? 'bg-muted text-muted-foreground cursor-not-allowed'
                                      : field.is_required
                                      ? 'bg-red-100 text-red-800 hover:bg-red-200'
                                      : 'bg-primary/10 text-primary hover:bg-primary/20'
                                  }`}
                                >
                                  {field.is_required ? (
                                    <>
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      Required
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="w-3 h-3 mr-1" />
                                      Optional
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                                  !field.is_visible
                                    ? 'bg-muted text-muted-foreground'
                                    : field.is_required
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-primary/10 text-primary'
                                }`}>
                                  {field.is_required ? (
                                    <>
                                      <CheckCircle className="w-3 h-3 mr-1" />
                                      Required
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="w-3 h-3 mr-1" />
                                      Optional
                                    </>
                                  )}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
    </PermissionGate>
  );
};

export default AdminFormFieldConfiguration;
