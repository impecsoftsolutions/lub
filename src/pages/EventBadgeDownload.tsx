import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { eventsService } from '../lib/supabase';
import { Button } from '@/components/ui/button';
import { renderPdfFirstPageAsJpegBlob } from '../lib/pdfImageRender';

const EventBadgeDownload: React.FC = () => {
  const { code = '' } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const badgeCode = useMemo(
    () => (code || searchParams.get('code') || '').trim().toUpperCase(),
    [code, searchParams],
  );
  const eventSlug = useMemo(() => (searchParams.get('event_slug') || '').trim(), [searchParams]);
  const mobile = useMemo(() => (searchParams.get('mobile') || '').trim(), [searchParams]);
  const email = useMemo(() => (searchParams.get('email') || '').trim(), [searchParams]);

  const [resolvedBadgeCode, setResolvedBadgeCode] = useState<string>('');
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [jpgObjectUrl, setJpgObjectUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const parseBadgeCodeFromDisposition = (headerValue: string | null): string | null => {
    if (!headerValue) return null;
    const m = /badge-([A-Za-z0-9]+)\.pdf/i.exec(headerValue);
    return m ? m[1].toUpperCase() : null;
  };

  useEffect(() => {
    let cancelled = false;
    let nextPdfUrl: string | null = null;
    let nextJpgUrl: string | null = null;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      setImageError(null);
      setResolvedBadgeCode('');
      setPdfObjectUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
      setJpgObjectUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });

      const hasCode = /^[A-Z0-9]{4,20}$/.test(badgeCode);
      const hasContactLookup = eventSlug.length > 0 && (mobile.length > 0 || email.length > 0);
      if (!hasCode && !hasContactLookup) {
        setError('Invalid badge link.');
        setIsLoading(false);
        return;
      }

      try {
        const endpoint = hasCode
          ? eventsService.badgeDownloadUrlByCode(badgeCode)
          : mobile.length > 0
            ? eventsService.badgeDownloadUrlByMobile(eventSlug, mobile)
            : eventsService.badgeDownloadUrlByEmail(eventSlug, email);
        const response = await fetch(endpoint, {
          headers: { Accept: 'application/pdf' },
        });
        if (response.status === 410) {
          setError('Badge downloads are closed for this event.');
          setIsLoading(false);
          return;
        }
        if (!response.ok) {
          setError('Badge not found or not available.');
          setIsLoading(false);
          return;
        }
        const contentDisposition = response.headers.get('content-disposition');
        const discoveredCode = hasCode
          ? badgeCode
          : parseBadgeCodeFromDisposition(contentDisposition);
        setResolvedBadgeCode(discoveredCode ?? '');

        const pdfBlob = await response.blob();
        nextPdfUrl = URL.createObjectURL(pdfBlob);
        const pdfBytes = await pdfBlob.arrayBuffer();
        try {
          const jpgBlob = await renderPdfFirstPageAsJpegBlob(pdfBytes);
          nextJpgUrl = URL.createObjectURL(jpgBlob);
        } catch {
          setImageError('Preview image is unavailable, but you can still download the badge PDF.');
        }
        if (cancelled) {
          if (nextPdfUrl) URL.revokeObjectURL(nextPdfUrl);
          if (nextJpgUrl) URL.revokeObjectURL(nextJpgUrl);
          return;
        }
        setPdfObjectUrl(nextPdfUrl);
        setJpgObjectUrl(nextJpgUrl);
      } catch {
        setError('Could not load the badge. Please try again.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (nextPdfUrl) URL.revokeObjectURL(nextPdfUrl);
      if (nextJpgUrl) URL.revokeObjectURL(nextJpgUrl);
    };
  }, [badgeCode, eventSlug, mobile, email]);

  const downloadJpg = () => {
    if (!jpgObjectUrl) return;
    const link = document.createElement('a');
    link.href = jpgObjectUrl;
    link.download = `event-badge-${resolvedBadgeCode || badgeCode || 'download'}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const downloadPdf = () => {
    if (!pdfObjectUrl) return;
    const link = document.createElement('a');
    link.href = pdfObjectUrl;
    link.download = `event-badge-${resolvedBadgeCode || badgeCode || 'download'}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
        <Link to="/events" className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Events
        </Link>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Event Badge</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Badge No. <span className="font-mono text-foreground">{resolvedBadgeCode || badgeCode || '—'}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(jpgObjectUrl || pdfObjectUrl) && (
                <>
                  {jpgObjectUrl && (
                    <Button type="button" variant="outline" size="sm" onClick={downloadJpg}>
                      <Download className="mr-1.5 h-4 w-4" />
                      Download JPG
                    </Button>
                  )}
                  {pdfObjectUrl && (
                    <Button type="button" variant="outline" size="sm" onClick={downloadPdf}>
                      <Download className="mr-1.5 h-4 w-4" />
                      Download PDF
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="min-h-[70vh] overflow-hidden rounded-xl border border-border bg-muted/30">
          {isLoading ? (
            <div className="flex min-h-[70vh] items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading badge...
            </div>
          ) : error ? (
            <div className="flex min-h-[70vh] items-center justify-center px-4 text-center text-sm text-muted-foreground">
              {error}
            </div>
          ) : jpgObjectUrl ? (
            <div className="flex min-h-[70vh] flex-col items-center justify-start gap-3 bg-white p-3">
              <img
                src={jpgObjectUrl}
                alt={`Event badge ${resolvedBadgeCode || badgeCode}`}
                className="h-auto max-h-[78vh] w-full max-w-[520px] rounded-md border border-border object-contain shadow-sm"
              />
              {imageError && (
                <p className="text-xs text-muted-foreground">{imageError}</p>
              )}
            </div>
          ) : pdfObjectUrl ? (
            <iframe
              title={`Event badge ${resolvedBadgeCode || badgeCode}`}
              src={pdfObjectUrl}
              className="h-[78vh] w-full bg-white"
            />
          ) : null}
        </div>
      </main>
    </div>
  );
};

export default EventBadgeDownload;
