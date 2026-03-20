const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface EmailRequest {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

interface ResendEmailPayload {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }

  try {
    const emailRequest: EmailRequest = await req.json();
    const { to, subject, html, text, from } = emailRequest;

    if (!to || !subject) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields',
          details: 'Both "to" and "subject" are required',
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    if (!html && !text) {
      return new Response(
        JSON.stringify({
          error: 'Missing email content',
          details: 'Either "html" or "text" must be provided',
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not configured');
      return new Response(
        JSON.stringify({
          error: 'Email service not configured',
          details: 'RESEND_API_KEY environment variable is missing',
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const fromAddress = from || 'LUB Membership <noreply@lub.org.in>';

    const emailPayload: ResendEmailPayload = {
      from: fromAddress,
      to: Array.isArray(to) ? to : [to],
      subject,
    };

    if (html) {
      emailPayload.html = html;
    }

    if (text) {
      emailPayload.text = text;
    }

    console.log('[send-email] Sending email to:', Array.isArray(to) ? to.join(', ') : to);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('[send-email] Resend API error:', responseData);
      return new Response(
        JSON.stringify({
          error: 'Failed to send email',
          details: responseData,
        }),
        {
          status: response.status,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log('[send-email] Email sent successfully:', responseData.id);

    return new Response(
      JSON.stringify({
        success: true,
        id: responseData.id,
        message: 'Email sent successfully',
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[send-email] Unexpected error:', error);

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
