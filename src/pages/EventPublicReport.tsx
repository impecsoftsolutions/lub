import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertCircle,
  CalendarDays,
  Download,
  FileArchive,
  Loader2,
  Lock,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  eventsService,
  type EventPublicReportField,
  type EventPublicReportFieldKey,
  type EventPublicReportSummary,
} from '../lib/supabase';
import {
  badgeResponseToJpegBlob,
  normalizeEventBadgeCode,
  triggerBlobDownload,
} from '../lib/eventBadgeDownload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SortableTableHeader } from '@/components/ui/sortable-table-header';

const IST_TIME_ZONE = 'Asia/Kolkata';
const PAGE_SIZE_OPTIONS: Array<{ value: 25 | 50 | 100 | null; label: string }> = [
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: null, label: 'All' },
];
const DEFAULT_PAGE_SIZE: 25 | 50 | 100 | null = 50;
const ALL_ROWS_CAP = 10000;
const SESSION_KEY_PREFIX = 'lub:event_report_view:';
/** Mirrors the renderer's availability window: COALESCE(end_at, start_at) + 12 hours. */
const BADGE_WINDOW_MS = 12 * 60 * 60 * 1000;
const BADGE_CONCURRENCY = 3;
const BADGE_CLOSED_NOTICE = 'Badge downloads are closed for this event.';
/** Said whenever badge_code leaves the admin allowlist while the viewer is here. */
const BADGE_ALLOWLIST_REMOVED_NOTICE =
  'The organiser changed this report while you were viewing it. Badge downloads are no longer ' +
  'available for this report.';
/** Appended to the completion notice; the save link itself stays outside the live region. */
const BADGE_SAVE_HINT = "Use the Save badge ZIP link below, or look for it in your browser's downloads.";
/** setTimeout overflows past ~24.8 days, so a far-off deadline is waited for in chunks. */
const BADGE_DEADLINE_TIMER_CHUNK_MS = 24 * 60 * 60 * 1000;

type PageSize = 25 | 50 | 100 | null;
type SortDirection = 'asc' | 'desc';

/** Null means "server default order" (created_at, id) - the report opens unsorted. */
interface SortState {
  key: EventPublicReportFieldKey;
  direction: SortDirection;
}

interface ReportEventInfo {
  title: string;
  location: string | null;
  startAt: string | null;
  endAt: string | null;
}

interface StoredAccess {
  viewToken: string;
  expiresAt: string;
  event: ReportEventInfo;
  fields: EventPublicReportField[];
  total: number;
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function formatIstDateTime(value: string, withTime: boolean): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit', hour12: true } : {}),
  }).format(parsed);
}

function formatIstTimeOnly(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(parsed);
}

function istCalendarDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}

/** Event window rendered in India time, because the schema carries no per-event timezone. */
function formatEventWindow(startAt: string | null, endAt: string | null): string {
  if (!startAt && !endAt) return '';
  if (!startAt) return `Until ${formatIstDateTime(endAt as string, true)} IST`;
  const start = formatIstDateTime(startAt, true);
  if (!endAt) return `${start} IST`;
  return istCalendarDate(startAt) === istCalendarDate(endAt)
    ? `${start} - ${formatIstTimeOnly(endAt)} IST`
    : `${start} IST - ${formatIstDateTime(endAt, true)} IST`;
}

function formatIsoDateForDisplay(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function humanizeToken(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const HUMANIZED_KEYS: ReadonlySet<string> = new Set(['gender', 'meal_preference', 'profession']);

/** Normalized cell text shared by the table and the CSV export. */
function cellText(key: string, raw: string | null | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  if (HUMANIZED_KEYS.has(key)) return humanizeToken(value);
  if (key === 'visit_date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatIsoDateForDisplay(value);
  return value;
}

/** Summary buckets reuse the table's humanizing; a null bucket is a real answer group. */
function summaryValueLabel(key: string, value: string | null): string {
  return cellText(key, value) || 'Not specified';
}

// ── CSV helpers ─────────────────────────────────────────────────────────────

/** RFC 4180 escaping plus a spreadsheet formula-injection guard. */
function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /["\r\n,]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

function buildCsv(fields: EventPublicReportField[], rows: Array<Record<string, string | null>>): string {
  const lines = [fields.map((field) => csvCell(field.label)).join(',')];
  for (const row of rows) {
    lines.push(fields.map((field) => csvCell(cellText(field.key, row[field.key]))).join(','));
  }
  // Leading BOM keeps Excel in UTF-8; CRLF line breaks per RFC 4180.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

function csvFileName(title: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'event';
  return `${base}-registrations-${istCalendarDate(new Date().toISOString())}.csv`;
}

function triggerCsvDownload(fileName: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ── Badge helpers ───────────────────────────────────────────────────────────

type BadgeFetchOutcome =
  | { kind: 'ok'; blob: Blob }
  | { kind: 'closed' }
  | { kind: 'failed' };

/**
 * One badge render. Retries exactly once, and only for a network exception or a
 * 5xx: a 4xx is a permanent answer and a 410 means the renderer closed the
 * window, which the caller handles as a stop condition.
 */
async function fetchBadgeJpeg(code: string): Promise<BadgeFetchOutcome> {
  const endpoint = eventsService.badgeDownloadUrlByCode(code);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(endpoint);
    } catch {
      if (attempt === 0) continue;
      return { kind: 'failed' };
    }
    if (response.status === 410) return { kind: 'closed' };
    if (response.ok) {
      try {
        return { kind: 'ok', blob: await badgeResponseToJpegBlob(response) };
      } catch {
        // A delivered-but-unconvertible badge is not a transport failure.
        return { kind: 'failed' };
      }
    }
    if (response.status >= 500 && attempt === 0) continue;
    return { kind: 'failed' };
  }
  return { kind: 'failed' };
}

function badgeZipFileName(title: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'event';
  return `event-badges-${base}-${istCalendarDate(new Date().toISOString())}.zip`;
}

/** A generated ZIP the viewer can still save. The URL outlives the automatic attempt. */
interface ReadyBadgeZip {
  url: string;
  fileName: string;
}

/**
 * Best-effort automatic save of an object URL the caller owns. Deliberately does
 * not revoke: a bulk ZIP is created long after the click that started it, and
 * Chrome can decline that late synthetic download. The retained URL is what the
 * explicit save link then hands to the browser from a fresh user gesture.
 */
function attemptObjectUrlSave(objectUrl: string, fileName: string) {
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

// ── Session storage helpers ─────────────────────────────────────────────────

function readStoredAccess(token: string): StoredAccess | null {
  try {
    const raw = sessionStorage.getItem(`${SESSION_KEY_PREFIX}${token}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAccess;
    if (!parsed?.viewToken || !parsed.expiresAt) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredAccess(token: string, access: StoredAccess) {
  try {
    sessionStorage.setItem(`${SESSION_KEY_PREFIX}${token}`, JSON.stringify(access));
  } catch {
    // Storage is a convenience only; the in-memory session still works.
  }
}

function clearStoredAccess(token: string) {
  try {
    sessionStorage.removeItem(`${SESSION_KEY_PREFIX}${token}`);
  } catch {
    // Ignore storage errors.
  }
}

// ── Component ───────────────────────────────────────────────────────────────

interface EventPublicReportProps {
  token?: string;
}

const EventPublicReport: React.FC<EventPublicReportProps> = ({ token: tokenProp }) => {
  const params = useParams<{ code?: string; token?: string }>();
  const token = (tokenProp ?? params.token ?? params.code ?? '').trim().toLowerCase();

  // Gate state. The password never leaves component memory and is cleared on success.
  const [password, setPassword] = useState('');
  const [opening, setOpening] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  // Access state.
  const [viewToken, setViewToken] = useState<string | null>(null);
  const [eventInfo, setEventInfo] = useState<ReportEventInfo | null>(null);
  const [fields, setFields] = useState<EventPublicReportField[]>([]);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  // Rows state.
  const [rows, setRows] = useState<Array<Record<string, string | null>>>([]);
  // Server-authorized aggregates. Independent of hiddenKeys - hiding a column
  // is a view preference and must not remove its summary.
  const [summaries, setSummaries] = useState<EventPublicReportSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<SortState | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const [downloading, setDownloading] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [showFieldPanel, setShowFieldPanel] = useState(false);

  // Badge download state. Kept separate from the CSV notice so the two actions
  // never overwrite each other's messages.
  const [badgeNotice, setBadgeNotice] = useState<string | null>(null);
  const [badgeBusyCodes, setBadgeBusyCodes] = useState<Set<string>>(new Set());
  const [badgeBulkBusy, setBadgeBulkBusy] = useState(false);
  const [badgeProgress, setBadgeProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  // The renderer is the source of truth; a 410 closes the window even if the
  // browser's own deadline has not been reached.
  const [badgeServerClosed, setBadgeServerClosed] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // The last completed bulk ZIP, kept alive so the viewer can save it explicitly
  // when the browser declines the automatic attempt. The ref owns the object URL
  // so release never depends on a render; the state only mirrors it for display.
  const [readyZip, setReadyZip] = useState<ReadyBadgeZip | null>(null);
  const readyZipRef = useRef<ReadyBadgeZip | null>(null);
  const readyZipUnmountTimerRef = useRef(0);
  // Monotonic, owned by the same lifecycle as readyZip: every release bumps it,
  // so a bulk run that started before an invalidation can recognise that its
  // result is no longer the one this page is entitled to hold.
  const badgeRunGenerationRef = useRef(0);

  const fieldPanelRef = useRef<HTMLDivElement | null>(null);

  // The single release path. Idempotent: clearing the ref first means a second
  // call, a call for a run that never produced a ZIP, and a call after unmount
  // are all no-ops rather than a double revoke. Bumping the generation here -
  // synchronously, before any state update lands - is what makes every caller
  // (reset, access change, new run, allowlist removal, window closure) an
  // invalidation for whatever run is still in flight.
  const releaseReadyZip = useCallback(() => {
    badgeRunGenerationRef.current += 1;
    const current = readyZipRef.current;
    readyZipRef.current = null;
    if (current) URL.revokeObjectURL(current.url);
    setReadyZip(null);
  }, []);

  const visibleFields = useMemo(
    () => fields.filter((field) => !hiddenKeys.has(field.key)),
    [fields, hiddenKeys],
  );

  // Badge actions exist only while badge_code is inside the admin allowlist.
  // Viewer column hiding narrows the table, not this authorization boundary.
  const badgeDownloadsAllowed = useMemo(
    () => fields.some((field) => field.key === 'badge_code'),
    [fields],
  );

  const badgeDeadlineMs = useMemo(() => {
    const base = eventInfo?.endAt ?? eventInfo?.startAt ?? null;
    if (!base) return null;
    const parsed = new Date(base).getTime();
    return Number.isNaN(parsed) ? null : parsed + BADGE_WINDOW_MS;
  }, [eventInfo?.endAt, eventInfo?.startAt]);

  const badgeWindowClosed =
    badgeServerClosed || (badgeDeadlineMs !== null && nowMs > badgeDeadlineMs);

  // The current authorization facts, readable from an async run that began many
  // renders ago. Written during render so a completing run sees what the page is
  // actually showing rather than the values it closed over at the click.
  const authorizationRef = useRef<{
    viewToken: string | null;
    badgeDownloadsAllowed: boolean;
    badgeWindowClosed: boolean;
    badgeDeadlineMs: number | null;
  }>({
    viewToken: null,
    badgeDownloadsAllowed: false,
    badgeWindowClosed: false,
    badgeDeadlineMs: null,
  });
  authorizationRef.current = { viewToken, badgeDownloadsAllowed, badgeWindowClosed, badgeDeadlineMs };

  const allFieldKeys = useMemo(
    () => fields.map((field) => field.key as EventPublicReportFieldKey),
    [fields],
  );

  const resetToGate = useCallback(
    (message: string) => {
      clearStoredAccess(token);
      releaseReadyZip();
      setViewToken(null);
      setEventInfo(null);
      setFields([]);
      setHiddenKeys(new Set());
      setRows([]);
      setSummaries([]);
      setTotal(0);
      setOffset(0);
      setSort(null);
      setTruncated(false);
      setRowsError(null);
      setDownloadNotice(null);
      setBadgeNotice(null);
      setBadgeBusyCodes(new Set());
      setBadgeProgress({ done: 0, total: 0 });
      setBadgeServerClosed(false);
      setGateError(message);
    },
    [token, releaseReadyZip],
  );

  const applyAccess = useCallback((access: StoredAccess) => {
    releaseReadyZip();
    setViewToken(access.viewToken);
    setEventInfo(access.event);
    setFields(access.fields);
    setHiddenKeys(new Set());
    setTotal(access.total);
    setOffset(0);
    setSort(null);
    setBadgeNotice(null);
    setBadgeServerClosed(false);
    setBadgeProgress({ done: 0, total: 0 });
  }, [releaseReadyZip]);

  // Restore a same-tab session so a reload does not force the password again.
  useEffect(() => {
    if (!token) return;
    const stored = readStoredAccess(token);
    if (stored) applyAccess(stored);
  }, [token, applyAccess]);

  // Close the field panel on outside click.
  useEffect(() => {
    if (!showFieldPanel) return;
    const handler = (event: MouseEvent) => {
      if (fieldPanelRef.current && !fieldPanelRef.current.contains(event.target as Node)) {
        setShowFieldPanel(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFieldPanel]);

  // Close the badge window in place, without needing a reload, when the
  // 12-hour deadline passes while the report is open. One wake-up at the
  // boundary - polling here would re-render the whole table every tick.
  useEffect(() => {
    if (!viewToken || badgeDeadlineMs === null) return;
    let timer = 0;
    if (Date.now() > badgeDeadlineMs) {
      // The deadline can pass while the viewer is still at the password gate,
      // and `nowMs` was captured when the gate mounted. Skipping the update
      // here would leave that stale clock in place and the window would read as
      // open. The functional update returns the same value once `nowMs` is
      // already past the deadline, so React bails out and this cannot loop.
      setNowMs((current) => (current > badgeDeadlineMs ? current : Date.now()));
    } else {
      const arm = () => {
        // +1ms so the wake-up lands strictly past the deadline, matching the
        // `nowMs > badgeDeadlineMs` comparison below.
        const remaining = badgeDeadlineMs - Date.now() + 1;
        if (remaining <= 0) {
          setNowMs(Date.now());
          return;
        }
        timer = window.setTimeout(arm, Math.min(remaining, BADGE_DEADLINE_TIMER_CHUNK_MS));
      };
      arm();
    }
    return () => window.clearTimeout(timer);
  }, [viewToken, badgeDeadlineMs]);

  // A held ZIP is only offered while the viewer is still authorized to have it:
  // the organiser removing badge_code from the allowlist, or the 12-hour window
  // shutting, both end that authorization and drop the file.
  useEffect(() => {
    if (!badgeDownloadsAllowed || badgeWindowClosed) releaseReadyZip();
  }, [badgeDownloadsAllowed, badgeWindowClosed, releaseReadyZip]);

  // Release on a real unmount only. StrictMode mounts, unmounts and remounts in
  // development while keeping state, so revoking synchronously in the cleanup
  // would kill a ZIP the page still shows. Deferring by a task lets the remount
  // cancel it; a genuine unmount never re-runs this effect, so the release lands.
  useEffect(() => {
    window.clearTimeout(readyZipUnmountTimerRef.current);
    return () => {
      readyZipUnmountTimerRef.current = window.setTimeout(releaseReadyZip, 0);
    };
  }, [releaseReadyZip]);

  const fetchRows = useCallback(
    async (
      activeViewToken: string,
      keys: EventPublicReportFieldKey[],
      limit: PageSize,
      nextOffset: number,
      activeSort: SortState | null,
    ) => {
      if (keys.length === 0) return;
      setRowsLoading(true);
      setRowsError(null);
      try {
        const result = await eventsService.getPublicReportRows(activeViewToken, {
          fieldKeys: keys,
          limit,
          offset: nextOffset,
          sortKey: activeSort?.key ?? null,
          sortDirection: activeSort?.direction ?? 'asc',
        });

        if (!result.success) {
          if (result.errorCode === 'fields_changed' && result.data?.fields?.length) {
            // Admin changed the allowlist mid-session. Resyncing state changes the
            // field keys the fetch effect depends on, which refetches on its own.
            const nextFields = result.data.fields;
            setFields(nextFields);
            setHiddenKeys(new Set());
            setOffset(0);
            // A sort on a column that no longer exists would fail the refetch.
            setSort((current) =>
              current && !nextFields.some((field) => field.key === current.key) ? null : current,
            );
            return;
          }
          if (result.errorCode === 'invalid_sort_key' || result.errorCode === 'invalid_sort_direction') {
            // Retry unsorted exactly once. Guarding on the sort this request actually
            // carried means an unsorted request that still fails surfaces the error
            // instead of clearing state again and looping.
            if (activeSort) {
              setSort(null);
              setOffset(0);
              return;
            }
            setRowsError(result.error ?? 'Could not sort registrations.');
            return;
          }
          if (result.errorCode === 'view_session_invalid') {
            resetToGate('Your report session expired. Enter the password again to continue.');
            return;
          }
          if (result.errorCode === 'report_disabled') {
            resetToGate('This report link is no longer active. Please contact the event organiser.');
            return;
          }
          setRowsError(result.error ?? 'Could not load registrations.');
          return;
        }

        setRows(result.data?.rows ?? []);
        setSummaries(result.data?.summaries ?? []);
        setTotal(result.data?.total ?? 0);
        setTruncated(Boolean(result.data?.truncated));
        if (result.data?.fields?.length) setFields(result.data.fields);
      } catch {
        setRowsError('Could not load registrations. Check your connection and try again.');
      } finally {
        setRowsLoading(false);
      }
    },
    [resetToGate],
  );

  // Normal fetches always request the full admin allowlist; hiding is client-side.
  useEffect(() => {
    if (!viewToken || allFieldKeys.length === 0) return;
    void fetchRows(viewToken, allFieldKeys, pageSize, offset, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewToken, pageSize, offset, allFieldKeys.join('|'), sort?.key, sort?.direction]);

  const handleOpen = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    if (!token) {
      setGateError('This report link is not valid.');
      return;
    }
    if (!password) {
      setGateError('Enter the report password.');
      return;
    }

    setOpening(true);
    setGateError(null);
    try {
      const result = await eventsService.openPublicReport(token, password);
      if (!result.success || !result.data) {
        if (result.errorCode === 'report_disabled') {
          setGateError('This report link is not currently active. Please contact the event organiser.');
        } else if (result.errorCode === 'temporarily_locked') {
          setGateError(result.error ?? 'Too many incorrect attempts. Try again in a few minutes.');
        } else {
          setGateError('Incorrect password, or this report link is no longer valid.');
        }
        return;
      }

      const access: StoredAccess = {
        viewToken: result.data.viewToken,
        expiresAt: result.data.expiresAt,
        event: result.data.event,
        fields: result.data.fields,
        total: result.data.total,
      };
      writeStoredAccess(token, access);
      applyAccess(access);
      setPassword('');
    } catch {
      setGateError('Could not open this report. Check your connection and try again.');
    } finally {
      setOpening(false);
    }
  };

  // First click on a column sorts ascending; clicking the same column flips direction.
  const handleSort = (key: EventPublicReportFieldKey) => {
    setOffset(0);
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  };

  const handleToggleField = (key: string) => {
    const isHidden = hiddenKeys.has(key);
    // Never allow the last visible column to be hidden.
    if (!isHidden && visibleFields.length <= 1) return;

    setHiddenKeys((previous) => {
      const next = new Set(previous);
      if (isHidden) next.delete(key);
      else next.add(key);
      return next;
    });

    // The CSV download only requests visible columns, so a hidden column cannot
    // remain the sort key without the server rejecting the export.
    if (!isHidden && sort?.key === key) {
      setSort(null);
      setOffset(0);
    }
  };

  const handleDownload = async () => {
    if (!viewToken || visibleFields.length === 0) return;
    setDownloading(true);
    setDownloadNotice(null);
    try {
      const fieldKeys = visibleFields.map((field) => field.key as EventPublicReportFieldKey);
      let result = await eventsService.getPublicReportRows(viewToken, {
        fieldKeys,
        limit: null,
        offset: 0,
        sortKey: sort?.key ?? null,
        sortDirection: sort?.direction ?? 'asc',
      });

      // A rejected sort must not block the export: drop it and retry once, unsorted.
      if (
        !result.success &&
        sort &&
        (result.errorCode === 'invalid_sort_key' || result.errorCode === 'invalid_sort_direction')
      ) {
        setSort(null);
        setOffset(0);
        result = await eventsService.getPublicReportRows(viewToken, {
          fieldKeys,
          limit: null,
          offset: 0,
          sortKey: null,
          sortDirection: 'asc',
        });
      }

      if (!result.success) {
        if (result.errorCode === 'view_session_invalid') {
          resetToGate('Your report session expired. Enter the password again to continue.');
          return;
        }
        if (result.errorCode === 'report_disabled') {
          resetToGate('This report link is no longer active. Please contact the event organiser.');
          return;
        }
        setDownloadNotice(result.error ?? 'Could not prepare the download.');
        return;
      }

      if (result.data?.truncated) {
        setDownloadNotice(
          `This report has ${result.data.total.toLocaleString('en-IN')} registrations, which is above the ` +
            `${ALL_ROWS_CAP.toLocaleString('en-IN')} row download limit. No file was created, because it would ` +
            'have been incomplete. Please ask the event organiser for a full export.',
        );
        return;
      }

      const downloadFields = result.data?.fields?.length ? result.data.fields : visibleFields;
      triggerCsvDownload(
        csvFileName(eventInfo?.title ?? 'event'),
        buildCsv(downloadFields, result.data?.rows ?? []),
      );
    } catch {
      setDownloadNotice('Could not prepare the download. Check your connection and try again.');
    } finally {
      setDownloading(false);
    }
  };

  const handleBadgeDownload = async (
    clickEvent: React.MouseEvent<HTMLAnchorElement>,
    rawCode: string | null | undefined,
  ) => {
    clickEvent.preventDefault();
    if (!badgeDownloadsAllowed || badgeWindowClosed) return;
    const code = normalizeEventBadgeCode(rawCode);
    if (!code) {
      setBadgeNotice('That badge number cannot be used for a download.');
      return;
    }
    if (badgeBusyCodes.has(code)) return;

    setBadgeNotice(null);
    setBadgeBusyCodes((previous) => new Set(previous).add(code));
    try {
      const outcome = await fetchBadgeJpeg(code);
      if (outcome.kind === 'closed') {
        setBadgeServerClosed(true);
        setBadgeNotice(BADGE_CLOSED_NOTICE);
        return;
      }
      if (outcome.kind === 'failed') {
        setBadgeNotice(`Badge ${code} could not be downloaded. Please try again.`);
        return;
      }
      triggerBlobDownload(outcome.blob, `event-badge-${code}.jpg`);
    } finally {
      setBadgeBusyCodes((previous) => {
        const next = new Set(previous);
        next.delete(code);
        return next;
      });
    }
  };

  const handleBulkBadgeDownload = async () => {
    if (!viewToken || !badgeDownloadsAllowed || badgeWindowClosed || badgeBulkBusy) return;
    setBadgeBulkBusy(true);
    setBadgeNotice(null);
    setBadgeProgress({ done: 0, total: 0 });
    // A new run replaces any held ZIP up front, so a stale file is never offered
    // beside the progress of the run that is about to supersede it. The
    // generation is captured immediately after, so it belongs to this run alone.
    releaseReadyZip();
    const runGeneration = badgeRunGenerationRef.current;
    const runViewToken = viewToken;
    try {
      // Badge enumeration is its own request: only badge_code, every row, and a
      // stable badge-code order so ZIP entry numbering is reproducible.
      const result = await eventsService.getPublicReportRows(viewToken, {
        fieldKeys: ['badge_code'],
        limit: null,
        offset: 0,
        sortKey: 'badge_code',
        sortDirection: 'asc',
      });

      if (!result.success) {
        if (result.errorCode === 'view_session_invalid') {
          resetToGate('Your report session expired. Enter the password again to continue.');
          return;
        }
        if (result.errorCode === 'report_disabled') {
          resetToGate('This report link is no longer active. Please contact the event organiser.');
          return;
        }
        if (result.errorCode === 'fields_changed' && result.data?.fields?.length) {
          // Resync exactly like a normal fetch does, then say plainly that this
          // request produced nothing.
          const nextFields = result.data.fields;
          setFields(nextFields);
          setHiddenKeys(new Set());
          setOffset(0);
          setSort((current) =>
            current && !nextFields.some((field) => field.key === current.key) ? null : current,
          );
          setBadgeNotice(
            nextFields.some((field) => field.key === 'badge_code')
              ? 'The organiser changed this report while you were viewing it, so no badges were downloaded. ' +
                  'The columns have been refreshed - please start the badge download again.'
              : BADGE_ALLOWLIST_REMOVED_NOTICE,
          );
          return;
        }
        setBadgeNotice(result.error ?? 'Could not prepare the badge downloads.');
        return;
      }

      if (result.data?.truncated) {
        setBadgeNotice(
          `This report has ${(result.data.total ?? 0).toLocaleString('en-IN')} registrations, which is above the ` +
            `${ALL_ROWS_CAP.toLocaleString('en-IN')} row limit for this action. No ZIP file was created, because ` +
            'it could not have contained every badge. Please ask the event organiser for the full badge set.',
        );
        return;
      }

      const codes: string[] = [];
      const seen = new Set<string>();
      for (const row of result.data?.rows ?? []) {
        const code = normalizeEventBadgeCode(row.badge_code);
        if (!code || seen.has(code)) continue;
        seen.add(code);
        codes.push(code);
      }

      if (codes.length === 0) {
        setBadgeNotice('There are no badge numbers to download for this event yet.');
        return;
      }

      setBadgeProgress({ done: 0, total: codes.length });
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const folder = zip.folder('badges');

      const blobs = new Array<Blob | null>(codes.length).fill(null);
      let cursor = 0;
      let done = 0;
      let succeeded = 0;
      let closed = false;

      const worker = async () => {
        for (;;) {
          if (closed) return;
          const index = cursor;
          cursor += 1;
          if (index >= codes.length) return;
          const outcome = await fetchBadgeJpeg(codes[index]);
          if (outcome.kind === 'closed') {
            // Stop issuing new work; in-flight workers finish on their own.
            closed = true;
            return;
          }
          if (outcome.kind === 'ok') {
            blobs[index] = outcome.blob;
            succeeded += 1;
          }
          done += 1;
          setBadgeProgress({ done, total: codes.length });
        }
      };

      await Promise.all(Array.from({ length: BADGE_CONCURRENCY }, () => worker()));

      if (closed) {
        setBadgeServerClosed(true);
        setBadgeNotice(BADGE_CLOSED_NOTICE);
        return;
      }
      if (succeeded === 0) {
        setBadgeNotice(
          'No badges could be downloaded, so no ZIP file was created. Check your connection and try again.',
        );
        return;
      }

      // Entry numbering follows the sorted code list, not completion order, so
      // the same report always produces the same file names.
      blobs.forEach((blob, index) => {
        if (!blob) return;
        folder?.file(`${String(index + 1).padStart(4, '0')}-badge-${codes[index]}.jpg`, blob);
      });

      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      // The name is settled here, at completion, and reused verbatim by the save
      // link: a later date rollover or an event refresh must not rename the file
      // the viewer was already told about.
      const fileName = badgeZipFileName(eventInfo?.title ?? 'event');
      const objectUrl = URL.createObjectURL(zipBlob);

      // Authorization is decided here, at delivery, not at the click. Anything
      // that released the previous ZIP while these badges were in flight - a
      // reset, a re-open, a newer run, badge_code leaving the allowlist, the
      // window shutting - has already moved the generation on, and this file
      // must not be held, auto-saved or announced. Date.now() is compared to the
      // deadline directly so a boundary crossed between renders cannot slip
      // through on a stale rendered clock.
      const authorization = authorizationRef.current;
      const stillAuthorized =
        badgeRunGenerationRef.current === runGeneration &&
        authorization.viewToken !== null &&
        authorization.viewToken === runViewToken &&
        authorization.badgeDownloadsAllowed &&
        !authorization.badgeWindowClosed &&
        (authorization.badgeDeadlineMs === null || Date.now() <= authorization.badgeDeadlineMs);

      if (!stillAuthorized) {
        // Revoke the URL that was just created: it is the only reference, and
        // nothing downstream will ever be given a chance to release it.
        URL.revokeObjectURL(objectUrl);
        // Staying silent is right for a reset, a re-open or a newer run: the
        // page has already moved on and says so elsewhere. Losing the badges
        // because badge_code left the allowlist mid-run is different - this
        // view is still the one the viewer is looking at, and the run would
        // otherwise end with nothing to explain where the ZIP went. A shut
        // window has its own standing message and must not be overwritten.
        const windowStillOpen =
          !authorization.badgeWindowClosed &&
          (authorization.badgeDeadlineMs === null || Date.now() <= authorization.badgeDeadlineMs);
        if (
          authorization.viewToken !== null &&
          authorization.viewToken === runViewToken &&
          !authorization.badgeDownloadsAllowed &&
          windowStillOpen
        ) {
          setBadgeNotice(BADGE_ALLOWLIST_REMOVED_NOTICE);
        }
        return;
      }

      readyZipRef.current = { url: objectUrl, fileName };
      setReadyZip({ url: objectUrl, fileName });

      const failed = codes.length - succeeded;
      // The honest outcome is stated before the automatic attempt is made, so
      // the message never depends on whether the browser accepts it.
      setBadgeNotice(
        `${
          failed === 0
            ? `Badge ZIP ready with all ${succeeded.toLocaleString('en-IN')} badges.`
            : `Badge ZIP ready with ${succeeded.toLocaleString('en-IN')} of ${codes.length.toLocaleString('en-IN')} ` +
              `badges; ${failed.toLocaleString('en-IN')} could not be fetched.`
        } ${BADGE_SAVE_HINT}`,
      );

      // One URL, two chances: an automatic attempt the browser may refuse this
      // long after the original click, and the same URL behind the save link.
      // Isolated, because the ZIP is already ready and already offered - a throw
      // from the synthetic click is not a failed preparation.
      try {
        attemptObjectUrlSave(objectUrl, fileName);
      } catch {
        // The save link below is the fallback this exists for.
      }
    } catch {
      setBadgeNotice('Could not prepare the badge downloads. Check your connection and try again.');
    } finally {
      setBadgeBulkBusy(false);
    }
  };

  // One badge message region: live progress first, then the closed-window
  // explanation, then the last outcome. Closed outranks the notice because a
  // per-badge or bulk message from before the boundary is stale once the window
  // shuts. When the organiser removes badge_code the window is no longer the
  // reason badges are gone, so the fields_changed notice still shows.
  const badgeStatusText = badgeBulkBusy
    ? `Preparing badges ${badgeProgress.done} of ${badgeProgress.total}.`
    : badgeDownloadsAllowed && badgeWindowClosed
      ? BADGE_CLOSED_NOTICE
      : badgeNotice ?? '';

  const pageSizeValue = pageSize === null ? 'all' : String(pageSize);
  const totalPages = pageSize === null ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const currentPage = pageSize === null ? 1 : Math.floor(offset / pageSize) + 1;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = pageSize === null ? Math.min(total, rows.length) : Math.min(offset + pageSize, total);

  // ── Password gate ─────────────────────────────────────────────────────────
  if (!viewToken) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col justify-center px-4 py-16">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 space-y-2 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">Registration report</h1>
            <p className="text-sm text-muted-foreground">
              This report is password protected. Enter the password shared by the event organiser.
            </p>
          </div>

          <form onSubmit={handleOpen} className="space-y-3" noValidate>
            <div className="space-y-1.5">
              <label htmlFor="report-password" className="text-sm font-medium text-foreground">
                Password
              </label>
              <Input
                id="report-password"
                type="password"
                autoComplete="off"
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={gateError ? 'true' : undefined}
                aria-describedby={gateError ? 'report-password-error' : undefined}
              />
            </div>

            {gateError && (
              <p
                id="report-password-error"
                role="alert"
                className="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-sm text-destructive"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{gateError}</span>
              </p>
            )}

            <Button type="submit" className="w-full" disabled={opening || !password}>
              {opening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              View report
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const eventWindow = formatEventWindow(eventInfo?.startAt ?? null, eventInfo?.endAt ?? null);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{eventInfo?.title}</h1>
        <div className="flex flex-col gap-1.5 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          {eventInfo?.location && (
            <span className="inline-flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {eventInfo.location}
            </span>
          )}
          {eventWindow && (
            <span className="inline-flex items-start gap-1.5">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {eventWindow}
            </span>
          )}
        </div>
      </header>

      {summaries.length > 0 && (
        <section aria-labelledby="report-summary-heading" className="space-y-2">
          <h2 id="report-summary-heading" className="text-sm font-semibold text-foreground">
            Registration summary
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {summaries.map((summary) => (
              <div key={summary.key} className="rounded-lg border border-border bg-card p-3">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {summary.label}
                </h3>
                {summary.items.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No responses</p>
                ) : (
                  <dl className="mt-2 space-y-1">
                    {summary.items.map((item) => (
                      <div
                        key={item.value ?? '__null__'}
                        className="flex items-baseline justify-between gap-3 text-sm"
                      >
                        <dt className="text-muted-foreground">
                          {summaryValueLabel(summary.key, item.value)}
                        </dt>
                        <dd className="font-semibold text-foreground tabular-nums">
                          {item.count.toLocaleString('en-IN')}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
        <p className="text-sm text-foreground" aria-live="polite">
          <span className="font-semibold">{total.toLocaleString('en-IN')}</span>{' '}
          {total === 1 ? 'registration' : 'registrations'}
          {total > 0 && (
            <span className="text-muted-foreground">
              {' '}
              &middot; showing {rangeStart.toLocaleString('en-IN')}-{rangeEnd.toLocaleString('en-IN')}
            </span>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <label htmlFor="report-page-size" className="text-xs text-muted-foreground">
              Rows
            </label>
            <select
              id="report-page-size"
              value={pageSizeValue}
              onChange={(event) => {
                const raw = event.target.value;
                setPageSize(raw === 'all' ? null : (Number(raw) as 25 | 50 | 100));
                setOffset(0);
              }}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option.label} value={option.value === null ? 'all' : String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="relative" ref={fieldPanelRef}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowFieldPanel((open) => !open)}
              aria-expanded={showFieldPanel}
              aria-haspopup="true"
            >
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Columns ({visibleFields.length}/{fields.length})
            </Button>
            {showFieldPanel && (
              <div
                role="group"
                aria-label="Choose visible columns"
                className="absolute right-0 z-20 mt-1 w-60 space-y-1 rounded-md border border-border bg-card p-2 shadow-lg"
              >
                <p className="px-1 pb-1 text-[11px] text-muted-foreground">
                  Hiding a column only changes this view and the download.
                </p>
                {fields.map((field) => {
                  const checked = !hiddenKeys.has(field.key);
                  const isLastVisible = checked && visibleFields.length <= 1;
                  return (
                    <label
                      key={field.key}
                      className={`flex items-center gap-2 rounded px-1 py-1 text-sm ${
                        isLastVisible ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={checked}
                        disabled={isLastVisible}
                        onChange={() => handleToggleField(field.key)}
                      />
                      <span className="text-foreground">{field.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <Button
            type="button"
            size="sm"
            onClick={() => void handleDownload()}
            disabled={downloading || rowsLoading || total === 0}
          >
            {downloading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            )}
            Download all {total.toLocaleString('en-IN')} registrations (CSV)
          </Button>

          {badgeDownloadsAllowed && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleBulkBadgeDownload()}
              disabled={badgeBulkBusy || downloading || rowsLoading || total === 0 || badgeWindowClosed}
              aria-describedby={badgeWindowClosed ? undefined : 'report-badge-help'}
              title="Downloads the badge artwork the organiser authorised. Hiding the Badge Number column here does not remove this action."
            >
              {badgeBulkBusy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <FileArchive className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              )}
              {badgeBulkBusy
                ? `Preparing badges ${badgeProgress.done}/${badgeProgress.total}`
                : 'Download all badges (ZIP)'}
            </Button>
          )}
        </div>
      </div>

      {/* Keep the status line mounted while a notice exists: a bulk refresh can
          drop badge_code from the allowlist in the same update that explains why,
          and gating the whole block on allowance would hide that explanation. */}
      {(badgeDownloadsAllowed || badgeStatusText) && (
        <div className="space-y-1.5">
          {badgeDownloadsAllowed && !badgeWindowClosed && (
            <p id="report-badge-help" className="text-xs text-muted-foreground">
              Badge downloads give you the badge artwork the organiser authorised, which may show more details than
              the columns above. Hiding the Badge Number column here does not remove this action.
            </p>
          )}
          <p
            role="status"
            aria-live="polite"
            className={
              badgeStatusText
                ? 'flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground'
                : 'sr-only'
            }
          >
            <span>{badgeStatusText}</span>
          </p>
          {/* Outside the live region on purpose: the announcement stays one
              sentence, and the save action is a plain link the viewer reaches
              when they choose to. No autofocus - focus stays where they left it. */}
          {badgeDownloadsAllowed && !badgeWindowClosed && readyZip && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground">
              <a
                href={readyZip.url}
                download={readyZip.fileName}
                className="inline-flex items-center gap-1.5 font-medium text-primary underline underline-offset-2 hover:text-primary/80"
              >
                <FileArchive className="h-3.5 w-3.5" aria-hidden="true" />
                Save badge ZIP
              </a>
              <span className="text-muted-foreground">Saves {readyZip.fileName}.</span>
            </p>
          )}
        </div>
      )}

      {downloadNotice && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{downloadNotice}</span>
        </p>
      )}

      {truncated && (
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Showing the first {ALL_ROWS_CAP.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')} registrations.
          Use a smaller page size to browse the rest.
        </p>
      )}

      {rowsError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          <span className="inline-flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {rowsError}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => viewToken && void fetchRows(viewToken, allFieldKeys, pageSize, offset, sort)}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <caption className="sr-only">
            Registrations for {eventInfo?.title}. {visibleFields.length} of {fields.length} columns shown.
          </caption>
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {visibleFields.map((field) => {
                const activeDirection: SortDirection | null =
                  sort && sort.key === field.key ? sort.direction : null;
                return (
                  <SortableTableHeader
                    key={field.key}
                    label={field.label}
                    direction={activeDirection}
                    onSort={() => handleSort(field.key)}
                    className="whitespace-nowrap px-3 py-2.5 text-left font-semibold text-foreground"
                    buttonClassName="font-semibold text-foreground hover:text-primary"
                  />
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rowsLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={visibleFields.length} className="px-3 py-10 text-center text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Loading registrations...
                  </span>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={visibleFields.length} className="px-3 py-10 text-center text-muted-foreground">
                  No registrations to show yet.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={`${offset}-${index}`}
                  className="border-b border-border last:border-b-0 hover:bg-muted/30"
                >
                  {visibleFields.map((field) => {
                    const text = cellText(field.key, row[field.key]);
                    const badgeCode =
                      field.key === 'badge_code' && badgeDownloadsAllowed && !badgeWindowClosed
                        ? normalizeEventBadgeCode(row[field.key])
                        : null;
                    return (
                      <td key={field.key} className="whitespace-nowrap px-3 py-2.5 text-foreground">
                        {badgeCode ? (
                          <span className="inline-flex items-center gap-1.5">
                            <a
                              href={eventsService.badgeDownloadUrlByCode(badgeCode)}
                              download={`event-badge-${badgeCode}.jpg`}
                              aria-label={`Download badge ${badgeCode}`}
                              aria-busy={badgeBusyCodes.has(badgeCode) || undefined}
                              onClick={(clickEvent) => void handleBadgeDownload(clickEvent, row[field.key])}
                              className="font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                            >
                              {text}
                            </a>
                            {badgeBusyCodes.has(badgeCode) && (
                              <span role="status" className="inline-flex items-center">
                                <Loader2
                                  className="h-3.5 w-3.5 animate-spin text-muted-foreground"
                                  aria-hidden="true"
                                />
                                <span className="sr-only">Preparing badge {badgeCode}</span>
                              </span>
                            )}
                          </span>
                        ) : (
                          text || <span className="text-muted-foreground">&mdash;</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageSize !== null && totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3" aria-label="Report pagination">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOffset(Math.max(0, offset - pageSize))}
            disabled={offset === 0 || rowsLoading}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            Page {currentPage.toLocaleString('en-IN')} of {totalPages.toLocaleString('en-IN')}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOffset(offset + pageSize)}
            disabled={currentPage >= totalPages || rowsLoading}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
};

export default EventPublicReport;
