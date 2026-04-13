import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Save
} from 'lucide-react';
import {
  fieldLibraryV2Service,
  FieldLibraryItemV2,
  FieldLibraryItemV2UpsertInput,
  SignupV2FieldType,
  ValidationRule,
  validationRulesService
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

const FIELD_TYPE_OPTIONS: SignupV2FieldType[] = [
  'text', 'textarea', 'select', 'checkbox', 'number', 'date', 'url', 'email', 'tel'
];

const EMPTY_FORM: FieldLibraryItemV2UpsertInput = {
  field_key: '',
  label: '',
  field_type: 'text',
  section_name: '',
  placeholder: null,
  help_text: null,
  option_items: null,
  min_length: null,
  max_length: null,
  validation_rule_id: null,
  is_system_field: false,
  is_locked: false
};

const LENGTH_SUPPORTED_TYPES: SignupV2FieldType[] = ['text', 'textarea', 'email', 'tel', 'number', 'url'];

function ItemForm({
  value,
  validationRules,
  onChange,
  onSubmit,
  onCancel,
  isBusy,
  submitLabel
}: {
  value: FieldLibraryItemV2UpsertInput;
  validationRules: ValidationRule[];
  onChange: (v: FieldLibraryItemV2UpsertInput) => void;
  onSubmit: (v: FieldLibraryItemV2UpsertInput) => void;
  onCancel: () => void;
  isBusy: boolean;
  submitLabel: string;
}) {
  const set = <K extends keyof FieldLibraryItemV2UpsertInput>(k: K, v: FieldLibraryItemV2UpsertInput[K]) =>
    onChange({ ...value, [k]: v });
  const [optionsText, setOptionsText] = useState((value.option_items || []).join(', '));

  useEffect(() => {
    setOptionsText((value.option_items || []).join(', '));
  }, [value.field_key, value.field_type, value.option_items]);

  const getSubmitValue = (): FieldLibraryItemV2UpsertInput => {
    const supportsLength = LENGTH_SUPPORTED_TYPES.includes(value.field_type);

    if (value.field_type !== 'select') {
      return {
        ...value,
        option_items: null,
        min_length: supportsLength ? (value.min_length ?? null) : null,
        max_length: supportsLength ? (value.max_length ?? null) : null
      };
    }

    const items = optionsText
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);

    return {
      ...value,
      option_items: items.length > 0 ? items : null,
      min_length: null,
      max_length: null
    };
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-label font-medium text-muted-foreground mb-1">Label *</label>
          <input
            type="text"
            value={value.label}
            onChange={e => set('label', e.target.value)}
            placeholder="e.g. Company Website"
            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring bg-background text-foreground text-sm"
          />
        </div>
        <div>
          <label className="block text-label font-medium text-muted-foreground mb-1">Field Key *</label>
          <input
            type="text"
            value={value.field_key}
            onChange={e => set('field_key', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="e.g. company_website"
            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring bg-background text-foreground text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-label font-medium text-muted-foreground mb-1">Field Type *</label>
          <select
            value={value.field_type}
            onChange={e => set('field_type', e.target.value as SignupV2FieldType)}
            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring bg-background text-foreground text-sm"
          >
            {FIELD_TYPE_OPTIONS.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-label font-medium text-muted-foreground mb-1">Section *</label>
          <input
            type="text"
            value={value.section_name}
            onChange={e => set('section_name', e.target.value)}
            placeholder="e.g. Business Details"
            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring bg-background text-foreground text-sm"
          />
        </div>
        <div>
          <label className="block text-label font-medium text-muted-foreground mb-1">Placeholder</label>
          <input
            type="text"
            value={value.placeholder || ''}
            onChange={e => set('placeholder', e.target.value || null)}
            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring bg-background text-foreground text-sm"
          />
        </div>
        <div>
          <label className="block text-label font-medium text-muted-foreground mb-1">Help Text</label>
          <input
            type="text"
            value={value.help_text || ''}
            onChange={e => set('help_text', e.target.value || null)}
            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring bg-background text-foreground text-sm"
          />
        </div>
        <div>
          <label className="block text-label font-medium text-muted-foreground mb-1">Validation Rule</label>
          <select
            value={value.validation_rule_id || ''}
            onChange={e => set('validation_rule_id', e.target.value || null)}
            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring bg-background text-foreground text-sm"
          >
            <option value="">No validation rule</option>
            {validationRules.map(rule => (
              <option key={rule.id} value={rule.id}>
                {rule.rule_name.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {LENGTH_SUPPORTED_TYPES.includes(value.field_type) && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-label font-medium text-muted-foreground mb-1">
              Min Length
              <span className="ml-1 text-xs text-muted-foreground/70">(optional)</span>
            </label>
            <input
              type="number"
              min={0}
              value={value.min_length ?? ''}
              onChange={e => set('min_length', e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0))}
              placeholder="e.g. 3"
              className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring bg-background text-foreground text-sm"
            />
          </div>
          <div>
            <label className="block text-label font-medium text-muted-foreground mb-1">
              Max Length
              <span className="ml-1 text-xs text-muted-foreground/70">(optional)</span>
            </label>
            <input
              type="number"
              min={1}
              value={value.max_length ?? ''}
              onChange={e => set('max_length', e.target.value === '' ? null : Math.max(1, parseInt(e.target.value, 10) || 1))}
              placeholder="e.g. 100"
              className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring bg-background text-foreground text-sm"
            />
          </div>
        </div>
      )}

      {value.field_type === 'select' && (
        <div>
          <label className="block text-label font-medium text-muted-foreground mb-1">Options (comma-separated)</label>
          <input
            type="text"
            value={optionsText}
            onChange={e => setOptionsText(e.target.value)}
            onBlur={() => onChange(getSubmitValue())}
            placeholder="e.g. Option A, Option B, Option C"
            className="w-full px-3 py-2 border border-border rounded-lg focus:ring-2 focus:ring-ring bg-background text-foreground text-sm"
          />
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => onSubmit(getSubmitValue())}
          disabled={isBusy}
          className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          {isBusy
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <Save className="w-4 h-4 mr-2" />
          }
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isBusy}
          className="px-4 py-2 border border-border rounded-lg text-foreground bg-card hover:bg-muted/50 transition-colors text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const AdminFieldLibrary: React.FC = () => {
  const canManage = useHasPermission('settings.forms.configure');

  const [items, setItems] = useState<FieldLibraryItemV2[]>([]);
  const [validationRules, setValidationRules] = useState<ValidationRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [archivingKey, setArchivingKey] = useState<string | null>(null);

  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [createForm, setCreateForm] = useState<FieldLibraryItemV2UpsertInput>({ ...EMPTY_FORM });
  const [isCreating, setIsCreating] = useState(false);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FieldLibraryItemV2UpsertInput>({ ...EMPTY_FORM });
  const [isUpdating, setIsUpdating] = useState(false);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string; isVisible: boolean }>({
    type: 'success', message: '', isVisible: false
  });

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, isVisible: false }));
  }, []);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    const result = await fieldLibraryV2Service.listItems();
    if (result.success && result.data) {
      setItems(result.data);
    } else {
      showToast('error', result.error || 'Failed to load field library');
    }
    setIsLoading(false);
  }, [showToast]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  useEffect(() => {
    const loadValidationRules = async () => {
      try {
        const rules = await validationRulesService.getActiveValidationRules();
        setValidationRules(rules);
      } catch (error) {
        console.error('Failed to load validation rules for field library:', error);
        showToast('error', 'Failed to load validation rules');
      }
    };

    void loadValidationRules();
  }, [showToast]);

  const validationRuleNameById = useMemo(() => {
    const map = new Map<string, string>();
    validationRules.forEach(rule => {
      map.set(rule.id, rule.rule_name.toUpperCase());
    });
    return map;
  }, [validationRules]);

  const filteredItems = useMemo(() => {
    const scopedItems = showArchived ? items : items.filter(item => !item.is_archived);
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return scopedItems;
    }

    const terms = query.split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      return scopedItems;
    }

    const withScore = scopedItems
      .map(item => {
        const label = item.label.toLowerCase();
        const key = item.field_key.toLowerCase();
        const section = item.section_name.toLowerCase();
        const type = item.field_type.toLowerCase();
        const rule = item.validation_rule_id ? (validationRuleNameById.get(item.validation_rule_id) || '').toLowerCase() : '';
        const status = item.is_archived ? 'archived' : 'active';
        const flags = [
          item.is_system_field ? 'system' : '',
          item.is_locked ? 'locked' : ''
        ].filter(Boolean).join(' ');

        let score = 0;
        for (const term of terms) {
          let matched = false;

          if (label.startsWith(term)) {
            score += 120;
            matched = true;
          } else if (label.includes(term)) {
            score += 90;
            matched = true;
          }

          if (key.includes(term)) {
            score += 80;
            matched = true;
          }

          if (section.includes(term)) {
            score += 55;
            matched = true;
          }

          if (type.includes(term)) {
            score += 45;
            matched = true;
          }

          if (rule.includes(term)) {
            score += 60;
            matched = true;
          }

          if (status.includes(term) || flags.includes(term)) {
            score += 35;
            matched = true;
          }

          if (!matched) {
            return null;
          }
        }

        return { item, score };
      })
      .filter((entry): entry is { item: FieldLibraryItemV2; score: number } => entry !== null)
      .sort((a, b) => (b.score - a.score) || a.item.label.localeCompare(b.item.label));

    return withScore.map(entry => entry.item);
  }, [items, searchQuery, showArchived, validationRuleNameById]);

  const handleCreate = async (formValue: FieldLibraryItemV2UpsertInput) => {
    if (!formValue.label.trim()) { showToast('error', 'Label is required'); return; }
    if (!formValue.field_key.trim()) { showToast('error', 'Field key is required'); return; }
    if (!formValue.section_name.trim()) { showToast('error', 'Section is required'); return; }

    setIsCreating(true);
    const result = await fieldLibraryV2Service.createItem({
      ...formValue,
      label: formValue.label.trim(),
      field_key: formValue.field_key.trim(),
      section_name: formValue.section_name.trim()
    });
    if (result.success) {
      showToast('success', 'Field template created');
      setShowCreatePanel(false);
      setCreateForm({ ...EMPTY_FORM });
      await loadItems();
    } else {
      showToast('error', result.error || 'Failed to create field template');
    }
    setIsCreating(false);
  };

  const startEdit = (item: FieldLibraryItemV2) => {
    setEditingKey(item.field_key);
    setEditForm({
      field_key: item.field_key,
      label: item.label,
      field_type: item.field_type,
      section_name: item.section_name,
      placeholder: item.placeholder ?? null,
      help_text: item.help_text ?? null,
      option_items: item.option_items ?? null,
      min_length: item.min_length ?? null,
      max_length: item.max_length ?? null,
      validation_rule_id: item.validation_rule_id ?? null,
      is_system_field: item.is_system_field,
      is_locked: item.is_locked
    });
  };

  const handleUpdate = async (formValue: FieldLibraryItemV2UpsertInput) => {
    if (!formValue.label.trim()) { showToast('error', 'Label is required'); return; }
    if (!formValue.section_name.trim()) { showToast('error', 'Section is required'); return; }

    setIsUpdating(true);
    const result = await fieldLibraryV2Service.updateItem({
      ...formValue,
      label: formValue.label.trim(),
      section_name: formValue.section_name.trim()
    });
    if (result.success) {
      showToast('success', 'Field template updated');
      setEditingKey(null);
      await loadItems();
    } else {
      showToast('error', result.error || 'Failed to update field template');
    }
    setIsUpdating(false);
  };

  const handleArchive = async (fieldKey: string, currentlyArchived: boolean) => {
    const action = currentlyArchived ? 'restore' : 'archive';
    if (!confirm(`${currentlyArchived ? 'Restore' : 'Archive'} this field template?`)) return;
    setArchivingKey(fieldKey);
    const result = await fieldLibraryV2Service.archiveItem(fieldKey, !currentlyArchived);
    if (result.success) {
      showToast('success', `Field template ${action}d`);
      await loadItems();
    } else {
      showToast('error', result.error || `Failed to ${action} field template`);
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
            <p className="text-muted-foreground">You don't have permission to view the field library.</p>
          </div>
        </div>
      }
    >
      <div className="p-6 max-w-6xl mx-auto">
        <Toast type={toast.type} message={toast.message} isVisible={toast.isVisible} onClose={hideToast} />

        <div className="mb-4">
          <Link
            to="/admin/settings/forms/builder"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Form Builder
          </Link>
        </div>

        <PageHeader
          title="Field Library"
          subtitle="Centralized field templates used across all forms."
          actions={
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search fields, keys, sections..."
                  className="w-72 max-w-[60vw] pl-9 pr-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:ring-2 focus:ring-ring"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={e => setShowArchived(e.target.checked)}
                  className="rounded border-border"
                />
                Show archived
              </label>
              {canManage && (
                <button
                  type="button"
                  onClick={() => setShowCreatePanel(prev => !prev)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
                >
                  <Plus className="w-4 h-4" />
                  {showCreatePanel ? 'Close' : 'New Field Template'}
                </button>
              )}
            </div>
          }
        />

        {showCreatePanel && canManage && (
          <div className="bg-card border border-border rounded-lg shadow-sm p-5 mb-6">
            <h3 className="text-section font-semibold text-foreground mb-4">New Field Template</h3>
            <ItemForm
              value={createForm}
              validationRules={validationRules}
              onChange={setCreateForm}
              onSubmit={handleCreate}
              onCancel={() => { setShowCreatePanel(false); setCreateForm({ ...EMPTY_FORM }); }}
              isBusy={isCreating}
              submitLabel="Create Template"
            />
          </div>
        )}

        <div className="bg-card rounded-lg shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mr-3" />
              Loading field library…
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-foreground font-medium">
                {searchQuery.trim()
                  ? 'No field templates match your search.'
                  : showArchived ? 'No field templates found.' : 'No active field templates.'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {searchQuery.trim()
                  ? 'Try searching by label, field key, section, validation rule, status, or flag.'
                  : showArchived ? '' : 'Toggle "Show archived" to see archived templates, or create a new one.'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider px-6 py-3">Field</th>
                      <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Type</th>
                      <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Section</th>
                      <th className="text-left text-label font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Validation</th>
                      <th className="text-center text-label font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Usage</th>
                      <th className="text-center text-label font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Flags</th>
                      <th className="text-center text-label font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Status</th>
                      {canManage && (
                        <th className="text-center text-label font-medium text-muted-foreground uppercase tracking-wider px-4 py-3">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredItems.map(item => (
                      <React.Fragment key={item.field_key}>
                        <tr className={`hover:bg-muted/20 ${item.is_archived ? 'opacity-60' : ''}`}>
                          <td className="px-6 py-3">
                            <p className="text-sm font-medium text-foreground">{item.label}</p>
                            <code className="text-xs text-muted-foreground">{item.field_key}</code>
                            {item.help_text && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{item.help_text}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">{item.field_type}</td>
                          <td className="px-4 py-3 text-sm text-foreground">{item.section_name}</td>
                          <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                            {item.validation_rule_id
                              ? (validationRuleNameById.get(item.validation_rule_id) || 'Linked Rule')
                              : 'None'}
                          </td>
                          <td className="px-4 py-3 text-center text-sm text-foreground">{item.usage_count}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {item.is_system_field && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground" title="System field">
                                  Sys
                                </span>
                              )}
                              {item.is_locked && (
                                <Lock className="w-3.5 h-3.5 text-muted-foreground" title="Locked" />
                              )}
                              {!item.is_system_field && !item.is_locked && (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              item.is_archived ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
                            }`}>
                              {item.is_archived ? 'Archived' : 'Active'}
                            </span>
                          </td>
                          {canManage && (
                            <td className="px-4 py-3 text-center">
                              {archivingKey === item.field_key ? (
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                                      aria-label="Field actions"
                                    >
                                      <MoreHorizontal className="w-4 h-4" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {!item.is_locked && (
                                      <DropdownMenuItem onClick={() => startEdit(item)}>
                                        <Pencil className="w-4 h-4 mr-2" />
                                        Edit Template
                                      </DropdownMenuItem>
                                    )}
                                    {!item.is_system_field && (
                                      <>
                                        {!item.is_locked && <DropdownMenuSeparator />}
                                        <DropdownMenuItem
                                          onClick={() => handleArchive(item.field_key, item.is_archived)}
                                          className={!item.is_archived ? 'text-destructive focus:text-destructive' : ''}
                                        >
                                          {item.is_archived
                                            ? <><RotateCcw className="w-4 h-4 mr-2" />Restore Template</>
                                            : <><Archive className="w-4 h-4 mr-2" />Archive Template</>
                                          }
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                    {item.is_system_field && item.is_locked && (
                                      <DropdownMenuItem disabled>
                                        <Lock className="w-4 h-4 mr-2" />
                                        System field — read only
                                      </DropdownMenuItem>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </td>
                          )}
                        </tr>
                        {editingKey === item.field_key && canManage && (
                          <tr>
                            <td colSpan={canManage ? 8 : 7} className="px-6 py-4 bg-muted/20 border-t border-dashed border-border">
                              <h4 className="text-sm font-semibold text-foreground mb-3">
                                Edit <span className="text-primary">{item.label}</span>
                              </h4>
                              <ItemForm
                                value={editForm}
                                validationRules={validationRules}
                                onChange={setEditForm}
                                onSubmit={handleUpdate}
                                onCancel={() => setEditingKey(null)}
                                isBusy={isUpdating}
                                submitLabel="Save Changes"
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-3 border-t border-border bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  {filteredItems.length} template{filteredItems.length !== 1 ? 's' : ''} shown
                  {searchQuery.trim() && ` for "${searchQuery.trim()}"`}
                  {!showArchived && items.some(i => i.is_archived) && ` · ${items.filter(i => i.is_archived).length} archived (hidden)`}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </PermissionGate>
  );
};

export default AdminFieldLibrary;
