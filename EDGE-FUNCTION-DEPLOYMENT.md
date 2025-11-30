# Edge Function Deployment Guide

## send-email Edge Function

This edge function sends emails via Resend API for password reset and other authentication flows.

---

## Prerequisites

1. **Supabase CLI installed**
   ```bash
   npm install -g supabase
   ```

2. **Resend API Key**
   - Sign up at [resend.com](https://resend.com)
   - Get your API key from the dashboard
   - The API key should start with `re_`

3. **Supabase Project Linked**
   ```bash
   # Login to Supabase
   supabase login

   # Link to your project
   supabase link --project-ref YOUR_PROJECT_REF
   ```

---

## Deployment Steps

### Step 1: Set the Resend API Key Secret

Before deploying, you must configure the `RESEND_API_KEY` secret:

```bash
# Set the secret (replace with your actual Resend API key)
supabase secrets set RESEND_API_KEY=re_your_actual_api_key_here
```

**Verify the secret was set:**
```bash
supabase secrets list
```

You should see `RESEND_API_KEY` in the list.

---

### Step 2: Deploy the Edge Function

From your project root directory:

```bash
# Deploy the send-email function
supabase functions deploy send-email
```

**Expected output:**
```
Deploying send-email (project ref: your-project-ref)
Bundling send-email
Deploying send-email (version: xxxxxxxxx)
Deployed send-email
```

---

### Step 3: Verify Deployment

Test the edge function:

```bash
# Get your function URL
supabase functions list
```

The URL will be: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-email`

**Test with curl:**
```bash
curl -X POST \
  'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-email' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "to": "test@example.com",
    "subject": "Test Email",
    "text": "This is a test email from LUB Membership",
    "html": "<p>This is a test email from <strong>LUB Membership</strong></p>"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "message": "Email sent successfully"
}
```

---

## Troubleshooting

### Error: "RESEND_API_KEY is not configured"

**Solution:** Make sure you set the secret before deploying:
```bash
supabase secrets set RESEND_API_KEY=re_your_api_key
supabase functions deploy send-email
```

### Error: "Failed to send email"

**Possible causes:**
1. Invalid Resend API key
2. Email domain not verified in Resend
3. Resend API quota exceeded

**Check Resend logs:**
- Go to [resend.com/emails](https://resend.com/emails)
- View the email logs and error details

### Error: "Method not allowed"

**Solution:** Make sure you're using POST method, not GET:
```bash
curl -X POST ...  # Correct
curl -X GET ...   # Wrong
```

---

## Testing from Frontend

Once deployed, the edge function will be automatically called by the password reset service:

```typescript
// This happens automatically in passwordReset.ts
const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${anonKey}`,
  },
  body: JSON.stringify({
    to: 'user@example.com',
    subject: 'Reset Your Password',
    html: emailHtml,
    text: emailText,
  }),
});
```

---

## Local Development

To test the edge function locally:

```bash
# Start Supabase local development
supabase start

# Serve the function locally
supabase functions serve send-email --env-file .env.local
```

Create `.env.local` with:
```
RESEND_API_KEY=re_your_api_key_here
```

Test locally:
```bash
curl -X POST \
  'http://localhost:54321/functions/v1/send-email' \
  -H 'Authorization: Bearer YOUR_LOCAL_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "to": "test@example.com",
    "subject": "Local Test",
    "text": "Testing locally"
  }'
```

---

## Email Domain Verification (Important!)

For production use, you MUST verify your email domain in Resend:

1. Go to [resend.com/domains](https://resend.com/domains)
2. Click "Add Domain"
3. Enter: `lub.org.in`
4. Add the DNS records provided by Resend to your domain:
   - SPF record
   - DKIM record
   - DMARC record (optional but recommended)
5. Wait for verification (usually takes 5-15 minutes)

**Until domain is verified:**
- You can only send to verified email addresses
- Production emails will fail

**After domain is verified:**
- You can send to any email address
- Better email deliverability
- Professional sender reputation

---

## Monitoring

### View Function Logs

```bash
# View recent logs
supabase functions logs send-email

# Follow logs in real-time
supabase functions logs send-email --follow
```

### Check Email Delivery in Resend

1. Go to [resend.com/emails](https://resend.com/emails)
2. View all sent emails
3. Check delivery status
4. View bounce/complaint rates

---

## Security Notes

1. **API Key Security:**
   - NEVER commit API keys to Git
   - Use `supabase secrets` to store keys
   - Rotate keys periodically

2. **Rate Limiting:**
   - Resend free tier: 100 emails/day
   - Paid tier: Higher limits
   - Consider implementing rate limiting in your app

3. **CORS:**
   - The function allows all origins (`*`)
   - Consider restricting to your domain in production

---

## Updating the Function

If you make changes to the edge function code:

```bash
# Deploy the updated version
supabase functions deploy send-email

# The function URL stays the same
# No changes needed in the frontend
```

---

## Production Checklist

Before going to production:

- [ ] Resend API key configured via `supabase secrets`
- [ ] Domain `lub.org.in` verified in Resend
- [ ] Function deployed successfully
- [ ] Test email sent and received
- [ ] Logs show no errors
- [ ] Password reset flow tested end-to-end
- [ ] Email templates look good on mobile and desktop
- [ ] SPF, DKIM, DMARC records configured
- [ ] Monitoring/alerts set up for failed emails

---

## Cost Considerations

**Resend Pricing:**
- Free: 100 emails/day (3,000/month)
- Pro: $20/month for 50,000 emails/month
- Scale: Custom pricing for higher volumes

**Estimated Usage:**
- 145 legacy users (one-time password reset)
- ~10 password resets/day (ongoing)
- Well within free tier initially

---

## Support

If you encounter issues:

1. Check Supabase function logs: `supabase functions logs send-email`
2. Check Resend email logs: [resend.com/emails](https://resend.com/emails)
3. Verify domain status: [resend.com/domains](https://resend.com/domains)
4. Contact Resend support: [resend.com/support](https://resend.com/support)
