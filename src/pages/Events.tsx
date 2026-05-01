import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  MapPin,
  Loader2,
  Star,
  Image as ImageIcon,
  Search,
  X,
} from 'lucide-react';
import { activitiesService, type PublicActivity } from '../lib/supabase';
import { buildActivityMediaUrl } from '../lib/activityMedia';

const PAGE_SIZE = 12;
const SEARCH_LOAD_LIMIT = 200;

type EventFilter = 'all' | 'featured' | 'upcoming' | 'past';

const normalizeSearchText = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();

const formatEventDate = (value: string | null): string => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const isPastEvent = (value: string | null): boolean => {
  if (!value) return false;
  const eventDate = new Date(`${value}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return eventDate < today;
};

const scoreEvent = (activity: PublicActivity, query: string): number => {
  const q = normalizeSearchText(query);
  if (!q) return 1;
  const title = normalizeSearchText(activity.title);
  const excerpt = normalizeSearchText(activity.excerpt ?? '');
  const location = normalizeSearchText(activity.location ?? '');
  const slug = normalizeSearchText(activity.slug);
  const dateText = normalizeSearchText(formatEventDate(activity.activity_date));
  const haystack = `${title} ${excerpt} ${location} ${slug} ${dateText}`;
  const terms = q.split(' ').filter(Boolean);
  let score = 0;

  if (title.startsWith(q)) score += 8;
  if (title.includes(q)) score += 5;
  if (location.includes(q)) score += 3;
  if (dateText.includes(q)) score += 2.5;
  if (excerpt.includes(q)) score += 2;
  if (slug.includes(q)) score += 1.5;
  if (activity.is_featured && ['featured', 'starred', 'important'].includes(q)) score += 4;

  for (const term of terms) {
    if (title.includes(term)) score += 2;
    if (location.includes(term)) score += 1.5;
    if (excerpt.includes(term)) score += 1;
    if (dateText.includes(term)) score += 1;
  }

  return terms.every((term) => haystack.includes(term)) ? score + 1 : score;
};

const Events: React.FC = () => {
  const [activities, setActivities] = useState<PublicActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<EventFilter>('all');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    activitiesService
      .getPublished(SEARCH_LOAD_LIMIT, 0)
      .then((data) => {
        if (cancelled) return;
        setActivities(data);
      })
      .catch((err) => {
        console.error('[Events] load error:', err);
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    window.setTimeout(() => {
      setVisibleCount((count) => count + PAGE_SIZE);
      setLoadingMore(false);
    }, 150);
  };

  const searchActive = searchQuery.trim().length > 0 || filter !== 'all';
  const allOrdered = useMemo(() => {
    const q = searchQuery.trim();
    const filtered = activities
      .map((activity) => ({ activity, score: scoreEvent(activity, q) }))
      .filter(({ activity, score }) => {
        if (q && score <= 0) return false;
        if (filter === 'featured' && !activity.is_featured) return false;
        if (filter === 'upcoming' && !activity.activity_date) return false;
        if (filter === 'upcoming' && isPastEvent(activity.activity_date)) return false;
        if (filter === 'past' && !isPastEvent(activity.activity_date)) return false;
        return true;
      });

    filtered.sort((a, b) => {
      if (q && b.score !== a.score) return b.score - a.score;
      if (b.activity.is_featured !== a.activity.is_featured) return Number(b.activity.is_featured) - Number(a.activity.is_featured);
      return (b.activity.activity_date ?? b.activity.published_at ?? '').localeCompare(a.activity.activity_date ?? a.activity.published_at ?? '');
    });

    return filtered.map(({ activity }) => activity);
  }, [activities, filter, searchQuery]);
  const visibleEvents = allOrdered.slice(0, visibleCount);
  const hasMore = allOrdered.length > visibleCount;

  return (
    <div className="bg-background text-foreground">
      {/* Hero */}
      <section className="border-b border-border bg-muted/40">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <div className="max-w-3xl space-y-3 sm:space-y-4">
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
              LUB Events
            </h1>
            <p className="text-base leading-7 text-muted-foreground sm:text-xl sm:leading-8">
              Conferences, workshops, networking meets, and advocacy efforts — a record of
              LUB's work with the MSME community.
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <div className="mb-6 rounded-lg border border-border bg-card p-4 shadow-sm sm:mb-8 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
                placeholder="Search events..."
                className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-10 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear event search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
              {([
                ['all', 'All'],
                ['featured', 'Featured'],
                ['upcoming', 'Upcoming'],
                ['past', 'Past'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setFilter(value);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className={`shrink-0 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                    filter === value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {searchActive && (
            <p className="mt-3 text-sm text-muted-foreground">
              Showing {allOrdered.length} matching event{allOrdered.length === 1 ? '' : 's'}.
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 sm:py-32 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading events…
          </div>
        ) : error ? (
          <div className="py-16 sm:py-32 text-center text-muted-foreground">
            <p>Unable to load events. Please try again later.</p>
          </div>
        ) : allOrdered.length === 0 ? (
          <div className="py-16 sm:py-32 text-center text-muted-foreground">
            <ImageIcon className="mx-auto h-12 w-12 opacity-20 mb-4" />
            <p className="text-lg">{searchActive ? 'No events match your search.' : 'No events published yet.'}</p>
            <p className="text-sm mt-1">{searchActive ? 'Try a different title, location, date, or topic.' : 'Check back soon.'}</p>
          </div>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {visibleEvents.map((activity) => (
                <EventCard key={activity.id} activity={activity} />
              ))}
            </div>

            {hasMore && (
              <div className="mt-12 flex justify-center">
                <button
                  type="button"
                  onClick={() => { void handleLoadMore(); }}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-6 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-60"
                >
                  {loadingMore ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Loading…</>
                  ) : (
                    'Load more'
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};

// ─── Event Card ────────────────────────────────────────────────

interface EventCardProps {
  activity: PublicActivity;
}

const EventCard: React.FC<EventCardProps> = ({ activity }) => {
  const coverUrl = buildActivityMediaUrl(activity.cover_image_url, 'cover-card');
  return (
    <Link
      to={`/events/${activity.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm hover:shadow-md transition-shadow"
    >
      {/* Cover image */}
      <div className="relative aspect-video overflow-hidden bg-muted">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={activity.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}
        {activity.is_featured && (
          <div className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-yellow-400/90 px-2.5 py-1 text-xs font-semibold text-yellow-900">
            <Star className="h-3 w-3" />
            Featured
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        {/* Meta */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {activity.activity_date && (
            <div className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              {new Date(activity.activity_date).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </div>
          )}
          {activity.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-1">{activity.location}</span>
            </div>
          )}
        </div>

        {/* Title */}
        <h2 className="text-base font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {activity.title}
        </h2>

        {/* Excerpt */}
        {activity.excerpt && (
          <p className="text-sm text-muted-foreground leading-6 line-clamp-3 flex-1">
            {activity.excerpt}
          </p>
        )}

        {/* Read more */}
        <div className="mt-auto flex items-center gap-1 text-sm font-medium text-primary">
          Read more
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
};

export default Events;
