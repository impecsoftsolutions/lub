const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const NORMALIZABLE_FIELDS = [
  'full_name',
  'email',
  'mobile_number',
  'company_name',
  'company_address',
  'products_services',
  'alternate_contact_name',
  'alternate_mobile',
  'referred_by',
] as const;

type NormalizableField = (typeof NORMALIZABLE_FIELDS)[number];
type NormalizationRecord = Record<NormalizableField, string>;

type GenericPayload = Record<string, unknown>;

interface AIRuntimeSettingsRow {
  provider: string;
  model: string;
  reasoning_effort: string | null;
  is_enabled: boolean;
  api_key_secret: string | null;
}

interface OpenAICompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

const VALID_REASONING_EFFORT = new Set(['low', 'medium', 'high', 'xhigh']);

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function buildOriginalRecord(payload: GenericPayload): NormalizationRecord {
  const original = {} as NormalizationRecord;
  for (const field of NORMALIZABLE_FIELDS) {
    original[field] = toStringValue(payload[field]);
  }
  return original;
}

function buildPassthroughResult(original: NormalizationRecord) {
  return {
    original,
    normalized: { ...original },
  };
}

function sanitizeReasoningEffort(value: string | null | undefined): string | null {
  const candidate = toStringValue(value).toLowerCase();
  if (!candidate) return null;
  return VALID_REASONING_EFFORT.has(candidate) ? candidate : null;
}

async function loadAIRuntimeSettings(): Promise<AIRuntimeSettingsRow | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/ai_runtime_settings?setting_key=eq.member_normalization&select=provider,model,reasoning_effort,is_enabled,api_key_secret&limit=1`,
    {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to read ai_runtime_settings: ${response.status} ${errorBody}`);
  }

  const rows = (await response.json()) as AIRuntimeSettingsRow[];
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return rows[0] ?? null;
}

function coerceNormalizedRecord(raw: unknown, fallbackOriginal: NormalizationRecord): NormalizationRecord {
  if (!raw || typeof raw !== 'object') {
    return { ...fallbackOriginal };
  }

  const source = raw as Record<string, unknown>;
  const normalized = {} as NormalizationRecord;

  for (const field of NORMALIZABLE_FIELDS) {
    const value = source[field];
    normalized[field] = toStringValue(value) || fallbackOriginal[field];
  }

  return normalized;
}

function extractNormalizationContent(messageContent: string): unknown {
  try {
    return JSON.parse(messageContent);
  } catch {
    const firstBrace = messageContent.indexOf('{');
    const lastBrace = messageContent.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const sliced = messageContent.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(sliced);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callOpenAIForNormalization(
  apiKey: string,
  model: string,
  reasoningEffort: string | null,
  original: NormalizationRecord
): Promise<NormalizationRecord> {
  const systemInstruction =
    'You normalize member registration fields for consistency. Return strict JSON only with either {"normalized": {...}} or {"original": {...}, "normalized": {...}}. Keep email and mobile numbers unchanged.';

  const userPrompt = JSON.stringify(
    {
      task: 'normalize_member_fields',
      fields: original,
      rules: {
        full_name: 'Title Case, trim extra spaces',
        company_name: 'Title Case, trim extra spaces',
        company_address: 'Trim extra spaces and normalize spacing',
        products_services: 'Trim extra spaces and normalize punctuation spacing',
        alternate_contact_name: 'Title Case, trim extra spaces',
        referred_by: 'Title Case, trim extra spaces',
        email: 'Keep as provided',
        mobile_number: 'Keep as provided',
        alternate_mobile: 'Keep as provided',
      },
    },
    null,
    2
  );

  const requestBody: Record<string, unknown> = {
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: userPrompt },
    ],
  };

  if (reasoningEffort && model.toLowerCase().startsWith('gpt-5')) {
    requestBody.reasoning_effort = reasoningEffort;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const body = (await response.json()) as OpenAICompletionResponse;
  if (!response.ok) {
    const message = body?.error?.message || `OpenAI request failed with ${response.status}`;
    throw new Error(message);
  }

  const content = body?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    return { ...original };
  }

  const parsed = extractNormalizationContent(content);
  if (!parsed || typeof parsed !== 'object') {
    return { ...original };
  }

  const parsedObj = parsed as Record<string, unknown>;
  const candidate = parsedObj.normalized && typeof parsedObj.normalized === 'object'
    ? parsedObj.normalized
    : parsedObj;

  return coerceNormalizedRecord(candidate, original);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = (await req.json()) as GenericPayload;
    const original = buildOriginalRecord(payload);

    const settings = await loadAIRuntimeSettings();
    if (!settings) {
      return new Response(JSON.stringify(buildPassthroughResult(original)), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const provider = toStringValue(settings.provider).toLowerCase();
    const model = toStringValue(settings.model) || 'gpt-4o-mini';
    const enabled = Boolean(settings.is_enabled);
    const apiKey = toStringValue(settings.api_key_secret);
    const reasoningEffort = sanitizeReasoningEffort(settings.reasoning_effort);

    if (!enabled || provider !== 'openai' || !apiKey) {
      return new Response(JSON.stringify(buildPassthroughResult(original)), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalized = await callOpenAIForNormalization(apiKey, model, reasoningEffort, original);

    return new Response(
      JSON.stringify({
        original,
        normalized,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    console.error('[normalize-member] Error:', details);
    return new Response(
      JSON.stringify({
        error: 'Normalization failed',
        details,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
