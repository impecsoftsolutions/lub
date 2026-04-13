import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  Book,
  Copy,
  FilePlus2,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  RotateCcw
} from 'lucide-react';
import {
  formBuilderV21Service,
  FormBuilderV2FormSummary,
  FormBuilderV2CloneInput,
  FormConfigV2FormCreateInput,
  FormLivePublishOrigin
} from '../lib/supabase';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import Toast from '../components/Toast';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import { PageHeader } from '../components/ui/PageHeader';

const EMPTY_NEW_FORM: FormConfigV2FormCreateInput = {
  form_key: '',
  form_name: '',
  description: null
};

const FORM_NAME_OVERRIDES: Record<string, string> = {
  join_lub: 'Member Registration Form'
};

function getDisplayFormName(form: Pick<FormBuilderV2FormSummary, 'form_key' | 'form_name'>): string {
  return FORM_NAME_OVERRIDES[form.form_key] ?? form.form_name;
}

function getDisplayFormDescription(form: Pick<FormBuilderV2FormSummary, 'form_key' | 'description'>): string | null {
  if (form.form_key === 'join_lub') {
    return 'Member registration form configuration in centralized builder';
  }
  return form.description;
}

const AdminFormBuilderV2: React.FC = () => {
  const canManage = useHasPermission('settings.forms.configure');

  const [forms, setForms] = useState<FormBuilderV2FormSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [archivingKey, setArchivingKey] = useState<string | null>(null);

  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [newForm, setNewForm] = useState<FormConfigV2FormCreateInput>({ ...EMPTY_NEW_FORM });

  const [cloneTarget, setCloneTarget] = useState<string | null>(null);
  const [cloneInput, setCloneInput] = useState({ target_key: '', target_name: '' });

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string; isVisible: boolean }>({
    type: 'success', message: '', isVisible: false
  });

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, isVisible: false }));
  }, []);

  const getLivePublishOrigin = (form: FormBuilderV2FormSummary): FormLivePublishOrigin => {
    if (form.live_publish_origin) {
      // 'unpublished' is a valid explicit origin — return it directly
      return form.live_publish_origin;
    }
    if (form.live_published_at) {
      return form.live_published_by ? 'manual_publish' : 'legacy_seeded';
    }
    return 'never_published';
  };

  const getLivePublishBadge = (form: FormBuilderV2FormSummary): { label: string; className: string } => {
    const origin = getLivePublishOrigin(form);
    if (origin === 'manual_publish') {
      return { label: 'Live', className: 'bg-green-100 text-green-700' };
    }
    if (origin === 'legacy_seeded') {
      return { label: 'Live (seeded)', className: 'bg-amber-100 text-amber-700' };
    }
    if (origin === 'unpublished') {
      return { label: 'Offline', className: 'bg-destructive/10 text-destructive' };
    }
    return { label: 'Not published', className: 'bg-muted text-muted-foreground' };
  };

  const loadForms = useCallback(async () => {
    setIsLoading(true);
    const [formsResult, publishStatusResult] = await Promise.all([
      formBuilderV21Service.listForms(),
      formBuilderV21Service.listLivePublishStatus()
    ]);
    if (formsResult.success && formsResult.data) {
      const publishStatusMap = new Map(
        (publishStatusResult.data || []).map(status => [status.form_key, status])
      );
      const merged = formsResult.data.map(form => {
        const status = publishStatusMap.get(form.form_key);
        if (!status) return form;
        return {
          ...form,
          live_published_at: status.live_published_at ?? null,
          live_published_by: status.live_published_by ?? null,
          live_published_by_email: status.live_published_by_email ?? null,
          live_publish_origin: status.live_publish_origin
        };
      });
      setForms(merged);
      if (!publishStatusResult.success) {
        showToast('error', publishStatusResult.error || 'Failed to load live publish status');
      }
    } else {
      showToast('error', formsResult.error || 'Failed to load forms');
    }
    setIsLoading(false);
  }, [showToast]);

  useEffect(() => { void loadForms(); }, [loadForms]);

  const handleCreate = async () => {
    const key = newForm.form_key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const name = newForm.form_name.trim();
    if (!key) { showToast('error', 'Form key is required'); return; }
    if (!name) { showToast('error', 'Form name is required'); return; }

    setIsCreating(true);
    const result = await formBuilderV21Service.createForm({ form_key: key, form_name: name, description: newForm.description || null });
    if (result.success) {
      showToast('success', 'Form created');
      setShowCreatePanel(false);
      setNewForm({ ...EMPTY_NEW_FORM });
      await loadForms();
      window.open(`/admin/form-studio/${key}`, '_blank', 'noopener,noreferrer');
    } else {
      showToast('error', result.error || 'Failed to create form');
    }
    setIsCreating(false);
  };

  const handleClone = async (sourceKey: string) => {
    const key = cloneInput.target_key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const name = cloneInput.target_name.trim();
    if (!key) { showToast('error', 'Target form key is required'); return; }
    if (!name) { showToast('error', 'Target form name is required'); return; }

    const input: FormBuilderV2CloneInput = {
      source_form_key: sourceKey,
      target_form_key: key,
      target_form_name: name
    };
    setIsCloning(true);
    const result = await formBuilderV21Service.cloneForm(input);
    if (result.success) {
      showToast('success', 'Form cloned');
      setCloneTarget(null);
      setCloneInput({ target_key: '', target_name: '' });
      await loadForms();
    } else {
      showToast('error', result.error || 'Failed to clone form');
    }
    setIsCloning(false);
  };

  const handleArchive = async (formKey: string, currentlyActive: boolean) => {
    const action = currentlyActive ? 'archive' : 'restore';
    if (!confirm(`${action === 'archive' ? 'Archive' : 'Restore'} this form?`)) return;
    setArchivingKey(formKey);
    const result = await formBuilderV21Service.archiveForm(formKey, currentlyActive);
    if (result.success) {
      showToast('success', `Form ${action}d`);
      await loadForms();
    } else {
      showToast('error', result.error || `Failed to ${action} form`);
    }
    setArchivingKey(null);
  };

  return (
    <PermissionGate
      permission="settings.forms.view"
      fallback={
        <div className="flex items-center justify-center p-8 text-center">
          <div>
            <Lock className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to view form builder.</p>
          </div>
        </div>
      }
    >
      <div className="p-6 max-w-6xl mx-auto">
        <Toast type={toast.type} message={toast.message} isVisible={toast.isVisible} onClose={hideToast} />

        <div className="mb-4 flex items-center justify-between">
          <Link
            to="/admin/settings/forms"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Form Configuration
          </Link>
          <Link
            to="/admin/settings/forms/library"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-primary border border-primary/30 bg-primary/5 rounded-lg hover:bg-primary/10 transition-colors"
          >
            <Book className="w-4 h-4 mr-2" />
            Field Library
          </Link>
        </div>

        <PageHeader
          title="Form Builder"
          subtitle="Manage forms and navigate to the split-pane editor."
          actions={canManage ? (
            <button
              type="button"
              onClick={() => setShowCreatePanel(prev => !prev)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <FilePlus2 className="w-4 h-4" />
              {showCreatePanel ? 'Close' : 'Create New Form'}
            </button>
          ) : undefined}
        />

        {showCreatePanel && canManage && (
          <div className="bg-card border border-border rounded-lg shadow-sm p-5 mb-6">
            <h3 className="text-section font-semibold text-foreground mb-4">Create New Form</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                value={newForm.form_name}
                onChange={e => setNewForm(prev => ({ ...prev, form_name: e.target.value }))}
                placeholder="Form name (e.g. Event Registration)"
                className="px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring bg-background text-foreground text-sm"
              />
              <input
                type="text"
                value={newForm.form_key}
                onChange={e => setNewForm(prev => ({ ...prev, form_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
                placeholder="form_key (e.g. event_registration)"
                className="px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring bg-background text-foreground text-sm font-mono"
              />
              <input
                type="text"
                value={newForm.description || ''}
                onChange={e => setNewForm(prev => ({ ...prev, description: e.target.value || null }))}
                placeholder="Description (optional)"
                className="px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring bg-background text-foreground text-sm"
              />
            </div>
            <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={handleCreate}
                disabled={isCreating}
                className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors text-sm"
              >
                {isCreating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FilePlus2 className="w-4 h-4 mr-2" />}
                Create Form
              </button>
              <button
                type="button"
                onClick={() => { setShowCreatePanel(false); setNewForm({ ...EMPTY_NEW_FORM }); }}
                className="px-4 py-2 border border-border rounded-lg text-foreground bg-card hover:bg-muted/50 transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="bg-card rounded-lg shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-3" />
              Loading forms...
            </div>
          ) : forms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <FilePlus2 className="w-10 h-10 text-muted-foreground/40 mb-4" />
              <p className="text-foreground font-medium">No forms yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create your first form to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Form</th>
                    <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Key</th>
                    <th className="text-center text-label font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Fields</th>
                    <th className="text-center text-label font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Live</th>
                    <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Updated</th>
                    <th className="text-center text-label font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {forms.map(form => (
                    <React.Fragment key={form.form_key}>
                      <tr className="hover:bg-muted/20">
                        <td className="px-6 py-4">
                          <a
                            href={`/admin/form-studio/${form.form_key}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-left block"
                          >
                            <p className="text-sm font-medium text-foreground hover:text-primary transition-colors">{getDisplayFormName(form)}</p>
                            {getDisplayFormDescription(form) && (
                              <p className="text-xs text-muted-foreground mt-0.5">{getDisplayFormDescription(form)}</p>
                            )}
                          </a>
                        </td>
                        <td className="px-4 py-4">
                          <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">{form.form_key}</code>
                        </td>
                        <td className="px-4 py-4 text-center text-sm text-foreground">{form.field_count}</td>
                        <td className="px-4 py-4 text-center">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            form.is_active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                          }`}>
                            {form.is_active ? 'Active' : 'Archived'}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {(() => {
                            const liveBadge = getLivePublishBadge(form);
                            return (
                              <div className="min-w-[170px]">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${liveBadge.className}`}>
                                  {liveBadge.label}
                                </span>
                                {form.live_published_at && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {new Date(form.live_published_at).toLocaleString()}
                                  </p>
                                )}
                                {getLivePublishOrigin(form) === 'manual_publish' && form.live_published_by_email && (
                                  <p className="text-xs text-muted-foreground truncate" title={form.live_published_by_email}>
                                    {form.live_published_by_email}
                                  </p>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-4 text-sm text-muted-foreground">
                          {new Date(form.updated_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {archivingKey === form.form_key ? (
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />
                          ) : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                                  aria-label="Form actions"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => window.open(`/admin/form-studio/${form.form_key}`, '_blank', 'noopener,noreferrer')}>
                                  <Pencil className="w-4 h-4 mr-2" />
                                  Open in Studio
                                </DropdownMenuItem>
                                {canManage && (
                                  <>
                                    <DropdownMenuItem onClick={() => {
                                      setCloneTarget(form.form_key);
                                      setCloneInput({ target_key: `${form.form_key}_copy`, target_name: `${getDisplayFormName(form)} (Copy)` });
                                    }}>
                                      <Copy className="w-4 h-4 mr-2" />
                                      Clone Form
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => handleArchive(form.form_key, form.is_active)}
                                      className={form.is_active ? 'text-destructive focus:text-destructive' : ''}
                                    >
                                      {form.is_active
                                        ? <><Archive className="w-4 h-4 mr-2" />Archive Form</>
                                        : <><RotateCcw className="w-4 h-4 mr-2" />Restore Form</>
                                      }
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </td>
                      </tr>
                      {cloneTarget === form.form_key && canManage && (
                        <tr>
                          <td colSpan={7} className="px-6 py-4 bg-muted/20 border-t border-dashed border-border">
                            <p className="text-sm font-medium text-foreground mb-3">
                              Clone <span className="text-primary">{getDisplayFormName(form)}</span>
                            </p>
                            <div className="flex gap-3 flex-wrap">
                              <input
                                type="text"
                                value={cloneInput.target_name}
                                onChange={e => setCloneInput(prev => ({ ...prev, target_name: e.target.value }))}
                                placeholder="New form name"
                                className="flex-1 min-w-[180px] px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring bg-background text-foreground text-sm"
                              />
                              <input
                                type="text"
                                value={cloneInput.target_key}
                                onChange={e => setCloneInput(prev => ({ ...prev, target_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
                                placeholder="new_form_key"
                                className="flex-1 min-w-[160px] px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring bg-background text-foreground text-sm font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => handleClone(form.form_key)}
                                disabled={isCloning}
                                className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors text-sm"
                              >
                                {isCloning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Copy className="w-4 h-4 mr-2" />}
                                Clone
                              </button>
                              <button
                                type="button"
                                onClick={() => setCloneTarget(null)}
                                className="px-4 py-2 border border-border rounded-lg text-foreground bg-card hover:bg-muted/50 transition-colors text-sm"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PermissionGate>
  );
};

export default AdminFormBuilderV2;
