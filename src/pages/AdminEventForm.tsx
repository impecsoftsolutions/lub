import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  Calendar,
  Clock3,
  Globe,
  GlobeLock,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import {
  eventsService,
  type AdminEventDetail,
  type EventAgendaItem,
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
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

function normalizeAgendaItems(items: EventAgendaItem[]): EventAgendaItem[] {
  return items
    .map((item) => ({
      title: item.title.trim(),
      time: item.time?.trim() || null,
      note: item.note?.trim() || null,
    }))
    .filter((item) => item.title.length > 0);
}

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

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [excerpt, setExcerpt] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState<EventType>('general');
  const [visibility, setVisibility] = useState<EventVisibility>('public');
  const [isFeatured, setIsFeatured] = useState(false);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [location, setLocation] = useState('');
  const [invitationText, setInvitationText] = useState('');
  const [agendaItems, setAgendaItems] = useState<EventAgendaItem[]>([{ title: '', time: '', note: '' }]);

  const [original, setOriginal] = useState<AdminEventDetail | null>(null);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    if (slugManual) return;
    setSlug(slugify(title));
  }, [title, slugManual]);

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
        setSlugManual(true);
        setExcerpt(data.excerpt ?? '');
        setDescription(data.description ?? '');
        setEventType(data.event_type);
        setVisibility(data.visibility);
        setIsFeatured(data.is_featured);
        setStartAt(toDateTimeInput(data.start_at));
        setEndAt(toDateTimeInput(data.end_at));
        setLocation(data.location ?? '');
        setInvitationText(data.invitation_text ?? '');

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

  const buildPayload = (): Record<string, unknown> => {
    return {
      title: title.trim(),
      slug: slug.trim(),
      excerpt: excerpt.trim() || null,
      description: description.trim() || null,
      event_type: eventType,
      visibility,
      is_featured: isFeatured,
      start_at: startAt ? new Date(startAt).toISOString() : null,
      end_at: endAt ? new Date(endAt).toISOString() : null,
      location: location.trim() || null,
      invitation_text: invitationText.trim() || null,
      agenda_items: normalizeAgendaItems(agendaItems),
    };
  };

  const saveEvent = async (): Promise<string | null> => {
    if (!title.trim()) {
      showToast('error', 'Title is required.');
      return null;
    }

    if (startAt && endAt && new Date(endAt) < new Date(startAt)) {
      showToast('error', 'End time must be after start time.');
      return null;
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
        showToast('error', result.error ?? 'Failed to save event.');
        return null;
      }
      showToast('success', 'Event saved.');
      return id;
    }

    const result = await eventsService.create(token, payload);
    if (!result.success || !result.event_id) {
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

        <Link
          to="/admin/content/events"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Events
        </Link>

        <PageHeader
          title={isEdit ? 'Edit Event' : 'New Event'}
          subtitle="Create and manage dedicated Events. Activities remain separate."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {canEdit && (
                <Button variant="outline" onClick={() => void handleSave()} disabled={isSaving}>
                  {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Draft
                </Button>
              )}
              {canPublish && (
                <Button onClick={() => void handlePublish()} disabled={isSaving || !canEdit}>
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

        <div className="rounded-xl border border-border bg-card p-5 space-y-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-foreground">Title *</label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Event title" />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-foreground">Slug</label>
              <Input
                value={slug}
                onChange={(event) => {
                  setSlugManual(true);
                  setSlug(slugify(event.target.value));
                }}
                placeholder="event-slug"
              />
              <p className="text-xs text-muted-foreground">Public URL: /events/{slug || 'event-slug'}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Event Type</label>
              <select
                value={eventType}
                onChange={(event) => setEventType(event.target.value as EventType)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {EVENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
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
                Start date & time
              </label>
              <Input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground inline-flex items-center gap-2">
                <Clock3 className="h-4 w-4" />
                End date & time
              </label>
              <Input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-foreground">Location</label>
              <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, venue, or online link" />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-foreground">Excerpt</label>
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
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-foreground">Invitation Text</label>
                <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  AI generation can be added in follow-up
                </span>
              </div>
              <Textarea
                rows={4}
                value={invitationText}
                onChange={(event) => setInvitationText(event.target.value)}
                placeholder="Invitation copy for this event"
              />
            </div>

            <div className="space-y-3 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium text-foreground">Agenda</label>
                <Button type="button" size="sm" variant="outline" onClick={addAgendaRow}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add row
                </Button>
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

            <div className="md:col-span-2 pt-2 flex flex-wrap gap-2">
              {canEdit && (
                <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
                  <Save className="h-4 w-4 mr-2" />
                  Save Draft
                </Button>
              )}
              {canPublish && (
                <Button type="button" variant="outline" onClick={() => void handlePublish()} disabled={isSaving || !canEdit}>
                  <Globe className="h-4 w-4 mr-2" />
                  Publish
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </PermissionGate>
  );
};

export default AdminEventForm;

