import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw, Search, Users } from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import {
  eventsService,
  EVENT_RSVP_GENDER_OPTIONS,
  EVENT_RSVP_MEAL_OPTIONS,
  EVENT_RSVP_PROFESSION_OPTIONS,
  type AdminEventDetail,
  type EventRsvpGender,
  type EventRsvpMealPreference,
  type EventRsvpProfession,
  type EventRsvpRow,
  type EventRsvpStatus,
  type EventRsvpSummary,
} from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { PageHeader } from '../components/ui/PageHeader';
import Toast from '../components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function labelFrom<T extends string>(
  v: T | null | undefined,
  options: ReadonlyArray<{ value: T; label: string }>,
): string {
  if (!v) return '—';
  return options.find((o) => o.value === v)?.label ?? v;
}

function formatVisitDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function eventDayList(start: string | null, end: string | null): string[] {
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

const AdminEventRegistrations: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const canView = useHasPermission('events.rsvp.view');
  const canManage = useHasPermission('events.rsvp.manage');

  const [event, setEvent] = useState<AdminEventDetail | null>(null);
  const [rows, setRows] = useState<EventRsvpRow[]>([]);
  const [summary, setSummary] = useState<EventRsvpSummary>({
    total: 0, confirmed: 0, cancelled: 0, pending: 0, waitlisted: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<EventRsvpStatus | 'all'>('all');
  const [visitDateFilter, setVisitDateFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const token = sessionManager.getSessionToken();
      if (!token) {
        showToast('error', 'Session expired.');
        return;
      }
      const [eventDetail, rsvpResult] = await Promise.all([
        eventsService.getById(token, id),
        eventsService.getRsvps(token, id, statusFilter === 'all' ? null : statusFilter),
      ]);
      if (!eventDetail) {
        showToast('error', 'Event not found.');
        navigate('/admin/content/events');
        return;
      }
      setEvent(eventDetail);
      if (rsvpResult.success) {
        setRows(rsvpResult.rows);
        setSummary(rsvpResult.summary);
      } else {
        showToast('error', rsvpResult.error ?? 'Failed to load registrations.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [id, navigate, showToast, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const eventDays = useMemo(
    () => eventDayList(event?.start_at ?? null, event?.end_at ?? null),
    [event?.start_at, event?.end_at],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (visitDateFilter !== 'all') {
        if ((row.visit_date ?? '') !== visitDateFilter) return false;
      }
      if (!q) return true;
      const hay = [
        row.full_name,
        row.email,
        row.phone ?? '',
        row.company ?? '',
        row.profession ?? '',
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, visitDateFilter]);

  const handleStatusChange = async (rsvpId: string, status: EventRsvpStatus) => {
    if (!canManage) return;
    const token = sessionManager.getSessionToken();
    if (!token) {
      showToast('error', 'Session expired.');
      return;
    }
    const result = await eventsService.updateRsvpStatus(token, rsvpId, status);
    if (!result.success) {
      showToast('error', result.error ?? 'Failed to update registration.');
      return;
    }
    showToast('success', 'Registration updated.');
    void load();
  };

  if (!canView && !canManage) {
    return (
      <PermissionGate permission="events.rsvp.view">
        <div className="py-12 text-center text-muted-foreground">
          You do not have permission to view registrations.
        </div>
      </PermissionGate>
    );
  }

  return (
    <PermissionGate permission="events.rsvp.view">
      <div className="space-y-6">
        {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

        <Link
          to="/admin/content/events"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Events
        </Link>

        <PageHeader
          title={event ? `Registrations · ${event.title}` : 'Registrations'}
          subtitle="Search, filter, and manage event registrations without entering edit mode."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Refresh
              </Button>
            </div>
          }
        />

        {/* Summary chips */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Total', value: summary.total },
            { label: 'Confirmed', value: summary.confirmed },
            { label: 'Pending', value: summary.pending },
            { label: 'Waitlisted', value: summary.waitlisted },
            { label: 'Cancelled', value: summary.cancelled },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
              <p className="text-2xl font-bold text-foreground">{m.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone, company"
              className="pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as EventRsvpStatus | 'all')}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="waitlisted">Waitlisted</option>
            <option value="cancelled">Cancelled</option>
          </select>
          {eventDays.length > 1 && (
            <select
              value={visitDateFilter}
              onChange={(e) => setVisitDateFilter(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All days</option>
              {eventDays.map((day) => (
                <option key={day} value={day}>{formatVisitDate(day)}</option>
              ))}
            </select>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading registrations...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Users className="h-10 w-10 opacity-30" />
              <p className="text-sm">No registrations match your filters.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Phone</th>
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Day of Visit</th>
                  <th className="px-3 py-2 font-medium">Gender</th>
                  <th className="px-3 py-2 font-medium">Meal</th>
                  <th className="px-3 py-2 font-medium">Profession</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  {canManage && <th className="px-3 py-2 font-medium text-right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className="border-b border-border/70 last:border-0 align-top">
                    <td className="px-3 py-2 text-foreground">{row.full_name}</td>
                    <td className="px-3 py-2 text-muted-foreground break-all">{row.email}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.phone ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.company ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatVisitDate(row.visit_date ?? null)}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {labelFrom<EventRsvpGender>(row.gender ?? null, EVENT_RSVP_GENDER_OPTIONS)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {labelFrom<EventRsvpMealPreference>(row.meal_preference ?? null, EVENT_RSVP_MEAL_OPTIONS)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {labelFrom<EventRsvpProfession>(row.profession ?? null, EVENT_RSVP_PROFESSION_OPTIONS)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          row.status === 'confirmed'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : row.status === 'cancelled'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                              : row.status === 'waitlisted'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                                : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-3 py-2 text-right">
                        <select
                          value={row.status}
                          onChange={(e) => void handleStatusChange(row.id, e.target.value as EventRsvpStatus)}
                          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        >
                          <option value="confirmed">Confirmed</option>
                          <option value="pending">Pending</option>
                          <option value="waitlisted">Waitlisted</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </PermissionGate>
  );
};

export default AdminEventRegistrations;
