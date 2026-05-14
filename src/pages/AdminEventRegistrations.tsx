import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Download, Loader2, Mail, QrCode, RefreshCw, Search, Send, Trash2, Users, X } from 'lucide-react';
import JSZip from 'jszip';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import {
  eventsService,
  EVENT_RSVP_GENDER_OPTIONS,
  EVENT_RSVP_MEAL_OPTIONS,
  EVENT_RSVP_PROFESSION_OPTIONS,
  type AdminEventDetail,
  type EventBadgeDeliveryStatus,
  type EventBadgeRow,
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
import { downloadSingleSheetXlsx } from '../lib/xlsxExport';
import { renderPdfFirstPageAsJpegBlob } from '../lib/pdfImageRender';

function labelFrom<T extends string>(
  v: T | null | undefined,
  options: ReadonlyArray<{ value: T; label: string }>,
): string {
  if (!v) return '—';
  return options.find((o) => o.value === v)?.label ?? v;
}

function professionOptionsForEvent(event: AdminEventDetail | null) {
  return event?.rsvp?.profession_options?.length ? event.rsvp.profession_options : EVENT_RSVP_PROFESSION_OPTIONS;
}
function formatCheckinTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatCheckinSource(src: string | null | undefined): string {
  if (!src) return '—';
  if (src === 'qr_scan') return 'QR Scan';
  if (src === 'manual') return 'Manual';
  if (src === 'admin') return 'Admin';
  return src;
}

function formatAllDaysLabel(dayCount: number): string {
  const normalized = Number.isFinite(dayCount) && dayCount > 0 ? Math.floor(dayCount) : 0;
  if (normalized <= 0) return 'Multiple days';
  return `${normalized} day${normalized === 1 ? '' : 's'}`;
}

function formatVisitDate(iso: string | null | undefined, visitAllDays = false, dayCount = 0): string {
  if (visitAllDays) return formatAllDaysLabel(dayCount);
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function safeFileName(value: string): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return normalized || 'registration';
}

function eventDayList(start: string | null, end: string | null): string[] {
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
  const [badges, setBadges] = useState<EventBadgeRow[]>([]);
  const [sendingDeliveryId, setSendingDeliveryId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventRsvpRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);

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
      const [eventDetail, rsvpResult, badgesResult] = await Promise.all([
        eventsService.getById(token, id),
        eventsService.getRsvps(token, id, statusFilter === 'all' ? null : statusFilter),
        eventsService.getBadges(token, id),
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
      if (badgesResult.success) {
        setBadges(badgesResult.rows);
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

  // COD-EVENTS-REGISTRATION-COMPLETE-059
  const eventCollectsAadhaar = Boolean(event?.rsvp?.collect_aadhaar);
  const anyRowHasAadhaar = useMemo(
    () => rows.some((r) => Boolean(r.aadhaar_number && r.aadhaar_number.length > 0)),
    [rows],
  );
  const showAadhaar = eventCollectsAadhaar || anyRowHasAadhaar;

  // badgeByRsvpId must be defined before filteredRows so badge_code is available in search
  const badgeByRsvpId = useMemo(() => {
    const m = new Map<string, EventBadgeRow>();
    for (const b of badges) m.set(b.rsvp_id, b);
    return m;
  }, [badges]);

  // COD-EVENTS-REGISTRATION-BADGE-EXPORT-AADHAAR-068 — search now includes badge code
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (visitDateFilter !== 'all') {
        if ((row.visit_date ?? '') !== visitDateFilter) return false;
      }
      if (!q) return true;
      const badgeCode = badgeByRsvpId.get(row.id)?.badge_code ?? '';
      const hay = [
        row.full_name,
        row.email ?? '',
        row.phone ?? '',
        row.company ?? '',
        row.profession ?? '',
        badgeCode,
        row.check_in_source ?? '',
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search, visitDateFilter, badgeByRsvpId]);

  // Event-end gate: download blocked once now > end_at + 12h grace.
  const downloadDeadline = useMemo(() => {
    const ref = event?.end_at ?? event?.start_at ?? null;
    if (!ref) return null;
    const t = new Date(ref).getTime();
    return Number.isNaN(t) ? null : t + 12 * 60 * 60 * 1000;
  }, [event?.end_at, event?.start_at]);
  const eventEnded = downloadDeadline !== null && Date.now() > downloadDeadline;

  const handleSendOrRetry = async (deliveryId: string, currentStatus: EventBadgeDeliveryStatus) => {
    if (!canManage) return;
    const token = sessionManager.getSessionToken();
    if (!token) {
      showToast('error', 'Session expired.');
      return;
    }
    setSendingDeliveryId(deliveryId);
    try {
      // For failed → flip to pending first so the audit trail is visible.
      if (currentStatus === 'failed') {
        await eventsService.retryBadgeDelivery(token, deliveryId);
      }
      const result = await eventsService.sendBadgeDelivery(token, deliveryId);
      if (!result.success) {
        showToast('error', result.error ?? 'Email send failed.');
      } else {
        showToast('success', `Badge emailed to ${result.recipient ?? 'recipient'}.`);
      }
      await load();
    } finally {
      setSendingDeliveryId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !canManage) return;
    const token = sessionManager.getSessionToken();
    if (!token) {
      showToast('error', 'Session expired.');
      return;
    }
    setIsDeleting(true);
    try {
      const result = await eventsService.deleteRsvp(token, deleteTarget.id);
      if (!result.success) {
        showToast('error', result.error ?? 'Failed to delete registration.');
        return;
      }
      showToast('success', `Registration for ${deleteTarget.full_name} deleted.`);
      setDeleteTarget(null);
      await load();
    } finally {
      setIsDeleting(false);
    }
  };

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

  // COD-EVENTS-REGISTRATION-COMPLETE-059 — Excel export of currently filtered rows.
  const handleExport = useCallback(async () => {
    if (!event) {
      showToast('error', 'Event not loaded yet.');
      return;
    }
    if (filteredRows.length === 0) {
      showToast('error', 'No registrations to export with current filters.');
      return;
    }
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const slugBase = (event.slug && event.slug.length > 0 ? event.slug : event.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'event';
    const fileName = `event-registrations-${slugBase}-${yyyy}-${mm}-${dd}.xlsx`;

    // Detect which optional fields are worth exporting:
    // include if event configured OR any row has data.
    const cfg = event.rsvp;
    const has = (key: keyof EventRsvpRow) => filteredRows.some((r) => r[key] != null && String(r[key] ?? '').length > 0);
    const includeEmail = (cfg?.collect_email !== false) || has('email');
    const includeMobile = Boolean(cfg?.collect_phone) || has('phone');
    const includeOrg = Boolean(cfg?.collect_company) || has('company');
    const includeGender = Boolean(cfg?.collect_gender) || has('gender');
    const includeMeal = Boolean(cfg?.collect_meal) || has('meal_preference');
    const includeProfession = Boolean(cfg?.collect_profession) || has('profession');
    const includeDesignation = Boolean(cfg?.collect_designation) || has('designation');
    const includeNote = Boolean(cfg?.collect_note) || has('notes');
    const includeAadhaar = showAadhaar;
    const eventDaysCount = eventDays.length;
    const includeVisit = eventDaysCount > 1 || filteredRows.some((r) => r.visit_date || r.visit_all_days);

    type Col = { key: string; header: string };
    const columns: Col[] = [
      { key: 'id', header: 'Registration ID' },
      { key: 'status', header: 'Status' },
      { key: 'full_name', header: 'Full Name' },
      { key: 'surname', header: 'Surname' },
      { key: 'given_name', header: 'Given Name' },
    ];
    if (includeEmail) columns.push({ key: 'email', header: 'Email' });
    if (includeMobile) columns.push({ key: 'phone', header: 'Mobile' });
    if (includeOrg) columns.push({ key: 'company', header: 'Company / Organization' });
    if (includeVisit) {
      columns.push({ key: 'visit_date', header: 'Visit Day' });
      columns.push({ key: 'visit_span', header: 'Visit Span' });
    }
    if (includeGender) columns.push({ key: 'gender', header: 'Gender' });
    if (includeMeal) columns.push({ key: 'meal_preference', header: 'Meal Preference' });
    if (includeProfession) columns.push({ key: 'profession', header: 'Profession' });
    if (includeDesignation) columns.push({ key: 'designation', header: 'Designation' });
    if (includeNote) columns.push({ key: 'notes', header: 'Note' });
    if (includeAadhaar) columns.push({ key: 'aadhaar_number', header: 'Aadhaar Card' });
    columns.push({ key: 'badge_code', header: 'Badge No.' });
    columns.push({ key: 'checked_in', header: 'Checked In' });
    columns.push({ key: 'checked_in_at', header: 'Checked In At' });
    columns.push({ key: 'check_in_source', header: 'Check-in Source' });
    columns.push({ key: 'created_at', header: 'Created At' });
    columns.push({ key: 'updated_at', header: 'Updated At' });

    const rowsOut: Array<Record<string, string>> = filteredRows.map((r) => {
      const out: Record<string, string> = {
        id: r.id,
        status: r.status,
        full_name: r.full_name ?? '',
        surname: r.surname ?? '',
        given_name: r.given_name ?? '',
      };
      if (includeEmail) out.email = r.email ?? '';
      if (includeMobile) out.phone = r.phone ?? '';
      if (includeOrg) out.company = r.company ?? '';
      if (includeVisit) {
        out.visit_date = formatVisitDate(r.visit_date ?? null, Boolean(r.visit_all_days), eventDaysCount).replace(/^—$/, '');
        out.visit_span = r.visit_all_days ? formatAllDaysLabel(eventDaysCount) : '';
      }
      if (includeGender) {
        out.gender = labelFrom<EventRsvpGender>(r.gender ?? null, EVENT_RSVP_GENDER_OPTIONS).replace(/^—$/, '');
      }
      if (includeMeal) {
        out.meal_preference = labelFrom<EventRsvpMealPreference>(r.meal_preference ?? null, EVENT_RSVP_MEAL_OPTIONS).replace(/^—$/, '');
      }
      if (includeProfession) {
        out.profession = labelFrom<EventRsvpProfession>(r.profession ?? null, professionOptionsForEvent(event)).replace(/^—$/, '');
      }
      if (includeDesignation) out.designation = r.designation ?? '';
      if (includeNote) out.notes = r.notes ?? '';
      if (includeAadhaar) out.aadhaar_number = r.aadhaar_number ?? '';
      out.badge_code = badgeByRsvpId.get(r.id)?.badge_code ?? '';
      out.checked_in = r.checked_in_at ? 'Yes' : 'No';
      out.checked_in_at = r.checked_in_at ? formatCheckinTime(r.checked_in_at) : '';
      out.check_in_source = formatCheckinSource(r.check_in_source).replace(/^—$/, '');
      out.created_at = r.created_at ?? '';
      out.updated_at = r.updated_at ?? '';
      return out;
    });

    try {
      await downloadSingleSheetXlsx({
        fileName,
        sheetName: 'Registrations',
        columns,
        rows: rowsOut,
      });
      showToast('success', `Exported ${rowsOut.length} registration${rowsOut.length === 1 ? '' : 's'}.`);
    } catch {
      showToast('error', 'Failed to generate Excel file.');
    }
  }, [event, filteredRows, eventDays.length, showAadhaar, showToast, badgeByRsvpId]);

  const handleBulkDownloadBadgesZip = useCallback(async () => {
    if (eventEnded) {
      showToast('error', 'Badge downloads are closed for this event.');
      return;
    }
    const targets = filteredRows
      .map((row) => ({ row, badge: badgeByRsvpId.get(row.id) }))
      .filter((entry): entry is { row: EventRsvpRow; badge: EventBadgeRow } => Boolean(entry.badge));
    if (targets.length === 0) {
      showToast('error', 'No badges available in the current filtered list.');
      return;
    }

    setIsBulkDownloading(true);
    setBulkProgress({ done: 0, total: targets.length });
    try {
      const zip = new JSZip();
      const folder = zip.folder('badges');
      let added = 0;
      const failedCodes: string[] = [];

      for (let i = 0; i < targets.length; i += 1) {
        const { row, badge } = targets[i];
        try {
          const endpoint = eventsService.badgeDownloadUrlByCode(badge.badge_code);
          const response = await fetch(endpoint, {
            headers: { Accept: 'application/pdf' },
          });
          if (!response.ok) {
            failedCodes.push(badge.badge_code);
            setBulkProgress({ done: i + 1, total: targets.length });
            continue;
          }
          const pdfBlob = await response.blob();
          const pdfBytes = await pdfBlob.arrayBuffer();
          const jpgBlob = await renderPdfFirstPageAsJpegBlob(pdfBytes);
          const order = String(i + 1).padStart(4, '0');
          const name = safeFileName(row.full_name ?? 'registration');
          const fileName = `${order}-${name}-${badge.badge_code}.jpg`;
          folder?.file(fileName, jpgBlob);
          added += 1;
        } catch {
          failedCodes.push(badge.badge_code);
        } finally {
          setBulkProgress({ done: i + 1, total: targets.length });
        }
      }

      if (added === 0) {
        showToast('error', 'Could not generate JPG badges for this selection.');
        return;
      }

      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const slugBase = (event?.slug && event.slug.length > 0 ? event.slug : event?.title ?? 'event')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'event';
      const zipName = `event-badges-jpg-${slugBase}-${yyyy}-${mm}-${dd}.zip`;
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      const url = URL.createObjectURL(zipBlob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = zipName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);

      if (failedCodes.length > 0) {
        showToast('success', `Downloaded ${added}/${targets.length} badges. ${failedCodes.length} failed.`);
      } else {
        showToast('success', `Downloaded ${added} badge JPG${added === 1 ? '' : 's'} as ZIP.`);
      }
    } catch {
      showToast('error', 'Failed to generate badge ZIP.');
    } finally {
      setIsBulkDownloading(false);
      setBulkProgress(null);
    }
  }, [badgeByRsvpId, event, eventEnded, filteredRows, showToast]);

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
              {id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/admin/content/events/${id}/checkin`)}
                  title="Open badge check-in / attendance scanner"
                >
                  <QrCode className="h-3.5 w-3.5 mr-1.5" />
                  Check-in
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleExport()}
                disabled={isLoading || filteredRows.length === 0}
                title="Export currently filtered registrations to Excel"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export ({filteredRows.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleBulkDownloadBadgesZip()}
                disabled={isLoading || filteredRows.length === 0 || eventEnded || isBulkDownloading}
                title={eventEnded ? 'Badge downloads are closed for this event' : 'Bulk download badge JPGs (current filters) as ZIP'}
              >
                {isBulkDownloading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                )}
                {isBulkDownloading && bulkProgress
                  ? `Badges ZIP (${bulkProgress.done}/${bulkProgress.total})`
                  : `Badges ZIP (${filteredRows.length})`}
              </Button>
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
              placeholder="Search name, email, mobile, org, badge no."
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
              <option value="all">All visit dates</option>
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
                  <th className="px-3 py-2 font-medium">Mobile</th>
                  <th className="px-3 py-2 font-medium">Company / Organization</th>
                  <th className="px-3 py-2 font-medium">Day of Visit</th>
                  <th className="px-3 py-2 font-medium">Gender</th>
                  <th className="px-3 py-2 font-medium">Meal</th>
                  <th className="px-3 py-2 font-medium">Profession</th>
                  <th className="px-3 py-2 font-medium">Designation</th>
                  {showAadhaar && <th className="px-3 py-2 font-medium">Aadhaar Card</th>}
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Checked In</th>
                  <th className="px-3 py-2 font-medium">Checked In At</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Badge No.</th>
                  <th className="px-3 py-2 font-medium">Badge</th>
                  <th className="px-3 py-2 font-medium">Email delivery</th>
                  {canManage && <th className="px-3 py-2 font-medium text-right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id} className="border-b border-border/70 last:border-0 align-top">
                    <td className="px-3 py-2 text-foreground">{row.full_name}</td>
                    <td className="px-3 py-2 text-muted-foreground break-all">{row.email ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.phone ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">{row.company ?? '—'}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {formatVisitDate(row.visit_date ?? null, Boolean(row.visit_all_days), eventDays.length)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {labelFrom<EventRsvpGender>(row.gender ?? null, EVENT_RSVP_GENDER_OPTIONS)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {labelFrom<EventRsvpMealPreference>(row.meal_preference ?? null, EVENT_RSVP_MEAL_OPTIONS)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {labelFrom<EventRsvpProfession>(row.profession ?? null, professionOptionsForEvent(event))}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.designation ?? '—'}</td>
                    {showAadhaar && (
                      <td className="px-3 py-2 text-muted-foreground font-mono text-xs">
                        {row.aadhaar_number ?? '-'}
                      </td>
                    )}
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
                    <td className="px-3 py-2">
                      {row.checked_in_at ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 dark:bg-green-900/30 dark:text-green-300">
                          <CheckCircle2 className="h-3 w-3" />
                          Yes
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {row.checked_in_at ? formatCheckinTime(row.checked_in_at) : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {formatCheckinSource(row.check_in_source)}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {badgeByRsvpId.get(row.id)?.badge_code ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      {(() => {
                        const badge = badgeByRsvpId.get(row.id);
                        if (!badge) return <span className="text-xs text-muted-foreground">—</span>;
                        if (eventEnded) {
                          return (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              {badge.badge_code} · expired
                            </span>
                          );
                        }
                        return (
                          <a
                            href={eventsService.badgeDownloadUrlByCode(badge.badge_code)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted/50"
                          >
                            <Download className="h-3 w-3" />
                            {badge.badge_code}
                          </a>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2">
                      {(() => {
                        const badge = badgeByRsvpId.get(row.id);
                        const delivery = badge?.latest_delivery;
                        if (!delivery) return <span className="text-xs text-muted-foreground">—</span>;
                        const cls = delivery.status === 'sent'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : delivery.status === 'failed'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-muted text-muted-foreground';
                        return (
                          <div className="flex flex-col gap-1">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls} w-fit`}>
                              <Mail className="h-3 w-3" />
                              {delivery.status}
                              {delivery.attempts > 0 ? ` (×${delivery.attempts})` : ''}
                            </span>
                            {delivery.last_error && delivery.status === 'failed' && (
                              <span className="text-[10px] text-destructive truncate max-w-[180px]" title={delivery.last_error}>
                                {delivery.last_error}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    {canManage && (
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {(() => {
                            const badge = badgeByRsvpId.get(row.id);
                            const delivery = badge?.latest_delivery;
                            if (!delivery) return null;
                            const isPending = delivery.status === 'pending' || delivery.status === 'failed';
                            if (!isPending) return null;
                            const sending = sendingDeliveryId === delivery.id;
                            return (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void handleSendOrRetry(delivery.id, delivery.status)}
                                disabled={sending || eventEnded}
                              >
                                {sending ? (
                                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                ) : (
                                  <Send className="h-3.5 w-3.5 mr-1.5" />
                                )}
                                {delivery.status === 'failed' ? 'Retry' : 'Send'}
                              </Button>
                            );
                          })()}
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
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(row)}
                            aria-label={`Delete registration for ${row.full_name}`}
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Delete confirm modal (050) */}
        {deleteTarget && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
            onClick={() => !isDeleting && setDeleteTarget(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground inline-flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-destructive" />
                  Delete this registration?
                </h3>
                <button
                  type="button"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted/50"
                  onClick={() => !isDeleting && setDeleteTarget(null)}
                  aria-label="Close"
                  disabled={isDeleting}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 text-sm text-foreground">
                <strong>{deleteTarget.full_name}</strong>
                {event ? <> for <strong>{event.title}</strong></> : null}.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                This will permanently remove the registration and (via FK cascade) the associated badge and any email
                delivery records. This cannot be undone.
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
                  Cancel
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={() => void confirmDelete()} disabled={isDeleting}>
                  {isDeleting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                  Delete registration
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PermissionGate>
  );
};

export default AdminEventRegistrations;





