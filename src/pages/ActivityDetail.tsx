import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  Clock3,
  FileText,
  Download,
  ExternalLink,
  Loader2,
  MapPin,
  MessageCircle,
  Play,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Upload,
  Users,
  X,
  Tag,
  Globe,
  GlobeLock,
} from 'lucide-react';
import {
  activitiesService,
  eventsService,
  EVENT_RSVP_GENDER_OPTIONS,
  EVENT_RSVP_MEAL_OPTIONS,
  EVENT_RSVP_PROFESSION_OPTIONS,
  type EventRsvpGender,
  type EventRsvpMealPreference,
  type EventRsvpProfession,
  type PublicActivityDetail,
  type PublicEventDetail,
} from '../lib/supabase';
import { buildActivityMediaUrl } from '../lib/activityMedia';
import { sessionManager } from '../lib/sessionManager';
import { normalizeAadhaar, isValidAadhaarLength } from '../lib/aadhaar';

function professionOptionsForEvent(rsvp: PublicEventDetail['rsvp'] | null | undefined) {
  return rsvp?.profession_options?.length ? rsvp.profession_options : EVENT_RSVP_PROFESSION_OPTIONS;
}

function getYoutubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    let videoId: string | null = null;
    if (u.hostname === 'youtu.be') {
      videoId = u.pathname.slice(1);
    } else if (u.hostname.includes('youtube.com')) {
      videoId = u.searchParams.get('v');
    }
    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  } catch {
    return null;
  }
}

interface LightboxProps {
  images: string[];
  startIndex: number;
  onClose: () => void;
  fallbackImageUrl?: string | null;
}

const Lightbox: React.FC<LightboxProps> = ({ images, startIndex, onClose, fallbackImageUrl = null }) => {
  const [current, setCurrent] = useState(startIndex);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft') setCurrent((value) => (value - 1 + images.length) % images.length);
      if (event.key === 'ArrowRight') setCurrent((value) => (value + 1) % images.length);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [images.length, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={onClose}>
      <button
        className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
        onClick={onClose}
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {images.length > 1 && (
        <button
          className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
          onClick={(event) => {
            event.stopPropagation();
            setCurrent((value) => (value - 1 + images.length) % images.length);
          }}
          aria-label="Previous"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      <img
        src={images[current]}
        alt={`Photo ${current + 1}`}
        className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
        onError={(event) => {
          const img = event.currentTarget;
          const currentSrc = img.getAttribute('src') ?? '';
          if (fallbackImageUrl && currentSrc !== fallbackImageUrl) {
            img.src = fallbackImageUrl;
            return;
          }
          img.onerror = null;
        }}
        onClick={(event) => event.stopPropagation()}
      />

      {images.length > 1 && (
        <button
          className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
          onClick={(event) => {
            event.stopPropagation();
            setCurrent((value) => (value + 1) % images.length);
          }}
          aria-label="Next"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {images.length > 1 && (
        <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-white/60">
          {current + 1} / {images.length}
        </p>
      )}
    </div>
  );
};

type ContentType = 'event' | 'activity';

// ─────────────────────────────────────────────────────────────────────────────
// Event view sub-component — lifts RSVP / share state out of the parent so the
// state isn't created when an activity is being shown.
// ─────────────────────────────────────────────────────────────────────────────

interface EventViewProps {
  eventDetail: PublicEventDetail;
  onRefresh: () => Promise<void>;
}

function eventDayList(start: string | null | undefined, end: string | null | undefined): string[] {
  if (!start) return [];
  const startIso = String(start).slice(0, 10);
  const endIso = String(end ?? start).slice(0, 10);
  const parseIsoDay = (iso: string): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const dt = new Date(y, mo, d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  };
  const s = parseIsoDay(startIso);
  const e = parseIsoDay(endIso);
  if (!s) return [];
  const last = e ?? s;
  const days: string[] = [];
  const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const end0 = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  while (cur <= end0) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function formatDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function isDocumentImageAsset(mimeType: string | null | undefined): boolean {
  return (mimeType ?? '').toLowerCase().startsWith('image/');
}

function isDocumentPdfAsset(mimeType: string | null | undefined): boolean {
  return (mimeType ?? '').toLowerCase() === 'application/pdf';
}

function documentDisplayName(asset: { label: string | null; storage_path: string }): string {
  return asset.label || asset.storage_path.split('/').pop() || 'Material';
}

function documentPreviewLabel(asset: { mime_type: string | null; label: string | null; storage_path: string }): string {
  if (isDocumentPdfAsset(asset.mime_type)) return 'PDF';
  const ext = documentDisplayName(asset).split('.').pop();
  if (ext && ext.length <= 6) return ext.toUpperCase();
  const mime = (asset.mime_type ?? '').toLowerCase();
  if (mime.includes('/')) return mime.split('/')[1].toUpperCase();
  return 'FILE';
}

const RSVP_ALL_DAYS_VALUE = '__all_days__';

const EventView: React.FC<EventViewProps> = ({ eventDetail, onRefresh }) => {
  const agendaItems = Array.isArray(eventDetail.agenda_items) ? eventDetail.agenda_items : [];
  const venueMapUrl = (eventDetail.venue_map_url ?? '').trim();
  const whatsappMessage = (eventDetail.whatsapp_invitation_message ?? '').trim();
  const banner = (eventDetail.banner_image_url ?? '').trim();
  const assets = Array.isArray(eventDetail.assets) ? eventDetail.assets : [];
  const flyerImages = assets.filter((a) => a.kind === 'flyer' || a.kind === 'gallery');
  const documents = assets.filter((a) => a.kind === 'document');
  const rsvp = eventDetail.rsvp ?? null;
  const rsvpOpen = Boolean(rsvp?.enabled && rsvp?.open);
  const hideCapacityPublicly = Boolean(rsvp?.hide_capacity_publicly);
  const showCapacityStats = !hideCapacityPublicly;
  const showDeadline = Boolean(rsvp?.deadline_enabled);
  const collectEmail = rsvp?.collect_email !== false;
  const requireEmail = Boolean(rsvp?.require_email);

  const eventDays = eventDayList(eventDetail.start_at ?? null, eventDetail.end_at ?? null);
  const isMultiday = eventDays.length > 1;

  // RSVP form state
  const [rsvpSurname, setRsvpSurname] = useState('');
  const [rsvpGivenName, setRsvpGivenName] = useState('');
  const [rsvpEmail, setRsvpEmail] = useState('');
  const [rsvpPhone, setRsvpPhone] = useState('');
  const [rsvpCompany, setRsvpCompany] = useState('');
  const [rsvpGender, setRsvpGender] = useState<EventRsvpGender | ''>('');
  const [rsvpMeal, setRsvpMeal] = useState<EventRsvpMealPreference | ''>('');
  const [rsvpProfession, setRsvpProfession] = useState<EventRsvpProfession | ''>('');
  const [rsvpDesignation, setRsvpDesignation] = useState('');
  // COD-EVENTS-REGISTRATION-COMPLETE-059
  const [rsvpAadhaar, setRsvpAadhaar] = useState('');
  // COD-EVENTS-AADHAAR-DOC-AUTOFILL-063B — transient Aadhaar scan state
  // 'success' = at least one field was applied
  // 'partial' = had useful data but all form fields were already filled — nothing applied
  // 'error'   = API/network failure, or extraction returned no usable fields
  type AadhaarScanState = 'idle' | 'extracting' | 'success' | 'partial' | 'error';
  const [aadhaarScanState, setAadhaarScanState] = useState<AadhaarScanState>('idle');
  const [aadhaarScanError, setAadhaarScanError] = useState<string | null>(null);
  const aadhaarFileInputRef = useRef<HTMLInputElement>(null);
  const aadhaarCameraInputRef = useRef<HTMLInputElement>(null);
  const [rsvpVisitDate, setRsvpVisitDate] = useState<string>(isMultiday ? '' : eventDays[0] ?? '');
  const [rsvpNotes, setRsvpNotes] = useState('');
  // Approved-member prefill: mobile we hand to BadgeMobileLookup as a default.
  const [prefillMobile, setPrefillMobile] = useState<string>('');
  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);
  const [rsvpSuccess, setRsvpSuccess] = useState(false);
  const [rsvpBadgeCode, setRsvpBadgeCode] = useState<string | null>(null);
  const [rsvpError, setRsvpError] = useState<string | null>(null);

  // Day-wise capacity helpers
  const perDayUsed = rsvp?.per_day_used ?? {};
  const perDayCap = rsvp?.per_day_capacity ?? null;
  const isPerDayMode = rsvp?.capacity_mode === 'per_day';
  const remainingForDay = (day: string): number | null => {
    if (!isPerDayMode || perDayCap == null) return null;
    const used = perDayUsed[day] ?? 0;
    return Math.max(perDayCap - used, 0);
  };
  const registeredForDay = (day: string): number | null => {
    if (!isPerDayMode || perDayCap == null) return null;
    return Math.max(perDayUsed[day] ?? 0, 0);
  };
  const allDaysSelectable =
    !isPerDayMode || eventDays.every((day) => (remainingForDay(day) ?? 1) > 0);

  // COD-EVENTS-REGISTRATION-COMPLETE-059
  // Approved-member prefill. Quietly populate empty fields on mount; never
  // overwrite anything the user has already typed. All fields stay editable.
  useEffect(() => {
    const token = sessionManager.getSessionToken();
    if (!token) return;
    let cancelled = false;
    void eventsService.getRegistrationPrefill(token).then((res) => {
      if (cancelled) return;
      if (!res.success || !res.data || !res.data.approved_member) return;
      const p = res.data;
      setRsvpSurname((cur) => (cur.trim().length === 0 && p.surname ? p.surname : cur));
      setRsvpGivenName((cur) => (cur.trim().length === 0 && p.given_name ? p.given_name : cur));
      setRsvpEmail((cur) => (cur.trim().length === 0 && p.email ? p.email : cur));
      setRsvpPhone((cur) => (cur.trim().length === 0 && p.mobile ? p.mobile : cur));
      setRsvpCompany((cur) => (cur.trim().length === 0 && p.organization ? p.organization : cur));
      if (p.mobile) setPrefillMobile(p.mobile);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // COD-EVENTS-AADHAAR-DOC-AUTOFILL-063B / 064
  // Handles a file chosen via Upload or Camera. Sends the file to the
  // extract-event-aadhaar edge function for transient AI extraction,
  // then fills ONLY empty form fields. The source file is never stored.
  //
  // Three outcome states:
  //   success — at least one field was applied (green message)
  //   partial — had useful fields but none applied (all already filled) (amber message)
  //   error   — API/network failure, or extraction returned no usable fields (red message)
  const handleAadhaarFile = useCallback(async (file: File) => {
    setAadhaarScanState('extracting');
    setAadhaarScanError(null);

    const result = await eventsService.extractEventAadhaar({
      file,
      eventId: eventDetail.id,
    });

    if (!result.success || !result.data) {
      const errorMessages: Record<string, string> = {
        file_too_large: 'File is too large. Please use an image or PDF under 8 MB.',
        unsupported_format: 'Unsupported file type. Use JPEG, PNG, WebP, or PDF.',
        ai_disabled: 'Automatic extraction is not available right now. Please type the number manually.',
        provider_unsupported: 'Automatic extraction is not available right now. Please type the number manually.',
        no_api_key: 'Automatic extraction is not available right now. Please type the number manually.',
        rate_limited: 'Too many attempts. Please wait a minute and try again.',
        extraction_failed: 'Could not extract Aadhaar details. Please type the number manually.',
        invoke_error: 'Could not reach the extraction service. Please try again or type the number manually.',
      };
      setAadhaarScanError(
        errorMessages[result.error_code ?? ''] ??
          'Could not extract details. Please type the number manually.',
      );
      setAadhaarScanState('error');
      return;
    }

    const d = result.data;

    // If extraction returned nothing useful, treat it as a soft error.
    const hasUsefulData = Boolean(d.aadhaar_number || d.surname_guess || d.given_name_guess);
    if (!hasUsefulData) {
      setAadhaarScanError('Could not read useful details from the card. Please type the details manually.');
      setAadhaarScanState('error');
      return;
    }

    // Snapshot current form values to determine what WILL be applied.
    // rsvpAadhaar/rsvpSurname/rsvpGivenName are in deps so this snapshot is current.
    const willApplyAadhaar = Boolean(d.aadhaar_number && normalizeAadhaar(rsvpAadhaar).length === 0);
    const willApplySurname = Boolean(d.surname_guess && rsvpSurname.trim().length === 0);
    const willApplyGivenName = Boolean(d.given_name_guess && rsvpGivenName.trim().length === 0);

    // No-overwrite autofill via setter function form (always reads latest value).
    if (d.aadhaar_number) {
      setRsvpAadhaar((cur) => (normalizeAadhaar(cur).length === 0 ? d.aadhaar_number! : cur));
    }
    if (d.surname_guess) {
      setRsvpSurname((cur) => (cur.trim().length === 0 ? d.surname_guess! : cur));
    }
    if (d.given_name_guess) {
      setRsvpGivenName((cur) => (cur.trim().length === 0 ? d.given_name_guess! : cur));
    }

    if (willApplyAadhaar || willApplySurname || willApplyGivenName) {
      setAadhaarScanState('success');
    } else {
      // Had useful data but all relevant fields were already filled — nothing to apply.
      setAadhaarScanState('partial');
    }
  }, [eventDetail.id, rsvpAadhaar, rsvpSurname, rsvpGivenName]);

  const [whatsappCopied, setWhatsappCopied] = useState(false);

  const onCopyWhatsapp = async () => {
    if (!whatsappMessage) return;
    try {
      await navigator.clipboard.writeText(whatsappMessage);
      setWhatsappCopied(true);
      window.setTimeout(() => setWhatsappCopied(false), 2500);
    } catch {
      // best-effort: leave the textarea selectable below
    }
  };

  const onShareWhatsapp = () => {
    if (!whatsappMessage) return;
    const encoded = encodeURIComponent(whatsappMessage);
    window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer');
  };

  const submitRsvp = async () => {
    setRsvpError(null);
    if (!rsvpSurname.trim()) {
      setRsvpError('Please enter your surname.');
      return;
    }
    if (!rsvpGivenName.trim()) {
      setRsvpError('Please enter your given name.');
      return;
    }
    const nextEmail = rsvpEmail.trim();
    if (collectEmail && requireEmail && !nextEmail) {
      setRsvpError('Please enter your email address.');
      return;
    }
    if (collectEmail && nextEmail && !/^.+@.+\..+$/.test(nextEmail)) {
      setRsvpError('Please enter a valid email address.');
      return;
    }
    if (rsvp?.require_gender && !rsvpGender) {
      setRsvpError('Please select your gender.');
      return;
    }
    if (rsvp?.require_meal && !rsvpMeal) {
      setRsvpError('Please select your meal preference.');
      return;
    }
    if (rsvp?.require_profession && !rsvpProfession) {
      setRsvpError('Please select your profession.');
      return;
    }
    if (rsvp?.require_phone && !rsvpPhone.trim()) {
      setRsvpError('Please enter your mobile number.');
      return;
    }
    if (rsvp?.require_company && !rsvpCompany.trim()) {
      setRsvpError('Please enter your company / organization.');
      return;
    }
    if (rsvp?.collect_note && rsvp?.require_note && !rsvpNotes.trim()) {
      setRsvpError('Please add a note.');
      return;
    }
    if (rsvp?.collect_designation && rsvp?.require_designation && !rsvpDesignation.trim()) {
      setRsvpError('Please enter your designation.');
      return;
    }
    if (rsvp?.collect_aadhaar) {
      const normalized = normalizeAadhaar(rsvpAadhaar);
      if (rsvp.require_aadhaar && normalized.length === 0) {
        setRsvpError('Please enter your Aadhaar Card number.');
        return;
      }
      if (normalized.length > 0 && !isValidAadhaarLength(normalized)) {
        setRsvpError('Please enter a valid 12 digit Aadhaar number.');
        return;
      }
    }
    if (isMultiday && !rsvpVisitDate) {
      setRsvpError('Please choose your day of visit.');
      return;
    }
    setRsvpSubmitting(true);
    try {
      const token = sessionManager.getSessionToken();
      const result = await eventsService.submitRsvp({
        eventSlug: eventDetail.slug,
        fullName: `${rsvpSurname.trim()} ${rsvpGivenName.trim()}`.trim(),
        surname: rsvpSurname.trim() || null,
        givenName: rsvpGivenName.trim() || null,
        email: collectEmail ? (nextEmail || null) : null,
        phone: rsvp?.collect_phone ? rsvpPhone.trim() || null : null,
        company: rsvp?.collect_company ? rsvpCompany.trim() || null : null,
        gender: rsvp?.collect_gender ? (rsvpGender || null) : null,
        mealPreference: rsvp?.collect_meal ? (rsvpMeal || null) : null,
        profession: rsvp?.collect_profession ? (rsvpProfession || null) : null,
        designation: rsvp?.collect_designation ? (rsvpDesignation.trim() || null) : null,
        aadhaar: rsvp?.collect_aadhaar ? (normalizeAadhaar(rsvpAadhaar) || null) : null,
        notes: rsvp?.collect_note ? (rsvpNotes.trim() || null) : null,
        visitDate: rsvpVisitDate && rsvpVisitDate !== RSVP_ALL_DAYS_VALUE ? rsvpVisitDate : null,
        visitAllDays: isMultiday && rsvpVisitDate === RSVP_ALL_DAYS_VALUE,
        sessionToken: token,
      });
      if (!result.success) {
        const messages: Record<string, string> = {
          login_required: 'Please sign in as a member to register for this event.',
          permission_denied: 'This event is open to members only.',
          rsvp_closed: 'Registrations are closed for this event.',
          rsvp_deadline_passed: 'The registration deadline has passed.',
          capacity_full: 'This event is fully booked.',
          capacity_full_for_date: 'No seats remaining for the selected day.',
          visit_date_required: 'Please choose your day of visit.',
          invalid_visit_date: 'Selected day is outside the event window.',
          invalid_full_name: 'Please enter your full name.',
          invalid_email: 'Please enter a valid email address.',
          email_required: 'Please enter your email address.',
          invalid_phone: 'Please enter a valid mobile number.',
          phone_required: 'Please enter your mobile number.',
          invalid_company: 'Please enter a valid company / organization name.',
          company_required: 'Please enter your company / organization.',
          invalid_notes: 'Note is too long (max 1000 characters).',
          note_required: 'Please add a note.',
          gender_required: 'Please select your gender.',
          invalid_gender: 'Please select a valid gender.',
          meal_required: 'Please select your meal preference.',
          invalid_meal_preference: 'Please select a valid meal preference.',
          profession_required: 'Please select your profession.',
          invalid_profession: 'Please select a valid profession.',
          designation_required: 'Please enter your designation.',
          invalid_designation: 'Designation is too long (max 120 characters).',
          aadhaar_required: 'Please enter your Aadhaar Card number.',
          invalid_aadhaar: 'Please enter a valid 12 digit Aadhaar number.',
          duplicate_email: 'A registration already exists with the same email address.',
          duplicate_mobile: 'A registration already exists with the same mobile number.',
          duplicate_aadhaar: 'A registration already exists with the same Aadhaar Card number.',
        };
        setRsvpError(messages[result.error_code ?? ''] ?? result.error ?? 'Could not submit your registration.');
        return;
      }
      const issuedCode = (result.badge_code ?? '').trim().toUpperCase();
      setRsvpBadgeCode(issuedCode || null);
      setRsvpSuccess(true);
      void onRefresh();
      if (issuedCode) {
        const target = `/events/badge/${encodeURIComponent(issuedCode)}`;
        window.open(target, '_blank');
      }
    } finally {
      setRsvpSubmitting(false);
    }
  };

  return (
    <div className="bg-background text-foreground">
      {banner && (
        <div className="w-full bg-muted">
          <img
            src={banner}
            alt={`${eventDetail.title} banner`}
            className="w-full max-h-[440px] object-cover"
          />
        </div>
      )}
      <div className="border-b border-border bg-muted/40">
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
          <Link
            to="/events"
            className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All Events & Activities
          </Link>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <Tag className="h-3 w-3" />
              {eventDetail.event_type}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {eventDetail.visibility === 'member_only' ? (
                <><GlobeLock className="h-3 w-3" /> Member only</>
              ) : (
                <><Globe className="h-3 w-3" /> Public</>
              )}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{eventDetail.title}</h1>
          {eventDetail.excerpt && (
            <p className="mt-3 text-lg text-muted-foreground">{eventDetail.excerpt}</p>
          )}
        </div>
      </div>

      <div className="border-b border-border">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6 lg:px-8 text-sm text-muted-foreground">
          {eventDetail.start_at && (
            <div className="flex items-center gap-1.5">
              <Clock3 className="h-4 w-4 shrink-0" />
              {new Date(eventDetail.start_at).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          )}
          {eventDetail.end_at && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 shrink-0" />
              Ends {new Date(eventDetail.end_at).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          )}
          {eventDetail.location && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 shrink-0" />
              {eventDetail.location}
            </div>
          )}
          {(venueMapUrl || whatsappMessage) && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {venueMapUrl && /^https?:\/\//i.test(venueMapUrl) && (
                <a
                  href={venueMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in Maps
                </a>
              )}
              {whatsappMessage && (
                <>
                  <button
                    type="button"
                    onClick={() => void onCopyWhatsapp()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50"
                  >
                    {whatsappCopied ? (
                      <Check className="h-3.5 w-3.5 text-green-700 dark:text-green-400" />
                    ) : (
                      <MessageCircle className="h-3.5 w-3.5" />
                    )}
                    {whatsappCopied ? 'Copied' : 'Copy WhatsApp invite'}
                  </button>
                  <button
                    type="button"
                    onClick={onShareWhatsapp}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#25D366] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1da851]"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Share on WhatsApp
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 space-y-10">
        {eventDetail.description && (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">About this Event</h2>
            <div className="whitespace-pre-wrap leading-7 text-foreground">{eventDetail.description}</div>
          </section>
        )}

        {eventDetail.invitation_text && (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">Invitation</h2>
            <div className="rounded-lg border border-border bg-muted/30 p-4 whitespace-pre-wrap leading-7 text-foreground">
              {eventDetail.invitation_text}
            </div>
          </section>
        )}

        {agendaItems.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">Agenda</h2>
            <div className="space-y-3">
              {agendaItems.map((item, index) => (
                <div key={`agenda-${index}`} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.time && (
                      <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {item.time}
                      </span>
                    )}
                    <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                  </div>
                  {item.note && (
                    <p className="mt-2 text-sm text-muted-foreground leading-6">{item.note}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Additional images */}
        {flyerImages.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">Images</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {flyerImages.map((asset) => (
                <a
                  key={asset.id}
                  href={asset.public_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative block aspect-[4/3] overflow-hidden rounded-lg bg-muted"
                >
                  <img
                    src={asset.public_url}
                    alt={asset.label ?? ''}
                    className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Documents */}
        {documents.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">Materials</h2>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {documents.map((asset) => (
                <li key={asset.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <a
                      href={`/events/${encodeURIComponent(eventDetail.slug)}/material/${encodeURIComponent(asset.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted/20"
                      title={`Open ${documentDisplayName(asset)}`}
                    >
                      {isDocumentImageAsset(asset.mime_type) ? (
                        <img
                          src={asset.public_url}
                          alt={`${documentDisplayName(asset)} preview`}
                          className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center bg-muted/30 text-muted-foreground">
                          <FileText className="h-5 w-5" />
                          <span className="mt-0.5 text-[9px] font-semibold leading-none text-foreground">
                            {documentPreviewLabel(asset)}
                          </span>
                        </div>
                      )}
                    </a>
                    <div className="min-w-0">
                      <a
                        href={`/events/${encodeURIComponent(eventDetail.slug)}/material/${encodeURIComponent(asset.id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-foreground hover:text-primary truncate inline-flex items-center gap-2"
                      >
                        <ExternalLink className="h-4 w-4 shrink-0" />
                        {documentDisplayName(asset)}
                      </a>
                      {asset.byte_size && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {Math.ceil(asset.byte_size / 1024)} KB
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Registration block */}
        {rsvp?.enabled && (
          <section className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight inline-flex items-center gap-2">
              <Users className="h-5 w-5" />
              Register for Event
            </h2>
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              {rsvpSuccess ? (
                <div className="flex items-start gap-3 rounded-md bg-green-50 dark:bg-green-900/20 p-4">
                  <Check className="h-5 w-5 text-green-700 dark:text-green-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">
                      Thanks for registering — we have you on the list.
                    </p>
                    {collectEmail && rsvpEmail.trim() && (
                      <p className="mt-1 text-xs text-green-700 dark:text-green-400">
                        We&rsquo;ll send event details to {rsvpEmail.trim()}.
                      </p>
                    )}
                    {rsvpBadgeCode && (
                      <div className="mt-3 rounded-md border border-green-200 bg-white/80 p-3 dark:border-green-800 dark:bg-background/40">
                        <p className="text-xs text-green-800 dark:text-green-300">
                          Your badge is ready. Badge No.{' '}
                          <span className="font-mono font-semibold">{rsvpBadgeCode}</span>
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <a
                            href={`/events/badge/${encodeURIComponent(rsvpBadgeCode)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open Badge
                          </a>
                          <a
                            href={`/events/badge/${encodeURIComponent(rsvpBadgeCode)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md border border-green-300 bg-background px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-50 dark:border-green-800 dark:text-green-300 dark:hover:bg-green-900/20"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download Badge
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : !rsvpOpen ? (
                <p className="text-sm text-muted-foreground">
                  Registrations are currently closed for this event.
                  {showDeadline && rsvp.deadline_at && (
                    <> Deadline was {new Date(rsvp.deadline_at).toLocaleString('en-IN')}.</>
                  )}
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {showCapacityStats && !isPerDayMode && rsvp.capacity != null && (
                      <span>
                        Capacity: <strong className="text-foreground">{rsvp.capacity}</strong>
                        {' · '}
                        Remaining: <strong className="text-foreground">{rsvp.remaining ?? rsvp.capacity - rsvp.used_count}</strong>
                      </span>
                    )}
                    {showCapacityStats && isPerDayMode && perDayCap != null && (
                      <div className="space-y-1">
                        Per-day capacity: <strong className="text-foreground">{perDayCap}</strong>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {eventDays.map((day) => (
                            <span key={day}>
                              {formatDayLabel(day)}:
                              {' '}
                              <strong className="text-foreground">
                                {registeredForDay(day) ?? '—'} / {perDayCap}
                              </strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {showDeadline && rsvp.deadline_at && (
                      <span>
                        Deadline: <strong className="text-foreground">{new Date(rsvp.deadline_at).toLocaleString('en-IN')}</strong>
                      </span>
                    )}
                    {rsvp.require_login && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                        <GlobeLock className="h-3 w-3" />
                        Sign-in required
                      </span>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {isMultiday && (
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-xs font-medium text-foreground">Day of visit *</label>
                        <select
                          value={rsvpVisitDate}
                          onChange={(e) => setRsvpVisitDate(e.target.value)}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          disabled={rsvpSubmitting}
                        >
                          <option value="">Select a day…</option>
                          <option value={RSVP_ALL_DAYS_VALUE} disabled={!allDaysSelectable}>
                            {allDaysSelectable
                              ? `${eventDays.length} day${eventDays.length === 1 ? '' : 's'}`
                              : `${eventDays.length} day${eventDays.length === 1 ? '' : 's'} — Full on one or more dates`}
                          </option>
                          <option value="" disabled>
                            OR
                          </option>
                          {eventDays.map((day) => {
                            const remaining = remainingForDay(day);
                            const full = isPerDayMode && remaining != null && remaining <= 0;
                            return (
                              <option key={day} value={day} disabled={full}>
                                {formatDayLabel(day)}
                                {isPerDayMode && remaining != null
                                  ? full
                                    ? (showCapacityStats
                                        ? ` — ${(registeredForDay(day) ?? perDayCap)} / ${perDayCap} registered (Full)`
                                        : ' — Full')
                                    : (showCapacityStats
                                        ? ` — ${(registeredForDay(day) ?? 0)} / ${perDayCap} registered`
                                        : '')
                                  : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    )}
                    {rsvp.collect_aadhaar && (
                      <div className="space-y-2 sm:col-span-2">
                        <label className="text-xs font-medium text-foreground">
                          Aadhaar Card{rsvp.require_aadhaar ? ' *' : ''}
                        </label>
                        {/* Aadhaar number text input */}
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          value={rsvpAadhaar}
                          onChange={(e) => {
                            // Allow user to type spaces freely; cap at 14 chars
                            // (12 digits + 2 spaces). Pure-digit normalization
                            // happens at submit time.
                            const next = e.target.value.replace(/[^0-9 ]/g, '').slice(0, 14);
                            setRsvpAadhaar(next);
                          }}
                          placeholder="12-digit number"
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          disabled={rsvpSubmitting || aadhaarScanState === 'extracting'}
                        />

                        {/* Upload / Camera buttons */}
                        {/* Hidden file inputs — referenced by the buttons below */}
                        <input
                          ref={aadhaarFileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleAadhaarFile(file);
                            // Reset so the same file can be re-selected if needed
                            e.target.value = '';
                          }}
                        />
                        <input
                          ref={aadhaarCameraInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void handleAadhaarFile(file);
                            e.target.value = '';
                          }}
                        />

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => aadhaarFileInputRef.current?.click()}
                            disabled={rsvpSubmitting || aadhaarScanState === 'extracting'}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 disabled:opacity-60 transition-colors"
                          >
                            {aadhaarScanState === 'extracting' ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Upload className="h-3.5 w-3.5" />
                            )}
                            Upload Aadhaar
                          </button>
                          <button
                            type="button"
                            onClick={() => aadhaarCameraInputRef.current?.click()}
                            disabled={rsvpSubmitting || aadhaarScanState === 'extracting'}
                            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 disabled:opacity-60 transition-colors"
                          >
                            {aadhaarScanState === 'extracting' ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Camera className="h-3.5 w-3.5" />
                            )}
                            Take Photo
                          </button>
                          {aadhaarScanState === 'extracting' && (
                            <span className="text-xs text-muted-foreground">
                              Reading card details…
                            </span>
                          )}
                          {aadhaarScanState === 'success' && (
                            <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400 font-medium">
                              <Check className="h-3.5 w-3.5" />
                              Details extracted — please verify before submitting.
                            </span>
                          )}
                          {aadhaarScanState === 'partial' && (
                            <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                              Details read. Your existing entries were not overwritten.
                            </span>
                          )}
                        </div>

                        {aadhaarScanState === 'error' && aadhaarScanError && (
                          <p className="text-xs text-destructive">{aadhaarScanError}</p>
                        )}

                        {/* Privacy notice — shown whenever collect_aadhaar is on */}
                        <p className="flex items-start gap-1 text-[11px] text-muted-foreground leading-relaxed">
                          <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
                          We use the photo only to read these fields. The image is not stored.
                        </p>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">Surname *</label>
                      <input
                        type="text"
                        value={rsvpSurname}
                        onChange={(e) => setRsvpSurname(e.target.value.slice(0, 100))}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        disabled={rsvpSubmitting}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">Given name *</label>
                      <input
                        type="text"
                        value={rsvpGivenName}
                        onChange={(e) => setRsvpGivenName(e.target.value.slice(0, 100))}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        disabled={rsvpSubmitting}
                      />
                    </div>
                    {collectEmail && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">
                          Email {requireEmail ? '*' : ''}
                        </label>
                        <input
                          type="email"
                          value={rsvpEmail}
                          onChange={(e) => setRsvpEmail(e.target.value)}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          disabled={rsvpSubmitting}
                        />
                      </div>
                    )}
                    {rsvp.collect_phone && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">
                          Mobile {rsvp.require_phone ? '*' : ''}
                        </label>
                        <input
                          type="tel"
                          value={rsvpPhone}
                          onChange={(e) => setRsvpPhone(e.target.value)}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          disabled={rsvpSubmitting}
                        />
                      </div>
                    )}
                    {rsvp.collect_company && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">
                          Company / Organization {rsvp.require_company ? '*' : ''}
                        </label>
                        <input
                          type="text"
                          value={rsvpCompany}
                          onChange={(e) => setRsvpCompany(e.target.value)}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          disabled={rsvpSubmitting}
                        />
                      </div>
                    )}
                    {rsvp.collect_gender && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">
                          Gender {rsvp.require_gender ? '*' : ''}
                        </label>
                        <select
                          value={rsvpGender}
                          onChange={(e) => setRsvpGender(e.target.value as EventRsvpGender | '')}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          disabled={rsvpSubmitting}
                        >
                          <option value="">Select…</option>
                          {EVENT_RSVP_GENDER_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {rsvp.collect_meal && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">
                          Meal preference {rsvp.require_meal ? '*' : ''}
                        </label>
                        <select
                          value={rsvpMeal}
                          onChange={(e) => setRsvpMeal(e.target.value as EventRsvpMealPreference | '')}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          disabled={rsvpSubmitting}
                        >
                          <option value="">Select…</option>
                          {EVENT_RSVP_MEAL_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {rsvp.collect_profession && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">
                          Profession {rsvp.require_profession ? '*' : ''}
                        </label>
                        <select
                          value={rsvpProfession}
                          onChange={(e) => setRsvpProfession(e.target.value as EventRsvpProfession | '')}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          disabled={rsvpSubmitting}
                        >
                          <option value="">Select…</option>
                          {professionOptionsForEvent(rsvp).map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {rsvp.collect_designation && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">
                          Designation{rsvp.require_designation ? ' *' : ''}
                        </label>
                        <input
                          type="text"
                          value={rsvpDesignation}
                          onChange={(e) => setRsvpDesignation(e.target.value.slice(0, 120))}
                          placeholder="e.g. Managing Director"
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          disabled={rsvpSubmitting}
                        />
                      </div>
                    )}
                    {rsvp.collect_note && (
                      <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-xs font-medium text-foreground">
                          Note{rsvp.require_note ? ' *' : ''}
                        </label>
                        <textarea
                          rows={3}
                          value={rsvpNotes}
                          onChange={(e) => setRsvpNotes(e.target.value.slice(0, 1000))}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          disabled={rsvpSubmitting}
                        />
                      </div>
                    )}
                  </div>

                  {rsvpError && (
                    <p className="text-sm text-destructive">{rsvpError}</p>
                  )}

                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => void submitRsvp()}
                      disabled={rsvpSubmitting}
                      className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    >
                      {rsvpSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Submit Registration
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {/* Badge mobile lookup (visitor self-serve) */}
        {rsvp?.enabled && (
          <BadgeMobileLookup eventSlug={eventDetail.slug} defaultMobile={prefillMobile} />
        )}

        <div className="pt-4 border-t border-border">
          <Link
            to="/events"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to all events & activities
          </Link>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Public badge lookup — visitor enters mobile/email and gets their badge.
// ─────────────────────────────────────────────────────────────────────────────

const BadgeMobileLookup: React.FC<{ eventSlug: string; defaultMobile?: string }> = ({
  eventSlug,
  defaultMobile,
}) => {
  const [contact, setContact] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  // COD-EVENTS-REGISTRATION-COMPLETE-059
  // Prefill mobile from approved-member profile only when the field is empty.
  useEffect(() => {
    if (!defaultMobile) return;
    setContact((cur) => (cur.trim().length === 0 ? defaultMobile : cur));
  }, [defaultMobile]);
  const [error, setError] = useState<string | null>(null);

  const parseBadgeCodeFromDisposition = (headerValue: string | null): string | null => {
    if (!headerValue) return null;
    const m = /badge-([A-Za-z0-9]+)\.pdf/i.exec(headerValue);
    return m ? m[1].toUpperCase() : null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = contact.trim();
    if (!trimmed) {
      setError('Please enter the mobile number or email you registered with.');
      return;
    }

    const looksLikeEmail = trimmed.includes('@');
    const lookupUrl = looksLikeEmail
      ? eventsService.badgeDownloadUrlByEmail(eventSlug, trimmed.toLowerCase())
      : eventsService.badgeDownloadUrlByMobile(eventSlug, trimmed);

    setIsChecking(true);
    try {
      const response = await fetch(lookupUrl, { headers: { Accept: 'application/pdf' } });
      if (response.status === 404) {
        setError('No registration found with this mobile number or email.');
        return;
      }
      if (response.status === 410) {
        setError('Badge downloads are closed for this event.');
        return;
      }
      if (!response.ok) {
        setError('Could not fetch your badge right now. Please try again.');
        return;
      }

      const codeFromHeader = parseBadgeCodeFromDisposition(response.headers.get('content-disposition'));
      const target = codeFromHeader
        ? `/events/badge/${encodeURIComponent(codeFromHeader)}`
        : `/events/badge?${
          new URLSearchParams(
            looksLikeEmail
              ? { event_slug: eventSlug, email: trimmed.toLowerCase() }
              : { event_slug: eventSlug, mobile: trimmed },
          ).toString()
        }`;

      const win = window.open(target, '_blank');
      if (!win) {
        setError('Popup blocked. Please allow popups for this site and try again.');
        return;
      }
      try {
        win.focus();
      } catch {
        // no-op
      }
    } catch {
      setError('Could not fetch your badge right now. Please try again.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight inline-flex items-center gap-2">
        <Download className="h-5 w-5" />
        Already registered? Get your badge
      </h2>
      <form onSubmit={(e) => void onSubmit(e)} className="rounded-lg border border-border bg-card p-5 space-y-3">
        <p className="text-xs text-muted-foreground">
          Enter the mobile number or email you used to register. We&apos;ll open your badge page in a new tab only when a matching registration is found.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <label className="text-xs font-medium text-foreground">Mobile or Email</label>
            <input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="e.g. 9876543210 or member@example.com"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={isChecking}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isChecking ? 'Checking...' : 'Get my badge'}
          </button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </form>
    </section>
  );
};

const ActivityDetail: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();

  const [contentType, setContentType] = useState<ContentType | null>(null);
  const [eventDetail, setEventDetail] = useState<PublicEventDetail | null>(null);
  const [activityDetail, setActivityDetail] = useState<PublicActivityDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const loadDetail = useCallback(async () => {
    if (!slug) {
      setNotFound(true);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setNotFound(false);

    try {
      const token = sessionManager.getSessionToken();
      const eventData = await eventsService.getBySlug(slug, token);
      if (eventData) {
        setContentType('event');
        setEventDetail(eventData);
        setActivityDetail(null);
        return;
      }

      const activityData = await activitiesService.getBySlug(slug);
      if (activityData) {
        setContentType('activity');
        setActivityDetail(activityData);
        setEventDetail(null);
        return;
      }

      setContentType(null);
      setEventDetail(null);
      setActivityDetail(null);
      setNotFound(true);
    } catch (err) {
      console.error('[ActivityDetail] load error:', err);
      setNotFound(true);
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading details...
      </div>
    );
  }

  if (notFound || !contentType) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-2xl font-semibold text-foreground mb-3">Details not found</h1>
        <p className="text-muted-foreground mb-6">
          This item may have been removed or the link may be incorrect.
        </p>
        <Link
          to="/events"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Events & Activities
        </Link>
      </div>
    );
  }

  if (contentType === 'event' && eventDetail) {
    return <EventView eventDetail={eventDetail} onRefresh={loadDetail} />;
  }

  const activity = activityDetail as PublicActivityDetail;
  const galleryUrls = (activity.media ?? [])
    .sort((a, b) => a.display_order - b.display_order)
    .map((media) => buildActivityMediaUrl(media.storage_url, 'gallery-lightbox') ?? media.storage_url);
  const galleryGridUrls = (activity.media ?? [])
    .sort((a, b) => a.display_order - b.display_order)
    .map((media) => buildActivityMediaUrl(media.storage_url, 'gallery-grid') ?? media.storage_url);
  const coverUrl = buildActivityMediaUrl(activity.cover_image_url, 'cover-hero');

  const validYoutubeEmbeds = (activity.youtube_urls ?? [])
    .map(getYoutubeEmbedUrl)
    .filter((url): url is string => url !== null);

  return (
    <div className="bg-background text-foreground">
      {coverUrl ? (
        <div className="relative h-64 sm:h-80 lg:h-[420px] bg-muted overflow-hidden">
          <img src={coverUrl} alt={activity.title} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-6 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl">
              <Link
                to="/events"
                className="mb-3 inline-flex items-center gap-1 text-sm text-white/70 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                All Events & Activities
              </Link>
              <h1 className="text-2xl font-bold text-white sm:text-3xl lg:text-4xl">{activity.title}</h1>
            </div>
          </div>
        </div>
      ) : (
        <div className="border-b border-border bg-muted/40">
          <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
            <Link
              to="/events"
              className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All Events & Activities
            </Link>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{activity.title}</h1>
          </div>
        </div>
      )}

      <div className="border-b border-border">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6 lg:px-8 text-sm text-muted-foreground">
          {activity.activity_date && (
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 shrink-0" />
              {new Date(activity.activity_date).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </div>
          )}
          {activity.location && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 shrink-0" />
              {activity.location}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 space-y-12">
        {activity.excerpt && (
          <p className="text-lg leading-8 text-muted-foreground">{activity.excerpt}</p>
        )}

        {activity.description && (
          <div className="prose prose-sm sm:prose max-w-none text-foreground leading-7 whitespace-pre-wrap">
            {activity.description}
          </div>
        )}

        {galleryUrls.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Photos</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {galleryGridUrls.map((url, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setLightboxIndex(index)}
                  className="group relative aspect-[4/3] overflow-hidden rounded-lg bg-muted"
                  aria-label={`View photo ${index + 1}`}
                >
                  <img
                    src={url}
                    alt={`Photo ${index + 1}`}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    onError={(event) => {
                      const img = event.currentTarget;
                      const currentSrc = img.getAttribute('src') ?? '';
                      if (coverUrl && currentSrc !== coverUrl) {
                        img.src = coverUrl;
                        return;
                      }
                      img.onerror = null;
                    }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <div className="rounded-full bg-white/0 group-hover:bg-white/20 p-2 transition-colors">
                      <Play className="h-5 w-5 text-white opacity-0 group-hover:opacity-80 transition-opacity" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {validYoutubeEmbeds.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-semibold tracking-tight">Videos</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {validYoutubeEmbeds.map((embedUrl, index) => (
                <div key={index} className="aspect-video overflow-hidden rounded-lg border border-border bg-muted">
                  <iframe
                    src={embedUrl}
                    title={`Video ${index + 1}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="pt-4 border-t border-border">
          <Link
            to="/events"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to all events & activities
          </Link>
        </div>
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          images={galleryUrls}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          fallbackImageUrl={coverUrl}
        />
      )}
    </div>
  );
};

export default ActivityDetail;
