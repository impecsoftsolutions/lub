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
  FileText,
  Globe,
  GlobeLock,
  ImageIcon,
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
  type BadgeDesignAnalysis,
  type BadgeDesignAnalysisStatus,
  type EventAsset,
  type EventAssetKind,
  type EventCapacityMode,
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

const DEFAULT_PROFESSION_LABELS = EVENT_RSVP_PROFESSION_OPTIONS.map((option) => option.label);

function normalizeProfessionOptionLines(raw: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const value = line.replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(value);
    if (values.length >= 20) break;
  }
  return values.length > 0 ? values : DEFAULT_PROFESSION_LABELS;
}

function professionOptionsTextFrom(value: unknown): string {
  if (Array.isArray(value)) {
    const labels = value
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          return String(record.label ?? record.value ?? '').trim();
        }
        return '';
      })
      .filter(Boolean);
    if (labels.length > 0) return labels.join('\n');
  }
  return DEFAULT_PROFESSION_LABELS.join('\n');
}

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,79})$/;
const MAX_BRIEF_CHARS = 4000;
const MAX_SOURCE_FILES = 5;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
const ALLOWED_SOURCE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']);

function assetFileName(asset: EventAsset): string {
  return asset.label || asset.storage_path.split('/').pop() || 'Uploaded file';
}

function formatAssetSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

function isImageAsset(asset: EventAsset): boolean {
  return (asset.mime_type ?? '').toLowerCase().startsWith('image/');
}

function isPdfAsset(asset: EventAsset): boolean {
  return (asset.mime_type ?? '').toLowerCase() === 'application/pdf';
}

function documentPreviewLabel(asset: EventAsset): string {
  if (isPdfAsset(asset)) return 'PDF';
  const name = assetFileName(asset);
  const ext = name.includes('.') ? name.split('.').pop() : null;
  if (ext) return ext.toUpperCase();
  const mime = (asset.mime_type ?? '').toLowerCase();
  if (mime.includes('/')) return mime.split('/')[1].toUpperCase();
  return 'FILE';
}

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
  const [showExcerptPublicly, setShowExcerptPublicly] = useState(true);
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState<EventType>('general');
  const [visibility, setVisibility] = useState<EventVisibility>('public');
  const [isFeatured, setIsFeatured] = useState(false);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [location, setLocation] = useState('');
  const [invitationText, setInvitationText] = useState('');
  const [showInvitationTextPublicly, setShowInvitationTextPublicly] = useState(true);
  const [agendaItems, setAgendaItems] = useState<EventAgendaItem[]>([{ title: '', time: '', note: '' }]);
  const [showAgendaPublicly, setShowAgendaPublicly] = useState(false);
  const [aiMetadata, setAiMetadata] = useState<Record<string, unknown> | null>(null);
  const [venueMapUrl, setVenueMapUrl] = useState('');
  const [whatsappMessage, setWhatsappMessage] = useState('');

  // RSVP config
  const [rsvpEnabled, setRsvpEnabled] = useState(false);
  const [rsvpCapacity, setRsvpCapacity] = useState<string>('');
  const [capacityMode, setCapacityMode] = useState<EventCapacityMode>('global');
  const [perDayCapacity, setPerDayCapacity] = useState<string>('');
  // Media (banner + flyer/gallery + documents)
  const [bannerImageUrl, setBannerImageUrl] = useState<string | null>(null);
  const [assets, setAssets] = useState<EventAsset[]>([]);
  const [uploadingKind, setUploadingKind] = useState<EventAssetKind | null>(null);
  // 063A — badge sample analysis state
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisPolling, setAnalysisPolling] = useState(false);
  const [analysisPollTimedOut, setAnalysisPollTimedOut] = useState(false);
  const [docLabelDraft, setDocLabelDraft] = useState('');
  const [rsvpDeadlineAt, setRsvpDeadlineAt] = useState('');
  const [rsvpDeadlineEnabled, setRsvpDeadlineEnabled] = useState(false);
  const [rsvpCollectEmail, setRsvpCollectEmail] = useState(true);
  const [rsvpRequireEmail, setRsvpRequireEmail] = useState(false);
  const [rsvpCollectPhone, setRsvpCollectPhone] = useState(true);
  const [rsvpCollectCompany, setRsvpCollectCompany] = useState(true);
  const [rsvpCollectGender, setRsvpCollectGender] = useState(false);
  const [rsvpCollectMeal, setRsvpCollectMeal] = useState(false);
  const [rsvpCollectProfession, setRsvpCollectProfession] = useState(false);
  const [rsvpProfessionOptionsText, setRsvpProfessionOptionsText] = useState(DEFAULT_PROFESSION_LABELS.join('\n'));
  const [rsvpRequirePhone, setRsvpRequirePhone] = useState(false);
  const [rsvpRequireCompany, setRsvpRequireCompany] = useState(false);
  const [rsvpRequireGender, setRsvpRequireGender] = useState(false);
  const [rsvpRequireMeal, setRsvpRequireMeal] = useState(false);
  const [rsvpRequireProfession, setRsvpRequireProfession] = useState(false);
  const [rsvpCollectNote, setRsvpCollectNote] = useState(false);
  const [rsvpRequireNote, setRsvpRequireNote] = useState(false);
  // 052 — Designation field on RSVP.
  const [rsvpCollectDesignation, setRsvpCollectDesignation] = useState(false);
  const [rsvpRequireDesignation, setRsvpRequireDesignation] = useState(false);
  // COD-EVENTS-REGISTRATION-COMPLETE-059
  const [rsvpCollectAadhaar, setRsvpCollectAadhaar] = useState(false);
  const [rsvpRequireAadhaar, setRsvpRequireAadhaar] = useState(false);
  // 054 — Badge name display options (persisted in events.ai_metadata).
  const [badgeIncludeSurname, setBadgeIncludeSurname] = useState(true);
  const [badgeNameMaxChars, setBadgeNameMaxChars] = useState(25);
  const [badgeNameFontSize, setBadgeNameFontSize] = useState(22);
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
  // Short RSVP redirect URL (077)
  const [shortShareCode, setShortShareCode] = useState('');
  const [shortShareLoading, setShortShareLoading] = useState(false);
  const [shortShareRefreshing, setShortShareRefreshing] = useState(false);

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
        const meta = (data.ai_metadata && typeof data.ai_metadata === 'object')
          ? (data.ai_metadata as Record<string, unknown>)
          : {};
        setShowExcerptPublicly(
          meta.show_excerpt_publicly === undefined ? true : Boolean(meta.show_excerpt_publicly),
        );
        setShowInvitationTextPublicly(
          meta.show_invitation_text_publicly === undefined ? true : Boolean(meta.show_invitation_text_publicly),
        );
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
        setCapacityMode((rsvpCfg.capacity_mode as EventCapacityMode) ?? 'global');
        setPerDayCapacity(rsvpCfg.per_day_capacity != null ? String(rsvpCfg.per_day_capacity) : '');
        setBannerImageUrl(data.banner_image_url ?? null);
        setAssets(Array.isArray(data.assets) ? data.assets : []);
        setRsvpDeadlineAt(toDateTimeInput(rsvpCfg.deadline_at ?? null));
        setRsvpDeadlineEnabled(
          meta.rsvp_deadline_enabled === undefined
            ? Boolean(rsvpCfg.deadline_at)
            : Boolean(meta.rsvp_deadline_enabled),
        );
        setRsvpCollectEmail(Boolean(meta.rsvp_collect_email ?? rsvpCfg.collect_email ?? true));
        setRsvpRequireEmail(Boolean(meta.rsvp_require_email ?? rsvpCfg.require_email ?? false));
        setRsvpCollectPhone(rsvpCfg.collect_phone !== false);
        setRsvpCollectCompany(rsvpCfg.collect_company !== false);
        setRsvpCollectGender(Boolean(rsvpCfg.collect_gender));
        setRsvpCollectMeal(Boolean(rsvpCfg.collect_meal));
        setRsvpCollectProfession(Boolean(rsvpCfg.collect_profession));
        setRsvpProfessionOptionsText(
          professionOptionsTextFrom(meta.rsvp_profession_options ?? rsvpCfg.profession_options),
        );
        setRsvpRequirePhone(Boolean(meta.rsvp_require_phone ?? rsvpCfg.require_phone ?? rsvpCfg.collect_phone));
        setRsvpRequireCompany(Boolean(meta.rsvp_require_company ?? rsvpCfg.require_company ?? rsvpCfg.collect_company));
        setRsvpRequireGender(Boolean(meta.rsvp_require_gender ?? rsvpCfg.require_gender ?? rsvpCfg.collect_gender));
        setRsvpRequireMeal(Boolean(meta.rsvp_require_meal ?? rsvpCfg.require_meal ?? rsvpCfg.collect_meal));
        setRsvpRequireProfession(Boolean(meta.rsvp_require_profession ?? rsvpCfg.require_profession ?? rsvpCfg.collect_profession));
        setRsvpCollectNote(Boolean(meta.rsvp_collect_note ?? rsvpCfg.collect_note));
        setRsvpRequireNote(Boolean(meta.rsvp_require_note ?? rsvpCfg.require_note));
        setRsvpCollectDesignation(Boolean(rsvpCfg.collect_designation));
        setRsvpRequireDesignation(Boolean(meta.rsvp_require_designation ?? rsvpCfg.require_designation));
        setRsvpCollectAadhaar(Boolean(rsvpCfg.collect_aadhaar));
        setRsvpRequireAadhaar(Boolean(rsvpCfg.require_aadhaar));
        {
          const includeRaw = (meta as Record<string, unknown>)['badge_include_surname'];
          setBadgeIncludeSurname(includeRaw === undefined ? true : Boolean(includeRaw));
          const maxRaw = Number((meta as Record<string, unknown>)['badge_name_max_chars']);
          setBadgeNameMaxChars(Number.isFinite(maxRaw) && maxRaw > 0 ? Math.max(6, Math.min(40, Math.floor(maxRaw))) : 25);
          const fontRaw = Number((meta as Record<string, unknown>)['badge_name_font_size']);
          setBadgeNameFontSize(Number.isFinite(fontRaw) && fontRaw > 0 ? Math.max(8, Math.min(32, Math.floor(fontRaw))) : 22);
        }
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
    const perDayRaw = perDayCapacity.trim();
    const perDayNum = perDayRaw ? Number(perDayRaw) : null;
    const professionOptions = normalizeProfessionOptionLines(rsvpProfessionOptionsText);
    const nextAiMetadata: Record<string, unknown> = {
      ...(aiMetadata && typeof aiMetadata === 'object' ? aiMetadata : {}),
      rsvp_require_phone: rsvpCollectPhone ? rsvpRequirePhone : false,
      rsvp_require_company: rsvpCollectCompany ? rsvpRequireCompany : false,
      rsvp_require_gender: rsvpCollectGender ? rsvpRequireGender : false,
      rsvp_require_meal: rsvpCollectMeal ? rsvpRequireMeal : false,
      rsvp_require_profession: rsvpCollectProfession ? rsvpRequireProfession : false,
      rsvp_collect_email: rsvpCollectEmail,
      rsvp_require_email: rsvpCollectEmail ? rsvpRequireEmail : false,
      rsvp_collect_note: rsvpCollectNote,
      rsvp_require_note: rsvpCollectNote ? rsvpRequireNote : false,
      rsvp_require_designation: rsvpCollectDesignation ? rsvpRequireDesignation : false,
      rsvp_profession_options: professionOptions,
      show_excerpt_publicly: showExcerptPublicly,
      show_invitation_text_publicly: showInvitationTextPublicly,
      badge_include_surname: badgeIncludeSurname,
      badge_name_max_chars: badgeNameMaxChars,
      badge_name_font_size: badgeNameFontSize,
      rsvp_deadline_enabled: rsvpEnabled ? rsvpDeadlineEnabled : false,
    };
    return {
      title: title.trim(),
      slug: slug.trim(),
      slug_locked: slugLocked,
      excerpt: excerpt.trim() || null,
      show_excerpt_publicly: showExcerptPublicly,
      description: description.trim() || null,
      event_type: eventType,
      visibility,
      is_featured: isFeatured,
      start_at: startAt ? new Date(startAt).toISOString() : null,
      end_at: endAt ? new Date(endAt).toISOString() : null,
      location: location.trim() || null,
      invitation_text: invitationText.trim() || null,
      show_invitation_text_publicly: showInvitationTextPublicly,
      agenda_items: normalizeAgendaItems(agendaItems),
      show_agenda_publicly: showAgendaPublicly,
      ai_metadata: nextAiMetadata,
      venue_map_url: venueMapUrl.trim() || null,
      whatsapp_invitation_message: whatsappMessage.trim() || null,
      rsvp_enabled: rsvpEnabled,
      rsvp_capacity:
        capacityNum != null && Number.isFinite(capacityNum) && capacityNum > 0 ? capacityNum : null,
      rsvp_deadline_at:
        rsvpEnabled && rsvpDeadlineEnabled && rsvpDeadlineAt
          ? new Date(rsvpDeadlineAt).toISOString()
          : null,
      rsvp_collect_phone: rsvpCollectPhone,
      rsvp_collect_company: rsvpCollectCompany,
      rsvp_collect_gender: rsvpCollectGender,
      rsvp_collect_meal: rsvpCollectMeal,
      rsvp_collect_profession: rsvpCollectProfession,
      rsvp_collect_email: rsvpCollectEmail,
      rsvp_require_email: rsvpCollectEmail ? rsvpRequireEmail : false,
      rsvp_require_phone: rsvpCollectPhone ? rsvpRequirePhone : false,
      rsvp_require_company: rsvpCollectCompany ? rsvpRequireCompany : false,
      rsvp_require_gender: rsvpCollectGender ? rsvpRequireGender : false,
      rsvp_require_meal: rsvpCollectMeal ? rsvpRequireMeal : false,
      rsvp_require_profession: rsvpCollectProfession ? rsvpRequireProfession : false,
      rsvp_collect_note: rsvpCollectNote,
      rsvp_require_note: rsvpCollectNote ? rsvpRequireNote : false,
      rsvp_collect_designation: rsvpCollectDesignation,
      rsvp_collect_aadhaar: rsvpCollectAadhaar,
      rsvp_require_aadhaar: rsvpCollectAadhaar ? rsvpRequireAadhaar : false,
      rsvp_require_login: rsvpRequireLogin,
      capacity_mode: capacityMode,
      per_day_capacity:
        perDayNum != null && Number.isFinite(perDayNum) && perDayNum > 0 ? perDayNum : null,
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
        showToast('error', 'Registration capacity must be a positive whole number.');
        return null;
      }
    }
    if (rsvpEnabled && rsvpDeadlineEnabled && !rsvpDeadlineAt) {
      showToast('error', 'Set a registration deadline or disable custom deadline.');
      return null;
    }
    if (rsvpEnabled && rsvpDeadlineEnabled && rsvpDeadlineAt) {
      const eventEnd = endAt || startAt;
      if (eventEnd && new Date(rsvpDeadlineAt) > new Date(eventEnd)) {
        showToast('error', 'Registration deadline cannot be after the event end date/time.');
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
        showToast('error', result.error ?? 'Failed to load registrations.');
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
      showToast('error', result.error ?? 'Failed to update registration status.');
      return;
    }
    showToast('success', 'Registration updated.');
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

  // ── Event assets (banner/flyer/gallery/document) ─────────────────────────
  const refreshAssetsAfterUpload = useCallback(async () => {
    if (!isEdit || !id) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;
    const data = await eventsService.getById(token, id);
    if (data) {
      setAssets(Array.isArray(data.assets) ? data.assets : []);
      setBannerImageUrl(data.banner_image_url ?? null);
      // 063A — refresh ai_metadata too so the sample analysis pill
      // reflects the server's reset/clear behavior on
      // upload/replace/remove of badge_sample.
      setAiMetadata(data.ai_metadata ?? null);
    }
  }, [id, isEdit]);

  // 063A — Poll get_event_by_id_with_session every 4s for up to 60s and
  // refresh ai_metadata so the sample analysis pill reflects the latest
  // server status. Stops as soon as status flips out of 'pending'.
  const pollSampleAnalysis = useCallback(async () => {
    if (!isEdit || !id) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;
    setAnalysisPolling(true);
    setAnalysisPollTimedOut(false);
    const start = Date.now();
    const MAX_MS = 60_000;
    const INTERVAL_MS = 4_000;
    try {
      while (Date.now() - start < MAX_MS) {
        await new Promise((r) => window.setTimeout(r, INTERVAL_MS));
        const data = await eventsService.getById(token, id);
        if (data) {
          setAssets(Array.isArray(data.assets) ? data.assets : []);
          setAiMetadata(data.ai_metadata ?? null);
          const status = (data.ai_metadata as Record<string, unknown> | null)
            ?.['badge_design_analysis_status'] as BadgeDesignAnalysisStatus | undefined;
          if (status && status !== 'pending') {
            return;
          }
        }
      }
      setAnalysisPollTimedOut(true);
    } finally {
      setAnalysisPolling(false);
    }
  }, [id, isEdit]);

  const triggerSampleAnalysis = useCallback(
    async (assetId: string, opts?: { successToast?: string }) => {
      if (!isEdit || !id) return;
      const token = sessionManager.getSessionToken();
      if (!token) {
        showToast('error', 'Session expired.');
        return;
      }
      setAnalysisBusy(true);
      setAnalysisPollTimedOut(false);
      try {
        const result = await eventsService.triggerBadgeSampleAnalysis(token, id, assetId);
        // Always re-read to pick up server-side status writes regardless of
        // sync vs async analyzer behavior.
        await refreshAssetsAfterUpload();
        if (!result.success) {
          showToast('error', result.error ?? 'Could not analyze the sample.');
        } else if (opts?.successToast) {
          showToast('success', opts.successToast);
        }
        // If the analyzer reported pending (async path), poll for completion.
        if (result.status === 'pending') {
          void pollSampleAnalysis();
        }
      } finally {
        setAnalysisBusy(false);
      }
    },
    [id, isEdit, pollSampleAnalysis, refreshAssetsAfterUpload, showToast],
  );

  const handleAssetUpload = useCallback(
    async (kind: EventAssetKind, file: File, label?: string) => {
      if (!isEdit || !id) {
        showToast('error', 'Save the event before uploading media.');
        return;
      }
      const token = sessionManager.getSessionToken();
      if (!token) {
        showToast('error', 'Session expired.');
        return;
      }
      setUploadingKind(kind);
      try {
        const result = await eventsService.uploadAsset({
          sessionToken: token,
          eventId: id,
          kind,
          file,
          label: label ?? null,
        });
        if (!result.success) {
          showToast('error', result.error ?? 'Upload failed.');
          return;
        }
        const c = result.compression;
        const baseMsg = kind === 'banner' ? 'Banner updated.' : 'Upload complete.';
        if (c?.compressed) {
          const before = Math.max(1, Math.round(c.originalBytes / 1024));
          const after = Math.max(1, Math.round(c.finalBytes / 1024));
          const note = c.hitFloor ? ' (still over 1 MB at floor quality)' : '';
          showToast('success', `${baseMsg} Optimized ${before} KB → ${after} KB${note}.`);
        } else {
          showToast('success', baseMsg);
        }
        await refreshAssetsAfterUpload();
        // 063A — automatically kick off badge sample analysis as soon as
        // the sample asset upload succeeds. Server has already reset
        // status='pending' in record_event_asset_with_session.
        if (kind === 'badge_sample' && result.asset_id) {
          void triggerSampleAnalysis(result.asset_id);
        }
      } finally {
        setUploadingKind(null);
      }
    },
    [id, isEdit, refreshAssetsAfterUpload, showToast, triggerSampleAnalysis],
  );

  const handleAssetDelete = useCallback(
    async (assetId: string) => {
      const token = sessionManager.getSessionToken();
      if (!token) {
        showToast('error', 'Session expired.');
        return;
      }
      if (!window.confirm('Remove this item? This cannot be undone.')) return;
      const result = await eventsService.deleteAsset(token, assetId);
      if (!result.success) {
        showToast('error', result.error ?? 'Failed to remove item.');
        return;
      }
      showToast('success', 'Removed.');
      await refreshAssetsAfterUpload();
    },
    [refreshAssetsAfterUpload, showToast],
  );

  // Manual refresh used by the "Still analyzing…" passive state and the
  // generic Refresh affordance after a poll timeout.
  const refreshSampleAnalysisOnce = useCallback(async () => {
    setAnalysisPollTimedOut(false);
    await refreshAssetsAfterUpload();
  }, [refreshAssetsAfterUpload]);

  const flyerAssets = useMemo(
    () => assets.filter((a) => a.kind === 'flyer' || a.kind === 'gallery'),
    [assets],
  );
  const documentAssets = useMemo(() => assets.filter((a) => a.kind === 'document'), [assets]);

  // ── Publish-time RSVP share package (040A-HOTFIX) ────────────────────────
  const isPublished = original?.status === 'published';

  useEffect(() => {
    let active = true;
    if (!isPublished || !id) {
      setShortShareCode('');
      return;
    }
    const run = async () => {
      setShortShareLoading(true);
      try {
        const token = sessionManager.getSessionToken();
        if (!token) return;
        const result = await eventsService.ensureShortShareUrl(token, id);
        if (!active) return;
        if (!result.success) {
          showToast('error', result.error ?? 'Could not load short URL.');
          return;
        }
        setShortShareCode((result.short_code ?? '').trim().toLowerCase());
      } finally {
        if (active) setShortShareLoading(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [isPublished, id, showToast]);

  const publicEventUrl = useMemo(() => {
    if (!isPublished) return '';
    const slugForUrl = (slug || original?.slug || '').trim();
    if (!slugForUrl) return '';
    if (typeof window === 'undefined') return `/events/${slugForUrl}`;
    return `${window.location.origin}/events/${slugForUrl}`;
  }, [isPublished, slug, original?.slug]);

  const shortEventUrl = useMemo(() => {
    if (!isPublished || !shortShareCode) return '';
    if (typeof window === 'undefined') return `/r/${shortShareCode}`;
    return `${window.location.origin}/r/${shortShareCode}`;
  }, [isPublished, shortShareCode]);

  const preferredShareUrl = shortEventUrl;

  const normalizeRegistrationWording = useCallback((text: string): string => {
    if (!text) return '';
    return text
      .replace(/\bRSVPs\b/g, 'Registrations')
      .replace(/\brsvps\b/g, 'registrations')
      .replace(/\bRSVP\b/g, 'Registration')
      .replace(/\bRsvp\b/g, 'Registration')
      .replace(/\brsvp\b/g, 'registration');
  }, []);

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
    if (preferredShareUrl) {
      lines.push('');
      lines.push(`Registration / details: ${preferredShareUrl}`);
    }
    return lines.join('\n').trim();
  }, [title, startAt, endAt, location, preferredShareUrl]);

  // The message we actually share. If a saved WhatsApp message exists,
  // normalize old RSVP wording and force short-URL usage in preview/share.
  const shareMessage = useMemo(() => {
    if (!isPublished) return '';
    const saved = whatsappMessage.trim();
    if (saved) {
      let nextMessage = normalizeRegistrationWording(saved);
      if (publicEventUrl) {
        nextMessage = nextMessage.split(publicEventUrl).join(preferredShareUrl || '');
      }
      nextMessage = nextMessage
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (preferredShareUrl && !nextMessage.includes(preferredShareUrl)) {
        return `${nextMessage}\n\nRegistration / details: ${preferredShareUrl}`;
      }
      return nextMessage;
    }
    return buildDefaultShareMessage();
  }, [
    isPublished,
    whatsappMessage,
    publicEventUrl,
    preferredShareUrl,
    normalizeRegistrationWording,
    buildDefaultShareMessage,
  ]);

  const refreshShortShareUrl = useCallback(async () => {
    if (!id) return;
    if (!window.confirm('Regenerate short URL now? Old short links will stop working immediately.')) {
      return;
    }
    setShortShareRefreshing(true);
    try {
      const token = sessionManager.getSessionToken();
      if (!token) {
        showToast('error', 'Session expired.');
        return;
      }
      const result = await eventsService.refreshShortShareUrl(token, id);
      if (!result.success) {
        showToast('error', result.error ?? 'Could not refresh short URL.');
        return;
      }
      const nextCode = (result.short_code ?? '').trim().toLowerCase();
      if (nextCode) setShortShareCode(nextCode);
      showToast('success', 'Short registration URL refreshed.');
    } finally {
      setShortShareRefreshing(false);
    }
  }, [id, showToast]);

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
          <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
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

            {/* Banner + media + documents (edit mode only) */}
            {isEdit && (
              <div className="md:col-span-2 rounded-lg border border-border bg-muted/20 p-4 space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Media &amp; documents</h3>

                {/* Banner */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">Banner image</p>
                  {bannerImageUrl ? (
                    <div className="flex flex-wrap items-start gap-3">
                      <img
                        src={bannerImageUrl}
                        alt="Banner preview"
                        className="h-32 max-w-[420px] rounded-md border border-border object-cover"
                      />
                      <div className="flex flex-col gap-2">
                        <label className="inline-flex items-center justify-center gap-1.5 cursor-pointer rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted/50">
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            disabled={uploadingKind === 'banner'}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              if (f) void handleAssetUpload('banner', f);
                            }}
                          />
                          {uploadingKind === 'banner' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          Replace banner
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const banner = assets.find((a) => a.kind === 'banner');
                            if (banner) void handleAssetDelete(banner.id);
                          }}
                        >
                          <X className="h-3.5 w-3.5 mr-1.5" />
                          Remove banner
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <label className="inline-flex items-center gap-2 cursor-pointer rounded-md border border-dashed border-border bg-background px-4 py-3 text-sm hover:bg-muted/40">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        disabled={uploadingKind === 'banner'}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) void handleAssetUpload('banner', f);
                        }}
                      />
                      {uploadingKind === 'banner' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Upload banner image (JPEG/PNG/WebP, ≤ 8 MB)
                    </label>
                  )}
                </div>

                {/* Flyer / gallery images */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground">Additional images (flyers / gallery)</p>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted/50">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        disabled={uploadingKind === 'flyer'}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) void handleAssetUpload('flyer', f);
                        }}
                      />
                      {uploadingKind === 'flyer' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      Add image
                    </label>
                  </div>
                  {flyerAssets.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No additional images yet.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {flyerAssets.map((asset) => (
                        <div key={asset.id} className="relative group rounded-md overflow-hidden border border-border bg-background">
                          <img src={asset.public_url} alt={asset.label ?? ''} className="h-28 w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => void handleAssetDelete(asset.id)}
                            className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Remove image"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Documents */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">Downloadable documents</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[200px] space-y-1">
                      <label className="text-[11px] text-muted-foreground">Label (optional)</label>
                      <Input
                        value={docLabelDraft}
                        onChange={(e) => setDocLabelDraft(e.target.value)}
                        placeholder="e.g. Agenda PDF"
                      />
                    </div>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-xs hover:bg-muted/50">
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/jpeg,image/png"
                        className="hidden"
                        disabled={uploadingKind === 'document'}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) {
                            void handleAssetUpload('document', f, docLabelDraft || f.name);
                            setDocLabelDraft('');
                          }
                        }}
                      />
                      {uploadingKind === 'document' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Paperclip className="h-3.5 w-3.5" />
                      )}
                      Upload document
                    </label>
                  </div>
                  {documentAssets.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No documents yet. PDF/DOCX/XLSX/PPTX/JPG/PNG, ≤ 25 MB each.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-md border border-border bg-background">
                      {documentAssets.map((asset) => (
                        <li key={asset.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <div className="flex min-w-0 items-center gap-3">
                            <a
                              href={asset.public_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group block h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted/20"
                              title={`Open ${assetFileName(asset)}`}
                            >
                              {isImageAsset(asset) ? (
                                <img
                                  src={asset.public_url}
                                  alt={`${assetFileName(asset)} thumbnail`}
                                  className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-full w-full flex-col items-center justify-center bg-muted/30 text-muted-foreground">
                                  <FileText className="h-4 w-4" />
                                  <span className="mt-0.5 text-[9px] font-semibold leading-none text-foreground">
                                    {documentPreviewLabel(asset)}
                                  </span>
                                </div>
                              )}
                            </a>
                            <div className="min-w-0">
                              <a
                                href={asset.public_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block truncate text-foreground hover:text-primary"
                              >
                                {assetFileName(asset)}
                              </a>
                              <p className="text-[11px] text-muted-foreground">
                                {[asset.mime_type, formatAssetSize(asset.byte_size)].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleAssetDelete(asset.id)}
                              className="text-muted-foreground hover:text-destructive"
                              aria-label="Remove document"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Save the event first to unlock media uploads. Image files (banner, flyers, gallery) are auto-optimized for web (target &lt; 1 MB) while keeping their original dimensions; documents are uploaded as-is.
                </p>
              </div>
            )}

            <div className="space-y-2 md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium text-foreground">Excerpt</label>
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border"
                    checked={showExcerptPublicly}
                    onChange={(event) => setShowExcerptPublicly(event.target.checked)}
                  />
                  Show on website
                </label>
              </div>
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
              <p className="text-[11px] text-muted-foreground">
                AI generates a short starter description (up to 100 words). You can expand it manually here.
              </p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium text-foreground">Invitation Text</label>
                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border"
                    checked={showInvitationTextPublicly}
                    onChange={(event) => setShowInvitationTextPublicly(event.target.checked)}
                  />
                  Show on website
                </label>
              </div>
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
                  Register for Event
                </h3>
                <label className="inline-flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={rsvpEnabled}
                    onChange={(event) => setRsvpEnabled(event.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  Enable Registration
                </label>
              </div>

              {rsvpEnabled && (
                <div className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-medium text-foreground">Capacity model</label>
                    <div className="flex flex-wrap gap-3">
                      <label className="inline-flex items-center gap-2 text-xs text-foreground">
                        <input
                          type="radio"
                          name="capacity-mode"
                          value="global"
                          checked={capacityMode === 'global'}
                          onChange={() => setCapacityMode('global')}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                        Global capacity (single number for the whole event)
                      </label>
                      <label className="inline-flex items-center gap-2 text-xs text-foreground">
                        <input
                          type="radio"
                          name="capacity-mode"
                          value="per_day"
                          checked={capacityMode === 'per_day'}
                          onChange={() => setCapacityMode('per_day')}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                        Per-day capacity (enforced per selected visit date)
                      </label>
                    </div>
                  </div>
                  {capacityMode === 'global' && (
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
                  )}
                  {capacityMode === 'per_day' && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-foreground">Per-day capacity</label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={perDayCapacity}
                        onChange={(event) => setPerDayCapacity(event.target.value)}
                        placeholder="Required when per-day is selected"
                      />
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs font-medium text-foreground">Registration deadline</label>
                      <label className="inline-flex items-center gap-2 text-xs text-foreground">
                        <input
                          type="checkbox"
                          checked={rsvpDeadlineEnabled}
                          onChange={(event) => {
                            const next = event.target.checked;
                            setRsvpDeadlineEnabled(next);
                            if (next && !rsvpDeadlineAt) {
                              const fallback = endAt || startAt;
                              if (fallback) setRsvpDeadlineAt(fallback);
                            }
                          }}
                          className="h-3.5 w-3.5 rounded border-input accent-primary"
                        />
                        Enable custom deadline
                      </label>
                    </div>
                    <Input
                      type="datetime-local"
                      value={rsvpDeadlineAt}
                      disabled={!rsvpDeadlineEnabled}
                      onChange={(event) => setRsvpDeadlineAt(event.target.value)}
                      placeholder="Defaults to event end when disabled"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      When disabled, registration closes at the event end date/time and the deadline is hidden on the public page.
                    </p>
                  </div>
                  <div className="md:col-span-2 rounded-md border border-border bg-background/50 p-3">
                    <div className="mb-2 grid grid-cols-[1fr_auto_auto] gap-2 px-1 text-[11px] font-medium text-muted-foreground">
                      <span>Field</span>
                      <span>Collect</span>
                      <span>Required</span>
                    </div>
                    <div className="space-y-2">
                      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5">
                        <span className="text-xs text-foreground">
                          Email
                        </span>
                        <input
                          type="checkbox"
                          checked={rsvpCollectEmail}
                          onChange={(event) => {
                            const next = event.target.checked;
                            setRsvpCollectEmail(next);
                            if (!next) setRsvpRequireEmail(false);
                          }}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center"
                        />
                        <input
                          type="checkbox"
                          checked={rsvpRequireEmail}
                          disabled={!rsvpCollectEmail}
                          onChange={(event) => setRsvpRequireEmail(event.target.checked)}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center disabled:opacity-50"
                        />
                      </div>
                      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5">
                        <span className="text-xs text-foreground">Mobile</span>
                        <input
                          type="checkbox"
                          checked={rsvpCollectPhone}
                          onChange={(event) => {
                            const next = event.target.checked;
                            setRsvpCollectPhone(next);
                            if (!next) setRsvpRequirePhone(false);
                          }}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center"
                        />
                        <input
                          type="checkbox"
                          checked={rsvpRequirePhone}
                          disabled={!rsvpCollectPhone}
                          onChange={(event) => setRsvpRequirePhone(event.target.checked)}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center disabled:opacity-50"
                        />
                      </div>
                      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5">
                        <span className="text-xs text-foreground">Company / Organization</span>
                        <input
                          type="checkbox"
                          checked={rsvpCollectCompany}
                          onChange={(event) => {
                            const next = event.target.checked;
                            setRsvpCollectCompany(next);
                            if (!next) setRsvpRequireCompany(false);
                          }}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center"
                        />
                        <input
                          type="checkbox"
                          checked={rsvpRequireCompany}
                          disabled={!rsvpCollectCompany}
                          onChange={(event) => setRsvpRequireCompany(event.target.checked)}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center disabled:opacity-50"
                        />
                      </div>
                      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5">
                        <span className="text-xs text-foreground">Gender</span>
                        <input
                          type="checkbox"
                          checked={rsvpCollectGender}
                          onChange={(event) => {
                            const next = event.target.checked;
                            setRsvpCollectGender(next);
                            if (!next) setRsvpRequireGender(false);
                          }}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center"
                        />
                        <input
                          type="checkbox"
                          checked={rsvpRequireGender}
                          disabled={!rsvpCollectGender}
                          onChange={(event) => setRsvpRequireGender(event.target.checked)}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center disabled:opacity-50"
                        />
                      </div>
                      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5">
                        <span className="text-xs text-foreground">Meal preference</span>
                        <input
                          type="checkbox"
                          checked={rsvpCollectMeal}
                          onChange={(event) => {
                            const next = event.target.checked;
                            setRsvpCollectMeal(next);
                            if (!next) setRsvpRequireMeal(false);
                          }}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center"
                        />
                        <input
                          type="checkbox"
                          checked={rsvpRequireMeal}
                          disabled={!rsvpCollectMeal}
                          onChange={(event) => setRsvpRequireMeal(event.target.checked)}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center disabled:opacity-50"
                        />
                      </div>
                      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5">
                        <span className="text-xs text-foreground">Profession</span>
                        <input
                          type="checkbox"
                          checked={rsvpCollectProfession}
                          onChange={(event) => {
                            const next = event.target.checked;
                            setRsvpCollectProfession(next);
                            if (!next) setRsvpRequireProfession(false);
                          }}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center"
                        />
                        <input
                          type="checkbox"
                          checked={rsvpRequireProfession}
                          disabled={!rsvpCollectProfession}
                          onChange={(event) => setRsvpRequireProfession(event.target.checked)}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center disabled:opacity-50"
                        />
                      </div>
                      {rsvpCollectProfession && (
                        <div className="space-y-1.5 rounded-md border border-dashed border-border/70 bg-background px-3 py-2">
                          <label className="text-xs font-medium text-foreground">
                            Profession dropdown options
                          </label>
                          <Textarea
                            value={rsvpProfessionOptionsText}
                            onChange={(event) => setRsvpProfessionOptionsText(event.target.value.slice(0, 1200))}
                            rows={5}
                            placeholder="One option per line"
                            className="min-h-[112px] text-xs"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            One option per line. These options appear on the public registration form for this event.
                          </p>
                        </div>
                      )}
                      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5">
                        <span className="text-xs text-foreground">Designation</span>
                        <input
                          type="checkbox"
                          checked={rsvpCollectDesignation}
                          onChange={(event) => {
                            const next = event.target.checked;
                            setRsvpCollectDesignation(next);
                            if (!next) setRsvpRequireDesignation(false);
                          }}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center"
                        />
                        <input
                          type="checkbox"
                          checked={rsvpRequireDesignation}
                          disabled={!rsvpCollectDesignation}
                          onChange={(event) => setRsvpRequireDesignation(event.target.checked)}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center disabled:opacity-50"
                        />
                      </div>
                      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5">
                        <span className="text-xs text-foreground">Aadhaar Card</span>
                        <input
                          type="checkbox"
                          checked={rsvpCollectAadhaar}
                          onChange={(event) => {
                            const next = event.target.checked;
                            setRsvpCollectAadhaar(next);
                            if (!next) setRsvpRequireAadhaar(false);
                          }}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center"
                        />
                        <input
                          type="checkbox"
                          checked={rsvpRequireAadhaar}
                          disabled={!rsvpCollectAadhaar}
                          onChange={(event) => setRsvpRequireAadhaar(event.target.checked)}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center disabled:opacity-50"
                        />
                      </div>
                      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border border-border/60 bg-background px-2 py-1.5">
                        <span className="text-xs text-foreground">Note</span>
                        <input
                          type="checkbox"
                          checked={rsvpCollectNote}
                          onChange={(event) => {
                            const next = event.target.checked;
                            setRsvpCollectNote(next);
                            if (!next) setRsvpRequireNote(false);
                          }}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center"
                        />
                        <input
                          type="checkbox"
                          checked={rsvpRequireNote}
                          disabled={!rsvpCollectNote}
                          onChange={(event) => setRsvpRequireNote(event.target.checked)}
                          className="h-3.5 w-3.5 rounded border-input accent-primary justify-self-center disabled:opacity-50"
                        />
                      </div>
                    </div>
                    <p className="mt-2 px-1 text-[11px] text-muted-foreground">
                      Toggle Collect to show a field on the public registration form, and Required to make it mandatory.
                    </p>
                  </div>

                  <div className="md:col-span-2">
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
                    Tick "Collect" to show a field. Tick "Required" to make submitting that field mandatory.
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
                    Registration roster
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
                    {rsvpLoading ? 'Loading…' : 'No registrations yet.'}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-2 py-1">Name</th>
                          <th className="px-2 py-1">Email</th>
                          <th className="px-2 py-1">Mobile</th>
                          <th className="px-2 py-1">Company / Organization</th>
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

            {/* 054 — Badge name display options (edit mode only).
                Persists in events.ai_metadata; the badge renderer reads
                them at request time. Saves on the next event Save. */}
            {isEdit && (
              <div className="md:col-span-2 rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Badge name display</h3>
                <p className="text-xs text-muted-foreground">
                  Controls how the attendee's name appears on the printed badge. Leaves long names readable when there's
                  little horizontal space.
                </p>
                <label className="inline-flex items-center gap-2 text-xs text-foreground">
                  <input
                    type="checkbox"
                    checked={badgeIncludeSurname}
                    onChange={(e) => setBadgeIncludeSurname(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-input accent-primary"
                  />
                  Include surname (when off, only the given name is shown)
                </label>
                <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Max characters (default 25)</label>
                    <Input
                      type="number"
                      min={6}
                      max={40}
                      value={badgeNameMaxChars}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        setBadgeNameMaxChars(Math.max(6, Math.min(40, Math.floor(n))));
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">Font size in points (default 22)</label>
                    <Input
                      type="number"
                      min={8}
                      max={32}
                      value={badgeNameFontSize}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        setBadgeNameFontSize(Math.max(8, Math.min(32, Math.floor(n))));
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 052 — Badge design references (edit mode only).
                Two singleton uploads stored as event_assets kinds
                'badge_template' and 'badge_sample'. These are admin-only
                references for an upcoming AI-driven badge design pass; the
                public detail RPC excludes them, so they never leak to
                visitors. */}
            {isEdit && (
              <div className="md:col-span-2 rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Badge design references</h3>
                  <p className="text-xs text-muted-foreground">
                    Upload your badge template and a sample/expected badge so AI can match your style. PDF or image,
                    one of each per event. These files are admin-only and never shown on the public event page.
                    They are retained until an admin replaces or removes them.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                  {(['badge_template', 'badge_sample'] as const).map((k) => {
                    const existing = assets.find((a) => a.kind === k);
                    const titleLabel = k === 'badge_template' ? 'Badge template' : 'Sample badge';
                    const inputId = `upload-${k}`;
                    const uploading = uploadingKind === k;
                    const isSample = k === 'badge_sample';
                    return (
                      <div key={k} className="rounded-md border border-border bg-background p-3 space-y-2">
                        <p className="text-xs font-medium text-foreground">{titleLabel}</p>
                        {existing ? (
                          <div className="space-y-2">
                            <a
                              href={existing.public_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group block overflow-hidden rounded-md border border-border bg-muted/20"
                              title={`Open ${assetFileName(existing)}`}
                            >
                              {isImageAsset(existing) ? (
                                <img
                                  src={existing.public_url}
                                  alt={`${titleLabel} thumbnail`}
                                  className="h-32 w-full object-contain bg-[linear-gradient(45deg,rgba(0,0,0,0.04)_25%,transparent_25%,transparent_75%,rgba(0,0,0,0.04)_75%),linear-gradient(45deg,rgba(0,0,0,0.04)_25%,transparent_25%,transparent_75%,rgba(0,0,0,0.04)_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] transition-transform group-hover:scale-[1.01]"
                                  loading="lazy"
                                />
                              ) : isPdfAsset(existing) ? (
                                <div className="flex h-32 w-full flex-col items-center justify-center gap-2 bg-muted/30 text-muted-foreground">
                                  <FileText className="h-8 w-8" />
                                  <span className="text-[11px] font-medium text-foreground">PDF reference</span>
                                  <span className="text-[10px]">Open to preview</span>
                                </div>
                              ) : (
                                <div className="flex h-32 w-full flex-col items-center justify-center gap-2 bg-muted/30 text-muted-foreground">
                                  <ImageIcon className="h-8 w-8" />
                                  <span className="text-[11px] font-medium text-foreground">Uploaded reference</span>
                                </div>
                              )}
                            </a>
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="min-w-0">
                                <a
                                  href={existing.public_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block truncate text-primary hover:underline max-w-[220px]"
                                >
                                  {assetFileName(existing)}
                                </a>
                                <p className="text-[10px] text-muted-foreground">
                                  {[existing.mime_type, formatAssetSize(existing.byte_size)].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <label
                                  htmlFor={inputId}
                                  className={`inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 ${
                                    canEdit ? 'cursor-pointer hover:bg-muted/50' : 'opacity-50 cursor-not-allowed'
                                  }`}
                                  aria-disabled={!canEdit}
                                >
                                  {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                  Replace
                                </label>
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => void handleAssetDelete(existing.id)}
                                    className="text-muted-foreground hover:text-destructive"
                                    aria-label={`Remove ${titleLabel}`}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <label
                            htmlFor={inputId}
                            className={`inline-flex items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2 text-xs w-full justify-center ${
                              canEdit ? 'cursor-pointer hover:bg-muted/40' : 'opacity-50 cursor-not-allowed'
                            }`}
                            aria-disabled={!canEdit}
                          >
                            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                            Upload {titleLabel.toLowerCase()} (PDF or image)
                          </label>
                        )}
                        <input
                          id={inputId}
                          type="file"
                          accept=".pdf,image/jpeg,image/png"
                          className="hidden"
                          disabled={uploading || !canEdit}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (f) void handleAssetUpload(k, f, titleLabel);
                          }}
                        />
                        {/* 063A — sample analysis status pill */}
                        {isSample && (() => {
                          const meta = (aiMetadata && typeof aiMetadata === 'object' ? aiMetadata : {}) as Record<string, unknown>;
                          const status = meta['badge_design_analysis_status'] as BadgeDesignAnalysisStatus | undefined;
                          const errorMsg = (meta['badge_design_analysis_error'] as string | null | undefined) ?? null;
                          const analysis = (meta['badge_design_analysis'] as BadgeDesignAnalysis | undefined) ?? undefined;
                          const summary = (analysis?.raw_summary ?? '').slice(0, 500);
                          const sampleAssetId = existing?.id;
                          if (!existing) return null;

                          // Pill state machine
                          let pill: React.ReactNode = null;
                          let action: React.ReactNode = null;

                          if (analysisPolling || status === 'pending') {
                            pill = (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Analyzing sample…
                              </span>
                            );
                            if (analysisPollTimedOut) {
                              action = canEdit && (
                                <button
                                  type="button"
                                  onClick={() => void refreshSampleAnalysisOnce()}
                                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-muted/50"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  Refresh
                                </button>
                              );
                            }
                          } else if (status === 'complete') {
                            pill = (
                              <span
                                title={summary || 'Design analyzed'}
                                className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300"
                              >
                                <Check className="h-3 w-3" />
                                Design analyzed
                              </span>
                            );
                            action = canEdit && sampleAssetId && (
                              <button
                                type="button"
                                onClick={() => void triggerSampleAnalysis(sampleAssetId, { successToast: 'Re-analysis started.' })}
                                disabled={analysisBusy}
                                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-muted/50 disabled:opacity-60"
                              >
                                {analysisBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                Re-analyze
                              </button>
                            );
                          } else if (status === 'failed') {
                            pill = (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
                                <X className="h-3 w-3" />
                                Analysis failed
                              </span>
                            );
                            action = canEdit && sampleAssetId && (
                              <button
                                type="button"
                                onClick={() => void triggerSampleAnalysis(sampleAssetId, { successToast: 'Retrying analysis…' })}
                                disabled={analysisBusy}
                                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-muted/50 disabled:opacity-60"
                              >
                                {analysisBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                Retry
                              </button>
                            );
                          } else {
                            // Sample exists but no analysis metadata → legacy.
                            pill = (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                Not analyzed
                              </span>
                            );
                            action = canEdit && sampleAssetId && (
                              <button
                                type="button"
                                onClick={() => void triggerSampleAnalysis(sampleAssetId, { successToast: 'Analyzing sample…' })}
                                disabled={analysisBusy}
                                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-muted/50 disabled:opacity-60"
                              >
                                {analysisBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                                Analyze now
                              </button>
                            );
                          }

                          return (
                            <div className="space-y-1.5 pt-1">
                              <div className="flex flex-wrap items-center gap-2">
                                {pill}
                                {action}
                              </div>
                              {status === 'failed' && errorMsg && (
                                <p
                                  className="text-[11px] text-destructive truncate"
                                  title={errorMsg}
                                >
                                  {errorMsg.slice(0, 120)}
                                </p>
                              )}
                              {status === 'complete' && summary && (
                                <p className="text-[11px] text-muted-foreground line-clamp-2">
                                  {summary}
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
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

            {/* Share Registration package (published events only) */}
            {isPublished && (
              <div className="md:col-span-2 rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                    <Share2 className="h-4 w-4" />
                    Share Registration
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
                    Generate Registration Share Message with AI
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Public Registration URL</label>
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
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-foreground">Short Registration URL (permanent)</label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={refreshShortShareUrl}
                      disabled={shortShareLoading || shortShareRefreshing || !id}
                    >
                      {shortShareRefreshing ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Refresh Short Registration URL
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={shortShareLoading ? 'Generating short URL...' : shortEventUrl}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void copyTextSafely(shortEventUrl, 'Short URL copied to clipboard.')}
                      disabled={!shortEventUrl}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copy Short URL
                    </Button>
                    {shortEventUrl && (
                      <a
                        href={shortEventUrl}
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
                    Short URL is stable even if the event slug changes. Refresh creates a new short URL and invalidates the old one.
                  </p>
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
                      Built from your saved WhatsApp message (with short URL appended when available) or, if empty, a compact auto-built invite.
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
