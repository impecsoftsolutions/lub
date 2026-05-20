// COD-EVENTS-REGISTRATION-BADGE-EXPORT-AADHAAR-068
// COD-EVENTS-BADGE-CAMERA-SCANNER-072
// Admin Event Check-in Page
// Route: /admin/content/events/:id/checkin
//
// Flow:
//   1. All registrations for the event are loaded on mount.
//   2. Staff types name / mobile / email / badge number → live dropdown appears.
//   3. Tap a result → detail card appears with "Mark attendance" + "Search another".
//   4. "Mark attendance" calls check_in_event_badge_with_session RPC (idempotent).
//   5. Camera QR scan → badge code extracted → matched against loaded registrations
//      → same detail card shown automatically.
//
// NOTE: Mark-attendance requires check_in_event_badge_with_session RPC.
//       Codex must deploy that migration before the button works end-to-end.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  QrCode,
  Search,
  X,
} from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import { eventsService, EventBadgeRow, EventRsvpRow } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Toast from '../components/Toast';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Extract badge code from raw input:
//   "NO7026"                       => NO7026
//   "https://.../?code=XY"         => XY
//   "...event-badge-download?code=XY" => XY
function extractBadgeCode(raw: string): string {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get('code');
    if (code) return code.toUpperCase();
  } catch {
    // not a full URL
  }
  const match = /[?&]code=([A-Za-z0-9]+)/.exec(trimmed);
  if (match) return match[1].toUpperCase();
  return trimmed.toUpperCase();
}

function formatAllDaysLabel(dayCount: number): string {
  const normalized = Number.isFinite(dayCount) && dayCount > 0 ? Math.floor(dayCount) : 0;
  if (normalized <= 0) return 'Multiple days';
  return `${normalized} day${normalized === 1 ? '' : 's'}`;
}

function formatVisitDate(iso: string | null | undefined, visitAllDays = false, dayCount = 0): string {
  if (visitAllDays) return formatAllDaysLabel(dayCount);
  if (!iso) return '-';
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function eventDayCountFromRange(start: string | null | undefined, end: string | null | undefined): number {
  if (!start) return 0;
  const startIso = String(start).slice(0, 10);
  const endIso = String(end ?? start).slice(0, 10);
  const toDate = (iso: string): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(dt.getTime()) ? null : dt;
  };
  const s = toDate(startIso);
  const e = toDate(endIso) ?? s;
  if (!s || !e) return 0;
  const startDay = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
  const endDay = new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
  const diffDays = Math.floor((endDay - startDay) / (24 * 60 * 60 * 1000));
  return diffDays >= 0 ? diffDays + 1 : 1;
}

// Case-insensitive substring match across key registration fields.
// badgeCode is passed separately because it comes from the badges table,
// not from the rsvp row returned by getRsvps.
function matchesQuery(row: EventRsvpRow, q: string, badgeCode = ''): boolean {
  const term = q.toLowerCase().trim();
  if (!term) return false;
  return (
    row.full_name.toLowerCase().includes(term) ||
    (row.email ?? '').toLowerCase().includes(term) ||
    (row.phone ?? '').includes(term) ||
    (row.company ?? '').toLowerCase().includes(term) ||
    badgeCode.toLowerCase().includes(term)
  );
}

// ---------------------------------------------------------------------------
// BarcodeDetector types (native Web API — not available everywhere)
// ---------------------------------------------------------------------------

type BarcodeDetectorResult = { rawValue?: string };
type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<BarcodeDetectorResult[]>;
};
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  const candidate = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof candidate === 'function' ? candidate : null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const AdminEventCheckin: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const canManage = useHasPermission('events.rsvp.manage');

  // ── Registration list + badges (loaded once on mount) ────────────────────
  const [allRsvps, setAllRsvps] = useState<EventRsvpRow[]>([]);
  const [badges, setBadges] = useState<EventBadgeRow[]>([]);
  const [eventDayCount, setEventDayCount] = useState(1);
  const [rsvpsLoading, setRsvpsLoading] = useState(false);

  // ── Search input + dropdown ───────────────────────────────────────────────
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // ── Selected attendee + check-in state ───────────────────────────────────
  const [selectedRow, setSelectedRow] = useState<EventRsvpRow | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // ── Camera scanner ────────────────────────────────────────────────────────
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStarting, setScannerStarting] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const autoLookupDoneRef = useRef(false);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraLoopRef = useRef<number | null>(null);
  const cameraDetectorRef = useRef<BarcodeDetectorLike | null>(null);
  const cameraDetectBusyRef = useRef(false);

  const scannerAvailable = (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    Boolean(getBarcodeDetectorCtor())
  );

  // ── Utilities ─────────────────────────────────────────────────────────────

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Load all registrations for this event ─────────────────────────────────

  useEffect(() => {
    if (!id) return;
    const token = sessionManager.getSessionToken();
    if (!token) return;
    let cancelled = false;
    setRsvpsLoading(true);
    Promise.all([
      eventsService.getRsvps(token, id),
      eventsService.getBadges(token, id),
      eventsService.getById(token, id),
    ]).then(([rsvpResult, badgeResult, eventDetail]) => {
      if (!cancelled) {
        setAllRsvps(rsvpResult.rows ?? []);
        setBadges(badgeResult.rows ?? []);
        setEventDayCount(eventDayCountFromRange(eventDetail?.start_at, eventDetail?.end_at) || 1);
        setRsvpsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setRsvpsLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  // ── Close dropdown on outside click ──────────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Camera scanner ────────────────────────────────────────────────────────

  const stopScanner = useCallback(() => {
    if (cameraLoopRef.current != null) {
      window.cancelAnimationFrame(cameraLoopRef.current);
      cameraLoopRef.current = null;
    }
    cameraDetectBusyRef.current = false;
    if (cameraVideoRef.current) {
      cameraVideoRef.current.pause();
      cameraVideoRef.current.srcObject = null;
    }
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    setScannerOpen(false);
    setScannerStarting(false);
  }, []);

  useEffect(() => { return () => stopScanner(); }, [stopScanner]);

  // ── Badge lookup map (rsvp_id → EventBadgeRow) ───────────────────────────

  const badgeByRsvpId = useMemo(() => {
    const m = new Map<string, EventBadgeRow>();
    for (const b of badges) m.set(b.rsvp_id, b);
    return m;
  }, [badges]);

  // ── Live suggestions ──────────────────────────────────────────────────────

  const suggestions = useMemo<EventRsvpRow[]>(() => {
    const raw = input.trim();
    if (!raw) return [];
    // When input is a QR URL, match against the extracted badge code
    const effectiveQ = extractBadgeCode(raw);
    return allRsvps.filter((row) => {
      const badgeCode = badgeByRsvpId.get(row.id)?.badge_code ?? '';
      return matchesQuery(row, effectiveQ, badgeCode);
    }).slice(0, 8);
  }, [input, allRsvps, badgeByRsvpId]);

  // ── Select a registration (from dropdown or QR scan) ─────────────────────

  const selectRow = useCallback((row: EventRsvpRow) => {
    setShowSuggestions(false);
    setSearchError(null);
    setCheckInError(null);
    // Seed checked-in state from DB value if getRsvps returned it
    setCheckedIn(Boolean(row.checked_in_at));
    setSelectedRow(row);
  }, []);

  // ── Lookup button / Enter key ─────────────────────────────────────────────
  // Priority: exact badge-code match → single suggestion → open dropdown

  const handleLookup = useCallback(() => {
    setShowSuggestions(false);
    const effectiveCode = extractBadgeCode(input);
    // Try exact badge_code match via the badge map first
    const exactBadge = badges.find((b) => b.badge_code.toUpperCase() === effectiveCode);
    const exactRow = exactBadge ? allRsvps.find((r) => r.id === exactBadge.rsvp_id) : undefined;
    if (exactRow) { selectRow(exactRow); return; }
    if (suggestions.length === 1) { selectRow(suggestions[0]); return; }
    if (suggestions.length > 1) { setShowSuggestions(true); return; }
    setSearchError(`No registration found matching "${input.trim()}".`);
  }, [input, allRsvps, badges, suggestions, selectRow]);

  // ── URL param auto-select (QR deep-link on another device) ───────────────

  useEffect(() => {
    if (autoLookupDoneRef.current || allRsvps.length === 0) return;
    const code = searchParams.get('code');
    if (!code) return;
    autoLookupDoneRef.current = true;
    const normalized = extractBadgeCode(code);
    const badgeEntry = badges.find((b) => b.badge_code.toUpperCase() === normalized);
    const match = badgeEntry ? allRsvps.find((r) => r.id === badgeEntry.rsvp_id) : undefined;
    if (match) {
      setInput(match.full_name);
      selectRow(match);
    } else {
      setInput(normalized);
      setSearchError(`No registration found for badge ${normalized}.`);
    }
  }, [allRsvps, badges, searchParams, selectRow]);

  // ── Camera scanner loop ───────────────────────────────────────────────────

  const startScannerLoop = useCallback(() => {
    const tick = async () => {
      if (!cameraStreamRef.current) return;
      const video = cameraVideoRef.current;
      const detector = cameraDetectorRef.current;
      if (!video || !detector || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        cameraLoopRef.current = window.requestAnimationFrame(() => void tick());
        return;
      }
      if (!cameraDetectBusyRef.current) {
        cameraDetectBusyRef.current = true;
        try {
          const barcodes = await detector.detect(video);
          const raw = barcodes.map((b) => b.rawValue ?? '').find((v) => v.trim().length > 0);
          if (raw) {
            const code = extractBadgeCode(raw);
            if (code) {
              stopScanner();
              setScannerError(null);
              const badgeEntry = badges.find((b) => b.badge_code.toUpperCase() === code);
              const match = badgeEntry ? allRsvps.find((r) => r.id === badgeEntry.rsvp_id) : undefined;
              if (match) {
                setInput(match.full_name);
                selectRow(match);
              } else {
                setInput(code);
                setSearchError(`No registration found for badge ${code}.`);
              }
              return;
            }
          }
        } catch {
          // intermittent browser detect() errors — keep scanning
        } finally {
          cameraDetectBusyRef.current = false;
        }
      }
      cameraLoopRef.current = window.requestAnimationFrame(() => void tick());
    };
    cameraLoopRef.current = window.requestAnimationFrame(() => void tick());
  }, [allRsvps, badges, selectRow, stopScanner]);

  const openScanner = useCallback(async () => {
    if (!scannerAvailable) {
      setScannerError('Camera scanning is not supported in this browser.');
      return;
    }
    const Detector = getBarcodeDetectorCtor();
    if (!Detector) { setScannerError('QR detector unavailable.'); return; }
    setScannerError(null);
    setSearchError(null);
    setScannerStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      cameraDetectorRef.current = new Detector({ formats: ['qr_code'] });
      setScannerOpen(true);
      const video = cameraVideoRef.current;
      if (video) { video.srcObject = stream; await video.play(); }
      setScannerStarting(false);
      startScannerLoop();
    } catch (err) {
      stopScanner();
      setScannerError(`Unable to start camera: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setScannerStarting(false);
    }
  }, [scannerAvailable, startScannerLoop, stopScanner]);

  const closeScanner = useCallback(() => { stopScanner(); setScannerError(null); }, [stopScanner]);

  // ── Mark attendance ───────────────────────────────────────────────────────

  const handleCheckin = useCallback(async () => {
    if (!selectedRow || !canManage) return;
    const badgeCode = badgeByRsvpId.get(selectedRow.id)?.badge_code;
    if (!badgeCode) {
      setCheckInError('No badge has been issued for this registration yet.');
      return;
    }
    const token = sessionManager.getSessionToken();
    if (!token) { showToast('error', 'Session expired.'); return; }
    setIsCheckingIn(true);
    setCheckInError(null);
    try {
      const result = await eventsService.checkInBadge(token, badgeCode);
      if (!result.success) {
        setCheckInError(result.error ?? 'Check-in failed. Please try again.');
        return;
      }
      setCheckedIn(true);
      // Patch the in-memory row so re-selecting it after a new search
      // still reflects the checked-in state (avoids stale-cache flip to "Not checked in").
      const nowIso = result.checked_in_at ?? new Date().toISOString();
      setAllRsvps((prev) =>
        prev.map((r) =>
          r.id === selectedRow.id
            ? { ...r, checked_in_at: nowIso, check_in_source: 'admin' }
            : r,
        ),
      );
      if (result.already_checked_in) {
        showToast('success', 'Already checked in — no change needed.');
      } else {
        showToast('success', `${selectedRow.full_name} marked present.`);
      }
    } finally {
      setIsCheckingIn(false);
    }
  }, [selectedRow, badgeByRsvpId, canManage, showToast]);

  // ── Undo / reverse check-in ──────────────────────────────────────────────

  const handleUndo = useCallback(async () => {
    if (!selectedRow || !canManage) return;
    const badgeCode = badgeByRsvpId.get(selectedRow.id)?.badge_code;
    if (!badgeCode) {
      setCheckInError('No badge found for this registration — cannot reverse check-in.');
      return;
    }
    const token = sessionManager.getSessionToken();
    if (!token) { showToast('error', 'Session expired.'); return; }
    setIsUndoing(true);
    setCheckInError(null);
    try {
      const result = await eventsService.uncheckInBadge(token, badgeCode);
      if (!result.success) {
        showToast('error', result.error ?? 'Failed to reverse check-in.');
        return;
      }
      setCheckedIn(false);
      // Patch the in-memory row so re-selecting it reflects cleared state.
      setAllRsvps((prev) =>
        prev.map((r) =>
          r.id === selectedRow.id
            ? { ...r, checked_in_at: null, checked_in_by: null, check_in_source: null }
            : r,
        ),
      );
      if (result.already_cleared) {
        showToast('success', 'Already not checked in — no change needed.');
      } else {
        showToast('success', 'Check-in reversed. Attendance cleared.');
      }
    } finally {
      setIsUndoing(false);
    }
  }, [selectedRow, badgeByRsvpId, canManage, showToast]);

  // ── Reset to search ───────────────────────────────────────────────────────

  const reset = useCallback(() => {
    stopScanner();
    setInput('');
    setSelectedRow(null);
    setCheckedIn(false);
    setCheckInError(null);
    setSearchError(null);
    setScannerError(null);
    setShowSuggestions(false);
    setIsUndoing(false);
    window.setTimeout(() => document.getElementById('badge-checkin-code')?.focus(), 50);
  }, [stopScanner]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleLookup();
    if (e.key === 'Escape') setShowSuggestions(false);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <PermissionGate permission="events.rsvp.view">
      <div className="space-y-6 max-w-2xl">
        {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

        <Link
          to={id ? `/admin/content/events/${id}/registrations` : '/admin/content/events'}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Registrations
        </Link>

        <PageHeader
          title="Badge Check-in"
          subtitle="Search by name, mobile, email or badge number — or scan with camera."
        />

        {/* ── Search card ── */}
        <div className="rounded-xl border border-border bg-card shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">Find attendee</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Type a name, mobile number, email, or badge code — matching registrations appear as you type. Tap a result to view details and mark attendance.
          </p>

          <div className="flex gap-2 flex-wrap">
            {/* Input + live dropdown */}
            <div ref={suggestionsRef} className="relative flex-1 min-w-[240px]">
              {rsvpsLoading ? (
                <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
              ) : (
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              )}
              <Input
                id="badge-checkin-code"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setSelectedRow(null);
                  setCheckedIn(false);
                  setCheckInError(null);
                  setSearchError(null);
                  setShowSuggestions(true);
                }}
                onFocus={() => {
                  if (input.trim() && !selectedRow) setShowSuggestions(true);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Name, mobile, email or badge no."
                className="pl-9"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                disabled={scannerStarting}
              />
              {input && (
                <button
                  type="button"
                  onClick={reset}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label="Clear"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              {/* Live suggestion dropdown — all rows clickable regardless of badge */}
              {showSuggestions && suggestions.length > 0 && !selectedRow && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
                  {suggestions.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault(); // prevent blur before click registers
                        selectRow(row);
                      }}
                      className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/60 border-b border-border/40 last:border-0 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{row.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[badgeByRsvpId.get(row.id)?.badge_code, row.phone, row.email, row.company].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <span className={`shrink-0 text-[10px] font-medium rounded-full px-2 py-0.5 ${
                        row.status === 'confirmed'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : row.status === 'cancelled'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            : row.status === 'waitlisted'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                              : 'bg-muted text-muted-foreground'
                      }`}>
                        {row.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button onClick={handleLookup} disabled={!input.trim() || scannerStarting}>
              <Search className="h-4 w-4 mr-1.5" />
              Lookup
            </Button>

            {scannerOpen ? (
              <Button type="button" variant="outline" onClick={closeScanner} disabled={scannerStarting}>
                <CameraOff className="h-4 w-4 mr-1.5" />
                Close camera
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => void openScanner()}
                disabled={!scannerAvailable || scannerStarting}
              >
                {scannerStarting ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4 mr-1.5" />
                )}
                Scan QR
              </Button>
            )}
          </div>

          {scannerOpen && (
            <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">
                Point the camera at the badge QR code. Attendee details load automatically.
              </p>
              <video
                ref={cameraVideoRef}
                className="w-full rounded-md border border-border bg-black/80 aspect-video object-cover"
                muted
                playsInline
                autoPlay
              />
            </div>
          )}

          {!scannerAvailable && (
            <p className="text-xs text-muted-foreground">
              Camera scanning requires HTTPS and a browser with QR detection support.
            </p>
          )}
          {scannerError && <p className="text-sm text-destructive">{scannerError}</p>}
          {searchError && <p className="text-sm text-destructive">{searchError}</p>}
        </div>

        {/* ── Attendee detail + check-in card ── */}
        {selectedRow && (
          <div
            className={`rounded-xl border shadow-sm p-5 space-y-4 transition-colors ${
              checkedIn
                ? 'border-green-400 bg-green-50 dark:bg-green-950/20 dark:border-green-800'
                : 'border-border bg-card'
            }`}
          >
            {/* Name + status badges */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{selectedRow.full_name}</h2>
                {badgeByRsvpId.get(selectedRow.id)?.badge_code && (
                  <p className="text-lg font-bold font-mono text-foreground mt-0.5 tracking-wide">
                    {badgeByRsvpId.get(selectedRow.id)?.badge_code}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                {checkedIn ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Checked in
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                    Not checked in
                  </span>
                )}
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  selectedRow.status === 'confirmed'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                    : selectedRow.status === 'cancelled'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                      : selectedRow.status === 'waitlisted'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'bg-muted text-muted-foreground'
                }`}>
                  {selectedRow.status}
                </span>
              </div>
            </div>

            {/* Registration details — show every available field */}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {selectedRow.email && (
                <>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="text-foreground truncate">{selectedRow.email}</dd>
                </>
              )}
              {selectedRow.phone && (
                <>
                  <dt className="text-muted-foreground">Mobile</dt>
                  <dd className="text-foreground">{selectedRow.phone}</dd>
                </>
              )}
              {selectedRow.company && (
                <>
                  <dt className="text-muted-foreground">Company / Organization</dt>
                  <dd className="text-foreground">{selectedRow.company}</dd>
                </>
              )}
              {selectedRow.designation && (
                <>
                  <dt className="text-muted-foreground">Designation</dt>
                  <dd className="text-foreground">{selectedRow.designation}</dd>
                </>
              )}
              {selectedRow.profession && (
                <>
                  <dt className="text-muted-foreground">Profession</dt>
                  <dd className="text-foreground">{selectedRow.profession}</dd>
                </>
              )}
              {selectedRow.gender && (
                <>
                  <dt className="text-muted-foreground">Gender</dt>
                  <dd className="text-foreground capitalize">{selectedRow.gender}</dd>
                </>
              )}
              {selectedRow.meal_preference && (
                <>
                  <dt className="text-muted-foreground">Meal</dt>
                  <dd className="text-foreground capitalize">{selectedRow.meal_preference}</dd>
                </>
              )}
              {(selectedRow.visit_date || selectedRow.visit_all_days) && (
                <>
                  <dt className="text-muted-foreground">Day of visit</dt>
                  <dd className="text-foreground">
                    {formatVisitDate(selectedRow.visit_date, selectedRow.visit_all_days, eventDayCount)}
                  </dd>
                </>
              )}
              {badgeByRsvpId.get(selectedRow.id)?.badge_code && (
                <>
                  <dt className="text-muted-foreground">Badge no.</dt>
                  <dd className="text-foreground font-mono">
                    {badgeByRsvpId.get(selectedRow.id)?.badge_code}
                  </dd>
                </>
              )}
              {selectedRow.notes && (
                <>
                  <dt className="text-muted-foreground">Notes</dt>
                  <dd className="text-foreground">{selectedRow.notes}</dd>
                </>
              )}
            </dl>

            {checkInError && (
              <p className="text-sm text-destructive">{checkInError}</p>
            )}

            {/* Action buttons — enabled only for confirmed registrations */}
            <div className="flex items-center gap-3 pt-1 border-t border-border/60 flex-wrap">
              {canManage ? (
                checkedIn ? (
                  <>
                    <p className="text-sm text-green-700 dark:text-green-400 font-medium flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      Attendance recorded
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => void handleUndo()}
                      disabled={isUndoing}
                      className="border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950/30"
                    >
                      {isUndoing ? (
                        <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      ) : (
                        <X className="h-4 w-4 mr-1.5" />
                      )}
                      Undo check-in
                    </Button>
                  </>
                ) : selectedRow.status === 'confirmed' ? (
                  <Button
                    onClick={() => void handleCheckin()}
                    disabled={isCheckingIn}
                    className="bg-green-700 hover:bg-green-800 text-white dark:bg-green-700 dark:hover:bg-green-600"
                  >
                    {isCheckingIn ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <BadgeCheck className="h-4 w-4 mr-1.5" />
                    )}
                    Mark attendance
                  </Button>
                ) : (
                  <p className="text-sm text-destructive font-medium">
                    Registration is <span className="font-semibold">{selectedRow.status}</span> — attendance can only be marked for confirmed registrations.
                  </p>
                )
              ) : (
                <p className="text-xs text-muted-foreground">
                  You can view this registration but do not have permission to mark attendance.
                </p>
              )}
              <Button variant="outline" onClick={reset} disabled={isCheckingIn || isUndoing}>
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </PermissionGate>
  );
};

export default AdminEventCheckin;
