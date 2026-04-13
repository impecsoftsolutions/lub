/**
 * AdminFormStudio — 3-panel form builder studio
 * Route: /admin/form-studio/:formKey  (opens in new tab, no sidebar)
 *
 * Layout:
 *   Top bar  → form name · status · Preview · Publish to Live
 *   Left     → Field Palette (in-form list + library to add)
 *   Center   → Form Canvas  (exact visual match to public form, selectable fields)
 *   Right    → Properties Inspector (per-form settings for selected field)
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  CloudOff,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Plus,
  Search,
  Send,
  Unlink,
  X,
  XCircle
} from 'lucide-react';
import {
  companyDesignationsService,
  CompanyDesignation,
  DistrictOption,
  CityOption,
  formBuilderV21Service,
  fieldLibraryV2Service,
  FormLivePublishStatus,
  FormBuilderSchemaV2,
  FormBuilderSchemaFieldV2,
  FieldLibraryItemV2,
  PublicPaymentState,
  statesService
} from '../lib/supabase';
import { canSelectFieldBeRequired, resolveSelectOptions, SelectOption } from '../lib/formFieldOptionResolver';
import Toast from '../components/Toast';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';

// ─── helpers ───────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, string> = {
  text: 'bg-primary/10 text-primary',
  textarea: 'bg-muted text-muted-foreground',
  select: 'bg-secondary text-secondary-foreground',
  checkbox: 'bg-success/10 text-success',
  number: 'bg-muted text-foreground',
  date: 'bg-muted text-foreground',
  url: 'bg-muted text-foreground',
  email: 'bg-success/10 text-success',
  tel: 'bg-primary/10 text-primary',
};

const FORM_NAME_OVERRIDES: Record<string, string> = {
  join_lub: 'Member Registration Form'
};

function getStudioDisplayFormName(formKey?: string, formName?: string | null): string {
  if (formKey && FORM_NAME_OVERRIDES[formKey]) {
    return FORM_NAME_OVERRIDES[formKey];
  }
  return formName?.trim() || formKey || 'Form';
}

function getStudioDisplayFormDescription(formKey?: string, description?: string | null): string | null {
  if (formKey === 'join_lub') {
    return 'Member registration form configuration in centralized builder';
  }
  return description ?? null;
}

function typeBadge(type: string) {
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_BADGE[type] ?? 'bg-muted text-muted-foreground'}`}>
      {type}
    </span>
  );
}

// ─── CanvasField ────────────────────────────────────────────────────────────

interface CanvasFieldProps {
  field: FormBuilderSchemaFieldV2;
  selectOptions: SelectOption[];
  isEffectivelyRequired: boolean;
  index: number;
  total: number;
  isSelected: boolean;
  canManage: boolean;
  onClick: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDetach: () => void;
}

function CanvasField({
  field,
  selectOptions,
  isEffectivelyRequired,
  index,
  total,
  isSelected,
  canManage,
  onClick,
  onMoveUp,
  onMoveDown,
  onDetach
}: CanvasFieldProps) {
  const inputCls = `w-full px-4 py-3 border border-border rounded-lg bg-background text-muted-foreground text-sm pointer-events-none`;

  const control = (() => {
    switch (field.field_type) {
      case 'textarea':
        return <textarea className={inputCls} placeholder={field.placeholder ?? ''} rows={3} readOnly />;
      case 'select':
        return (
          <select className={inputCls} disabled>
            <option>{field.placeholder ?? 'Select…'}</option>
            {selectOptions.map(option => <option key={option.value}>{option.label}</option>)}
          </select>
        );
      case 'checkbox':
        return (
          <label className="flex items-center gap-2 pointer-events-none">
            <input type="checkbox" disabled className="rounded border-border" />
            <span className="text-sm text-foreground">{field.label}</span>
          </label>
        );
      default:
        return <input type={field.field_type} className={inputCls} placeholder={field.placeholder ?? ''} readOnly />;
    }
  })();

  return (
    <div
      onClick={onClick}
      className={`relative group mb-4 p-4 rounded-xl border-2 cursor-pointer transition-all duration-150 ${
        isSelected
          ? 'border-primary shadow-md bg-primary/5'
          : 'border-transparent hover:border-border bg-card hover:shadow-sm'
      } ${!field.is_visible ? 'opacity-50' : ''}`}
    >
      {!field.is_visible && (
        <span className="absolute -top-2.5 left-3 text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full border border-border font-medium">
          Hidden
        </span>
      )}

      {field.field_type !== 'checkbox' && (
        <label className="block text-sm font-medium text-foreground mb-1.5 pointer-events-none">
          {field.label}
          {isEffectivelyRequired && <span className="text-destructive ml-1">*</span>}
        </label>
      )}
      {control}
      {field.help_text && (
        <p className="text-xs text-muted-foreground mt-1.5 pointer-events-none">{field.help_text}</p>
      )}

      {canManage && (
        <div className={`absolute top-2 right-2 flex items-center gap-1 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <button type="button" onClick={e => { e.stopPropagation(); onMoveUp(); }} disabled={index === 0}
            className="p-1 rounded bg-card border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors" title="Move up">
            <ArrowUp className="w-3 h-3" />
          </button>
          <button type="button" onClick={e => { e.stopPropagation(); onMoveDown(); }} disabled={index === total - 1}
            className="p-1 rounded bg-card border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors" title="Move down">
            <ArrowDown className="w-3 h-3" />
          </button>
          {!field.is_system_field && (
            <button type="button" onClick={e => { e.stopPropagation(); onDetach(); }}
              className="p-1 rounded bg-card border border-border text-destructive hover:bg-destructive/10 transition-colors" title="Remove from form">
              <Unlink className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Publish Confirm Modal ───────────────────────────────────────────────────

function PublishModal({ formName, onConfirm, onCancel, isPublishing }: { formName: string; onConfirm: () => void; onCancel: () => void; isPublishing: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-[1px]">
      <div className="bg-card rounded-2xl shadow-sm border border-border w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">Publish to Live?</h2>
        <p className="text-sm text-muted-foreground mb-1">
          This will update the live version of <span className="font-medium text-foreground">{formName}</span> immediately.
        </p>
        <p className="text-sm text-muted-foreground mb-6">Publishing pushes the latest draft to the live page.</p>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCancel} disabled={isPublishing}
            className="px-4 py-2 border border-border rounded-lg text-foreground bg-card hover:bg-muted/50 disabled:opacity-50 transition-colors text-sm">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={isPublishing}
            className="inline-flex items-center px-5 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors text-sm font-medium">
            {isPublishing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Publish to Live
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Unpublish Confirm Modal ─────────────────────────────────────────────────

function UnpublishModal({ formName, onConfirm, onCancel, isUnpublishing }: { formName: string; onConfirm: () => void; onCancel: () => void; isUnpublishing: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-[1px]">
      <div className="bg-card rounded-2xl shadow-sm border border-border w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">Take form offline?</h2>
        <p className="text-sm text-muted-foreground mb-1">
          This will take <span className="font-medium text-foreground">{formName}</span> offline immediately.
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          Visitors will see "Form unavailable" until you publish again. Your draft is preserved.
        </p>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCancel} disabled={isUnpublishing}
            className="px-4 py-2 border border-border rounded-lg text-foreground bg-card hover:bg-muted/50 disabled:opacity-50 transition-colors text-sm">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={isUnpublishing}
            className="inline-flex items-center px-5 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50 transition-colors text-sm font-medium">
            {isUnpublishing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CloudOff className="w-4 h-4 mr-2" />}
            Take Offline
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Studio ─────────────────────────────────────────────────────────────

type PublishStatus = 'draft' | 'unsaved' | 'saved' | 'published';

const AdminFormStudio: React.FC = () => {
  const { formKey } = useParams<{ formKey: string }>();
  const canManage = useHasPermission('settings.forms.configure');

  const [schema, setSchema] = useState<FormBuilderSchemaV2 | null>(null);
  const [localFields, setLocalFields] = useState<FormBuilderSchemaFieldV2[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [publishStatus, setPublishStatus] = useState<PublishStatus>('draft');

  const [libraryItems, setLibraryItems] = useState<FieldLibraryItemV2[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAttaching, setIsAttaching] = useState<string | null>(null);
  const [isDetaching, setIsDetaching] = useState<string | null>(null);
  const [availableStates, setAvailableStates] = useState<PublicPaymentState[]>([]);
  const [availableDesignations, setAvailableDesignations] = useState<CompanyDesignation[]>([]);
  const [availableDistricts] = useState<DistrictOption[]>([]);
  const [availableCities] = useState<CityOption[]>([]);
  const [livePublishStatus, setLivePublishStatus] = useState<FormLivePublishStatus | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showUnpublishModal, setShowUnpublishModal] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldSnapshotRef = useRef<FormBuilderSchemaFieldV2[]>([]);
  const changeVersionRef = useRef(0);

  const [expandPalette, setExpandPalette] = useState<{ inForm: boolean; library: boolean }>({ inForm: true, library: true });

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string; isVisible: boolean }>({
    type: 'success', message: '', isVisible: false
  });
  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  }, []);
  const hideToast = useCallback(() => setToast(p => ({ ...p, isVisible: false })), []);
  const displayFormName = getStudioDisplayFormName(schema?.form.form_key ?? formKey, schema?.form.form_name);
  const displayFormDescription = getStudioDisplayFormDescription(schema?.form.form_key ?? formKey, schema?.form.description);

  // ── load ──────────────────────────────────────────────────────────────────

  const loadSchema = useCallback(async () => {
    if (!formKey) return;
    const result = await formBuilderV21Service.getFormSchema(formKey);
    if (result.success && result.data) {
      setSchema(result.data);
      const sanitizedFields = result.data.fields.map(field =>
        canSelectFieldBeRequired(field) ? field : { ...field, is_required: false }
      );
      setLocalFields([...sanitizedFields].sort((a, b) => a.display_order - b.display_order));
      setNotFound(false);
      // P3: seed draft status from live origin so top bar reflects live state on load
      const origin = result.data.form.live_publish_origin;
      if (origin === 'manual_publish') {
        setPublishStatus('published');
      }
      // legacy_seeded / never_published / unpublished stay as 'draft' — livePublishEl carries the context
    } else if (result.error === 'Form not found') {
      setNotFound(true);
    } else {
      showToast('error', result.error || 'Failed to load form');
    }
  }, [formKey, showToast]);

  const loadLibrary = useCallback(async () => {
    const result = await fieldLibraryV2Service.listItems();
    if (result.success && result.data) {
      setLibraryItems(result.data.filter(i => !i.is_archived));
    }
  }, []);

  const loadControlledSources = useCallback(async () => {
    const [states, designations] = await Promise.all([
      statesService.getPublicPaymentStates(),
      companyDesignationsService.getActiveDesignations()
    ]);
    setAvailableStates(states);
    setAvailableDesignations(designations);
  }, []);

  const loadLivePublishStatus = useCallback(async () => {
    if (!formKey) return;
    const result = await formBuilderV21Service.getLivePublishStatus(formKey);
    if (result.success) {
      setLivePublishStatus(result.data ?? null);
    } else {
      setLivePublishStatus(null);
      showToast('error', result.error || 'Failed to load live publish status');
    }
  }, [formKey, showToast]);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([loadSchema(), loadLibrary(), loadControlledSources(), loadLivePublishStatus()]).finally(() => setIsLoading(false));
  }, [loadSchema, loadLibrary, loadControlledSources, loadLivePublishStatus]);

  useEffect(() => {
    fieldSnapshotRef.current = localFields;
  }, [localFields]);

  // ── derived ───────────────────────────────────────────────────────────────

  const attachedKeys = useMemo(() => new Set(localFields.map(f => f.field_key)), [localFields]);

  const selectedField = useMemo(
    () => localFields.find(f => f.field_key === selectedKey) ?? null,
    [localFields, selectedKey]
  );

  const selectOptionsByFieldKey = useMemo(() => {
    const options: Record<string, SelectOption[]> = {};
    localFields.forEach(field => {
      if (field.field_type !== 'select') return;
      options[field.field_key] = resolveSelectOptions(field, {
        states: availableStates,
        districts: availableDistricts,
        cities: availableCities,
        designations: availableDesignations
      });
    });
    return options;
  }, [availableCities, availableDesignations, availableDistricts, availableStates, localFields]);

  const isSelectedFieldRequirable = selectedField ? canSelectFieldBeRequired(selectedField) : true;
  const selectedFieldIsEffectivelyRequired = selectedField ? selectedField.is_required && isSelectedFieldRequirable : false;

  const q = searchQuery.toLowerCase().trim();

  const paletteInForm = useMemo(
    () => localFields.filter(f => !q || f.label.toLowerCase().includes(q) || f.field_key.includes(q)),
    [localFields, q]
  );

  const paletteLibrary = useMemo(
    () => libraryItems.filter(i => !attachedKeys.has(i.field_key) && (!q || i.label.toLowerCase().includes(q) || i.field_key.includes(q))),
    [libraryItems, attachedKeys, q]
  );

  const sectionedCanvas = useMemo(() => {
    const sections: { name: string; fields: { field: FormBuilderSchemaFieldV2; globalIndex: number }[] }[] = [];
    const idx = new Map<string, number>();
    localFields.forEach((field, globalIndex) => {
      if (!idx.has(field.section_name)) {
        idx.set(field.section_name, sections.length);
        sections.push({ name: field.section_name, fields: [] });
      }
      sections[idx.get(field.section_name)!].fields.push({ field, globalIndex });
    });
    return sections;
  }, [localFields]);

  // ── handlers ──────────────────────────────────────────────────────────────

  const markChanged = useCallback(() => {
    changeVersionRef.current += 1;
    setHasChanges(true);
    setPublishStatus('unsaved');
  }, []);

  const updateField = (fieldKey: string, patch: Partial<FormBuilderSchemaFieldV2>) => {
    setLocalFields(prev => prev.map(f => {
      if (f.field_key !== fieldKey) return f;
      const next = { ...f, ...patch };
      if (patch.is_visible === false) next.is_required = false;
      if (patch.is_required === true && !canSelectFieldBeRequired(next)) {
        next.is_required = false;
      }
      return next;
    }));
    markChanged();
  };

  const moveField = (index: number, dir: 'up' | 'down') => {
    setLocalFields(prev => {
      const next = [...prev];
      const swap = dir === 'up' ? index - 1 : index + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });
    markChanged();
  };

  const handleAttach = async (fieldKey: string) => {
    if (!formKey) return;
    setIsAttaching(fieldKey);
    const result = await formBuilderV21Service.attachField({ form_key: formKey, field_key: fieldKey, is_visible: true, is_required: false });
    if (result.success) {
      await loadSchema();
      setSelectedKey(fieldKey);
    } else {
      showToast('error', result.error || 'Failed to add field');
    }
    setIsAttaching(null);
  };

  const handleDetach = async (fieldKey: string) => {
    if (!formKey || !confirm('Remove this field from the form?')) return;
    setIsDetaching(fieldKey);
    const result = await formBuilderV21Service.detachField(formKey, fieldKey);
    if (result.success) {
      if (selectedKey === fieldKey) setSelectedKey(null);
      await loadSchema();
    } else {
      showToast('error', result.error || 'Failed to remove field');
    }
    setIsDetaching(null);
  };

  const persistDraft = useCallback(async (options?: { silentSuccess?: boolean }) => {
    if (!formKey) return false;
    const saveVersion = changeVersionRef.current;
    setIsAutoSaving(true);
    const payload = fieldSnapshotRef.current.map((f, i) => ({
      field_key: f.field_key,
      is_visible: f.is_visible,
      is_required: f.is_required,
      display_order: i
    }));
    const result = await formBuilderV21Service.saveFieldSettings(formKey, payload);
    if (result.success) {
      if (!options?.silentSuccess) {
        showToast('success', 'Draft saved');
      }
      if (changeVersionRef.current === saveVersion) {
        setHasChanges(false);
        setPublishStatus('saved');
      }
      setIsAutoSaving(false);
      return true;
    } else {
      showToast('error', result.error || 'Failed to save');
      setPublishStatus('unsaved');
      setIsAutoSaving(false);
      return false;
    }
  }, [formKey, showToast]);

  const handlePublish = async () => {
    if (!formKey) return;
    setIsPublishing(true);
    if (hasChanges) {
      const saved = await persistDraft({ silentSuccess: true });
      if (!saved) {
        setIsPublishing(false);
        return;
      }
    }
    const result = await formBuilderV21Service.publishFormToLive(formKey);
    if (result.success) {
      showToast('success', 'Published to live successfully');
      setPublishStatus('published');
      setShowPublishModal(false);
      await loadLivePublishStatus();
      await loadSchema();
    } else {
      showToast('error', result.error || 'Failed to publish');
    }
    setIsPublishing(false);
  };

  const handleUnpublish = async () => {
    if (!formKey) return;
    setIsUnpublishing(true);
    const result = await formBuilderV21Service.unpublishForm(formKey);
    if (result.success) {
      showToast('success', 'Form taken offline. Visitors will see "Form unavailable" until you publish again.');
      setShowUnpublishModal(false);
      await loadLivePublishStatus();
      await loadSchema();
    } else {
      showToast('error', result.error || 'Failed to take form offline');
    }
    setIsUnpublishing(false);
  };

  useEffect(() => {
    if (!canManage || !hasChanges || !formKey) return;
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    autoSaveTimeoutRef.current = setTimeout(() => {
      void persistDraft({ silentSuccess: true });
    }, 700);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [canManage, hasChanges, formKey, localFields, persistDraft]);

  // ── status display ────────────────────────────────────────────────────────

  const statusEl = (() => {
    if (isAutoSaving) return <span className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-3 py-1 rounded-full"><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving draft</span>;
    if (publishStatus === 'published') return <span className="flex items-center gap-1.5 text-xs font-medium text-success bg-success/10 px-3 py-1 rounded-full"><CheckCircle className="w-3.5 h-3.5" />Published to live</span>;
    if (publishStatus === 'unsaved') return <span className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-3 py-1 rounded-full"><AlertCircle className="w-3.5 h-3.5" />Unsaved changes</span>;
    if (publishStatus === 'saved') return <span className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-3 py-1 rounded-full"><Check className="w-3.5 h-3.5" />Draft saved</span>;
    return <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">Draft</span>;
  })();

  const livePublishEl = (() => {
    const origin = livePublishStatus?.live_publish_origin
      ?? schema?.form.live_publish_origin
      ?? (schema?.form.live_published_at
        ? (schema?.form.live_published_by ? 'manual_publish' : 'legacy_seeded')
        : 'never_published');
    const publishedAt = livePublishStatus?.live_published_at ?? schema?.form.live_published_at ?? null;
    const publishedByEmail = livePublishStatus?.live_published_by_email ?? schema?.form.live_published_by_email ?? null;

    const titleParts: string[] = [];
    if (publishedAt) titleParts.push(new Date(publishedAt).toLocaleString());
    if (publishedByEmail) titleParts.push(publishedByEmail);
    const title = titleParts.length > 0 ? titleParts.join(' • ') : undefined;

    if (origin === 'manual_publish') {
      return (
        <span title={title}
          className="flex items-center gap-1.5 text-xs font-medium text-success bg-success/10 px-3 py-1 rounded-full">
          <CheckCircle className="w-3 h-3" />Live
        </span>
      );
    }
    if (origin === 'legacy_seeded') {
      return (
        <span title="Currently live from initial seed — not yet manually published"
          className="flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
          <AlertCircle className="w-3 h-3" />Live (seeded)
        </span>
      );
    }
    if (origin === 'unpublished') {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-destructive bg-destructive/10 px-3 py-1 rounded-full">
          <CloudOff className="w-3 h-3" />Offline
        </span>
      );
    }
    // never_published
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full">
        Not published
      </span>
    );
  })();

  // ── early returns ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading studio…</span>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center text-center p-8">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Form not found</h2>
          <p className="text-muted-foreground">No form with key <code className="bg-muted-foreground/20 px-2 py-0.5 rounded">{formKey}</code> exists.</p>
        </div>
      </div>
    );
  }

  // ── main render ───────────────────────────────────────────────────────────

  return (
    <PermissionGate
      permission="settings.forms.view"
      fallback={
        <div className="min-h-screen bg-muted flex items-center justify-center text-center p-8">
          <div>
            <Lock className="w-16 h-16 text-muted-foreground/40 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
            <p className="text-muted-foreground">You don't have permission to use the form studio.</p>
          </div>
        </div>
      }
    >
      <div className="h-screen flex flex-col bg-muted">
        <Toast type={toast.type} message={toast.message} isVisible={toast.isVisible} onClose={hideToast} />
        {showPublishModal && (
          <PublishModal
            formName={displayFormName}
            onConfirm={handlePublish}
            onCancel={() => setShowPublishModal(false)}
            isPublishing={isPublishing}
          />
        )}
        {showUnpublishModal && (
          <UnpublishModal
            formName={displayFormName}
            onConfirm={handleUnpublish}
            onCancel={() => setShowUnpublishModal(false)}
            isUnpublishing={isUnpublishing}
          />
        )}

        {/* ── Top Action Bar ─────────────────────────────────────────────── */}
        <div className="h-14 flex-shrink-0 bg-card border-b border-border flex items-center px-4 gap-4 shadow-sm z-10">
          <a
            href="/admin/settings/forms/builder"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mr-2"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Close Studio</span>
          </a>

          <div className="h-5 w-px bg-border" />

          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">
              {displayFormName}
            </span>
            <code className="ml-2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded hidden sm:inline">
              {formKey}
            </code>
            {!schema?.form.is_active && (
              <span className="ml-2 text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Archived</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Preview */}
            {(() => {
              const previewPath = formKey === 'signup'
                ? '/signup?preview=1'
                : formKey === 'signin'
                  ? '/signin?preview=1'
                  : formKey === 'join_lub'
                    ? '/join?preview=1'
                    : formKey === 'member_edit'
                      ? '/dashboard/edit?preview=1'
                      : null;

              if (previewPath) {
                return (
                  <a
                    href={previewPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-foreground bg-card hover:bg-muted/50 transition-colors"
                    title="Preview in a new tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Preview</span>
                  </a>
                );
              }

              return (
                <button
                  type="button"
                  onClick={() => showToast('error', 'Page preview is not available for this form.')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted-foreground bg-card hover:bg-muted/50 transition-colors"
                  title="Page preview not available for this form"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Preview</span>
                </button>
              );
            })()}

            {livePublishEl}
            {statusEl}
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={() => setShowPublishModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition-colors font-medium"
                >
                  <Send className="w-3.5 h-3.5" />
                  Publish to Live
                </button>
                {/* Unpublish — only when form is currently live */}
                {(() => {
                  const origin = livePublishStatus?.live_publish_origin
                    ?? schema?.form.live_publish_origin
                    ?? 'never_published';
                  const isCurrentlyLive = origin === 'manual_publish' || origin === 'legacy_seeded';
                  if (!isCurrentlyLive) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => setShowUnpublishModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-destructive/40 rounded-lg text-sm text-destructive bg-card hover:bg-destructive/10 transition-colors"
                      title="Take this form offline"
                    >
                      <CloudOff className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Unpublish</span>
                    </button>
                  );
                })()}
              </>
            )}
          </div>
        </div>

        {/* ── Three Panels ──────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Left: Field Palette ──────────────────────────────────────── */}
          <div className="w-72 flex-shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">
            <div className="p-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search fields…"
                  className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-ring bg-background text-foreground"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* In This Form */}
              <div>
                <button
                  type="button"
                  onClick={() => setExpandPalette(p => ({ ...p, inForm: !p.inForm }))}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/30 transition-colors"
                >
                  <span>In this form ({paletteInForm.length})</span>
                  {expandPalette.inForm ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {expandPalette.inForm && (
                  <div className="pb-1">
                    {paletteInForm.length === 0 ? (
                      <p className="px-4 py-2 text-xs text-muted-foreground">No fields in form yet.</p>
                    ) : paletteInForm.map(field => (
                      <button
                        key={field.field_key}
                        type="button"
                        onClick={() => { setSelectedKey(field.field_key); const el = document.getElementById(`canvas-field-${field.field_key}`); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                        className={`w-full text-left px-4 py-2.5 flex items-center gap-2 transition-colors ${selectedKey === field.field_key ? 'bg-primary/10' : 'hover:bg-muted/30'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{field.label}</p>
                          <p className="text-[10px] text-muted-foreground font-mono truncate">{field.field_key}</p>
                        </div>
                        {typeBadge(field.field_type)}
                        {!field.is_visible && <EyeOff className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                        {selectedKey === field.field_key && <Check className="w-3 h-3 text-primary flex-shrink-0" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-border" />

              {/* Library — Add to Form */}
              <div>
                <button
                  type="button"
                  onClick={() => setExpandPalette(p => ({ ...p, library: !p.library }))}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/30 transition-colors"
                >
                  <span>Add from library ({paletteLibrary.length})</span>
                  {expandPalette.library ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {expandPalette.library && (
                  <div className="pb-1">
                    {paletteLibrary.length === 0 ? (
                      <p className="px-4 py-2 text-xs text-muted-foreground">
                        {searchQuery ? 'No matching fields.' : 'All library fields are already in this form.'}
                      </p>
                    ) : paletteLibrary.map(item => (
                      <button
                        key={item.field_key}
                        type="button"
                        onClick={() => handleAttach(item.field_key)}
                        disabled={isAttaching === item.field_key}
                        className="w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-muted/30 transition-colors disabled:opacity-60 group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground truncate">{item.label}</p>
                          <p className="text-[10px] text-muted-foreground font-mono truncate">{item.field_key}</p>
                        </div>
                        {typeBadge(item.field_type)}
                        {isAttaching === item.field_key
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground flex-shrink-0" />
                          : <Plus className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary flex-shrink-0 transition-colors" />
                        }
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Center: Form Canvas ──────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto p-8 bg-muted/30">
            <div className="max-w-xl mx-auto">
              {/* Canvas header */}
              <div className="bg-card rounded-2xl shadow-sm border border-border p-6 mb-4">
                <h2 className="text-xl font-bold text-foreground">{displayFormName}</h2>
                {displayFormDescription && (
                  <p className="text-sm text-muted-foreground mt-1">{displayFormDescription}</p>
                )}
              </div>

              {localFields.length === 0 ? (
                <div className="bg-card rounded-2xl border-2 border-dashed border-border p-12 text-center">
                  <Plus className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground">No fields yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Add fields from the palette on the left</p>
                </div>
              ) : (
                sectionedCanvas.map(section => (
                  <div key={section.name} className="mb-6">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{section.name}</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    {section.fields.map(({ field, globalIndex }) => (
                      <div id={`canvas-field-${field.field_key}`} key={field.field_key}>
                        <CanvasField
                          field={field}
                          selectOptions={selectOptionsByFieldKey[field.field_key] || []}
                          isEffectivelyRequired={field.is_required && canSelectFieldBeRequired(field)}
                          index={globalIndex}
                          total={localFields.length}
                          isSelected={selectedKey === field.field_key}
                          canManage={canManage}
                          onClick={() => setSelectedKey(field.field_key)}
                          onMoveUp={() => moveField(globalIndex, 'up')}
                          onMoveDown={() => moveField(globalIndex, 'down')}
                          onDetach={() => handleDetach(field.field_key)}
                        />
                      </div>
                    ))}
                  </div>
                ))
              )}

              {localFields.length > 0 && (
                <div className="bg-card rounded-2xl border border-border p-4 text-center mt-2">
                  <button type="button" disabled className="w-full px-6 py-3 bg-muted text-muted-foreground rounded-xl text-sm font-medium cursor-not-allowed">
                    Create Account
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: Properties Inspector ──────────────────────────────── */}
          <div className="w-80 flex-shrink-0 border-l border-border bg-card flex flex-col overflow-y-auto">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Properties</h3>
            </div>

            {!selectedField ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="p-4 bg-muted/50 rounded-full mb-4">
                  <AlertCircle className="w-6 h-6 text-muted-foreground/60" />
                </div>
                <p className="text-sm font-medium text-foreground">No field selected</p>
                <p className="text-xs text-muted-foreground mt-1">Click a field on the canvas to inspect and configure it.</p>
              </div>
            ) : (
              <div className="flex-1 p-4 space-y-5">
                {/* Field Identity */}
                <div className="space-y-1 pb-4 border-b border-border">
                  <div className="flex items-center gap-2 flex-wrap">
                    {typeBadge(selectedField.field_type)}
                    {selectedField.is_locked && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                    {selectedField.is_system_field && <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">System</span>}
                  </div>
                  <p className="text-base font-semibold text-foreground">{selectedField.label}</p>
                  <code className="text-[10px] text-muted-foreground">{selectedField.field_key}</code>
                  {selectedField.section_name && (
                    <p className="text-xs text-muted-foreground">Section: {selectedField.section_name}</p>
                  )}
                  {selectedField.placeholder && (
                    <p className="text-xs text-muted-foreground">Placeholder: {selectedField.placeholder}</p>
                  )}
                  {selectedField.help_text && (
                    <p className="text-xs text-muted-foreground">Help: {selectedField.help_text}</p>
                  )}
                  {(selectOptionsByFieldKey[selectedField.field_key] || []).length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Options: {(selectOptionsByFieldKey[selectedField.field_key] || []).map(option => option.label).join(', ')}
                    </p>
                  )}
                  {!selectedField.is_locked && (
                    <a href="/admin/settings/forms/library" target="_blank" rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline inline-block mt-1">
                      Edit label / options in Field Library ↗
                    </a>
                  )}
                </div>

                {/* Visibility */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Visibility</p>
                  {canManage && !selectedField.is_locked ? (
                    <button
                      type="button"
                      onClick={() => updateField(selectedField.field_key, { is_visible: !selectedField.is_visible })}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        selectedField.is_visible
                          ? 'bg-primary/10 text-primary hover:bg-primary/20'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {selectedField.is_visible ? <><Eye className="w-4 h-4" />Visible</> : <><EyeOff className="w-4 h-4" />Hidden</>}
                    </button>
                  ) : (
                    <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${selectedField.is_visible ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                      {selectedField.is_visible ? <><Eye className="w-4 h-4" />Visible</> : <><EyeOff className="w-4 h-4" />Hidden</>}
                    </span>
                  )}
                </div>

                {/* Required */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Required</p>
                  {canManage && !selectedField.is_locked ? (
                    <button
                      type="button"
                      onClick={() => updateField(selectedField.field_key, { is_required: !selectedFieldIsEffectivelyRequired })}
                      disabled={!selectedField.is_visible || !isSelectedFieldRequirable}
                      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        !selectedField.is_visible || !isSelectedFieldRequirable
                          ? 'bg-muted text-muted-foreground cursor-not-allowed opacity-50'
                          : selectedFieldIsEffectivelyRequired
                          ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {selectedFieldIsEffectivelyRequired
                        ? <><CheckCircle className="w-4 h-4" />Required</>
                        : <><XCircle className="w-4 h-4" />Optional</>
                      }
                    </button>
                  ) : (
                    <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${selectedFieldIsEffectivelyRequired ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                      {selectedFieldIsEffectivelyRequired ? <><CheckCircle className="w-4 h-4" />Required</> : <><XCircle className="w-4 h-4" />Optional</>}
                    </span>
                  )}
                  {!selectedField.is_visible && (
                    <p className="text-xs text-muted-foreground mt-1">Enable visibility to set required.</p>
                  )}
                  {selectedField.field_type === 'select' && !isSelectedFieldRequirable && (
                    <p className="text-xs text-muted-foreground mt-1">
                      This select field has no controlled source or saved options, so it can only be optional.
                    </p>
                  )}
                </div>

                {/* Order */}
                {canManage && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Order</p>
                    <div className="flex gap-2">
                      {(() => {
                        const idx = localFields.findIndex(f => f.field_key === selectedKey);
                        return (
                          <>
                            <button type="button" onClick={() => moveField(idx, 'up')} disabled={idx <= 0}
                              className="inline-flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                              <ArrowUp className="w-3.5 h-3.5" />Move Up
                            </button>
                            <button type="button" onClick={() => moveField(idx, 'down')} disabled={idx >= localFields.length - 1}
                              className="inline-flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                              <ArrowDown className="w-3.5 h-3.5" />Move Down
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Detach */}
                {canManage && !selectedField.is_system_field && (
                  <div className="pt-4 border-t border-border">
                    <button
                      type="button"
                      onClick={() => handleDetach(selectedField.field_key)}
                      disabled={isDetaching === selectedField.field_key}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-destructive/30 rounded-lg text-sm text-destructive hover:bg-destructive/5 disabled:opacity-50 transition-colors"
                    >
                      {isDetaching === selectedField.field_key
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Unlink className="w-3.5 h-3.5" />
                      }
                      Remove from Form
                    </button>
                  </div>
                )}

                {selectedField.is_locked && (
                  <div className="mt-2 p-3 bg-muted/50 rounded-lg border border-border flex items-center gap-2 text-xs text-muted-foreground">
                    <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                    This is a locked field. Visibility and required settings cannot be changed.
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </PermissionGate>
  );
};

export default AdminFormStudio;

