# Session 78 - COD-SMART-BATCH-005

## Summary

Completed the bundled Smart Upload runtime slice covering:

1. Case-insensitive matching for option-like extracted values.
2. GST certificate-driven GST/PAN autofill.
3. A pre-registration entry choice for new authenticated users before the Member Registration form.

This slice was implemented in runtime/UI code only. No SQL migration was needed.

## Files Changed

- `src/components/SmartUploadDocument.tsx`
- `src/pages/Join.tsx`
- `docs/agent_coordination/TASK_BOARD.md`
- `docs/CURRENT_STATE.md`

## What Changed

### 1. Smart Upload comparison behavior

`SmartUploadDocument.tsx` now supports:

- `normalizeExtractedFields`
  Purpose: let the Join page canonicalize extracted values before conflict detection/autofill.
- `extraControls`
  Purpose: let the Join page inject guidance controls into the Smart Upload action row.

Conflict comparison was narrowed after review:

- Case-insensitive equivalence now applies only to option-like fields:
  - `state`
  - `district`
  - `city`
  - `gender`
  - `gst_registered`
  - `payment_mode`
- Other fields still use normalized but case-sensitive comparison so free-text capitalization changes can still surface as conflicts.

Field ownership/priority was expanded to support GST autofill:

- Added `gst_registered` label and GST-source priority.
- Allowed `pan_company` to be sourced from `gst_certificate` when PAN is derivable from GSTIN.

### 2. Join-side Smart Upload normalization and GST autofill

`Join.tsx` now normalizes extracted Smart Upload values before they are compared or applied:

- `state`, `district`, `city`
  Canonicalized against available DB-backed options using case-insensitive matching.
- `payment_date`
  Normalized into form-compatible date shape.
- `gst_number`
  Sanitized to uppercase alphanumeric.
- `gst_registered`
  Forced to `yes` when GSTIN is present.
- `pan_company`
  Derived from GSTIN when missing, then sanitized.

The in-form Smart Upload mapping now includes:

- `gst_registered`
- `gst_number`
- `pan_company`

### 3. Pre-registration entry flow

For authenticated users with no existing registration:

- `/join` now opens to a choice stage instead of dropping directly into the full form.
- Two paths are offered:
  - Smart Upload-assisted registration
  - Fill form manually

The Smart Upload-assisted stage includes:

- Intro card
- Recommended document guidance
- Staged extracted-data review
- Smart Upload widget with guide selector
- Continue action to carry staged extracted values into the full registration form

Important post-review fix:

- `smartUploadDraft` is cleared after continuing into the form so later manual edits are not masked by stale staged values.

### 4. Existing-registration and failure handling

Existing registration lookup was hardened:

- Existing records still preserve prior status behavior:
  - `pending` -> redirect to dashboard
  - `approved` -> redirect to dashboard
  - `rejected` -> redirect to reapply
- Non-blocking existing rows still prefill the form safely.

Important post-review fix:

- Registration lookup failures are no longer treated as "no existing registration".
- Instead, Join now shows a blocking retry state:
  - message: registration status unavailable
  - action: retry via page reload

This avoids exposing a duplicate-registration path during transient lookup failures.

## Secondary Review

A secondary reviewer agent was asked to inspect:

- `src/pages/Join.tsx`
- `src/components/SmartUploadDocument.tsx`

Initial review found 3 issues:

1. Staged Smart Upload data was not cleared after continuing to the form.
2. Registration lookup failure incorrectly fell through as "no registration".
3. Case-insensitive conflict suppression was too broad and affected free-text fields.

All 3 were fixed.

Additional external review follow-up on 2026-04-14 found 2 more issues:

1. The registration-status retry screen was unreachable because the loading guard still treated `hasRegistrationRecord === null` as blocking even after `registrationStatusError` was set.
2. District/city canonicalization on the pre-registration Smart Upload path could no-op before form entry because district/city options had not been loaded yet.

Both were fixed:

- The registration-status error screen is now checked before the loading gate, and the blocking condition now excludes the explicit error state.
- Join now hydrates district and city options on demand during Smart Upload carry-forward so staged location values are canonicalized before they are merged into the form.

Second-pass review result:

- No remaining material bugs or logic regressions identified in those two files.

## Verification

Commands run:

```bash
npm run lint
npm run build
npm run test:e2e:phase1:local
```

Results:

- `npm run lint`
  PASS - 0 errors / 3 expected warnings
- `npm run build`
  PASS
- `npm run test:e2e:phase1:local`
  Unstable in this environment during this session

Observed readonly smoke issue:

- Admin auth/permission denials intermittently occurred on `/admin/dashboard`
- This did not point to the Join/Smart Upload slice
- The suite was therefore not a clean verifier for this batch in this session

## Claude Review Prompt

Use this prompt if Claude should review the completed slice:

```text
Review the completed Smart Upload runtime batch in C:\webprojects\lub.

Scope:
- C:\webprojects\lub\src\components\SmartUploadDocument.tsx
- C:\webprojects\lub\src\pages\Join.tsx

Implemented goals:
1. Smart Upload matching should not raise conflicts just because extracted option values differ only by case from DB-backed values such as state/district/city.
2. GST certificate extraction should sanitize GSTIN, set GST Registered = yes, and derive/populate PAN from GSTIN when PAN is absent.
3. New authenticated users without an existing registration should see a pre-registration choice screen before the Member Registration form:
   - Smart Upload-assisted registration
   - Fill form manually
4. The Smart Upload-assisted path should stage extracted values, let the user review them, then carry them into the actual form on continue.
5. Existing registration status behavior must remain safe:
   - pending -> dashboard
   - approved -> dashboard
   - rejected -> reapply
6. Registration lookup failures must not expose a duplicate-registration path.

Important implementation details already applied:
- Case-insensitive comparison is now limited to option-like fields only (`state`, `district`, `city`, `gender`, `gst_registered`, `payment_mode`).
- Join-side normalization canonicalizes extracted state/district/city values against DB-backed options before comparison/autofill.
- `smartUploadDraft` is cleared after continuing into the form so stale staged values do not mask live edits.
- Registration lookup failure now renders a blocking retry state instead of falling through as "no registration".

What I want from you:
- Identify any concrete bug, regression, unsafe assumption, or logic conflict still present.
- Focus on runtime behavior, state transitions, and mismatch with existing Join/registration expectations.
- If you find no material issue, say that explicitly.
```
