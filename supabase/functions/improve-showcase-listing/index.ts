// =============================================================================
// Edge Function: improve-showcase-listing
//
// AI helper that improves showcase listing copy for an approved paid member.
// Browser sends session_token + basic listing details.
// Server validates session + approved-member status, reads AI runtime settings
// (key: business_showcase_drafting, falls back to member_normalization),
// calls OpenAI, and returns suggested text only.
// The member must review and accept/edit before saving; AI does not auto-publish.
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

type ErrorCode =
  | 'ai_disabled'
  | 'provider_unsupported'
  | 'no_api_key'
  | 'session_invalid'
  | 'not_approved_member'
  | 'invalid_payload'
  | 'generation_failed';

interface AIRuntimeSettingsRow {
  provider: string;
  model: string;
  reasoning_effort: string | null;
  is_enabled: boolean;
  api_key_secret: string | null;
}

interface ListingInput {
  title?: string;
  product_service_name?: string;
  category?: string;
  short_description?: string;
  detailed_description?: string;
  state?: string;
  district?: string;
}

interface RequestBody {
  session_token?: string;
  listing?: ListingInput;
}

interface ApprovedRow {
  status: string;
  is_active: boolean;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function failClosed(error: string, error_code: ErrorCode): Response {
  return jsonResponse({ success: false, error, error_code });
}

function toStr(v: unknown, max = 500): string {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max).trim() : s;
}

function sanitize(s: string): string {
  return s
    .replace(/^```(?:json|text)?/i, '')
    .replace(/```$/i, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

const VALID_REASONING = new Set(['low', 'medium', 'high', 'xhigh']);

function sanitizeEffort(v: string | null | undefined): string | null {
  const c = toStr(v, 10).toLowerCase();
  return VALID_REASONING.has(c) ? c : null;
}

async function rpcCall<T>(
  supabaseUrl: string,
  serviceRoleKey: string,
  fnName: string,
  params: Record<string, unknown>,
): Promise<T | null> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      console.warn(`[improve-showcase] rpc ${fnName} ${res.status}: ${await res.text()}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[improve-showcase] rpc ${fnName} exception:`, err);
    return null;
  }
}

async function loadAISettings(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<AIRuntimeSettingsRow | null> {
  // Try business_showcase_drafting first, fall back to member_normalization
  for (const key of ['business_showcase_drafting', 'member_normalization']) {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/ai_runtime_settings?setting_key=eq.${key}&select=provider,model,reasoning_effort,is_enabled,api_key_secret&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: 'application/json',
        },
      },
    );
    if (!res.ok) continue;
    const rows = (await res.json()) as AIRuntimeSettingsRow[];
    if (Array.isArray(rows) && rows.length > 0 && rows[0].is_enabled) {
      return rows[0];
    }
  }
  return null;
}

function buildSystemPrompt(): string {
  return [
    'You help MSME entrepreneurs on the LUB (Laghu Udyog Bharati) portal improve their business showcase listings.',
    'LUB is India\'s leading MSME organization focused on manufacturing and Make-in-India.',
    'Your output must be strict JSON: { "title": string, "product_service_name": string, "short_description": string, "detailed_description": string }.',
    'Rules: improve clarity and appeal; keep text professional and factual; do not invent products, certifications, awards, or claims not in the input.',
    'short_description: max 200 characters; single sentence suitable for a listing card.',
    'detailed_description: 3-5 sentences; highlight product quality, use case, and business differentiator.',
    'title: concise and descriptive; max 80 characters.',
    'product_service_name: clean product or service name; max 100 characters.',
    'Do not use emojis, markdown, or bullet points in the JSON values.',
    'Return only the JSON object with those four keys.',
  ].join(' ');
}

function buildUserPrompt(listing: ListingInput): string {
  return JSON.stringify({
    task: 'improve_showcase_listing',
    organization: 'Laghu Udyog Bharati (LUB) - MSME Portal',
    listing_details: {
      title:                 toStr(listing.title, 120),
      product_service_name:  toStr(listing.product_service_name, 150),
      category:              toStr(listing.category, 80),
      short_description:     toStr(listing.short_description, 300),
      detailed_description:  toStr(listing.detailed_description, 1000),
      state:                 toStr(listing.state, 80),
      district:              toStr(listing.district, 80),
    },
  }, null, 2);
}

interface OpenAIResponsesAPIResponse {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string }> }>;
  error?: { message?: string };
}

async function callOpenAI(
  apiKey: string,
  model: string,
  reasoningEffort: string | null,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ title: string; product_service_name: string; short_description: string; detailed_description: string }> {
  const body: Record<string, unknown> = {
    model,
    input: [{
      role: 'user',
      content: [{ type: 'input_text', text: `${systemPrompt}\n\n${userPrompt}` }],
    }],
  };

  if (reasoningEffort && model.toLowerCase().startsWith('gpt-5')) {
    body.reasoning = { effort: reasoningEffort };
  }

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as OpenAIResponsesAPIResponse;
  if (!res.ok) {
    throw new Error(data?.error?.message || `OpenAI ${res.status}`);
  }

  let text = toStr(data?.output_text, 10000);
  if (!text && Array.isArray(data?.output)) {
    const parts: string[] = [];
    for (const item of data.output) {
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (c && typeof c.text === 'string') parts.push(c.text);
        }
      }
    }
    text = parts.join('\n').trim();
  }
  if (!text) throw new Error('AI returned empty content.');

  const cleaned = sanitize(text);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI response was not valid JSON.');
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  }

  return {
    title:                toStr(parsed.title, 120),
    product_service_name: toStr(parsed.product_service_name, 150),
    short_description:    toStr(parsed.short_description, 300),
    detailed_description: toStr(parsed.detailed_description, 1500),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed', error_code: 'invalid_payload' as ErrorCode }, 405);
  }

  let payload: RequestBody;
  try {
    payload = (await req.json()) as RequestBody;
  } catch {
    return failClosed('Invalid JSON request body.', 'invalid_payload');
  }

  const sessionToken = toStr(payload.session_token, 200);
  const listing = payload.listing;

  if (!sessionToken) return failClosed('session_token is required.', 'session_invalid');
  if (!listing || typeof listing !== 'object') return failClosed('listing details are required.', 'invalid_payload');

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[improve-showcase] Missing env vars');
    return failClosed('Service not configured. Please contact an administrator.', 'ai_disabled');
  }

  // Validate session
  const userId = await rpcCall<string | null>(
    supabaseUrl, serviceRoleKey,
    'resolve_custom_session_user_id',
    { p_session_token: sessionToken },
  );
  if (!userId || typeof userId !== 'string') {
    return failClosed('Session invalid or expired. Please sign in again.', 'session_invalid');
  }

  // Check approved member
  const regRows = await (async () => {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/member_registrations?member_id=eq.${encodeURIComponent(userId)}&select=status,is_active&order=created_at.desc&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: 'application/json',
        },
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as ApprovedRow[];
  })();

  const isApproved = Array.isArray(regRows)
    && regRows.length > 0
    && regRows[0].status === 'approved'
    && regRows[0].is_active === true;

  if (!isApproved) {
    return failClosed(
      'Only approved paid LUB members can use the AI showcase helper.',
      'not_approved_member',
    );
  }

  // Load AI settings
  const settings = await loadAISettings(supabaseUrl, serviceRoleKey);
  if (!settings) {
    return failClosed('AI runtime is not configured or disabled. Configure AI Settings first.', 'ai_disabled');
  }

  const provider        = toStr(settings.provider, 30).toLowerCase();
  const model           = toStr(settings.model, 100) || 'gpt-4o-mini';
  const apiKey          = toStr(settings.api_key_secret, 500);
  const reasoningEffort = sanitizeEffort(settings.reasoning_effort);

  if (!settings.is_enabled) {
    return failClosed('AI generation is disabled. Enable it in AI Settings.', 'ai_disabled');
  }
  if (provider !== 'openai') {
    return failClosed(
      `Provider "${provider || 'unknown'}" is not supported. OpenAI is required.`,
      'provider_unsupported',
    );
  }
  if (!apiKey) {
    return failClosed('AI API key is not configured. Please set it in AI Settings.', 'no_api_key');
  }

  try {
    const improved = await callOpenAI(
      apiKey, model, reasoningEffort,
      buildSystemPrompt(),
      buildUserPrompt(listing),
    );

    return jsonResponse({
      success: true,
      data: improved,
      ai: { model, generated_at: new Date().toISOString() },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Generation failed.';
    console.error('[improve-showcase] error:', msg);
    return failClosed(`AI improvement failed: ${msg}`, 'generation_failed');
  }
});
