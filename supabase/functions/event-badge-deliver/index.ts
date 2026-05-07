// =============================================================================
// Edge Function: event-badge-deliver
// Slice: COD-EVENTS-BADGES-048
//
// Triggered by admin "Send" / "Retry" action. Reads a delivery row,
// composes an email containing a one-shot download link to
// event-badge-download?code=<badge_code>, invokes the existing send-email
// function, then writes back the attempt result.
//
// Honest semantics:
//   - Bumps attempts++.
//   - Writes status='sent' with sent_at on a 2xx send-email response.
//   - Writes status='failed' with last_error on any failure path.
// Never silently fakes success.
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface DeliveryRow {
  id: string;
  badge_id: string;
  channel: string;
  recipient: string;
  status: string;
  attempts: number;
}

interface BadgeRow {
  id: string;
  badge_code: string;
  event_id: string;
  snapshot: Record<string, unknown>;
}

interface EventRow {
  id: string;
  title: string;
  slug: string;
  start_at: string | null;
  end_at: string | null;
  location: string | null;
}

async function rest<T>(supabaseUrl: string, key: string, path: string): Promise<T | null> {
  const resp = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!resp.ok) return null;
  return (await resp.json()) as T;
}

async function patch(
  supabaseUrl: string, key: string, path: string, body: Record<string, unknown>,
): Promise<void> {
  await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
}

async function rpc<T>(
  supabaseUrl: string, key: string, fn: string, params: Record<string, unknown>,
): Promise<T | null> {
  const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(params),
  });
  if (!resp.ok) return null;
  return (await resp.json()) as T;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function buildEmail(downloadUrl: string, event: EventRow, snap: Record<string, unknown>) {
  const fullName = String(snap.full_name ?? 'there').trim();
  const title = event.title || 'the event';
  const dates = event.start_at
    ? `${fmtDate(event.start_at)}${event.end_at ? ` to ${fmtDate(event.end_at)}` : ''}`
    : '';
  const subject = `Your badge for ${title}`;
  const text = [
    `Hi ${fullName},`,
    '',
    `Thanks for registering for ${title}.`,
    dates ? `Dates: ${dates}` : '',
    event.location ? `Venue: ${event.location}` : '',
    '',
    'Download your badge (4×6 inch PDF):',
    downloadUrl,
    '',
    'Please bring this badge with you to the venue. The link expires shortly after the event ends.',
  ].filter(Boolean).join('\n');
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:14px;color:#222;line-height:1.5">
      <p>Hi ${fullName},</p>
      <p>Thanks for registering for <strong>${title}</strong>.</p>
      ${dates ? `<p><strong>Dates:</strong> ${dates}</p>` : ''}
      ${event.location ? `<p><strong>Venue:</strong> ${event.location}</p>` : ''}
      <p style="margin:20px 0">
        <a href="${downloadUrl}" style="display:inline-block;background:#1a4f8a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600">
          Download your badge (PDF)
        </a>
      </p>
      <p style="font-size:12px;color:#666">
        Please bring this badge with you to the venue. The link expires shortly after the event ends.
      </p>
    </div>
  `;
  return { subject, text, html };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error_code: 'method_not_allowed', error: 'POST only' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
  const siteUrl = Deno.env.get('PUBLIC_SITE_URL')?.trim() ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ success: false, error_code: 'service_misconfigured', error: 'Service config missing' }, 500);
  }

  let body: { session_token?: string; delivery_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error_code: 'invalid_payload', error: 'JSON payload required' }, 400);
  }

  const sessionToken = (body.session_token ?? '').trim();
  const deliveryId = (body.delivery_id ?? '').trim();
  if (!sessionToken || !deliveryId) {
    return jsonResponse({ success: false, error_code: 'missing_params', error: 'session_token and delivery_id are required' }, 400);
  }

  // Authorization: events.rsvp.manage required.
  const actorId = await rpc<string>(supabaseUrl, serviceRoleKey, 'resolve_custom_session_user_id', {
    p_session_token: sessionToken,
  });
  if (!actorId || typeof actorId !== 'string') {
    return jsonResponse({ success: false, error_code: 'session_invalid', error: 'Invalid session' });
  }
  const canManage = await rpc<boolean>(supabaseUrl, serviceRoleKey, 'has_permission', {
    p_user_id: actorId,
    p_permission_code: 'events.rsvp.manage',
  });
  if (!canManage) {
    return jsonResponse({ success: false, error_code: 'permission_denied', error: 'Not authorized' });
  }

  const deliveries = await rest<DeliveryRow[]>(
    supabaseUrl, serviceRoleKey,
    `event_badge_deliveries?id=eq.${deliveryId}&select=id,badge_id,channel,recipient,status,attempts&limit=1`,
  );
  if (!deliveries || deliveries.length === 0) {
    return jsonResponse({ success: false, error_code: 'delivery_not_found', error: 'Delivery not found' });
  }
  const delivery = deliveries[0];

  const badges = await rest<BadgeRow[]>(
    supabaseUrl, serviceRoleKey,
    `event_badges?id=eq.${delivery.badge_id}&select=id,badge_code,event_id,snapshot&limit=1`,
  );
  if (!badges || badges.length === 0) {
    return jsonResponse({ success: false, error_code: 'badge_not_found', error: 'Badge not found' });
  }
  const badge = badges[0];

  const events = await rest<EventRow[]>(
    supabaseUrl, serviceRoleKey,
    `events?id=eq.${badge.event_id}&select=id,title,slug,start_at,end_at,location&limit=1`,
  );
  if (!events || events.length === 0) {
    return jsonResponse({ success: false, error_code: 'event_not_found', error: 'Event not found' });
  }
  const event = events[0];

  // Don't send if the event is already past its grace window.
  const ref = event.end_at || event.start_at;
  if (ref) {
    const deadline = new Date(ref).getTime() + 12 * 60 * 60 * 1000;
    if (Date.now() > deadline) {
      await patch(supabaseUrl, serviceRoleKey, `event_badge_deliveries?id=eq.${deliveryId}`, {
        status: 'failed',
        attempts: delivery.attempts + 1,
        last_error: 'event_ended',
        last_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return jsonResponse({ success: false, error_code: 'event_ended', error: 'Event has ended; badge link is no longer valid.' });
    }
  }

  // Build the download URL. Prefer SITE_URL site path so users land on a
  // friendly origin when configured; otherwise direct edge function URL.
  const codeParam = encodeURIComponent(badge.badge_code);
  const downloadUrl = siteUrl
    ? `${siteUrl.replace(/\/+$/, '')}/api/event-badge?code=${codeParam}`
    : `${supabaseUrl}/functions/v1/event-badge-download?code=${codeParam}`;

  const { subject, text, html } = buildEmail(downloadUrl, event, badge.snapshot ?? {});

  let sendOk = false;
  let sendError: string | null = null;
  try {
    const sendResp = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: delivery.recipient, subject, html, text }),
    });
    if (sendResp.ok) {
      sendOk = true;
    } else {
      const errBody = await sendResp.text();
      sendError = `send-email returned ${sendResp.status}: ${errBody.slice(0, 400)}`;
    }
  } catch (err) {
    sendError = err instanceof Error ? err.message : 'Unknown send-email error';
  }

  const nowIso = new Date().toISOString();
  await patch(
    supabaseUrl, serviceRoleKey,
    `event_badge_deliveries?id=eq.${deliveryId}`,
    sendOk
      ? {
          status: 'sent',
          attempts: delivery.attempts + 1,
          last_error: null,
          last_attempt_at: nowIso,
          sent_at: nowIso,
          updated_at: nowIso,
        }
      : {
          status: 'failed',
          attempts: delivery.attempts + 1,
          last_error: sendError ?? 'unknown',
          last_attempt_at: nowIso,
          updated_at: nowIso,
        },
  );

  if (!sendOk) {
    return jsonResponse({ success: false, error_code: 'send_failed', error: sendError ?? 'Email send failed' });
  }
  return jsonResponse({ success: true, sent_at: nowIso, recipient: delivery.recipient });
});
