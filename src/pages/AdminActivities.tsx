import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Image,
  Plus,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  Archive,
  Trash2,
  Globe,
  GlobeLock,
  Calendar,
  MapPin,
  Star,
  RefreshCw,
  Settings,
  ArrowUpDown,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import {
  activitiesService,
  type AdminActivityListItem,
  type ActivitySummaryMetrics,
  type ActivityStatus,
} from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import Toast from '../components/Toast';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { buildActivityMediaUrl } from '../lib/activityMedia';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ─── Status helpers ────────────────────────────────────────────

const STATUS_LABELS: Record<ActivityStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

const STATUS_BADGE_CLASS: Record<ActivityStatus, string> = {
  draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  published: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  archived: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

type FilterTab = 'all' | ActivityStatus;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Drafts' },
  { key: 'archived', label: 'Archived' },
];

type SortKey = 'activity_date_desc' | 'activity_date_asc' | 'published_at_desc' | 'title_asc';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'activity_date_desc', label: 'Date (newest first)' },
  { key: 'activity_date_asc',  label: 'Date (oldest first)' },
  { key: 'published_at_desc',  label: 'Published (newest first)' },
  { key: 'title_asc',          label: 'Title A–Z' },
];

// ─── Ranked search ────────────────────────────────────────────

/**
 * Returns a relevance score for the activity against the query string.
 * Score 0 means no match — the item is filtered out.
 */
function scoreActivity(a: AdminActivityListItem, q: string): number {
  const title    = a.title.toLowerCase();
  const slug     = a.slug.toLowerCase();
  const location = (a.location ?? '').toLowerCase();
  const status   = STATUS_LABELS[a.status].toLowerCase();

  let score = 0;
  if (title.startsWith(q))   score += 4;
  else if (title.includes(q)) score += 3;
  if (slug.includes(q))       score += 1.5;
  if (location.includes(q))   score += 1;
  if (status.includes(q))     score += 0.5;
  // "featured" / "yes" / "true" / "starred" keyword shortcut
  if (
    a.is_featured &&
    (q === 'featured' || q === 'yes' || q === 'true' || q === 'starred' || 'featured'.startsWith(q))
  ) {
    score += 2;
  }
  return score;
}

// ─── Component ────────────────────────────────────────────────

const AdminActivities: React.FC = () => {
  const navigate = useNavigate();

  // Permissions
  const canCreate         = useHasPermission('activities.create');
  const canEdit           = useHasPermission('activities.edit_any');
  const canDelete         = useHasPermission('activities.delete');
  const canPublish        = useHasPermission('activities.publish');
  const canViewSettings   = useHasPermission('activities.settings.view');

  // State
  const [activities, setActivities] = useState<AdminActivityListItem[]>([]);
  const [metrics, setMetrics] = useState<ActivitySummaryMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [showFeaturedOnly, setShowFeaturedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('activity_date_desc');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Load ───────────────────────────────────────────────────

  const loadActivities = useCallback(async () => {
    setIsLoading(true);
    try {
      const sessionToken = sessionManager.getSessionToken();
      if (!sessionToken) {
        showToast('error', 'No admin session found. Please sign in again.');
        return;
      }
      const data = await activitiesService.getAll(sessionToken);
      setActivities(data);
      setMetrics(activitiesService.computeMetrics(data));
    } catch (err) {
      console.error('[AdminActivities] load error:', err);
      showToast('error', 'Failed to load activities.');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  // ── Actions ─────────────────────────────────────────────────

  const handlePublish = useCallback(async (id: string) => {
    setActionLoading(id + ':publish');
    try {
      const token = sessionManager.getSessionToken();
      if (!token) { showToast('error', 'Session expired.'); return; }
      const result = await activitiesService.publish(token, id);
      if (!result.success) { showToast('error', result.error ?? 'Failed to publish.'); return; }
      showToast('success', 'Activity published.');
      void loadActivities();
    } finally {
      setActionLoading(null);
    }
  }, [loadActivities, showToast]);

  const handleUnpublish = useCallback(async (id: string) => {
    setActionLoading(id + ':unpublish');
    try {
      const token = sessionManager.getSessionToken();
      if (!token) { showToast('error', 'Session expired.'); return; }
      const result = await activitiesService.unpublish(token, id);
      if (!result.success) { showToast('error', result.error ?? 'Failed to unpublish.'); return; }
      showToast('success', 'Activity moved to draft.');
      void loadActivities();
    } finally {
      setActionLoading(null);
    }
  }, [loadActivities, showToast]);

  const handleArchive = useCallback(async (id: string) => {
    setActionLoading(id + ':archive');
    try {
      const token = sessionManager.getSessionToken();
      if (!token) { showToast('error', 'Session expired.'); return; }
      const result = await activitiesService.archive(token, id);
      if (!result.success) { showToast('error', result.error ?? 'Failed to archive.'); return; }
      showToast('success', 'Activity archived.');
      void loadActivities();
    } finally {
      setActionLoading(null);
    }
  }, [loadActivities, showToast]);

  const handleDelete = useCallback(async (id: string, title: string) => {
    if (!window.confirm(`Permanently delete "${title}"? This cannot be undone.`)) return;
    setActionLoading(id + ':delete');
    try {
      const token = sessionManager.getSessionToken();
      if (!token) { showToast('error', 'Session expired.'); return; }
      const result = await activitiesService.delete(token, id);
      if (!result.success) { showToast('error', result.error ?? 'Failed to delete.'); return; }
      showToast('success', 'Activity deleted.');
      void loadActivities();
    } finally {
      setActionLoading(null);
    }
  }, [loadActivities, showToast]);

  // ── Filter + search + sort ───────────────────────────────────

  const filteredActivities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    // 1. Filter
    const filtered = activities.filter((a) => {
      const matchStatus   = filterTab === 'all' || a.status === filterTab;
      const matchFeatured = !showFeaturedOnly || a.is_featured;
      const matchSearch   = !q || scoreActivity(a, q) > 0;
      return matchStatus && matchFeatured && matchSearch;
    });

    // 2. Sort — score-first when query is active, then the chosen sort key
    filtered.sort((a, b) => {
      if (q) {
        const diff = scoreActivity(b, q) - scoreActivity(a, q);
        if (diff !== 0) return diff;
      }
      switch (sortKey) {
        case 'activity_date_desc':
          if (!a.activity_date && !b.activity_date) break;
          if (!a.activity_date) return 1;
          if (!b.activity_date) return -1;
          return b.activity_date.localeCompare(a.activity_date);
        case 'activity_date_asc':
          if (!a.activity_date && !b.activity_date) break;
          if (!a.activity_date) return 1;
          if (!b.activity_date) return -1;
          return a.activity_date.localeCompare(b.activity_date);
        case 'published_at_desc':
          if (!a.published_at && !b.published_at) break;
          if (!a.published_at) return 1;
          if (!b.published_at) return -1;
          return b.published_at.localeCompare(a.published_at);
        case 'title_asc':
          return a.title.localeCompare(b.title);
      }
      // Tiebreaker: created_at desc
      return b.created_at.localeCompare(a.created_at);
    });

    return filtered;
  }, [activities, filterTab, showFeaturedOnly, searchQuery, sortKey]);

  // ── Render ───────────────────────────────────────────────────

  return (
    <PermissionGate permission="activities.view">
      <div className="space-y-6">
        {/* Toast */}
        {toast && (
          <Toast
            type={toast.type}
            message={toast.message}
            onClose={() => setToast(null)}
          />
        )}

        {/* Page header */}
        <PageHeader
          title="Activities"
          subtitle="Manage public activity posts — create, edit, publish, and archive."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {canViewSettings && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/admin/content/activities/settings">
                    <Settings className="h-4 w-4 mr-1.5" />
                    Settings
                  </Link>
                </Button>
              )}
              {canCreate && (
                <Button asChild>
                  <Link to="/admin/content/activities/new">
                    <Plus className="h-4 w-4 mr-2" />
                    New Activity
                  </Link>
                </Button>
              )}
            </div>
          }
        />

        {/* Metrics strip */}
        {metrics && !isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {[
              { label: 'Total', value: metrics.total },
              { label: 'Published', value: metrics.published },
              { label: 'Drafts', value: metrics.drafts },
              { label: 'Archived', value: metrics.archived },
              { label: 'Featured', value: metrics.featured },
              { label: 'Photos', value: metrics.total_photos },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
              >
                <p className="text-2xl font-bold text-foreground">{m.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filter + search + sort bar */}
        <div className="flex flex-col gap-3">
          {/* Row 1: Status tabs + Featured chip */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilterTab(tab.key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    filterTab === tab.key
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Featured toggle chip */}
            <button
              onClick={() => setShowFeaturedOnly((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                showFeaturedOnly
                  ? 'border-yellow-300 bg-yellow-50 text-yellow-800 shadow-sm dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              <Star className="h-3.5 w-3.5" />
              Featured
            </button>
          </div>

          {/* Row 2: Search + Sort (right-aligned on sm+) */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {/* Search */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search title, location, status…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2 shrink-0">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading activities…
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Image className="h-10 w-10 opacity-30" />
              <p className="text-sm">
                {searchQuery || filterTab !== 'all' || showFeaturedOnly
                  ? 'No activities match your search or filters.'
                  : 'No activities yet. Create your first one.'}
              </p>
              {canCreate && filterTab === 'all' && !searchQuery && !showFeaturedOnly && (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/admin/content/activities/new">
                    <Plus className="h-4 w-4 mr-1" />
                    Create activity
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground text-left">
                    <th className="px-4 py-3 font-medium w-24">Photo</th>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Date / Location</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Status</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Photos</th>
                    <th className="px-4 py-3 font-medium hidden xl:table-cell">Published</th>
                    <th className="px-4 py-3 font-medium text-right w-16">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredActivities.map((activity) => {
                    const isActing = actionLoading?.startsWith(activity.id + ':');
                    const galleryFallbackUrl = buildActivityMediaUrl(activity.first_media_url, 'gallery-grid');
                    const thumbnailUrl =
                      buildActivityMediaUrl(activity.cover_image_url, 'cover-card') ??
                      galleryFallbackUrl;
                    return (
                      <tr
                        key={activity.id}
                        className={`hover:bg-muted/20 transition-colors ${isActing ? 'opacity-50' : ''}`}
                      >
                        {/* Cover thumbnail */}
                        <td className="px-4 py-3">
                          {thumbnailUrl ? (
                            <img
                              src={thumbnailUrl}
                              alt={`${activity.title} thumbnail`}
                              className="h-12 w-20 rounded-lg border border-border object-cover bg-muted shadow-sm"
                              loading="lazy"
                              onError={(event) => {
                                if (galleryFallbackUrl && event.currentTarget.src !== galleryFallbackUrl) {
                                  event.currentTarget.src = galleryFallbackUrl;
                                }
                              }}
                            />
                          ) : (
                            <div className="h-12 w-20 rounded-lg border border-dashed border-border bg-muted/60 flex items-center justify-center">
                              <Image className="h-4 w-4 text-muted-foreground/50" />
                            </div>
                          )}
                        </td>

                        {/* Title + featured badge */}
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            <div>
                              <p className="font-medium text-foreground line-clamp-1">{activity.title}</p>
                              <p className="text-xs text-muted-foreground font-mono mt-0.5 line-clamp-1">
                                {activity.slug}
                              </p>
                            </div>
                            {activity.is_featured && (
                              <Star className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" />
                            )}
                          </div>
                        </td>

                        {/* Date / location */}
                        <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                          <div className="space-y-0.5">
                            {activity.activity_date && (
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3.5 w-3.5 shrink-0" />
                                <span className="text-xs">
                                  {new Date(activity.activity_date).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </span>
                              </div>
                            )}
                            {activity.location && (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                <span className="text-xs line-clamp-1">{activity.location}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[activity.status]}`}
                          >
                            {STATUS_LABELS[activity.status]}
                          </span>
                        </td>

                        {/* Photos */}
                        <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                          {activity.media_count ?? 0}
                        </td>

                        {/* Published at */}
                        <td className="px-4 py-3 hidden xl:table-cell text-muted-foreground text-xs">
                          {activity.published_at
                            ? new Date(activity.published_at).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '—'}
                        </td>

                        {/* Actions */}
                        <td
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'h-8 w-8')}
                              aria-label="Activity actions"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Actions</span>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              {/* View public page (published only) */}
                              {activity.status === 'published' && (
                                <DropdownMenuItem asChild>
                                  <a
                                    href={`/events/${activity.slug}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2"
                                  >
                                    <Eye className="h-4 w-4" />
                                    View Public Page
                                  </a>
                                </DropdownMenuItem>
                              )}

                              {/* Edit */}
                              {canEdit && (
                                <DropdownMenuItem
                                  onClick={() =>
                                    navigate(`/admin/content/activities/${activity.id}/edit`)
                                  }
                                  className="flex items-center gap-2"
                                >
                                  <Pencil className="h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                              )}

                              <DropdownMenuSeparator />

                              {/* Publish / Unpublish */}
                              {canPublish && activity.status === 'draft' && (
                                <DropdownMenuItem
                                  disabled={actionLoading === activity.id + ':publish'}
                                  onClick={() => void handlePublish(activity.id)}
                                  className="flex items-center gap-2 text-green-600 focus:text-green-600"
                                >
                                  <Globe className="h-4 w-4" />
                                  Publish
                                </DropdownMenuItem>
                              )}
                              {canPublish && activity.status === 'published' && (
                                <DropdownMenuItem
                                  disabled={actionLoading === activity.id + ':unpublish'}
                                  onClick={() => void handleUnpublish(activity.id)}
                                  className="flex items-center gap-2"
                                >
                                  <GlobeLock className="h-4 w-4" />
                                  Move to Draft
                                </DropdownMenuItem>
                              )}
                              {canEdit && activity.status !== 'archived' && (
                                <DropdownMenuItem
                                  disabled={actionLoading === activity.id + ':archive'}
                                  onClick={() => void handleArchive(activity.id)}
                                  className="flex items-center gap-2"
                                >
                                  <Archive className="h-4 w-4" />
                                  Archive
                                </DropdownMenuItem>
                              )}

                              {/* Delete */}
                              {canDelete && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    disabled={actionLoading === activity.id + ':delete'}
                                    onClick={() => void handleDelete(activity.id, activity.title)}
                                    className="flex items-center gap-2 text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PermissionGate>
  );
};

export default AdminActivities;
