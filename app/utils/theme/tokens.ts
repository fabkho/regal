// The theming contract of Regal's DOM UI around the 3D: the tooltip (the hover
// and scroll focus labels) and the Book detail panel (the card, the phone's
// bottom sheet), and RegalBooksRow's card around its 3D. Hosts set the public `--regal-*` custom properties; Regal's
// components read the resolved `--_regal-*` ones, which `.regal` derives from
// them (app/assets/css/regal-theme.css). README: "Theming".

/** What a host asks for: Regal's own light look, the dark set, or follow the host/OS. */
export type RegalTheme = 'light' | 'dark' | 'auto'
/** What `auto` resolves to. */
export type RegalScheme = 'light' | 'dark'

export const REGAL_THEMES: readonly RegalTheme[] = ['light', 'dark', 'auto']

/** The default when neither the component nor `runtimeConfig.public.regal.theme` says: today's look. */
export const DEFAULT_THEME: RegalTheme = 'light'

/** A theme name from a prop or the runtime config; anything else is the default. */
export function normalizeTheme(value: unknown, fallback: RegalTheme = DEFAULT_THEME): RegalTheme {
  return typeof value === 'string' && (REGAL_THEMES as readonly string[]).includes(value) ? value as RegalTheme : fallback
}

/**
 * The public tokens (without the `--regal-` prefix), each also read by Regal as
 * `--_regal-<name>`. Order: the README's token table.
 */
export const REGAL_TOKENS = [
  // Colours
  'surface',
  'surface-raised',
  'ink',
  'ink-muted',
  'ink-subtle',
  'ink-faint',
  'accent',
  'accent-hover',
  'hairline',
  'border',
  // Frame
  'border-width',
  'radius',
  'radius-control',
  'shadow',
  'backdrop',
  // Type
  'font-body',
  'font-title',
  'size-base',
  'size-title',
  'size-title-sheet',
  'size-body',
  'size-small',
  'size-label',
  'weight-title',
  'weight-label',
  'style-title',
  'label-case',
  'label-tracking',
  // Spacing
  'space',
  'tooltip-padding',
  'panel-padding',
] as const

export type RegalToken = typeof REGAL_TOKENS[number]

/**
 * RegalBooksRow's broken-out phone sheet (without the `--regal-` prefix): its
 * container, for a host that puts its own markup in it (#detail). Read as they
 * are, with today's look as their fallbacks (row/Card.vue), and carried to
 * <body> with the sheet. README: "The row's sheet".
 */
export const ROW_SHEET_TOKENS = [
  'sheet-radius',
  'sheet-background',
  'sheet-border',
  'sheet-shadow',
  'sheet-padding',
  'sheet-max-width',
  'sheet-max-height',
  'sheet-grabber',
  'sheet-grabber-color',
  'sheet-grabber-width',
  'sheet-grabber-height',
] as const

export interface SchemeHints {
  /** The theme asked for. */
  theme: RegalTheme
  /** The nearest host hook: `data-theme="dark|light"` or a `dark`/`light` class on an ancestor. */
  hostTheme?: RegalScheme | null
  /** The computed `color-scheme` where Regal sits (`'normal'`, `'light dark'`, `'dark'` …). */
  colorScheme?: string | null
  /** `prefers-color-scheme: dark`. */
  prefersDark?: boolean
}

/**
 * The scheme Regal's UI shows. `light`/`dark` are what they say; `auto` follows
 * the host: its `data-theme`/class hook first, then a `color-scheme` that names
 * only one scheme, then the OS preference.
 */
export function resolveScheme({ theme, hostTheme, colorScheme, prefersDark }: SchemeHints): RegalScheme {
  if (theme !== 'auto') return theme
  if (hostTheme) return hostTheme
  const schemes = (colorScheme ?? '').split(/\s+/)
  const dark = schemes.includes('dark')
  const light = schemes.includes('light')
  if (dark && !light) return 'dark'
  if (light && !dark) return 'light'
  return prefersDark ? 'dark' : 'light'
}

/** A host's theme hook on one element: `data-theme` / `data-color-scheme`, or a `dark` / `light` class. */
export function hostThemeOf(element: Pick<Element, 'getAttribute' | 'classList'>): RegalScheme | null {
  for (const attribute of ['data-theme', 'data-color-scheme']) {
    const value = element.getAttribute(attribute)?.trim().toLowerCase()
    if (value === 'dark' || value === 'light') return value
  }
  if (element.classList.contains('dark')) return 'dark'
  if (element.classList.contains('light')) return 'light'
  return null
}

/** The nearest host hook from `element` up to `<html>`. */
export function nearestHostTheme(element: Element | null): RegalScheme | null {
  for (let current = element; current; current = current.parentElement) {
    const found = hostThemeOf(current)
    if (found) return found
  }
  return null
}
