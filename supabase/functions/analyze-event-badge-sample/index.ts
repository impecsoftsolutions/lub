// =============================================================================
// Edge Function: analyze-event-badge-sample
// Slice: COD-EVENTS-BADGE-DESIGN-AND-LIVE-RENDER-063A
//
// Analyzes the admin-only badge_sample event asset and writes a compact,
// structured design interpretation into events.ai_metadata. The uploaded
// sample/template assets remain admin-only; this function stores only style
// metadata used by event-badge-download at render time.
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

type AnalysisStatus = 'pending' | 'complete' | 'failed';

interface RequestBody {
  session_token?: string;
  event_id?: string;
  asset_id?: string;
}

interface AIRuntimeSettingsRow {
  provider: string;
  model: string;
  reasoning_effort: string | null;
  is_enabled: boolean;
  api_key_secret: string | null;
}

interface EventRow {
  id: string;
  title: string;
  created_by: string | null;
  ai_metadata: Record<string, unknown> | null;
}

interface AssetRow {
  id: string;
  event_id: string;
  kind: string;
  public_url: string;
  storage_path: string;
  label: string | null;
  mime_type: string | null;
  byte_size: number | null;
}

interface OpenAIResponsesAPIResponse {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
}

const VALID_REASONING_EFFORT = new Set(['low', 'medium', 'high', 'xhigh']);
const SUPPORTED_SAMPLE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']);
const MAX_SAMPLE_BYTES = 25 * 1024 * 1024;
const ANALYSIS_VERSION = 1;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function sanitizeReasoningEffort(value: string | null | undefined): string | null {
  const candidate = toStringValue(value).toLowerCase();
  return VALID_REASONING_EFFORT.has(candidate) ? candidate : null;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function rest<T>(supabaseUrl: string, serviceRoleKey: string, path: string): Promise<T | null> {
  const resp = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
    },
  });
  if (!resp.ok) return null;
  return (await resp.json()) as T;
}

async function rpc<T>(supabaseUrl: string, serviceRoleKey: string, fn: string, params: Record<string, unknown>): Promise<T | null> {
  const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(params),
  });
  if (!resp.ok) return null;
  return (await resp.json()) as T;
}

async function patchEventMetadata(
  supabaseUrl: string,
  serviceRoleKey: string,
  eventId: string,
  patch: Record<string, unknown>,
  removeKeys: string[] = [],
): Promise<Record<string, unknown> | null> {
  const rows = await rest<Array<{ ai_metadata: Record<string, unknown> | null }>>(
    supabaseUrl,
    serviceRoleKey,
    `events?id=eq.${encodeURIComponent(eventId)}&select=ai_metadata&limit=1`,
  );
  if (!rows || rows.length === 0) return null;
  const meta: Record<string, unknown> = { ...(rows[0].ai_metadata ?? {}) };
  for (const key of removeKeys) delete meta[key];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete meta[key];
    else meta[key] = value;
  }
  const resp = await fetch(`${supabaseUrl}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ ai_metadata: meta, updated_at: new Date().toISOString() }),
  });
  return resp.ok ? meta : null;
}

async function loadAIRuntimeSettings(supabaseUrl: string, serviceRoleKey: string): Promise<AIRuntimeSettingsRow | null> {
  const rows = await rest<AIRuntimeSettingsRow[]>(
    supabaseUrl,
    serviceRoleKey,
    'ai_runtime_settings?setting_key=eq.event_drafting&select=provider,model,reasoning_effort,is_enabled,api_key_secret&limit=1',
  );
  return rows?.[0] ?? null;
}

async function resolveActor(supabaseUrl: string, serviceRoleKey: string, sessionToken: string): Promise<string | null> {
  const value = await rpc<string | null>(supabaseUrl, serviceRoleKey, 'resolve_custom_session_user_id', {
    p_session_token: sessionToken,
  });
  return typeof value === 'string' && value ? value : null;
}

async function hasPermission(supabaseUrl: string, serviceRoleKey: string, userId: string, permission: string): Promise<boolean> {
  const value = await rpc<boolean>(supabaseUrl, serviceRoleKey, 'has_permission', {
    p_user_id: userId,
    p_permission_code: permission,
  });
  return value === true;
}

async function canEditEvent(
  supabaseUrl: string,
  serviceRoleKey: string,
  actorId: string,
  event: EventRow,
): Promise<boolean> {
  if (await hasPermission(supabaseUrl, serviceRoleKey, actorId, 'events.edit_any')) return true;
  if (!(await hasPermission(supabaseUrl, serviceRoleKey, actorId, 'events.edit_own'))) return false;
  return event.created_by === actorId;
}

function sanitizeHexColor(value: unknown, fallback: string): string {
  const raw = toStringValue(value);
  return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toUpperCase() : fallback;
}

function sanitizeAnalysis(raw: unknown, sourceAssetId: string): Record<string, unknown> {
  const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const colorsIn = input.colors && typeof input.colors === 'object'
    ? input.colors as Record<string, unknown>
    : {};
  const layoutIn = input.layout && typeof input.layout === 'object'
    ? input.layout as Record<string, unknown>
    : {};
  const typographyIn = input.typography && typeof input.typography === 'object'
    ? input.typography as Record<string, unknown>
    : {};
  const placementIn = input.placement && typeof input.placement === 'object'
    ? input.placement as Record<string, unknown>
    : {};

  const toneCandidate = toStringValue(input.tone).toLowerCase();
  const tone = ['formal', 'minimal', 'bold', 'compact'].includes(toneCandidate) ? toneCandidate : 'formal';
  const rawSummary = toStringValue(input.raw_summary || input.summary).slice(0, 500);

  return {
    version: ANALYSIS_VERSION,
    analyzed_at: new Date().toISOString(),
    source_asset_id: sourceAssetId,
    layout: {
      background: toStringValue(layoutIn.background).slice(0, 80),
      header_style: toStringValue(layoutIn.header_style).slice(0, 80),
      alignment: toStringValue(layoutIn.alignment).slice(0, 40) || 'centered',
      density: toStringValue(layoutIn.density).slice(0, 40),
    },
    typography: {
      title_style: toStringValue(typographyIn.title_style).slice(0, 80),
      name_style: toStringValue(typographyIn.name_style).slice(0, 80),
      casing: toStringValue(typographyIn.casing).slice(0, 40),
    },
    colors: {
      primary: sanitizeHexColor(colorsIn.primary, '#1A4F8A'),
      secondary: sanitizeHexColor(colorsIn.secondary, '#F3F6FA'),
      accent: sanitizeHexColor(colorsIn.accent, '#F97316'),
      text: sanitizeHexColor(colorsIn.text, '#111827'),
    },
    placement: {
      logo: toStringValue(placementIn.logo).slice(0, 80),
      qr: toStringValue(placementIn.qr).slice(0, 80),
      name: toStringValue(placementIn.name).slice(0, 80),
      designation: toStringValue(placementIn.designation).slice(0, 80),
      company: toStringValue(placementIn.company).slice(0, 80),
    },
    tone,
    raw_summary: rawSummary || 'Badge style analyzed from the uploaded sample.',
  };
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch { /* continue */ }
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI did not return a JSON object.');
  return JSON.parse(match[0]);
}

async function fetchAssetAsSource(asset: AssetRow): Promise<{ mime: string; filename: string; base64: string }> {
  const resp = await fetch(asset.public_url);
  if (!resp.ok) throw new Error(`Unable to read sample asset (${resp.status}).`);
  const mime = (asset.mime_type || resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!SUPPORTED_SAMPLE_MIMES.has(mime)) throw new Error('Unsupported sample format. Use PDF, JPEG, or PNG.');
  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (bytes.length <= 0 || bytes.length > MAX_SAMPLE_BYTES) throw new Error('Sample file size is invalid.');
  return {
    mime,
    filename: asset.label || asset.storage_path.split('/').pop() || 'badge-sample',
    base64: base64FromBytes(bytes),
  };
}

async function analyzeWithOpenAI(
  apiKey: string,
  model: string,
  reasoningEffort: string | null,
  event: EventRow,
  source: { mime: string; filename: string; base64: string },
): Promise<Record<string, unknown>> {
  const systemPrompt = `You analyze event badge sample designs for a 4x6 inch portrait badge renderer. Return ONLY valid JSON. Do not include markdown.`;
  const userPrompt = `Analyze this uploaded sample badge for the event "${event.title}". Extract reusable visual guidance for generating badges with the same broad style. Do not identify any person in the sample. Return this exact JSON shape:
{
  "layout": { "background": "short description", "header_style": "short description", "alignment": "centered|left|mixed", "density": "minimal|balanced|dense" },
  "typography": { "title_style": "short description", "name_style": "short description", "casing": "short description" },
  "colors": { "primary": "#RRGGBB", "secondary": "#RRGGBB", "accent": "#RRGGBB", "text": "#RRGGBB" },
  "placement": { "logo": "top|bottom|none|other", "qr": "top|middle|bottom|other", "name": "top|middle|bottom|other", "designation": "top|middle|bottom|other", "company": "top|middle|bottom|other" },
  "tone": "formal|minimal|bold|compact",
  "raw_summary": "human-readable summary under 500 characters"
}`;
  const dataUrl = `data:${source.mime};base64,${source.base64}`;
  const userParts: Array<Record<string, unknown>> = [
    { type: 'input_text', text: `${systemPrompt}\n\n${userPrompt}` },
  ];
  if (source.mime === 'application/pdf') {
    userParts.push({ type: 'input_file', filename: source.filename || 'sample.pdf', file_data: dataUrl });
  } else {
    userParts.push({ type: 'input_image', image_url: dataUrl });
  }
  const requestBody: Record<string, unknown> = {
    model,
    input: [{ role: 'user', content: userParts }],
  };
  if (reasoningEffort && model.toLowerCase().startsWith('gpt-5')) {
    requestBody.reasoning = { effort: reasoningEffort };
  }
  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  const body = (await resp.json()) as OpenAIResponsesAPIResponse;
  if (!resp.ok) throw new Error(body?.error?.message || `OpenAI request failed with ${resp.status}`);
  let text = toStringValue(body.output_text);
  if (!text && Array.isArray(body.output)) {
    const chunks: string[] = [];
    for (const item of body.output) {
      for (const c of item.content ?? []) {
        if (typeof c.text === 'string') chunks.push(c.text);
      }
    }
    text = chunks.join('\n').trim();
  }
  if (!text) throw new Error('AI returned empty analysis.');
  return sanitizeAnalysis(extractJsonObject(text), source.filename);
}

async function markFailed(
  supabaseUrl: string,
  serviceRoleKey: string,
  eventId: string,
  sourceAssetId: string,
  error: string,
): Promise<void> {
  await patchEventMetadata(supabaseUrl, serviceRoleKey, eventId, {
    badge_design_analysis_status: 'failed',
    badge_design_analysis_error: error.slice(0, 300),
    badge_design_analysis_updated_at: new Date().toISOString(),
    badge_design_analysis_source_asset_id: sourceAssetId,
  }, ['badge_design_analysis']);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, status: 'failed', error_code: 'bad_request', error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ success: false, status: 'failed', error_code: 'service_misconfigured', error: 'Service configuration missing.' }, 500);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ success: false, status: 'failed', error_code: 'bad_request', error: 'Invalid JSON body.' });
  }

  const sessionToken = toStringValue(body.session_token);
  const eventId = toStringValue(body.event_id);
  const assetId = toStringValue(body.asset_id);
  if (!sessionToken || !eventId || !assetId) {
    return jsonResponse({ success: false, status: 'failed', error_code: 'bad_request', error: 'session_token, event_id, and asset_id are required.' });
  }

  const actorId = await resolveActor(supabaseUrl, serviceRoleKey, sessionToken);
  if (!actorId) return jsonResponse({ success: false, status: 'failed', error_code: 'session_invalid', error: 'Invalid session.' });

  const eventRows = await rest<EventRow[]>(supabaseUrl, serviceRoleKey, `events?id=eq.${encodeURIComponent(eventId)}&select=id,title,created_by,ai_metadata&limit=1`);
  const event = eventRows?.[0];
  if (!event) return jsonResponse({ success: false, status: 'failed', error_code: 'event_not_found', error: 'Event not found.' });
  if (!(await canEditEvent(supabaseUrl, serviceRoleKey, actorId, event))) {
    return jsonResponse({ success: false, status: 'failed', error_code: 'permission_denied', error: 'Not authorized.' });
  }

  const assetRows = await rest<AssetRow[]>(
    supabaseUrl,
    serviceRoleKey,
    `event_assets?id=eq.${encodeURIComponent(assetId)}&event_id=eq.${encodeURIComponent(eventId)}&select=id,event_id,kind,public_url,storage_path,label,mime_type,byte_size&limit=1`,
  );
  const asset = assetRows?.[0];
  if (!asset) return jsonResponse({ success: false, status: 'failed', error_code: 'asset_not_found', error: 'Badge sample asset not found.' });
  if (asset.kind !== 'badge_sample') return jsonResponse({ success: false, status: 'failed', error_code: 'invalid_asset', error: 'Asset is not a badge sample.' });
  if (!SUPPORTED_SAMPLE_MIMES.has((asset.mime_type ?? '').toLowerCase())) {
    return jsonResponse({ success: false, status: 'failed', error_code: 'unsupported_format', error: 'Use PDF, JPEG, or PNG for the badge sample.' });
  }

  await patchEventMetadata(supabaseUrl, serviceRoleKey, eventId, {
    badge_design_analysis_status: 'pending',
    badge_design_analysis_error: null,
    badge_design_analysis_updated_at: new Date().toISOString(),
    badge_design_analysis_source_asset_id: assetId,
  }, ['badge_design_analysis']);

  const settings = await loadAIRuntimeSettings(supabaseUrl, serviceRoleKey);
  if (!settings || !settings.is_enabled) {
    const error = 'AI runtime "event_drafting" is not configured or enabled.';
    await markFailed(supabaseUrl, serviceRoleKey, eventId, assetId, error);
    return jsonResponse({ success: false, status: 'failed' as AnalysisStatus, error_code: 'ai_disabled', error });
  }
  const provider = toStringValue(settings.provider).toLowerCase();
  if (provider !== 'openai') {
    const error = `AI provider "${provider || 'unknown'}" is not supported for badge analysis.`;
    await markFailed(supabaseUrl, serviceRoleKey, eventId, assetId, error);
    return jsonResponse({ success: false, status: 'failed' as AnalysisStatus, error_code: 'provider_unsupported', error });
  }
  const apiKey = toStringValue(settings.api_key_secret);
  if (!apiKey) {
    const error = 'AI API key is not configured.';
    await markFailed(supabaseUrl, serviceRoleKey, eventId, assetId, error);
    return jsonResponse({ success: false, status: 'failed' as AnalysisStatus, error_code: 'no_api_key', error });
  }

  try {
    const source = await fetchAssetAsSource(asset);
    const analysis = await analyzeWithOpenAI(
      apiKey,
      toStringValue(settings.model) || 'gpt-4o-mini',
      sanitizeReasoningEffort(settings.reasoning_effort),
      event,
      source,
    );
    const updatedAt = new Date().toISOString();
    await patchEventMetadata(supabaseUrl, serviceRoleKey, eventId, {
      badge_design_analysis: { ...analysis, source_asset_id: assetId, analyzed_at: updatedAt },
      badge_design_analysis_status: 'complete',
      badge_design_analysis_error: null,
      badge_design_analysis_updated_at: updatedAt,
      badge_design_analysis_source_asset_id: assetId,
    });
    return jsonResponse({
      success: true,
      status: 'complete' as AnalysisStatus,
      updated_at: updatedAt,
      summary: toStringValue(analysis.raw_summary),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Badge sample analysis failed.';
    console.error('[analyze-event-badge-sample] failed:', { event_id: eventId, asset_id: assetId, error: message.slice(0, 180) });
    await markFailed(supabaseUrl, serviceRoleKey, eventId, assetId, message);
    return jsonResponse({ success: false, status: 'failed' as AnalysisStatus, error_code: 'generation_failed', error: message });
  }
});
