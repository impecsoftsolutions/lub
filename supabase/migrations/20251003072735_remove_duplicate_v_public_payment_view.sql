/*
  # Remove duplicate v_public_payment view

  ## Summary
  This migration removes the duplicate `v_public_payment` view that was created
  to consolidate payment view naming. The database already has `v_active_payment_settings`
  which follows the established naming convention (`v_active_*`) used throughout the schema.

  ## Details
  - Drops the `v_public_payment` view created in migration 20251003070622
  - The codebase now references `v_active_payment_settings` for consistency
  - Both views provided the same functionality: joining payment_settings with states_master
    to filter active states

  ## Naming Convention Alignment
  Database views follow the pattern:
  - `v_active_cities`
  - `v_active_districts`
  - `v_active_states`
  - `v_active_payment_settings` (maintained)

  ## Changes
  - DROP VIEW: v_public_payment
*/

-- Drop the duplicate view if it exists
DROP VIEW IF EXISTS v_public_payment;
