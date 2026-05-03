import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  Calendar,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  Globe,
  GlobeLock,
  Link2,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Share2,
  Sparkles,
  Trash2,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import {
  eventsService,
  EVENT_RSVP_GENDER_OPTIONS,
  EVENT_RSVP_MEAL_OPTIONS,
  EVENT_RSVP_PROFESSION_OPTIONS,
  type AdminEventDetail,
  type EventAIDraftSourceFile,
  type EventAgendaItem,
  type EventRsvpGender,
  type EventRsvpMealPreference,
  type EventRsvpProfession,
  type EventRsvpRow,
  type EventRsvpStatus,
  type EventRsvpSummary,
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
const MAX_SOURCE_FILES = 5;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
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

function labelFromOptions<T extends string>(
  value: T | null | undefined,
  options: ReadonlyArray<{ value: T; label: string }>,
): string {
  if (!value) return '—';
  const match = options.find((o) => o.value === value);
  return match ? match.label : value;
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
  const canCreateActivity = useHasPermission('activities.create');
  const canViewRsvp = useHasPermission('events.rsvp.view');
  const canManageRsvp = useHasPermission('events.rsvp.manage');

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
  const [venueMapUrl, setVenueMapUrl] = useState('');
  const [whatsappMessage, setWhatsappMessage] = useState('');

  // RSVP config
  const [rsvpEnabled, setRsvpEnabled] = useState(false);
  const [rsvpCapacity, setRsvpCapacity] = useState<string>('');
  const [rsvpDeadlineAt, setRsvpDeadlineAt] = useState('');
  const [rsvpCollectPhone, setRsvpCollectPhone] = useState(true);
  const [rsvpCollectCompany, setRsvpCollectCompany] = useState(true);
  const [rsvpCollectGender, setRsvpCollectGender] = useState(false);
  const [rsvpCollectMeal, setRsvpCollectMeal] = useState(false);
  const [rsvpCollectProfession, setRsvpCollectProfession] = useState(false);
  const [rsvpRequireLogin, setRsvpRequireLogin] = useState(true);

  // RSVP roster
  const [rsvpRows, setRsvpRows] = useState<EventRsvpRow[]>([]);
  const [rsvpSummary, setRsvpSummary] = useState<EventRsvpSummary>({
    total: 0,
    confirmed: 0,
    cancelled: 0,
    pending: 0,
    waitlisted: 0,
  });
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [rsvpStatusFilter, setRsvpStatusFilter] = useState<EventRsvpStatus | 'all'>('all');

  // Bridge (event -> activity)
  const [bridgeActivityId, setBridgeActivityId] = useState<string | null>(null);
  const [isBridging, setIsBridging] = useState(false);

  // WhatsApp manual generation (040A)
  const [isGeneratingWhatsapp, setIsGeneratingWhatsapp] = useState(false);
  const [showWhatsappOverwriteConfirm, setShowWhatsappOverwriteConfirm] = useState(false);

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
        setVenueMapUrl(data.venue_map_url ?? '');
        setWhatsappMessage(data.whatsapp_invitation_message ?? '');

        const rsvpCfg = data.rsvp ?? {
          enabled: false,
          capacity: null,
          deadline_at: null,
          collect_phone: true,
          collect_company: true,
          require_login: true,
        };
        setRsvpEnabled(Boolean(rsvpCfg.enabled));
        setRsvpCapacity(rsvpCfg.capacity != null ? String(rsvpCfg.capacity) : '');
        setRsvpDeadlineAt(toDateTimeInput(rsvpCfg.deadline_at ?? null));
        setRsvpCollectPhone(rsvpCfg.collect_phone !== false);
        setRsvpCollectCompany(rsvpCfg.collect_company !== false);
        setRsvpCollectGender(Boolean(rsvpCfg.collect_gender));
        setRsvpCollectMeal(Boolean(rsvpCfg.collect_meal));
        setRsvpCollectProfession(Boolean(rsvpCfg.collect_profession));
        setRsvpRequireLogin(rsvpCfg.require_login !== false);
        setBridgeActivityId(data.bridge?.activity_id ?? null);

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
          `"${file.name}" exceeds the per-file size limit (30 MB).`,
        );
        continue;
      }
      if (runningTotal + file.size > MAX_TOTAL_BYTES) {
        showToast('error', 'Total attached size cannot exceed 150 MB.');
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
    // 040A: WhatsApp invitation text is no longer auto-applied from the
    // generic "Generate from Brief" — it is generated only via the dedicated
    // "Generate WhatsApp Message with AI" button below the WhatsApp field.
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
  const buildPayload = (): Record<string, unknown> => {
    const capacityRaw = rsvpCapacity.trim();
    const capacityNum = capacityRaw ? Number(capacityRaw) : null;
    return {
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
      venue_map_url: venueMapUrl.trim() || null,
      whatsapp_invitation_message: whatsappMessage.trim() || null,
      rsvp_enabled: rsvpEnabled,
      rsvp_capacity:
        capacityNum != null && Number.isFinite(capacityNum) && capacityNum > 0 ? capacityNum : null,
      rsvp_deadline_at: rsvpDeadlineAt ? new Date(rsvpDeadlineAt).toISOString() : null,
      rsvp_collect_phone: rsvpCollectPhone,
      rsvp_collect_company: rsvpCollectCompany,
      rsvp_collect_gender: rsvpCollectGender,
      rsvp_collect_meal: rsvpCollectMeal,
      rsvp_collect_profession: rsvpCollectProfession,
      rsvp_require_login: rsvpRequireLogin,
    };
  };

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
    if (venueMapUrl.trim()) {
      const url = venueMapUrl.trim();
      if (!/^https?:\/\//i.test(url)) {
        showToast('error', 'Venue map URL must start with http:// or https://');
        return null;
      }
      if (url.length > 500) {
        showToast('error', 'Venue map URL is too long (max 500 characters).');
        return null;
      }
    }
    if (rsvpEnabled && rsvpCapacity.trim()) {
      const capNum = Number(rsvpCapacity.trim());
      if (!Number.isFinite(capNum) || capNum <= 0) {
        showToast('error', 'RSVP capacity must be a positive whole number.');
        return null;
      }
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

  // ── RSVP roster loader ────────────────────────────────────────────────────
  const loadRsvps = useCallback(async () => {
    if (!isEdit || !id) return;
    if (!canViewRsvp && !canManageRsvp) return;
    setRsvpLoading(true);
    try {
      const token = sessionManager.getSessionToken();
      if (!token) return;
      const status =
        rsvpStatusFilter === 'all' ? null : (rsvpStatusFilter as EventRsvpStatus);
      const result = await eventsService.getRsvps(token, id, status);
      if (!result.success) {
        showToast('error', result.error ?? 'Failed to load RSVPs');
        return;
      }
      setRsvpRows(result.rows);
      setRsvpSummary(result.summary);
    } finally {
      setRsvpLoading(false);
    }
  }, [canManageRsvp, canViewRsvp, id, isEdit, rsvpStatusFilter, showToast]);

  useEffect(() => {
    void loadRsvps();
  }, [loadRsvps]);

  const handleRsvpStatusChange = async (rsvpId: string, status: EventRsvpStatus) => {
    if (!canManageRsvp) return;
    const token = sessionManager.getSessionToken();
    if (!token) {
      showToast('error', 'Session expired.');
      return;
    }
    const result = await eventsService.updateRsvpStatus(token, rsvpId, status);
    if (!result.success) {
      showToast('error', result.error ?? 'Failed to update RSVP status.');
      return;
    }
    showToast('success', 'RSVP updated.');
    void loadRsvps();
  };

  // ── Bridge to activity ────────────────────────────────────────────────────
  const handleBridgeToActivity = async () => {
    if (!isEdit || !id) {
      showToast('error', 'Save the event before creating an activity from it.');
      return;
    }
    if (!canCreateActivity) {
      showToast('error', 'You do not have permission to create activities.');
      return;
    }
    const token = sessionManager.getSessionToken();
    if (!token) {
      showToast('error', 'Session expired.');
      return;
    }
    setIsBridging(true);
    try {
      const result = await eventsService.bridgeToActivity(token, id);
      if (!result.success || !result.activity_id) {
        showToast('error', result.error ?? 'Failed to create activity from event.');
        return;
      }
      showToast(
        'success',
        result.reused ? 'Opening existing activity draft.' : 'Activity draft created from event.',
      );
      navigate(`/admin/content/activities/${result.activity_id}/edit`);
    } finally {
      setIsBridging(false);
    }
  };

  const copyWhatsappMessage = async () => {
    if (!whatsappMessage.trim()) return;
    try {
      await navigator.clipboard.writeText(whatsappMessage);
      showToast('success', 'WhatsApp message copied to clipboard.');
    } catch {
      showToast('error', 'Could not copy. Select and copy manually.');
    }
  };

  // 040A: dedicated WhatsApp AI generation, button-only.
  const runGenerateWhatsapp = useCallback(async () => {
    const sessionToken = sessionManager.getSessionToken();
    if (!sessionToken) {
      showToast('error', 'Session expired.');
      return;
    }
    const hints: Record<string, string> = {};
    if (title.trim()) hints.title = title.trim();
    if (eventType) hints.event_type = eventType;
    if (visibility) hints.visibility = visibility;
    if (startAt) hints.start_at = new Date(startAt).toISOString();
    if (endAt) hints.end_at = new Date(endAt).toISOString();
    if (location.trim()) hints.location = location.trim();
    if (venueMapUrl.trim()) hints.location = `${hints.location ?? ''}${hints.location ? ' — ' : ''}Map: ${venueMapUrl.trim()}`;
    if (invitationText.trim()) hints.invitation_text = invitationText.trim();

    const sourceFiles: EventAIDraftSourceFile[] = sources
      .filter((s) => s.base64)
      .map((s) => ({ name: s.file.name, mime: s.file.type, base64: s.base64! }));

    setIsGeneratingWhatsapp(true);
    try {
      const result = await eventsService.draftWhatsappMessage(sessionToken, {
        brief: brief.trim(),
        hints,
        sourceFiles,
      });
      if (!result.success || !result.message) {
        showToast('error', result.error ?? 'AI WhatsApp generation failed.');
        return;
      }
      setWhatsappMessage(result.message);
      showToast('success', 'WhatsApp message generated. Edit before saving if needed.');
    } finally {
      setIsGeneratingWhatsapp(false);
    }
  }, [
    brief,
    endAt,
    eventType,
    invitationText,
    location,
    showToast,
    sources,
    startAt,
    title,
    venueMapUrl,
    visibility,
  ]);

  const handleGenerateWhatsappClick = () => {
    if (whatsappMessage.trim().length > 0) {
      setShowWhatsappOverwriteConfirm(true);
      return;
    }
    void runGenerateWhatsapp();
  };

  const confirmOverwriteWhatsappAndGenerate = () => {
    setShowWhatsappOverwriteConfirm(false);
    void runGenerateWhatsapp();
  };

  // ── Publish-time RSVP share package (040A-HOTFIX) ────────────────────────
  const isPublished = original?.status === 'published';
  const publicEventUrl = useMemo(() => {
    if (!isPublished) return '';
    const slugForUrl = (slug || original?.slug || '').trim();
    if (!slugForUrl) return '';
    if (typeof window === 'undefined') return `/events/${slugForUrl}`;
    return `${window.location.origin}/events/${slugForUrl}`;
  }, [isPublished, slug, original?.slug]);

  const buildDefaultShareMessage = useCallback((): string => {
    const lines: string[] = [];
    const t = title.trim();
    if (t) lines.push(`You're invited: ${t}`);
    const dateBits: string[] = [];
    if (startAt) {
      try {
        dateBits.push(new Date(startAt).toLocaleString('en-IN', {
          day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
        }));
      } catch { /* ignore */ }
    }
    if (endAt) {
      try {
        dateBits.push(`to ${new Date(endAt).toLocaleString('en-IN', {
          day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
        })}`);
      } catch { /* ignore */ }
    }
    if (dateBits.length > 0) lines.push(dateBits.join(' '));
    if (location.trim()) lines.push(`Venue: ${location.trim()}`);
    if (publicEventUrl) {
      lines.push('');
      lines.push(`RSVP / details: ${publicEventUrl}`);
    }
    return lines.join('\n').trim();
  }, [title, startAt, endAt, location, publicEventUrl]);

  // The message we actually share. If the saved WhatsApp message exists,
  // append the URL (only if not already present); otherwise build a default.
  const shareMessage = useMemo(() => {
    if (!isPublished) return '';
    const saved = whatsappMessage.trim();
    if (saved) {
      if (publicEventUrl && !saved.includes(publicEventUrl)) {
        return `${saved}\n\nRSVP / details: ${publicEventUrl}`;
      }
      return saved;
    }
    return buildDefaultShareMessage();
  }, [isPublished, whatsappMessage, publicEventUrl, buildDefaultShareMessage]);

  const copyTextSafely = useCallback(async (text: string, successMsg: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showToast('success', successMsg);
    } catch {
      showToast('error', 'Could not copy. Select and copy manually.');
    }
  }, [showToast]);

  const openWhatsappShare = useCallback(() => {
    if (!shareMessage) return;
    const encoded = encodeURIComponent(shareMessage);
    window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer');
  }, [shareMessage]);

  const generateShareMessageWithAI = useCallback(() => {
    if (!isPublished) return;
    if (whatsappMessage.trim().length > 0) {
      setShowWhatsappOverwriteConfirm(true);
      return;
    }
    void runGenerateWhatsapp();
  }, [isPublished, whatsappMessage, runGenerateWhatsapp]);

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
                  Up to {MAX_SOURCE_FILES} files (JPEG / PNG &lt;= 30 MB, PDF &lt;= 30 MB, total &lt;= 150 MB)
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
              <label className="text-sm font-medium text-foreground inline-flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Venue Google Maps link
              </label>
              <div className="flex gap-2">
                <Input
                  type="url"
                  value={venueMapUrl}
                  onChange={(event) => setVenueMapUrl(event.target.value)}
                  placeholder="https://maps.google.com/..."
                  maxLength={500}
                />
                {venueMapUrl.trim() && /^https?:\/\//i.test(venueMapUrl.trim()) && (
                  <a
                    href={venueMapUrl.trim()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 text-sm text-foreground hover:bg-muted/50"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open
                  </a>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Optional. Members see an "Open in Maps" button on the event page.
              </p>
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

            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-foreground inline-flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp invitation message
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {whatsappMessage.length} / 1200
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copyWhatsappMessage()}
                    disabled={!whatsappMessage.trim()}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Copy
                  </Button>
                </div>
              </div>
              <Textarea
                rows={6}
                value={whatsappMessage}
                onChange={(event) =>
                  setWhatsappMessage(event.target.value.slice(0, 1200))
                }
                placeholder={'A short, ready-to-share WhatsApp invitation message.\nClick "Generate WhatsApp Message with AI" below to draft from the brief — fully editable.'}
                className="font-mono text-[13px] leading-snug whitespace-pre-wrap"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  Plain-text, &lt;= 1200 chars. Generated only when you click the button — never auto-filled.
                </p>
                {canEdit && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleGenerateWhatsappClick}
                    disabled={isGeneratingWhatsapp}
                  >
                    {isGeneratingWhatsapp ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Generate WhatsApp Message with AI
                  </Button>
                )}
              </div>
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

            {/* RSVP config */}
            <div className="md:col-span-2 rounded-lg border border-border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  RSVP / Registration
                </h3>
                <label className="inline-flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={rsvpEnabled}
                    onChange={(event) => setRsvpEnabled(event.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  Enable RSVP
                </label>
              </div>

              {rsvpEnabled && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">Capacity (optional)</label>
                    <Input
                      type="number"
                      min={1}
                      step={1}
                      value={rsvpCapacity}
                      onChange={(event) => setRsvpCapacity(event.target.value)}
                      placeholder="Leave blank for unlimited"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-foreground">RSVP deadline (optional)</label>
                    <Input
                      type="datetime-local"
                      value={rsvpDeadlineAt}
                      onChange={(event) => setRsvpDeadlineAt(event.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2 grid gap-2 sm:grid-cols-3">
                    <label className="inline-flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={rsvpCollectPhone}
                        onChange={(event) => setRsvpCollectPhone(event.target.checked)}
                        className="h-3.5 w-3.5 rounded border-input accent-primary"
                      />
                      Collect phone
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={rsvpCollectCompany}
                        onChange={(event) => setRsvpCollectCompany(event.target.checked)}
                        className="h-3.5 w-3.5 rounded border-input accent-primary"
                      />
                      Collect company
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={rsvpCollectGender}
                        onChange={(event) => setRsvpCollectGender(event.target.checked)}
                        className="h-3.5 w-3.5 rounded border-input accent-primary"
                      />
                      Collect gender
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={rsvpCollectMeal}
                        onChange={(event) => setRsvpCollectMeal(event.target.checked)}
                        className="h-3.5 w-3.5 rounded border-input accent-primary"
                      />
                      Collect meal preference
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={rsvpCollectProfession}
                        onChange={(event) => setRsvpCollectProfession(event.target.checked)}
                        className="h-3.5 w-3.5 rounded border-input accent-primary"
                      />
                      Collect profession
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-foreground">
                      <input
                        type="checkbox"
                        checked={rsvpRequireLogin}
                        onChange={(event) => setRsvpRequireLogin(event.target.checked)}
                        className="h-3.5 w-3.5 rounded border-input accent-primary"
                      />
                      Require sign-in
                    </label>
                  </div>

                  <p className="md:col-span-2 text-[11px] text-muted-foreground">
                    Enabled fields become required for the user. Existing RSVPs from before these were enabled remain valid.
                  </p>
                  {visibility === 'member_only' && !rsvpRequireLogin && (
                    <p className="md:col-span-2 text-[11px] text-amber-700 dark:text-amber-400">
                      Note: members-only events always require a signed-in member regardless of this toggle.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* RSVP roster (edit mode only) */}
            {isEdit && (canViewRsvp || canManageRsvp) && (
              <div className="md:col-span-2 rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    RSVP roster
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      Total {rsvpSummary.total} · Confirmed {rsvpSummary.confirmed} · Cancelled {rsvpSummary.cancelled}
                      {rsvpSummary.waitlisted > 0 ? ` · Waitlisted ${rsvpSummary.waitlisted}` : ''}
                    </span>
                    <select
                      value={rsvpStatusFilter}
                      onChange={(event) =>
                        setRsvpStatusFilter(event.target.value as EventRsvpStatus | 'all')
                      }
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="all">All statuses</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="pending">Pending</option>
                      <option value="waitlisted">Waitlisted</option>
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void loadRsvps()}
                      disabled={rsvpLoading}
                    >
                      {rsvpLoading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Refresh
                    </Button>
                  </div>
                </div>

                {rsvpRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {rsvpLoading ? 'Loading…' : 'No RSVPs yet.'}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-2 py-1">Name</th>
                          <th className="px-2 py-1">Email</th>
                          <th className="px-2 py-1">Phone</th>
                          <th className="px-2 py-1">Company</th>
                          <th className="px-2 py-1">Gender</th>
                          <th className="px-2 py-1">Meal</th>
                          <th className="px-2 py-1">Profession</th>
                          <th className="px-2 py-1">Status</th>
                          {canManageRsvp && <th className="px-2 py-1 text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {rsvpRows.map((row) => (
                          <tr key={row.id} className="border-t border-border align-top">
                            <td className="px-2 py-1.5 text-foreground">{row.full_name}</td>
                            <td className="px-2 py-1.5 text-muted-foreground break-all">
                              {row.email}
                            </td>
                            <td className="px-2 py-1.5 text-muted-foreground">{row.phone ?? '—'}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{row.company ?? '—'}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">
                              {labelFromOptions<EventRsvpGender>(row.gender ?? null, EVENT_RSVP_GENDER_OPTIONS)}
                            </td>
                            <td className="px-2 py-1.5 text-muted-foreground">
                              {labelFromOptions<EventRsvpMealPreference>(row.meal_preference ?? null, EVENT_RSVP_MEAL_OPTIONS)}
                            </td>
                            <td className="px-2 py-1.5 text-muted-foreground">
                              {labelFromOptions<EventRsvpProfession>(row.profession ?? null, EVENT_RSVP_PROFESSION_OPTIONS)}
                            </td>
                            <td className="px-2 py-1.5">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                  row.status === 'confirmed'
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                    : row.status === 'cancelled'
                                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                      : row.status === 'waitlisted'
                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                        : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {row.status}
                              </span>
                            </td>
                            {canManageRsvp && (
                              <td className="px-2 py-1.5 text-right">
                                <select
                                  value={row.status}
                                  onChange={(event) =>
                                    void handleRsvpStatusChange(
                                      row.id,
                                      event.target.value as EventRsvpStatus,
                                    )
                                  }
                                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                                >
                                  <option value="confirmed">Confirmed</option>
                                  <option value="cancelled">Cancelled</option>
                                  <option value="pending">Pending</option>
                                  <option value="waitlisted">Waitlisted</option>
                                </select>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Bridge to activity (edit mode only) */}
            {isEdit && canCreateActivity && (
              <div className="md:col-span-2 rounded-lg border border-border bg-muted/20 p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <Link2 className="h-4 w-4" />
                    Activity bridge
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Pull this event into a new (or existing) Activity draft. Idempotent — clicking again
                    re-opens the linked activity.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleBridgeToActivity()}
                  disabled={isBridging}
                >
                  {isBridging ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4 mr-2" />
                  )}
                  {bridgeActivityId ? 'Open linked Activity' : 'Create Activity from Event'}
                </Button>
              </div>
            )}

            {/* Share RSVP package (published events only) */}
            {isPublished && (
              <div className="md:col-span-2 rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <Share2 className="h-4 w-4" />
                    Share RSVP
                  </h3>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={generateShareMessageWithAI}
                    disabled={isGeneratingWhatsapp}
                  >
                    {isGeneratingWhatsapp ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Generate RSVP Share Message with AI
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Public RSVP URL</label>
                  <div className="flex gap-2">
                    <Input value={publicEventUrl} readOnly className="font-mono text-xs" />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void copyTextSafely(publicEventUrl, 'URL copied to clipboard.')}
                      disabled={!publicEventUrl}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copy URL
                    </Button>
                    {publicEventUrl && (
                      <a
                        href={publicEventUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 text-sm text-foreground hover:bg-muted/50"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Open
                      </a>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Share message preview</label>
                  <Textarea
                    rows={6}
                    value={shareMessage}
                    readOnly
                    className="font-mono text-[13px] leading-snug whitespace-pre-wrap"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      Built from your saved WhatsApp message (with the URL appended) or, if empty, a compact auto-built invite.
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void copyTextSafely(shareMessage, 'Share message copied to clipboard.')}
                        disabled={!shareMessage}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        Copy Share Message
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={openWhatsappShare}
                        disabled={!shareMessage}
                        className="bg-[#25D366] hover:bg-[#1da851] text-white"
                      >
                        <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
                        Open WhatsApp Share
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

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

        {/* WhatsApp overwrite confirm */}
        {showWhatsappOverwriteConfirm && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
            onClick={() => setShowWhatsappOverwriteConfirm(false)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-base font-semibold text-foreground">Replace existing WhatsApp message?</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                The current WhatsApp invitation message will be replaced with a fresh AI-generated draft based on the
                Event Brief and form fields. You can still edit any part of it after generation.
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowWhatsappOverwriteConfirm(false)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={confirmOverwriteWhatsappAndGenerate}>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Replace &amp; generate
                </Button>
              </div>
            </div>
          </div>
        )}

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

