// COD-EVENTS-REGISTRATION-BADGE-EXPORT-AADHAAR-068
// COD-EVENTS-BADGE-CAMERA-SCANNER-072
// Admin Event Check-in Page
// Route: /admin/content/events/:id/checkin
//
// Allows event check-in staff (events.rsvp.manage) to:
//   - Look up an attendee by badge code (manual entry, pasted URL, or camera scan)
//   - View registration details
//   - Mark attendance (idempotent)
//
// NOTE: Requires migration for checked_in_at / checked_in_by on event_rsvps
//       and RPCs: lookup_event_badge_for_checkin_with_session,
//                 check_in_event_badge_with_session
//       Codex must deploy these before the lookup/check-in buttons work.

import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { eventsService } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Toast from '../components/Toast';

// Extract badge code from raw input:
//   "NO7026"                  => NO7026
//   "/api/event-badge?code=XY" => XY
//   "https://.../?code=XY"     => XY
//   "...event-badge-download?code=XY" => XY
function extractBadgeCode(raw: string): string {
  const trimmed = raw.trim();
  // Try URL extraction first
  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get('code');
    if (code) return code.toUpperCase();
  } catch {
    // not a URL
  }
  // Try ?code= without scheme
  const match = /[?&]code=([A-Za-z0-9]+)/.exec(trimmed);
  if (match) return match[1].toUpperCase();
  // Otherwise treat whole string as badge code
  return trimmed.toUpperCase();
}

function formatCheckinTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatVisitDate(iso: string | null | undefined, visitAllDays = false): string {
  if (visitAllDays) return 'All days';
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

type LookupData = NonNullable<Awaited<ReturnType<typeof eventsService.lookupBadgeForCheckin>>['data']>;

type BarcodeDetectorResult = { rawValue?: string };
type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<BarcodeDetectorResult[]>;
};
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function getBarcodeDetectorCtor(): BarcodeDetectorCtor | null {
  const candidate = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof candidate === 'function' ? candidate : null;
}

const AdminEventCheckin: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const canManage = useHasPermission('events.rsvp.manage');

  const [input, setInput] = useState('');
  const [isLooking, setIsLooking] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [lookupData, setLookupData] = useState<LookupData | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
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

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

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
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    setScannerOpen(false);
    setScannerStarting(false);
  }, []);

  useEffect(() => {
    return () => stopScanner();
  }, [stopScanner]);

  const lookupByCode = useCallback(async (rawCode: string) => {
    const code = extractBadgeCode(rawCode);
    if (!code) {
      setLookupError('Please enter a badge code or QR URL.');
      return;
    }
    const token = sessionManager.getSessionToken();
    if (!token) {
      setLookupError('Session expired. Please sign in again.');
      return;
    }
    setIsLooking(true);
    setLookupData(null);
    setLookupError(null);
    setCheckedIn(false);
    try {
      const result = await eventsService.lookupBadgeForCheckin(token, code);
      if (!result.success || !result.data) {
        setLookupError(result.error ?? 'Badge not found.');
        return;
      }
      setLookupData(result.data);
      setCheckedIn(Boolean(result.data.checked_in_at));
    } finally {
      setIsLooking(false);
    }
  }, []);

  const handleLookup = useCallback(async (rawInput?: string) => {
    await lookupByCode(rawInput ?? input);
  }, [lookupByCode, input]);

  const reset = useCallback(() => {
    stopScanner();
    setInput('');
    setLookupData(null);
    setLookupError(null);
    setScannerError(null);
    setCheckedIn(false);
    window.setTimeout(() => document.getElementById('badge-checkin-code')?.focus(), 50);
  }, [stopScanner]);

  useEffect(() => {
    if (autoLookupDoneRef.current) return;
    const code = searchParams.get('code');
    if (!code) return;
    autoLookupDoneRef.current = true;
    const normalized = extractBadgeCode(code);
    setInput(normalized);
    void lookupByCode(normalized);
  }, [lookupByCode, searchParams]);

  const startScannerLoop = useCallback(() => {
    const tick = async () => {
      if (!cameraStreamRef.current) return;
      const video = cameraVideoRef.current;
      const detector = cameraDetectorRef.current;
      if (!video || !detector) {
        cameraLoopRef.current = window.requestAnimationFrame(() => {
          void tick();
        });
        return;
      }
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        cameraLoopRef.current = window.requestAnimationFrame(() => {
          void tick();
        });
        return;
      }
      if (!cameraDetectBusyRef.current) {
        cameraDetectBusyRef.current = true;
        try {
          const barcodes = await detector.detect(video);
          const raw = barcodes.map((item) => item.rawValue ?? '').find((item) => item.trim().length > 0);
          if (raw) {
            const code = extractBadgeCode(raw);
            if (code) {
              setInput(code);
              setLookupError(null);
              setScannerError(null);
              stopScanner();
              void lookupByCode(code);
              return;
            }
          }
        } catch {
          // Continue scanning. Some browsers intermittently throw during detect().
        } finally {
          cameraDetectBusyRef.current = false;
        }
      }
      cameraLoopRef.current = window.requestAnimationFrame(() => {
        void tick();
      });
    };
    cameraLoopRef.current = window.requestAnimationFrame(() => {
      void tick();
    });
  }, [lookupByCode, stopScanner]);

  const openScanner = useCallback(async () => {
    if (!scannerAvailable) {
      setScannerError('Camera scanning is not supported in this browser. Use manual badge code lookup.');
      return;
    }
    const Detector = getBarcodeDetectorCtor();
    if (!Detector) {
      setScannerError('QR detector is unavailable in this browser.');
      return;
    }
    setScannerError(null);
    setLookupError(null);
    setScannerStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      cameraStreamRef.current = stream;
      cameraDetectorRef.current = new Detector({ formats: ['qr_code'] });
      setScannerOpen(true);
      const video = cameraVideoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      setScannerStarting(false);
      startScannerLoop();
    } catch (err) {
      stopScanner();
      const message = err instanceof Error ? err.message : 'Unknown camera error.';
      setScannerError(`Unable to start camera scanner: ${message}`);
    } finally {
      setScannerStarting(false);
    }
  }, [scannerAvailable, startScannerLoop, stopScanner]);

  const closeScanner = useCallback(() => {
    stopScanner();
    setScannerError(null);
  }, [stopScanner]);

  const handleCheckin = useCallback(async () => {
    if (!lookupData || !canManage) return;
    const token = sessionManager.getSessionToken();
    if (!token) {
      showToast('error', 'Session expired.');
      return;
    }
    setIsCheckingIn(true);
    try {
      const result = await eventsService.checkInBadge(token, lookupData.badge_code);
      if (!result.success) {
        showToast('error', result.error ?? 'Check-in failed.');
        return;
      }
      if (result.already_checked_in) {
        showToast('success', 'Already checked in - no change needed.');
        setCheckedIn(true);
        setLookupData((prev) =>
          prev ? { ...prev, checked_in_at: prev.checked_in_at ?? result.checked_in_at ?? new Date().toISOString() } : prev,
        );
      } else {
        showToast('success', `${lookupData.full_name} checked in.`);
        setCheckedIn(true);
        setLookupData((prev) =>
          prev ? { ...prev, checked_in_at: result.checked_in_at ?? new Date().toISOString() } : prev,
        );
      }
    } finally {
      setIsCheckingIn(false);
    }
  }, [lookupData, canManage, showToast]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void handleLookup();
  };

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
          subtitle="Scan with camera or lookup by badge code, then mark attendance."
        />

        <div className="rounded-xl border border-border bg-card shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">Badge lookup</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Type a badge code (for example <code className="bg-muted px-1 rounded">NO7026</code>), paste a QR URL, or use Scan QR.
          </p>

          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="badge-checkin-code"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="NO7026 or paste QR URL"
                className="pl-9 font-mono uppercase"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                disabled={isLooking || scannerStarting}
              />
              {input && (
                <button
                  type="button"
                  onClick={() => {
                    setInput('');
                    setLookupError(null);
                    document.getElementById('badge-checkin-code')?.focus();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label="Clear"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <Button onClick={() => void handleLookup()} disabled={isLooking || !input.trim()}>
              {isLooking ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-1.5" />
              )}
              Lookup
            </Button>

            {scannerOpen ? (
              <Button type="button" variant="outline" onClick={closeScanner} disabled={scannerStarting}>
                <CameraOff className="h-4 w-4 mr-1.5" />
                Close scanner
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => void openScanner()} disabled={!scannerAvailable || scannerStarting}>
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
                Point the camera at the badge QR code. Lookup starts automatically after detection.
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
          {lookupError && <p className="text-sm text-destructive">{lookupError}</p>}
        </div>

        {lookupData && (
          <div
            className={`rounded-xl border shadow-sm p-5 space-y-4 transition-colors ${
              checkedIn
                ? 'border-green-400 bg-green-50 dark:bg-green-950/20 dark:border-green-800'
                : 'border-border bg-card'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{lookupData.full_name}</h2>
                <p className="text-xs font-mono text-muted-foreground mt-0.5">{lookupData.badge_code}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    lookupData.rsvp_status === 'confirmed'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : lookupData.rsvp_status === 'cancelled'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                        : lookupData.rsvp_status === 'waitlisted'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                          : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {lookupData.rsvp_status}
                </span>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {lookupData.email && (
                <>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="text-foreground truncate">{lookupData.email}</dd>
                </>
              )}
              {lookupData.phone && (
                <>
                  <dt className="text-muted-foreground">Mobile</dt>
                  <dd className="text-foreground">{lookupData.phone}</dd>
                </>
              )}
              {lookupData.company && (
                <>
                  <dt className="text-muted-foreground">Organisation</dt>
                  <dd className="text-foreground">{lookupData.company}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Event</dt>
              <dd className="text-foreground">{lookupData.event_title}</dd>
              <dt className="text-muted-foreground">Day of visit</dt>
              <dd className="text-foreground">{formatVisitDate(lookupData.visit_date, lookupData.visit_all_days)}</dd>
              {lookupData.checked_in_at && (
                <>
                  <dt className="text-muted-foreground">Checked in at</dt>
                  <dd className="text-foreground">{formatCheckinTime(lookupData.checked_in_at)}</dd>
                </>
              )}
            </dl>

            <div className="flex items-center gap-3 pt-1 border-t border-border/60">
              {canManage ? (
                checkedIn ? (
                  <p className="text-sm text-green-700 dark:text-green-400 font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    Attendance recorded
                  </p>
                ) : (
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
                )
              ) : (
                <p className="text-xs text-muted-foreground">
                  You can view this registration but do not have permission to mark attendance.
                </p>
              )}
              <Button variant="outline" onClick={reset} disabled={isCheckingIn}>
                Scan another
              </Button>
            </div>
          </div>
        )}
      </div>
    </PermissionGate>
  );
};

export default AdminEventCheckin;
