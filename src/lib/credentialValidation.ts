export const AUTH_VALIDATION_MESSAGES = {
  emailRequired: 'Email address is required',
  emailInvalid: 'Please enter a valid email address',
  mobileRequired: 'Mobile number is required',
  mobileInvalid: 'Please enter a valid 10-digit mobile number',
  mobileInvalidStrict: 'Please enter a valid 10-digit mobile number starting with a non-zero digit'
} as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_REGEX = /^[1-9][0-9]{9}$/;

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function normalizeMobileNumber(input: string): string {
  let digitsOnly = input.replace(/\D/g, '');

  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    digitsOnly = digitsOnly.slice(1);
  }

  return digitsOnly;
}

export function isEmail(input: string): boolean {
  return EMAIL_REGEX.test(normalizeEmail(input));
}

export function isMobileNumber(input: string): boolean {
  return MOBILE_REGEX.test(normalizeMobileNumber(input));
}

export function validateEmailInput(
  input: string,
  options?: { requiredMessage?: string; invalidMessage?: string }
): string | null {
  const normalized = normalizeEmail(input);

  if (!normalized) {
    return options?.requiredMessage ?? AUTH_VALIDATION_MESSAGES.emailRequired;
  }

  if (!isEmail(normalized)) {
    return options?.invalidMessage ?? AUTH_VALIDATION_MESSAGES.emailInvalid;
  }

  return null;
}

export function validateMobileNumberInput(
  input: string,
  options?: { requiredMessage?: string; invalidMessage?: string }
): string | null {
  const normalized = normalizeMobileNumber(input);

  if (!normalized) {
    return options?.requiredMessage ?? AUTH_VALIDATION_MESSAGES.mobileRequired;
  }

  if (!isMobileNumber(normalized)) {
    return options?.invalidMessage ?? AUTH_VALIDATION_MESSAGES.mobileInvalid;
  }

  return null;
}
