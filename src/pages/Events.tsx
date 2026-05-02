import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  Clock3,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Search,
  Star,
  Tag,
  X,
} from 'lucide-react';
import {
  activitiesService,
  eventsService,
  type PublicActivity,
  type PublicEvent,
} from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { buildActivityMediaUrl } from '../lib/activityMedia';

const PAGE_SIZE = 12;
const SEARCH_LOAD_LIMIT = 200;

type EventFilter = 'all' | 'featured' | 'upcoming' | 'past';
type FeedItemType = 'event' | 'activity';

interface FeedItem {
  type: FeedItemType;
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  location: string | null;
  is_featured: boolean;
  published_at: string | null;
  date_value: string | null;
  cover_image_url: string | null;
  event_type?: string | null;
}

const normalizeSearchText = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();

const toStartOfDay = (value: Date): Date => {
  const next = new Date(value);
  next.setHours(0, 0, 0, 0);
  return next;
};

const formatEventDate = (value: string | null): string => {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatEventDateTime = (value: string | null, type: FeedItemType): string => {
  if (!value) return '';
  if (type === 'event') {
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return formatEventDate(value);
};

const isPast = (value: string | null, type: FeedItemType): boolean => {
  if (!value) return false;
  const date = new Date(value);
  const boundary = toStartOfDay(new Date());

  if (type === 'event') {
    return date < new Date();
  }

  const activityDay = toStartOfDay(date);
  return activityDay < boundary;
};

const scoreFeedItem = (item: FeedItem, query: string): number => {
  const q = normalizeSearchText(query);
  if (!q) return 1;

  const title = normalizeSearchText(item.title);
  const excerpt = normalizeSearchText(item.excerpt ?? '');
  const location = normalizeSearchText(item.location ?? '');
  const slug = normalizeSearchText(item.slug);
  const dateText = normalizeSearchText(formatEventDateTime(item.date_value, item.type));
  const typeText = normalizeSearchText(item.type === 'event' ? item.event_type ?? 'event' : 'activity');
  const haystack = `${title} ${excerpt} ${location} ${slug} ${dateText} ${typeText}`;
  const terms = q.split(' ').filter(Boolean);

  let score = 0;
  if (title.startsWith(q)) score += 8;
  if (title.includes(q)) score += 5;
  if (location.includes(q)) score += 3;
  if (dateText.includes(q)) score += 2.5;
  if (excerpt.includes(q)) score += 2;
  if (slug.includes(q)) score += 1.5;
  if (typeText.includes(q)) score += 1;
  if (item.is_featured && ['featured', 'starred', 'important'].includes(q)) score += 4;

  for (const term of terms) {
    if (title.includes(term)) score += 2;
    if (location.includes(term)) score += 1.5;
    if (excerpt.includes(term)) score += 1;
    if (dateText.includes(term)) score += 1;
    if (typeText.includes(term)) score += 1;
  }

  return terms.every((term) => haystack.includes(term)) ? score + 1 : score;
};

const toEventFeedItem = (event: PublicEvent): FeedItem => ({
  type: 'event',
  id: event.id,
  slug: event.slug,
  title: event.title,
  excerpt: event.excerpt,
  location: event.location,
  is_featured: event.is_featured,
  published_at: event.published_at,
  date_value: event.start_at,
  cover_image_url: null,
  event_type: event.event_type,
});

const toActivityFeedItem = (activity: PublicActivity): FeedItem => ({
  type: 'activity',
  id: activity.id,
  slug: activity.slug,
  title: activity.title,
  excerpt: activity.excerpt,
  location: activity.location,
  is_featured: activity.is_featured,
  published_at: activity.published_at,
  date_value: activity.activity_date,
  cover_image_url: activity.cover_image_url,
});

const Events: React.FC = () => {
  const [eventItems, setEventItems] = useState<FeedItem[]>([]);
  const [activityItems, setActivityItems] = useState<FeedItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<EventFilter>('all');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    const load = async () => {
      const token = sessionManager.getSessionToken();
      const [eventsResult, activitiesResult] = await Promise.allSettled([
        eventsService.getPublished(SEARCH_LOAD_LIMIT, 0, token),
        activitiesService.getPublished(SEARCH_LOAD_LIMIT, 0),
      ]);

      if (cancelled) return;

      if (eventsResult.status === 'fulfilled') {
        setEventItems(eventsResult.value.map(toEventFeedItem));
      } else {
        console.error('[Events] events load error:', eventsResult.reason);
        setEventItems([]);
      }

      if (activitiesResult.status === 'fulfilled') {
        setActivityItems(activitiesResult.value.map(toActivityFeedItem));
      } else {
        console.error('[Events] activities load error:', activitiesResult.reason);
        setActivityItems([]);
      }

      if (eventsResult.status === 'rejected' && activitiesResult.status === 'rejected') {
        setError(true);
      }

      setIsLoading(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    window.setTimeout(() => {
      setVisibleCount((count) => count + PAGE_SIZE);
      setLoadingMore(false);
    }, 150);
  };

  const searchActive = searchQuery.trim().length > 0 || filter !== 'all';

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim();

    const filtered = eventItems
      .map((item) => ({ item, score: scoreFeedItem(item, q) }))
      .filter(({ item, score }) => {
        if (q && score <= 0) return false;
        if (filter === 'featured' && !item.is_featured) return false;
        if (filter === 'upcoming' && isPast(item.date_value, item.type)) return false;
        if (filter === 'past' && !isPast(item.date_value, item.type)) return false;
        return true;
      });

    filtered.sort((a, b) => {
      if (q && b.score !== a.score) return b.score - a.score;
      if (b.item.is_featured !== a.item.is_featured) return Number(b.item.is_featured) - Number(a.item.is_featured);
      return (a.item.date_value ?? a.item.published_at ?? '').localeCompare(b.item.date_value ?? b.item.published_at ?? '');
    });

    return filtered.map(({ item }) => item);
  }, [eventItems, filter, searchQuery]);

  const filteredActivities = useMemo(() => {
    const q = searchQuery.trim();

    const filtered = activityItems
      .map((item) => ({ item, score: scoreFeedItem(item, q) }))
      .filter(({ item, score }) => {
        if (q && score <= 0) return false;
        if (filter === 'featured' && !item.is_featured) return false;
        if (filter === 'upcoming' && isPast(item.date_value, item.type)) return false;
        if (filter === 'past' && !isPast(item.date_value, item.type)) return false;
        return true;
      });

    filtered.sort((a, b) => {
      if (q && b.score !== a.score) return b.score - a.score;
      if (b.item.is_featured !== a.item.is_featured) return Number(b.item.is_featured) - Number(a.item.is_featured);
      return (b.item.date_value ?? b.item.published_at ?? '').localeCompare(a.item.date_value ?? a.item.published_at ?? '');
    });

    return filtered.map(({ item }) => item);
  }, [activityItems, filter, searchQuery]);

  const visibleEvents = filteredEvents.slice(0, visibleCount);
  const remainingAfterEvents = Math.max(0, visibleCount - visibleEvents.length);
  const visibleActivities = filteredActivities.slice(0, remainingAfterEvents);
  const totalVisible = visibleEvents.length + visibleActivities.length;
  const totalItems = filteredEvents.length + filteredActivities.length;
  const hasMore = totalItems > totalVisible;

  return (
    <div className="bg-background text-foreground">
      <section className="border-b border-border bg-muted/40">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          <div className="max-w-3xl space-y-3 sm:space-y-4">
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">Events &amp; Activities</h1>
            <p className="text-base leading-7 text-muted-foreground sm:text-xl sm:leading-8">
              Upcoming events you can attend, and past activities delivered by LUB for the MSME community.
            </p>
          </div>
        </div>
      </section>

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
                placeholder="Search events & activities..."
                className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-10 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear search"
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
              Showing {totalItems} matching item{totalItems === 1 ? '' : 's'}.
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 sm:py-32 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading...
          </div>
        ) : error ? (
          <div className="py-16 sm:py-32 text-center text-muted-foreground">
            <p>Unable to load events &amp; activities. Please try again later.</p>
          </div>
        ) : totalItems === 0 ? (
          <div className="py-16 sm:py-32 text-center text-muted-foreground">
            <ImageIcon className="mx-auto h-12 w-12 opacity-20 mb-4" />
            <p className="text-lg">{searchActive ? 'Nothing matches your search.' : 'Nothing published yet.'}</p>
            <p className="text-sm mt-1">{searchActive ? 'Try a different title, location, date, or type.' : 'Check back soon.'}</p>
          </div>
        ) : (
          <>
            <section className="mb-10 sm:mb-14">
              <div className="mb-4 flex items-baseline justify-between gap-3 sm:mb-5">
                <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Upcoming Events</h2>
                <span className="text-xs text-muted-foreground sm:text-sm">
                  {filteredEvents.length} item{filteredEvents.length === 1 ? '' : 's'}
                </span>
              </div>
              {visibleEvents.length > 0 ? (
                <div className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
                  {visibleEvents.map((item) => (
                    <FeedCard key={`${item.type}:${item.id}`} item={item} />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  No upcoming events right now.
                </div>
              )}
            </section>

            <section>
              <div className="mb-4 flex items-baseline justify-between gap-3 sm:mb-5">
                <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Activities</h2>
                <span className="text-xs text-muted-foreground sm:text-sm">
                  {filteredActivities.length} item{filteredActivities.length === 1 ? '' : 's'}
                </span>
              </div>
              {visibleActivities.length > 0 ? (
                <div className="grid gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
                  {visibleActivities.map((item) => (
                    <FeedCard key={`${item.type}:${item.id}`} item={item} />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                  No activities to show in this filter.
                </div>
              )}
            </section>

            {hasMore && (
              <div className="mt-12 flex justify-center">
                <button
                  type="button"
                  onClick={() => { void handleLoadMore(); }}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-6 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-60"
                >
                  {loadingMore ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Loading...</>
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

const FeedCard: React.FC<{ item: FeedItem }> = ({ item }) => {
  const coverUrl = item.type === 'activity'
    ? buildActivityMediaUrl(item.cover_image_url, 'cover-card')
    : null;

  return (
    <Link
      to={`/events/${item.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="relative aspect-video overflow-hidden bg-muted">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <ImageIcon className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-2">
          {item.type === 'event' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/90 px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">
              <Tag className="h-3 w-3" />
              {item.event_type ?? 'Event'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white">
              Activity
            </span>
          )}
          {item.is_featured && (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-400/90 px-2.5 py-1 text-[11px] font-semibold text-yellow-900">
              <Star className="h-3 w-3" />
              Featured
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {item.date_value && (
            <div className="flex items-center gap-1">
              {item.type === 'event' ? (
                <Clock3 className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Calendar className="h-3.5 w-3.5 shrink-0" />
              )}
              {formatEventDateTime(item.date_value, item.type)}
            </div>
          )}
          {item.location && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-1">{item.location}</span>
            </div>
          )}
        </div>

        <h2 className="text-base font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {item.title}
        </h2>

        {item.excerpt && (
          <p className="text-sm text-muted-foreground leading-6 line-clamp-3 flex-1">
            {item.excerpt}
          </p>
        )}

        <div className="mt-auto flex items-center gap-1 text-sm font-medium text-primary">
          Read more
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
};

export default Events;

