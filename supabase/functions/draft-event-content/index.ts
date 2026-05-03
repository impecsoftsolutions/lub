// =============================================================================
// Edge Function: draft-event-content
// Slice: COD-EVENTS-CMS-AI-AUTOFILL-038
//
// Two operating modes (request body field `mode`):
//
//   "draft" (default) — Generates an AI-assisted Event draft from a freeform
//   "Event Brief" plus optional manual hints and optional source files.
//   Returns the full event field set (title, slug, excerpt, description,
//   event_type, visibility, start_at, end_at, location, invitation_text,
//   agenda_items, show_agenda_publicly suggestion) plus an `ai` metadata
//   block with model + generated_at + source_doc_count + brief_chars.
//
//   "extract_fields" — Reads supplied source files (at least one required)
//   and returns structured guided-input field values
//   (event_type, location, start_at, end_at, location_options[], date_options[]).
//
// Source file limits (match draft-activity-content for parity):
//   - Max 5 files per request
//   - Images (JPEG/PNG): <= 30 MB per file
//   - PDFs:              <= 30 MB per file
//   - Cumulative:        <= 150 MB
//
// Brief limit:
//   - <= 4000 characters; truncated server-side beyond that.
//
// Authorization:
//   - session_token must resolve to an active user via
//     public.resolve_custom_session_user_id(p_session_token)
//   - that user must have one of:
//       events.create, events.edit_any, events.edit_own.
//
// AI runtime:
//   - reads ai_runtime_settings row for setting_key='event_drafting'.
//   - falls back ai_disabled when missing/disabled or provider != openai.
//
// Output — draft mode (success):
//   {
//     success: true,
//     data: {
//       title, slug, excerpt, description,
//       event_type, visibility,
//       start_at | null, end_at | null,
//       location | null,
//       invitation_text,
//       agenda_items: [{ title, time?, note? }, ...],
//       show_agenda_publicly: boolean
//     },
//     ai: { model, generated_at, source_doc_count, brief_chars }
//   }
//
// Output — extract_fields mode (success):
//   { success: true, fields: { ...optional structured fields } }
//
// Output (failure / fail-closed) — always HTTP 200 with structured error_code:
//   { success: false, error: string, error_code: ErrorCode }
//
// ErrorCode union:
//   'ai_disabled' | 'provider_unsupported' | 'no_api_key'
//   | 'session_invalid' | 'permission_denied'
//   | 'brief_required' | 'files_too_large' | 'files_too_many'
//   | 'unsupported_format' | 'generation_failed'
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
  | 'brief_required'
  | 'files_too_large'
  | 'files_too_many'
  | 'unsupported_format'
  | 'generation_failed';

interface DraftInputs {
  title?: string;
  event_type?: string;
  visibility?: string;
  start_at?: string;
  end_at?: string;
  location?: string;
}

interface SourceFile {
  name: string;
  mime: string;
  base64: string;
}

interface DraftRequestBody {
  session_token?: string;
  mode?: 'draft' | 'extract_fields' | 'draft_whatsapp';
  brief?: string;
  inputs?: DraftInputs;
  source_files?: SourceFile[];
}

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

interface OpenAIResponsesAPIResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
}

const VALID_REASONING_EFFORT = new Set(['low', 'medium', 'high', 'xhigh']);

const SUPPORTED_SOURCE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
]);

const MAX_SOURCE_FILES = 5;
const MAX_SOURCE_FILE_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_SOURCE_FILE_PDF_BYTES = 30 * 1024 * 1024;
const MAX_SOURCE_FILES_TOTAL_BYTES = 150 * 1024 * 1024;
const MAX_BRIEF_CHARS = 4000;

const ALLOWED_EVENT_TYPES = new Set([
  'workshop',
  'seminar',
  'webinar',
  'meeting',
  'exhibition',
  'conference',
  'networking',
  'other',
  'general',
]);

const ALLOWED_VISIBILITIES = new Set(['public', 'member_only']);

interface DraftEventOutput {
  title: string;
  slug: string;
  excerpt: string;
  description: string;
  event_type: string;
  visibility: 'public' | 'member_only';
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  invitation_text: string;
  agenda_items: Array<{ title: string; time?: string; note?: string }>;
  show_agenda_publicly: boolean;
  whatsapp_invitation_message: string;
}

const MAX_WHATSAPP_MESSAGE_CHARS = 1200;

interface ExtractionFields {
  event_type?: string;
  location?: string;
  location_options?: string[];
  start_at?: string;
  end_at?: string;
  date_options?: string[];
  agenda_items?: Array<{ title: string; time?: string; note?: string }>;
}

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function sanitizeReasoningEffort(value: string | null | undefined): string | null {
  const candidate = toStringValue(value).toLowerCase();
  if (!candidate) return null;
  return VALID_REASONING_EFFORT.has(candidate) ? candidate : null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function failClosed(error: string, error_code: ErrorCode): Response {
  return jsonResponse({ success: false, error, error_code }, 200);
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
      console.warn(`[draft-event-content] rpcCall ${fnName} failed: ${response.status} ${errorBody}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (err) {
    console.warn(`[draft-event-content] rpcCall ${fnName} exception:`, err);
    return null;
  }
}

async function loadAIRuntimeSettings(
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<AIRuntimeSettingsRow | null> {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/ai_runtime_settings?setting_key=eq.event_drafting&select=provider,model,reasoning_effort,is_enabled,api_key_secret&limit=1`,
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
      console.warn(`[draft-event-content] loadAIRuntimeSettings: ${response.status} ${errorBody}`);
      return null;
    }
    const rows = (await response.json()) as AIRuntimeSettingsRow[];
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.warn('[draft-event-content] loadAIRuntimeSettings exception:', err);
    return null;
  }
}

function slugifyServer(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

// ── Prompts ─────────────────────────────────────────────────────────────────

function buildDraftSystemPrompt(hasSourceFiles: boolean): string {
  const base = [
    'You draft structured event posts for a member-association events CMS.',
    'Tone: professional, welcoming, factual, member-facing. Avoid emojis and clickbait.',
    'Keep all output grounded in the supplied brief and any uploaded reference files.',
    'Do not invent dates, times, locations, speaker names, or attendance figures that are not present in the inputs.',
    'If a value cannot be determined, omit the field or set it to null.',
  ];
  if (hasSourceFiles) {
    base.push(
      'Treat uploaded documents as additional reference material; ignore content unrelated to this event.',
    );
  }
  base.push(
    'Return strict JSON only with this exact shape:',
    '{',
    '  "title": string,',
    '  "slug": string,',
    '  "excerpt": string,',
    '  "description": string,',
    '  "event_type": "workshop"|"seminar"|"webinar"|"meeting"|"exhibition"|"conference"|"networking"|"other"|"general",',
    '  "visibility": "public"|"member_only",',
    '  "start_at": string|null,    // ISO 8601 with timezone if present',
    '  "end_at":   string|null,',
    '  "location": string|null,',
    '  "invitation_text": string,',
    '  "agenda_items": [{ "title": string, "time"?: string, "note"?: string }],',
    '  "show_agenda_publicly": boolean,',
    '  "whatsapp_invitation_message": string',
    '}',
    'title: short, descriptive, <= 90 characters, no trailing punctuation.',
    'slug: lowercase letters, digits, and hyphens only, <= 60 characters; client/server may re-validate.',
    'excerpt: 1-2 sentences, <= 280 characters, plain text, listing-card friendly.',
    'description: 2-4 short paragraphs (~150-500 words), plain text, no Markdown.',
    'invitation_text: a short invitation paragraph addressed to members; avoid all-caps; do not include a salutation header.',
    'agenda_items: chronological array; each title is required; time is optional but preferred (e.g. "10:00 AM"); leave the array empty when no agenda is implied.',
    'event_type: pick the closest of the listed values. If unsure, use "general".',
    'visibility: default to "public" unless the brief indicates members-only.',
    'show_agenda_publicly: default true when an agenda is present; otherwise false.',
    'whatsapp_invitation_message: a concise, ready-to-share WhatsApp invitation message for members. Plain text only (no Markdown), <= 1200 characters. Use short paragraphs and line breaks for readability. Open with a warm greeting, name the event, summarize what attendees will gain in 1-2 lines, then list date/time and venue (or online link) when known. End with a simple call-to-action to RSVP or ask for details. Do not invent dates, venues, or speaker names that are not present in the inputs. Avoid all-caps and avoid heavy emoji use; a single welcoming emoji is acceptable but not required.',
  );
  return base.join(' ');
}

function buildDraftUserMessage(brief: string, inputs: DraftInputs): string {
  const factBlock: Record<string, string> = {};
  for (const [k, v] of Object.entries(inputs)) {
    const s = toStringValue(v);
    if (s) factBlock[k] = s;
  }
  return JSON.stringify(
    {
      task: 'draft_event_post',
      brief,
      hints: factBlock,
    },
    null,
    2,
  );
}

function buildExtractionSystemPrompt(): string {
  return [
    'You are a document parsing assistant for an events CMS.',
    'Read the supplied documents (and brief if any) and extract any of these fields if clearly present:',
    'event_type (one of: workshop, seminar, webinar, meeting, exhibition, conference, networking, other, general),',
    'location (city, venue, or online link), location_options (array when multiple plausible locations),',
    'start_at (ISO 8601 with timezone if known), end_at (ISO 8601), date_options (array of ISO 8601 dates),',
    'agenda_items (array of { title, time?, note? } in chronological order).',
    'Do not invent values that are not in the documents.',
    'Return strict JSON only — no explanation, no markdown.',
  ].join(' ');
}

// ── Parse helpers ───────────────────────────────────────────────────────────

function parseJsonContent(content: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      parsed = JSON.parse(content.slice(firstBrace, lastBrace + 1));
    } else {
      throw new Error('AI returned non-JSON content.');
    }
  }
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
}

function coerceAgendaItems(raw: unknown): Array<{ title: string; time?: string; note?: string }> {
  if (!Array.isArray(raw)) return [];
  const items: Array<{ title: string; time?: string; note?: string }> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const title = toStringValue(obj.title);
    if (!title) continue;
    const time = toStringValue(obj.time);
    const note = toStringValue(obj.note);
    const item: { title: string; time?: string; note?: string } = { title };
    if (time) item.time = time;
    if (note) item.note = note;
    items.push(item);
  }
  return items;
}

function parseDraftJson(content: string): DraftEventOutput {
  const obj = parseJsonContent(content);
  const title = toStringValue(obj.title);
  const description = toStringValue(obj.description);
  const excerpt = toStringValue(obj.excerpt);
  const aiSlug = toStringValue(obj.slug);
  const eventTypeRaw = toStringValue(obj.event_type).toLowerCase();
  const visibilityRaw = toStringValue(obj.visibility).toLowerCase();
  const invitationText = toStringValue(obj.invitation_text);
  const startAtRaw = toStringValue(obj.start_at);
  const endAtRaw = toStringValue(obj.end_at);
  const locationRaw = toStringValue(obj.location);
  const showAgendaPublicly =
    typeof obj.show_agenda_publicly === 'boolean'
      ? obj.show_agenda_publicly
      : false;
  const whatsappRaw = toStringValue(obj.whatsapp_invitation_message);
  const whatsappMessage = whatsappRaw.length > MAX_WHATSAPP_MESSAGE_CHARS
    ? whatsappRaw.slice(0, MAX_WHATSAPP_MESSAGE_CHARS)
    : whatsappRaw;

  if (!title) {
    throw new Error('AI response missing required title.');
  }

  const event_type = ALLOWED_EVENT_TYPES.has(eventTypeRaw) ? eventTypeRaw : 'general';
  const visibility = (ALLOWED_VISIBILITIES.has(visibilityRaw) ? visibilityRaw : 'public') as
    | 'public'
    | 'member_only';

  const agenda = coerceAgendaItems(obj.agenda_items);

  return {
    title,
    slug: slugifyServer(aiSlug || title),
    excerpt,
    description,
    event_type,
    visibility,
    start_at: startAtRaw || null,
    end_at: endAtRaw || null,
    location: locationRaw || null,
    invitation_text: invitationText,
    agenda_items: agenda,
    show_agenda_publicly: agenda.length > 0 ? showAgendaPublicly : false,
    whatsapp_invitation_message: whatsappMessage,
  };
}

function parseExtractionJson(content: string): ExtractionFields {
  const obj = parseJsonContent(content);
  const fields: ExtractionFields = {};
  const STRING_KEYS: (keyof ExtractionFields)[] = ['event_type', 'location', 'start_at', 'end_at'];
  for (const key of STRING_KEYS) {
    const v = toStringValue(obj[key]);
    if (v) (fields[key] as string | undefined) = v;
  }
  if (fields.event_type && !ALLOWED_EVENT_TYPES.has(String(fields.event_type).toLowerCase())) {
    delete fields.event_type;
  }
  if (Array.isArray(obj.location_options)) {
    const list = obj.location_options
      .map((v) => toStringValue(v))
      .filter((v): v is string => Boolean(v));
    if (list.length > 0) fields.location_options = Array.from(new Set(list));
  }
  if (Array.isArray(obj.date_options)) {
    const list = obj.date_options
      .map((v) => toStringValue(v))
      .filter((v): v is string => Boolean(v));
    if (list.length > 0) fields.date_options = Array.from(new Set(list));
  }
  const agenda = coerceAgendaItems(obj.agenda_items);
  if (agenda.length > 0) fields.agenda_items = agenda;
  return fields;
}

// ── OpenAI calls ────────────────────────────────────────────────────────────

async function callOpenAIChatCompletions(
  apiKey: string,
  model: string,
  reasoningEffort: string | null,
  systemPrompt: string,
  userPrompt: string,
): Promise<DraftEventOutput> {
  const requestBody: Record<string, unknown> = {
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
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
    throw new Error('AI returned empty content.');
  }
  return parseDraftJson(content);
}

function buildResponsesContent(
  systemPrompt: string,
  userPrompt: string,
  sourceFiles: SourceFile[],
): Array<Record<string, unknown>> {
  const userParts: Array<Record<string, unknown>> = [];
  userParts.push({ type: 'input_text', text: `${systemPrompt}\n\n${userPrompt}` });
  for (const f of sourceFiles) {
    const dataUrl = `data:${f.mime};base64,${f.base64}`;
    if (f.mime === 'application/pdf') {
      userParts.push({ type: 'input_file', filename: f.name || 'source.pdf', file_data: dataUrl });
    } else {
      userParts.push({ type: 'input_image', image_url: dataUrl });
    }
  }
  return [{ role: 'user', content: userParts }];
}

async function callOpenAIResponsesAPI(
  apiKey: string,
  model: string,
  reasoningEffort: string | null,
  systemPrompt: string,
  userPrompt: string,
  sourceFiles: SourceFile[],
): Promise<DraftEventOutput> {
  const requestBody: Record<string, unknown> = {
    model,
    input: buildResponsesContent(systemPrompt, userPrompt, sourceFiles),
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
    const message = body?.error?.message || `OpenAI Responses request failed with ${response.status}`;
    throw new Error(message);
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
    throw new Error('AI Responses API returned empty content.');
  }
  return parseDraftJson(textContent);
}

async function callOpenAIResponsesAPIExtract(
  apiKey: string,
  model: string,
  reasoningEffort: string | null,
  brief: string,
  sourceFiles: SourceFile[],
): Promise<ExtractionFields> {
  const systemText = buildExtractionSystemPrompt();
  const parts: Array<Record<string, unknown>> = [
    { type: 'input_text', text: systemText },
  ];
  if (brief) {
    parts.push({ type: 'input_text', text: `Brief:\n${brief}` });
  }
  for (const f of sourceFiles) {
    const dataUrl = `data:${f.mime};base64,${f.base64}`;
    if (f.mime === 'application/pdf') {
      parts.push({ type: 'input_file', filename: f.name || 'source.pdf', file_data: dataUrl });
    } else {
      parts.push({ type: 'input_image', image_url: dataUrl });
    }
  }
  const requestBody: Record<string, unknown> = {
    model,
    input: [{ role: 'user', content: parts }],
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
    throw new Error(body?.error?.message || `OpenAI Responses request failed with ${response.status}`);
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
    throw new Error('AI Responses API returned empty content for extraction.');
  }
  return parseExtractionJson(textContent);
}

// ── WhatsApp-only generation ────────────────────────────────────────────────

function buildWhatsappSystemPrompt(): string {
  return [
    'You write a single concise WhatsApp invitation message for a member-association event.',
    'Plain text only. No Markdown. No HTML. No code fences. <= 1200 characters total.',
    'Open with a short warm greeting, name the event, summarize the value in 1-2 lines, then list date/time and venue (or online link) when known.',
    'End with a simple call-to-action to RSVP or ask for details.',
    'Use short paragraphs and line breaks for readability.',
    'Avoid all-caps. A single welcoming emoji is acceptable; do not require emojis.',
    'Do not invent dates, times, venues, speaker names, or sponsor names that are not present in the inputs.',
    'Return strict JSON only with this exact shape: { "whatsapp_invitation_message": string }',
  ].join(' ');
}

function buildWhatsappUserMessage(brief: string, inputs: DraftInputs): string {
  const factBlock: Record<string, string> = {};
  for (const [k, v] of Object.entries(inputs)) {
    const s = toStringValue(v);
    if (s) factBlock[k] = s;
  }
  return JSON.stringify(
    {
      task: 'draft_event_whatsapp_invitation',
      brief,
      hints: factBlock,
    },
    null,
    2,
  );
}

function parseWhatsappJson(content: string): { whatsapp_invitation_message: string } {
  const obj = parseJsonContent(content);
  const raw = toStringValue(obj.whatsapp_invitation_message);
  const trimmed = raw.length > MAX_WHATSAPP_MESSAGE_CHARS ? raw.slice(0, MAX_WHATSAPP_MESSAGE_CHARS) : raw;
  if (!trimmed) {
    throw new Error('AI returned empty WhatsApp message.');
  }
  return { whatsapp_invitation_message: trimmed };
}

async function callOpenAIChatCompletionsWhatsapp(
  apiKey: string,
  model: string,
  reasoningEffort: string | null,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ whatsapp_invitation_message: string }> {
  const requestBody: Record<string, unknown> = {
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
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
    throw new Error(body?.error?.message || `OpenAI request failed with ${response.status}`);
  }
  const content = body?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    throw new Error('AI returned empty content.');
  }
  return parseWhatsappJson(content);
}

async function callOpenAIResponsesAPIWhatsapp(
  apiKey: string,
  model: string,
  reasoningEffort: string | null,
  systemPrompt: string,
  userPrompt: string,
  sourceFiles: SourceFile[],
): Promise<{ whatsapp_invitation_message: string }> {
  const requestBody: Record<string, unknown> = {
    model,
    input: buildResponsesContent(systemPrompt, userPrompt, sourceFiles),
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
    throw new Error(body?.error?.message || `OpenAI Responses request failed with ${response.status}`);
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
    throw new Error('AI Responses API returned empty content.');
  }
  return parseWhatsappJson(textContent);
}

// ── Source file validation ──────────────────────────────────────────────────

function validateSourceFiles(
  raw: unknown,
): { ok: true; files: SourceFile[] } | { ok: false; error: string; code: ErrorCode } {
  if (raw === undefined || raw === null) return { ok: true, files: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'source_files must be an array.', code: 'generation_failed' };
  }
  if (raw.length > MAX_SOURCE_FILES) {
    return { ok: false, error: `At most ${MAX_SOURCE_FILES} source files are allowed.`, code: 'files_too_many' };
  }

  const files: SourceFile[] = [];
  let total = 0;
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'Each source_files item must be an object.', code: 'generation_failed' };
    }
    const rec = item as Record<string, unknown>;
    const name = toStringValue(rec.name) || 'source';
    const mime = toStringValue(rec.mime).toLowerCase();
    const base64 = toStringValue(rec.base64);
    if (!base64) return { ok: false, error: `Source file "${name}" is empty.`, code: 'generation_failed' };
    if (!SUPPORTED_SOURCE_MIMES.has(mime)) {
      return {
        ok: false,
        error: `Unsupported source file type "${mime}". Allowed: JPEG, PNG, PDF.`,
        code: 'unsupported_format',
      };
    }
    const sizeBytes = Math.ceil((base64.length * 3) / 4);
    const perFileLimit = mime === 'application/pdf' ? MAX_SOURCE_FILE_PDF_BYTES : MAX_SOURCE_FILE_IMAGE_BYTES;
    const perFileLimitLabel = '30 MB';
    if (sizeBytes > perFileLimit) {
      return {
        ok: false,
        error: `Source file "${name}" exceeds the per-file size limit (${perFileLimitLabel}).`,
        code: 'files_too_large',
      };
    }
    total += sizeBytes;
    if (total > MAX_SOURCE_FILES_TOTAL_BYTES) {
      return { ok: false, error: 'Total source files size exceeds 150 MB.', code: 'files_too_large' };
    }
    files.push({ name, mime, base64 });
  }
  return { ok: true, files };
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

  let payload: DraftRequestBody;
  try {
    payload = (await req.json()) as DraftRequestBody;
  } catch {
    return failClosed('Invalid JSON payload.', 'generation_failed');
  }

  const sessionToken = toStringValue(payload?.session_token);
  const rawMode = toStringValue(payload?.mode) || 'draft';
  const inputs: DraftInputs = payload?.inputs && typeof payload.inputs === 'object' ? payload.inputs : {};
  const briefRaw = toStringValue(payload?.brief).slice(0, MAX_BRIEF_CHARS);

  if (rawMode !== 'draft' && rawMode !== 'extract_fields' && rawMode !== 'draft_whatsapp') {
    return failClosed(
      `Invalid mode "${rawMode}". Expected "draft", "extract_fields", or "draft_whatsapp".`,
      'generation_failed',
    );
  }
  const mode = rawMode as 'draft' | 'extract_fields' | 'draft_whatsapp';

  if (!sessionToken) {
    return failClosed('Session token is required.', 'session_invalid');
  }

  const sourceFilesValidation = validateSourceFiles(payload?.source_files);
  if (!sourceFilesValidation.ok) {
    return failClosed(sourceFilesValidation.error, sourceFilesValidation.code);
  }
  const sourceFiles = sourceFilesValidation.files;

  if (mode === 'draft' && !briefRaw && sourceFiles.length === 0) {
    return failClosed('Event Brief is required.', 'brief_required');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[draft-event-content] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return failClosed('AI service is not configured. Please contact an administrator.', 'ai_disabled');
  }

  // ── Authorization ────────────────────────────────────────────────────────
  const userId = await rpcCall<string | null>(
    supabaseUrl,
    serviceRoleKey,
    'resolve_custom_session_user_id',
    { p_session_token: sessionToken },
  );
  if (!userId || typeof userId !== 'string') {
    return failClosed('Session is invalid or expired. Please sign in again.', 'session_invalid');
  }

  const [canCreate, canEditAny, canEditOwn] = await Promise.all([
    rpcCall<boolean>(supabaseUrl, serviceRoleKey, 'has_permission', {
      p_user_id: userId,
      p_permission_code: 'events.create',
    }),
    rpcCall<boolean>(supabaseUrl, serviceRoleKey, 'has_permission', {
      p_user_id: userId,
      p_permission_code: 'events.edit_any',
    }),
    rpcCall<boolean>(supabaseUrl, serviceRoleKey, 'has_permission', {
      p_user_id: userId,
      p_permission_code: 'events.edit_own',
    }),
  ]);
  if (!canCreate && !canEditAny && !canEditOwn) {
    return failClosed('You do not have permission to draft Event content.', 'permission_denied');
  }

  // ── Load AI runtime (event_drafting) ─────────────────────────────────────
  const settings = await loadAIRuntimeSettings(supabaseUrl, serviceRoleKey);
  if (!settings) {
    return failClosed('AI runtime "event_drafting" is not configured. Configure AI Settings first.', 'ai_disabled');
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
      `AI provider "${provider || 'unknown'}" is not supported by Events drafting yet. OpenAI is the only currently supported provider.`,
      'provider_unsupported',
    );
  }
  if (!apiKey) {
    return failClosed('AI API key is not configured. Please set it in AI Settings.', 'no_api_key');
  }

  // ── extract_fields mode ──────────────────────────────────────────────────
  if (mode === 'extract_fields') {
    if (sourceFiles.length === 0 && !briefRaw) {
      return failClosed('extract_fields mode requires a brief or at least one source file.', 'brief_required');
    }
    try {
      const fields = await callOpenAIResponsesAPIExtract(apiKey, model, reasoningEffort, briefRaw, sourceFiles);
      return jsonResponse({ success: true, fields });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed.';
      console.error('[draft-event-content] extraction error:', message);
      return failClosed(`AI field extraction failed: ${message}`, 'generation_failed');
    }
  }

  // ── draft_whatsapp mode ──────────────────────────────────────────────────
  if (mode === 'draft_whatsapp') {
    if (!briefRaw && sourceFiles.length === 0 && Object.values(inputs ?? {}).every((v) => !toStringValue(v))) {
      return failClosed(
        'Provide a brief or current form context to generate a WhatsApp message.',
        'brief_required',
      );
    }
    try {
      const systemPrompt = buildWhatsappSystemPrompt();
      const userPrompt = buildWhatsappUserMessage(briefRaw, inputs);
      const result = sourceFiles.length > 0
        ? await callOpenAIResponsesAPIWhatsapp(apiKey, model, reasoningEffort, systemPrompt, userPrompt, sourceFiles)
        : await callOpenAIChatCompletionsWhatsapp(apiKey, model, reasoningEffort, systemPrompt, userPrompt);
      return jsonResponse({
        success: true,
        data: { whatsapp_invitation_message: result.whatsapp_invitation_message },
        ai: {
          model,
          generated_at: new Date().toISOString(),
          source_doc_count: sourceFiles.length,
          brief_chars: briefRaw.length,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'WhatsApp generation failed.';
      console.error('[draft-event-content] whatsapp generation error:', message);
      return failClosed(`AI WhatsApp generation failed: ${message}`, 'generation_failed');
    }
  }

  // ── draft mode (default) ─────────────────────────────────────────────────
  try {
    const systemPrompt = buildDraftSystemPrompt(sourceFiles.length > 0);
    const userPrompt = buildDraftUserMessage(briefRaw, inputs);

    const draft = sourceFiles.length > 0
      ? await callOpenAIResponsesAPI(apiKey, model, reasoningEffort, systemPrompt, userPrompt, sourceFiles)
      : await callOpenAIChatCompletions(apiKey, model, reasoningEffort, systemPrompt, userPrompt);

    return jsonResponse({
      success: true,
      data: draft,
      ai: {
        model,
        generated_at: new Date().toISOString(),
        source_doc_count: sourceFiles.length,
        brief_chars: briefRaw.length,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI drafting failed.';
    console.error('[draft-event-content] generation error:', message);
    return failClosed(`AI drafting failed: ${message}`, 'generation_failed');
  }
});

