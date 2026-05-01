import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Edit3,
  Info,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import {
  NormalizationRule,
  NormalizationRuleCategory,
  normalizationRulesService,
} from '../lib/supabase';
import { formatDateValue } from '../lib/dateTimeManager';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '../components/ui/PageHeader';
import Toast from '../components/Toast';

// ---------------------------------------------------------------------------
// Category display metadata
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<NormalizationRuleCategory, { label: string; description: string }> = {
  identity: {
    label: 'Identity',
    description: 'Personal name normalization applied at verification time.',
  },
  contact: {
    label: 'Contact',
    description: 'Contact fields — kept as-is by default; normalization is disabled.',
  },
  company: {
    label: 'Company',
    description: 'Company name and address text cleanup.',
  },
  business: {
    label: 'Business',
    description: 'Products and services description cleanup.',
  },
  referral: {
    label: 'Referral',
    description: 'Alternate contact and referral name normalization.',
  },
};

const CATEGORY_ORDER: NormalizationRuleCategory[] = [
  'identity',
  'contact',
  'company',
  'business',
  'referral',
];

// ---------------------------------------------------------------------------
// Field catalog (CLAUDE-NORMALIZATION-RULE-UX-035)
// Single source of truth for the Add Rule dropdown. The catalog covers
// every member-registration field that we may want admins to normalize,
// pre-mapped to a label and category so admins never have to type those.
// Fields outside this catalog can still be added later by extending the
// list; the underlying RPC accepts any valid field_key.
// ---------------------------------------------------------------------------

interface FieldCatalogEntry {
  field_key: string;
  label: string;
  category: NormalizationRuleCategory;
}

const FIELD_CATALOG: FieldCatalogEntry[] = [
  // Identity
  { field_key: 'full_name', label: 'Full Name', category: 'identity' },

  // Contact
  { field_key: 'email', label: 'Email Address', category: 'contact' },
  { field_key: 'mobile_number', label: 'Mobile Number', category: 'contact' },
  { field_key: 'alternate_contact_name', label: 'Alternate Contact Name', category: 'contact' },
  { field_key: 'alternate_mobile', label: 'Alternate Mobile', category: 'contact' },

  // Company
  { field_key: 'company_name', label: 'Company Name', category: 'company' },
  { field_key: 'company_address', label: 'Company Address', category: 'company' },
  { field_key: 'state', label: 'State', category: 'company' },
  { field_key: 'district', label: 'District', category: 'company' },
  { field_key: 'city', label: 'City / Town', category: 'company' },
  { field_key: 'pin_code', label: 'PIN Code', category: 'company' },
  { field_key: 'gst_number', label: 'GST Number', category: 'company' },
  { field_key: 'pan_company', label: 'PAN (Company)', category: 'company' },

  // Business
  { field_key: 'products_services', label: 'Products & Services', category: 'business' },
  { field_key: 'industry', label: 'Industry', category: 'business' },
  { field_key: 'activity_type', label: 'Activity Type', category: 'business' },
  { field_key: 'brand_names', label: 'Brand Names', category: 'business' },

  // Referral
  { field_key: 'referred_by', label: 'Referred By', category: 'referral' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const AdminNormalizationSettings: React.FC = () => {
  const canManage = useHasPermission('settings.normalization.manage');

  const [rules, setRules] = useState<NormalizationRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Inline edit state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editedText, setEditedText] = useState('');
  const [isSavingKey, setIsSavingKey] = useState<string | null>(null);

  // Add Rule modal state (COD-NORMALIZATION-RULES-ADD-DELETE-034 +
  // CLAUDE-NORMALIZATION-RULE-UX-035: field is now picked from a catalog,
  // label/category derived from the chosen field_key).
  const [showAddModal, setShowAddModal] = useState(false);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newInstruction, setNewInstruction] = useState('');
  const [newIsEnabled, setNewIsEnabled] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Delete confirmation state
  const [pendingDelete, setPendingDelete] = useState<NormalizationRule | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const FIELD_KEY_REGEX = /^[a-z][a-z0-9_]{1,63}$/;

  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({ type: 'success', message: '', isVisible: false });

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, isVisible: false }));
  }, []);

  const loadRules = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    const result = await normalizationRulesService.getRules();
    if (!result.success || !result.data) {
      setLoadError(result.error || 'Failed to load normalization rules');
      setIsLoading(false);
      return;
    }
    const sorted = [...result.data].sort((a, b) => a.display_order - b.display_order);
    setRules(sorted);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  // Group rules by category, preserving display_order sort within each group
  const rulesByCategory = CATEGORY_ORDER.reduce<
    Record<NormalizationRuleCategory, NormalizationRule[]>
  >(
    (acc, cat) => {
      acc[cat] = rules.filter((r) => r.category === cat);
      return acc;
    },
    { identity: [], contact: [], company: [], business: [], referral: [] }
  );

  // -------------------------------------------------------------------------
  // Toggle enable/disable
  // -------------------------------------------------------------------------

  const handleToggleEnabled = async (rule: NormalizationRule) => {
    if (!canManage) return;
    setIsSavingKey(rule.field_key);
    const result = await normalizationRulesService.updateRule({
      fieldKey: rule.field_key,
      isEnabled: !rule.is_enabled,
    });
    if (!result.success) {
      showToast('error', result.error || 'Failed to update rule');
    } else {
      setRules((prev) =>
        prev.map((r) =>
          r.field_key === rule.field_key ? { ...r, is_enabled: !r.is_enabled } : r
        )
      );
    }
    setIsSavingKey(null);
  };

  // -------------------------------------------------------------------------
  // Edit instruction_text
  // -------------------------------------------------------------------------

  const handleEditStart = (rule: NormalizationRule) => {
    setEditingKey(rule.field_key);
    setEditedText(rule.instruction_text);
  };

  const handleEditCancel = () => {
    setEditingKey(null);
    setEditedText('');
  };

  const handleEditSave = async (rule: NormalizationRule) => {
    if (!canManage) return;
    const trimmed = editedText.trim();
    if (!trimmed) {
      showToast('error', 'Instruction text cannot be blank');
      return;
    }
    setIsSavingKey(rule.field_key);
    const result = await normalizationRulesService.updateRule({
      fieldKey: rule.field_key,
      instructionText: trimmed,
    });
    if (!result.success) {
      showToast('error', result.error || 'Failed to save instruction');
    } else {
      setRules((prev) =>
        prev.map((r) =>
          r.field_key === rule.field_key ? { ...r, instruction_text: trimmed } : r
        )
      );
      setEditingKey(null);
      setEditedText('');
      showToast('success', `"${rule.label}" instruction updated`);
    }
    setIsSavingKey(null);
  };

  // -------------------------------------------------------------------------
  // Restore default
  // -------------------------------------------------------------------------

  const handleRestoreDefault = async (rule: NormalizationRule) => {
    if (!canManage) return;
    if (rule.instruction_text === rule.default_instruction_text) return;
    setIsSavingKey(rule.field_key);
    const result = await normalizationRulesService.updateRule({
      fieldKey: rule.field_key,
      instructionText: rule.default_instruction_text,
    });
    if (!result.success) {
      showToast('error', result.error || 'Failed to restore default');
    } else {
      setRules((prev) =>
        prev.map((r) =>
          r.field_key === rule.field_key
            ? { ...r, instruction_text: r.default_instruction_text }
            : r
        )
      );
      showToast('success', `"${rule.label}" restored to default`);
    }
    setIsSavingKey(null);
  };

  // -------------------------------------------------------------------------
  // Reorder — move up / down within category
  // -------------------------------------------------------------------------

  const handleMove = async (
    categoryRules: NormalizationRule[],
    index: number,
    direction: 'up' | 'down'
  ) => {
    if (!canManage) return;
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= categoryRules.length) return;

    const current = categoryRules[index];
    const swap = categoryRules[swapIndex];

    const updates = [
      { fieldKey: current.field_key, displayOrder: swap.display_order },
      { fieldKey: swap.field_key, displayOrder: current.display_order },
    ];

    const result = await normalizationRulesService.reorderRules(updates);
    if (!result.success) {
      showToast('error', result.error || 'Failed to reorder rules');
      return;
    }

    setRules((prev) =>
      prev
        .map((r) => {
          if (r.field_key === current.field_key)
            return { ...r, display_order: swap.display_order };
          if (r.field_key === swap.field_key)
            return { ...r, display_order: current.display_order };
          return r;
        })
        .sort((a, b) => a.display_order - b.display_order)
    );
  };

  // -------------------------------------------------------------------------
  // Add Rule (COD-NORMALIZATION-RULES-ADD-DELETE-034)
  // -------------------------------------------------------------------------

  // Map of currently-active rules (not retired) by field_key, used to mark
  // catalog options as already-taken in the Add Rule dropdown.
  const activeRuleByFieldKey: Record<string, NormalizationRule> = {};
  for (const rule of rules) {
    activeRuleByFieldKey[rule.field_key] = rule;
  }

  const selectedCatalogEntry = newFieldKey
    ? FIELD_CATALOG.find((entry) => entry.field_key === newFieldKey) ?? null
    : null;

  const resetAddForm = () => {
    setNewFieldKey('');
    setNewInstruction('');
    setNewIsEnabled(true);
  };

  const closeAddModal = () => {
    if (isCreating) return;
    setShowAddModal(false);
    resetAddForm();
  };

  const handleAddRuleSubmit = async () => {
    if (!canManage) return;
    const trimmedInstruction = newInstruction.trim();

    if (!selectedCatalogEntry) {
      showToast('error', 'Please choose a field from the list.');
      return;
    }
    if (activeRuleByFieldKey[selectedCatalogEntry.field_key]) {
      showToast('error', `A rule already exists for "${selectedCatalogEntry.label}".`);
      return;
    }
    if (!FIELD_KEY_REGEX.test(selectedCatalogEntry.field_key)) {
      // Defensive: catalog entries should always pass this, but blocks save
      // cleanly if a future catalog edit drifts from the runtime regex.
      showToast('error', 'Selected field has an invalid key.');
      return;
    }
    if (trimmedInstruction.length > 2000) {
      showToast('error', 'Instruction must be 2000 characters or fewer.');
      return;
    }

    setIsCreating(true);
    const result = await normalizationRulesService.createRule({
      fieldKey: selectedCatalogEntry.field_key,
      label: selectedCatalogEntry.label,
      category: selectedCatalogEntry.category,
      instructionText: trimmedInstruction,
      isEnabled: newIsEnabled,
    });
    setIsCreating(false);

    if (!result.success) {
      showToast('error', result.error || 'Failed to create rule');
      return;
    }
    showToast(
      'success',
      result.reactivated
        ? `"${selectedCatalogEntry.label}" reactivated`
        : `"${selectedCatalogEntry.label}" added`
    );
    setShowAddModal(false);
    resetAddForm();
    await loadRules();
  };

  // -------------------------------------------------------------------------
  // Delete (soft retire)
  // -------------------------------------------------------------------------

  const handleDeleteConfirm = async () => {
    if (!canManage || !pendingDelete) return;
    setIsDeleting(true);
    const result = await normalizationRulesService.deleteRule(pendingDelete.field_key);
    setIsDeleting(false);

    if (!result.success) {
      showToast('error', result.error || 'Failed to delete rule');
      return;
    }
    showToast('success', `"${pendingDelete.label}" removed`);
    setPendingDelete(null);
    await loadRules();
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <PermissionGate
      permission="settings.normalization.view"
      fallback={
        <div>
          <PageHeader
            title="Normalization Rules"
            subtitle="You do not have permission to view normalization configuration."
          />
        </div>
      }
    >
      <div className="space-y-6">
        <Link
          to="/admin/settings"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings Hub
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <PageHeader
            title="Normalization Rules"
            subtitle="Configure AI-assisted text cleanup applied at member verification (Verify step)."
          />
          {canManage && (
            <Button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="gap-2 self-start sm:self-end"
            >
              <Plus className="h-4 w-4" />
              Add Rule
            </Button>
          )}
        </div>

        {/* Scope info banner */}
        <div className="rounded-lg border border-border bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
            <div className="space-y-1 text-sm">
              <p className="font-medium text-foreground">Verify-time AI text cleanup only</p>
              <p className="text-muted-foreground">
                These rules control how the AI reformats text fields when a member clicks{' '}
                <strong>Verify</strong> during registration. Suggested changes are shown for the
                member to review before they submit.
              </p>
              <p className="text-muted-foreground">
                These rules do <strong>not</strong> affect form validation patterns, regex rules,
                or Smart Upload document extraction.
              </p>
            </div>
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading normalization rules...</span>
          </div>
        )}

        {/* Error state */}
        {!isLoading && loadError && (
          <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-destructive" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Failed to load rules</p>
              <p className="text-xs text-muted-foreground">{loadError}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadRules()}>
              Retry
            </Button>
          </div>
        )}

        {/* Rules list */}
        {!isLoading && !loadError && (
          <div className="space-y-6">
            {CATEGORY_ORDER.map((category) => {
              const categoryRules = rulesByCategory[category];
              if (categoryRules.length === 0) return null;
              const meta = CATEGORY_META[category];

              return (
                <Card key={category} className="border-border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-foreground">
                      {meta.label}
                    </CardTitle>
                    <CardDescription className="text-xs">{meta.description}</CardDescription>
                  </CardHeader>

                  <CardContent className="divide-y divide-border pt-0">
                    {categoryRules.map((rule, idx) => {
                      const isEditing = editingKey === rule.field_key;
                      const isSaving = isSavingKey === rule.field_key;
                      const isModified =
                        rule.instruction_text !== rule.default_instruction_text;

                      return (
                        <div key={rule.field_key} className="py-4 first:pt-0 last:pb-0">
                          {/* Top row: label + badges + controls */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium text-foreground">
                                  {rule.label}
                                </span>
                                <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                  {rule.field_key}
                                </code>
                                {isModified && (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                    customised
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-shrink-0 items-center gap-1">
                              {/* Move up/down within category */}
                              {canManage && (
                                <>
                                  <button
                                    type="button"
                                    title="Move up"
                                    disabled={idx === 0 || isSaving}
                                    onClick={() => void handleMove(categoryRules, idx, 'up')}
                                    className="rounded p-1 text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
                                  >
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Move down"
                                    disabled={idx === categoryRules.length - 1 || isSaving}
                                    onClick={() => void handleMove(categoryRules, idx, 'down')}
                                    className="rounded p-1 text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
                                  >
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}

                              {/* Enable/disable toggle */}
                              <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1">
                                {isSaving && !isEditing ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                ) : (
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 rounded border-input accent-primary"
                                    checked={rule.is_enabled}
                                    disabled={!canManage || isSaving}
                                    onChange={() => void handleToggleEnabled(rule)}
                                  />
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {rule.is_enabled ? 'Enabled' : 'Disabled'}
                                </span>
                              </label>
                            </div>
                          </div>

                          {/* Instruction text — display or edit */}
                          <div className="mt-2">
                            {isEditing ? (
                              <div className="space-y-2">
                                <textarea
                                  rows={3}
                                  value={editedText}
                                  onChange={(e) => setEditedText(e.target.value)}
                                  placeholder="Enter instruction text for the AI (e.g. Title Case, trim extra spaces)"
                                  autoFocus
                                  className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => void handleEditSave(rule)}
                                    disabled={isSaving || !editedText.trim()}
                                    className="h-7 gap-1.5 px-3 text-xs"
                                  >
                                    {isSaving ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Check className="h-3 w-3" />
                                    )}
                                    Save
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleEditCancel}
                                    disabled={isSaving}
                                    className="h-7 gap-1.5 px-3 text-xs"
                                  >
                                    <X className="h-3 w-3" />
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-2">
                                <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                                  {rule.instruction_text ? (
                                    rule.instruction_text
                                  ) : (
                                    <em className="text-xs">
                                      No instruction set — field will pass through unchanged.
                                    </em>
                                  )}
                                </p>
                                {canManage && (
                                  <div className="flex flex-shrink-0 items-center gap-1">
                                    <button
                                      type="button"
                                      title="Edit instruction"
                                      onClick={() => handleEditStart(rule)}
                                      disabled={isSaving}
                                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                                    >
                                      <Edit3 className="h-3.5 w-3.5" />
                                    </button>
                                    {isModified && (
                                      <button
                                        type="button"
                                        title="Restore default instruction"
                                        onClick={() => void handleRestoreDefault(rule)}
                                        disabled={isSaving}
                                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-amber-600 disabled:opacity-50"
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      title="Delete rule"
                                      onClick={() => setPendingDelete(rule)}
                                      disabled={isSaving}
                                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Audit trail — only shown after an admin has modified the row */}
                          {rule.updated_by_email && (
                            <p className="mt-1.5 text-xs text-muted-foreground/60">
                              Last updated{' '}
                              {formatDateValue(rule.updated_at)} by{' '}
                              {rule.updated_by_email}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}

            {!canManage && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                You can view normalization rules, but you do not have permission to modify them.
              </div>
            )}
          </div>
        )}

        <Toast
          type={toast.type}
          message={toast.message}
          isVisible={toast.isVisible}
          onClose={hideToast}
        />

        {/* Add Rule modal (COD-NORMALIZATION-RULES-ADD-DELETE-034) */}
        {showAddModal && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            onClick={closeAddModal}
          >
            <div
              className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-base font-semibold text-foreground">Add normalization rule</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The runtime starts applying this rule to the named field as soon as you save.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAddModal}
                  disabled={isCreating}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Field
                  </label>
                  <select
                    value={newFieldKey}
                    onChange={(e) => setNewFieldKey(e.target.value)}
                    autoFocus
                    disabled={isCreating}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Choose a field…</option>
                    {CATEGORY_ORDER.map((cat) => {
                      const entries = FIELD_CATALOG.filter((e) => e.category === cat);
                      if (entries.length === 0) return null;
                      return (
                        <optgroup key={cat} label={CATEGORY_META[cat].label}>
                          {entries.map((entry) => {
                            const taken = Boolean(activeRuleByFieldKey[entry.field_key]);
                            return (
                              <option
                                key={entry.field_key}
                                value={entry.field_key}
                                disabled={taken}
                              >
                                {entry.label}
                                {taken ? ' (Rule exists)' : ''}
                              </option>
                            );
                          })}
                        </optgroup>
                      );
                    })}
                  </select>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Fields already covered by an active rule are shown disabled.
                    Deleting a rule re-enables its field here.
                  </p>
                </div>

                {selectedCatalogEntry && (
                  <div className="rounded-md border border-border bg-muted/20 px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Label
                      </span>
                      <span className="text-sm text-foreground">
                        {selectedCatalogEntry.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Category
                      </span>
                      <span className="text-sm text-foreground">
                        {CATEGORY_META[selectedCatalogEntry.category].label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Field key
                      </span>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {selectedCatalogEntry.field_key}
                      </code>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Instruction text
                  </label>
                  <textarea
                    rows={3}
                    value={newInstruction}
                    onChange={(e) => setNewInstruction(e.target.value)}
                    placeholder="e.g. Title Case, trim extra spaces"
                    disabled={isCreating}
                    className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Sent to the AI as the normalization instruction for this field. Up to 2000 characters.
                    Leave empty to passthrough (no transformation).
                  </p>
                </div>

                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={newIsEnabled}
                    onChange={(e) => setNewIsEnabled(e.target.checked)}
                    disabled={isCreating}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  Enabled
                </label>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={closeAddModal}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleAddRuleSubmit()}
                  disabled={
                    isCreating ||
                    !selectedCatalogEntry ||
                    Boolean(
                      selectedCatalogEntry &&
                        activeRuleByFieldKey[selectedCatalogEntry.field_key]
                    )
                  }
                  className="gap-1.5"
                >
                  {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save Rule
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete confirmation modal */}
        {pendingDelete && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
            role="dialog"
            aria-modal="true"
            onClick={() => !isDeleting && setPendingDelete(null)}
          >
            <div
              className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-foreground">Delete normalization rule?</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                This retires the rule for{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {pendingDelete.field_key}
                </code>
                . The runtime stops applying it immediately. You can re-add the same field key later
                to reactivate it.
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPendingDelete(null)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => void handleDeleteConfirm()}
                  disabled={isDeleting}
                  className="gap-1.5"
                >
                  {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Delete
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PermissionGate>
  );
};

export default AdminNormalizationSettings;
