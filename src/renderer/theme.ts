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
    card: '#434343',
    accent: '#2f9c95',
    text: '#f2e6dc',
    muted: '#c7c7c7',
    hover: '#6e6e6e',
    border: '#595959',
    onAccent: '#16110d',
    glow: 'rgba(125, 125, 125, 0.5)'
  }),
  theme('amethyst', 'Amethyst', {
    bg: '#141019',
    card: '#221a2e',
    accent: '#a77bff',
    text: '#ece5f5',
    muted: '#b4a9c6',
    hover: '#2e2440',
    border: '#322847',
    onAccent: '#141019',
    glow: 'rgba(167, 123, 255, 0.5)'
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

const STORAGE_KEY = 'c2-theme'
const DEFAULT_THEME = 'midnight'

export function getStoredThemeId(): string {
  const id = localStorage.getItem(STORAGE_KEY)
  return id !== null && THEMES.some((t) => t.id === id) ? id : DEFAULT_THEME
}

/** Writes a theme's variables to :root and remembers the choice. */
export function applyTheme(id: string): void {
  const t = THEMES.find((x) => x.id === id) ?? THEMES[0]
  const root = document.documentElement
  for (const [key, value] of Object.entries(t.vars)) {
    root.style.setProperty(key, value)
  }
  localStorage.setItem(STORAGE_KEY, t.id)
}
