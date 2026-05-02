import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  Clock3,
  Loader2,
  MapPin,
  Play,
  ChevronLeft,
  ChevronRight,
  X,
  Tag,
  Globe,
  GlobeLock,
} from 'lucide-react';
import {
  activitiesService,
  eventsService,
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

const ActivityDetail: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();

  const [contentType, setContentType] = useState<ContentType | null>(null);
  const [eventDetail, setEventDetail] = useState<PublicEventDetail | null>(null);
  const [activityDetail, setActivityDetail] = useState<PublicActivityDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!slug) {
      setNotFound(true);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setNotFound(false);
      setContentType(null);
      setEventDetail(null);
      setActivityDetail(null);

      try {
        const token = sessionManager.getSessionToken();
        const eventData = await eventsService.getBySlug(slug, token);
        if (cancelled) return;
        if (eventData) {
          setContentType('event');
          setEventDetail(eventData);
          return;
        }

        const activityData = await activitiesService.getBySlug(slug);
        if (cancelled) return;
        if (activityData) {
          setContentType('activity');
          setActivityDetail(activityData);
          return;
        }

        setNotFound(true);
      } catch (err) {
        console.error('[ActivityDetail] load error:', err);
        setNotFound(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [slug]);

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
    const agendaItems = Array.isArray(eventDetail.agenda_items) ? eventDetail.agenda_items : [];
    return (
      <div className="bg-background text-foreground">
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

