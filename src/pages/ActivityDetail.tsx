import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock3,
  ExternalLink,
  Loader2,
  MapPin,
  MessageCircle,
  Play,
  ChevronLeft,
  ChevronRight,
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
}

const Lightbox: React.FC<LightboxProps> = ({ images, startIndex, onClose }) => {
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
  const s = new Date(start);
  const e = end ? new Date(end) : s;
  if (Number.isNaN(s.getTime())) return [];
  const last = Number.isNaN(e.getTime()) ? s : e;
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

  const eventDays = eventDayList(eventDetail.start_at ?? null, eventDetail.end_at ?? null);
  const isMultiday = eventDays.length > 1;

  // RSVP form state
  const [rsvpName, setRsvpName] = useState('');
  const [rsvpEmail, setRsvpEmail] = useState('');
  const [rsvpPhone, setRsvpPhone] = useState('');
  const [rsvpCompany, setRsvpCompany] = useState('');
  const [rsvpGender, setRsvpGender] = useState<EventRsvpGender | ''>('');
  const [rsvpMeal, setRsvpMeal] = useState<EventRsvpMealPreference | ''>('');
  const [rsvpProfession, setRsvpProfession] = useState<EventRsvpProfession | ''>('');
  const [rsvpVisitDate, setRsvpVisitDate] = useState<string>(isMultiday ? '' : eventDays[0] ?? '');
  const [rsvpNotes, setRsvpNotes] = useState('');
  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);
  const [rsvpSuccess, setRsvpSuccess] = useState(false);
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
    if (!rsvpName.trim()) {
      setRsvpError('Please enter your full name.');
      return;
    }
    if (!rsvpEmail.trim() || !/^.+@.+\..+$/.test(rsvpEmail.trim())) {
      setRsvpError('Please enter a valid email address.');
      return;
    }
    if (rsvp?.collect_gender && !rsvpGender) {
      setRsvpError('Please select your gender.');
      return;
    }
    if (rsvp?.collect_meal && !rsvpMeal) {
      setRsvpError('Please select your meal preference.');
      return;
    }
    if (rsvp?.collect_profession && !rsvpProfession) {
      setRsvpError('Please select your profession.');
      return;
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
        fullName: rsvpName.trim(),
        email: rsvpEmail.trim(),
        phone: rsvp?.collect_phone ? rsvpPhone.trim() || null : null,
        company: rsvp?.collect_company ? rsvpCompany.trim() || null : null,
        gender: rsvp?.collect_gender ? (rsvpGender || null) : null,
        mealPreference: rsvp?.collect_meal ? (rsvpMeal || null) : null,
        profession: rsvp?.collect_profession ? (rsvpProfession || null) : null,
        notes: rsvpNotes.trim() || null,
        visitDate: rsvpVisitDate || null,
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
          invalid_phone: 'Please enter a valid phone number.',
          invalid_company: 'Please enter a valid company name.',
          invalid_notes: 'Notes are too long (max 1000 characters).',
          gender_required: 'Please select your gender.',
          invalid_gender: 'Please select a valid gender.',
          meal_required: 'Please select your meal preference.',
          invalid_meal_preference: 'Please select a valid meal preference.',
          profession_required: 'Please select your profession.',
          invalid_profession: 'Please select a valid profession.',
        };
        setRsvpError(messages[result.error_code ?? ''] ?? result.error ?? 'Could not submit your registration.');
        return;
      }
      setRsvpSuccess(true);
      void onRefresh();
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
                  <div className="min-w-0">
                    <a
                      href={asset.public_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-foreground hover:text-primary truncate inline-flex items-center gap-2"
                    >
                      <ExternalLink className="h-4 w-4 shrink-0" />
                      {asset.label || asset.storage_path.split('/').pop()}
                    </a>
                    {asset.byte_size && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {Math.ceil(asset.byte_size / 1024)} KB
                      </p>
                    )}
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
                    <p className="mt-1 text-xs text-green-700 dark:text-green-400">
                      We&rsquo;ll send event details to {rsvpEmail.trim()}.
                    </p>
                  </div>
                </div>
              ) : !rsvpOpen ? (
                <p className="text-sm text-muted-foreground">
                  Registrations are currently closed for this event.
                  {rsvp.deadline_at && (
                    <> Deadline was {new Date(rsvp.deadline_at).toLocaleString('en-IN')}.</>
                  )}
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    {!isPerDayMode && rsvp.capacity != null && (
                      <span>
                        Capacity: <strong className="text-foreground">{rsvp.capacity}</strong>
                        {' · '}
                        Remaining: <strong className="text-foreground">{rsvp.remaining ?? rsvp.capacity - rsvp.used_count}</strong>
                      </span>
                    )}
                    {isPerDayMode && perDayCap != null && (
                      <span>
                        Per-day capacity: <strong className="text-foreground">{perDayCap}</strong>
                        {rsvpVisitDate && (
                          <>
                            {' · '}
                            Remaining for {formatDayLabel(rsvpVisitDate)}:
                            {' '}
                            <strong className="text-foreground">{remainingForDay(rsvpVisitDate) ?? '—'}</strong>
                          </>
                        )}
                      </span>
                    )}
                    {rsvp.deadline_at && (
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
                          {eventDays.map((day) => {
                            const remaining = remainingForDay(day);
                            const full = isPerDayMode && remaining != null && remaining <= 0;
                            return (
                              <option key={day} value={day} disabled={full}>
                                {formatDayLabel(day)}
                                {isPerDayMode && remaining != null
                                  ? full
                                    ? ' — Full'
                                    : ` — ${remaining} seats left`
                                  : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">Full name *</label>
                      <input
                        type="text"
                        value={rsvpName}
                        onChange={(e) => setRsvpName(e.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        disabled={rsvpSubmitting}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">Email *</label>
                      <input
                        type="email"
                        value={rsvpEmail}
                        onChange={(e) => setRsvpEmail(e.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        disabled={rsvpSubmitting}
                      />
                    </div>
                    {rsvp.collect_phone && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-foreground">Phone</label>
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
                        <label className="text-xs font-medium text-foreground">Company</label>
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
                        <label className="text-xs font-medium text-foreground">Gender *</label>
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
                        <label className="text-xs font-medium text-foreground">Meal preference *</label>
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
                        <label className="text-xs font-medium text-foreground">Profession *</label>
                        <select
                          value={rsvpProfession}
                          onChange={(e) => setRsvpProfession(e.target.value as EventRsvpProfession | '')}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          disabled={rsvpSubmitting}
                        >
                          <option value="">Select…</option>
                          {EVENT_RSVP_PROFESSION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="text-xs font-medium text-foreground">Notes (optional)</label>
                      <textarea
                        rows={3}
                        value={rsvpNotes}
                        onChange={(e) => setRsvpNotes(e.target.value.slice(0, 1000))}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        disabled={rsvpSubmitting}
                      />
                    </div>
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
        />
      )}
    </div>
  );
};

export default ActivityDetail;

