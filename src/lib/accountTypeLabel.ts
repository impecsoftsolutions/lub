// Display-only label mapping for the user `account_type` enum.
//
// IMPORTANT: This maps STORED backend values to user-facing product language.
// The backend enum values themselves are NOT renamed - keep using
// `account_type === 'general_user'` etc. in all logic checks.
//
//   general_user -> Free Member            (free portal account, not yet approved paid member)
//   member       -> Paid Member            (approved paid LUB member)
//   both         -> Paid Member + Admin     (paid member with admin access)
//   admin        -> Admin                   (admin only)

export type AccountType = 'admin' | 'member' | 'both' | 'general_user';

export function accountTypeLabel(accountType: AccountType | string | null | undefined): string {
  switch (accountType) {
    case 'general_user':
      return 'Free Member';
    case 'member':
      return 'Paid Member';
    case 'both':
      return 'Paid Member + Admin';
    case 'admin':
      return 'Admin';
    default:
      return 'Unknown';
  }
}
