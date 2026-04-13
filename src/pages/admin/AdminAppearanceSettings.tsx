import React, { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Palette, Moon, Sun, Monitor, CheckCircle2, Pipette, RotateCcw, RectangleHorizontal, Paintbrush, Type, ArrowLeft } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  THEMES,
  RADIUS_PRESETS,
  FONT_OPTIONS,
  TYPOGRAPHY_ROLES,
  DEFAULT_TYPOGRAPHY,
  getTheme,
  setTheme,
  getColorMode,
  setColorMode,
  getCustomColor,
  setCustomColor,
  clearCustomColor,
  getRadiusPx,
  setRadiusPx,
  getFontFamily,
  setFontFamily,
  getTypographySettings,
  setTypographySettings,
  resetTypographySettings,
  TABLE_BORDER_OPTIONS,
  TABLE_SHADOW_OPTIONS,
  CARD_SHADOW_OPTIONS,
  TABLE_DENSITY_OPTIONS,
  getTableBorder,
  setTableBorder,
  getTableShadow,
  setTableShadow,
  getCardShadow,
  setCardShadow,
  getTableDensity,
  setTableDensity,
  getTableScrollbarSize,
  setTableScrollbarSize,
  type ThemeId,
  type ColorMode,
  type FontOption,
  type TypographySettings,
  type TypographySizeId,
  type TableBorderOption,
  type TableShadowOption,
  type CardShadowOption,
  type TableDensityOption,
} from '@/lib/themeManager';

const PALETTE_COLORS: { name: string; hex: string }[] = [
  { name: 'Slate',   hex: '#64748b' },
  { name: 'Red',     hex: '#ef4444' },
  { name: 'Rose',    hex: '#f43f5e' },
  { name: 'Orange',  hex: '#f97316' },
  { name: 'Amber',   hex: '#f59e0b' },
  { name: 'Yellow',  hex: '#eab308' },
  { name: 'Lime',    hex: '#84cc16' },
  { name: 'Green',   hex: '#22c55e' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Teal',    hex: '#14b8a6' },
  { name: 'Cyan',    hex: '#06b6d4' },
  { name: 'Sky',     hex: '#0ea5e9' },
  { name: 'Blue',    hex: '#3b82f6' },
  { name: 'Indigo',  hex: '#6366f1' },
  { name: 'Violet',  hex: '#8b5cf6' },
  { name: 'Purple',  hex: '#a855f7' },
  { name: 'Fuchsia', hex: '#d946ef' },
  { name: 'Pink',    hex: '#ec4899' },
];

const COLOR_MODES: { id: ColorMode; label: string; icon: React.ElementType }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor },
];

const AdminAppearanceSettings: React.FC = () => {
  const [activeTheme, setActiveTheme] = useState<ThemeId>(getTheme);
  const [activeMode, setActiveMode] = useState<ColorMode>(getColorMode);
  const [radiusPx, setRadiusPxState] = useState<number>(getRadiusPx);
  const [customColor, setCustomColorState] = useState<string | null>(getCustomColor);
  const [activeFont, setActiveFontState] = useState<FontOption>(getFontFamily);

  // Preload all Google Fonts on mount so font preview cards render immediately
  useEffect(() => {
    FONT_OPTIONS.forEach((font) => {
      if (font.googleUrl) {
        const linkId = `lub-font-${font.id}`;
        if (!document.getElementById(linkId)) {
          const link = document.createElement('link');
          link.id = linkId;
          link.rel = 'stylesheet';
          link.href = font.googleUrl;
          document.head.appendChild(link);
        }
      }
    });
  }, []);

  const handleThemeChange = (id: ThemeId) => {
    setActiveTheme(id);
    setTheme(id);
    // Clear custom colour so preset takes full effect
    clearCustomColor();
    setCustomColorState(null);
  };

  const handleModeChange = (mode: ColorMode) => {
    setActiveMode(mode);
    setColorMode(mode);
  };

  const handleRadiusChange = (px: number) => {
    const clamped = Math.min(24, Math.max(0, isNaN(px) ? 0 : px));
    setRadiusPxState(clamped);
    setRadiusPx(clamped);
  };

  const handlePaletteSelect = (hex: string) => {
    setCustomColorState(hex);
    setCustomColor(hex);
  };

  const handleColorInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value;
    setCustomColorState(hex);
    setCustomColor(hex);
  }, []);

  const handleClearCustomColor = () => {
    clearCustomColor();
    setCustomColorState(null);
  };

  const handleFontChange = (id: FontOption) => {
    setActiveFontState(id);
    setFontFamily(id);
  };

  const [typographySettings, setTypographySettingsState] = useState<TypographySettings>(getTypographySettings);

  const handleTypographyChange = (roleId: string, field: 'sizeId' | 'weight', value: TypographySizeId | number) => {
    const updated: TypographySettings = {
      ...typographySettings,
      [roleId]: {
        ...typographySettings[roleId],
        [field]: value,
      },
    };
    setTypographySettingsState(updated);
    setTypographySettings(updated);
  };

  const handleTypographyReset = () => {
    setTypographySettingsState({ ...DEFAULT_TYPOGRAPHY });
    resetTypographySettings();
  };

  const isTypographyDefault = TYPOGRAPHY_ROLES.every((role) => {
    const s = typographySettings[role.id];
    return s?.sizeId === role.defaultSizeId && s?.weight === role.defaultWeight;
  });

  const activeFontStack = FONT_OPTIONS.find((f) => f.id === activeFont)?.stack
    ?? '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

  const [activeTableBorder, setActiveTableBorder] = useState<TableBorderOption>(getTableBorder);
  const [activeTableShadow, setActiveTableShadow] = useState<TableShadowOption>(getTableShadow);
  const [activeCardShadow,  setActiveCardShadow]  = useState<CardShadowOption>(getCardShadow);
  const [activeTableDensity, setActiveTableDensity] = useState<TableDensityOption>(getTableDensity);
  const [tableScrollbarPx, setTableScrollbarPxState] = useState<number>(getTableScrollbarSize);

  const handleTableBorderChange = (id: TableBorderOption) => {
    setActiveTableBorder(id);
    setTableBorder(id);
  };
  const handleTableShadowChange = (id: TableShadowOption) => {
    setActiveTableShadow(id);
    setTableShadow(id);
  };
  const handleCardShadowChange = (id: CardShadowOption) => {
    setActiveCardShadow(id);
    setCardShadow(id);
  };
  const handleTableDensityChange = (id: TableDensityOption) => {
    setActiveTableDensity(id);
    setTableDensity(id);
  };
  const handleTableScrollbarChange = (px: number) => {
    const clamped = Math.min(16, Math.max(0, isNaN(px) ? 0 : px));
    setTableScrollbarPxState(clamped);
    setTableScrollbarSize(clamped);
  };

  // Determine preview swatch: custom colour if set, else the active preset's primary swatch
  const previewSwatch =
    customColor ??
    (THEMES.find((t) => t.id === activeTheme)?.swatches.primary ?? '#1e293b');

  return (
    <div className="p-6 max-w-4xl">
      <PageHeader
        title="Theme"
        subtitle="Customise the colour theme, brand colour, corner style, and display mode for the admin portal"
      />

      <div className="mb-4">
        <Link
          to="/admin/settings"
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors shadow-sm"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Settings Hub
        </Link>
      </div>

      {/* ── 1. Quick theme presets ── */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-primary" />
            <CardTitle>Quick Theme</CardTitle>
          </div>
          <CardDescription>
            Choose a colour preset — changes take effect immediately across the portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {THEMES.map((theme) => {
              const isActive = activeTheme === theme.id && !customColor;
              return (
                <button
                  key={theme.id || 'classic'}
                  onClick={() => handleThemeChange(theme.id)}
                  className={cn(
                    'relative flex flex-col items-start gap-3 rounded-xl border-2 p-4 text-left transition-all',
                    isActive
                      ? 'border-primary shadow-sm ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:shadow-sm'
                  )}
                >
                  {/* Colour swatches */}
                  <div className="flex gap-1.5">
                    <span
                      className="h-7 w-7 rounded-full border border-border shadow-sm"
                      style={{ background: theme.swatches.primary }}
                    />
                    <span
                      className="h-7 w-7 rounded-full border border-border shadow-sm"
                      style={{ background: theme.swatches.secondary }}
                    />
                    <span
                      className="h-7 w-7 rounded-full border border-border shadow-sm"
                      style={{ background: theme.swatches.base }}
                    />
                  </div>

                  <div>
                    <p className="text-sm font-semibold leading-tight">{theme.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{theme.description}</p>
                  </div>

                  {isActive && (
                    <CheckCircle2 className="absolute top-2.5 right-2.5 w-4 h-4 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── 2. Colour palette ── */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Paintbrush className="w-5 h-5 text-primary" />
            <CardTitle>Colour Palette</CardTitle>
          </div>
          <CardDescription>
            Pick a colour from the full palette to set it as your primary brand colour. For an exact
            hex, use the Custom Brand Colour picker below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-6 sm:grid-cols-9 lg:grid-cols-12 gap-2">
            {PALETTE_COLORS.map(({ name, hex }) => {
              const isActive = customColor?.toLowerCase() === hex.toLowerCase();
              return (
                <button
                  key={hex}
                  title={name}
                  onClick={() => handlePaletteSelect(hex)}
                  className={cn(
                    'h-9 w-9 rounded-full border-2 transition-all hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'border-foreground scale-110 shadow-md'
                      : 'border-transparent hover:border-foreground/30'
                  )}
                  style={{ background: hex }}
                  aria-label={name}
                  aria-pressed={isActive}
                />
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {customColor
              ? `Active: ${PALETTE_COLORS.find((c) => c.hex.toLowerCase() === customColor.toLowerCase())?.name ?? 'Custom'} — ${customColor.toUpperCase()}`
              : 'No colour override — using the selected theme\'s primary colour.'}
          </p>
        </CardContent>
      </Card>

      {/* ── 3. Custom brand colour (exact hex picker) ── */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Pipette className="w-5 h-5 text-primary" />
            <CardTitle>Custom Brand Colour</CardTitle>
          </div>
          <CardDescription>
            Override the primary colour with your organisation's brand colour. This overrides the
            quick theme's primary palette.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            {/* Colour picker */}
            <label className="flex flex-col items-center gap-2 cursor-pointer group">
              <div
                className="relative h-14 w-14 rounded-xl border-2 border-border group-hover:border-primary/60 transition-colors overflow-hidden shadow-sm"
                style={{ background: previewSwatch }}
              >
                {/* Invisible native colour input layered over the swatch */}
                <input
                  type="color"
                  value={customColor ?? previewSwatch}
                  onChange={handleColorInput}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  title="Pick brand colour"
                />
              </div>
              <span className="text-xs text-muted-foreground">Click to pick</span>
            </label>

            {/* Current hex + reset */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-4 w-4 rounded-full border border-border shadow-sm shrink-0"
                  style={{ background: previewSwatch }}
                />
                <span className="text-sm font-mono font-medium text-foreground">
                  {customColor ? customColor.toUpperCase() : 'Theme default'}
                </span>
                {customColor && (
                  <span className="text-xs text-muted-foreground">(custom override active)</span>
                )}
              </div>
              {customColor && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit gap-1.5"
                  onClick={handleClearCustomColor}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset to theme colour
                </Button>
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            The colour you pick is used across buttons, links, badges, and focus rings. Choose a
            colour that has enough contrast on white and dark backgrounds.
          </p>
        </CardContent>
      </Card>

      {/* ── 4. Corner style ── */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <RectangleHorizontal className="w-5 h-5 text-primary" />
            <CardTitle>Corner Style</CardTitle>
          </div>
          <CardDescription>
            Controls how rounded the buttons, cards, and inputs appear across the portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-5">

            {/* Slider + number input row */}
            <div className="flex items-center gap-5">
              {/* Live preview box */}
              <div
                className="w-20 h-12 shrink-0 border-2 border-primary/50 bg-primary/10"
                style={{ borderRadius: `${radiusPx}px` }}
              />

              {/* Slider + numeric input */}
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-label font-medium text-muted-foreground">Corner radius</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={24}
                      value={radiusPx}
                      onChange={e => handleRadiusChange(Number(e.target.value))}
                      className="w-14 h-7 text-center border border-border rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                    />
                    <span className="text-sm text-muted-foreground">px</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={1}
                  value={radiusPx}
                  onChange={e => handleRadiusChange(Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
                <div className="flex justify-between text-xs text-muted-foreground px-0.5">
                  <span>0</span>
                  <span>12</span>
                  <span>24</span>
                </div>
              </div>
            </div>

            {/* Quick-preset chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Presets:</span>
              {RADIUS_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => handleRadiusChange(preset.px)}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded-full border transition-colors',
                    radiusPx === preset.px
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/40 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {preset.label} · {preset.px}px
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            Your preference is applied instantly and saved for future visits.
          </p>
        </CardContent>
      </Card>

      {/* ── 5. Font family ── */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Type className="w-5 h-5 text-primary" />
            <CardTitle>Font Family</CardTitle>
          </div>
          <CardDescription>
            Choose the typeface used across the entire portal — headings, body text, labels, and buttons.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {FONT_OPTIONS.map((font) => {
              const isActive = activeFont === font.id;
              return (
                <button
                  key={font.id}
                  onClick={() => handleFontChange(font.id)}
                  className={cn(
                    'relative flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all',
                    isActive
                      ? 'border-primary shadow-sm ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/40 hover:shadow-sm'
                  )}
                >
                  {/* Large specimen rendered in the font itself */}
                  <span
                    className="text-3xl font-semibold text-foreground leading-none select-none"
                    style={{ fontFamily: font.stack }}
                  >
                    Ag
                  </span>
                  <span
                    className="text-xs text-muted-foreground leading-snug"
                    style={{ fontFamily: font.stack }}
                  >
                    The quick brown fox
                  </span>
                  <div className="mt-1">
                    <p className="text-sm font-semibold leading-tight">{font.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{font.description}</p>
                  </div>
                  {isActive && (
                    <CheckCircle2 className="absolute top-2.5 right-2.5 w-4 h-4 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            {activeFont === 'system'
              ? 'Using your operating system\'s default font.'
              : `Active: ${FONT_OPTIONS.find((f) => f.id === activeFont)?.name ?? activeFont} — applied portal-wide.`}
          </p>
        </CardContent>
      </Card>

      {/* ── 6. Typography settings ── */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Type className="w-5 h-5 text-primary" />
              <CardTitle>Typography</CardTitle>
            </div>
            {!isTypographyDefault && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={handleTypographyReset}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset all
              </Button>
            )}
          </div>
          <CardDescription>
            Fine-tune the size and weight of every text role — changes apply instantly across the portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-0 divide-y divide-border">
            {TYPOGRAPHY_ROLES.map((role) => {
              const settings = typographySettings[role.id] ?? { sizeId: role.defaultSizeId, weight: role.defaultWeight };
              const currentSizeValue = role.sizes.find((s) => s.id === settings.sizeId)?.value ?? role.sizes.find((s) => s.id === role.defaultSizeId)!.value;
              const WEIGHTS = [
                { value: 400, label: 'Regular' },
                { value: 500, label: 'Medium' },
                { value: 600, label: 'Semibold' },
                { value: 700, label: 'Bold' },
              ];
              return (
                <div key={role.id} className="py-5 first:pt-0 last:pb-0">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Left: role info + live preview */}
                    <div className="sm:w-56 shrink-0">
                      <p className="text-sm font-semibold text-foreground">{role.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{role.affects}</p>
                      {/* Live preview of the sample text with current settings */}
                      <div
                        className="mt-3 px-3 py-2 rounded-lg bg-muted text-foreground break-words"
                        style={{
                          fontSize: currentSizeValue,
                          fontWeight: settings.weight,
                          fontFamily: activeFontStack,
                          lineHeight: 1.4,
                        }}
                      >
                        {role.sample}
                      </div>
                    </div>

                    {/* Right: size + weight controls */}
                    <div className="flex flex-col gap-3 flex-1">
                      {/* Size */}
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5 font-medium">Size</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {role.sizes.map((size) => {
                            const isActive = settings.sizeId === size.id;
                            const isDefault = size.id === role.defaultSizeId;
                            return (
                              <button
                                key={size.id}
                                onClick={() => handleTypographyChange(role.id, 'sizeId', size.id)}
                                className={cn(
                                  'relative px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                                  isActive
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border hover:border-primary/50 hover:bg-muted text-foreground'
                                )}
                              >
                                {size.label}
                                {isDefault && !isActive && (
                                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-muted-foreground/30" title="Default" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Weight */}
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5 font-medium">Weight</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {WEIGHTS.map(({ value, label }) => {
                            const isActive = settings.weight === value;
                            const isDefault = value === role.defaultWeight;
                            return (
                              <button
                                key={value}
                                onClick={() => handleTypographyChange(role.id, 'weight', value)}
                                className={cn(
                                  'relative px-3 py-1.5 rounded-lg border text-xs transition-all',
                                  isActive
                                    ? 'border-primary bg-primary text-primary-foreground font-semibold'
                                    : 'border-border hover:border-primary/50 hover:bg-muted text-foreground',
                                )}
                                style={{ fontWeight: value }}
                              >
                                {label}
                                {isDefault && !isActive && (
                                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-muted-foreground/30" title="Default" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── 7. Table style ── */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            {/* Using a table-like icon: 3 horizontal lines of varying weight */}
            <svg className="w-5 h-5 text-primary" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeLinecap="round">
              <rect x="2" y="3" width="16" height="14" rx="2" strokeWidth="1.5" />
              <line x1="2" y1="7.5" x2="18" y2="7.5" strokeWidth="1.5" />
              <line x1="2" y1="12" x2="18" y2="12" strokeWidth="1" opacity="0.6" />
              <line x1="8" y1="7.5" x2="8" y2="17" strokeWidth="1" opacity="0.4" />
            </svg>
            <CardTitle>Table Style</CardTitle>
          </div>
          <CardDescription>
            Control how data tables look — row divider thickness and card shadow depth.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* Row border thickness */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Row Border Thickness</p>
            <p className="text-xs text-muted-foreground mb-3">The lines separating table rows and the header underline.</p>
            <div className="flex flex-wrap gap-3">
              {TABLE_BORDER_OPTIONS.map((opt) => {
                const isActive = activeTableBorder === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleTableBorderChange(opt.id)}
                    className={cn(
                      'flex flex-col items-center gap-2.5 rounded-xl border-2 px-5 py-3.5 transition-all',
                      isActive
                        ? 'border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/40 hover:bg-muted'
                    )}
                  >
                    {/* Visual preview: stacked lines of the selected width */}
                    <div className="flex flex-col gap-1.5 w-10">
                      <div className="w-full bg-border rounded-full" style={{ height: opt.id === 'none' ? 0 : opt.value, minHeight: opt.id === 'none' ? '1px' : undefined, opacity: opt.id === 'none' ? 0.15 : 0.5 }} />
                      <div className="w-full rounded-full" style={{ height: opt.id === 'none' ? '1px' : opt.value, background: 'var(--foreground)', opacity: opt.id === 'none' ? 0.15 : 1 }} />
                      <div className="w-full bg-border rounded-full" style={{ height: opt.id === 'none' ? 0 : opt.value, minHeight: opt.id === 'none' ? '1px' : undefined, opacity: opt.id === 'none' ? 0.15 : 0.5 }} />
                    </div>
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table shadow */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Table Shadow</p>
            <p className="text-xs text-muted-foreground mb-3">Depth of the shadow on data table wrappers.</p>
            <div className="flex flex-wrap gap-3">
              {TABLE_SHADOW_OPTIONS.map((opt) => {
                const isActive = activeTableShadow === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleTableShadowChange(opt.id)}
                    className={cn(
                      'flex flex-col items-center gap-2.5 rounded-xl border-2 px-5 py-3.5 transition-all',
                      isActive
                        ? 'border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/40 hover:bg-muted'
                    )}
                  >
                    {/* Visual preview: a card with this shadow */}
                    <div
                      className="w-10 h-7 rounded-md bg-card border border-border"
                      style={{ boxShadow: opt.value === 'none' ? 'none' : opt.value }}
                    />
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card shadow */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Card Shadow</p>
            <p className="text-xs text-muted-foreground mb-3">Depth of the shadow on page cards and content panels.</p>
            <div className="flex flex-wrap gap-3">
              {CARD_SHADOW_OPTIONS.map((opt) => {
                const isActive = activeCardShadow === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleCardShadowChange(opt.id)}
                    className={cn(
                      'flex flex-col items-center gap-2.5 rounded-xl border-2 px-5 py-3.5 transition-all',
                      isActive
                        ? 'border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/40 hover:bg-muted'
                    )}
                  >
                    <div
                      className="w-10 h-7 rounded-md bg-card border border-border"
                      style={{ boxShadow: opt.value === 'none' ? 'none' : opt.value }}
                    />
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row density */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Row Spacing</p>
            <p className="text-xs text-muted-foreground mb-3">Vertical padding inside each table row.</p>
            <div className="flex flex-wrap gap-3">
              {TABLE_DENSITY_OPTIONS.map((opt) => {
                const isActive = activeTableDensity === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => handleTableDensityChange(opt.id)}
                    className={cn(
                      'flex flex-col items-center gap-2.5 rounded-xl border-2 px-5 py-3.5 transition-all',
                      isActive
                        ? 'border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/40 hover:bg-muted'
                    )}
                  >
                    {/* Visual preview: stacked rows with this density */}
                    <div className="flex flex-col gap-0 w-12 border border-border rounded overflow-hidden">
                      <div className="w-full bg-muted" style={{ height: `calc(${opt.headerPy} + 4px)` }} />
                      <div className="w-full border-t border-border bg-background" style={{ height: `calc(${opt.rowPy} + 4px)` }} />
                      <div className="w-full border-t border-border bg-background" style={{ height: `calc(${opt.rowPy} + 4px)` }} />
                    </div>
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scrollbar thickness */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-1">Scrollbar Thickness</p>
            <p className="text-xs text-muted-foreground mb-3">Height of the horizontal scrollbar on wide tables.</p>
            <div className="flex items-center gap-5">
              {/* Live preview of scrollbar thickness */}
              <div className="w-24 h-10 shrink-0 rounded border border-border bg-muted/30 flex items-end p-1 overflow-hidden">
                <div
                  className="w-full rounded-full bg-border"
                  style={{ height: `${Math.max(2, tableScrollbarPx)}px` }}
                />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-label font-medium text-muted-foreground">Size</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={16}
                      value={tableScrollbarPx}
                      onChange={e => handleTableScrollbarChange(Number(e.target.value))}
                      className="w-14 h-7 text-center border border-border rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 bg-background"
                    />
                    <span className="text-sm text-muted-foreground">px</span>
                  </div>
                </div>
                <input
                  type="range"
                  min={0}
                  max={16}
                  step={1}
                  value={tableScrollbarPx}
                  onChange={e => handleTableScrollbarChange(Number(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
                <div className="flex justify-between text-xs text-muted-foreground px-0.5">
                  <span>Hidden</span>
                  <span>8px</span>
                  <span>16px</span>
                </div>
              </div>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* ── 8. Colour mode ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sun className="w-5 h-5 text-primary" />
            <CardTitle>Colour Mode</CardTitle>
          </div>
          <CardDescription>
            Switch between light mode, dark mode, or follow your device setting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {COLOR_MODES.map(({ id, label, icon: Icon }) => {
              const isActive = activeMode === id;
              return (
                <button
                  key={id}
                  onClick={() => handleModeChange(id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border-2 px-5 py-2.5 text-sm font-medium transition-all',
                    isActive
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border hover:border-primary/40 hover:bg-muted'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Your preference is saved and restored automatically each time you open the portal.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAppearanceSettings;

