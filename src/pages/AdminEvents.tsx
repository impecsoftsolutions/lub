import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Calendar,
  Clock3,
  Globe,
  GlobeLock,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Archive,
  Eye,
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import {
  eventsService,
  type AdminEventListItem,
  type EventStatus,
  type EventSummaryMetrics,
} from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import Toast from '../components/Toast';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

const STATUS_BADGE_CLASS: Record<EventStatus, string> = {
  draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  published: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  archived: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

type FilterTab = 'all' | EventStatus;

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Drafts' },
  { key: 'archived', label: 'Archived' },
];

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scoreEvent(item: AdminEventListItem, query: string): number {
  const q = query.toLowerCase();
  const title = item.title.toLowerCase();
  const slug = item.slug.toLowerCase();
  const location = (item.location ?? '').toLowerCase();
  const type = item.event_type.toLowerCase();
  const visibility = item.visibility === 'member_only' ? 'member only' : 'public';

  let score = 0;
  if (title.startsWith(q)) score += 5;
  else if (title.includes(q)) score += 3;
  if (slug.includes(q)) score += 1.5;
  if (location.includes(q)) score += 1.5;
  if (type.includes(q)) score += 1;
  if (visibility.includes(q)) score += 0.5;
  return score;
}

const AdminEvents: React.FC = () => {
  const navigate = useNavigate();

  const canCreate = useHasPermission('events.create');
  const canEditAny = useHasPermission('events.edit_any');
  const canEditOwn = useHasPermission('events.edit_own');
  const canPublish = useHasPermission('events.publish');
  const canArchive = useHasPermission('events.archive');
  const canDelete = useHasPermission('events.delete');
  const canCreateActivity = useHasPermission('activities.create');

  const [items, setItems] = useState<AdminEventListItem[]>([]);
  const [metrics, setMetrics] = useState<EventSummaryMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showMemberOnly, setShowMemberOnly] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = sessionManager.getSessionToken();
      if (!token) {
        showToast('error', 'No admin session found. Please sign in again.');
        return;
      }
      const data = await eventsService.getAll(token);
      setItems(data);
      setMetrics(eventsService.computeMetrics(data));
    } catch (err) {
      console.error('[AdminEvents] load error:', err);
      showToast('error', 'Failed to load events.');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const handlePublish = useCallback(async (id: string) => {
    setActionLoading(`${id}:publish`);
    try {
      const token = sessionManager.getSessionToken();
      if (!token) {
        showToast('error', 'Session expired.');
        return;
      }
      const result = await eventsService.publish(token, id);
      if (!result.success) {
        showToast('error', result.error ?? 'Failed to publish event.');
        return;
      }
      showToast('success', 'Event published.');
      void loadEvents();
    } finally {
      setActionLoading(null);
    }
  }, [loadEvents, showToast]);

  const handleUnpublish = useCallback(async (id: string) => {
    setActionLoading(`${id}:unpublish`);
    try {
      const token = sessionManager.getSessionToken();
      if (!token) {
        showToast('error', 'Session expired.');
        return;
      }
      const result = await eventsService.unpublish(token, id);
      if (!result.success) {
        showToast('error', result.error ?? 'Failed to move event to draft.');
        return;
      }
      showToast('success', 'Event moved to draft.');
      void loadEvents();
    } finally {
      setActionLoading(null);
    }
  }, [loadEvents, showToast]);

  const handleArchive = useCallback(async (id: string) => {
    setActionLoading(`${id}:archive`);
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
      void loadEvents();
    } finally {
      setActionLoading(null);
    }
  }, [loadEvents, showToast]);

  const handleBridgeToActivity = useCallback(async (id: string) => {
    setActionLoading(`${id}:bridge`);
    try {
      const token = sessionManager.getSessionToken();
      if (!token) {
        showToast('error', 'Session expired.');
        return;
      }
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
      setActionLoading(null);
    }
  }, [navigate, showToast]);

  const handleDelete = useCallback(async (id: string, title: string) => {
    if (!window.confirm(`Permanently delete "${title}"? This cannot be undone.`)) {
      return;
    }

    setActionLoading(`${id}:delete`);
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
      void loadEvents();
    } finally {
      setActionLoading(null);
    }
  }, [loadEvents, showToast]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = items.filter((item) => {
      const statusMatch = filterTab === 'all' || item.status === filterTab;
      const visibilityMatch = !showMemberOnly || item.visibility === 'member_only';
      const searchMatch = !q || scoreEvent(item, q) > 0;
      return statusMatch && visibilityMatch && searchMatch;
    });

    filtered.sort((a, b) => {
      if (q) {
        const diff = scoreEvent(b, q) - scoreEvent(a, q);
        if (diff !== 0) return diff;
      }
      if (a.status !== b.status) {
        if (a.status === 'published') return -1;
        if (b.status === 'published') return 1;
      }
      return (b.start_at ?? b.created_at).localeCompare(a.start_at ?? a.created_at);
    });

    return filtered;
  }, [filterTab, items, searchQuery, showMemberOnly]);

  return (
    <PermissionGate permission="events.view">
      <div className="space-y-6">
        {toast && (
          <Toast
            type={toast.type}
            message={toast.message}
            onClose={() => setToast(null)}
          />
        )}

        <PageHeader
          title="Events"
          subtitle="Manage standalone events. Activities remain a separate domain."
          actions={
            canCreate ? (
              <Button asChild>
                <Link to="/admin/content/events/new">
                  <Plus className="h-4 w-4 mr-2" />
                  New Event
                </Link>
              </Button>
            ) : undefined
          }
        />

        {metrics && !isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {[
              { label: 'Total', value: metrics.total },
              { label: 'Published', value: metrics.published },
              { label: 'Drafts', value: metrics.drafts },
              { label: 'Archived', value: metrics.archived },
              { label: 'Featured', value: metrics.featured },
              { label: 'Member-only', value: metrics.member_only },
            ].map((metric) => (
              <div key={metric.label} className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
                <p className="text-2xl font-bold text-foreground">{metric.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{metric.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3">
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

            <button
              type="button"
              onClick={() => setShowMemberOnly((value) => !value)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                showMemberOnly
                  ? 'border-primary/30 bg-primary/10 text-primary shadow-sm'
                  : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground'
              }`}
            >
              <GlobeLock className="h-3.5 w-3.5" />
              Member-only
            </button>
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search title, type, slug, location..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading events...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <Calendar className="h-10 w-10 opacity-30" />
              <p className="text-sm">
                {searchQuery || filterTab !== 'all' || showMemberOnly
                  ? 'No events match your filters.'
                  : 'No events yet. Create your first event.'}
              </p>
              {canCreate && filterTab === 'all' && !searchQuery && !showMemberOnly && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/admin/content/events/new">
                    <Plus className="h-4 w-4 mr-1" />
                    Create event
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Event</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Schedule / Location</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Status</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Visibility</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => {
                    const isBusy = Boolean(actionLoading?.startsWith(item.id));
                    return (
                      <tr key={item.id} className="border-b border-border/70 last:border-0">
                        <td className="px-4 py-3 align-top">
                          <div className="min-w-[220px] space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => navigate(`/admin/content/events/${item.id}/edit`)}
                                className="text-left font-medium text-foreground hover:text-primary"
                              >
                                {item.title}
                              </button>
                              {item.is_featured && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[11px] text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                                  <Star className="h-3 w-3" />
                                  Featured
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">/{item.slug} · {item.event_type}</p>
                            {item.excerpt && (
                              <p className="text-xs text-muted-foreground line-clamp-2">{item.excerpt}</p>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 align-top hidden md:table-cell">
                          <div className="space-y-1 text-xs text-muted-foreground min-w-[220px]">
                            <p className="inline-flex items-center gap-1.5">
                              <Clock3 className="h-3.5 w-3.5" />
                              {formatDateTime(item.start_at)}
                              {item.end_at ? ` – ${formatDateTime(item.end_at)}` : ''}
                            </p>
                            {item.location && (
                              <p className="inline-flex items-center gap-1.5">
                                <Globe className="h-3.5 w-3.5" />
                                {item.location}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 align-top hidden lg:table-cell">
                          <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', STATUS_BADGE_CLASS[item.status])}>
                            {STATUS_LABELS[item.status]}
                          </span>
                        </td>

                        <td className="px-4 py-3 align-top hidden lg:table-cell">
                          <span className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                            item.visibility === 'member_only'
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground'
                          )}>
                            {item.visibility === 'member_only' ? (
                              <><GlobeLock className="h-3 w-3" /> Member only</>
                            ) : (
                              <><Globe className="h-3 w-3" /> Public</>
                            )}
                          </span>
                        </td>

                        <td className="px-4 py-3 align-top">
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                className={cn(
                                  buttonVariants({ variant: 'ghost', size: 'sm' }),
                                  'h-8 w-8 p-0 rounded-md',
                                )}
                                disabled={isBusy}
                                aria-label="Open actions"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </DropdownMenuTrigger>

                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem asChild>
                                  <Link to={`/events/${item.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-2">
                                    <Eye className="h-4 w-4" />
                                    View Public Page
                                  </Link>
                                </DropdownMenuItem>

                                {(canEditAny || canEditOwn) && (
                                  <DropdownMenuItem asChild>
                                    <Link to={`/admin/content/events/${item.id}/edit`} className="flex items-center gap-2">
                                      <Pencil className="h-4 w-4" />
                                      Edit
                                    </Link>
                                  </DropdownMenuItem>
                                )}

                                {canPublish && item.status === 'draft' && (
                                  <DropdownMenuItem onClick={() => void handlePublish(item.id)} className="flex items-center gap-2">
                                    <Globe className="h-4 w-4" />
                                    Publish
                                  </DropdownMenuItem>
                                )}

                                {canPublish && item.status === 'published' && (
                                  <DropdownMenuItem onClick={() => void handleUnpublish(item.id)} className="flex items-center gap-2">
                                    <Pencil className="h-4 w-4" />
                                    Move to Draft
                                  </DropdownMenuItem>
                                )}

                                {canArchive && item.status !== 'archived' && (
                                  <DropdownMenuItem onClick={() => void handleArchive(item.id)} className="flex items-center gap-2">
                                    <Archive className="h-4 w-4" />
                                    Archive
                                  </DropdownMenuItem>
                                )}

                                {canCreateActivity && (
                                  <DropdownMenuItem
                                    onClick={() => void handleBridgeToActivity(item.id)}
                                    className="flex items-center gap-2"
                                  >
                                    <Link2 className="h-4 w-4" />
                                    Create Activity from Event
                                  </DropdownMenuItem>
                                )}

                                {canDelete && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => void handleDelete(item.id, item.title)}
                                      className="flex items-center gap-2 text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
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

export default AdminEvents;

