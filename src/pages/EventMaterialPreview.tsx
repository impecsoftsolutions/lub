import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { eventsService, type EventAsset } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import { Button } from '@/components/ui/button';

function assetName(asset: EventAsset): string {
  return asset.label || asset.storage_path.split('/').pop() || 'Material';
}

function isImageAsset(asset: EventAsset): boolean {
  return (asset.mime_type ?? '').toLowerCase().startsWith('image/');
}

function isPdfAsset(asset: EventAsset): boolean {
  return (asset.mime_type ?? '').toLowerCase() === 'application/pdf';
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.ceil(bytes / 1024)} KB`;
}

const EventMaterialPreview: React.FC = () => {
  const { slug = '', assetId = '' } = useParams<{ slug: string; assetId: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asset, setAsset] = useState<EventAsset | null>(null);
  const [title, setTitle] = useState('Material');
  const [downloading, setDownloading] = useState(false);

  const safeSlug = useMemo(() => decodeURIComponent(slug), [slug]);
  const safeAssetId = useMemo(() => decodeURIComponent(assetId), [assetId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      setAsset(null);
      try {
        const token = sessionManager.getSessionToken();
        const event = await eventsService.getBySlug(safeSlug, token);
        if (!event) {
          setError('Event not found.');
          return;
        }
        setTitle(event.title || 'Material');
        const assets = Array.isArray(event.assets) ? event.assets : [];
        const match = assets.find((a) => a.id === safeAssetId && a.kind === 'document') ?? null;
        if (!match) {
          setError('Material not found.');
          return;
        }
        if (!cancelled) setAsset(match);
      } catch {
        if (!cancelled) setError('Could not load this material right now.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [safeAssetId, safeSlug]);

  const download = async () => {
    if (!asset || downloading) return;
    setDownloading(true);
    try {
      const response = await fetch(asset.public_url, { method: 'GET' });
      if (!response.ok) {
        setError('Could not download this material. Please try again later.');
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = assetName(asset);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setError('Could not download this material. Please try again later.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        <Link
          to={`/events/${encodeURIComponent(safeSlug)}`}
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Event
        </Link>

        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight truncate">{asset ? assetName(asset) : 'Material'}</h1>
              <p className="mt-1 text-sm text-muted-foreground truncate">{title}</p>
              {asset && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {[asset.mime_type, formatSize(asset.byte_size)].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            {asset && (
              <Button type="button" variant="outline" size="sm" onClick={() => void download()} disabled={downloading}>
                {downloading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
                Download
              </Button>
            )}
          </div>
        </div>

        <div className="min-h-[70vh] overflow-hidden rounded-xl border border-border bg-muted/30">
          {isLoading ? (
            <div className="flex min-h-[70vh] items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading material preview...
            </div>
          ) : error ? (
            <div className="flex min-h-[70vh] items-center justify-center px-4 text-center text-sm text-muted-foreground">
              {error}
            </div>
          ) : asset ? (
            isImageAsset(asset) ? (
              <div className="flex min-h-[70vh] items-center justify-center bg-white p-3">
                <img
                  src={asset.public_url}
                  alt={assetName(asset)}
                  className="h-auto max-h-[78vh] w-full max-w-[980px] rounded-md border border-border object-contain shadow-sm"
                />
              </div>
            ) : isPdfAsset(asset) ? (
              <iframe title={assetName(asset)} src={asset.public_url} className="h-[78vh] w-full bg-white" />
            ) : (
              <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-5 text-center text-sm text-muted-foreground">
                <FileText className="h-8 w-8" />
                <p>Preview is not available for this file type.</p>
                <p className="text-xs">Use the Download button to open it in the appropriate app.</p>
                <button
                  type="button"
                  onClick={() => void download()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Download File
                </button>
              </div>
            )
          ) : null}
        </div>
      </main>
    </div>
  );
};

export default EventMaterialPreview;
