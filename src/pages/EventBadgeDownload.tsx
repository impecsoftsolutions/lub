import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink, Loader2 } from 'lucide-react';
import { eventsService } from '../lib/supabase';
import { Button } from '@/components/ui/button';

const EventBadgeDownload: React.FC = () => {
  const { code = '' } = useParams<{ code: string }>();
  const badgeCode = useMemo(() => code.trim().toUpperCase(), [code]);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let nextUrl: string | null = null;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      setObjectUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });

      if (!/^[A-Z0-9]{4,20}$/.test(badgeCode)) {
        setError('Invalid badge code.');
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(eventsService.badgeDownloadUrlByCode(badgeCode), {
          headers: { Accept: 'application/pdf' },
        });
        if (!response.ok) {
          setError('Badge not found or not available.');
          setIsLoading(false);
          return;
        }
        const blob = await response.blob();
        nextUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        setObjectUrl(nextUrl);
      } catch {
        setError('Could not load the badge. Please try again.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [badgeCode]);

  const download = () => {
    if (!objectUrl) return;
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `event-badge-${badgeCode}.pdf`;
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
                Badge No. <span className="font-mono text-foreground">{badgeCode}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {objectUrl && (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={download}>
                    <Download className="mr-1.5 h-4 w-4" />
                    Download PDF
                  </Button>
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={objectUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1.5 h-4 w-4" />
                      Open PDF
                    </a>
                  </Button>
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
          ) : objectUrl ? (
            <iframe title={`Event badge ${badgeCode}`} src={objectUrl} className="h-[78vh] w-full bg-white" />
          ) : null}
        </div>
      </main>
    </div>
  );
};

export default EventBadgeDownload;
