const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Hardcoded baseline that the legacy callers (Verify path in Join.tsx
// and Smart Upload `normalizeViaRulesEngine`) still send and read from
// the response. Always present in `original` and `normalized` so existing
// typed callers keep working even when admins delete the matching rule.
// Per COD-NORMALIZATION-RULES-ADD-DELETE-034 the runtime no longer GATES
// on this list — admin-added field_keys (data-driven) flow through too.
const LEGACY_BASELINE_FIELDS = [
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

// Cap on the number of normalization rules we apply per request, regardless
// of how many admin-added rules exist. Guards against runaway prompt size.
const MAX_NORMALIZABLE_FIELDS = 50;

// Field key validation mirrors the migration's CHECK regex so any malformed
// keys ever sneaking past the RPC layer are dropped here too.
const FIELD_KEY_RE = /^[a-z][a-z0-9_]{1,63}$/;

type NormalizationRecord = Record<string, string>;

type GenericPayload = Record<string, unknown>;

interface AIRuntimeSettingsRow {
  provider: string;
  model: string;
  reasoning_effort: string | null;
  is_enabled: boolean;
  api_key_secret: string | null;
}

interface NormalizationRuleRow {
  field_key: string;
  instruction_text: string;
  is_enabled: boolean;
  display_order: number;
  is_retired?: boolean;
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
// Fallback used only when the runtime cannot read the rules table (env
// missing / DB outage). Mirrors the original 9 baseline fields so callers
// keep behaving the same in degraded mode.
const DEFAULT_NORMALIZATION_RULES: Record<string, string> = {
  full_name: 'Title Case, trim extra spaces',
  company_name: 'Title Case, trim extra spaces',
  company_address: 'Trim extra spaces and normalize spacing',
  products_services: 'Trim extra spaces and normalize punctuation spacing',
  alternate_contact_name: 'Title Case, trim extra spaces',
  referred_by: 'Title Case, trim extra spaces',
  email: 'Keep as provided',
  mobile_number: 'Keep as provided',
  alternate_mobile: 'Keep as provided',
};

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Build the original record. We always include the legacy baseline keys
 * (typed callers depend on them) and ALSO include any extra payload keys
 * that pass field-key validation, so admin-added rules can be normalized
 * end-to-end. `_ai_runtime` and other underscore-prefixed control keys
 * are excluded.
 */
function buildOriginalRecord(payload: GenericPayload): NormalizationRecord {
  const original: NormalizationRecord = {};
  for (const field of LEGACY_BASELINE_FIELDS) {
    original[field] = toStringValue(payload[field]);
  }
  for (const key of Object.keys(payload)) {
    if (key.startsWith('_')) continue;
    if (original[key] !== undefined) continue;
    if (!FIELD_KEY_RE.test(key)) continue;
    original[key] = toStringValue(payload[key]);
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

async function loadNormalizationRules(): Promise<NormalizationRuleRow[] | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    console.warn('[normalize-member] normalization rules fallback: missing Supabase env');
    return null;
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/member_normalization_rules?select=field_key,instruction_text,is_enabled,display_order,is_retired&is_retired=eq.false&order=display_order.asc`,
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
      console.warn(`[normalize-member] normalization rules fallback: ${response.status} ${errorBody}`);
      return null;
    }

    const rows = (await response.json()) as NormalizationRuleRow[];
    return Array.isArray(rows) ? rows : null;
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[normalize-member] normalization rules fallback: ${details}`);
    return null;
  }
}

function buildEffectiveNormalizationRules(
  rows: NormalizationRuleRow[] | null
): Record<string, string> {
  if (!rows || rows.length === 0) {
    return { ...DEFAULT_NORMALIZATION_RULES };
  }

  const rules: Record<string, string> = {};
  let count = 0;

  for (const row of rows) {
    if (count >= MAX_NORMALIZABLE_FIELDS) break;
    if (row.is_retired === true) continue;
    if (!row.is_enabled) continue;

    const fieldKey = toStringValue(row.field_key).toLowerCase();
    if (!FIELD_KEY_RE.test(fieldKey)) continue;

    const instruction = toStringValue(row.instruction_text);
    if (!instruction) continue;

    rules[fieldKey] = instruction;
    count += 1;
  }

  return rules;
}

/**
 * Coerce the AI's normalized response into a record over the union of
 * (legacy baseline keys, original payload keys). For each key:
 *   - take the AI's normalized value when non-empty,
 *   - else fall back to the original input value.
 * This guarantees that callers never see an empty string for a key they
 * provided, even when the AI omitted it.
 */
function coerceNormalizedRecord(raw: unknown, fallbackOriginal: NormalizationRecord): NormalizationRecord {
  const source = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
  const normalized: NormalizationRecord = {};

  // Union of all keys we might want to pass through.
  const keys = new Set<string>();
  for (const k of LEGACY_BASELINE_FIELDS) keys.add(k);
  for (const k of Object.keys(fallbackOriginal)) keys.add(k);

  for (const field of keys) {
    const value = source[field];
    normalized[field] = toStringValue(value) || fallbackOriginal[field] || '';
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
  original: NormalizationRecord,
  rules: Record<string, string>
): Promise<NormalizationRecord> {
  const systemInstruction =
    'You normalize member registration fields for consistency. Return strict JSON only with either {"normalized": {...}} or {"original": {...}, "normalized": {...}}. Keep email and mobile numbers unchanged.';

  const userPrompt = JSON.stringify(
    {
      task: 'normalize_member_fields',
      fields: original,
      rules,
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

    const [settings, normalizationRules] = await Promise.all([
      loadAIRuntimeSettings(),
      loadNormalizationRules(),
    ]);
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

    const effectiveRules = buildEffectiveNormalizationRules(normalizationRules);
    if (Object.keys(effectiveRules).length === 0) {
      return new Response(JSON.stringify(buildPassthroughResult(original)), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalized = await callOpenAIForNormalization(
      apiKey,
      model,
      reasoningEffort,
      original,
      effectiveRules
    );

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
