import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  identifier?: string;
}

interface SendEmailErrorBody {
  error?: string;
  details?: unknown;
}

function normalizeMobile(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits;
}

function identifierKind(value: string): 'email' | 'mobile' | 'unknown' {
  const clean = value.trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return 'email';
  if (/^[1-9][0-9]{9}$/.test(normalizeMobile(value))) return 'mobile';
  return 'unknown';
}

function noAccountMessage(kind: 'email' | 'mobile' | 'unknown'): string {
  if (kind === 'mobile') {
    return 'There is no account registered with this mobile number. Please try with the email address.';
  }
  if (kind === 'email') {
    return 'There is no account registered with this email address. Please try with the mobile number.';
  }
  return 'Enter a valid email address or 10-digit mobile number.';
}

function maskEmail(email: string): string {
  const clean = email.trim();
  if (clean.length <= 8) {
    return `${clean.slice(0, 1)}****${clean.slice(-1)}`;
  }
  return `${clean.slice(0, 4)}********${clean.slice(-4)}`;
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

function appBaseUrl(req: Request): string {
  const configured = (
    Deno.env.get('PUBLIC_SITE_URL') ||
    Deno.env.get('APP_BASE_URL') ||
    Deno.env.get('SITE_URL') ||
    ''
  ).trim();

  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  const origin = req.headers.get('origin')?.trim();
  if (origin) {
    return origin.replace(/\/+$/, '');
  }

  return 'http://localhost:5173';
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('[request-password-reset] Missing Supabase service configuration');
      return jsonResponse({ success: false, error: 'Password reset is not configured.' }, 200);
    }

    const body = await req.json().catch(() => ({})) as RequestBody;
    const identifier = String(body.identifier ?? '').trim();
    const kind = identifierKind(identifier);

    if (!identifier) {
      return jsonResponse({ success: false, error: 'Please enter your email address or mobile number.' }, 200);
    }

    if (kind === 'unknown') {
      return jsonResponse({ success: false, error: noAccountMessage(kind) }, 200);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const normalizedIdentifier = kind === 'email'
      ? identifier.trim().toLowerCase()
      : normalizeMobile(identifier);

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id,email,account_status,is_active')
      .eq(kind === 'email' ? 'email' : 'mobile_number', normalizedIdentifier)
      .maybeSingle();

    if (userError) {
      console.error('[request-password-reset] Account lookup failed:', userError.message);
      return jsonResponse({ success: false, error: 'Unable to send reset email. Please try again.' }, 200);
    }

    if (!user?.id || !user.email || user.account_status === 'suspended' || user.is_active === false) {
      return jsonResponse({ success: false, error: noAccountMessage(kind) }, 200);
    }

    const rawToken = randomToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();

    const { error: invalidateError } = await supabase
      .from('member_password_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('purpose', 'reset')
      .is('used_at', null);

    if (invalidateError) {
      console.error('[request-password-reset] Token invalidation failed:', invalidateError.message);
      return jsonResponse({ success: false, error: 'Unable to send reset email. Please try again.' }, 200);
    }

    const { error: insertError } = await supabase
      .from('member_password_tokens')
      .insert({
        user_id: user.id,
        token_hash: tokenHash,
        purpose: 'reset',
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error('[request-password-reset] Token insert failed:', insertError.message);
      return jsonResponse({ success: false, error: 'Unable to send reset email. Please try again.' }, 200);
    }

    const resetUrl = `${appBaseUrl(req)}/reset-password?token=${encodeURIComponent(rawToken)}`;
    const safeResetUrl = htmlEscape(resetUrl);
    const expiresText = new Date(expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: user.email,
        subject: 'Reset your LUB portal password',
        html: `
          <p>Hello,</p>
          <p>We received a request to set or reset your LUB portal password.</p>
          <p><a href="${safeResetUrl}">Set your password</a></p>
          <p>This link expires at ${htmlEscape(expiresText)}.</p>
          <p>If you did not request this, you can ignore this email.</p>
        `,
        text: [
          'Hello,',
          '',
          'We received a request to set or reset your LUB portal password.',
          '',
          `Set your password: ${resetUrl}`,
          '',
          `This link expires at ${expiresText}.`,
          '',
          'If you did not request this, you can ignore this email.',
        ].join('\n'),
      }),
    });

    if (!emailResponse.ok) {
      const detailsText = await emailResponse.text().catch(() => '');
      let userError = 'Failed to send reset email. Please try again.';

      try {
        const parsed = JSON.parse(detailsText) as SendEmailErrorBody;
        const detailString = typeof parsed.details === 'string'
          ? parsed.details
          : JSON.stringify(parsed.details ?? '');

        if (detailString.includes('RESEND_FROM_ADDRESS')) {
          userError = 'Email sender address is not configured. Please contact admin.';
        } else if (detailString.includes('RESEND_API_KEY')) {
          userError = 'Email service is not configured. Please contact admin.';
        }
      } catch {
        // Keep the generic user-safe error.
      }

      console.error('[request-password-reset] Email send failed with status:', emailResponse.status);
      return jsonResponse({ success: false, error: userError }, 200);
    }

    return jsonResponse({ success: true, maskedEmail: maskEmail(user.email) });
  } catch (error) {
    console.error('[request-password-reset] Unexpected error:', error instanceof Error ? error.message : String(error));
    return jsonResponse({ success: false, error: 'Unable to send reset email. Please try again.' }, 200);
  }
});
