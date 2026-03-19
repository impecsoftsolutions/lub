import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface Phase1SmokeFixtures {
  registrations?: {
    approve_target_email?: string;
    reject_target_email?: string;
    delete_target_email?: string;
    toggle_target_email?: string;
    edit_target_email?: string;
  };
  deleted_members?: {
    restore_target_email?: string;
  };
  users?: {
    general_user_delete_email?: string;
    general_user_block_email?: string;
    non_general_user_delete_email?: string;
    editable_target_email?: string;
    editable_user_email?: string;
  };
  locations?: {
    state_name?: string;
    pending_city_name?: string;
    approved_city_name_for_assignment?: string;
    city_add_name_prefix?: string;
    district_add_name_prefix?: string;
    district_with_cities_name?: string;
    district_without_cities_name?: string;
  };
  validation?: {
    rule_name_prefix?: string;
    move_target_category?: string;
  };
  payment?: {
    edit_state?: string;
    create_state?: string;
    qr_file_path?: string;
  };
  forms?: {
    field_name?: string;
  };
}

export function loadSmokeFixtures(): Phase1SmokeFixtures | null {
  const fixturePath = process.env.PHASE1_SMOKE_FIXTURES_FILE?.trim();

  if (!fixturePath) {
    return null;
  }

  const raw = readFileSync(resolve(fixturePath), 'utf8');
  return JSON.parse(raw) as Phase1SmokeFixtures;
}

export function buildUniqueValue(prefix: string, fallbackPrefix: string): string {
  const effectivePrefix = (prefix || fallbackPrefix).trim().replace(/\s+/g, '-').toLowerCase();
  return `${effectivePrefix}${Date.now()}`;
}
