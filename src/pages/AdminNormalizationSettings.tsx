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
  RotateCcw,
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

        <PageHeader
          title="Normalization Rules"
          subtitle="Configure AI-assisted text cleanup applied at member verification (Verify step)."
        />

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
      </div>
    </PermissionGate>
  );
};

export default AdminNormalizationSettings;
