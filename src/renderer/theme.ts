/**
 * Color schemes. Each theme is a full set of CSS-variable overrides applied
 * to :root at runtime; `colors` drives the mini-interface preview cards in
 * Settings. "Midnight" reproduces the original palette exactly, so the
 * default look is unchanged. The choice is persisted in localStorage and
 * re-applied on startup (renderer-only — no main/IPC involvement).
 */

export interface Theme {
  id: string
  label: string
  /** Swatches for the Settings preview mockup. */
  colors: { bg: string; panel: string; accent: string; border: string }
  /** CSS variable overrides written to document.documentElement. */
  vars: Record<string, string>
  /** True for the user-editable Custom theme (renders the gear/edit button). */
  custom?: boolean
}

interface Palette {
  bg: string
  card: string 
  accent: string 
  text: string 
  muted: string
  hover: string
  border: string
  onAccent: string
  glow: string
}

function buildVars(p: Palette): Record<string, string> {
  return {
    '--bg-primary': p.bg,
    '--bg-secondary': p.card,
    '--bg-hover': p.hover,
    '--accent': p.accent,
    // Lighter variants derived from the accent so the per-position icon tints
    // (and the matching instance-name color) stay distinct on every theme.
    '--accent-soft': `color-mix(in srgb, ${p.accent}, white 12%)`,
    '--accent-mint': `color-mix(in srgb, ${p.accent}, white 28%)`,
    '--accent-light': `color-mix(in srgb, ${p.accent}, white 55%)`,
    '--trend-green': p.accent,
    '--text-primary': p.text,
    '--text-muted': p.muted,
    '--text-on-accent': p.onAccent,
    '--border': p.border,
    '--sidebar-glow': p.glow
  }
}

function theme(id: string, label: string, p: Palette): Theme {
  return {
    id,
    label,
    colors: { bg: p.bg, panel: p.card, accent: p.accent, border: p.border },
    vars: buildVars(p)
  }
}

/** Built-in presets. The fourth slot is the user's editable Custom theme,
 *  produced at runtime by buildCustomTheme(). */
export const THEMES: Theme[] = [
  theme('midnight', 'Midnight', {
    bg: '#0a0a0a',
    card: '#0f0f0f',
    accent: '#2f9c95',
    text: '#737373',
    muted: '#737373',
    hover: '#1e242d',
    border: '#21262d',
    onAccent: '#0f1117',
    glow: 'rgba(46, 160, 67, 0.5)'
  }),
  theme('ember', 'Ember', {
    bg: '#282828',
    card: '#313131',
    accent: '#2f9c95',
    text: '#f2e6dc',
    muted: '#c7c7c7',
    hover: '#6e6e6e',
    border: '#595959',
    onAccent: '#16110d',
    glow: 'rgba(125, 125, 125, 0.5)'
  }),
  theme('teal', 'Teal', {
    bg: '#1c2422',
    card: '#29332f',
    accent: '#54c6b1',
    text: '#e6efeb',
    muted: '#a9b8b2',
    hover: '#34423d',
    border: '#34423d',
    onAccent: '#1c2422',
    glow: 'rgba(84, 198, 177, 0.5)'
  })
]

/* ----------------------------- Custom theme ----------------------------- */

export const CUSTOM_THEME_ID = 'custom'

/** The four colors the user picks; the rest of the palette is derived. */
export interface CustomSwatches {
  bg: string
  panel: string
  accent: string
  border: string
}

/** Starting point for a fresh custom theme (the old Amethyst palette, so the
 *  fourth slot looks identical until the user edits it). */
export const DEFAULT_CUSTOM_SWATCHES: CustomSwatches = {
  bg: '#141019',
  panel: '#221a2e',
  accent: '#a77bff',
  border: '#322847'
}

/** Relative luminance (0–1) of a #rrggbb / #rgb color, sRGB-weighted. */
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  const r = (n >> 16) & 0xff
  const g = (n >> 8) & 0xff
  const b = n & 0xff
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** Pick a readable foreground (near-black or near-white) for a background. */
function contrastOn(hex: string): string {
  return luminance(hex) > 0.55 ? '#141019' : '#f5f5f5'
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return `rgba(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}, ${alpha})`
}

/** Expand four swatches into the full palette using contrast-aware defaults. */
function deriveCustomPalette(s: CustomSwatches): Palette {
  const text = contrastOn(s.bg)
  return {
    bg: s.bg,
    card: s.panel,
    accent: s.accent,
    text,
    muted: `color-mix(in srgb, ${text}, ${s.bg} 45%)`,
    hover: `color-mix(in srgb, ${s.panel}, ${text} 12%)`,
    border: s.border,
    onAccent: contrastOn(s.accent),
    glow: hexToRgba(s.accent, 0.5)
  }
}

/** Build the runtime Custom theme from a set of swatches. */
export function buildCustomTheme(s: CustomSwatches): Theme {
  const t = theme(CUSTOM_THEME_ID, 'Custom', deriveCustomPalette(s))
  return { ...t, custom: true }
}

const CUSTOM_KEY = 'c2-custom-colors'

export function getStoredCustomSwatches(): CustomSwatches {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY)
    if (raw !== null) {
      const parsed = JSON.parse(raw) as Partial<CustomSwatches>
      return { ...DEFAULT_CUSTOM_SWATCHES, ...parsed }
    }
  } catch {
    /* fall through to default */
  }
  return { ...DEFAULT_CUSTOM_SWATCHES }
}

export function setStoredCustomSwatches(s: CustomSwatches): void {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(s))
}

/* -------------------------------- Apply --------------------------------- */

const STORAGE_KEY = 'c2-theme'
const DEFAULT_THEME = 'midnight'

function isValidId(id: string): boolean {
  return id === CUSTOM_THEME_ID || THEMES.some((t) => t.id === id)
}

export function getStoredThemeId(): string {
  const id = localStorage.getItem(STORAGE_KEY)
  return id !== null && isValidId(id) ? id : DEFAULT_THEME
}

/** Resolve an id to a concrete Theme (custom reads its stored swatches). */
function resolveTheme(id: string): Theme {
  if (id === CUSTOM_THEME_ID) return buildCustomTheme(getStoredCustomSwatches())
  return THEMES.find((x) => x.id === id) ?? THEMES[0]
}

function writeVars(t: Theme): void {
  const root = document.documentElement
  for (const [key, value] of Object.entries(t.vars)) {
    root.style.setProperty(key, value)
  }
}

/** Writes a theme's variables to :root and remembers the choice. */
export function applyTheme(id: string): void {
  const t = resolveTheme(id)
  writeVars(t)
  localStorage.setItem(STORAGE_KEY, id === CUSTOM_THEME_ID ? CUSTOM_THEME_ID : t.id)
}

/** Live-preview swatches on :root without persisting the selection. Used while
 *  the custom-theme editor is open so changes are visible immediately. */
export function previewCustomSwatches(s: CustomSwatches): void {
  writeVars(buildCustomTheme(s))
}
