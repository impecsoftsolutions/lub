import {
  dateTimeSettingsService,
  type DateTimeFormatProfile,
  type PortalDateFormat,
  type PortalTimeFormat,
} from './supabase';

const STORAGE_KEY = 'lub:date_time_format_profile';

export const DEFAULT_DATE_TIME_FORMAT_PROFILE: DateTimeFormatProfile = {
  date_format: 'dd-mm-yyyy',
  time_format: '12h',
};

export const DATE_FORMAT_OPTIONS: Array<{ value: PortalDateFormat; label: string; sample: string }> = [
  { value: 'dd-mm-yyyy', label: 'DD-MM-YYYY', sample: '16-04-2026' },
  { value: 'mm-dd-yyyy', label: 'MM-DD-YYYY', sample: '04-16-2026' },
  { value: 'yyyy-mm-dd', label: 'YYYY-MM-DD', sample: '2026-04-16' },
  { value: 'dd-mmm-yyyy', label: 'DD-MMM-YYYY', sample: '16-Apr-2026' },
];

export const TIME_FORMAT_OPTIONS: Array<{ value: PortalTimeFormat; label: string; sample: string }> = [
  { value: '12h', label: '12-hour', sample: '02:30 PM' },
  { value: '24h', label: '24-hour', sample: '14:30' },
];

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

let currentProfile: DateTimeFormatProfile = readStoredDateTimeFormatProfile();

function normalizeDateFormat(value: unknown): PortalDateFormat {
  switch (typeof value === 'string' ? value.trim().toLowerCase() : '') {
    case 'dd-mm-yyyy':
    case 'mm-dd-yyyy':
    case 'yyyy-mm-dd':
    case 'dd-mmm-yyyy':
      return value as PortalDateFormat;
    default:
      return DEFAULT_DATE_TIME_FORMAT_PROFILE.date_format;
  }
}

function normalizeTimeFormat(value: unknown): PortalTimeFormat {
  switch (typeof value === 'string' ? value.trim().toLowerCase() : '') {
    case '12h':
    case '24h':
      return value as PortalTimeFormat;
    default:
      return DEFAULT_DATE_TIME_FORMAT_PROFILE.time_format;
  }
}

function normalizeProfile(profile?: Partial<DateTimeFormatProfile> | null): DateTimeFormatProfile {
  return {
    date_format: normalizeDateFormat(profile?.date_format),
    time_format: normalizeTimeFormat(profile?.time_format),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function coerceDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const dateOnlyMatch = trimmed.match(DATE_ONLY_RE);
    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1]);
      const monthIndex = Number(dateOnlyMatch[2]) - 1;
      const day = Number(dateOnlyMatch[3]);
      const date = new Date(year, monthIndex, day);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

export function readStoredDateTimeFormatProfile(): DateTimeFormatProfile {
  if (typeof window === 'undefined') {
    return DEFAULT_DATE_TIME_FORMAT_PROFILE;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_DATE_TIME_FORMAT_PROFILE;
    }

    const parsed = JSON.parse(raw) as Partial<DateTimeFormatProfile>;
    return normalizeProfile(parsed);
  } catch {
    return DEFAULT_DATE_TIME_FORMAT_PROFILE;
  }
}

export function hasStoredDateTimeFormatProfile(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return Boolean(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

export function syncDateTimeFormatProfile(profile?: Partial<DateTimeFormatProfile> | null): DateTimeFormatProfile {
  const normalized = normalizeProfile(profile);
  currentProfile = normalized;

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore storage errors and keep in-memory profile.
    }
  }

  return normalized;
}

export function getCurrentDateTimeFormatProfile(): DateTimeFormatProfile {
  return currentProfile;
}

export async function refreshRuntimeDateTimeFormatProfile(): Promise<DateTimeFormatProfile> {
  const runtimeProfile = await dateTimeSettingsService.getRuntimeProfile();
  if (runtimeProfile) {
    return syncDateTimeFormatProfile(runtimeProfile);
  }
  return currentProfile;
}

export function formatDateValue(
  value: Date | string | null | undefined,
  profile: DateTimeFormatProfile = currentProfile,
): string {
  const date = coerceDate(value);
  if (!date) {
    return '';
  }

  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = String(date.getFullYear());

  switch (profile.date_format) {
    case 'mm-dd-yyyy':
      return `${month}-${day}-${year}`;
    case 'yyyy-mm-dd':
      return `${year}-${month}-${day}`;
    case 'dd-mmm-yyyy':
      return `${day}-${MONTH_SHORT[date.getMonth()]}-${year}`;
    case 'dd-mm-yyyy':
    default:
      return `${day}-${month}-${year}`;
  }
}

export function formatTimeValue(
  value: Date | string | null | undefined,
  profile: DateTimeFormatProfile = currentProfile,
): string {
  const date = coerceDate(value);
  if (!date) {
    return '';
  }

  const minutes = pad(date.getMinutes());
  if (profile.time_format === '24h') {
    return `${pad(date.getHours())}:${minutes}`;
  }

  const rawHours = date.getHours();
  const suffix = rawHours >= 12 ? 'PM' : 'AM';
  const hour12 = rawHours % 12 || 12;
  return `${pad(hour12)}:${minutes} ${suffix}`;
}

export function formatDateTimeValue(
  value: Date | string | null | undefined,
  profile: DateTimeFormatProfile = currentProfile,
): string {
  const formattedDate = formatDateValue(value, profile);
  const formattedTime = formatTimeValue(value, profile);
  if (!formattedDate) {
    return '';
  }
  if (!formattedTime) {
    return formattedDate;
  }
  return `${formattedDate} ${formattedTime}`;
}

export function formatMonthYearValue(
  value: Date | string | null | undefined,
  options?: { monthStyle?: 'short' | 'long' },
): string {
  const date = coerceDate(value);
  if (!date) {
    return '';
  }

  const monthStyle = options?.monthStyle === 'short' ? 'short' : 'long';
  const monthLabel = monthStyle === 'short' ? MONTH_SHORT[date.getMonth()] : MONTH_LONG[date.getMonth()];
  return `${monthLabel} ${date.getFullYear()}`;
}
