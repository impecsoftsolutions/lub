import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bot, KeyRound, Loader2, Save } from 'lucide-react';
import { PermissionGate } from '../components/permissions/PermissionGate';
import { useHasPermission } from '../hooks/usePermissions';
import { AIProvider, AIRuntimeReasoningEffort, AIRuntimeSettings, aiSettingsService } from '../lib/supabase';
import { formatDateTimeValue } from '../lib/dateTimeManager';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '../components/ui/PageHeader';
import Toast from '../components/Toast';

interface FormState {
  provider: AIProvider;
  model: string;
  reasoning: AIRuntimeReasoningEffort;
  isEnabled: boolean;
  apiKey: string;
}

const PROVIDERS: Array<{ value: AIProvider; label: string }> = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google Gemini' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'azure_openai', label: 'Azure OpenAI' },
  { value: 'custom', label: 'Custom Provider' }
];

const REASONING_OPTIONS: Array<{ value: AIRuntimeReasoningEffort; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra High' }
];

const DEFAULT_FORM: FormState = {
  provider: 'openai',
  model: 'gpt-4o-mini',
  reasoning: 'medium',
  isEnabled: false,
  apiKey: ''
};

const toFormState = (settings: AIRuntimeSettings): FormState => ({
  provider: settings.provider,
  model: settings.model,
  reasoning: settings.reasoning_effort ?? 'medium',
  isEnabled: settings.is_enabled,
  apiKey: ''
});

const AdminAISettings: React.FC = () => {
  const canManage = useHasPermission('settings.ai.manage');

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<AIRuntimeSettings | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
    isVisible: boolean;
  }>({
    type: 'success',
    message: '',
    isVisible: false
  });

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ type, message, isVisible: true });
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, isVisible: false }));
  }, []);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    const result = await aiSettingsService.getSettings();

    if (!result.success || !result.data) {
      showToast('error', result.error || 'Failed to load AI settings');
      setIsLoading(false);
      return;
    }

    setSettings(result.data);
    setForm(toFormState(result.data));
    setIsLoading(false);
  }, [showToast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const hasChanges = useMemo(() => {
    if (!settings) {
      return false;
    }

    return (
      form.provider !== settings.provider
      || form.model.trim() !== settings.model
      || (form.provider === 'openai' ? form.reasoning : null) !== (settings.provider === 'openai' ? (settings.reasoning_effort ?? 'medium') : null)
      || form.isEnabled !== settings.is_enabled
      || form.apiKey.trim().length > 0
    );
  }, [form, settings]);

  const handleSave = async () => {
    if (!canManage) {
      return;
    }

    const model = form.model.trim();
    if (!model) {
      showToast('error', 'Model is required');
      return;
    }

    setIsSaving(true);
    const result = await aiSettingsService.saveSettings({
      provider: form.provider,
      model,
      reasoningEffort: form.provider === 'openai' ? form.reasoning : null,
      isEnabled: form.isEnabled,
      apiKey: form.apiKey
    });

    if (!result.success) {
      showToast('error', result.error || 'Failed to save AI settings');
      setIsSaving(false);
      return;
    }

    if (result.data) {
      setSettings(result.data);
      setForm(toFormState(result.data));
    } else {
      setForm((prev) => ({ ...prev, apiKey: '' }));
      await loadSettings();
    }

    showToast('success', 'AI settings saved successfully');
    setIsSaving(false);
  };

  return (
    <PermissionGate
      permission="settings.ai.view"
      fallback={
        <div>
          <PageHeader
            title="AI Settings"
            subtitle="You do not have permission to view AI runtime configuration."
          />
        </div>
      }
    >
      <div className="space-y-6">
        <Link
          to="/admin/settings"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Settings Hub
        </Link>

        <PageHeader
          title="AI Settings"
          subtitle="Configure provider, model, and key used for normalization workflows."
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
            <span className="text-sm text-muted-foreground">Loading AI settings...</span>
          </div>
        ) : (
          <>
            <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-4 w-4 text-primary" />
                  Runtime Profile
                </CardTitle>
                <CardDescription>
                  These settings control which AI provider/model is used during data normalization.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className={`grid grid-cols-1 gap-4 ${form.provider === 'openai' ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-foreground">Provider</span>
                    <select
                      value={form.provider}
                      disabled={!canManage}
                      onChange={(event) => setForm((prev) => {
                        const provider = event.target.value as AIProvider;
                        return {
                          ...prev,
                          provider,
                          reasoning: provider === 'openai' ? prev.reasoning : 'medium'
                        };
                      })}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {PROVIDERS.map((provider) => (
                        <option key={provider.value} value={provider.value}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-sm font-medium text-foreground">Model</span>
                    <Input
                      value={form.model}
                      disabled={!canManage}
                      onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
                      placeholder="e.g. gpt-4o-mini"
                    />
                  </label>

                  {form.provider === 'openai' && (
                    <label className="space-y-1.5">
                      <span className="text-sm font-medium text-foreground">Reasoning</span>
                      <select
                        value={form.reasoning}
                        disabled={!canManage}
                        onChange={(event) => setForm((prev) => ({
                          ...prev,
                          reasoning: event.target.value as AIRuntimeReasoningEffort
                        }))}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {REASONING_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>

                <div className="space-y-1.5">
                  <span className="text-sm font-medium text-foreground">API Key</span>
                  <Input
                    type="password"
                    value={form.apiKey}
                    disabled={!canManage}
                    onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                    placeholder={settings?.has_api_key ? 'Enter new key to replace existing key' : 'Enter provider API key'}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <KeyRound className="h-3.5 w-3.5" />
                      Stored key status:{' '}
                    </span>
                    {settings?.has_api_key
                      ? `configured (${settings.api_key_masked || 'masked'})`
                      : 'not configured'}
                  </p>
                </div>

                <label className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={form.isEnabled}
                    disabled={!canManage}
                    onChange={(event) => setForm((prev) => ({ ...prev, isEnabled: event.target.checked }))}
                  />
                  Enable AI normalization runtime
                </label>

                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  {settings?.updated_at
                    ? `Last updated ${formatDateTimeValue(settings.updated_at)}${settings.updated_by_email ? ` by ${settings.updated_by_email}` : ''}.`
                    : 'No previous update metadata available.'}
                </div>
              </CardContent>
            </Card>

            {!canManage && (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                You can view AI settings, but you do not have permission to modify them.
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

export default AdminAISettings;
