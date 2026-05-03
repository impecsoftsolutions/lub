import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  Calendar,
  Check,
  Clock3,
  Globe,
  GlobeLock,
  Loader2,
  Lock,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import {
  eventsService,
  type AdminEventDetail,
  type EventAIDraftSourceFile,
  type EventAgendaItem,
  type EventType,
  type EventVisibility,
} from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { PageHeader } from '../components/ui/PageHeader';
import Toast from '../components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const EVENT_TYPE_OPTIONS: Array<{ value: EventType; label: string }> = [
  { value: 'workshop', label: 'Workshop' },
  { value: 'seminar', label: 'Seminar' },
  { value: 'webinar', label: 'Webinar' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'exhibition', label: 'Exhibition' },
  { value: 'conference', label: 'Conference' },
  { value: 'networking', label: 'Networking' },
  { value: 'other', label: 'Other' },
  { value: 'general', label: 'General' },
];

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,79})$/;
const MAX_BRIEF_CHARS = 4000;
const MAX_SOURCE_FILES = 3;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
const ALLOWED_SOURCE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function toDateTimeInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

function toDateTimeInputFromIsoLoose(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  // Accept ISO 8601 with or without TZ.
  return toDateTimeInput(trimmed);
}

function normalizeAgendaItems(items: EventAgendaItem[]): EventAgendaItem[] {
  return items
    .map((item) => ({
      title: (item.title ?? '').trim(),
      time: item.time?.toString().trim() || null,
      note: item.note?.toString().trim() || null,
    }))
    .filter((item) => item.title.length > 0);
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

interface AttachedSource {
  id: string;
  file: File;
  base64?: string;
  loading: boolean;
  error?: string;
}

type SlugStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; normalized: string }
  | { kind: 'taken'; normalized: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'error'; message: string };

const AdminEventForm: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const canCreate = useHasPermission('events.create');
  const canEditAny = useHasPermission('events.edit_any');
  const canEditOwn = useHasPermission('events.edit_own');
  const canPublish = useHasPermission('events.publish');
  const canArchive = useHasPermission('events.archive');
  const canDelete = useHasPermission('events.delete');

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugLocked, setSlugLocked] = useState(false);
  const [slugEditing, setSlugEditing] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>({ kind: 'idle' });
  const [excerpt, setExcerpt] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState<EventType>('general');
  const [visibility, setVisibility] = useState<EventVisibility>('public');
  const [isFeatured, setIsFeatured] = useState(false);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [location, setLocation] = useState('');
  const [invitationText, setInvitationText] = useState('');
  const [agendaItems, setAgendaItems] = useState<EventAgendaItem[]>([{ title: '', time: '', note: '' }]);
  const [showAgendaPublicly, setShowAgendaPublicly] = useState(false);
  const [aiMetadata, setAiMetadata] = useState<Record<string, unknown> | null>(null);

  const [original, setOriginal] = useState<AdminEventDetail | null>(null);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);

  const [brief, setBrief] = useState('');
  const [sources, setSources] = useState<AttachedSource[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiStatus, setAiStatus] = useState<'idle' | 'partial' | 'success' | 'failed'>('idle');
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  // Auto-derive slug from title when slug is NOT locked AND not currently being edited.
  useEffect(() => {
    if (slugLocked || slugEditing) return;
    setSlug(slugify(title));
  }, [title, slugLocked, slugEditing]);

  useEffect(() => {
    if (!isEdit || !id) return;
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const token = sessionManager.getSessionToken();
        if (!token) {
          showToast('error', 'Session expired.');
          return;
        }
        const data = await eventsService.getById(token, id);
        if (!data) {
          showToast('error', 'Event not found.');
          navigate('/admin/content/events');
          return;
        }
        if (cancelled) return;

        setOriginal(data);
        setTitle(data.title);
        setSlug(data.slug);
        setSlugLocked(Boolean(data.slug_locked));
        setExcerpt(data.excerpt ?? '');
        setDescription(data.description ?? '');
        setEventType(data.event_type);
        setVisibility(data.visibility);
        setIsFeatured(data.is_featured);
        setStartAt(toDateTimeInput(data.start_at));
        setEndAt(toDateTimeInput(data.end_at));
        setLocation(data.location ?? '');
        setInvitationText(data.invitation_text ?? '');
        setShowAgendaPublicly(Boolean(data.show_agenda_publicly));
        setAiMetadata(data.ai_metadata ?? null);

        const initialAgenda = Array.isArray(data.agenda_items) && data.agenda_items.length > 0
          ? data.agenda_items.map((item) => ({
              title: item.title ?? '',
              time: item.time ?? '',
              note: item.note ?? '',
            }))
          : [{ title: '', time: '', note: '' }];
        setAgendaItems(initialAgenda);
      } catch (err) {
        console.error('[AdminEventForm] load error:', err);
        showToast('error', 'Failed to load event.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, isEdit, navigate, showToast]);

  // ── Slug availability (debounced) ──────────────────────────────────────────
  useEffect(() => {
    if (!slugLocked || !slugEditing) {
      setSlugStatus({ kind: 'idle' });
      return;
    }
    const value = slug.trim();
    if (!value) {
      setSlugStatus({ kind: 'invalid', message: 'Slug is required.' });
      return;
    }
    if (!SLUG_REGEX.test(value)) {
      setSlugStatus({ kind: 'invalid', message: 'Use lowercase a-z / 0-9 / hyphens (max 80).' });
      return;
    }

    setSlugStatus({ kind: 'checking' });
    const handle = window.setTimeout(async () => {
      try {
        const token = sessionManager.getSessionToken();
        if (!token) {
          setSlugStatus({ kind: 'error', message: 'Session expired.' });
          return;
        }
        const result = await eventsService.checkSlugAvailable(token, value, isEdit ? id : null);
        if (!result.success) {
          setSlugStatus({
            kind: 'error',
            message: result.error ?? 'Could not verify slug.',
          });
          return;
        }
        if (result.available) {
          setSlugStatus({ kind: 'available', normalized: result.normalizedSlug ?? value });
        } else {
          setSlugStatus({ kind: 'taken', normalized: result.normalizedSlug ?? value });
        }
      } catch (err) {
        console.error('[AdminEventForm] slug check error:', err);
        setSlugStatus({ kind: 'error', message: 'Could not verify slug.' });
      }
    }, 400);

    return () => window.clearTimeout(handle);
  }, [slug, slugLocked, slugEditing, isEdit, id]);

  // ── Source file attach ─────────────────────────────────────────────────────
  const totalSourceBytes = useMemo(
    () => sources.reduce((acc, s) => acc + (s.file.size ?? 0), 0),
    [sources],
  );

  const onAttachClick = () => {
    fileInputRef.current?.click();
  };

  const onFilesPicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (picked.length === 0) return;

    const remainingSlots = MAX_SOURCE_FILES - sources.length;
    if (remainingSlots <= 0) {
      showToast('error', `You can attach up to ${MAX_SOURCE_FILES} files.`);
      return;
    }

    let runningTotal = totalSourceBytes;
    const toAdd: AttachedSource[] = [];
    for (const file of picked.slice(0, remainingSlots)) {
      const mime = file.type.toLowerCase();
      if (!ALLOWED_SOURCE_MIMES.has(mime)) {
        showToast('error', `"${file.name}" is not a supported type. Allowed: JPEG, PNG, PDF.`);
        continue;
      }
      const perFileLimit = mime === 'application/pdf' ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
      if (file.size > perFileLimit) {
        showToast(
          'error',
          `"${file.name}" exceeds the per-file size limit (${mime === 'application/pdf' ? '20 MB' : '10 MB'}).`,
        );
        continue;
      }
      if (runningTotal + file.size > MAX_TOTAL_BYTES) {
        showToast('error', 'Total attached size cannot exceed 30 MB.');
        break;
      }
      runningTotal += file.size;
      toAdd.push({
        id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        loading: true,
      });
    }

    if (toAdd.length === 0) return;
    setSources((prev) => [...prev, ...toAdd]);

    for (const item of toAdd) {
      try {
        const base64 = await readFileAsBase64(item.file);
        setSources((prev) =>
          prev.map((s) => (s.id === item.id ? { ...s, base64, loading: false } : s)),
        );
      } catch (err) {
        console.error('[AdminEventForm] readFileAsBase64 error:', err);
        setSources((prev) =>
          prev.map((s) =>
            s.id === item.id
              ? { ...s, loading: false, error: err instanceof Error ? err.message : 'Read failed' }
              : s,
          ),
        );
      }
    }
  };

  const removeSource = (idToRemove: string) => {
    setSources((prev) => prev.filter((s) => s.id !== idToRemove));
  };

  // ── AI generation ──────────────────────────────────────────────────────────
  const applyDraft = useCallback((draft: NonNullable<Parameters<typeof setOriginal>[0]> | Awaited<ReturnType<typeof eventsService.draftFromBrief>>['data'] | null | undefined) => {
    if (!draft) return;
    if (draft.title) setTitle(draft.title);
    if (draft.slug) {
      setSlug(slugify(draft.slug));
      setSlugLocked(false);
      setSlugEditing(false);
    }
    if (typeof draft.excerpt === 'string') setExcerpt(draft.excerpt);
    if (typeof draft.description === 'string') setDescription(draft.description);
    if (draft.event_type) setEventType(draft.event_type as EventType);
    if (draft.visibility === 'public' || draft.visibility === 'member_only') {
      setVisibility(draft.visibility);
    }
    setStartAt(toDateTimeInputFromIsoLoose(draft.start_at ?? null));
    setEndAt(toDateTimeInputFromIsoLoose(draft.end_at ?? null));
    if (typeof draft.location === 'string') setLocation(draft.location ?? '');
    if (typeof draft.invitation_text === 'string') setInvitationText(draft.invitation_text);
    if (Array.isArray(draft.agenda_items) && draft.agenda_items.length > 0) {
      setAgendaItems(
        draft.agenda_items.map((item) => ({
          title: item.title ?? '',
          time: item.time ?? '',
          note: item.note ?? '',
        })),
      );
      setShowAgendaPublicly(Boolean(draft.show_agenda_publicly));
    }
  }, []);

  const runGenerate = useCallback(async () => {
    if (!brief.trim() && sources.length === 0) {
      showToast('error', 'Add an Event Brief or attach at least one reference file.');
      return;
    }
    const sessionToken = sessionManager.getSessionToken();
    if (!sessionToken) {
      showToast('error', 'Session expired.');
      return;
    }
    if (sources.some((s) => s.loading)) {
      showToast('error', 'Please wait while attached files finish loading.');
      return;
    }
    const sourceFiles: EventAIDraftSourceFile[] = sources
      .filter((s) => s.base64)
      .map((s) => ({ name: s.file.name, mime: s.file.type, base64: s.base64! }));

    setIsGenerating(true);
    setAiStatus('idle');
    try {
      const result = await eventsService.draftFromBrief(sessionToken, {
        brief: brief.trim(),
        mode: 'draft',
        sourceFiles,
      });
      if (!result.success || !result.data) {
        const message = result.error ?? 'AI drafting failed.';
        showToast('error', message);
        setAiStatus('failed');
        return;
      }
      applyDraft(result.data);
      const fieldsTouched = [result.data.title, result.data.description, result.data.invitation_text]
        .filter((v) => Boolean((v ?? '').trim())).length;
      setAiStatus(fieldsTouched >= 2 ? 'success' : 'partial');
      if (result.ai) {
        setAiMetadata(result.ai as Record<string, unknown>);
      }
      showToast('success', 'AI draft applied. Review and edit any field.');
    } catch (err) {
      console.error('[AdminEventForm] generate error:', err);
      setAiStatus('failed');
      showToast('error', 'AI drafting failed. Please retry.');
    } finally {
      setIsGenerating(false);
    }
  }, [applyDraft, brief, showToast, sources]);

  const handleGenerateClick = () => {
    if (isEdit && original?.status === 'published') {
      setShowOverwriteConfirm(true);
      return;
    }
    void runGenerate();
  };

  const confirmOverwriteAndGenerate = () => {
    setShowOverwriteConfirm(false);
    void runGenerate();
  };

  // ── Agenda editor ──────────────────────────────────────────────────────────
  const onAgendaChange = (index: number, key: keyof EventAgendaItem, value: string) => {
    setAgendaItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  };
  const addAgendaRow = () => {
    setAgendaItems((prev) => [...prev, { title: '', time: '', note: '' }]);
  };
  const removeAgendaRow = (index: number) => {
    setAgendaItems((prev) => {
      if (prev.length === 1) return [{ title: '', time: '', note: '' }];
      return prev.filter((_, i) => i !== index);
    });
  };

  // ── Slug edit toggle ───────────────────────────────────────────────────────
  const onSlugEditClick = () => {
    setSlugEditing(true);
    setSlugLocked(true);
  };
  const onSlugResetAuto = () => {
    setSlugLocked(false);
    setSlugEditing(false);
    setSlug(slugify(title));
    setSlugStatus({ kind: 'idle' });
  };

  // ── Save / publish / archive / delete ──────────────────────────────────────
  const buildPayload = (): Record<string, unknown> => ({
    title: title.trim(),
    slug: slug.trim(),
    slug_locked: slugLocked,
    excerpt: excerpt.trim() || null,
    description: description.trim() || null,
    event_type: eventType,
    visibility,
    is_featured: isFeatured,
    start_at: startAt ? new Date(startAt).toISOString() : null,
    end_at: endAt ? new Date(endAt).toISOString() : null,
    location: location.trim() || null,
    invitation_text: invitationText.trim() || null,
    agenda_items: normalizeAgendaItems(agendaItems),
    show_agenda_publicly: showAgendaPublicly,
    ai_metadata: aiMetadata ?? null,
  });

  const slugBlocksSave =
    slugLocked && slugEditing &&
    (slugStatus.kind === 'taken' || slugStatus.kind === 'invalid' || slugStatus.kind === 'checking');

  const saveEvent = async (): Promise<string | null> => {
    if (!title.trim()) {
      showToast('error', 'Title is required.');
      return null;
    }
    if (slugBlocksSave) {
      showToast('error', 'Resolve the slug issue before saving.');
      return null;
    }
    if (startAt && endAt && new Date(endAt) < new Date(startAt)) {
      showToast('error', 'End time must be after start time.');
      return null;
    }
    const token = sessionManager.getSessionToken();
    if (!token) {
      showToast('error', 'Session expired.');
      return null;
    }
    const payload = buildPayload();

    if (isEdit && id) {
      const result = await eventsService.update(token, id, payload);
      if (!result.success) {
        if (result.error_code === 'slug_conflict') {
          setSlugStatus({ kind: 'taken', normalized: result.conflict_slug ?? slug });
          setSlugEditing(true);
          showToast('error', 'Slug is already taken. Pick another or reset to auto.');
          return null;
        }
        showToast('error', result.error ?? 'Failed to save event.');
        return null;
      }
      showToast('success', 'Event saved.');
      return id;
    }

    const result = await eventsService.create(token, payload);
    if (!result.success || !result.event_id) {
      if (result.error_code === 'slug_conflict') {
        setSlugStatus({ kind: 'taken', normalized: result.conflict_slug ?? slug });
        setSlugEditing(true);
        showToast('error', 'Slug is already taken. Pick another or reset to auto.');
        return null;
      }
      showToast('error', result.error ?? 'Failed to create event.');
      return null;
    }
    showToast('success', 'Event created.');
    return result.event_id;
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const savedId = await saveEvent();
      if (!savedId) return;
      navigate(`/admin/content/events/${savedId}/edit`);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    setIsSaving(true);
    try {
      const savedId = await saveEvent();
      if (!savedId) return;
      const token = sessionManager.getSessionToken();
      if (!token) {
        showToast('error', 'Session expired.');
        return;
      }
      const result = await eventsService.publish(token, savedId);
      if (!result.success) {
        showToast('error', result.error ?? 'Failed to publish event.');
        return;
      }
      showToast('success', 'Event published.');
      navigate('/admin/content/events');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!id) return;
    setIsSaving(true);
    try {
      const token = sessionManager.getSessionToken();
      if (!token) {
        showToast('error', 'Session expired.');
        return;
      }
      const result = await eventsService.archive(token, id);
      if (!result.success) {
        showToast('error', result.error ?? 'Failed to archive event.');
        return;
      }
      showToast('success', 'Event archived.');
      navigate('/admin/content/events');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !window.confirm('Permanently delete this event? This cannot be undone.')) return;
    setIsSaving(true);
    try {
      const token = sessionManager.getSessionToken();
      if (!token) {
        showToast('error', 'Session expired.');
        return;
      }
      const result = await eventsService.delete(token, id);
      if (!result.success) {
        showToast('error', result.error ?? 'Failed to delete event.');
        return;
      }
      showToast('success', 'Event deleted.');
      navigate('/admin/content/events');
    } finally {
      setIsSaving(false);
    }
  };

  const canEdit = isEdit ? (canEditAny || canEditOwn) : canCreate;

  if (isLoading) {
    return (
      <PermissionGate permission="events.view">
        <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading event...
        </div>
      </PermissionGate>
    );
  }

  // Slug indicator render helper
  const renderSlugIndicator = () => {
    if (!slugLocked || !slugEditing) return null;
    switch (slugStatus.kind) {
      case 'idle':
        return null;
      case 'checking':
        return (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Checking...
          </span>
        );
      case 'available':
        return (
          <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
            <Check className="h-3 w-3" />
            Available
          </span>
        );
      case 'taken':
        return (
          <span className="inline-flex items-center gap-1 text-xs text-destructive">
            <X className="h-3 w-3" />
            Already taken
          </span>
        );
      case 'invalid':
        return (
          <span className="inline-flex items-center gap-1 text-xs text-destructive">
            <X className="h-3 w-3" />
            {slugStatus.message}
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
            <RefreshCw className="h-3 w-3" />
            {slugStatus.message}
          </span>
        );
    }
  };

  return (
    <PermissionGate permission="events.view">
      <div className="space-y-6">
        {toast && (
          <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
        )}

        <Link
          to="/admin/content/events"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Events
        </Link>

        <PageHeader
          title={isEdit ? 'Edit Event' : 'New Event'}
          subtitle="Use the Event Brief to AI-fill the form, then review and edit any field."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <Button variant="outline" onClick={() => void handleSave()} disabled={isSaving || slugBlocksSave}>
                  {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Draft
                </Button>
              )}
              {canPublish && (
                <Button onClick={() => void handlePublish()} disabled={isSaving || !canEdit || slugBlocksSave}>
                  {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-2" />}
                  {isEdit && original?.status === 'published' ? 'Republish' : 'Publish'}
                </Button>
              )}
              {isEdit && canArchive && (
                <Button variant="outline" onClick={() => void handleArchive()} disabled={isSaving}>
                  <Archive className="h-4 w-4 mr-2" />
                  Archive
                </Button>
              )}
              {isEdit && canDelete && (
                <Button variant="destructive" onClick={() => void handleDelete()} disabled={isSaving}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}
            </div>
          }
        />

        {/* Event Brief panel — AI assist */}
        {canEdit && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-3 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Event Brief</h2>
              <span className="text-[11px] text-muted-foreground">
                AI fills the form. You can edit anything afterwards.
              </span>
            </div>

            <Textarea
              value={brief}
              onChange={(event) => setBrief(event.target.value.slice(0, MAX_BRIEF_CHARS))}
              placeholder={
                'Describe the event in your own words. e.g. "An MSME workshop on GST compliance for traders in Vijayawada on 12 March 2026, 10am to 1pm. Speakers: ..."'
              }
              rows={6}
              className="resize-y"
              disabled={isGenerating}
            />

            {sources.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {sources.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs"
                  >
                    {s.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
                    <span className="max-w-[180px] truncate">{s.file.name}</span>
                    <span className="text-muted-foreground">
                      ({Math.ceil(s.file.size / 1024)} KB)
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeSource(s.id)}
                      disabled={isGenerating}
                      aria-label={`Remove ${s.file.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onAttachClick}
                  disabled={isGenerating || sources.length >= MAX_SOURCE_FILES}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Attach reference
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/jpg,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => void onFilesPicked(e)}
                />
                <span className="text-[11px] text-muted-foreground">
                  Up to {MAX_SOURCE_FILES} files (JPEG / PNG ≤ 10 MB, PDF ≤ 20 MB, total ≤ 30 MB)
                </span>
              </div>

              <div className="flex items-center gap-2">
                {aiStatus === 'success' && (
                  <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
                    <Check className="h-3 w-3" />
                    Draft applied
                  </span>
                )}
                {aiStatus === 'partial' && (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                    <RefreshCw className="h-3 w-3" />
                    Partial draft — please review
                  </span>
                )}
                {aiStatus === 'failed' && (
                  <span className="inline-flex items-center gap-1 text-xs text-destructive">
                    <X className="h-3 w-3" />
                    Generation failed
                  </span>
                )}
                <Button
                  type="button"
                  onClick={handleGenerateClick}
                  disabled={isGenerating || (!brief.trim() && sources.length === 0)}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate from Brief
                    </>
                  )}
                </Button>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {brief.length} / {MAX_BRIEF_CHARS} characters
            </p>
          </div>
        )}

        {/* Form */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-foreground">Title *</label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Event title"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-foreground">Slug</label>
                <div className="flex items-center gap-2">
                  {!slugEditing && (
                    <button
                      type="button"
                      onClick={onSlugEditClick}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-muted/50"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit slug
                    </button>
                  )}
                  {slugEditing && (
                    <button
                      type="button"
                      onClick={onSlugResetAuto}
                      className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-muted/50"
                    >
                      <Unlock className="h-3 w-3" />
                      Reset to auto
                    </button>
                  )}
                </div>
              </div>

              {slugEditing ? (
                <Input
                  value={slug}
                  onChange={(event) => setSlug(slugify(event.target.value))}
                  placeholder="event-slug"
                  autoFocus
                />
              ) : (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  <code className="rounded bg-background px-1.5 py-0.5 text-xs">
                    {slug || '(auto from title)'}
                  </code>
                  <span className="ml-auto text-[11px] text-muted-foreground">Auto-managed</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Public URL: /events/{slug || 'event-slug'}
                </p>
                {renderSlugIndicator()}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Event Type</label>
              <select
                value={eventType}
                onChange={(event) => setEventType(event.target.value as EventType)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {EVENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Visibility</label>
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as EventVisibility)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="public">Public</option>
                <option value="member_only">Member only</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground inline-flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Start date &amp; time
              </label>
              <Input
                type="datetime-local"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground inline-flex items-center gap-2">
                <Clock3 className="h-4 w-4" />
                End date &amp; time
              </label>
              <Input
                type="datetime-local"
                value={endAt}
                onChange={(event) => setEndAt(event.target.value)}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-foreground">Location</label>
              <Input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="City, venue, or online link"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-foreground">Excerpt</label>
              <Textarea
                rows={2}
                value={excerpt}
                onChange={(event) => setExcerpt(event.target.value)}
                placeholder="Short summary shown in the listing"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-foreground">Description</label>
              <Textarea
                rows={6}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Detailed event description"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-foreground">Invitation Text</label>
              <Textarea
                rows={4}
                value={invitationText}
                onChange={(event) => setInvitationText(event.target.value)}
                placeholder="Invitation copy for this event"
              />
            </div>

            <div className="space-y-3 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-foreground">Agenda</label>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-xs text-foreground">
                    <input
                      type="checkbox"
                      checked={showAgendaPublicly}
                      onChange={(event) => setShowAgendaPublicly(event.target.checked)}
                      className="h-3.5 w-3.5 rounded border-input accent-primary"
                    />
                    Show agenda publicly
                  </label>
                  <Button type="button" size="sm" variant="outline" onClick={addAgendaRow}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add row
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {agendaItems.map((item, index) => (
                  <div key={`agenda-${index}`} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="grid gap-2 md:grid-cols-4">
                      <Input
                        value={item.time ?? ''}
                        onChange={(event) => onAgendaChange(index, 'time', event.target.value)}
                        placeholder="Time (e.g. 10:30 AM)"
                      />
                      <div className="md:col-span-3">
                        <Input
                          value={item.title}
                          onChange={(event) => onAgendaChange(index, 'title', event.target.value)}
                          placeholder="Agenda item title"
                        />
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Textarea
                        rows={2}
                        value={item.note ?? ''}
                        onChange={(event) => onAgendaChange(index, 'note', event.target.value)}
                        placeholder="Optional note"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeAgendaRow(index)}
                        aria-label="Remove agenda row"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-muted-foreground">
                Agenda is always retained internally. Public detail page shows it only when "Show agenda publicly" is on.
              </p>
            </div>

            <div className="md:col-span-2 flex items-center gap-2">
              <input
                id="event-is-featured"
                type="checkbox"
                checked={isFeatured}
                onChange={(event) => setIsFeatured(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="event-is-featured" className="text-sm text-foreground inline-flex items-center gap-1">
                <GlobeLock className="h-4 w-4" />
                Mark as featured
              </label>
            </div>

            <div className="md:col-span-2 pt-2 flex flex-wrap gap-2">
              {canEdit && (
                <Button type="button" onClick={() => void handleSave()} disabled={isSaving || slugBlocksSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Draft
                </Button>
              )}
              {canPublish && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handlePublish()}
                  disabled={isSaving || !canEdit || slugBlocksSave}
                >
                  <Globe className="h-4 w-4 mr-2" />
                  Publish
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Overwrite confirm dialog for published events */}
        {showOverwriteConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
            onClick={() => setShowOverwriteConfirm(false)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-foreground">Overwrite this published event?</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Generating from the brief will overwrite the current event fields (title, excerpt,
                description, schedule, agenda, etc.). The event will remain published — your changes
                go live as soon as you click Save / Republish. You can still edit any field afterwards.
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowOverwriteConfirm(false)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={confirmOverwriteAndGenerate}>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Generate &amp; overwrite
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PermissionGate>
  );
};

export default AdminEventForm;
