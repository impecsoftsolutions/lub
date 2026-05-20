import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { activitiesService } from '../lib/supabase';

const ActivityShortRedirect: React.FC = () => {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      const shortCode = (code || '').trim().toLowerCase();
      if (!shortCode) {
        if (mounted) setError('Invalid short URL.');
        return;
      }

      const result = await activitiesService.resolveShortUrl(shortCode);
      if (!mounted) return;

      if (!result.success || !result.slug) {
        setError(result.error ?? 'Short URL not found.');
        return;
      }

      navigate(`/events/${result.slug}`, { replace: true });
    };

    void run();
    return () => {
      mounted = false;
    };
  }, [code, navigate]);

  if (!error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-sm text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Redirecting to activity...
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center space-y-3">
      <p className="text-sm text-destructive">{error}</p>
      <Link
        to="/events"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Events & Activities
      </Link>
    </div>
  );
};

export default ActivityShortRedirect;
