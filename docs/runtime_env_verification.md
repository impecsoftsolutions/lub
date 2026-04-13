# Runtime Environment Verification

This document defines the lightweight runtime checks for `COD-ENV-001`.

## Purpose

Prevent configuration drift and catch environment gaps early without changing app behavior.

## Command

```bash
npm run verify:env
```

## What It Checks

1. Required client runtime variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. Edge email secret readiness (local/process visibility only):
   - `RESEND_API_KEY`
   - `RESEND_FROM_ADDRESS`
3. Storage bucket migration file exists in repo:
   - `supabase/migrations/20260403123000_create_storage_buckets_for_public_files_and_member_photos.sql`
4. Optional live storage bucket verification (`public-files`, `member-photos`) when:
   - `SUPABASE_SERVICE_ROLE_KEY` (or `VITE_SUPABASE_SERVICE_ROLE_KEY`) is available.

## Exit Behavior

- Exit code `0`: no hard failures (warnings may still exist).
- Exit code `1`: one or more hard failures detected.

## Notes

- This verifier does not mutate data, apply migrations, or change runtime code paths.
- Missing `RESEND_*` values are reported because send-email edge function depends on them.
- If service-role key is unavailable, remote bucket check is skipped with a warning.

## Recommended Follow-Up

After any environment changes:

```bash
npm run build
npm run lint
npm run test:e2e:phase1:local
```
