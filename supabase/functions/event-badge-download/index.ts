// =============================================================================
// Edge Function: event-badge-download
// Slice: COD-EVENTS-BADGES-048
//
// Two access paths (both anon-callable):
//   1) ?code=<badge_code>          — direct one-shot link (used in email links
//                                    and admin downloads).
//   2) ?event_slug=<slug>&mobile=<phone>
//                                  — visitor self-serve lookup; returns the
//                                    badge for any confirmed RSVP whose phone
//                                    matches (loose normalization).
//
// In both paths the event must not be "ended": now() must be earlier than
// COALESCE(event.end_at, event.start_at) + 12h grace. After that the
// function returns 410 with error_code='event_ended'.
//
// Returns: PDF bytes (Content-Type: application/pdf, 4 in × 6 in portrait)
// or JSON { success:false, error_code, error } on failure.
// =============================================================================

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1';
import QRCode from 'npm:qrcode@1.5.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function jsonError(status: number, error_code: string, error: string): Response {
  return new Response(JSON.stringify({ success: false, error_code, error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const GRACE_MS = 12 * 60 * 60 * 1000; // 12 hours

interface BadgeRow {
  id: string;
  badge_code: string;
  snapshot: Record<string, unknown>;
  event_id: string;
}

interface EventRow {
  id: string;
  slug: string;
  title: string;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
  ai_metadata: Record<string, unknown> | null;
}

interface EventBadgeAsset {
  id: string;
  kind: 'badge_template' | 'badge_sample';
  public_url: string;
  storage_path: string;
  label: string | null;
  mime_type: string | null;
  created_at: string;
}

interface BadgeDesignAnalysis {
  version?: number;
  analyzed_at?: string;
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    text?: string;
  };
  tone?: string;
  raw_summary?: string;
}

interface BadgeDesignContext {
  templateAsset?: EventBadgeAsset;
  sampleAsset?: EventBadgeAsset;
  analysis?: BadgeDesignAnalysis;
  etagSeed: string;
}

const BADGE_TEMPLATE_KEYS = [
  'classic_corporate',
  'minimal_clean',
  'bold_header',
  'compact_info',
] as const;
type BadgeTemplateKey = typeof BADGE_TEMPLATE_KEYS[number];

function resolveTemplate(event: EventRow, override?: string | null): BadgeTemplateKey {
  const fromOverride = (override ?? '').trim().toLowerCase();
  if (fromOverride && (BADGE_TEMPLATE_KEYS as readonly string[]).includes(fromOverride)) {
    return fromOverride as BadgeTemplateKey;
  }
  const stored = String(
    (event.ai_metadata ?? {}) ['badge_template_key'] ?? '',
  ).toLowerCase();
  if (stored && (BADGE_TEMPLATE_KEYS as readonly string[]).includes(stored)) {
    return stored as BadgeTemplateKey;
  }
  return 'classic_corporate';
}

async function rest<T>(
  supabaseUrl: string,
  serviceRoleKey: string,
  path: string,
): Promise<T | null> {
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

async function patch(
  supabaseUrl: string,
  serviceRoleKey: string,
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
}

async function loadBadgeDesignContext(
  supabaseUrl: string,
  serviceRoleKey: string,
  event: EventRow,
): Promise<BadgeDesignContext> {
  const rows = await rest<EventBadgeAsset[]>(
    supabaseUrl,
    serviceRoleKey,
    `event_assets?event_id=eq.${event.id}&kind=in.(badge_template,badge_sample)&select=id,kind,public_url,storage_path,label,mime_type,created_at&order=created_at.desc`,
  );
  const templateAsset = rows?.find((a) => a.kind === 'badge_template');
  const sampleAsset = rows?.find((a) => a.kind === 'badge_sample');
  const rawAnalysis = (event.ai_metadata ?? {})['badge_design_analysis'];
  const analysis = rawAnalysis && typeof rawAnalysis === 'object'
    ? rawAnalysis as BadgeDesignAnalysis
    : undefined;
  return {
    templateAsset,
    sampleAsset,
    analysis: analysis?.version === 1 ? analysis : undefined,
    etagSeed: [
      templateAsset?.id ?? '',
      sampleAsset?.id ?? '',
      analysis?.analyzed_at ?? '',
    ].join(':'),
  };
}

function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

async function findBadgeByCode(
  supabaseUrl: string,
  serviceRoleKey: string,
  code: string,
): Promise<{ badge: BadgeRow; event: EventRow } | null> {
  const badges = await rest<BadgeRow[]>(
    supabaseUrl, serviceRoleKey,
    `event_badges?badge_code=eq.${encodeURIComponent(code)}&select=id,badge_code,snapshot,event_id&limit=1`,
  );
  if (!badges || badges.length === 0) return null;
  const badge = badges[0];
  const events = await rest<EventRow[]>(
    supabaseUrl, serviceRoleKey,
    `events?id=eq.${badge.event_id}&select=id,slug,title,start_at,end_at,location,ai_metadata&limit=1`,
  );
  if (!events || events.length === 0) return null;
  return { badge, event: events[0] };
}

async function findBadgeByMobile(
  supabaseUrl: string,
  serviceRoleKey: string,
  eventSlug: string,
  mobile: string,
): Promise<{ badge: BadgeRow; event: EventRow } | null> {
  const events = await rest<EventRow[]>(
    supabaseUrl, serviceRoleKey,
    `events?slug=eq.${encodeURIComponent(eventSlug)}&status=eq.published&select=id,slug,title,start_at,end_at,location,ai_metadata&limit=1`,
  );
  if (!events || events.length === 0) return null;
  const event = events[0];

  const normalized = normalizePhone(mobile);
  if (!normalized) return null;

  // Pull all badges for this event then match phone in JS (snapshot.phone
  // is free-text). For typical event sizes this is fine.
  const badges = await rest<BadgeRow[]>(
    supabaseUrl, serviceRoleKey,
    `event_badges?event_id=eq.${event.id}&select=id,badge_code,snapshot,event_id`,
  );
  if (!badges) return null;
  const match = badges.find((b) => {
    const phone = String((b.snapshot as Record<string, unknown>).phone ?? '');
    return normalizePhone(phone) === normalized;
  });
  if (!match) return null;
  return { badge: match, event };
}

function eventDownloadDeadline(event: EventRow): number | null {
  const ref = event.end_at || event.start_at;
  if (!ref) return null;
  const t = new Date(ref).getTime();
  if (Number.isNaN(t)) return null;
  return t + GRACE_MS;
}

function fmtDateOnly(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return String(iso);
  }
}

function eventDateBand(start: string | null, end: string | null): string {
  const s = fmtDateOnly(start);
  const e = fmtDateOnly(end);
  if (s && e && s !== e) return `${s} - ${e}`;
  return s || e || '';
}

function visitDayLabel(visitDate: string): string {
  // visit_date is stored as YYYY-MM-DD; render as "16 Apr 2026" with no time.
  return fmtDateOnly(`${visitDate}T00:00:00`);
}

function drawCentered(
  page: PDFPage,
  text: string,
  yBaseline: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  pageWidth: number,
): void {
  if (!text) return;
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: Math.max(8, (pageWidth - w) / 2),
    y: yBaseline,
    size,
    font,
    color,
  });
}

async function generateQrPngBytes(payload: string): Promise<Uint8Array> {
  // 'qrcode' returns a data URL of a PNG when type is image/png.
  // Width is the rendered pixel size; pdf-lib will scale on draw.
  const dataUrl = (await QRCode.toDataURL(payload, {
    type: 'image/png',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 480,
  })) as string;
  const base64 = dataUrl.split(',')[1] ?? '';
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// =============================================================================
// 051: badge template renderers. All four templates honor:
//   - exact 4×6 portrait
//   - QR centered + scannable
//   - center-aligned name + metadata
//   - date-only event dates (no time, no location)
//   - LUB branding footer (drawn monogram + wordmark; no asset fetch)
// Shared helpers below; template-specific layouts in renderBadgeXxx().
// =============================================================================

const PAGE_W = 4 * 72;   // 288 pt
const PAGE_H = 6 * 72;   // 432 pt

interface BadgeFonts {
  helv: PDFFont;
  helvBold: PDFFont;
  courierBold: PDFFont;
}

interface RenderArgs {
  badge: BadgeRow;
  event: EventRow;
  qrPayload: string;
  design: BadgeDesignContext;
}

async function commonInit(): Promise<{ doc: PDFDocument; page: PDFPage; fonts: BadgeFonts }> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const fonts: BadgeFonts = {
    helv: await doc.embedFont(StandardFonts.Helvetica),
    helvBold: await doc.embedFont(StandardFonts.HelveticaBold),
    courierBold: await doc.embedFont(StandardFonts.CourierBold),
  };
  return { doc, page, fonts };
}

function hexToRgb(hex: string | undefined, fallback: ReturnType<typeof rgb>): ReturnType<typeof rgb> {
  const raw = (hex ?? '').trim();
  const match = raw.match(/^#?([0-9a-fA-F]{6})$/);
  if (!match) return fallback;
  const value = match[1];
  return rgb(
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  );
}

function resolveDesignColors(
  design: BadgeDesignContext,
  defaults: {
    accent: ReturnType<typeof rgb>;
    ink: ReturnType<typeof rgb>;
    subtle?: ReturnType<typeof rgb>;
    fill?: ReturnType<typeof rgb>;
  },
) {
  const colors = design.analysis?.colors ?? {};
  return {
    accent: hexToRgb(colors.primary || colors.accent, defaults.accent),
    ink: hexToRgb(colors.text, defaults.ink),
    subtle: defaults.subtle ?? rgb(0.45, 0.45, 0.45),
    fill: hexToRgb(colors.secondary, defaults.fill ?? rgb(0.96, 0.96, 0.96)),
  };
}

// COD-EVENTS-REGISTRATION-BADGE-EXPORT-AADHAAR-068
// opacity=1 → full-template mode (template IS the badge design)
// opacity=0.18/0.14 → subtle watermark mode (legacy behaviour, no longer used for new uploads)
async function drawTemplateBackground(
  doc: PDFDocument,
  page: PDFPage,
  design: BadgeDesignContext,
  opacity = 1.0,
): Promise<boolean> {
  const asset = design.templateAsset;
  if (!asset?.public_url) return false;
  const mime = (asset.mime_type ?? '').toLowerCase();
  try {
    const resp = await fetch(asset.public_url);
    if (!resp.ok) return false;
    const bytes = new Uint8Array(await resp.arrayBuffer());
    if (mime === 'image/jpeg' || mime === 'image/jpg') {
      const image = await doc.embedJpg(bytes);
      page.drawImage(image, { x: 0, y: 0, width: PAGE_W, height: PAGE_H, opacity });
      return true;
    } else if (mime === 'image/png') {
      const image = await doc.embedPng(bytes);
      page.drawImage(image, { x: 0, y: 0, width: PAGE_W, height: PAGE_H, opacity });
      return true;
    } else if (mime === 'application/pdf') {
      const [embeddedPage] = await doc.embedPdf(bytes, [0]);
      page.drawPage(embeddedPage, { x: 0, y: 0, width: PAGE_W, height: PAGE_H, opacity });
      return true;
    }
  } catch (err) {
    console.warn('[event-badge-download] template background skipped:', err);
  }
  return false;
}

// ── Template-based rendering (063A / 068) ────────────────────────────────────
// When admin has uploaded a badge_template asset the uploaded image IS the full
// badge design. We draw it at full opacity and overlay attendee text + QR in
// readable zones, using analysis colours where available.
async function renderBadgeWithTemplate(args: RenderArgs): Promise<Uint8Array> {
  const { badge, event, qrPayload, design } = args;
  const { doc, page, fonts } = await commonInit();

  // Draw the template at full opacity — it IS the badge background
  await drawTemplateBackground(doc, page, design, 1.0);

  const colors = resolveDesignColors(design, {
    ink: rgb(0.05, 0.05, 0.05),
    subtle: rgb(0.35, 0.35, 0.35),
    accent: rgb(0.10, 0.30, 0.55),
    fill: rgb(1, 1, 1),
  });

  const f = snapshotFields(badge);
  const nameOpts = badgeNameOptions(event);
  const displayName = composeBadgeName(f, nameOpts);

  // The uploaded template already contains the visual design. Do not draw
  // panels/cards over it; place only the visitor data in the template's blank
  // visitor area so regenerated badges follow the sample as closely as the
  // current template coordinates allow.
  const contentBottomY = 54;
  const contentTopY = 218;

  // Layout constants (all measured from page bottom).
  const qrSize = 84;
  const qrCenterY = contentTopY - qrSize / 2;
  await drawQrCentered(doc, page, qrPayload, qrCenterY, qrSize);

  // Badge code below QR
  const codeY = qrCenterY - qrSize / 2 - 9;
  drawCentered(page, badge.badge_code, codeY, fonts.courierBold, 11, colors.accent, PAGE_W);

  // Attendee name
  const nameY = codeY - 21;
  drawCentered(page, displayName, nameY, fonts.helvBold, Math.min(nameOpts.fontSize, 17), colors.ink, PAGE_W);

  // Organisation / designation. Do not fall back to profession; the badge
  // should show the visitor's designation only when it was collected.
  let cursor = nameY - 15;
  if (f.company) {
    drawCentered(page, f.company.slice(0, 48), cursor, fonts.helv, 9, colors.subtle, PAGE_W);
    cursor -= 12;
  }
  if (f.designation) {
    drawCentered(page, f.designation.slice(0, 48), cursor, fonts.helv, 9, colors.subtle, PAGE_W);
    cursor -= 12;
  }

  // Visit day
  const dayText = visitDayText(f.visitDate, f.visitAllDays);
  if (dayText) {
    drawCentered(page, dayText, Math.max(contentBottomY + 10, cursor), fonts.helv, 8, colors.subtle, PAGE_W);
  }

  const pdfBytes = await doc.save();
  return pdfBytes;
}

async function drawQrCentered(
  doc: PDFDocument,
  page: PDFPage,
  qrPayload: string,
  centerY: number,
  size: number,
): Promise<{ ok: boolean; bottom: number }> {
  try {
    const bytes = await generateQrPngBytes(qrPayload);
    const img = await doc.embedPng(bytes);
    const x = (PAGE_W - size) / 2;
    const y = centerY - size / 2;
    page.drawImage(img, { x, y, width: size, height: size });
    return { ok: true, bottom: y };
  } catch (err) {
    console.warn('[event-badge-download] QR embed failed:', err);
    return { ok: false, bottom: centerY };
  }
}

function snapshotFields(badge: BadgeRow) {
  const snap = badge.snapshot ?? {};
  return {
    fullName: (String(snap.full_name ?? '').trim() || 'Attendee'),
    surname: String(snap.surname ?? '').trim(),
    givenName: String(snap.given_name ?? '').trim(),
    company: String(snap.company ?? '').trim(),
    profession: String(snap.profession ?? '').trim(),
    designation: String((snap as Record<string, unknown>)['designation'] ?? '').trim(),
    visitDate: String(snap.visit_date ?? '').trim(),
    visitAllDays: Boolean(snap.visit_all_days),
  };
}

// 054: per-event badge name display options live in events.ai_metadata.
function badgeNameOptions(event: EventRow): {
  includeSurname: boolean;
  maxChars: number;
  fontSize: number;
} {
  const meta = (event.ai_metadata ?? {}) as Record<string, unknown>;
  const includeRaw = meta['badge_include_surname'];
  const includeSurname = includeRaw === undefined ? true : Boolean(includeRaw);
  const rawMax = Number(meta['badge_name_max_chars']);
  const maxChars = Number.isFinite(rawMax) && rawMax > 0
    ? Math.max(6, Math.min(40, Math.floor(rawMax)))
    : 25;
  const rawFont = Number(meta['badge_name_font_size']);
  const fontSize = Number.isFinite(rawFont) && rawFont > 0
    ? Math.max(8, Math.min(32, Math.floor(rawFont)))
    : 22;
  return { includeSurname, maxChars, fontSize };
}

function composeBadgeName(
  fields: ReturnType<typeof snapshotFields>,
  options: ReturnType<typeof badgeNameOptions>,
): string {
  let composed = '';
  if (fields.surname || fields.givenName) {
    composed = options.includeSurname
      ? [fields.surname, fields.givenName].filter(Boolean).join(' ')
      : (fields.givenName || fields.surname);
  } else {
    composed = fields.fullName;
  }
  composed = composed.trim() || 'Attendee';
  if (composed.length > options.maxChars) {
    composed = composed.slice(0, Math.max(1, options.maxChars - 1)) + '…';
  }
  return composed;
}

function visitDayText(visitDate: string, visitAllDays: boolean): string {
  if (visitAllDays) return 'All event days';
  if (visitDate) return visitDayLabel(visitDate);
  return '';
}

function drawLubFooter(
  page: PDFPage,
  fonts: BadgeFonts,
  accent: ReturnType<typeof rgb>,
  ink: ReturnType<typeof rgb>,
) {
  const monoSize = 20;
  const monoX = (PAGE_W - monoSize) / 2;
  const monoY = 18;
  page.drawRectangle({ x: monoX, y: monoY, width: monoSize, height: monoSize, color: accent });
  drawCentered(page, 'LUB', monoY + 6, fonts.helvBold, 9, rgb(1, 1, 1), PAGE_W);
  drawCentered(page, 'Laghu Udyog Bharati', 8, fonts.helvBold, 8, ink, PAGE_W);
}

// ── Template 1: Classic Corporate ────────────────────────────────────────
// Solid accent header band; centered metadata rows; QR + code at bottom.
async function renderBadgeClassic(args: RenderArgs): Promise<Uint8Array> {
  const { badge, event, qrPayload, design } = args;
  const { doc, page, fonts } = await commonInit();
  await drawTemplateBackground(doc, page, design, 0.18);
  const colors = resolveDesignColors(design, {
    ink: rgb(0.05, 0.05, 0.05),
    subtle: rgb(0.45, 0.45, 0.45),
    accent: rgb(0.10, 0.30, 0.55),
    fill: rgb(0.96, 0.96, 0.96),
  });
  const { ink, subtle, accent } = colors;
  const lightFill = colors.fill;
  const f = snapshotFields(badge);

  const headerH = 60;
  page.drawRectangle({ x: 0, y: PAGE_H - headerH, width: PAGE_W, height: headerH, color: accent });
  drawCentered(page, 'EVENT BADGE', PAGE_H - 22, fonts.helvBold, 12, rgb(1, 1, 1), PAGE_W);
  const title = (event.title ?? '').slice(0, 60);
  const titleSize = title.length > 30 ? 10 : 12;
  drawCentered(page, title, PAGE_H - 42, fonts.helv, titleSize, rgb(0.92, 0.95, 1), PAGE_W);

  let cursorY = PAGE_H - headerH - 30;
  const nameOpts = badgeNameOptions(event);
  const displayName = composeBadgeName(f, nameOpts);
  drawCentered(page, displayName, cursorY, fonts.helvBold, nameOpts.fontSize, ink, PAGE_W);
  cursorY -= Math.max(20, nameOpts.fontSize + 6);

  const drawRow = (label: string, value: string) => {
    if (!value) return;
    drawCentered(page, label, cursorY, fonts.helv, 7, subtle, PAGE_W);
    drawCentered(page, value.slice(0, 44), cursorY - 12, fonts.helvBold, 11, ink, PAGE_W);
    cursorY -= 30;
  };
  drawRow('ORGANISATION', f.company);
  drawRow('DESIGNATION', f.designation);
  drawRow('DAY OF VISIT', visitDayText(f.visitDate, f.visitAllDays));
  drawRow('EVENT DATES', eventDateBand(event.start_at, event.end_at));

  const qrSize = 110;
  const qr = await drawQrCentered(doc, page, qrPayload, Math.max(180, cursorY - qrSize / 2 - 10), qrSize);
  if (qr.ok) drawCentered(page, 'Scan to verify', qr.bottom - 12, fonts.helv, 7, subtle, PAGE_W);

  const codeBoxY = qr.ok ? qr.bottom - 36 : Math.max(110, cursorY - 50);
  page.drawRectangle({ x: 12, y: codeBoxY - 6, width: PAGE_W - 24, height: 32, color: lightFill });
  drawCentered(page, 'BADGE CODE', codeBoxY + 14, fonts.helv, 7, subtle, PAGE_W);
  drawCentered(page, badge.badge_code, codeBoxY - 1, fonts.courierBold, 16, ink, PAGE_W);

  drawLubFooter(page, fonts, accent, ink);
  return await doc.save();
}

// ── Template 2: Minimal Clean ────────────────────────────────────────────
// White background, accent hairlines, lots of whitespace; QR top, name big.
async function renderBadgeMinimal(args: RenderArgs): Promise<Uint8Array> {
  const { badge, event, qrPayload, design } = args;
  const { doc, page, fonts } = await commonInit();
  await drawTemplateBackground(doc, page, design, 0.18);
  const colors = resolveDesignColors(design, {
    ink: rgb(0.10, 0.10, 0.10),
    subtle: rgb(0.55, 0.55, 0.55),
    accent: rgb(0.10, 0.30, 0.55),
  });
  const { ink, subtle, accent } = colors;
  const f = snapshotFields(badge);

  // Top hairline + small label.
  page.drawLine({
    start: { x: 24, y: PAGE_H - 30 }, end: { x: PAGE_W - 24, y: PAGE_H - 30 },
    thickness: 0.6, color: subtle,
  });
  drawCentered(page, (event.title ?? '').slice(0, 60), PAGE_H - 24, fonts.helv, 9, subtle, PAGE_W);

  // Name dominant — honor per-event font size + truncation/include-surname.
  const nameOpts = badgeNameOptions(event);
  drawCentered(page, composeBadgeName(f, nameOpts), PAGE_H - 70, fonts.helvBold, nameOpts.fontSize + 2, ink, PAGE_W);

  let y = PAGE_H - 100;
  if (f.company) { drawCentered(page, f.company.slice(0, 40), y, fonts.helv, 12, ink, PAGE_W); y -= 18; }
  if (f.designation) { drawCentered(page, f.designation.slice(0, 42), y, fonts.helv, 10, subtle, PAGE_W); y -= 16; }
  const dvt = visitDayText(f.visitDate, f.visitAllDays);
  if (dvt) { drawCentered(page, dvt, y, fonts.helv, 10, subtle, PAGE_W); y -= 16; }
  drawCentered(page, eventDateBand(event.start_at, event.end_at), y, fonts.helv, 10, subtle, PAGE_W);

  const qrSize = 130;
  const qr = await drawQrCentered(doc, page, qrPayload, 180, qrSize);
  if (qr.ok) drawCentered(page, 'Scan to verify', qr.bottom - 12, fonts.helv, 7, subtle, PAGE_W);

  // Code as plain centered text — no fill box.
  drawCentered(page, badge.badge_code, 70, fonts.courierBold, 16, ink, PAGE_W);
  drawLubFooter(page, fonts, accent, ink);
  return await doc.save();
}

// ── Template 3: Bold Header ──────────────────────────────────────────────
// Tall colored header + giant white event title; body block tight.
async function renderBadgeBold(args: RenderArgs): Promise<Uint8Array> {
  const { badge, event, qrPayload, design } = args;
  const { doc, page, fonts } = await commonInit();
  await drawTemplateBackground(doc, page, design, 0.18);
  const colors = resolveDesignColors(design, {
    ink: rgb(0.05, 0.05, 0.05),
    subtle: rgb(0.45, 0.45, 0.45),
    accent: rgb(0.85, 0.20, 0.20),
    fill: rgb(0.97, 0.93, 0.93),
  });
  const { ink, subtle, accent } = colors;
  const lightFill = colors.fill;
  const f = snapshotFields(badge);

  const headerH = 110;
  page.drawRectangle({ x: 0, y: PAGE_H - headerH, width: PAGE_W, height: headerH, color: accent });
  const title = (event.title ?? '').slice(0, 60);
  const titleSize = title.length > 22 ? 16 : 22;
  drawCentered(page, title, PAGE_H - 56, fonts.helvBold, titleSize, rgb(1, 1, 1), PAGE_W);
  drawCentered(page, eventDateBand(event.start_at, event.end_at), PAGE_H - 80, fonts.helv, 11, rgb(1, 0.95, 0.95), PAGE_W);

  let cursorY = PAGE_H - headerH - 36;
  const nameOpts = badgeNameOptions(event);
  drawCentered(page, composeBadgeName(f, nameOpts), cursorY, fonts.helvBold, nameOpts.fontSize, ink, PAGE_W);
  cursorY -= Math.max(20, nameOpts.fontSize);
  if (f.company) { drawCentered(page, f.company.slice(0, 40), cursorY, fonts.helv, 12, ink, PAGE_W); cursorY -= 16; }
  if (f.designation) { drawCentered(page, f.designation.slice(0, 42), cursorY, fonts.helv, 10, subtle, PAGE_W); cursorY -= 14; }
  const dvt = visitDayText(f.visitDate, f.visitAllDays);
  if (dvt) { drawCentered(page, dvt, cursorY, fonts.helv, 10, subtle, PAGE_W); cursorY -= 14; }

  const qrSize = 105;
  const qr = await drawQrCentered(doc, page, qrPayload, Math.max(170, cursorY - qrSize / 2 - 8), qrSize);

  const codeBoxY = qr.ok ? qr.bottom - 36 : 110;
  page.drawRectangle({ x: 12, y: codeBoxY - 6, width: PAGE_W - 24, height: 32, color: lightFill });
  drawCentered(page, badge.badge_code, codeBoxY - 1, fonts.courierBold, 16, ink, PAGE_W);

  drawLubFooter(page, fonts, accent, ink);
  return await doc.save();
}

// ── Template 4: Compact Info ─────────────────────────────────────────────
// Smaller header, two-up rows, larger QR with code beside it (still centered
// composition). Optimized when many fields present.
async function renderBadgeCompact(args: RenderArgs): Promise<Uint8Array> {
  const { badge, event, qrPayload, design } = args;
  const { doc, page, fonts } = await commonInit();
  await drawTemplateBackground(doc, page, design, 0.18);
  const colors = resolveDesignColors(design, {
    ink: rgb(0.05, 0.05, 0.05),
    subtle: rgb(0.45, 0.45, 0.45),
    accent: rgb(0.10, 0.45, 0.30),
    fill: rgb(0.94, 0.97, 0.94),
  });
  const { ink, subtle, accent } = colors;
  const lightFill = colors.fill;
  const f = snapshotFields(badge);

  const headerH = 40;
  page.drawRectangle({ x: 0, y: PAGE_H - headerH, width: PAGE_W, height: headerH, color: accent });
  drawCentered(page, (event.title ?? '').slice(0, 60), PAGE_H - 24, fonts.helvBold, 12, rgb(1, 1, 1), PAGE_W);

  let cursorY = PAGE_H - headerH - 30;
  const nameOpts = badgeNameOptions(event);
  drawCentered(page, composeBadgeName(f, nameOpts), cursorY, fonts.helvBold, nameOpts.fontSize, ink, PAGE_W);
  cursorY -= Math.max(20, nameOpts.fontSize + 2);

  const drawTight = (label: string, value: string) => {
    if (!value) return;
    drawCentered(page, `${label}: ${value.slice(0, 36)}`, cursorY, fonts.helv, 10, ink, PAGE_W);
    cursorY -= 14;
  };
  drawTight('Org', f.company);
  drawTight('Designation', f.designation);
  drawTight('Day', visitDayText(f.visitDate, f.visitAllDays));
  drawTight('Dates', eventDateBand(event.start_at, event.end_at));

  const qrSize = 130;
  const qr = await drawQrCentered(doc, page, qrPayload, Math.max(170, cursorY - qrSize / 2 - 10), qrSize);
  if (qr.ok) drawCentered(page, 'Scan to verify', qr.bottom - 12, fonts.helv, 7, subtle, PAGE_W);

  const codeBoxY = qr.ok ? qr.bottom - 36 : 110;
  page.drawRectangle({ x: 12, y: codeBoxY - 6, width: PAGE_W - 24, height: 32, color: lightFill });
  drawCentered(page, badge.badge_code, codeBoxY - 1, fonts.courierBold, 16, ink, PAGE_W);

  drawLubFooter(page, fonts, accent, ink);
  return await doc.save();
}

const TEMPLATE_RENDERERS: Record<BadgeTemplateKey, (args: RenderArgs) => Promise<Uint8Array>> = {
  classic_corporate: renderBadgeClassic,
  minimal_clean: renderBadgeMinimal,
  bold_header: renderBadgeBold,
  compact_info: renderBadgeCompact,
};

async function renderBadgePdf(
  badge: BadgeRow,
  event: EventRow,
  qrPayload: string,
  design: BadgeDesignContext,
  templateOverride?: string | null,
): Promise<Uint8Array> {
  // COD-EVENTS-REGISTRATION-BADGE-EXPORT-AADHAAR-068:
  // When admin has uploaded a badge_template asset, use it as the full badge design
  // (full-opacity background + text overlay). Skip the hardcoded card layouts that
  // were overlaying the template at 18% opacity.
  if (design.templateAsset && !templateOverride) {
    return await renderBadgeWithTemplate({ badge, event, qrPayload, design });
  }
  const tmpl = resolveTemplate(event, templateOverride);
  return await TEMPLATE_RENDERERS[tmpl]({ badge, event, qrPayload, design });
}

function buildSampleBadge(event: EventRow): BadgeRow {
  return {
    id: 'preview',
    badge_code: 'LUBAPAX4019',
    event_id: event.id,
    snapshot: {
      full_name: 'Patel Aarav',
      surname: 'Patel',
      given_name: 'Aarav',
      company: 'Acme Industries',
      profession: 'company_owner',
      designation: 'Managing Director',
      visit_date: event.start_at ? String(event.start_at).slice(0, 10) : '',
      visit_all_days: false,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError(500, 'service_misconfigured', 'Service configuration missing.');
  }

  const url = new URL(req.url);
  let code = url.searchParams.get('code')?.trim() ?? '';
  let mobile = url.searchParams.get('mobile')?.trim() ?? '';
  let eventSlug = url.searchParams.get('event_slug')?.trim() ?? '';
  const templateOverride = url.searchParams.get('template')?.trim() ?? '';
  const isPreview = url.searchParams.get('preview') === '1';

  if (req.method === 'POST') {
    try {
      const body = (await req.json()) as { code?: string; mobile?: string; event_slug?: string };
      code = (body.code ?? code).trim();
      mobile = (body.mobile ?? mobile).trim();
      eventSlug = (body.event_slug ?? eventSlug).trim();
    } catch {
      // ignore malformed body — still try query params
    }
  }

  // 051 preview branch: render a sample badge for an event using the
  // requested template (or the event's saved template). No badge lookup
  // and no event-end gate — preview is for admins evaluating layouts.
  if (isPreview) {
    if (!eventSlug) {
      return jsonError(400, 'missing_params', 'Preview requires ?event_slug=.');
    }
    const events = await rest<EventRow[]>(
      supabaseUrl, serviceRoleKey,
      `events?slug=eq.${encodeURIComponent(eventSlug)}&select=id,slug,title,start_at,end_at,location,ai_metadata&limit=1`,
    );
    if (!events || events.length === 0) {
      return jsonError(404, 'event_not_found', 'Event not found.');
    }
    const event = events[0];
    const design = await loadBadgeDesignContext(supabaseUrl, serviceRoleKey, event);
    const sample = buildSampleBadge(event);
    const previewQr = `${supabaseUrl}/functions/v1/event-badge-download?code=${encodeURIComponent(sample.badge_code)}`;
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await renderBadgePdf(sample, event, previewQr, design, templateOverride || null);
    } catch (err) {
      console.error('[event-badge-download] preview render error:', err);
      return jsonError(500, 'render_failed', 'Failed to render preview.');
    }
    const filename = `badge-preview-${(templateOverride || resolveTemplate(event, null))}.pdf`;
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store, must-revalidate',
        'Pragma': 'no-cache',
        'ETag': `"${design.etagSeed || 'preview'}"`,
      },
    });
  }

  let resolved: { badge: BadgeRow; event: EventRow } | null = null;
  if (code) {
    resolved = await findBadgeByCode(supabaseUrl, serviceRoleKey, code.toUpperCase());
  } else if (mobile && eventSlug) {
    resolved = await findBadgeByMobile(supabaseUrl, serviceRoleKey, eventSlug, mobile);
  } else {
    return jsonError(400, 'missing_params', 'Provide ?code= or ?event_slug= and ?mobile=.');
  }

  if (!resolved) {
    return jsonError(404, 'badge_not_found', 'No matching badge found.');
  }

  const deadline = eventDownloadDeadline(resolved.event);
  if (deadline !== null && Date.now() > deadline) {
    return jsonError(410, 'event_ended', 'Badge downloads are closed for this event.');
  }

  // QR must expose only the badge code. Check-in staff enter or scan this
  // code on the LUB admin check-in page; no Supabase URL or visitor PII is
  // embedded in the QR payload.
  const qrPayload = resolved.badge.badge_code;

  const design = await loadBadgeDesignContext(supabaseUrl, serviceRoleKey, resolved.event);
  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await renderBadgePdf(resolved.badge, resolved.event, qrPayload, design, templateOverride || null);
  } catch (err) {
    console.error('[event-badge-download] render error:', err);
    return jsonError(500, 'render_failed', 'Failed to render badge.');
  }

  await patch(
    supabaseUrl, serviceRoleKey,
    `event_badges?id=eq.${resolved.badge.id}`,
    { last_downloaded_at: new Date().toISOString() },
  );

  const filename = `badge-${resolved.badge.badge_code}.pdf`;
  return new Response(pdfBytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Cache-Control': 'no-store, must-revalidate',
      'Pragma': 'no-cache',
      'ETag': `"${[resolved.badge.badge_code, design.etagSeed].join(':')}"`,
    },
  });
});
