import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Loader2,
  Settings as SettingsIcon,
  RefreshCw,
} from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import { activitiesService, type ActivityLimits } from '../lib/supabase';
import { sessionManager } from '../lib/sessionManager';
import Toast from '../components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const GALLERY_MIN = 1;
const GALLERY_MAX = 100;
const YT_MIN = 0;
const YT_MAX = 20;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

const AdminActivitySettings: React.FC = () => {
  const canManage = useHasPermission('activities.settings.manage');

  const [limits, setLimits] = useState<ActivityLimits>(activitiesService.defaultLimits);
  const [galleryInput, setGalleryInput] = useState<string>(
    String(activitiesService.defaultLimits.maxGalleryImages)
  );
  const [youtubeInput, setYoutubeInput] = useState<string>(
    String(activitiesService.defaultLimits.maxYoutubeLinks)
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = sessionManager.getSessionToken();
      if (!token) { showToast('error', 'Session expired.'); return; }
      const settings = await activitiesService.getSettings(token);
      const next = activitiesService.getLimits(settings);
      setLimits(next);
      setGalleryInput(String(next.maxGalleryImages));
      setYoutubeInput(String(next.maxYoutubeLinks));
    } catch (err) {
      console.error('[AdminActivitySettings] load error:', err);
      showToast('error', 'Failed to load activity settings.');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const galleryParsed = Number.parseInt(galleryInput, 10);
  const youtubeParsed = Number.parseInt(youtubeInput, 10);
  const galleryValid =
    Number.isFinite(galleryParsed) && galleryParsed >= GALLERY_MIN && galleryParsed <= GALLERY_MAX;
  const youtubeValid =
    Number.isFinite(youtubeParsed) && youtubeParsed >= YT_MIN && youtubeParsed <= YT_MAX;

  const galleryChanged = galleryValid && galleryParsed !== limits.maxGalleryImages;
  const youtubeChanged = youtubeValid && youtubeParsed !== limits.maxYoutubeLinks;

  const canSave = !isSaving && (galleryChanged || youtubeChanged) && galleryValid && youtubeValid;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const token = sessionManager.getSessionToken();
      if (!token) { showToast('error', 'Session expired.'); return; }

      if (galleryChanged) {
        const next = clamp(galleryParsed, GALLERY_MIN, GALLERY_MAX);
        const result = await activitiesService.updateSetting(
          token,
          'max_gallery_images',
          String(next)
        );
        if (!result.success) {
          showToast('error', result.error ?? 'Failed to update gallery limit.');
          return;
        }
      }

      if (youtubeChanged) {
        const next = clamp(youtubeParsed, YT_MIN, YT_MAX);
        const result = await activitiesService.updateSetting(
          token,
          'max_youtube_links',
          String(next)
        );
        if (!result.success) {
          showToast('error', result.error ?? 'Failed to update YouTube limit.');
          return;
        }
      }

      showToast('success', 'Activity settings saved.');
      await loadSettings();
    } catch (err) {
      console.error('[AdminActivitySettings] save error:', err);
      showToast('error', 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  }, [
    canSave, galleryChanged, youtubeChanged, galleryParsed, youtubeParsed,
    loadSettings, showToast,
  ]);

  return (
    <PermissionGate permission="activities.settings.view">
      <div className="max-w-2xl space-y-6">
        {toast && (
          <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
        )}

        {/* Back + heading */}
        <div className="flex items-center gap-3">
          <Link
            to="/admin/content/activities"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Activities
          </Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-primary" />
            Activity Settings
          </h1>
        </div>

        <p className="text-sm text-muted-foreground">
          Tune the per-activity limits applied across the admin Activities form.
          Changes take effect immediately for new uploads. Existing activities are not affected.
        </p>

        {isLoading ? (
          <div className="flex items-center gap-2 py-12 text-muted-foreground justify-center">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading settings…
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            {/* Gallery limit */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">
                Gallery photo limit per activity
              </label>
              <Input
                type="number"
                min={GALLERY_MIN}
                max={GALLERY_MAX}
                step={1}
                value={galleryInput}
                onChange={(e) => setGalleryInput(e.target.value)}
                disabled={!canManage || isSaving}
                className="max-w-[160px]"
              />
              <p className="text-xs text-muted-foreground">
                Allowed range: {GALLERY_MIN}–{GALLERY_MAX}. Current live value: {limits.maxGalleryImages}.
              </p>
              {!galleryValid && (
                <p className="text-xs text-destructive">
                  Enter a whole number between {GALLERY_MIN} and {GALLERY_MAX}.
                </p>
              )}
            </div>

            {/* YouTube limit */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-foreground">
                YouTube embed limit per activity
              </label>
              <Input
                type="number"
                min={YT_MIN}
                max={YT_MAX}
                step={1}
                value={youtubeInput}
                onChange={(e) => setYoutubeInput(e.target.value)}
                disabled={!canManage || isSaving}
                className="max-w-[160px]"
              />
              <p className="text-xs text-muted-foreground">
                Allowed range: {YT_MIN}–{YT_MAX}. Current live value: {limits.maxYoutubeLinks}.
              </p>
              {!youtubeValid && (
                <p className="text-xs text-destructive">
                  Enter a whole number between {YT_MIN} and {YT_MAX}.
                </p>
              )}
            </div>

            {!canManage && (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                You have read-only access to these settings. Manage permission is required to save changes.
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void loadSettings()}
                disabled={isSaving || isLoading}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reload
              </Button>
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={!canManage || !canSave}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </PermissionGate>
  );
};

export default AdminActivitySettings;
