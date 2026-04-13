export type ThemeId = 'ocean-breeze' | 'forest' | 'sunset' | 'grape' | '';
export type ColorMode = 'light' | 'dark' | 'system';
export type RadiusOption = 'sharp' | 'balanced' | 'rounded';
export type FontOption = 'system' | 'segoe-ui-variable' | 'inter' | 'dm-sans' | 'outfit' | 'nunito' | 'poppins';

export interface FontConfig {
  id: FontOption;
  name: string;
  description: string;
  stack: string;
  googleUrl: string | null;
}

export const FONT_OPTIONS: FontConfig[] = [
  {
    id: 'system',
    name: 'System Default',
    description: 'Uses your OS font',
    stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    googleUrl: null,
  },
  {
    id: 'segoe-ui-variable' as FontOption,
    name: 'Segoe UI Variable',
    description: 'Windows 11 native',
    stack: '"Segoe UI Variable", "Segoe UI", system-ui, sans-serif',
    googleUrl: null,
  },
  {
    id: 'inter',
    name: 'Inter',
    description: 'Clean & modern',
    stack: '"Inter", sans-serif',
    googleUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
  {
    id: 'dm-sans',
    name: 'DM Sans',
    description: 'Humanist & crisp',
    stack: '"DM Sans", sans-serif',
    googleUrl: 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap',
  },
  {
    id: 'outfit',
    name: 'Outfit',
    description: 'Geometric & clean',
    stack: '"Outfit", sans-serif',
    googleUrl: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap',
  },
  {
    id: 'nunito',
    name: 'Nunito',
    description: 'Rounded & friendly',
    stack: '"Nunito", sans-serif',
    googleUrl: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap',
  },
  {
    id: 'poppins',
    name: 'Poppins',
    description: 'Geometric & popular',
    stack: '"Poppins", sans-serif',
    googleUrl: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
  },
];

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  description: string;
  swatches: { primary: string; secondary: string; base: string };
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'ocean-breeze',
    name: 'Ocean Breeze',
    description: 'Cool blue tones',
    swatches: { primary: '#4f7cf7', secondary: '#5b6ef5', base: '#e8ede8' },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Natural greens',
    swatches: { primary: '#3ca066', secondary: '#33a882', base: '#f0f4f0' },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm amber tones',
    swatches: { primary: '#c98a2a', secondary: '#c26f20', base: '#faf5f0' },
  },
  {
    id: 'grape',
    name: 'Grape',
    description: 'Rich purples',
    swatches: { primary: '#8b44bf', secondary: '#a040c5', base: '#f5f0fa' },
  },
  {
    id: '',
    name: 'Classic',
    description: 'Clean neutral style',
    swatches: { primary: '#1e293b', secondary: '#64748b', base: '#f8fafc' },
  },
];

export const RADIUS_PRESETS: { id: RadiusOption; label: string; px: number }[] = [
  { id: 'sharp',    label: 'Sharp',    px: 2  },
  { id: 'balanced', label: 'Balanced', px: 8  },
  { id: 'rounded',  label: 'Rounded',  px: 14 },
];

// ─── Storage keys ──────────────────────────────────────────────────────────
const THEME_KEY        = 'lub_theme_preset';
const COLOR_MODE_KEY   = 'lub_color_mode';
const CUSTOM_COLOR_KEY = 'lub_custom_color';
const RADIUS_KEY       = 'lub_radius';
const FONT_KEY         = 'lub_font_family';

// ─── Primary colour scale ──────────────────────────────────────────────────
// L/C/H scale mirrors Ocean Breeze — only hue changes.
const PRIMARY_SCALE: [number, number, number][] = [
  [50,   0.97,   0.0123],
  [100,  0.932,  0.0281],
  [200,  0.882,  0.0518],
  [300,  0.809,  0.0922],
  [400,  0.707,  0.1449],
  [500,  0.623,  0.188 ],
  [600,  0.5461, 0.2152],
  [700,  0.488,  0.2134],
  [800,  0.424,  0.1748],
  [900,  0.379,  0.1282],
  [950,  0.282,  0.0799],
  [1000, 0.219,  0.0483],
];

// ─── Helpers ───────────────────────────────────────────────────────────────
function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

/** Convert a CSS hex colour string to an approximate oklch hue (0–360). */
export function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 210; // fall back to blue
  let h = 0;
  if (max === r)      h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else                h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

// ─── Theme preset ──────────────────────────────────────────────────────────
export function getTheme(): ThemeId {
  return (safeGet(THEME_KEY) as ThemeId) ?? 'ocean-breeze';
}

export function setTheme(id: ThemeId): void {
  safeSet(THEME_KEY, id);
  document.documentElement.setAttribute('data-theme-preset', id);
  // When switching to a named preset, clear any custom colour override
  // so the preset's own primary colours take effect.
  if (safeGet(CUSTOM_COLOR_KEY) === null) {
    clearCustomColorOverride();
  }
}

// ─── Custom brand colour ───────────────────────────────────────────────────
export function getCustomColor(): string | null {
  return safeGet(CUSTOM_COLOR_KEY);
}

export function setCustomColor(hex: string): void {
  safeSet(CUSTOM_COLOR_KEY, hex);
  applyCustomColor(hex);
}

export function clearCustomColor(): void {
  try { localStorage.removeItem(CUSTOM_COLOR_KEY); } catch { /* storage unavailable */ }
  clearCustomColorOverride();
}

export function applyCustomColor(hex: string): void {
  const hue = hexToHue(hex);
  const root = document.documentElement;
  for (const [level, l, c] of PRIMARY_SCALE) {
    root.style.setProperty(`--primary-${level}`, `oklch(${l} ${c} ${hue})`);
  }
  // Also update the semantic tokens that reference primary-600
  root.style.setProperty('--primary', 'var(--primary-600)');
  root.style.setProperty('--ring', 'var(--primary-600)');
  root.style.setProperty('--sidebar-primary', 'var(--primary-600)');
  root.style.setProperty('--sidebar-ring', 'var(--primary-600)');
}

function clearCustomColorOverride(): void {
  const root = document.documentElement;
  for (const [level] of PRIMARY_SCALE) {
    root.style.removeProperty(`--primary-${level}`);
  }
  root.style.removeProperty('--primary');
  root.style.removeProperty('--ring');
  root.style.removeProperty('--sidebar-primary');
  root.style.removeProperty('--sidebar-ring');
}

// ─── Corner radius ─────────────────────────────────────────────────────────
const LEGACY_RADIUS_MAP: Record<string, number> = { sharp: 2, balanced: 8, rounded: 14 };

export function getRadiusPx(): number {
  const stored = safeGet(RADIUS_KEY);
  if (stored) {
    const num = parseFloat(stored);
    if (!isNaN(num)) return num;
    if (stored in LEGACY_RADIUS_MAP) return LEGACY_RADIUS_MAP[stored]; // migrate old preset name
  }
  return 8; // default — "balanced"
}

export function setRadiusPx(px: number): void {
  safeSet(RADIUS_KEY, String(px));
  applyRadiusPx(px);
}

export function applyRadiusPx(px: number): void {
  document.documentElement.style.setProperty('--radius', `${px}px`);
}

// ─── Colour mode ───────────────────────────────────────────────────────────
export function getColorMode(): ColorMode {
  return (safeGet(COLOR_MODE_KEY) as ColorMode) ?? 'light';
}

export function setColorMode(mode: ColorMode): void {
  safeSet(COLOR_MODE_KEY, mode);
  applyColorMode(mode);
}

export function applyColorMode(mode: ColorMode): void {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' || (mode === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', isDark);
}

// ─── Typography settings ───────────────────────────────────────────────────

export type TypographySizeId = 's' | 'm' | 'l' | 'xl';

export interface TypographySizeOption {
  id: TypographySizeId;
  label: string;
  value: string;
}

export interface TypographyRoleConfig {
  id: string;
  label: string;
  affects: string;
  sample: string;
  /** CSS custom property for font-size override */
  sizeVar: string;
  /** CSS custom property for font-weight override */
  weightVar: string;
  sizes: TypographySizeOption[];
  defaultSizeId: TypographySizeId;
  defaultWeight: number;
}

export const TYPOGRAPHY_ROLES: TypographyRoleConfig[] = [
  {
    id: 'pageTitle',
    label: 'Page Title',
    affects: 'Main heading at the top of each admin page (h1)',
    sample: 'Members Management',
    sizeVar: '--text-xl',
    weightVar: '--typ-page-title-weight',
    sizes: [
      { id: 's',  label: 'S',  value: '1rem'    },
      { id: 'm',  label: 'M',  value: '1.125rem' },
      { id: 'l',  label: 'L',  value: '1.25rem'  },
      { id: 'xl', label: 'XL', value: '1.5rem'   },
    ],
    defaultSizeId: 'l',
    defaultWeight: 600,
  },
  {
    id: 'sectionHeading',
    label: 'Section Heading',
    affects: 'Card titles, modal headings, panel section labels',
    sample: 'Personal Information',
    sizeVar: '--text-section',
    weightVar: '--typ-section-weight',
    sizes: [
      { id: 's',  label: 'S',  value: '0.8125rem' },
      { id: 'm',  label: 'M',  value: '0.875rem'  },
      { id: 'l',  label: 'L',  value: '0.9375rem' },
      { id: 'xl', label: 'XL', value: '1.0625rem' },
    ],
    defaultSizeId: 'l',
    defaultWeight: 600,
  },
  {
    id: 'bodyText',
    label: 'Body & Table Cells',
    affects: 'Descriptions, paragraph text, and table row content',
    sample: 'Showing 248 members across 12 active states',
    sizeVar: '--text-sm',
    weightVar: '--typ-body-weight',
    sizes: [
      { id: 's',  label: 'S',  value: '0.75rem'   },
      { id: 'm',  label: 'M',  value: '0.8125rem' },
      { id: 'l',  label: 'L',  value: '0.875rem'  },
      { id: 'xl', label: 'XL', value: '1rem'      },
    ],
    defaultSizeId: 'l',
    defaultWeight: 400,
  },
  {
    id: 'tableHeader',
    label: 'Table Headers & Labels',
    affects: 'Column headers in data tables and form field labels',
    sample: 'Member Name',
    sizeVar: '--text-label',
    weightVar: '--typ-label-weight',
    sizes: [
      { id: 's',  label: 'S',  value: '0.6875rem' },
      { id: 'm',  label: 'M',  value: '0.75rem'   },
      { id: 'l',  label: 'L',  value: '0.8125rem' },
      { id: 'xl', label: 'XL', value: '0.9375rem' },
    ],
    defaultSizeId: 'l',
    defaultWeight: 500,
  },
  {
    id: 'caption',
    label: 'Captions & Badges',
    affects: 'Helper text, status badges, timestamps, and footnotes',
    sample: 'Active · Approved Jan 2024',
    sizeVar: '--text-xs',
    weightVar: '--typ-caption-weight',
    sizes: [
      { id: 's',  label: 'S',  value: '0.625rem'  },
      { id: 'm',  label: 'M',  value: '0.6875rem' },
      { id: 'l',  label: 'L',  value: '0.75rem'   },
      { id: 'xl', label: 'XL', value: '0.875rem'  },
    ],
    defaultSizeId: 'l',
    defaultWeight: 400,
  },
];

export interface TypographyRoleSettings {
  sizeId: TypographySizeId;
  weight: number;
}

export type TypographySettings = Record<string, TypographyRoleSettings>;

export const DEFAULT_TYPOGRAPHY: TypographySettings = Object.fromEntries(
  TYPOGRAPHY_ROLES.map((r) => [r.id, { sizeId: r.defaultSizeId, weight: r.defaultWeight }])
);

const TYPOGRAPHY_KEY = 'lub_typography';

export function getTypographySettings(): TypographySettings {
  try {
    const raw = safeGet(TYPOGRAPHY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TypographySettings;
      return { ...DEFAULT_TYPOGRAPHY, ...parsed };
    }
  } catch { /* corrupt/missing — use defaults */ }
  return { ...DEFAULT_TYPOGRAPHY };
}

export function setTypographySettings(settings: TypographySettings): void {
  safeSet(TYPOGRAPHY_KEY, JSON.stringify(settings));
  applyTypographySettings(settings);
}

export function resetTypographySettings(): void {
  try { localStorage.removeItem(TYPOGRAPHY_KEY); } catch { /* ignore */ }
  applyTypographySettings(DEFAULT_TYPOGRAPHY);
}

export function applyTypographySettings(settings: TypographySettings): void {
  const root = document.documentElement;
  for (const role of TYPOGRAPHY_ROLES) {
    const roleSettings = settings[role.id] ?? { sizeId: role.defaultSizeId, weight: role.defaultWeight };
    const sizeOption = role.sizes.find((s) => s.id === roleSettings.sizeId) ?? role.sizes.find((s) => s.id === role.defaultSizeId)!;
    root.style.setProperty(role.sizeVar, sizeOption.value);
    root.style.setProperty(role.weightVar, String(roleSettings.weight));
  }
}

// ─── Font family ───────────────────────────────────────────────────────────
export function getFontFamily(): FontOption {
  return (safeGet(FONT_KEY) as FontOption) ?? 'system';
}

export function setFontFamily(id: FontOption): void {
  safeSet(FONT_KEY, id);
  applyFontFamily(id);
}

export function applyFontFamily(id: FontOption): void {
  const font = FONT_OPTIONS.find((f) => f.id === id);
  if (!font) return;
  // Inject Google Fonts stylesheet if not already present
  if (font.googleUrl) {
    const linkId = `lub-font-${id}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = font.googleUrl;
      document.head.appendChild(link);
    }
  }
  document.documentElement.style.setProperty('--font-body', font.stack);
}

// ─── Table style ───────────────────────────────────────────────────────────

export type TableBorderOption = 'none' | 'thin' | 'medium' | 'thick';
export type TableShadowOption = 'none' | 'subtle' | 'soft' | 'strong';
export type CardShadowOption  = 'none' | 'subtle' | 'soft' | 'strong';

export const TABLE_BORDER_OPTIONS: { id: TableBorderOption; label: string; value: string; description: string }[] = [
  { id: 'none',   label: 'None',   value: '0',   description: 'No row dividers' },
  { id: 'thin',   label: 'Thin',   value: '1px', description: '1 px — default' },
  { id: 'medium', label: 'Medium', value: '2px', description: '2 px' },
  { id: 'thick',  label: 'Thick',  value: '3px', description: '3 px' },
];

export const TABLE_SHADOW_OPTIONS: { id: TableShadowOption; label: string; value: string; description: string }[] = [
  { id: 'none',   label: 'None',   value: 'none',
    description: 'No shadow' },
  { id: 'subtle', label: 'Subtle', value: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    description: 'Matches default' },
  { id: 'soft',   label: 'Soft',   value: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    description: 'Medium depth' },
  { id: 'strong', label: 'Strong', value: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    description: 'High depth' },
];

// ─── Table density ─────────────────────────────────────────────────────────
export type TableDensityOption = 'compact' | 'normal' | 'relaxed';

export const TABLE_DENSITY_OPTIONS: { id: TableDensityOption; label: string; description: string; headerPy: string; rowPy: string }[] = [
  { id: 'compact',  label: 'Compact',  description: 'Tighter rows',     headerPy: '0.5rem',  rowPy: '0.625rem' },
  { id: 'normal',   label: 'Normal',   description: 'Default spacing',  headerPy: '0.75rem', rowPy: '1rem'     },
  { id: 'relaxed',  label: 'Relaxed',  description: 'Roomier rows',     headerPy: '1rem',    rowPy: '1.25rem'  },
];

const TABLE_DENSITY_KEY     = 'lub_table_density';

export function getTableDensity(): TableDensityOption {
  return (safeGet(TABLE_DENSITY_KEY) as TableDensityOption) ?? 'normal';
}
export function setTableDensity(id: TableDensityOption): void {
  safeSet(TABLE_DENSITY_KEY, id);
  applyTableDensity(id);
}
export function applyTableDensity(id: TableDensityOption): void {
  const opt = TABLE_DENSITY_OPTIONS.find(o => o.id === id);
  if (!opt) return;
  const root = document.documentElement;
  root.style.setProperty('--table-header-py', opt.headerPy);
  root.style.setProperty('--table-row-py',    opt.rowPy);
}

// ─── Table scrollbar size ──────────────────────────────────────────────────
const TABLE_SCROLLBAR_KEY = 'lub_table_scrollbar_size';

export function getTableScrollbarSize(): number {
  const stored = safeGet(TABLE_SCROLLBAR_KEY);
  if (stored) { const n = parseFloat(stored); if (!isNaN(n)) return n; }
  return 6;
}
export function setTableScrollbarSize(px: number): void {
  safeSet(TABLE_SCROLLBAR_KEY, String(px));
  applyTableScrollbarSize(px);
}
export function applyTableScrollbarSize(px: number): void {
  document.documentElement.style.setProperty('--table-scrollbar-size', `${px}px`);
}

export const CARD_SHADOW_OPTIONS: { id: CardShadowOption; label: string; value: string; description: string }[] = [
  { id: 'none',   label: 'None',   value: 'none',
    description: 'No shadow' },
  { id: 'subtle', label: 'Subtle', value: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    description: 'Matches default' },
  { id: 'soft',   label: 'Soft',   value: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    description: 'Medium depth' },
  { id: 'strong', label: 'Strong', value: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    description: 'High depth' },
];

const TABLE_BORDER_KEY  = 'lub_table_border';
const TABLE_SHADOW_KEY  = 'lub_table_shadow';
const CARD_SHADOW_KEY   = 'lub_card_shadow';

export function getTableBorder(): TableBorderOption {
  return (safeGet(TABLE_BORDER_KEY) as TableBorderOption) ?? 'thin';
}
export function setTableBorder(id: TableBorderOption): void {
  safeSet(TABLE_BORDER_KEY, id);
  applyTableBorder(id);
}
export function applyTableBorder(id: TableBorderOption): void {
  const opt = TABLE_BORDER_OPTIONS.find((o) => o.id === id);
  if (!opt) return;
  document.documentElement.style.setProperty('--table-border-width', opt.value);
}

export function getTableShadow(): TableShadowOption {
  return (safeGet(TABLE_SHADOW_KEY) as TableShadowOption) ?? 'subtle';
}
export function setTableShadow(id: TableShadowOption): void {
  safeSet(TABLE_SHADOW_KEY, id);
  applyTableShadow(id);
}
export function applyTableShadow(id: TableShadowOption): void {
  const opt = TABLE_SHADOW_OPTIONS.find((o) => o.id === id);
  if (!opt) return;
  document.documentElement.style.setProperty('--table-shadow', opt.value);
}

export function getCardShadow(): CardShadowOption {
  return (safeGet(CARD_SHADOW_KEY) as CardShadowOption) ?? 'subtle';
}
export function setCardShadow(id: CardShadowOption): void {
  safeSet(CARD_SHADOW_KEY, id);
  applyCardShadow(id);
}
export function applyCardShadow(id: CardShadowOption): void {
  const opt = CARD_SHADOW_OPTIONS.find((o) => o.id === id);
  if (!opt) return;
  document.documentElement.style.setProperty('--card-shadow', opt.value);
}

// ─── Startup restore ───────────────────────────────────────────────────────
/** Called once on app startup — restores all persisted appearance settings. */
export function applyStoredTheme(): void {
  document.documentElement.setAttribute('data-theme-preset', getTheme());
  applyColorMode(getColorMode());
  applyRadiusPx(getRadiusPx());
  applyFontFamily(getFontFamily());
  applyTypographySettings(getTypographySettings());
  applyTableDensity(getTableDensity());
  applyTableScrollbarSize(getTableScrollbarSize());
  applyTableBorder(getTableBorder());
  applyTableShadow(getTableShadow());
  applyCardShadow(getCardShadow());
  const saved = getCustomColor();
  if (saved) applyCustomColor(saved);
}
