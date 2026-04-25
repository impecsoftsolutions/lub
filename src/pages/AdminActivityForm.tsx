import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  ChevronDown,
  ChevronUp,
  Wand2,
  Check,
  AlertCircle,
  Download,
} from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import {
  activitiesService,
  aiSettingsService,
  ACTIVITY_AI_SUPPORTED_PROVIDERS,
  type ActivityLimits,
  type ActivityCoverMediaPayload,
  type ActivityMediaItem,
  type ActivityMediaStorageProvider,
  type AIRuntimeProfile,
  type AIProvider,
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

// ─── Constants ────────────────────────────────────────────────

// ─── Slug helper ──────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

// ─── Drag-reorder helpers ─────────────────────────────────────

function reorder<T>(list: T[], from: number, to: number): T[] {
  const result = [...list];
  const [moved] = result.splice(from, 1);
  result.splice(to, 0, moved);
  return result;
}

// ─── Types ────────────────────────────────────────────────────

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

// AI source-document upload limits — module-level so they don't trigger
// react-hooks/exhaustive-deps warnings inside callbacks.
const AI_SOURCE_MAX_FILES = 3;
const AI_SOURCE_PER_IMAGE_MAX = 10 * 1024 * 1024;  // 10 MB per image (JPEG/PNG)
const AI_SOURCE_PER_PDF_MAX = 20 * 1024 * 1024;    // 20 MB per PDF
const AI_SOURCE_TOTAL_MAX = 30 * 1024 * 1024;      // 30 MB cumulative
const AI_SOURCE_ACCEPTED_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

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

const uniqueNonEmpty = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
};

const normalizeDateCandidate = (value: string | null | undefined): string | null => {
  const raw = value?.trim();
  if (!raw) return null;
  const iso = raw.match(/\b(19\d{2}|20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const dmy = raw.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](19\d{2}|20\d{2})\b/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
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

// Ratio choices for the in-modal gallery crop selector. `aspect: null` means
// "Original — keep native ratio, no crop, just resize+compress".
const GALLERY_CROP_RATIO_OPTIONS = [
  { value: 'original', label: 'Original', aspect: null as number | null,           outputWidth: undefined, outputHeight: undefined },
  { value: '16:9',     label: '16:9',     aspect: 16 / 9 as number | null,         outputWidth: 1600,      outputHeight: 900 },
  { value: '4:3',      label: '4:3',      aspect: 4 / 3 as number | null,          outputWidth: 1600,      outputHeight: 1200 },
  { value: '1:1',      label: '1:1',      aspect: 1 as number | null,              outputWidth: 1200,      outputHeight: 1200 },
  { value: '3:4',      label: '3:4',      aspect: 3 / 4 as number | null,          outputWidth: 1200,      outputHeight: 1600 },
  { value: '9:16',     label: '9:16',     aspect: 9 / 16 as number | null,         outputWidth: 900,       outputHeight: 1600 },
];

// ─── Component ────────────────────────────────────────────────

const AdminActivityForm: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const canPublish = useHasPermission('activities.publish');
  const canEdit    = useHasPermission('activities.edit_any');
  const canDelete  = useHasPermission('activities.delete');

  // ── Form state ────────────────────────────────────────────

  const [title, setTitle]           = useState('');
  const [slug, setSlug]             = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [excerpt, setExcerpt]       = useState('');
  const [description, setDescription] = useState('');
  const [activityDate, setActivityDate] = useState('');
  const [location, setLocation]     = useState('');
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
  // Last ratio chosen during the current batch — used as the default for the
  // next file in the same batch so admins don't have to re-pick every time.
  // Reset to 'original' when a fresh batch is opened.
  const [galleryLastRatio, setGalleryLastRatio] = useState<string>('original');
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // UI state
  const [isLoading, setIsLoading]   = useState(isEdit);
  const [isSaving, setIsSaving]     = useState(false);
  const [originalStatus, setOriginalStatus] = useState<string>('draft');
  const [limits, setLimits] = useState<ActivityLimits>(activitiesService.defaultLimits);

  // AI assist state
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiInputs, setAiInputs] = useState({
    activity_date: '',
    location: '',
    participants: '',
    purpose: '',
    host: '',
    highlights: '',
    outcome: '',
    additional_notes: '',
  });
  const [aiExtractionChoices, setAiExtractionChoices] = useState<{
    activityDateOptions: string[];
    locationOptions: string[];
  }>({ activityDateOptions: [], locationOptions: [] });
  const [aiRuntimeProfile, setAiRuntimeProfile] = useState<AIRuntimeProfile | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<{
    title: string;
    slug: string;
    excerpt: string;
    description: string;
  } | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // AI source documents (optional — sent to edge function for richer drafts)
  const [aiSourceFiles, setAiSourceFiles] = useState<Array<{
    name: string;
    mime: string;
    size: number;
    base64: string;
  }>>([]);
  // True while the extract_fields edge function call is in-flight after upload.
  const [aiExtracting, setAiExtracting] = useState(false);
  const aiSourceInputRef = useRef<HTMLInputElement>(null);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4500);
  }, []);

  // Drag state (simple index-based)
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  // ── Load existing activity ────────────────────────────────

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
        setSlugManual(true); // don't auto-generate when editing
        setExcerpt(data.excerpt ?? '');
        setDescription(data.description ?? '');
        setActivityDate(data.activity_date ?? '');
        setLocation(data.location ?? '');
        setIsFeatured(data.is_featured);
        setYoutubeUrls(data.youtube_urls?.length ? data.youtube_urls : ['']);
        setCoverImageUrl(data.cover_image_url);
        setCoverPreview(buildActivityMediaUrl(data.cover_image_url, 'cover-admin'));
        setCoverStorageProvider(data.cover_storage_provider ?? null);
        setCoverOriginalObjectKey(data.cover_original_object_key ?? null);
        setCoverOriginalFile(null);
        setCoverTransform(null);
        setOriginalStatus(data.status);

        setGallery(
          (data.media ?? [])
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
            }))
        );
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

  // ── Load AI runtime profile (no key, just provider/model/is_enabled) ─────

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

  // ── Pre-seed AI inputs from form values when panel opens ──────────────────

  useEffect(() => {
    if (!aiPanelOpen) return;
    setAiInputs((prev) => ({
      ...prev,
      // Only adopt if the user hasn't typed anything yet in the AI inputs
      activity_date: prev.activity_date || activityDate,
      location: prev.location || location,
    }));
  }, [aiPanelOpen, activityDate, location]);

  // ── AI generation ─────────────────────────────────────────

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

  // Status chip text — explicit rather than generic "Unavailable".
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
        'AI generation is not configured. Configure provider, model, and API key under Admin → Settings → AI Settings.';
    } else if (!isEnabled) {
      aiUnavailableMessage =
        `AI generation is currently disabled. Enable it under Admin → Settings → AI Settings.`;
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
    const hasAnyInput = Object.values(aiInputs).some((v) => v.trim().length > 0);
    const hasAnyFile = aiSourceFiles.length > 0;
    if (!hasAnyInput && !hasAnyFile) {
      setAiError('Please fill in at least one input field or attach a source document to guide the draft.');
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
          activity_date: aiInputs.activity_date.trim() || null,
          location: aiInputs.location.trim() || null,
          participants: aiInputs.participants.trim() || null,
          purpose: aiInputs.purpose.trim() || null,
          host: aiInputs.host.trim() || null,
          highlights: aiInputs.highlights.trim() || null,
          outcome: aiInputs.outcome.trim() || null,
          additional_notes: aiInputs.additional_notes.trim() || null,
        },
        sourceFilesPayload.length > 0 ? sourceFilesPayload : undefined
      );

      if (!result.success || !result.data) {
        setAiError(result.error ?? 'AI drafting failed.');
        setAiSuggestion(null);
        return;
      }
      setAiSuggestion(result.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI drafting failed.';
      setAiError(message);
      setAiSuggestion(null);
    } finally {
      setAiGenerating(false);
    }
  }, [aiAvailable, aiUnavailableMessage, aiInputs, aiSourceFiles]);

  const handleAiApplyTitle = useCallback(() => {
    if (!aiSuggestion) return;
    setTitle(aiSuggestion.title);
    if (!slugManual) {
      setSlug(slugify(aiSuggestion.title));
    }
  }, [aiSuggestion, slugManual]);

  const handleAiApplySlug = useCallback(() => {
    if (!aiSuggestion) return;
    // Always re-pass through client slugify to enforce /activities/:slug compatibility.
    setSlug(slugify(aiSuggestion.slug || aiSuggestion.title));
    setSlugManual(true);
  }, [aiSuggestion]);

  const handleAiApplyExcerpt = useCallback(() => {
    if (!aiSuggestion) return;
    setExcerpt(aiSuggestion.excerpt);
  }, [aiSuggestion]);

  const handleAiApplyDescription = useCallback(() => {
    if (!aiSuggestion) return;
    setDescription(aiSuggestion.description);
  }, [aiSuggestion]);

  const handleAiApplyAll = useCallback(() => {
    if (!aiSuggestion) return;
    setTitle(aiSuggestion.title);
    setSlug(slugify(aiSuggestion.slug || aiSuggestion.title));
    setSlugManual(true);
    setExcerpt(aiSuggestion.excerpt);
    setDescription(aiSuggestion.description);
  }, [aiSuggestion]);

  // ── AI source-document handlers ─────────────────────────────

  /**
   * Calls the edge function in extract_fields mode with the given file set and
   * pre-fills any empty guided-input fields. Silent fail on error — the user
   * still has the inputs grid to fill manually.
   */
  const runExtraction = useCallback(async (files: typeof aiSourceFiles) => {
    if (!aiAvailable || files.length === 0) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;

    setAiExtracting(true);
    try {
      const result = await activitiesService.extractFields(
        token,
        files.map((f) => ({ name: f.name, mime: f.mime, base64: f.base64 }))
      );
      if (result.success && result.fields) {
        const f = result.fields;
        const detectedDates = uniqueNonEmpty([
          f.activity_date,
          ...(f.activity_date_options ?? []),
        ])
          .map((value) => normalizeDateCandidate(value))
          .filter((value): value is string => Boolean(value));
        const detectedLocations = uniqueNonEmpty([
          f.location,
          ...(f.location_options ?? []),
        ]);
        const firstDetectedDate = detectedDates[0] ?? normalizeDateCandidate(f.activity_date);
        const firstDetectedLocation = detectedLocations[0] ?? f.location?.trim() ?? '';

        setAiExtractionChoices({
          activityDateOptions: detectedDates,
          locationOptions: detectedLocations,
        });

        if (!activityDate && firstDetectedDate) {
          setActivityDate(firstDetectedDate);
        }
        if (!location.trim() && firstDetectedLocation) {
          setLocation(firstDetectedLocation);
        }

        // Only fill fields that are still empty - never clobber typed values.
        setAiInputs((prev) => ({
          activity_date:    prev.activity_date    || firstDetectedDate  || f.activity_date || prev.activity_date,
          location:         prev.location         || firstDetectedLocation || f.location || prev.location,
          participants:     prev.participants      || f.participants     || prev.participants,
          host:             prev.host              || f.host             || prev.host,
          purpose:          prev.purpose           || f.purpose          || prev.purpose,
          highlights:       prev.highlights        || f.highlights       || prev.highlights,
          outcome:          prev.outcome           || f.outcome          || prev.outcome,
          additional_notes: prev.additional_notes  || f.additional_notes || prev.additional_notes,
        }));
      }
    } catch {
      // Silent: extraction is a best-effort prefill; failures are not surfaced.
    } finally {
      setAiExtracting(false);
    }
  }, [activityDate, aiAvailable, location]);

  const handleSelectExtractedDate = useCallback((value: string) => {
    setAiInputs((prev) => ({ ...prev, activity_date: value }));
    setActivityDate(value);
  }, []);

  const handleSelectExtractedLocation = useCallback((value: string) => {
    setAiInputs((prev) => ({ ...prev, location: value }));
    setLocation(value);
  }, []);

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

  // ── Auto-slug from title ─────────────────────────────────

  useEffect(() => {
    if (!slugManual) {
      setSlug(slugify(title));
    }
  }, [title, slugManual]);

  // ── Cover image handling ─────────────────────────────────

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

  // ── Gallery handling ─────────────────────────────────────

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

  // ── YouTube URL helpers ──────────────────────────────────

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

  // ── Drag reorder (gallery) ────────────────────────────────

  const handleDragStart = useCallback((index: number) => {
    setDragFrom(index);
  }, []);

  const handleDrop = useCallback((toIndex: number) => {
    if (dragFrom === null || dragFrom === toIndex) return;
    setGallery((prev) => reorder(prev, dragFrom, toIndex));
    setDragFrom(null);
  }, [dragFrom]);

  // ── Save helpers ─────────────────────────────────────────

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

  // ── Save as Draft ─────────────────────────────────────────

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
        activity_date: activityDate || null,
        location: location.trim() || null,
        is_featured: isFeatured,
        youtube_urls: buildYoutubeList(),
      };

      if (isEdit && id) {
        const previousCoverObjectKey = coverOriginalObjectKey;
        const uploadedCover = await resolveCoverForSave(id, token);
        const clearCover = uploadedCover === null;
        const result = await activitiesService.update(token, id, {
          ...basePayload,
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
    title, slug, excerpt, description, activityDate, location, isFeatured,
    coverImageUrl, coverOriginalObjectKey, coverStorageProvider, resolveCoverForSave, buildYoutubeList, isEdit, id,
    processGalleryChanges, navigate, showToast,
  ]);

  // ── Publish ────────────────────────────────────────────────

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
        activity_date: activityDate || null,
        location: location.trim() || null,
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
    isEdit, id, title, slug, excerpt, description, activityDate, location, isFeatured,
    coverImageUrl, coverOriginalObjectKey, coverStorageProvider, resolveCoverForSave, buildYoutubeList, processGalleryChanges, navigate, showToast,
  ]);

  // ── Archive ────────────────────────────────────────────────

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

  // ── Delete ─────────────────────────────────────────────────

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

  // ── Render helpers ────────────────────────────────────────

  const activeGallery = gallery.filter((g) => !g.pendingDelete);
  const galleryFull   = activeGallery.length >= limits.maxGalleryImages;

  // ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading activity…
      </div>
    );
  }

  const requiredPermission = isEdit ? 'activities.edit_any' : 'activities.create';

  return (
    <PermissionGate permission={requiredPermission}>
      <div className="max-w-4xl space-y-8">
        {/* Toast */}
        {toast && (
          <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
        )}

        {/* Back + title */}
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

        {/* ─── AI Assist Panel ─────────────────────────────── */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setAiPanelOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-6 py-4 hover:bg-muted/30 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-base font-semibold text-foreground">Generate with AI</span>
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
            {aiPanelOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {aiPanelOpen && (
            <div className="border-t border-border p-6 space-y-5">
              <p className="text-xs text-muted-foreground">
                Upload event documents, click <strong>Extract Content</strong> to prefill the fields below, then review and adjust before clicking Generate. You can also fill the fields manually and apply suggestions individually or all at once.
              </p>

              {!aiAvailable && aiUnavailableMessage && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/40 px-3 py-2 flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{aiUnavailableMessage}</span>
                </div>
              )}

              {/* Source documents — placed at top so the upload-first workflow is obvious */}
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-medium text-foreground">Source documents (optional)</p>
                    <p className="text-xs text-muted-foreground">
                      Attach up to {AI_SOURCE_MAX_FILES} files (JPEG / PNG / PDF — images ≤ 10 MB, PDFs ≤ 20 MB, total ≤ 30 MB).
                      Use Extract Content to prefill the guided fields; documents are also sent as source material when generating the draft.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!aiAvailable || aiGenerating || aiExtracting || aiSourceFiles.length >= AI_SOURCE_MAX_FILES}
                    onClick={() => aiSourceInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1" />
                    Add file
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
                {aiSourceFiles.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No source documents attached.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {aiSourceFiles.map((file, idx) => (
                      <li
                        key={`${file.name}-${idx}`}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-background px-2.5 py-1.5"
                      >
                        <div className="min-w-0 flex-1 flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-xs text-foreground truncate">{file.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatSourceFileSize(file.size)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAiSourceFileRemove(idx)}
                          disabled={aiGenerating || aiExtracting}
                          className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                          title="Remove file"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Explicit extraction step */}
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={aiSourceFiles.length === 0 || !aiAvailable || aiExtracting || aiGenerating}
                  onClick={() => void runExtraction(aiSourceFiles)}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Extract Content
                </Button>
                {aiExtracting && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Extracting fields from documents…
                  </span>
                )}
              </div>

              {/* Inputs grid */}
              <div className={cn('grid gap-4 sm:grid-cols-2', aiExtracting && 'opacity-60 pointer-events-none')}>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground">Activity date</label>
                  <Input
                    type="date"
                    value={aiInputs.activity_date}
                    onChange={(e) => setAiInputs((prev) => ({ ...prev, activity_date: e.target.value }))}
                    disabled={!aiAvailable || aiGenerating || aiExtracting}
                  />
                  {aiExtractionChoices.activityDateOptions.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {aiExtractionChoices.activityDateOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => handleSelectExtractedDate(option)}
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                            aiInputs.activity_date === option
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-background text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground">Location</label>
                  <Input
                    value={aiInputs.location}
                    onChange={(e) => setAiInputs((prev) => ({ ...prev, location: e.target.value }))}
                    placeholder="e.g. Bengaluru"
                    disabled={!aiAvailable || aiGenerating || aiExtracting}
                  />
                  {aiExtractionChoices.locationOptions.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {aiExtractionChoices.locationOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => handleSelectExtractedLocation(option)}
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                            aiInputs.location === option
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-background text-muted-foreground hover:text-foreground'
                          )}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground">Participants / participant groups</label>
                  <Textarea
                    value={aiInputs.participants}
                    onChange={(e) => setAiInputs((prev) => ({ ...prev, participants: e.target.value }))}
                    placeholder="e.g. 45 MSME owners from textiles & engineering sectors; LUB executive committee"
                    rows={2}
                    disabled={!aiAvailable || aiGenerating || aiExtracting}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground">Purpose of the activity</label>
                  <Textarea
                    value={aiInputs.purpose}
                    onChange={(e) => setAiInputs((prev) => ({ ...prev, purpose: e.target.value }))}
                    placeholder="What was the activity meant to achieve?"
                    rows={2}
                    disabled={!aiAvailable || aiGenerating || aiExtracting}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground">Host / organizer</label>
                  <Input
                    value={aiInputs.host}
                    onChange={(e) => setAiInputs((prev) => ({ ...prev, host: e.target.value }))}
                    placeholder="e.g. LUB Karnataka Chapter"
                    disabled={!aiAvailable || aiGenerating || aiExtracting}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-muted-foreground">Outcome / takeaway</label>
                  <Input
                    value={aiInputs.outcome}
                    onChange={(e) => setAiInputs((prev) => ({ ...prev, outcome: e.target.value }))}
                    placeholder="One-line summary of what was achieved"
                    disabled={!aiAvailable || aiGenerating || aiExtracting}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground">Highlights</label>
                  <Textarea
                    value={aiInputs.highlights}
                    onChange={(e) => setAiInputs((prev) => ({ ...prev, highlights: e.target.value }))}
                    placeholder="Key moments, notable speakers, panels, sessions, etc."
                    rows={3}
                    disabled={!aiAvailable || aiGenerating || aiExtracting}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground">Additional notes</label>
                  <Textarea
                    value={aiInputs.additional_notes}
                    onChange={(e) => setAiInputs((prev) => ({ ...prev, additional_notes: e.target.value }))}
                    placeholder="Anything else worth mentioning."
                    rows={2}
                    disabled={!aiAvailable || aiGenerating || aiExtracting}
                  />
                </div>
              </div>

              {aiError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{aiError}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={() => void handleAiGenerate()}
                  disabled={!aiAvailable || aiGenerating || aiExtracting}
                >
                  {aiGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4 mr-2" />
                      {aiSuggestion ? 'Regenerate' : 'Generate Draft'}
                    </>
                  )}
                </Button>
                {aiSuggestion && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleAiApplyAll}
                    disabled={aiGenerating || aiExtracting}
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Apply All
                  </Button>
                )}
              </div>

              {aiSuggestion && (
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Suggestion</p>

                  {/* Title */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Title</span>
                      <Button type="button" size="sm" variant="ghost" onClick={handleAiApplyTitle}>
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Apply
                      </Button>
                    </div>
                    <p className="text-sm font-medium text-foreground bg-background border border-border rounded-md px-3 py-2">
                      {aiSuggestion.title || <span className="text-muted-foreground italic">No title generated</span>}
                    </p>
                  </div>

                  {/* Slug */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Slug</span>
                      <Button type="button" size="sm" variant="ghost" onClick={handleAiApplySlug}>
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Apply
                      </Button>
                    </div>
                    <p className="text-sm font-mono text-foreground bg-background border border-border rounded-md px-3 py-2 break-all">
                      {slugify(aiSuggestion.slug || aiSuggestion.title) || <span className="text-muted-foreground italic">No slug generated</span>}
                    </p>
                  </div>

                  {/* Excerpt */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Excerpt</span>
                      <Button type="button" size="sm" variant="ghost" onClick={handleAiApplyExcerpt}>
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Apply
                      </Button>
                    </div>
                    <p className="text-sm text-foreground bg-background border border-border rounded-md px-3 py-2 whitespace-pre-wrap">
                      {aiSuggestion.excerpt || <span className="text-muted-foreground italic">No excerpt generated</span>}
                    </p>
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Description</span>
                      <Button type="button" size="sm" variant="ghost" onClick={handleAiApplyDescription}>
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Apply
                      </Button>
                    </div>
                    <p className="text-sm text-foreground bg-background border border-border rounded-md px-3 py-2 whitespace-pre-wrap max-h-64 overflow-auto">
                      {aiSuggestion.description || <span className="text-muted-foreground italic">No description generated</span>}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Section 1: Core details ─────────────────────── */}
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
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-foreground">
              URL Slug <span className="text-destructive">*</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">/events/</span>
              <Input
                value={slug}
                onChange={(e) => {
                  setSlugManual(true);
                  setSlug(slugify(e.target.value));
                }}
                placeholder="annual-business-meet-2026"
                className="font-mono text-sm"
                maxLength={80}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Auto-generated from title and made unique when saved. Changing a published slug only breaks old direct links; the event remains visible on the public Events page.
            </p>
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

          {/* Date + Location side by side */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                Activity Date
              </label>
              <Input
                type="date"
                value={activityDate}
                onChange={(e) => setActivityDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
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

        {/* ─── Section 2: Media ────────────────────────────── */}
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
                  Pick a ratio inside the crop tool — Original keeps the native aspect.
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

        {/* ─── Footer actions ──────────────────────────────── */}
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

      {/* Gallery crop modal — ratio chooser lives inside the modal now */}
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



