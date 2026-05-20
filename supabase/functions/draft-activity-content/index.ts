// =============================================================================
// Edge Function: draft-activity-content
// Slices: COD-ACTIVITIES-AI-001 + CLAUDE-ACTIVITIES-FOLLOWUP-002
//         + CLAUDE-ACTIVITIES-NEXT-003 (COD-ACTIVITIES-AI-DOC-UI-003)
//
// Three operating modes (request body field `mode`):
//
//   "draft" (default) — Generates AI-assisted draft content (title, slug,
//   excerpt, description) for an Activities post. Optional `source_files`
//   are consumed via the OpenAI Responses API as additional source material.
//   Falls back to chat/completions JSON mode when no files are present.
//
//   "extract_fields" — Reads supplied `source_files` (at least one required)
//   and returns structured guided-input field values (activity_date, location,
//   participants, host, purpose, highlights, outcome, additional_notes) extracted
//   from the document content. Used for auto-prefill in the AI panel before
//   the admin clicks Generate.
//
//   "event_to_activity" — Converts source Event details into activity-suitable
//   draft copy in activity-report tone.
//
// Source file limits:
//   - Max 3 files per request
//   - Images (JPEG/PNG): ≤ 10 MB per file
//   - PDFs: ≤ 20 MB per file
//   - Total cumulative: ≤ 30 MB
//
// The API key is read server-side via SUPABASE_SERVICE_ROLE_KEY and never
// returned to the browser.
//
// Request body:
//   {
//     session_token: string,
//     mode?: "draft" | "extract_fields" | "event_to_activity",   // defaults to "draft"
//     inputs?: {                            // used in draft mode
//       activity_date?: string,
//       location?: string,
//       participants?: string,
//       purpose?: string,
//       host?: string,
//       highlights?: string,
//       outcome?: string,
//       additional_notes?: string,
//     },
//     event_input?: {                       // used in event_to_activity mode
//       title?: string,
//       excerpt?: string,
//       description?: string,
//       event_type?: string,
//       visibility?: string,
//       start_at?: string,
//       end_at?: string,
//       location?: string,
//       invitation_text?: string,
//       agenda_items?: Array<{ title?: string; note?: string; speaker?: string; time?: string }>
//     },
//     source_files?: Array<{ name: string, mime: string, base64: string }>
//   }
//
// Authorization:
//   - session_token must resolve to an active user via
//     public.resolve_custom_session_user_id(p_session_token)
//   - that user must have `activities.create` OR `activities.edit_any`
//     permission via public.has_permission(actor_id, code).
//
// Output — draft mode (success):
//   { success: true, data: { title, slug, excerpt, description, activity_date?, start_at?, end_at?, location? } }
//
// Output — extract_fields mode (success):
//   { success: true, fields: { activity_date?, location?, participants?,
//     host?, purpose?, highlights?, outcome?, additional_notes? } }
//
// Output (failure / fail-closed) — always HTTP 200 with structured error_code:
//   { success: false, error: string, error_code: ErrorCode }
//
// ErrorCode union:
//   'ai_disabled' | 'provider_unsupported' | 'no_api_key'
//   | 'session_invalid' | 'permission_denied' | 'generation_failed'
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
  | 'generation_failed';

interface DraftInputs {
  activity_date?: string;
  location?: string;
  participants?: string;
  purpose?: string;
  host?: string;
  highlights?: string;
  outcome?: string;
  additional_notes?: string;
}

interface SourceFile {
  name: string;
  mime: string;
  base64: string;
}

interface ExtractionFields {
  activity_date?: string;
  activity_date_options?: string[];
  location?: string;
  location_options?: string[];
  participants?: string;
  host?: string;
  purpose?: string;
  highlights?: string;
  outcome?: string;
  additional_notes?: string;
}

interface ActivityDraftOutput {
  title: string;
  slug: string;
  excerpt: string;
  description: string;
  activity_date: string | null;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
}

interface EventInputForActivity {
  title?: string;
  excerpt?: string;
  description?: string;
  event_type?: string;
  visibility?: string;
  start_at?: string;
  end_at?: string;
  location?: string;
  invitation_text?: string;
  agenda_items?: Array<Record<string, unknown>>;
}

interface ActivityShareInput {
  title?: string;
  excerpt?: string;
  description?: string;
  start_at?: string;
  end_at?: string;
  location?: string;
  short_url?: string;
}

interface DraftRequestBody {
  session_token?: string;
  /** Defaults to "draft" when absent. */
  mode?: 'draft' | 'extract_fields' | 'event_to_activity' | 'draft_share';
  inputs?: DraftInputs;
  event_input?: EventInputForActivity;
  activity_input?: ActivityShareInput;
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

const MAX_SOURCE_FILES = 3;
const MAX_SOURCE_FILE_IMAGE_BYTES = 10 * 1024 * 1024;  // 10 MB per image (JPEG/PNG)
const MAX_SOURCE_FILE_PDF_BYTES = 20 * 1024 * 1024;    // 20 MB per PDF
const MAX_SOURCE_FILES_TOTAL_BYTES = 30 * 1024 * 1024; // 30 MB cumulative
const DECORATIVE_SYMBOL_REGEX = /\p{Extended_Pictographic}/gu;
const EXCERPT_MAX_CHARS = 280;

function toStringValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function sanitizeGeneratedText(input: string): string {
  if (!input) return '';
  return input
    .replace(DECORATIVE_SYMBOL_REGEX, '')
    .replace(/\u200D/g, '')
    .replace(/\uFE0F/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeForSimilarity(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(input: string): string[] {
  return String(input || '')
    .replace(/\n+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((line) => sanitizeGeneratedText(line))
    .filter(Boolean);
}

function leadingTokenMatchCount(left: string[], right: string[]): number {
  const max = Math.min(left.length, right.length);
  let count = 0;
  for (let i = 0; i < max; i += 1) {
    if (left[i] !== right[i]) break;
    count += 1;
  }
  return count;
}

function isNearDuplicateSentence(leftRaw: string, rightRaw: string): boolean {
  const left = normalizeForSimilarity(leftRaw);
  const right = normalizeForSimilarity(rightRaw);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.startsWith(right) || right.startsWith(left)) return true;

  const leftTokens = left.split(' ').filter(Boolean);
  const rightTokens = right.split(' ').filter(Boolean);
  if (leftTokens.length < 4 || rightTokens.length < 4) return false;

  const leadingMatch = leadingTokenMatchCount(leftTokens, rightTokens);
  if (leadingMatch >= 8) return true;

  const window = Math.min(leftTokens.length, rightTokens.length, 16);
  if (window >= 6) {
    let same = 0;
    for (let i = 0; i < window; i += 1) {
      if (leftTokens[i] === rightTokens[i]) same += 1;
    }
    if (same / window >= 0.66) return true;
  }

  return false;
}

function excerptLooksRepeated(excerpt: string, description: string): boolean {
  const sentences = splitSentences(description);
  if (sentences.length === 0) return false;
  return sentences.some((sentence) => isNearDuplicateSentence(excerpt, sentence));
}

function buildDistinctExcerpt(description: string, title: string, location?: string | null): string {
  const locationSuffix = location ? ` at ${location}` : '';

  const candidateA = sanitizeGeneratedText(
    `This activity report summarises the key sessions, participation, and outcomes for ${title}${locationSuffix}.`,
  ).slice(0, EXCERPT_MAX_CHARS);
  if (!excerptLooksRepeated(candidateA, description)) return candidateA;

  const candidateB = sanitizeGeneratedText(
    `Key proceedings and takeaways from ${title} are captured in this activity update.`,
  ).slice(0, EXCERPT_MAX_CHARS);
  if (!excerptLooksRepeated(candidateB, description)) return candidateB;

  return sanitizeGeneratedText(
    `Activity report summary for ${title}.`,
  ).slice(0, EXCERPT_MAX_CHARS);
}

// ── Excerpt / description lead distinctness enforcement ─────────────────────

/** Returns the first sentence from a text block. Splits on paragraph then sentence boundaries. */
function firstSentenceOf(text: string): string {
  if (!text) return '';
  const firstPara = String(text).split(/\n\n+/)[0] ?? '';
  const parts = firstPara
    .replace(/\n/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => sanitizeGeneratedText(s))
    .filter(Boolean);
  return parts[0] ?? '';
}

/** Jaccard similarity over meaningful tokens (length > 2). */
function tokenBagSimilarity(leftTokens: string[], rightTokens: string[]): number {
  const leftSet = new Set(leftTokens.filter((t) => t.length > 2));
  const rightSet = new Set(rightTokens.filter((t) => t.length > 2));
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  let shared = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) shared += 1;
  }
  const union = leftSet.size + rightSet.size - shared;
  return union > 0 ? shared / union : 0;
}

/**
 * Compares the LEAD sentences of excerpt and description specifically.
 * Uses lower thresholds than `isNearDuplicateSentence` (which checks all sentences)
 * and adds Jaccard bag similarity to catch rephrased / reordered duplicates.
 */
function isNearDuplicateLead(excerptText: string, descriptionText: string): boolean {
  const a = firstSentenceOf(excerptText);
  const b = firstSentenceOf(descriptionText);
  if (!a || !b) return false;
  const left = normalizeForSimilarity(a);
  const right = normalizeForSimilarity(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.startsWith(right) || right.startsWith(left)) return true;
  const leftTokens = left.split(' ').filter(Boolean);
  const rightTokens = right.split(' ').filter(Boolean);
  if (leftTokens.length < 4 || rightTokens.length < 4) {
    return tokenBagSimilarity(leftTokens, rightTokens) >= 0.75;
  }
  // Leading token overlap — threshold 5 (vs 8 in the global sentence check)
  if (leadingTokenMatchCount(leftTokens, rightTokens) >= 5) return true;
  // Positional window — threshold 0.60 and wider window (vs 0.66 / 16 globally)
  const window = Math.min(leftTokens.length, rightTokens.length, 20);
  if (window >= 6) {
    let same = 0;
    for (let i = 0; i < window; i += 1) {
      if (leftTokens[i] === rightTokens[i]) same += 1;
    }
    if (same / window >= 0.60) return true;
  }
  // Jaccard bag — catches reordered / rephrased duplicates.
  // Threshold 0.62: requires ~38% of the union of meaningful tokens to match.
  // T6 (rephrased, reordered sentence) yields 0.647 — caught. T5 (distinct) yields 0.136 — safe.
  if (tokenBagSimilarity(leftTokens, rightTokens) >= 0.62) return true;
  return false;
}

/**
 * Removes leading sentences from the description's first paragraph that
 * near-duplicate the excerpt. Preserves paragraph structure. Caps at 3 removals.
 */
function stripRepeatedLeadFromDescription(excerpt: string, description: string): string {
  if (!excerpt || !description) return description;
  const paragraphs = String(description).split(/\n\n+/);
  if (paragraphs.length === 0) return description;
  const firstParaSentences = String(paragraphs[0])
    .replace(/\n/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => sanitizeGeneratedText(s))
    .filter(Boolean);
  let removed = 0;
  while (firstParaSentences.length > 0 && removed < 3) {
    if (isNearDuplicateSentence(excerpt, firstParaSentences[0])) {
      firstParaSentences.shift();
      removed += 1;
    } else {
      break;
    }
  }
  if (removed === 0) return description;
  const newFirstPara = firstParaSentences.join(' ');
  const rest = paragraphs.slice(1);
  const parts = newFirstPara ? [newFirstPara, ...rest] : rest;
  return sanitizeGeneratedText(parts.join('\n\n'));
}

/** Minimum word count a stripped description must retain to accept the strip. */
const MIN_DESCRIPTION_WORDS_AFTER_STRIP = 50;

/**
 * Enforces that excerpt and description do not share near-duplicate lead sentences.
 *
 * Preference order:
 *  1. Strip repeated lead from description (preserves AI-generated excerpt quality).
 *  2. Replace excerpt with template if stripping would make description too short.
 *  3. Final guaranteed assertion: always distinct before returning.
 *
 * Also runs the global `excerptLooksRepeated` safety net so no non-lead
 * sentence repetition slips through.
 */
function enforceExcerptDescriptionDistinctness(draft: ActivityDraftOutput): ActivityDraftOutput {
  let { excerpt, description } = draft;
  const { title, location } = draft;

  // Step 1: ensure excerpt is non-empty
  if (!excerpt) {
    excerpt = buildDistinctExcerpt(description, title, location ?? undefined);
  }

  // Fast-path: leads already distinct
  if (!isNearDuplicateLead(excerpt, description)) {
    // Global sentence safety net (non-lead repetition)
    if (excerptLooksRepeated(excerpt, description)) {
      excerpt = buildDistinctExcerpt(description, title, location ?? undefined);
      if (excerptLooksRepeated(excerpt, description)) {
        excerpt = sanitizeGeneratedText(
          `This activity update highlights the key sessions and outcomes from ${title}.`,
        ).slice(0, EXCERPT_MAX_CHARS);
      }
    }
    return { ...draft, excerpt: excerpt.slice(0, EXCERPT_MAX_CHARS) };
  }

  // Leads are near-duplicate — primary fix: strip from description
  const originalDescription = description;
  const strippedDescription = stripRepeatedLeadFromDescription(excerpt, description);
  const strippedWordCount = strippedDescription.trim().split(/\s+/).filter(Boolean).length;

  if (strippedWordCount >= MIN_DESCRIPTION_WORDS_AFTER_STRIP) {
    // Stripping succeeded and description is still substantial
    description = strippedDescription;
    // Re-check leads (rare: second sentence may also be near-duplicate)
    if (isNearDuplicateLead(excerpt, description)) {
      excerpt = buildDistinctExcerpt(description, title, location ?? undefined);
    }
  } else {
    // Description would become too short — keep description, fix excerpt instead
    description = originalDescription;
    excerpt = buildDistinctExcerpt(description, title, location ?? undefined);
  }

  // Global sentence safety net
  if (excerptLooksRepeated(excerpt, description)) {
    excerpt = buildDistinctExcerpt(description, title, location ?? undefined);
    if (excerptLooksRepeated(excerpt, description)) {
      excerpt = sanitizeGeneratedText(
        `This activity update highlights the key sessions and outcomes from ${title}.`,
      ).slice(0, EXCERPT_MAX_CHARS);
    }
  }

  // Final assertion: guarantee lead distinctness (last-resort fallback)
  if (isNearDuplicateLead(excerpt, description)) {
    excerpt = sanitizeGeneratedText(
      `This activity report captures the key proceedings and outcomes from ${title}.`,
    ).slice(0, EXCERPT_MAX_CHARS);
  }

  return {
    ...draft,
    excerpt: excerpt.slice(0, EXCERPT_MAX_CHARS),
    description,
  };
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
  // Always return 200 with success:false so the SDK doesn't surface a generic
  // network error. The frontend renders the message + code.
  return jsonResponse({ success: false, error, error_code }, 200);
}

async function rpcCall<T>(
  supabaseUrl: string,
  serviceRoleKey: string,
  fnName: string,
  params: Record<string, unknown>
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
      console.warn(`[draft-activity-content] rpcCall ${fnName} failed: ${response.status} ${errorBody}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (err) {
    console.warn(`[draft-activity-content] rpcCall ${fnName} exception:`, err);
    return null;
  }
}

async function loadAIRuntimeSettings(
  supabaseUrl: string,
  serviceRoleKey: string
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
      }
    );
    if (!response.ok) {
      const errorBody = await response.text();
      console.warn(`[draft-activity-content] loadAIRuntimeSettings: ${response.status} ${errorBody}`);
      return null;
    }
    const rows = (await response.json()) as AIRuntimeSettingsRow[];
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  } catch (err) {
    console.warn('[draft-activity-content] loadAIRuntimeSettings exception:', err);
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

function buildSystemPrompt(hasSourceFiles: boolean): string {
  const base = [
    'You draft public-facing copy for member-association activity posts.',
    'Tone: organisational activity reporting — factual, neutral, member-facing.',
    'Avoid event marketing language, avoid news-headline clickbait.',
    'Do not use emojis or decorative symbols (such as ✨, •, ★, 👉).',
    'Keep the description grounded in the supplied facts. Do not invent metrics, attendance figures, quotes, or outcomes.',
  ];
  if (hasSourceFiles) {
    base.push(
      'If supplied, treat uploaded documents as primary source material; ignore unrelated content; do not invent figures absent from the facts and documents.'
    );
  }
  base.push(
    'Return strict JSON only with this exact shape:',
    '{ "title": string, "slug": string, "excerpt": string, "description": string, "activity_date": string|null, "start_at": string|null, "end_at": string|null, "location": string|null }',
    'title: short, descriptive, ≤ 90 characters, no trailing punctuation.',
    'slug: lowercase letters, digits, and hyphens only, ≤ 60 characters; will be re-validated client-side.',
    'excerpt: 1–2 sentences, ≤ 280 characters, plain text, suitable as listing card summary.',
    'excerpt must be an independent summary line and must not repeat or copy any sentence (or sentence fragment) from description.',
    'The opening sentence of excerpt and the opening sentence of description must be different — do not start both with the same phrase or clause.',
    'description: 2–4 short paragraphs (~150–500 words total), plain text, no Markdown, no headings.',
    'Extract activity_date, start_at, end_at, and location from the brief or source files when clearly present.',
    'For start_at and end_at, return ISO-like local datetime strings. If the date is clear but no time is present, use 10:00 for start_at and 17:00 for end_at.',
    'For a multi-day activity, start_at must be the first day and end_at must be the last day. If no date or location is present, return null for that field.'
  );
  return base.join(' ');
}

function buildUserFacts(inputs: DraftInputs): string {
  const factBlock: Record<string, string> = {};
  for (const [k, v] of Object.entries(inputs)) {
    const s = toStringValue(v);
    if (s) factBlock[k] = s;
  }
  return JSON.stringify(
    {
      task: 'draft_activity_post',
      facts: factBlock,
      style: 'organisational activity report',
    },
    null,
    2
  );
}

function buildShareSystemPrompt(): string {
  return [
    'You write concise public share messages for Laghu Udyog Bharati activity pages.',
    'Return strict JSON only with this exact shape: { "share_message": string }.',
    'The share_message must be plain text, 2 to 5 short lines, and at most 550 characters.',
    'Use completed-activity language, not invitation or registration language.',
    'Do not use emojis, decorative symbols, bullets, Markdown, hashtags, or all-caps emphasis.',
    'Include the activity title, one short value summary, date/location when provided, and the short URL when provided.',
    'Do not invent dates, venue names, attendance counts, outcomes, quotes, or speaker names.',
  ].join(' ');
}

function buildShareUserPrompt(input: ActivityShareInput): string {
  return JSON.stringify(
    {
      task: 'draft_activity_share_message',
      activity: {
        title: toStringValue(input.title),
        excerpt: toStringValue(input.excerpt),
        description: toStringValue(input.description).slice(0, 1600),
        start_at: toStringValue(input.start_at),
        end_at: toStringValue(input.end_at),
        location: toStringValue(input.location),
        short_url: toStringValue(input.short_url),
      },
    },
    null,
    2,
  );
}

function buildEventToActivityPrompt(eventInput: EventInputForActivity): string {
  const agendaLines = Array.isArray(eventInput.agenda_items)
    ? eventInput.agenda_items
        .slice(0, 40)
        .map((item) => {
          const parts = [
            toStringValue(item?.time),
            toStringValue(item?.title),
            toStringValue(item?.speaker),
            toStringValue(item?.note),
          ].filter(Boolean);
          return parts.join(' | ');
        })
        .filter(Boolean)
    : [];

  return JSON.stringify(
    {
      task: 'convert_event_to_activity',
      rules: [
        'Rewrite this into completed-activity style copy.',
        'Keep only factual content from provided event data.',
        'Do not invent attendance counts, outcomes, quotes, or names.',
        'Do not use invitation language such as "join", "register now", or "you are invited".',
        'Do not use emojis or decorative symbols.',
        'Excerpt must be an independent summary and must not repeat or copy any sentence from description. The opening sentence of excerpt and the opening sentence of description must be different.',
      ],
      event: {
        title: toStringValue(eventInput.title),
        excerpt: toStringValue(eventInput.excerpt),
        description: toStringValue(eventInput.description),
        event_type: toStringValue(eventInput.event_type),
        visibility: toStringValue(eventInput.visibility),
        start_at: toStringValue(eventInput.start_at),
        end_at: toStringValue(eventInput.end_at),
        location: toStringValue(eventInput.location),
        invitation_text: toStringValue(eventInput.invitation_text),
        agenda_lines: agendaLines,
      },
      output: {
        title: 'string',
        slug: 'string',
        excerpt: 'string',
        description: 'string',
      },
    },
    null,
    2,
  );
}

const MONTHS_EN: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

const DEFAULT_START_HOUR = 10;
const DEFAULT_END_HOUR = 17;

function isoLocalNoTz(year: number, monthIndex0: number, day: number, hour: number, minute: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(monthIndex0 + 1)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;
}

function toIsoDateLocal(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function normalizeDateOnly(value: unknown): string | null {
  const raw = toStringValue(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return toIsoDateLocal(parsed);
}

function normalizeDateTime(value: unknown): string | null {
  const raw = toStringValue(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T10:00:00`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return raw;
}

function isoLocalFromDateString(dateValue: string, hour: number): string | null {
  const m = String(dateValue || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return isoLocalNoTz(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hour, 0);
}

interface DateRangeParse {
  activity_date: string;
  start_at: string;
  end_at: string;
}

function fallbackParseDateRange(brief: string): DateRangeParse | null {
  if (!brief || typeof brief !== 'string') return null;
  const text = brief.replace(/\s+/g, ' ').trim();
  const monthAlt = Object.keys(MONTHS_EN).join('|');

  const reA = new RegExp(`\\b(\\d{1,2})\\s*(?:,|and|&)\\s*(\\d{1,2})\\s+(${monthAlt})\\.?\\s+(\\d{4})\\b`, 'i');
  const reB = new RegExp(`\\b(\\d{1,2})\\s*[-\\u2013/]\\s*(\\d{1,2})\\s+(${monthAlt})\\.?\\s+(\\d{4})\\b`, 'i');
  const reC = new RegExp(`\\b(${monthAlt})\\.?\\s+(\\d{1,2})\\s*(?:[-\\u2013/,]|and|&)\\s*(\\d{1,2})\\s*,?\\s*(\\d{4})\\b`, 'i');
  const reD = new RegExp(`\\b(\\d{1,2})\\s+(${monthAlt})\\.?\\s+(?:(\\d{4})\\s+)?(?:to|until|through|\\u2013|-)\\s+(\\d{1,2})\\s+(${monthAlt})\\.?\\s+(\\d{4})\\b`, 'i');
  const reE1 = new RegExp(`\\b(\\d{1,2})\\s+(${monthAlt})\\.?\\s+(\\d{4})\\b`, 'i');
  const reE2 = new RegExp(`\\b(${monthAlt})\\.?\\s+(\\d{1,2})\\s*,?\\s*(\\d{4})\\b`, 'i');

  let m: RegExpMatchArray | null;
  let startYear = 0;
  let startMonth = 0;
  let startDay = 0;
  let endYear = 0;
  let endMonth = 0;
  let endDay = 0;

  if ((m = text.match(reA)) || (m = text.match(reB))) {
    startDay = Number(m[1]);
    endDay = Number(m[2]);
    startMonth = endMonth = MONTHS_EN[m[3].toLowerCase()] - 1;
    startYear = endYear = Number(m[4]);
  } else if ((m = text.match(reC))) {
    startMonth = endMonth = MONTHS_EN[m[1].toLowerCase()] - 1;
    startDay = Number(m[2]);
    endDay = Number(m[3]);
    startYear = endYear = Number(m[4]);
  } else if ((m = text.match(reD))) {
    startDay = Number(m[1]);
    startMonth = MONTHS_EN[m[2].toLowerCase()] - 1;
    endDay = Number(m[4]);
    endMonth = MONTHS_EN[m[5].toLowerCase()] - 1;
    endYear = Number(m[6]);
    startYear = m[3] ? Number(m[3]) : endYear;
  } else if ((m = text.match(reE1))) {
    startDay = endDay = Number(m[1]);
    startMonth = endMonth = MONTHS_EN[m[2].toLowerCase()] - 1;
    startYear = endYear = Number(m[3]);
  } else if ((m = text.match(reE2))) {
    startMonth = endMonth = MONTHS_EN[m[1].toLowerCase()] - 1;
    startDay = endDay = Number(m[2]);
    startYear = endYear = Number(m[3]);
  } else {
    return null;
  }

  const start_at = isoLocalNoTz(startYear, startMonth, startDay, DEFAULT_START_HOUR, 0);
  const end_at = isoLocalNoTz(endYear, endMonth, endDay, DEFAULT_END_HOUR, 0);
  return { activity_date: start_at.slice(0, 10), start_at, end_at };
}

function fallbackParseLocation(brief: string): string | null {
  if (!brief || typeof brief !== 'string') return null;
  const lines = brief.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const match = line.match(/^(?:venue|location|place)\s*:\s*(.+)$/i);
    if (match?.[1]) return sanitizeGeneratedText(match[1]).slice(0, 180) || null;
  }
  const text = brief.replace(/\s+/g, ' ').trim();
  const heldAt = text.match(/\b(?:held|conducted|organized|organised|hosted)(?:\s+on\s+[^.;\n]+?)?\s+at\s+([^.;\n]+?)(?:\s+on\s+|\s+from\s+|[.;]|$)/i);
  if (heldAt?.[1]) return sanitizeGeneratedText(heldAt[1]).slice(0, 180) || null;
  return null;
}

function parseAIDraftJson(content: string): ActivityDraftOutput {
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
  const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const title = sanitizeGeneratedText(toStringValue(obj.title));
  const description = sanitizeGeneratedText(toStringValue(obj.description));
  const rawExcerpt = sanitizeGeneratedText(toStringValue(obj.excerpt));
  const aiSlug = toStringValue(obj.slug);
  let activityDate = normalizeDateOnly(obj.activity_date);
  let startAt = normalizeDateTime(obj.start_at);
  let endAt = normalizeDateTime(obj.end_at);
  const location = sanitizeGeneratedText(toStringValue(obj.location));
  if (!title || !description) {
    throw new Error('AI response missing required fields (title/description).');
  }

  if (!activityDate && startAt) {
    activityDate = normalizeDateOnly(startAt);
  }
  if (activityDate && !startAt) {
    startAt = isoLocalFromDateString(activityDate, DEFAULT_START_HOUR);
  }
  if (activityDate && !endAt) {
    endAt = isoLocalFromDateString(activityDate, DEFAULT_END_HOUR);
  }

  // Deterministic post-processing: enforce excerpt/description lead distinctness.
  // Prefers stripping the repeated sentence from description (preserving AI excerpt)
  // over replacing excerpt with a template.
  return enforceExcerptDescriptionDistinctness({
    title,
    slug: slugifyServer(aiSlug || title),
    excerpt: rawExcerpt.slice(0, EXCERPT_MAX_CHARS),
    description,
    activity_date: activityDate || null,
    start_at: startAt || null,
    end_at: endAt || null,
    location: location || null,
  });
}

function parseShareJson(content: string): { share_message: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      parsed = JSON.parse(content.slice(firstBrace, lastBrace + 1));
    } else {
      throw new Error('AI returned non-JSON share content.');
    }
  }
  const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const raw = sanitizeGeneratedText(toStringValue(obj.share_message))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { share_message: raw.slice(0, 700) };
}

function buildExtractionSystemPrompt(): string {
  return [
    'You are a document parsing assistant.',
    'Read the supplied documents and extract any of these fields if clearly present:',
    'activity_date (ISO 8601 date string, e.g. "2026-03-15"), location (city or venue name),',
    'activity_date_options (array of ISO 8601 dates when multiple possible activity dates are clearly present),',
    'location_options (array of venue/city strings when multiple possible activity locations are clearly present),',
    'participants (brief description of who attended), host (organizer or hosting entity name),',
    'purpose (what the event was meant to achieve), highlights (key moments, sessions, or speakers),',
    'outcome (what was achieved or concluded), additional_notes (any other notable facts).',
    'For two-day or multi-day activities, set activity_date to the first day of the activity and include all clear activity dates in activity_date_options.',
    'Do not use document issue dates, print dates, registration deadlines, or payment dates as activity_date unless the document clearly says they are the event/activity date.',
    'Prefer dates near event title, agenda, schedule, venue, invitation line, or phrases such as "held on", "conducted on", "date", "program", or "venue".',
    'If multiple locations are present, set location to the most likely event venue/location and include the candidates in location_options.',
    'Return a JSON object with exactly those field names as keys. Omit any key you cannot clearly determine from the documents.',
    'Do not invent or infer information not present in the documents.',
    'Return strict JSON only — no explanation, no markdown, no code fences.',
  ].join(' ');
}

function parseExtractionJson(content: string): ExtractionFields {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      parsed = JSON.parse(content.slice(firstBrace, lastBrace + 1));
    } else {
      throw new Error('AI returned non-JSON content for extraction.');
    }
  }
  const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  const fields: ExtractionFields = {};
  const STRING_KEYS: (keyof ExtractionFields)[] = [
    'activity_date', 'location', 'participants', 'host',
    'purpose', 'highlights', 'outcome', 'additional_notes',
  ];
  for (const key of STRING_KEYS) {
    const v = sanitizeGeneratedText(toStringValue(obj[key]));
    if (v) fields[key] = v;
  }
  const ARRAY_KEYS: (keyof ExtractionFields)[] = ['activity_date_options', 'location_options'];
  for (const key of ARRAY_KEYS) {
    const raw = obj[key];
    if (!Array.isArray(raw)) continue;
    const values = raw
      .map((item) => sanitizeGeneratedText(toStringValue(item)))
      .filter((item): item is string => Boolean(item));
    if (values.length > 0) fields[key] = Array.from(new Set(values));
  }
  return fields;
}

// ── OpenAI Chat Completions path (no source files) ──────────────────────────
async function callOpenAIChatCompletions(
  apiKey: string,
  model: string,
  reasoningEffort: string | null,
  systemPrompt: string,
  userPrompt: string
): Promise<ActivityDraftOutput> {
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
  return parseAIDraftJson(content);
}

async function callOpenAIChatCompletionsShare(
  apiKey: string,
  model: string,
  reasoningEffort: string | null,
  systemPrompt: string,
  userPrompt: string
): Promise<{ share_message: string }> {
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
    throw new Error('AI returned empty share content.');
  }
  return parseShareJson(content);
}

// ── OpenAI Responses API path (with source files) ───────────────────────────
function buildResponsesContent(
  systemPrompt: string,
  userPrompt: string,
  sourceFiles: SourceFile[]
): Array<Record<string, unknown>> {
  const userParts: Array<Record<string, unknown>> = [];

  // Free text instruction first
  userParts.push({
    type: 'input_text',
    text: `${systemPrompt}\n\n${userPrompt}`,
  });

  for (const f of sourceFiles) {
    const dataUrl = `data:${f.mime};base64,${f.base64}`;
    if (f.mime === 'application/pdf') {
      userParts.push({
        type: 'input_file',
        filename: f.name || 'source.pdf',
        file_data: dataUrl,
      });
    } else {
      userParts.push({
        type: 'input_image',
        image_url: dataUrl,
      });
    }
  }

  return [
    {
      role: 'user',
      content: userParts,
    },
  ];
}

async function callOpenAIResponsesAPI(
  apiKey: string,
  model: string,
  reasoningEffort: string | null,
  systemPrompt: string,
  userPrompt: string,
  sourceFiles: SourceFile[]
): Promise<ActivityDraftOutput> {
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

  // Prefer output_text convenience field; fall back to walking output[].content[].text
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
  return parseAIDraftJson(textContent);
}

// ── OpenAI Responses API path — extract_fields mode ────────────────────────
async function callOpenAIResponsesAPIExtract(
  apiKey: string,
  model: string,
  reasoningEffort: string | null,
  sourceFiles: SourceFile[]
): Promise<ExtractionFields> {
  const systemText = buildExtractionSystemPrompt();
  const parts: Array<Record<string, unknown>> = [
    { type: 'input_text', text: systemText },
  ];
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

// ── Source file validation ──────────────────────────────────────────────────
function validateSourceFiles(raw: unknown): { ok: true; files: SourceFile[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, files: [] };
  if (!Array.isArray(raw)) return { ok: false, error: 'source_files must be an array.' };
  if (raw.length > MAX_SOURCE_FILES) {
    return { ok: false, error: `At most ${MAX_SOURCE_FILES} source files are allowed.` };
  }

  const files: SourceFile[] = [];
  let total = 0;
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'Each source_files item must be an object.' };
    }
    const rec = item as Record<string, unknown>;
    const name = toStringValue(rec.name) || 'source';
    const mime = toStringValue(rec.mime).toLowerCase();
    const base64 = toStringValue(rec.base64);
    if (!base64) return { ok: false, error: `Source file "${name}" is empty.` };
    if (!SUPPORTED_SOURCE_MIMES.has(mime)) {
      return { ok: false, error: `Unsupported source file type "${mime}". Allowed: JPEG, PNG, PDF.` };
    }
    // base64 size estimate: 4 chars per 3 bytes
    const sizeBytes = Math.ceil((base64.length * 3) / 4);
    const perFileLimit = mime === 'application/pdf' ? MAX_SOURCE_FILE_PDF_BYTES : MAX_SOURCE_FILE_IMAGE_BYTES;
    const perFileLimitLabel = mime === 'application/pdf' ? '20 MB' : '10 MB';
    if (sizeBytes > perFileLimit) {
      return { ok: false, error: `Source file "${name}" exceeds the per-file size limit (${perFileLimitLabel}).` };
    }
    total += sizeBytes;
    if (total > MAX_SOURCE_FILES_TOTAL_BYTES) {
      return { ok: false, error: 'Total source files size exceeds 30 MB.' };
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
      405
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

  if (rawMode !== 'draft' && rawMode !== 'extract_fields' && rawMode !== 'event_to_activity' && rawMode !== 'draft_share') {
    return failClosed(`Invalid mode "${rawMode}". Expected "draft", "extract_fields", "event_to_activity", or "draft_share".`, 'generation_failed');
  }
  const mode = rawMode as 'draft' | 'extract_fields' | 'event_to_activity' | 'draft_share';

  if (!sessionToken) {
    return failClosed('Session token is required.', 'session_invalid');
  }

  const sourceFilesValidation = validateSourceFiles(payload?.source_files);
  if (!sourceFilesValidation.ok) {
    return failClosed(sourceFilesValidation.error, 'generation_failed');
  }
  const sourceFiles = sourceFilesValidation.files;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[draft-activity-content] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return failClosed('AI service is not configured. Please contact an administrator.', 'ai_disabled');
  }

  // ── Authorization ────────────────────────────────────────────────────────
  const userId = await rpcCall<string | null>(
    supabaseUrl,
    serviceRoleKey,
    'resolve_custom_session_user_id',
    { p_session_token: sessionToken }
  );
  if (!userId || typeof userId !== 'string') {
    return failClosed('Session is invalid or expired. Please sign in again.', 'session_invalid');
  }

  const [canCreate, canEditAny] = await Promise.all([
    rpcCall<boolean>(supabaseUrl, serviceRoleKey, 'has_permission', {
      p_user_id: userId,
      p_permission_code: 'activities.create',
    }),
    rpcCall<boolean>(supabaseUrl, serviceRoleKey, 'has_permission', {
      p_user_id: userId,
      p_permission_code: 'activities.edit_any',
    }),
  ]);
  if (!canCreate && !canEditAny) {
    return failClosed('You do not have permission to draft Activities content.', 'permission_denied');
  }

  // ── Load AI runtime ──────────────────────────────────────────────────────
  const settings = await loadAIRuntimeSettings(supabaseUrl, serviceRoleKey);
  if (!settings) {
    return failClosed('AI runtime is not configured. Please configure AI Settings first.', 'ai_disabled');
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
      `AI provider "${provider || 'unknown'}" is not supported by Activities drafting yet. OpenAI is the only currently supported provider.`,
      'provider_unsupported'
    );
  }
  if (!apiKey) {
    return failClosed('AI API key is not configured. Please set it in AI Settings.', 'no_api_key');
  }

  // ── extract_fields mode ──────────────────────────────────────────────────
  if (mode === 'extract_fields') {
    if (sourceFiles.length === 0) {
      return failClosed(
        'extract_fields mode requires at least one source file.',
        'generation_failed'
      );
    }
    try {
      const fields = await callOpenAIResponsesAPIExtract(apiKey, model, reasoningEffort, sourceFiles);
      return jsonResponse({ success: true, fields });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Extraction failed.';
      console.error('[draft-activity-content] extraction error:', message);
      return failClosed(`AI field extraction failed: ${message}`, 'generation_failed');
    }
  }

  if (mode === 'draft_share') {
    try {
      const result = await callOpenAIChatCompletionsShare(
        apiKey,
        model,
        reasoningEffort,
        buildShareSystemPrompt(),
        buildShareUserPrompt(payload?.activity_input ?? {}),
      );
      return jsonResponse({
        success: true,
        data: result,
        ai: {
          model,
          generated_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI share message generation failed.';
      console.error('[draft-activity-content] share generation error:', message);
      return failClosed(`AI share message generation failed: ${message}`, 'generation_failed');
    }
  }

  // ── draft mode (default) ─────────────────────────────────────────────────
  try {
    const systemPrompt = buildSystemPrompt(sourceFiles.length > 0 || mode === 'event_to_activity');
    const userPrompt = mode === 'event_to_activity'
      ? buildEventToActivityPrompt(payload?.event_input ?? {})
      : buildUserFacts(inputs);

    const draft = sourceFiles.length > 0
      ? await callOpenAIResponsesAPI(apiKey, model, reasoningEffort, systemPrompt, userPrompt, sourceFiles)
      : await callOpenAIChatCompletions(apiKey, model, reasoningEffort, systemPrompt, userPrompt);

    const briefRaw = toStringValue(inputs.additional_notes);
    let dateOutcome: 'ai_date_detected' | 'fallback_date_detected' | 'no_date_detected' = 'no_date_detected';
    if (draft.start_at || draft.activity_date) {
      dateOutcome = 'ai_date_detected';
    } else if (briefRaw) {
      const fallback = fallbackParseDateRange(briefRaw);
      if (fallback) {
        draft.activity_date = fallback.activity_date;
        draft.start_at = fallback.start_at;
        draft.end_at = draft.end_at || fallback.end_at;
        dateOutcome = 'fallback_date_detected';
      }
    }
    if (draft.activity_date && !draft.start_at) {
      draft.start_at = isoLocalFromDateString(draft.activity_date, DEFAULT_START_HOUR);
    }
    if (draft.activity_date && !draft.end_at) {
      draft.end_at = isoLocalFromDateString(draft.activity_date, DEFAULT_END_HOUR);
    }
    if (!draft.location && briefRaw) {
      draft.location = fallbackParseLocation(briefRaw);
    }
    console.log(`[draft-activity-content] date_outcome=${dateOutcome} location_detected=${draft.location ? 'yes' : 'no'} brief_chars=${briefRaw.length} src_docs=${sourceFiles.length}`);

    return jsonResponse({
      success: true,
      data: draft,
      ai: {
        model,
        generated_at: new Date().toISOString(),
        source_doc_count: sourceFiles.length,
        brief_chars: briefRaw.length,
        date_outcome: dateOutcome,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI drafting failed.';
    console.error('[draft-activity-content] generation error:', message);
    return failClosed(`AI drafting failed: ${message}`, 'generation_failed');
  }
});
