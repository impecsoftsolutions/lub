// =============================================================================
// Edge Function: generate-member-welcome-message
//
// Generates a WhatsApp-ready welcome message for a member registration.
// Browser callers send the custom session token and selected registration facts.
// The function validates the admin session and members.view permission server-side,
// then uses the server-side AI runtime profile. The OpenAI key is never exposed
// to the browser.
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
  | 'permission_denied'
  | 'invalid_payload'
  | 'generation_failed';

interface AIRuntimeSettingsRow {
  provider: string;
  model: string;
  reasoning_effort: string | null;
  is_enabled: boolean;
  api_key_secret: string | null;
}

interface WelcomeMemberInput {
  full_name?: string;
  gender?: string;
  mobile_number?: string;
  company_name?: string;
  company_designation?: string;
  district?: string;
  state?: string;
  products_services?: string;
  brand_names?: string;
  referred_by?: string;
  website?: string;
}

interface WelcomeRequestBody {
  session_token?: string;
  member?: WelcomeMemberInput;
}

interface OpenAIResponsesAPIResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function failClosed(error: string, error_code: ErrorCode): Response {
  return jsonResponse({ success: false, error, error_code }, 200);
}

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

const VALID_REASONING_EFFORT = new Set(['low', 'medium', 'high', 'xhigh']);

function sanitizeReasoningEffort(value: string | null | undefined): string | null {
  const candidate = toStringValue(value).toLowerCase();
  if (!candidate) return null;
  return VALID_REASONING_EFFORT.has(candidate) ? candidate : null;
}

function limitText(value: unknown, maxLength: number): string {
  const clean = toStringValue(value).replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? clean.slice(0, maxLength).trim() : clean;
}

function sanitizeGeneratedText(value: string): string {
  return value
    .replace(/^```(?:json|text)?/i, '')
    .replace(/```$/i, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function parseJsonContent(content: string): Record<string, unknown> {
  const trimmed = sanitizeGeneratedText(content);
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI response was not valid JSON.');
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

async function rpcCall<T>(
  supabaseUrl: string,
  serviceRoleKey: string,
  fnName: string,
  params: Record<string, unknown>,
): Promise<T | null> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      console.warn(`[generate-member-welcome-message] rpcCall ${fnName} failed: ${response.status} ${errorBody}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (err) {
    console.warn(`[generate-member-welcome-message] rpcCall ${fnName} exception:`, err);
    return null;
  }
}

async function loadAIRuntimeSettings(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<AIRuntimeSettingsRow | null> {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/ai_runtime_settings?setting_key=eq.member_normalization&select=provider,model,reasoning_effort,is_enabled,api_key_secret&limit=1`,
      {
        method: 'GET',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: 'application/json',
        },
      },
    );
    if (!response.ok) {
      const errorBody = await response.text();
      console.warn(`[generate-member-welcome-message] loadAIRuntimeSettings: ${response.status} ${errorBody}`);
      return null;
    }
    const rows = (await response.json()) as AIRuntimeSettingsRow[];
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.warn('[generate-member-welcome-message] loadAIRuntimeSettings exception:', err);
    return null;
  }
}

function buildWelcomeSystemPrompt(): string {
  return [
    'You write WhatsApp welcome messages for Laghu Udyog Bharati, Andhra Pradesh.',
    'Output plain text only inside strict JSON: { "welcome_message": string }.',
    'Tone: warm, respectful, polished, community-oriented, and suitable for posting in an official WhatsApp group.',
    'Use short paragraphs and natural line breaks.',
    'Do not use emojis, Markdown, bullet symbols, or decorative characters.',
    'Do not invent facts such as brand names, referrals, phone numbers, websites, designations, awards, or locations.',
    'A single light business-related witty line is allowed only if it is clearly based on supplied products, services, or brand names.',
    'Use Shri. for male members and Smt. for female members when gender is clear. If gender is missing or unclear, use the member name without a title.',
    'Mention Referred by only when a referrer is supplied.',
    'Mention the contact number only when a mobile number is supplied.',
    'Keep the message under 1700 characters.',
  ].join(' ');
}

function buildWelcomeUserPrompt(member: WelcomeMemberInput): string {
  const facts = {
    full_name: limitText(member.full_name, 120),
    gender: limitText(member.gender, 30),
    mobile_number: limitText(member.mobile_number, 30),
    company_name: limitText(member.company_name, 180),
    company_designation: limitText(member.company_designation, 120),
    district: limitText(member.district, 80),
    state: limitText(member.state, 80) || 'Andhra Pradesh',
    products_services: limitText(member.products_services, 700),
    brand_names: limitText(member.brand_names, 250),
    referred_by: limitText(member.referred_by, 120),
    website: limitText(member.website, 180),
  };

  return JSON.stringify(
    {
      task: 'draft_member_welcome_whatsapp_message',
      organization: 'Laghu Udyog Bharati, Andhra Pradesh',
      signatory: {
        name: 'Tulasi Yogish Chandra',
        role: 'State President',
        organization: 'LUB, Andhra Pradesh',
        mobile: '+91 98480 43392',
      },
      required_signature: [
        'Regards,',
        'Tulasi Yogish Chandra',
        'State President',
        'LUB, Andhra Pradesh',
        'Mobile: +91 98480 43392',
      ].join('\n'),
      member_facts: facts,
      style_reference: [
        'Open with a warm welcome headline.',
        'Welcome the member to Laghu Udyog Bharati, Andhra Pradesh.',
        'Describe the company location and business using only supplied facts.',
        'Add one tasteful, light line when possible.',
        'Close with a positive community participation sentence and the required signature.',
      ],
    },
    null,
    2,
  );
}

async function callOpenAIResponses(
  apiKey: string,
  model: string,
  reasoningEffort: string | null,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const requestBody: Record<string, unknown> = {
    model,
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `${systemPrompt}\n\n${userPrompt}`,
          },
        ],
      },
    ],
  };

  if (reasoningEffort && model.toLowerCase().startsWith('gpt-5')) {
    requestBody.reasoning = { effort: reasoningEffort };
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const body = (await response.json()) as OpenAIResponsesAPIResponse;
  if (!response.ok) {
    throw new Error(body?.error?.message || `OpenAI request failed with ${response.status}`);
  }

  let textContent = toStringValue(body?.output_text);
  if (!textContent && Array.isArray(body?.output)) {
    const collected: string[] = [];
    for (const item of body.output) {
      if (Array.isArray(item?.content)) {
        for (const c of item.content) {
          if (c && typeof c === 'object' && typeof c.text === 'string') {
            collected.push(c.text);
          }
        }
      }
    }
    textContent = collected.join('\n').trim();
  }

  if (!textContent) {
    throw new Error('AI returned empty content.');
  }

  const parsed = parseJsonContent(textContent);
  const welcomeMessage = sanitizeGeneratedText(toStringValue(parsed.welcome_message));
  if (!welcomeMessage) {
    throw new Error('AI returned an empty welcome message.');
  }
  return welcomeMessage.length > 2000 ? welcomeMessage.slice(0, 2000).trim() : welcomeMessage;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { success: false, error: 'Method not allowed', error_code: 'generation_failed' as ErrorCode },
      405,
    );
  }

  let payload: WelcomeRequestBody;
  try {
    payload = (await req.json()) as WelcomeRequestBody;
  } catch {
    return failClosed('Invalid JSON request body.', 'invalid_payload');
  }

  const sessionToken = toStringValue(payload.session_token);
  const member = payload.member;

  if (!sessionToken) {
    return failClosed('Session token is required.', 'session_invalid');
  }
  if (!member || typeof member !== 'object') {
    return failClosed('Member details are required.', 'invalid_payload');
  }
  if (!toStringValue(member.full_name) || !toStringValue(member.company_name)) {
    return failClosed('Member name and company name are required.', 'invalid_payload');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[generate-member-welcome-message] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return failClosed('AI service is not configured. Please contact an administrator.', 'ai_disabled');
  }

  const userId = await rpcCall<string | null>(
    supabaseUrl,
    serviceRoleKey,
    'resolve_custom_session_user_id',
    { p_session_token: sessionToken },
  );
  if (!userId || typeof userId !== 'string') {
    return failClosed('Session is invalid or expired. Please sign in again.', 'session_invalid');
  }

  const canViewMembers = await rpcCall<boolean>(supabaseUrl, serviceRoleKey, 'has_permission', {
    p_user_id: userId,
    p_permission_code: 'members.view',
  });
  if (!canViewMembers) {
    return failClosed('You do not have permission to generate member welcome messages.', 'permission_denied');
  }

  const settings = await loadAIRuntimeSettings(supabaseUrl, serviceRoleKey);
  if (!settings) {
    return failClosed('AI runtime is not configured. Configure AI Settings first.', 'ai_disabled');
  }

  const provider = toStringValue(settings.provider).toLowerCase();
  const model = toStringValue(settings.model) || 'gpt-4o-mini';
  const enabled = Boolean(settings.is_enabled);
  const apiKey = toStringValue(settings.api_key_secret);
  const reasoningEffort = sanitizeReasoningEffort(settings.reasoning_effort);

  if (!enabled) {
    return failClosed('AI generation is disabled. Enable it in AI Settings.', 'ai_disabled');
  }
  if (provider !== 'openai') {
    return failClosed(
      `AI provider "${provider || 'unknown'}" is not supported for welcome messages. OpenAI is the only currently supported provider.`,
      'provider_unsupported',
    );
  }
  if (!apiKey) {
    return failClosed('AI API key is not configured. Please set it in AI Settings.', 'no_api_key');
  }

  try {
    const welcomeMessage = await callOpenAIResponses(
      apiKey,
      model,
      reasoningEffort,
      buildWelcomeSystemPrompt(),
      buildWelcomeUserPrompt(member),
    );

    return jsonResponse({
      success: true,
      data: {
        welcome_message: welcomeMessage,
      },
      ai: {
        model,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Welcome message generation failed.';
    console.error('[generate-member-welcome-message] generation error:', message);
    return failClosed(`AI welcome message generation failed: ${message}`, 'generation_failed');
  }
});
