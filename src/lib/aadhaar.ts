// COD-EVENTS-REGISTRATION-COMPLETE-059
// Small helpers for Aadhaar Card normalization, validation, and masking.
// No Verhoeff checksum in this slice (length-only validation).

export function normalizeAadhaar(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw).replace(/\D/g, '');
}

export function isValidAadhaarLength(raw: string | null | undefined): boolean {
  return normalizeAadhaar(raw).length === 12;
}

/**
 * Mask an Aadhaar number for admin UI / export display:
 *   12-digit normalized -> "XXXX XXXX 1234"
 * If fewer than 12 digits are present (e.g. legacy/partial), still mask the
 * last 4 we know about; otherwise return an empty string so callers can show
 * a dash or placeholder of their choice.
 */
export function maskAadhaar(raw: string | null | undefined): string {
  const digits = normalizeAadhaar(raw);
  if (digits.length === 0) return '';
  if (digits.length < 4) {
    // Not enough to safely show last-4; mask everything.
    return 'XXXX XXXX XXXX';
  }
  const last4 = digits.slice(-4);
  return `XXXX XXXX ${last4}`;
}
