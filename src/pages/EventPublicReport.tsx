import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertCircle,
  CalendarDays,
  Download,
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

  const fieldPanelRef = useRef<HTMLDivElement | null>(null);

  const visibleFields = useMemo(
    () => fields.filter((field) => !hiddenKeys.has(field.key)),
    [fields, hiddenKeys],
  );

  const allFieldKeys = useMemo(
    () => fields.map((field) => field.key as EventPublicReportFieldKey),
    [fields],
  );

  const resetToGate = useCallback(
    (message: string) => {
      clearStoredAccess(token);
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
      setGateError(message);
    },
    [token],
  );

  const applyAccess = useCallback((access: StoredAccess) => {
    setViewToken(access.viewToken);
    setEventInfo(access.event);
    setFields(access.fields);
    setHiddenKeys(new Set());
    setTotal(access.total);
    setOffset(0);
    setSort(null);
  }, []);

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
        </div>
      </div>

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
                    return (
                      <td key={field.key} className="whitespace-nowrap px-3 py-2.5 text-foreground">
                        {text || <span className="text-muted-foreground">&mdash;</span>}
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
