import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Plus,
  Save,
  Unlink,
  XCircle
} from 'lucide-react';
import {
  formBuilderV21Service,
  fieldLibraryV2Service,
  FormBuilderSchemaV2,
  FormBuilderSchemaFieldV2,
  FieldLibraryItemV2
} from '../lib/supabase';
import Toast from '../components/Toast';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';

// --- Preview rendering ---

function PreviewField({ field }: { field: FormBuilderSchemaFieldV2 }) {
  const base = 'w-full px-3 py-2 border border-border rounded-lg bg-muted/30 text-muted-foreground text-sm cursor-not-allowed';

  const control = (() => {
    switch (field.field_type) {
      case 'textarea':
        return <textarea className={base} placeholder={field.placeholder || ''} disabled rows={3} />;
      case 'select':
        return (
          <select className={base} disabled>
            <option value="">{field.placeholder || 'Select…'}</option>
            {(field.option_items || []).map(opt => <option key={opt}>{opt}</option>)}
          </select>
        );
      case 'checkbox':
        return (
          <label className="flex items-center gap-2 cursor-not-allowed">
            <input type="checkbox" disabled className="rounded border-border" />
            <span className="text-sm text-muted-foreground">{field.label}</span>
          </label>
        );
      default:
        return (
          <input
            type={field.field_type}
            className={base}
            placeholder={field.placeholder || ''}
            disabled
          />
        );
    }
  })();

  if (field.field_type === 'checkbox') return <div className="mb-3">{control}</div>;

  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-foreground mb-1">
        {field.label}
        {field.is_required && <span className="text-destructive ml-1">*</span>}
      </label>
      {control}
      {field.help_text && (
        <p className="text-xs text-muted-foreground mt-1">{field.help_text}</p>
      )}
    </div>
  );
}

// --- Main component ---

const AdminFormEditorV2: React.FC = () => {
  const { formKey } = useParams<{ formKey: string }>();
  const navigate = useNavigate();
  const canManage = useHasPermission('settings.forms.configure');

  const [schema, setSchema] = useState<FormBuilderSchemaV2 | null>(null);
  const [localFields, setLocalFields] = useState<FormBuilderSchemaFieldV2[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const [showAttachPanel, setShowAttachPanel] = useState(false);
  const [libraryItems, setLibraryItems] = useState<FieldLibraryItemV2[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [selectedAttachKey, setSelectedAttachKey] = useState('');
  const [isAttaching, setIsAttaching] = useState(false);
  const [detachingKey, setDetachingKey] = useState<string | null>(null);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string; isVisible: boolean }>({
    type: 'success', message: '', isVisible: false
  });

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, isVisible: false }));
  }, []);

  const loadSchema = useCallback(async () => {
    if (!formKey) return;
    setIsLoading(true);
    const result = await formBuilderV21Service.getFormSchema(formKey);
    if (result.success && result.data) {
      setSchema(result.data);
      const sorted = [...result.data.fields].sort((a, b) => a.display_order - b.display_order);
      setLocalFields(sorted);
      const sectionState: Record<string, boolean> = {};
      sorted.forEach(f => { sectionState[f.section_name] = true; });
      setExpandedSections(sectionState);
      setNotFound(false);
    } else if (result.error === 'Form not found') {
      setNotFound(true);
    } else {
      showToast('error', result.error || 'Failed to load form schema');
    }
    setIsLoading(false);
  }, [formKey, showToast]);

  useEffect(() => { void loadSchema(); }, [loadSchema]);

  const loadLibrary = useCallback(async () => {
    setIsLoadingLibrary(true);
    const result = await fieldLibraryV2Service.listItems();
    if (result.success && result.data) {
      setLibraryItems(result.data.filter(item => !item.is_archived));
    } else {
      showToast('error', result.error || 'Failed to load field library');
    }
    setIsLoadingLibrary(false);
  }, [showToast]);

  const handleOpenAttach = useCallback(async () => {
    setShowAttachPanel(true);
    if (libraryItems.length === 0) await loadLibrary();
  }, [libraryItems.length, loadLibrary]);

  const attachedKeys = useMemo(() => new Set(localFields.map(f => f.field_key)), [localFields]);

  const availableLibraryItems = useMemo(
    () => libraryItems.filter(item => !attachedKeys.has(item.field_key)),
    [libraryItems, attachedKeys]
  );

  const handleAttach = async () => {
    if (!formKey || !selectedAttachKey) return;
    setIsAttaching(true);
    const result = await formBuilderV21Service.attachField({
      form_key: formKey,
      field_key: selectedAttachKey,
      is_visible: true,
      is_required: false
    });
    if (result.success) {
      showToast('success', 'Field attached');
      setSelectedAttachKey('');
      setShowAttachPanel(false);
      setHasChanges(false);
      await loadSchema();
    } else {
      showToast('error', result.error || 'Failed to attach field');
    }
    setIsAttaching(false);
  };

  const handleDetach = async (fieldKey: string) => {
    if (!formKey) return;
    if (!confirm('Detach this field from the form?')) return;
    setDetachingKey(fieldKey);
    const result = await formBuilderV21Service.detachField(formKey, fieldKey);
    if (result.success) {
      showToast('success', 'Field detached');
      await loadSchema();
    } else {
      showToast('error', result.error || 'Failed to detach field');
    }
    setDetachingKey(null);
  };

  const updateField = (fieldKey: string, patch: Partial<Pick<FormBuilderSchemaFieldV2, 'is_visible' | 'is_required'>>) => {
    setLocalFields(prev => prev.map(f => {
      if (f.field_key !== fieldKey) return f;
      const updated = { ...f, ...patch };
      if (patch.is_visible === false) updated.is_required = false;
      return updated;
    }));
    setHasChanges(true);
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    setLocalFields(prev => {
      const next = [...prev];
      const swap = direction === 'up' ? index - 1 : index + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!formKey) return;
    setIsSaving(true);
    const payload = localFields.map((f, i) => ({
      field_key: f.field_key,
      is_visible: f.is_visible,
      is_required: f.is_required,
      display_order: i
    }));
    const result = await formBuilderV21Service.saveFieldSettings(formKey, payload);
    if (result.success) {
      showToast('success', 'Settings saved');
      setHasChanges(false);
      await loadSchema();
    } else {
      showToast('error', result.error || 'Failed to save settings');
    }
    setIsSaving(false);
  };

  const toggleSection = (name: string) => {
    setExpandedSections(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const sectionedFields = useMemo(() => {
    return localFields.reduce<Record<string, { field: FormBuilderSchemaFieldV2; index: number }[]>>((acc, field, index) => {
      if (!acc[field.section_name]) acc[field.section_name] = [];
      acc[field.section_name].push({ field, index });
      return acc;
    }, {});
  }, [localFields]);

  const previewFields = useMemo(
    () => localFields.filter(f => f.is_visible),
    [localFields]
  );

  const previewSections = useMemo(() => {
    return previewFields.reduce<Record<string, FormBuilderSchemaFieldV2[]>>((acc, f) => {
      if (!acc[f.section_name]) acc[f.section_name] = [];
      acc[f.section_name].push(f);
      return acc;
    }, {});
  }, [previewFields]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading form schema…</span>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="text-center">
        <h2 className="text-xl font-semibold text-foreground mb-2">Form not found</h2>
        <p className="text-muted-foreground mb-4">No form exists with key <code className="bg-muted px-2 py-1 rounded">{formKey}</code>.</p>
        <button
          type="button"
          onClick={() => navigate('/admin/settings/forms/builder')}
          className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Form Builder
        </button>
      </div>
    );
  }

  return (
    <PermissionGate
      permission="settings.forms.view"
      fallback={
        <div className="flex items-center justify-center text-center">
          <div>
            <Lock className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to view form editor.</p>
          </div>
        </div>
      }
    >
      <div>
        <Toast type={toast.type} message={toast.message} isVisible={toast.isVisible} onClose={hideToast} />

        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <Link
            to="/admin/settings/forms/builder"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Form Builder
          </Link>
          {schema && (
            <div className="flex items-center gap-2">
              <span className="text-foreground font-semibold">{schema.form.form_name}</span>
              <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">{schema.form.form_key}</code>
              {!schema.form.is_active && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">Archived</span>
              )}
            </div>
          )}
        </div>

        {hasChanges && (
          <div className="mb-4 p-3 bg-muted/50 border border-border rounded-lg flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <p className="text-sm text-foreground">Unsaved changes — click Save Settings to apply.</p>
          </div>
        )}

        <div className="flex gap-6 items-start">

          {/* === LEFT PANE: Field Configuration === */}
          <div className="flex-1 min-w-0">
            <div className="bg-card rounded-lg shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h2 className="text-section font-semibold text-foreground">Fields</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{localFields.length} field(s) attached</p>
                </div>
                <div className="flex gap-2">
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={handleOpenAttach}
                        className="inline-flex items-center px-3 py-2 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-muted/30 transition-colors"
                      >
                        <Plus className="w-4 h-4 mr-1.5" />
                        Attach Field
                      </button>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={isSaving || !hasChanges}
                        className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        {isSaving
                          ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                          : <Save className="w-4 h-4 mr-1.5" />
                        }
                        Save Settings
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Attach panel */}
              {showAttachPanel && canManage && (
                <div className="px-6 py-4 border-b border-dashed border-border bg-muted/20">
                  <h3 className="text-sm font-semibold text-foreground mb-3">Attach Field from Library</h3>
                  {isLoadingLibrary ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading library…
                    </div>
                  ) : availableLibraryItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No available library fields. All library fields are already attached or the library is empty.</p>
                  ) : (
                    <div className="flex gap-3">
                      <select
                        value={selectedAttachKey}
                        onChange={e => setSelectedAttachKey(e.target.value)}
                        className="flex-1 px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring bg-background text-foreground text-sm"
                      >
                        <option value="">Select a field…</option>
                        {availableLibraryItems.map(item => (
                          <option key={item.field_key} value={item.field_key}>
                            {item.label} ({item.field_key}) — {item.field_type}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAttach}
                        disabled={isAttaching || !selectedAttachKey}
                        className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                      >
                        {isAttaching ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
                        Attach
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAttachPanel(false)}
                        className="px-3 py-2 border border-border rounded-lg text-foreground bg-card hover:bg-muted/50 transition-colors text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Field sections */}
              {localFields.length === 0 ? (
                <div className="px-6 py-12 text-center text-muted-foreground text-sm">
                  No fields attached. Use "Attach Field" to add fields from the library.
                </div>
              ) : (
                <div>
                  {Object.entries(sectionedFields).map(([sectionName, entries]) => (
                    <div key={sectionName}>
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionName)}
                        className="w-full px-6 py-3 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors border-t border-border"
                      >
                        <span className="text-sm font-semibold text-foreground">{sectionName}</span>
                        {expandedSections[sectionName]
                          ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        }
                      </button>
                      {expandedSections[sectionName] && (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-muted/20">
                              <tr>
                                <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider px-4 py-2">Field</th>
                                <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Type</th>
                                <th className="text-center text-label font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Visible</th>
                                <th className="text-center text-label font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Required</th>
                                {canManage && (
                                  <th className="text-center text-label font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Order</th>
                                )}
                                {canManage && (
                                  <th className="text-center text-label font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Detach</th>
                                )}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {entries.map(({ field, index }) => (
                                <tr key={field.field_key} className="hover:bg-muted/20">
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm font-medium text-foreground">{field.label}</span>
                                      {field.is_locked && <Lock className="w-3 h-3 text-muted-foreground" />}
                                    </div>
                                    <code className="text-xs text-muted-foreground">{field.field_key}</code>
                                  </td>
                                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{field.field_type}</td>
                                  <td className="px-3 py-3 text-center">
                                    {canManage && !field.is_locked ? (
                                      <button
                                        type="button"
                                        onClick={() => updateField(field.field_key, { is_visible: !field.is_visible })}
                                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                                          field.is_visible
                                            ? 'bg-primary/10 text-primary hover:bg-primary/20'
                                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                                        }`}
                                      >
                                        {field.is_visible ? <><Eye className="w-3 h-3 mr-1" />Yes</> : <><EyeOff className="w-3 h-3 mr-1" />No</>}
                                      </button>
                                    ) : (
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${field.is_visible ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                                        {field.is_visible ? <><Eye className="w-3 h-3 mr-1" />Yes</> : <><EyeOff className="w-3 h-3 mr-1" />No</>}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-center">
                                    {canManage && !field.is_locked ? (
                                      <button
                                        type="button"
                                        onClick={() => updateField(field.field_key, { is_required: !field.is_required })}
                                        disabled={!field.is_visible}
                                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                                          !field.is_visible
                                            ? 'bg-muted text-muted-foreground cursor-not-allowed'
                                            : field.is_required
                                            ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                                            : 'bg-primary/10 text-primary hover:bg-primary/20'
                                        }`}
                                      >
                                        {field.is_required ? <><CheckCircle className="w-3 h-3 mr-1" />Yes</> : <><XCircle className="w-3 h-3 mr-1" />No</>}
                                      </button>
                                    ) : (
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                        !field.is_visible ? 'bg-muted text-muted-foreground' : field.is_required ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                                      }`}>
                                        {field.is_required ? <><CheckCircle className="w-3 h-3 mr-1" />Yes</> : <><XCircle className="w-3 h-3 mr-1" />No</>}
                                      </span>
                                    )}
                                  </td>
                                  {canManage && (
                                    <td className="px-3 py-3 text-center whitespace-nowrap">
                                      <div className="flex items-center justify-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => moveField(index, 'up')}
                                          disabled={index === 0}
                                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                          title="Move up"
                                        >
                                          <ArrowUp className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => moveField(index, 'down')}
                                          disabled={index === localFields.length - 1}
                                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                          title="Move down"
                                        >
                                          <ArrowDown className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </td>
                                  )}
                                  {canManage && (
                                    <td className="px-3 py-3 text-center">
                                      {!field.is_system_field ? (
                                        <button
                                          type="button"
                                          onClick={() => handleDetach(field.field_key)}
                                          disabled={detachingKey === field.field_key}
                                          className="p-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                          title="Detach field"
                                        >
                                          {detachingKey === field.field_key
                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            : <Unlink className="w-3.5 h-3.5" />
                                          }
                                        </button>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* === RIGHT PANE: Live Preview === */}
          <div className="w-80 flex-shrink-0">
            <div className="sticky top-6">
              {/* Preview Mode banner */}
              <div className="flex items-center gap-2 px-4 py-2 mb-3 bg-muted/60 border border-border rounded-lg">
                <AlertCircle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Preview Mode</span>
                <span className="text-xs text-muted-foreground ml-auto">No data is submitted</span>
              </div>

              <div className="bg-card rounded-lg shadow-sm border border-border">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">{schema?.form.form_name}</h3>
                  {schema?.form.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{schema.form.description}</p>
                  )}
                </div>

                <div className="px-5 py-4">
                  {previewFields.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      No visible fields. Toggle visibility in the editor to see them here.
                    </p>
                  ) : (
                    Object.entries(previewSections).map(([sectionName, fields]) => (
                      <div key={sectionName} className="mb-5">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 pb-1 border-b border-border">
                          {sectionName}
                        </p>
                        {fields.map(field => (
                          <PreviewField key={field.field_key} field={field} />
                        ))}
                      </div>
                    ))
                  )}

                  {previewFields.length > 0 && (
                    <button
                      type="button"
                      disabled
                      className="w-full px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm font-medium cursor-not-allowed mt-2"
                    >
                      Submit (Preview Only)
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </PermissionGate>
  );
};

export default AdminFormEditorV2;
