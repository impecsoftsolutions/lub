import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Upload,
  X,
  GripVertical,
  Plus,
  Loader2,
  Globe,
  Save,
  Archive,
  Trash2,
  Star,
  Image as ImageIcon,
  Youtube,
  Calendar,
  MapPin,
  FileText,
  Sparkles,
  AlertCircle,
  Download,
  Link2,
  Lock,
  Unlock,
  Pencil,
  Share2,
  Copy,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import {
  activitiesService,
  eventsService,
  aiSettingsService,
  ACTIVITY_AI_SUPPORTED_PROVIDERS,
  type ActivityLimits,
  type ActivityCoverMediaPayload,
  type ActivityMediaItem,
  type ActivityMediaStorageProvider,
  type AIRuntimeProfile,
  type AIProvider,
  type EligibleEventRow,
} from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import {
  validateImageFile,
  readFileAsDataURL,
} from '../lib/imageProcessing';
import ImageCropModal from '../components/ImageCropModal';
import Toast from '../components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { buildActivityMediaUrl } from '../lib/activityMedia';

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€â”€ Slug helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function toDateInput(value: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
}

function toDateInputFromDate(value: string | null): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const normalized = trimmed.includes('T') ? trimmed : `${trimmed}T10:00:00`;
  return toDateInput(normalized);
}

function toActivityStartAtIso(dateValue: string): string {
  return `${dateValue}T10:00:00`;
}

function toActivityEndAtIso(dateValue: string): string {
  return `${dateValue}T17:00:00`;
}

// â”€â”€â”€ Drag-reorder helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function reorder<T>(list: T[], from: number, to: number): T[] {
  const result = [...list];
  const [moved] = result.splice(from, 1);
  result.splice(to, 0, moved);
  return result;
}

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface GalleryItem {
  /** Set when the image is already persisted (from existing activity) */
  mediaId?: string;
  /** Public URL (existing) or local object URL (new) */
  previewUrl: string;
  /** Persisted display URL seed before any Worker variant is applied. */
  storageUrl?: string | null;
  /** Blob to upload; null when already persisted */
  blob: Blob | null;
  /** Highest-quality original file selected by the admin; uploaded to R2. */
  originalFile?: File | null;
  /** Optional crop/trim metadata applied by the Cloudflare worker. */
  transform?: ActivityImageTransform | null;
  /** Original download metadata for persisted items. */
  originalObjectKey?: string | null;
  originalFilename?: string | null;
  storageProvider?: ActivityMediaStorageProvider | null;
  /** Pending removal from server */
  pendingDelete?: boolean;
}

interface ActivityImageTransform {
  trim?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
}

// AI source-document upload limits â€” module-level so they don't trigger
// react-hooks/exhaustive-deps warnings inside callbacks.
const AI_SOURCE_MAX_FILES = 3;
const AI_SOURCE_PER_IMAGE_MAX = 10 * 1024 * 1024;  // 10 MB per image (JPEG/PNG)
const AI_SOURCE_PER_PDF_MAX = 20 * 1024 * 1024;    // 20 MB per PDF
const AI_SOURCE_TOTAL_MAX = 30 * 1024 * 1024;      // 30 MB cumulative
const AI_SOURCE_ACCEPTED_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
const AI_BRIEF_MAX_CHARS = 4000;

const readFileAsBase64Plain = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx < 0) { reject(new Error('Failed to parse file')); return; }
      resolve(dataUrl.slice(commaIdx + 1));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

const formatSourceFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const stripActivityMediaVariant = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('variant');
    parsed.searchParams.delete('download');
    return parsed.toString();
  } catch {
    return url.split('?')[0] || null;
  }
};

const toCoverSeedUrl = (url: string | null | undefined): string | null => {
  const seedUrl = stripActivityMediaVariant(url);
  if (!seedUrl) return null;
  try {
    const parsed = new URL(seedUrl);
    if (parsed.pathname.startsWith('/v1/activities/gallery/')) {
      parsed.pathname = parsed.pathname.replace('/v1/activities/gallery/', '/v1/activities/cover/');
    }
    return parsed.toString();
  } catch {
    return seedUrl;
  }
};

const resolveRenderableImageUrl = async (
  primaryUrl: string,
  fallbackUrl: string | null,
): Promise<string> => {
  const canLoad = (url: string): Promise<boolean> =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });

  const primaryOk = await canLoad(primaryUrl);
  if (primaryOk) return primaryUrl;
  if (fallbackUrl) return fallbackUrl;
  return primaryUrl;
};

// Ratio choices for the in-modal gallery crop selector. `aspect: null` means
// "Original - keep native ratio, no crop, just resize+compress".
const GALLERY_CROP_RATIO_OPTIONS = [
  { value: 'original', label: 'Original', aspect: null as number | null,           outputWidth: undefined, outputHeight: undefined },
  { value: '16:9',     label: '16:9',     aspect: 16 / 9 as number | null,         outputWidth: 1600,      outputHeight: 900 },
  { value: '4:3',      label: '4:3',      aspect: 4 / 3 as number | null,          outputWidth: 1600,      outputHeight: 1200 },
  { value: '1:1',      label: '1:1',      aspect: 1 as number | null,              outputWidth: 1200,      outputHeight: 1200 },
  { value: '3:4',      label: '3:4',      aspect: 3 / 4 as number | null,          outputWidth: 1200,      outputHeight: 1600 },
  { value: '9:16',     label: '9:16',     aspect: 9 / 16 as number | null,         outputWidth: 900,       outputHeight: 1600 },
];

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const AdminActivityForm: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const canPublish = useHasPermission('activities.publish');
  const canEdit    = useHasPermission('activities.edit_any');
  const canDelete  = useHasPermission('activities.delete');

  // â”€â”€ Form state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const [title, setTitle]           = useState('');
  const [slug, setSlug]             = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [slugEditing, setSlugEditing] = useState(false);
  const [excerpt, setExcerpt]       = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt]       = useState('');
  const [endAt, setEndAt]           = useState('');
  const [location, setLocation]     = useState('');
  const [linkedEventId, setLinkedEventId] = useState('');
  const [linkedEventMeta, setLinkedEventMeta] = useState<{
    id: string;
    slug: string;
    title: string;
    status: string;
    start_at: string | null;
    end_at: string | null;
  } | null>(null);
  const [linkableEvents, setLinkableEvents] = useState<EligibleEventRow[]>([]);
  const [linkableEventsLoading, setLinkableEventsLoading] = useState(false);
  const [isFeatured, setIsFeatured] = useState(false);
  const [youtubeUrls, setYoutubeUrls] = useState<string[]>(['']);

  // Cover image
  const [coverImageUrl, setCoverImageUrl]           = useState<string | null>(null);
  const [coverImageBlob, setCoverImageBlob]         = useState<Blob | null>(null);
  const [coverOriginalFile, setCoverOriginalFile]   = useState<File | null>(null);
  const [coverTransform, setCoverTransform]         = useState<ActivityImageTransform | null>(null);
  const [coverOriginalObjectKey, setCoverOriginalObjectKey] = useState<string | null>(null);
  const [coverStorageProvider, setCoverStorageProvider] = useState<ActivityMediaStorageProvider | null>(null);
  const [coverPreview, setCoverPreview]             = useState<string | null>(null);
  const [coverCropSrc, setCoverCropSrc]             = useState<string | null>(null);
  const [coverCropSourceFile, setCoverCropSourceFile] = useState<File | null>(null);
  const [showCoverCrop, setShowCoverCrop]           = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Gallery
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [galleryCropSrc, setGalleryCropSrc]   = useState<string | null>(null);
  const [galleryCropSourceFile, setGalleryCropSourceFile] = useState<File | null>(null);
  const [showGalleryCrop, setShowGalleryCrop] = useState(false);
  const [galleryQueue, setGalleryQueue]       = useState<File[]>([]);
  const galleryQueueRef = useRef<File[]>([]);
  // Last ratio chosen during the current batch â€” used as the default for the
  // next file in the same batch so admins don't have to re-pick every time.
  // Reset to 'original' when a fresh batch is opened.
  const [galleryLastRatio, setGalleryLastRatio] = useState<string>('original');
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // UI state
  const [isLoading, setIsLoading]   = useState(isEdit);
  const [isSaving, setIsSaving]     = useState(false);
  const [originalStatus, setOriginalStatus] = useState<string>('draft');
  const [limits, setLimits] = useState<ActivityLimits>(activitiesService.defaultLimits);
  const [shortShareCode, setShortShareCode] = useState('');
  const [shortShareLoading, setShortShareLoading] = useState(false);
  const [shortUrlEnabled, setShortUrlEnabled] = useState(true);
  const [shortUrlToggling, setShortUrlToggling] = useState(false);
  const [shareMessage, setShareMessage] = useState('');
  const [shareGenerating, setShareGenerating] = useState(false);

  // AI assist state
  const [activityBrief, setActivityBrief] = useState('');
  const [aiRuntimeProfile, setAiRuntimeProfile] = useState<AIRuntimeProfile | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // AI source documents (optional â€” sent to edge function for richer drafts)
  const [aiSourceFiles, setAiSourceFiles] = useState<Array<{
    name: string;
    mime: string;
    size: number;
    base64: string;
  }>>([]);
  const aiSourceInputRef = useRef<HTMLInputElement>(null);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  }, []);

  // Drag state (simple index-based)
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  // â”€â”€ Load existing activity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      try {
        const token = sessionManager.getSessionToken();
        if (!token) { showToast('error', 'Session expired.'); return; }
        const data = await activitiesService.getById(token, id);
        if (!data) { showToast('error', 'Activity not found.'); navigate('/admin/content/activities'); return; }
        if (cancelled) return;

        setTitle(data.title);
        setSlug(data.slug);
        setShortShareCode((data.short_url_code ?? '').trim().toLowerCase());
        setShortUrlEnabled(data.short_url_enabled !== false); // default true if null/undefined
        setShareMessage(data.share_message ?? '');
        setSlugManual(true); // don't auto-generate when editing
        setSlugEditing(false);
        setExcerpt(data.excerpt ?? '');
        setDescription(data.description ?? '');
        const hydratedStartAt = toDateInput(data.start_at ?? null) || toDateInputFromDate(data.activity_date ?? null);
        setStartAt(hydratedStartAt);
        setEndAt(toDateInput(data.end_at ?? null));
        setLocation(data.location ?? '');
        setLinkedEventId(data.source_event_id ?? '');
        setLinkedEventMeta(data.source_event ?? null);
        setIsFeatured(data.is_featured);
        setYoutubeUrls(data.youtube_urls?.length ? data.youtube_urls : ['']);
        setCoverImageUrl(data.cover_image_url);
        setCoverPreview(buildActivityMediaUrl(data.cover_image_url, 'cover-admin'));
        setCoverStorageProvider(data.cover_storage_provider ?? null);
        setCoverOriginalObjectKey(data.cover_original_object_key ?? null);
        setCoverOriginalFile(null);
        setCoverTransform(null);
        setOriginalStatus(data.status);

        const mappedGallery = (data.media ?? [])
          .sort((a: ActivityMediaItem, b: ActivityMediaItem) => a.display_order - b.display_order)
          .map((m: ActivityMediaItem) => ({
            mediaId: m.id,
            previewUrl: buildActivityMediaUrl(m.storage_url, 'gallery-grid') ?? m.storage_url,
            storageUrl: m.storage_url,
            blob: null,
            originalFile: null,
            transform: null,
            originalObjectKey: m.original_object_key ?? null,
            originalFilename: m.original_filename ?? null,
            storageProvider: m.storage_provider ?? null,
          }));

        const normalizedGallery = await Promise.all(
          mappedGallery.map(async (item) => {
            const previewUrl = await resolveRenderableImageUrl(
              item.previewUrl,
              buildActivityMediaUrl(data.cover_image_url, 'cover-admin'),
            );
            return { ...item, previewUrl };
          }),
        );
        if (cancelled) return;
        setGallery(normalizedGallery);
      } catch (err) {
        console.error('[AdminActivityForm] load error:', err);
        showToast('error', 'Failed to load activity.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [id, navigate, showToast]);

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      const token = sessionManager.getSessionToken();
      if (!token) return;

      try {
        const settings = await activitiesService.getSettings(token);
        if (!cancelled) {
          setLimits(activitiesService.getLimits(settings));
        }
      } catch (err) {
        console.warn('[AdminActivityForm] failed to load activity settings, using defaults', err);
        if (!cancelled) {
          setLimits(activitiesService.defaultLimits);
        }
      }
    };

    void loadSettings();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadLinkableEvents = async () => {
      const token = sessionManager.getSessionToken();
      if (!token) return;
      setLinkableEventsLoading(true);
      try {
        const result = await eventsService.getEligibleForActivity(token, 200);
        if (!cancelled) {
          if (result.success) {
            setLinkableEvents(result.rows);
          } else {
            setLinkableEvents([]);
            console.warn('[AdminActivityForm] failed to load linkable events:', result.error);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setLinkableEvents([]);
        }
        console.warn('[AdminActivityForm] linkable events load exception:', err);
      } finally {
        if (!cancelled) setLinkableEventsLoading(false);
      }
    };
    void loadLinkableEvents();
    return () => { cancelled = true; };
  }, []);

  // â”€â”€ Load AI runtime profile (no key, just provider/model/is_enabled) â”€â”€â”€â”€â”€

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      try {
        const profile = await aiSettingsService.getRuntimeProfile();
        if (!cancelled) setAiRuntimeProfile(profile);
      } catch {
        if (!cancelled) setAiRuntimeProfile(null);
      }
    };
    void loadProfile();
    return () => { cancelled = true; };
  }, []);

  // â”€â”€ Pre-seed AI inputs from form values when panel opens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // â”€â”€ AI generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // True availability honors both runtime enabled AND provider support.
  // Today only OpenAI is wired end-to-end; other providers must show an
  // honest "not yet supported" branch instead of a green "Generate" CTA.
  const isEnabled = aiRuntimeProfile?.is_enabled === true;
  const profileProvider = (aiRuntimeProfile?.provider ?? null) as AIProvider | null;
  const providerSupported =
    profileProvider !== null && ACTIVITY_AI_SUPPORTED_PROVIDERS.includes(profileProvider);
  const aiAvailable = isEnabled && providerSupported;
  const aiProviderLabel = aiRuntimeProfile?.provider ?? 'AI';
  const aiModelLabel = aiRuntimeProfile?.model ?? '';

  // Status chip text â€” explicit rather than generic "Unavailable".
  let aiStatusLabel: string;
  if (aiAvailable) {
    aiStatusLabel = `${aiProviderLabel}${aiModelLabel ? ` · ${aiModelLabel}` : ''}`;
  } else if (!aiRuntimeProfile) {
    aiStatusLabel = 'Not configured';
  } else if (!isEnabled) {
    aiStatusLabel = `${aiProviderLabel} · disabled`;
  } else if (!providerSupported) {
    aiStatusLabel = `${aiProviderLabel} · not supported`;
  } else {
    aiStatusLabel = 'Unavailable';
  }

  // Inline message rendered in the panel when AI is not available.
  let aiUnavailableMessage: string | null = null;
  if (!aiAvailable) {
    if (!aiRuntimeProfile) {
      aiUnavailableMessage =
        'AI generation is not configured. Configure provider, model, and API key under Admin â†’ Settings â†’ AI Settings.';
    } else if (!isEnabled) {
      aiUnavailableMessage =
        `AI generation is currently disabled. Enable it under Admin â†’ Settings â†’ AI Settings.`;
    } else if (!providerSupported) {
      aiUnavailableMessage =
        `AI is enabled but provider "${aiProviderLabel}" is not yet supported for Activities drafting. ` +
        `OpenAI is the only currently supported provider for this feature.`;
    } else {
      aiUnavailableMessage = 'AI generation is not available right now.';
    }
  }

  const handleAiGenerate = useCallback(async () => {
    if (!aiAvailable) {
      setAiError(aiUnavailableMessage ?? 'AI generation is not available.');
      return;
    }
    const hasBrief = activityBrief.trim().length > 0;
    const hasAnyFile = aiSourceFiles.length > 0;
    if (!hasBrief && !hasAnyFile) {
      setAiError('Please enter an activity brief or attach a reference file.');
      return;
    }

    setAiError(null);
    setAiGenerating(true);
    try {
      const token = sessionManager.getSessionToken();
      if (!token) { setAiError('Session expired. Please sign in again.'); return; }

      const sourceFilesPayload = aiSourceFiles.map((f) => ({
        name: f.name,
        mime: f.mime,
        base64: f.base64,
      }));

      const result = await activitiesService.draftContent(
        token,
        {
          activity_date: startAt || null,
          location: location.trim() || null,
          additional_notes: activityBrief.trim() || null,
        },
        sourceFilesPayload.length > 0 ? sourceFilesPayload : undefined
      );

      if (!result.success || !result.data) {
        setAiError(result.error ?? 'AI drafting failed.');
        return;
      }

      const drafted = result.data;
      setTitle(drafted.title ?? '');
      if (!slugManual) {
        setSlug(slugify(drafted.slug || drafted.title || ''));
      }
      setExcerpt(drafted.excerpt ?? '');
      setDescription(drafted.description ?? '');
      const draftedStart = toDateInput(drafted.start_at ?? null)
        || toDateInputFromDate(drafted.activity_date ?? null);
      const draftedEnd = toDateInput(drafted.end_at ?? null);
      if (draftedStart) setStartAt(draftedStart);
      if (draftedEnd) setEndAt(draftedEnd);
      if (drafted.location) setLocation(drafted.location);
      showToast('success', 'Activity draft generated. Review and edit any field.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI drafting failed.';
      setAiError(message);
    } finally {
      setAiGenerating(false);
    }
  }, [activityBrief, aiAvailable, aiSourceFiles, aiUnavailableMessage, location, showToast, slugManual, startAt]);

  // â”€â”€ AI source-document handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Calls the edge function in extract_fields mode with the given file set and
   * pre-fills any empty guided-input fields. Silent fail on error â€” the user
   * still has the inputs grid to fill manually.
   */
  const handleAiSourceFilesPicked = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;

    setAiError(null);

    const remainingSlots = AI_SOURCE_MAX_FILES - aiSourceFiles.length;
    if (remainingSlots <= 0) {
      setAiError(`At most ${AI_SOURCE_MAX_FILES} source files are allowed.`);
      return;
    }

    const currentTotal = aiSourceFiles.reduce((s, f) => s + f.size, 0);
    let runningTotal = currentTotal;

    const accepted: typeof aiSourceFiles = [];
    for (const file of picked.slice(0, remainingSlots)) {
      const mime = file.type.toLowerCase();
      if (!AI_SOURCE_ACCEPTED_MIMES.includes(mime)) {
        setAiError(`"${file.name}" is not a supported source file. Allowed: JPEG, PNG, PDF.`);
        continue;
      }
      const perFileLimit = mime === 'application/pdf' ? AI_SOURCE_PER_PDF_MAX : AI_SOURCE_PER_IMAGE_MAX;
      const perFileLimitLabel = mime === 'application/pdf' ? '20 MB' : '10 MB';
      if (file.size > perFileLimit) {
        setAiError(`"${file.name}" exceeds the ${perFileLimitLabel} per-file limit.`);
        continue;
      }
      if (runningTotal + file.size > AI_SOURCE_TOTAL_MAX) {
        setAiError('Total source files size would exceed 30 MB.');
        continue;
      }
      try {
        const base64 = await readFileAsBase64Plain(file);
        accepted.push({ name: file.name, mime, size: file.size, base64 });
        runningTotal += file.size;
      } catch {
        setAiError(`Failed to read "${file.name}".`);
      }
    }

    if (accepted.length > 0) {
      const mergedFiles = [...aiSourceFiles, ...accepted];
      setAiSourceFiles(mergedFiles);
    }
  }, [aiSourceFiles]);

  const handleAiSourceFileRemove = useCallback((index: number) => {
    setAiSourceFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const onSlugEditClick = useCallback(() => {
    setSlugEditing(true);
    setSlugManual(true);
  }, []);

  const onSlugResetAuto = useCallback(() => {
    const autoSlug = slugify(title);
    setSlug(autoSlug);
    setSlugManual(false);
    setSlugEditing(false);
  }, [title]);

  const renderSlugIndicator = useCallback(() => {
    if (!slug.trim()) return null;
    return (
      <span className="text-[11px] text-muted-foreground">
        Final URL slug is auto-checked for uniqueness when saved.
      </span>
    );
  }, [slug]);

  // â”€â”€ Auto-slug from title â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    if (!slugManual) {
      setSlug(slugify(title));
    }
  }, [title, slugManual]);

  // â”€â”€ Cover image handling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleCoverFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const validation = validateImageFile(file);
    if (!validation.valid) { showToast('error', validation.error ?? 'Invalid file.'); return; }
    const objectUrl = URL.createObjectURL(file);
    setCoverCropSourceFile(file);
    setCoverCropSrc(objectUrl);
    setShowCoverCrop(true);
  }, [showToast]);

  const handleCoverCropComplete = useCallback((blob: Blob, meta?: { pixelCrop?: { x: number; y: number; width: number; height: number } | null }) => {
    setCoverImageBlob(blob);
    setCoverOriginalFile(coverCropSourceFile);
    setCoverTransform(
      meta?.pixelCrop
        ? {
            trim: {
              left: meta.pixelCrop.x,
              top: meta.pixelCrop.y,
              width: meta.pixelCrop.width,
              height: meta.pixelCrop.height,
            },
          }
        : null
    );
    const preview = URL.createObjectURL(blob);
    setCoverPreview(preview);
    setShowCoverCrop(false);
    if (coverCropSrc) URL.revokeObjectURL(coverCropSrc);
    setCoverCropSrc(null);
    setCoverCropSourceFile(null);
  }, [coverCropSourceFile, coverCropSrc]);

  const handleRemoveCover = useCallback(() => {
    if (coverPreview && coverImageBlob) URL.revokeObjectURL(coverPreview);
    setCoverPreview(null);
    setCoverImageBlob(null);
    setCoverOriginalFile(null);
    setCoverTransform(null);
    setCoverImageUrl(null);
  }, [coverPreview, coverImageBlob]);

  // â”€â”€ Gallery handling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Open the in-modal ratio-aware crop UI for the given file.
  const openCropForFile = useCallback(async (file: File) => {
    try {
      const dataUrl = await readFileAsDataURL(file);
      setGalleryCropSrc(dataUrl);
      setGalleryCropSourceFile(file);
      setShowGalleryCrop(true);
    } catch (err) {
      console.error('[AdminActivityForm] failed to read file for crop:', err);
      showToast('error', 'Failed to load image for cropping.');
    }
  }, [showToast]);

  const handleGalleryFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (picked.length === 0) return;

    const remaining = limits.maxGalleryImages - gallery.filter((g) => !g.pendingDelete).length;
    if (remaining <= 0) {
      showToast('error', `Maximum ${limits.maxGalleryImages} photos allowed.`);
      return;
    }

    // Validate all files first; collect only the valid ones.
    const accepted: File[] = [];
    let firstInvalid: string | null = null;
    for (const file of picked) {
      const validation = validateImageFile(file);
      if (validation.valid) accepted.push(file);
      else if (!firstInvalid) firstInvalid = validation.error ?? 'Invalid file.';
    }
    if (firstInvalid) showToast('error', firstInvalid);
    if (accepted.length === 0) return;

    // Cap to remaining allowance to avoid exceeding the configured limit.
    const toProcess = accepted.slice(0, remaining);
    if (accepted.length > remaining) {
      showToast('error', `Only ${remaining} more photo(s) can be added (limit ${limits.maxGalleryImages}).`);
    }

    // New batch: reset last-picked ratio to Original (the safe default).
    setGalleryLastRatio('original');
    // Queue files and open crop modal for the first.
    setGalleryQueue(toProcess);
    galleryQueueRef.current = toProcess.slice(1);
    await openCropForFile(toProcess[0]);
  }, [gallery, limits.maxGalleryImages, openCropForFile, showToast]);

  const handleGalleryCropComplete = useCallback(async (
    blob: Blob,
    meta?: { pixelCrop?: { x: number; y: number; width: number; height: number } | null }
  ) => {
    // Append the cropped (or compressed-original) blob to the gallery.
    const preview = URL.createObjectURL(blob);
    setGallery((prev) => [...prev, {
      previewUrl: preview,
      blob,
      originalFile: galleryCropSourceFile,
      transform: meta?.pixelCrop
        ? {
            trim: {
              left: meta.pixelCrop.x,
              top: meta.pixelCrop.y,
              width: meta.pixelCrop.width,
              height: meta.pixelCrop.height,
            },
          }
        : null,
    }]);
    setShowGalleryCrop(false);
    setGalleryCropSrc(null);
    setGalleryCropSourceFile(null);

    // Advance the queue using a ref so a modal remount cannot lose the batch.
    const [nextFile, ...remaining] = galleryQueueRef.current;
    galleryQueueRef.current = remaining;
    setGalleryQueue(nextFile ? [nextFile, ...remaining] : []);
    if (nextFile) {
      setTimeout(() => { void openCropForFile(nextFile); }, 0);
    }
  }, [galleryCropSourceFile, openCropForFile]);

  const handleGalleryCropCancel = useCallback(() => {
    setShowGalleryCrop(false);
    setGalleryCropSrc(null);
    setGalleryCropSourceFile(null);
    // Discard the rest of the queue when the user cancels mid-batch.
    galleryQueueRef.current = [];
    setGalleryQueue([]);
  }, []);

  const handleRemoveGalleryItem = useCallback((index: number) => {
    setGallery((prev) => {
      const item = prev[index];
      if (item.mediaId) {
        // Mark for server-side deletion
        return prev.map((g, i) => i === index ? { ...g, pendingDelete: true } : g);
      }
      // Local-only: revoke and remove
      URL.revokeObjectURL(item.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // â”€â”€ YouTube URL helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleYoutubeChange = useCallback((index: number, value: string) => {
    setYoutubeUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }, []);

  const handleAddYoutube = useCallback(() => {
    if (youtubeUrls.length >= limits.maxYoutubeLinks) return;
    setYoutubeUrls((prev) => [...prev, '']);
  }, [limits.maxYoutubeLinks, youtubeUrls.length]);

  const handleRemoveYoutube = useCallback((index: number) => {
    setYoutubeUrls((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // â”€â”€ Drag reorder (gallery) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleDragStart = useCallback((index: number) => {
    setDragFrom(index);
  }, []);

  const handleDrop = useCallback((toIndex: number) => {
    if (dragFrom === null || dragFrom === toIndex) return;
    setGallery((prev) => reorder(prev, dragFrom, toIndex));
    setDragFrom(null);
  }, [dragFrom]);

  // â”€â”€ Save helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const uploadCoverIfNeeded = useCallback(async (
    activityId: string,
    token: string
  ): Promise<ActivityCoverMediaPayload | null | undefined> => {
    // undefined = no change; null = remove; object = uploaded replacement
    if (coverOriginalFile) {
      const result = await activitiesService.uploadMedia(
        token,
        activityId,
        'cover',
        coverOriginalFile,
        coverTransform ?? undefined
      );
      if (!result.success || !result.display_url_seed || !result.original_object_key) {
        throw new Error(result.error || 'Cover image upload failed.');
      }
      return {
        cover_image_url: result.display_url_seed,
        cover_storage_provider: result.storage_provider ?? 'cloudflare_r2',
        cover_original_object_key: result.original_object_key,
        cover_original_filename: result.original_filename ?? coverOriginalFile.name,
        cover_original_mime_type: result.mime_type ?? coverOriginalFile.type,
        cover_original_bytes: result.bytes ?? coverOriginalFile.size,
        cover_original_width: result.width ?? null,
        cover_original_height: result.height ?? null,
      };
    }
    if (coverImageUrl === null) return null; // user removed cover
    return undefined; // unchanged
  }, [coverImageUrl, coverOriginalFile, coverTransform]);

  const buildGalleryCoverFallback = useCallback(async (
    activityId: string,
    token: string
  ): Promise<ActivityCoverMediaPayload | null> => {
    if (coverOriginalFile || coverImageUrl || coverPreview) return null;

    const firstGalleryItem = gallery.find((item) => !item.pendingDelete);
    if (!firstGalleryItem) return null;

    if (firstGalleryItem.originalFile) {
      const upload = await activitiesService.uploadMedia(
        token,
        activityId,
        'cover',
        firstGalleryItem.originalFile,
        firstGalleryItem.transform ?? undefined
      );
      if (!upload.success || !upload.display_url_seed || !upload.original_object_key) {
        throw new Error(upload.error || 'Cover fallback upload failed.');
      }
      return {
        cover_image_url: upload.display_url_seed,
        cover_storage_provider: upload.storage_provider ?? 'cloudflare_r2',
        cover_original_object_key: upload.original_object_key,
        cover_original_filename: upload.original_filename ?? firstGalleryItem.originalFile.name,
        cover_original_mime_type: upload.mime_type ?? firstGalleryItem.originalFile.type,
        cover_original_bytes: upload.bytes ?? firstGalleryItem.originalFile.size,
        cover_original_width: upload.width ?? null,
        cover_original_height: upload.height ?? null,
      };
    }

    const storageUrl = toCoverSeedUrl(firstGalleryItem.storageUrl ?? firstGalleryItem.previewUrl);
    if (!storageUrl) return null;
    return {
      cover_image_url: storageUrl,
      cover_storage_provider: firstGalleryItem.storageProvider ?? null,
      cover_original_object_key: firstGalleryItem.originalObjectKey ?? null,
      cover_original_filename: firstGalleryItem.originalFilename ?? null,
      cover_original_mime_type: null,
      cover_original_bytes: null,
      cover_original_width: null,
      cover_original_height: null,
    };
  }, [coverImageUrl, coverOriginalFile, coverPreview, gallery]);

  const resolveCoverForSave = useCallback(async (
    activityId: string,
    token: string
  ): Promise<ActivityCoverMediaPayload | null | undefined> => {
    const explicitCover = await uploadCoverIfNeeded(activityId, token);
    if (explicitCover && explicitCover !== null) return explicitCover;
    const fallbackCover = await buildGalleryCoverFallback(activityId, token);
    if (fallbackCover) return fallbackCover;
    return explicitCover;
  }, [buildGalleryCoverFallback, uploadCoverIfNeeded]);

  const processGalleryChanges = useCallback(
    async (activityId: string, token: string) => {
      const uploadedMediaIds = new Map<number, string>();

      // Delete removed items
      for (const item of gallery) {
        if (item.pendingDelete && item.mediaId) {
          const result = await activitiesService.removeMedia(token, item.mediaId);
          if (!result.success) {
            throw new Error(result.error || 'Failed to remove gallery image.');
          }
          if (
            item.originalObjectKey &&
            item.storageProvider === 'cloudflare_r2' &&
            item.originalObjectKey !== coverOriginalObjectKey
          ) {
            await activitiesService.deleteOriginalObject(token, activityId, item.originalObjectKey);
          }
        }
      }

      // Upload new items and add to activity
      const activeItems = gallery.filter((g) => !g.pendingDelete);
      for (const [index, item] of activeItems.entries()) {
        if (!item.blob || !item.originalFile) continue; // already persisted
        const upload = await activitiesService.uploadMedia(
          token,
          activityId,
          'gallery',
          item.originalFile,
          item.transform ?? undefined
        );
        if (!upload.success || !upload.display_url_seed || !upload.original_object_key) {
          throw new Error(upload.error || 'Gallery image upload failed.');
        }
        const addResult = await activitiesService.addMedia(token, activityId, {
          storage_url: upload.display_url_seed,
          storage_provider: upload.storage_provider ?? 'cloudflare_r2',
          original_object_key: upload.original_object_key,
          original_filename: upload.original_filename ?? item.originalFile.name,
          mime_type: upload.mime_type ?? item.originalFile.type,
          file_size_bytes: upload.bytes ?? item.originalFile.size,
          width: upload.width ?? null,
          height: upload.height ?? null,
          display_order: index,
        });
        if (!addResult.success) {
          throw new Error(addResult.error || 'Failed to attach gallery image.');
        }
        if (addResult.media_id) {
          uploadedMediaIds.set(index, addResult.media_id);
        }
      }

      const orderedMediaIds = activeItems
        .map((item, index) => item.mediaId ?? uploadedMediaIds.get(index) ?? null)
        .filter((value): value is string => Boolean(value));

      if (orderedMediaIds.length > 0) {
        await activitiesService.reorderMedia(
          token,
          activityId,
          orderedMediaIds
        );
      }
    },
    [coverOriginalObjectKey, gallery]
  );

  const buildYoutubeList = useCallback(
    () => youtubeUrls.map((u) => u.trim()).filter((u) => u.length > 0),
    [youtubeUrls]
  );

  const handleDownloadOriginal = useCallback(async (mediaId?: string | null) => {
    if (!id) return;
    const token = sessionManager.getSessionToken();
    if (!token) {
      showToast('error', 'Session expired.');
      return;
    }
    const result = await activitiesService.getOriginalDownloadUrl(token, {
      activityId: id,
      mediaId: mediaId ?? null,
    });
    if (!result.success || !result.url) {
      showToast('error', result.error ?? 'Original download link failed.');
      return;
    }

    window.open(result.url, '_blank', 'noopener,noreferrer');
  }, [id, showToast]);

  // â”€â”€ Save as Draft â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleSaveDraft = useCallback(async () => {
    if (!title.trim()) { showToast('error', 'Title is required.'); return; }
    if (!slug.trim())  { showToast('error', 'Slug is required.');  return; }

    setIsSaving(true);
    try {
      const token = sessionManager.getSessionToken();
      if (!token) { showToast('error', 'Session expired.'); return; }
      const basePayload = {
        title: title.trim(),
        slug: slug.trim(),
        excerpt: excerpt.trim() || null,
        description: description.trim() || null,
        activity_date: startAt || null,
        start_at: startAt ? toActivityStartAtIso(startAt) : null,
        end_at: endAt ? toActivityEndAtIso(endAt) : null,
        location: location.trim() || null,
        source_event_id: linkedEventId || null,
        is_featured: isFeatured,
        youtube_urls: buildYoutubeList(),
      };

      if (isEdit && id) {
        const previousCoverObjectKey = coverOriginalObjectKey;
        const uploadedCover = await resolveCoverForSave(id, token);
        const clearCover = uploadedCover === null;
        const result = await activitiesService.update(token, id, {
          ...basePayload,
          clear_start_at: !startAt,
          clear_end_at: !endAt,
          clear_source_event: !linkedEventId,
          clear_cover: clearCover,
          ...(uploadedCover ?? {}),
          ...(uploadedCover === undefined && !clearCover ? {
            cover_image_url: coverImageUrl ?? null,
          } : {}),
        });
        if (!result.success) { showToast('error', result.error ?? 'Failed to save.'); return; }
        await processGalleryChanges(id, token);
        if (
          (uploadedCover || clearCover) &&
          previousCoverObjectKey &&
          coverStorageProvider === 'cloudflare_r2' &&
          previousCoverObjectKey !== uploadedCover?.cover_original_object_key
        ) {
          await activitiesService.deleteOriginalObject(token, id, previousCoverObjectKey);
        }
        showToast('success', 'Activity saved.');
        // Reload to sync gallery mediaIds
        navigate(0);
      } else {
        const result = await activitiesService.create(token, {
          ...basePayload,
          cover_image_url: null,
        });
        if (!result.success || !result.activity_id) {
          showToast('error', result.error ?? 'Failed to create activity.');
          return;
        }
        const uploadedCover = await resolveCoverForSave(result.activity_id, token);
        if (uploadedCover) {
          const coverUpdateResult = await activitiesService.update(token, result.activity_id, {
            ...uploadedCover,
          });
          if (!coverUpdateResult.success) {
            showToast('error', coverUpdateResult.error ?? 'Failed to attach cover image.');
            return;
          }
        }
        await processGalleryChanges(result.activity_id, token);
        showToast('success', 'Activity created.');
        navigate(`/admin/content/activities/${result.activity_id}/edit`);
      }
    } catch (err) {
      console.error('[AdminActivityForm] save error:', err);
      showToast('error', 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  }, [
    title, slug, excerpt, description, startAt, endAt, location, linkedEventId, isFeatured,
    coverImageUrl, coverOriginalObjectKey, coverStorageProvider, resolveCoverForSave, buildYoutubeList, isEdit, id,
    processGalleryChanges, navigate, showToast,
  ]);

  // â”€â”€ Publish â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handlePublish = useCallback(async () => {
    if (!isEdit || !id) {
      showToast('error', 'Save the activity as draft first.');
      return;
    }
    setIsSaving(true);
    try {
      const token = sessionManager.getSessionToken();
      if (!token) { showToast('error', 'Session expired.'); return; }
      // Save any pending changes first
      const previousCoverObjectKey = coverOriginalObjectKey;
      const uploadedCover = await resolveCoverForSave(id, token);
      const clearCover = uploadedCover === null;
      const payload = {
        title: title.trim(),
        slug: slug.trim(),
        excerpt: excerpt.trim() || null,
        description: description.trim() || null,
        activity_date: startAt || null,
        start_at: startAt ? toActivityStartAtIso(startAt) : null,
        end_at: endAt ? toActivityEndAtIso(endAt) : null,
        clear_start_at: !startAt,
        clear_end_at: !endAt,
        location: location.trim() || null,
        source_event_id: linkedEventId || null,
        clear_source_event: !linkedEventId,
        is_featured: isFeatured,
        clear_cover: clearCover,
        ...(uploadedCover ?? {}),
        ...(uploadedCover === undefined && !clearCover ? { cover_image_url: coverImageUrl ?? null } : {}),
        youtube_urls: buildYoutubeList(),
      };
      const updateResult = await activitiesService.update(token, id, payload);
      if (!updateResult.success) { showToast('error', updateResult.error ?? 'Failed to save.'); return; }
      await processGalleryChanges(id, token);
      if (
        (uploadedCover || clearCover) &&
        previousCoverObjectKey &&
        coverStorageProvider === 'cloudflare_r2' &&
        previousCoverObjectKey !== uploadedCover?.cover_original_object_key
      ) {
        await activitiesService.deleteOriginalObject(token, id, previousCoverObjectKey);
      }

      const publishResult = await activitiesService.publish(token, id);
      if (!publishResult.success) { showToast('error', publishResult.error ?? 'Failed to publish.'); return; }

      showToast('success', 'Activity published.');
      setOriginalStatus('published');
      navigate(0);
    } catch (err) {
      console.error('[AdminActivityForm] publish error:', err);
      showToast('error', 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  }, [
    isEdit, id, title, slug, excerpt, description, startAt, endAt, location, linkedEventId, isFeatured,
    coverImageUrl, coverOriginalObjectKey, coverStorageProvider, resolveCoverForSave, buildYoutubeList, processGalleryChanges, navigate, showToast,
  ]);

  // â”€â”€ Archive â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleArchive = useCallback(async () => {
    if (!isEdit || !id) return;
    setIsSaving(true);
    try {
      const token = sessionManager.getSessionToken();
      if (!token) { showToast('error', 'Session expired.'); return; }
      const result = await activitiesService.archive(token, id);
      if (!result.success) { showToast('error', result.error ?? 'Failed to archive.'); return; }
      showToast('success', 'Activity archived.');
      navigate('/admin/content/activities');
    } catch {
      showToast('error', 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  }, [isEdit, id, navigate, showToast]);

  // â”€â”€ Delete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const handleDelete = useCallback(async () => {
    if (!isEdit || !id) return;
    if (!window.confirm('Permanently delete this activity? This cannot be undone.')) return;
    setIsSaving(true);
    try {
      const token = sessionManager.getSessionToken();
      if (!token) { showToast('error', 'Session expired.'); return; }
      const result = await activitiesService.delete(token, id);
      if (!result.success) { showToast('error', result.error ?? 'Failed to delete.'); return; }
      navigate('/admin/content/activities');
    } catch {
      showToast('error', 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  }, [isEdit, id, navigate, showToast]);

  // â”€â”€ Render helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // ── Share Activity panel ─────────────────────────────────────────────────────

  // Ensure short URL is created/loaded when editing a published activity with short URL enabled.
  // Runs on mount and whenever enabled/status changes so first-load always shows the code.
  useEffect(() => {
    let active = true;
    if (!isEdit || !id || originalStatus !== 'published' || !shortUrlEnabled) {
      // Only clear code when not in the right state — preserve existing code when toggling off
      if (!isEdit || !id || originalStatus !== 'published') setShortShareCode('');
      return;
    }
    // If we already have a code from hydration, skip the network call
    if (shortShareCode) return;
    const run = async () => {
      setShortShareLoading(true);
      try {
        const token = sessionManager.getSessionToken();
        if (!token) return;
        const result = await activitiesService.ensureShortShareUrl(token, id);
        if (!active) return;
        if (!result.success) {
          // Non-fatal: short URL may not be critical
          console.warn('[AdminActivityForm] Could not ensure short URL:', result.error);
          return;
        }
        setShortShareCode((result.short_code ?? '').trim().toLowerCase());
      } finally {
        if (active) setShortShareLoading(false);
      }
    };
    void run();
    return () => { active = false; };
    // shortShareCode intentionally excluded: we only want to auto-ensure when code is absent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, id, originalStatus, shortUrlEnabled, showToast]);

  const publicActivityUrl = useMemo(() => {
    if (originalStatus !== 'published') return '';
    const s = slug.trim();
    if (!s) return '';
    if (typeof window === 'undefined') return `/events/${s}`;
    return `${window.location.origin}/events/${s}`;
  }, [originalStatus, slug]);

  const persistedShortActivityUrl = useMemo(() => {
    if (originalStatus !== 'published' || !shortShareCode) return '';
    if (typeof window === 'undefined') return `/a/${shortShareCode}`;
    return `${window.location.origin}/a/${shortShareCode}`;
  }, [originalStatus, shortShareCode]);

  const shortActivityUrl = shortUrlEnabled ? persistedShortActivityUrl : '';

  const buildDefaultSharePreview = useCallback((): string => {
    const lines: string[] = [];
    const t = title.trim();
    if (t) lines.push(t);
    const dateParts: string[] = [];
    if (startAt) {
      try { dateParts.push(new Date(startAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })); } catch { /* ignore */ }
    }
    if (endAt) {
      try { dateParts.push(`to ${new Date(endAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`); } catch { /* ignore */ }
    }
    if (dateParts.length > 0) lines.push(dateParts.join(' '));
    if (location.trim()) lines.push(`Venue: ${location.trim()}`);
    const url = shortActivityUrl || publicActivityUrl;
    if (url) { lines.push(''); lines.push(`Details: ${url}`); }
    return lines.join('\n').trim();
  }, [title, startAt, endAt, location, shortActivityUrl, publicActivityUrl]);

  const sharePreview = useMemo(() => {
    if (originalStatus !== 'published') return '';
    const saved = shareMessage.trim();
    if (saved) {
      let next = saved;
      if (publicActivityUrl && persistedShortActivityUrl) {
        next = shortUrlEnabled
          ? next.split(publicActivityUrl).join(persistedShortActivityUrl)
          : next.split(persistedShortActivityUrl).join(publicActivityUrl);
      }
      next = next.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      const url = shortActivityUrl || publicActivityUrl;
      if (url && !next.includes(url)) return `${next}\n\nDetails: ${url}`;
      return next;
    }
    return buildDefaultSharePreview();
  }, [
    originalStatus,
    shareMessage,
    publicActivityUrl,
    persistedShortActivityUrl,
    shortActivityUrl,
    shortUrlEnabled,
    buildDefaultSharePreview,
  ]);

  const handleToggleShortUrl = useCallback(async (enable: boolean) => {
    if (!id) return;
    setShortUrlToggling(true);
    try {
      const token = sessionManager.getSessionToken();
      if (!token) { showToast('error', 'Session expired.'); return; }
      const result = await activitiesService.setShortShareUrlEnabled(token, id, enable);
      if (!result.success) {
        showToast('error', result.error ?? 'Could not update short URL setting.');
        return;
      }
      setShortUrlEnabled(enable);
      if (enable && result.short_code) {
        setShortShareCode(result.short_code.trim().toLowerCase());
      }
      showToast('success', enable ? 'Short URL enabled.' : 'Short URL disabled.');
    } finally {
      setShortUrlToggling(false);
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
    if (!sharePreview) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(sharePreview)}`, '_blank', 'noopener,noreferrer');
  }, [sharePreview]);

  const handleGenerateShareMessage = useCallback(async () => {
    if (originalStatus !== 'published' || !id) return;
    const token = sessionManager.getSessionToken();
    if (!token) { showToast('error', 'Session expired.'); return; }
    setShareGenerating(true);
    try {
      const result = await activitiesService.draftShareMessage(token, {
        title: title.trim(),
        excerpt: excerpt.trim() || null,
        description: description.trim() || null,
        start_at: startAt || null,
        end_at: endAt || null,
        location: location.trim() || null,
        short_url: shortActivityUrl || publicActivityUrl || null,
      });
      if (!result.success) { showToast('error', result.error ?? 'AI share message generation failed.'); return; }
      const msg = (result.message ?? '').trim();
      if (!msg) { showToast('error', 'AI returned an empty message. Try again.'); return; }
      const saveResult = await activitiesService.saveShareMessage(token, id, msg);
      if (!saveResult.success) { showToast('error', saveResult.error ?? 'Message generated but could not be saved.'); return; }
      setShareMessage(saveResult.share_message ?? msg);
      showToast('success', 'Share message generated and saved.');
    } finally {
      setShareGenerating(false);
    }
  }, [originalStatus, id, title, excerpt, description, startAt, endAt, location, shortActivityUrl, publicActivityUrl, showToast]);

  // ── Render helpers ────────────────────────────────────────────────────────────

  const activeGallery = gallery.filter((g) => !g.pendingDelete);
  const galleryFull   = activeGallery.length >= limits.maxGalleryImages;
  const linkedEventExistsInOptions = linkedEventId.length > 0
    ? linkableEvents.some((evt) => evt.id === linkedEventId)
    : false;

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading activityâ€¦
      </div>
    );
  }

  const requiredPermission = isEdit ? 'activities.edit_any' : 'activities.create';

  return (
    <PermissionGate permission={requiredPermission}>
      <div className="max-w-4xl space-y-8">
        {toast && (
          <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
        )}

        <div className="flex items-center gap-3">
          <Link
            to="/admin/content/activities"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Activities
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-xl font-semibold text-foreground">
            {isEdit ? 'Edit Activity' : 'New Activity'}
          </h1>
          {isEdit && (
            <span
              className={cn(
                'ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                originalStatus === 'published'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                  : originalStatus === 'archived'
                  ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
              )}
            >
              {originalStatus.charAt(0).toUpperCase() + originalStatus.slice(1)}
            </span>
          )}
        </div>

        {/* AI Brief */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-base font-semibold text-foreground">Activity Brief</span>
            {aiAvailable ? (
              <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                {aiStatusLabel}
              </span>
            ) : (
              <span className="ml-2 inline-flex items-center rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-medium">
                {aiStatusLabel}
              </span>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            Describe the activity in your own words. AI fills the form; you can edit anything afterwards.
          </p>

          <Textarea
            value={activityBrief}
            onChange={(e) => setActivityBrief(e.target.value.slice(0, AI_BRIEF_MAX_CHARS))}
            placeholder='Describe the activity in your own words. e.g. "MSME workshop held at CITD, Guntur on 17 May 2026. Sessions covered GST compliance, finance support, and export readiness."'
            rows={4}
            disabled={!aiAvailable || aiGenerating}
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={!aiAvailable || aiGenerating || aiSourceFiles.length >= AI_SOURCE_MAX_FILES}
              onClick={() => aiSourceInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-1.5" />
              Attach reference
            </Button>
            <span className="text-xs text-muted-foreground">
              {`Up to ${AI_SOURCE_MAX_FILES} files (JPEG / PNG <= 10 MB, PDF <= 20 MB, total <= 30 MB)`}
            </span>
            <Button
              type="button"
              className="ml-auto"
              onClick={() => void handleAiGenerate()}
              disabled={!aiAvailable || aiGenerating}
            >
              {aiGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate from Brief
                </>
              )}
            </Button>
          </div>

          <input
            ref={aiSourceInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => { void handleAiSourceFilesPicked(e); }}
          />

          <p className="text-[11px] text-muted-foreground">{activityBrief.length} / {AI_BRIEF_MAX_CHARS} characters</p>

          {aiSourceFiles.length > 0 && (
            <ul className="space-y-1.5">
              {aiSourceFiles.map((file, idx) => (
                <li
                  key={`${file.name}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-1.5"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-foreground truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatSourceFileSize(file.size)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAiSourceFileRemove(idx)}
                    disabled={aiGenerating}
                    className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                    title="Remove file"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!aiAvailable && aiUnavailableMessage && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2 text-sm text-amber-800">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{aiUnavailableMessage}</span>
            </div>
          )}

          {aiError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{aiError}</span>
            </div>
          )}
        </div>
        {/* --- Section 1: Core details â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2 text-base font-semibold">
            <FileText className="h-4 w-4 text-primary" />
            Activity Details
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              Title <span className="text-destructive">*</span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Annual Business Meet 2026"
              maxLength={200}
            />
          </div>

          {/* Slug */}
          <div className="space-y-2">
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
                placeholder="activity-slug"
                maxLength={80}
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
              <p className="text-xs text-muted-foreground">Public URL: /events/{slug || 'activity-slug'}</p>
              {renderSlugIndicator()}
            </div>
          </div>

          {/* Excerpt */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              Excerpt
            </label>
            <Textarea
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="Short summary shown on the public Events listing page."
              rows={2}
              maxLength={400}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              Full Description
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description of the activity."
              rows={6}
              maxLength={5000}
            />
          </div>

          {/* Start / End / Location */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                Start date
              </label>
              <Input
                type="date"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                End date
              </label>
              <Input
                type="date"
                value={endAt}
                onChange={(event) => setEndAt(event.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                Location
              </label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Bengaluru"
                maxLength={200}
              />
            </div>
          </div>

          {/* Link to completed event (optional) */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
              Link this activity to a past event (optional)
            </label>
            <select
              value={linkedEventId}
              onChange={(event) => setLinkedEventId(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={linkableEventsLoading}
            >
              <option value="">
                {linkableEventsLoading ? 'Loading events...' : 'Not linked to any event'}
              </option>
              {linkedEventMeta && linkedEventId === linkedEventMeta.id && !linkedEventExistsInOptions && (
                <option value={linkedEventMeta.id}>
                  {linkedEventMeta.title} ({linkedEventMeta.status}) - /{linkedEventMeta.slug}
                </option>
              )}
              {linkableEvents.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.title} ({evt.status}){evt.end_at ? ` - ${new Date(evt.end_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : '' }
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              When linked, completed event pages will show a public link to this activity report.
            </p>
          </div>

          {/* Featured */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
            <Star className={cn('h-4 w-4', isFeatured ? 'text-yellow-500' : 'text-muted-foreground')} />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Feature this activity</p>
              <p className="text-xs text-muted-foreground">Featured activities are highlighted on the public Activities page.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isFeatured}
              onClick={() => setIsFeatured((v) => !v)}
              className={cn(
                'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                isFeatured ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform',
                  isFeatured ? 'translate-x-4' : 'translate-x-0'
                )}
              />
            </button>
          </div>
        </div>

        {/* â”€â”€â”€ Section 2: Media â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-6">
          <div className="flex items-center gap-2 text-base font-semibold">
            <ImageIcon className="h-4 w-4 text-primary" />
            Media
          </div>

          {/* Cover image */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Cover Image</p>
                <p className="text-xs text-muted-foreground">
                  Recommended 16:9, at least 1200x675 px. Original stays private in Cloudflare R2; pages render optimized variants through <span className="font-mono">media.lub.org.in</span>.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isEdit && coverOriginalObjectKey && !coverOriginalFile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { void handleDownloadOriginal(null); }}
                  >
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Download Original
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => coverInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5 mr-1" />
                  {coverPreview ? 'Replace' : 'Upload'}
                </Button>
              </div>
            </div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              className="hidden"
              onChange={handleCoverFileChange}
            />

            {coverPreview ? (
              <div className="relative inline-block">
                <img
                  src={coverPreview}
                  alt="Cover preview"
                  className="rounded-lg object-cover w-full max-w-md aspect-video border border-border"
                />
                <button
                  type="button"
                  onClick={handleRemoveCover}
                  className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 transition-colors"
                  title="Remove cover"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="flex h-40 w-full max-w-md flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
              >
                <ImageIcon className="h-8 w-8 opacity-30" />
                <span className="text-sm">Click to upload cover image</span>
              </button>
            )}
          </div>

          {/* Gallery */}
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Photo Gallery
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    {activeGallery.length} / {limits.maxGalleryImages}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Drag to reorder. Max {limits.maxGalleryImages} photos.
                  Pick a ratio inside the crop tool - Original keeps the native aspect.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={galleryFull}
                onClick={() => galleryInputRef.current?.click()}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Photo(s)
              </Button>
            </div>

            <input
              ref={galleryInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              className="hidden"
              multiple
              onChange={(e) => { void handleGalleryFileChange(e); }}
            />

            {activeGallery.length === 0 ? (
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="flex h-24 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
              >
                <Plus className="h-6 w-6 opacity-30" />
                <span className="text-sm">Add photos to the gallery</span>
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {gallery.map((item, idx) => {
                  if (item.pendingDelete) return null;
                  return (
                    <div
                      key={idx}
                      draggable
                      onDragStart={() => handleDragStart(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDrop(idx)}
                      className="group relative aspect-[4/3] rounded-lg overflow-hidden border border-border cursor-grab active:cursor-grabbing"
                    >
                      <img
                        src={item.previewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(event) => {
                          const img = event.currentTarget;
                          const fallbackFinal = coverPreview ?? null;
                          const current = img.getAttribute('src') ?? '';
                          if (fallbackFinal && current !== fallbackFinal) {
                            img.src = fallbackFinal;
                            return;
                          }
                          img.onerror = null;
                        }}
                      />
                      {/* Drag handle overlay */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-80 transition-opacity">
                        <GripVertical className="h-4 w-4 text-white drop-shadow" />
                      </div>
                      <div className="absolute top-1 right-1 flex items-center gap-1">
                        {isEdit && item.mediaId && item.originalObjectKey && !item.blob && (
                          <button
                            type="button"
                            onClick={() => { void handleDownloadOriginal(item.mediaId); }}
                            className="rounded-full bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                            title="Download original"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveGalleryItem(idx)}
                          className="rounded-full bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                          title="Remove photo"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* YouTube URLs */}
          <div className="space-y-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Youtube className="h-4 w-4 text-red-500" />
                YouTube Videos
                <span className="ml-1 text-xs text-muted-foreground font-normal">
                  (up to {limits.maxYoutubeLinks})
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Paste full YouTube URLs. They will be embedded on the activity detail page.
              </p>
            </div>

            <div className="space-y-2">
              {youtubeUrls.map((url, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={url}
                    onChange={(e) => handleYoutubeChange(idx, e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="font-mono text-sm"
                  />
                  {youtubeUrls.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveYoutube(idx)}
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {youtubeUrls.length < limits.maxYoutubeLinks && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddYoutube}
                  className="text-muted-foreground"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add another URL
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Share Activity panel — published activities only */}
        {isEdit && originalStatus === 'published' && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                <Share2 className="h-4 w-4" />
                Share Activity
              </h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleGenerateShareMessage()}
                disabled={shareGenerating}
              >
                {shareGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                )}
                Generate Share Message with AI
              </Button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Public Activity URL</label>
              <div className="flex gap-2">
                <Input value={publicActivityUrl} readOnly className="font-mono text-xs" />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void copyTextSafely(publicActivityUrl, 'URL copied to clipboard.')}
                  disabled={!publicActivityUrl}
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy URL
                </Button>
                {publicActivityUrl && (
                  <a
                    href={publicActivityUrl}
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
                <label className="text-xs font-medium text-foreground">Short Activity URL (permanent)</label>
                <div className="flex items-center gap-2">
                  {shortUrlToggling ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
                  <span className="text-xs text-muted-foreground">{shortUrlEnabled ? 'Enabled' : 'Disabled'}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={shortUrlEnabled}
                    aria-label="Enable short activity URL"
                    onClick={() => void handleToggleShortUrl(!shortUrlEnabled)}
                    disabled={shortUrlToggling || shortShareLoading || !id}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors',
                      shortUrlEnabled ? 'bg-primary' : 'bg-muted',
                      shortUrlToggling || shortShareLoading || !id ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform',
                        shortUrlEnabled ? 'translate-x-4' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>
              </div>
              {shortUrlEnabled ? (
                <>
                  <div className="flex gap-2">
                    <Input
                      value={shortShareLoading ? 'Generating...' : shortActivityUrl}
                      readOnly
                      className="font-mono text-xs"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void copyTextSafely(shortActivityUrl, 'Short URL copied to clipboard.')}
                      disabled={!shortActivityUrl}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copy Short URL
                    </Button>
                    {shortActivityUrl && (
                      <a
                        href={shortActivityUrl}
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
                    Short URL is permanent and remains stable even if the activity slug changes.
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Short URL is disabled. The existing short code is preserved and can be re-enabled at any time.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Share message preview</label>
              <Textarea
                rows={6}
                value={sharePreview}
                readOnly
                className="font-mono text-[13px] leading-snug whitespace-pre-wrap"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  Uses AI-generated message when saved, or a compact auto-built preview.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void copyTextSafely(sharePreview, 'Share message copied to clipboard.')}
                    disabled={!sharePreview}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Copy Message
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={openWhatsappShare}
                    disabled={!sharePreview}
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

        {/* Footer actions */}
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-lg">
          <div className="flex items-center gap-2">
            {isEdit && canDelete && originalStatus !== 'published' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { void handleDelete(); }}
                disabled={isSaving}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
            {isEdit && canEdit && originalStatus !== 'archived' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { void handleArchive(); }}
                disabled={isSaving}
                className="text-muted-foreground"
              >
                <Archive className="h-4 w-4 mr-1" />
                Archive
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleSaveDraft()}
              disabled={isSaving}
            >
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Draft
            </Button>

            {canPublish && (
              <Button
                type="button"
                onClick={() => void handlePublish()}
                disabled={isSaving || !isEdit}
                title={!isEdit ? 'Save as draft first' : undefined}
              >
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Globe className="h-4 w-4 mr-2" />}
                {originalStatus === 'published' ? 'Update & Publish' : 'Publish'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Cover crop modal */}
      {coverCropSrc && (
        <ImageCropModal
          isOpen={showCoverCrop}
          imageSrc={coverCropSrc}
          onClose={() => {
            setShowCoverCrop(false);
            if (coverCropSrc) URL.revokeObjectURL(coverCropSrc);
            setCoverCropSrc(null);
            setCoverCropSourceFile(null);
          }}
          onCropComplete={handleCoverCropComplete}
          onError={(err) => showToast('error', err)}
          aspect={16 / 9}
          outputWidth={1200}
          outputHeight={675}
          sourceFile={coverCropSourceFile ?? undefined}
          title="Crop Cover Image"
        />
      )}

      {/* Gallery crop modal â€” ratio chooser lives inside the modal now */}
      {galleryCropSrc && (() => {
        const queueSize = galleryQueue.length;
        const queuedSuffix = queueSize > 1 ? ` (${queueSize} remaining)` : '';
        return (
          <ImageCropModal
            isOpen={showGalleryCrop}
            imageSrc={galleryCropSrc}
            onClose={handleGalleryCropCancel}
            onCropComplete={(blob, meta) => { void handleGalleryCropComplete(blob, meta); }}
            onError={(err) => showToast('error', err)}
            ratioOptions={GALLERY_CROP_RATIO_OPTIONS}
            initialRatioValue={galleryLastRatio}
            onRatioChange={(value) => setGalleryLastRatio(value)}
            sourceFile={galleryCropSourceFile ?? undefined}
            title={`Add Gallery Photo${queuedSuffix}`}
          />
        );
      })()}
    </PermissionGate>
  );
};

export default AdminActivityForm;




