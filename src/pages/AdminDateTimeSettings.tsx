import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Clock3, Loader2, Save } from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import {
  DateTimeFormatSettings,
  PortalDateFormat,
  PortalTimeFormat,
  dateTimeSettingsService,
} from '../lib/supabase';
import {
  DATE_FORMAT_OPTIONS,
  TIME_FORMAT_OPTIONS,
  formatDateTimeValue,
  formatDateValue,
  formatTimeValue,
  syncDateTimeFormatProfile,
} from '../lib/dateTimeManager';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '../components/ui/PageHeader';
import Toast from '../components/Toast';

interface FormState {
  dateFormat: PortalDateFormat;
  timeFormat: PortalTimeFormat;
}

const DEFAULT_FORM: FormState = {
  dateFormat: 'dd-mm-yyyy',
  timeFormat: '12h',
};

const toFormState = (settings: DateTimeFormatSettings): FormState => ({
  dateFormat: settings.date_format,
  timeFormat: settings.time_format,
});

const SAMPLE_DATE = new Date(2026, 3, 16, 14, 30, 0);

const AdminDateTimeSettings: React.FC = () => {
  const canManage = useHasPermission('settings.datetime.manage');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<DateTimeFormatSettings | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({
    type: 'success',
    message: '',
    isVisible: false,
  });

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, isVisible: false }));
  }, []);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    const result = await dateTimeSettingsService.getSettings();

    if (!result.success || !result.data) {
      showToast('error', result.error || 'Failed to load date and time settings');
      setIsLoading(false);
      return;
    }

    setSettings(result.data);
    setForm(toFormState(result.data));
    syncDateTimeFormatProfile(result.data);
    setIsLoading(false);
  }, [showToast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const hasChanges = useMemo(() => {
    if (!settings) {
      return false;
    }

    return form.dateFormat !== settings.date_format || form.timeFormat !== settings.time_format;
  }, [form, settings]);

  const previewProfile = useMemo(
    () => ({ date_format: form.dateFormat, time_format: form.timeFormat }),
    [form.dateFormat, form.timeFormat]
  );

  const handleSave = async () => {
    if (!canManage) {
      return;
    }

    setIsSaving(true);
    const result = await dateTimeSettingsService.saveSettings({
      dateFormat: form.dateFormat,
      timeFormat: form.timeFormat,
    });

    if (!result.success || !result.data) {
      showToast('error', result.error || 'Failed to save date and time settings');
      setIsSaving(false);
      return;
    }

    setSettings(result.data);
    setForm(toFormState(result.data));
    syncDateTimeFormatProfile(result.data);
    showToast('success', 'Date and time settings saved successfully');
    setIsSaving(false);
  };

  return (
    <PermissionGate
      permission="settings.datetime.view"
      fallback={
        <div className="p-6">
          <PageHeader
            title="Date & Time Settings"
            subtitle="You do not have permission to view global date and time display settings."
          />
        </div>
      }
    >
      <div className="p-6 space-y-6">
        <Link
          to="/admin/settings"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings Hub
        </Link>

        <PageHeader
          title="Date & Time Settings"
          subtitle="Select the global date and time display format used across the admin, public, and member-facing portal."
          actions={
            <Button
              onClick={handleSave}
              disabled={!canManage || !hasChanges || isSaving || isLoading}
              className="gap-2"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Settings
            </Button>
          }
        />

        {isLoading ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading date and time settings...</span>
          </div>
        ) : (
          <>
            <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  Global Display Profile
                </CardTitle>
                <CardDescription>
                  These settings control how dates and times are rendered globally. They do not affect validation, storage format, or Smart Upload extraction.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-foreground">Date Format</span>
                    <select
                      value={form.dateFormat}
                      disabled={!canManage}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        dateFormat: event.target.value as PortalDateFormat,
                      }))}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {DATE_FORMAT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label} ({option.sample})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-foreground">Time Format</span>
                    <select
                      value={form.timeFormat}
                      disabled={!canManage}
                      onChange={(event) => setForm((prev) => ({
                        ...prev,
                        timeFormat: event.target.value as PortalTimeFormat,
                      }))}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {TIME_FORMAT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label} ({option.sample})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Date Preview</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{formatDateValue(SAMPLE_DATE, previewProfile)}</p>
                  </div>
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Time Preview</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{formatTimeValue(SAMPLE_DATE, previewProfile)}</p>
                  </div>
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Date & Time Preview</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{formatDateTimeValue(SAMPLE_DATE, previewProfile)}</p>
                  </div>
                </div>

                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="h-3.5 w-3.5" />
                    {settings?.updated_at
                      ? `Last updated ${formatDateTimeValue(settings.updated_at, previewProfile)}${settings.updated_by_email ? ` by ${settings.updated_by_email}` : ''}.`
                      : 'No previous update metadata available.'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {!canManage && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                You can view date and time settings, but you do not have permission to modify them.
              </div>
            )}
          </>
        )}

        <Toast
          type={toast.type}
          message={toast.message}
          isVisible={toast.isVisible}
          onClose={hideToast}
        />
      </div>
    </PermissionGate>
  );
};

export default AdminDateTimeSettings;
