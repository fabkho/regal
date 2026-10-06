// The playground (/playground, Regal's own site only): what a visitor can set,
// kept in the URL so a setup can be linked and the phone frame (an iframe of
// the same page) shows the same. Every setting is a prop, a CSS token or the
// host config of the layer's real components (app/components/regal/*,
// useRegalConfig.ts); the host-side ones only change the code shown.
// Not auto-imported (app/showcase/), so a host that extends Regal never sees it.
import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import type { RegalTheme } from '#layers/regal/app/utils/theme/tokens'

export type PlaygroundComponent = 'stage' | 'row'
export type PlaygroundLibrary = 'live' | 'shelf' | 'demo' | 'url' | 'file'
export type TokenPreset = 'regal' | 'night' | 'soft'
export type SlotDemo = 'none' | 'whole' | 'parts'
export type RowSize = 'phone' | 'wide'
export type Rotate = 'turntable' | 'free'
export type Inspect = 'card' | 'viewport' | 'auto'

export interface PlaygroundSettings {
  component: PlaygroundComponent
  /** The visually hidden Book list of RegalBooksStage and RegalBooksRow (`accessible-list`). */
  accessibleList: boolean
  /** RegalBooksStage */
  controls: boolean
  stageRotate: Rotate
  /** RegalBooksSidebar beside the stage, with its props. */
  sidebar: boolean
  heading: string
  countLabel: string
  sidebarFilters: boolean
  sidebarList: boolean
  /** RegalBooksFilters above the stage. */
  filterBar: boolean
  /** RegalBooksRow */
  inspect: Inspect
  limit: number | null
  rowYear: number | null
  rowRotate: Rotate
  backButton: boolean
  label: string
  rowSize: RowSize
  /** Theming: the `theme` prop, `unstyled`, token presets and overrides, slots. */
  theme: RegalTheme
  /** For `theme="auto"`: the host page's own scheme (`<html data-theme>`). */
  hostScheme: 'light' | 'dark'
  unstyled: boolean
  tokens: TokenPreset
  accent: string | null
  radius: number | null
  slots: SlotDemo
  /** The library file: the site's live shelf (when configured), the showcase shelf, the demo, a URL (`src`) or a dropped file. */
  library: PlaygroundLibrary
  src: string
  /** Host config only (runtimeConfig.public.regal.haptics): changes the code shown. */
  haptics: boolean
  /** The phone frame: the same page at 390 px in an iframe. */
  device: 'desktop' | 'phone'
}

export const DEFAULT_SETTINGS: Readonly<PlaygroundSettings> = Object.freeze({
  component: 'stage',
  accessibleList: true,
  controls: false,
  stageRotate: 'turntable',
  sidebar: true,
  heading: 'Bookshelf',
  countLabel: 'Books read',
  sidebarFilters: true,
  sidebarList: true,
  filterBar: false,
  inspect: 'card',
  limit: null,
  rowYear: null,
  rowRotate: 'free',
  backButton: true,
  label: '',
  rowSize: 'wide',
  theme: 'light',
  hostScheme: 'dark',
  unstyled: false,
  tokens: 'regal',
  accent: null,
  radius: null,
  slots: 'none',
  library: 'shelf',
  src: '',
  haptics: true,
  device: 'desktop',
})

/** Query key of each setting. `src` and the Stack's own keys (sort, year, min, group) are the viewer's. */
const KEYS: Record<keyof PlaygroundSettings, string> = {
  component: 'c',
  accessibleList: 'alist',
  controls: 'controls',
  stageRotate: 'rotate',
  sidebar: 'sidebar',
  heading: 'heading',
  countLabel: 'count',
  sidebarFilters: 'sfilters',
  sidebarList: 'slist',
  filterBar: 'bar',
  inspect: 'inspect',
  limit: 'limit',
  rowYear: 'ryear',
  rowRotate: 'rrotate',
  backButton: 'back',
  label: 'label',
  rowSize: 'size',
  theme: 'theme',
  hostScheme: 'host',
  unstyled: 'unstyled',
  tokens: 'tokens',
  accent: 'accent',
  radius: 'radius',
  slots: 'slots',
  library: 'lib',
  src: 'src',
  haptics: 'haptics',
  device: 'device',
}

const one = (value: unknown) => (Array.isArray(value) ? value[0] : value)
const text = (value: unknown) => (typeof one(value) === 'string' ? (one(value) as string) : null)
function pick<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  const raw = text(value)
  return raw !== null && (options as readonly string[]).includes(raw) ? raw as T : fallback
}
function flag(value: unknown, fallback: boolean): boolean {
  const raw = text(value)
  return raw === '1' ? true : raw === '0' ? false : fallback
}
function count(value: unknown, min: number, max: number): number | null {
  const raw = text(value)
  const parsed = raw?.trim() ? Number(raw) : Number.NaN
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null
}
const COLOUR = /^#[0-9a-f]{6}$/i

/**
 * Which library files the site offers. `live`: the site has a real shelf
 * (REGAL_SITE_SHELF_SRC, Regal's own site only), which is then the default;
 * without one the synthetic showcase shelf is.
 */
export interface LibraryChoices {
  live: boolean
}
const NO_LIVE: LibraryChoices = { live: false }
const defaultLibrary = (choices: LibraryChoices): PlaygroundLibrary => (choices.live ? 'live' : DEFAULT_SETTINGS.library)

/** The settings a URL query describes (anything unknown or invalid: the default). */
export function readSettings(query: LocationQuery, choices: LibraryChoices = NO_LIVE): PlaygroundSettings {
  const d = DEFAULT_SETTINGS
  const q = (key: keyof PlaygroundSettings) => query[KEYS[key]]
  const src = text(q('src'))?.trim() ?? ''
  const offered: readonly PlaygroundLibrary[] = choices.live ? ['live', 'shelf', 'demo', 'file'] : ['shelf', 'demo', 'file']
  const library = src ? 'url' : pick(q('library'), offered, defaultLibrary(choices))
  const accent = text(q('accent'))
  return {
    component: pick(q('component'), ['stage', 'row'] as const, d.component),
    accessibleList: flag(q('accessibleList'), d.accessibleList),
    controls: flag(q('controls'), d.controls),
    stageRotate: pick(q('stageRotate'), ['turntable', 'free'] as const, d.stageRotate),
    sidebar: flag(q('sidebar'), d.sidebar),
    heading: text(q('heading')) ?? d.heading,
    countLabel: text(q('countLabel')) ?? d.countLabel,
    sidebarFilters: flag(q('sidebarFilters'), d.sidebarFilters),
    sidebarList: flag(q('sidebarList'), d.sidebarList),
    filterBar: flag(q('filterBar'), d.filterBar),
    inspect: pick(q('inspect'), ['card', 'viewport', 'auto'] as const, d.inspect),
    limit: count(q('limit'), 1, 9999),
    rowYear: count(q('rowYear'), 1000, 9999),
    rowRotate: pick(q('rowRotate'), ['free', 'turntable'] as const, d.rowRotate),
    backButton: flag(q('backButton'), d.backButton),
    label: text(q('label')) ?? d.label,
    rowSize: pick(q('rowSize'), ['phone', 'wide'] as const, d.rowSize),
    theme: pick(q('theme'), ['light', 'dark', 'auto'] as const, d.theme),
    hostScheme: pick(q('hostScheme'), ['light', 'dark'] as const, d.hostScheme),
    unstyled: flag(q('unstyled'), d.unstyled),
    tokens: pick(q('tokens'), ['regal', 'night', 'soft'] as const, d.tokens),
    accent: accent && COLOUR.test(accent) ? accent.toLowerCase() : null,
    radius: count(q('radius'), 0, 32),
    slots: pick(q('slots'), ['none', 'whole', 'parts'] as const, d.slots),
    library,
    src,
    haptics: flag(q('haptics'), d.haptics),
    device: pick(q('device'), ['desktop', 'phone'] as const, d.device),
  }
}

/**
 * `query` with `settings` written into it: defaults left out, every other key
 * (the Stack's sort/year/min/group, anything else) kept.
 */
export function writeSettings(settings: PlaygroundSettings, query: LocationQuery = {}, choices: LibraryChoices = NO_LIVE): LocationQueryRaw {
  const next: LocationQueryRaw = { ...query }
  for (const key of Object.keys(KEYS) as (keyof PlaygroundSettings)[]) {
    const value = settings[key]
    const fallback = key === 'library' ? defaultLibrary(choices) : DEFAULT_SETTINGS[key]
    const name = KEYS[key]
    if (key === 'library') {
      next[name] = value === fallback || value === 'url' ? undefined : String(value)
      continue
    }
    if (value === fallback || value === null || (key === 'src' && settings.library !== 'url')) next[name] = undefined
    else next[name] = typeof value === 'boolean' ? (value ? '1' : '0') : String(value)
  }
  return next
}

/** The CSS custom properties a token preset sets (README: "Theming"). */
export const TOKEN_PRESETS: Record<TokenPreset, { label: string, note: string, theme: RegalTheme | null, page: string | null, tokens: Record<string, string> }> = {
  regal: { label: 'Regal', note: 'The defaults: paper, ink, one red.', theme: null, page: null, tokens: {} },
  night: {
    label: 'Night',
    note: 'A dark host with its own palette, glass and a serif title.',
    theme: 'dark',
    page: '#0E1117',
    tokens: {
      '--regal-surface': 'rgba(23, 27, 36, 0.82)',
      '--regal-surface-raised': 'rgba(23, 27, 36, 0.92)',
      '--regal-ink': '#E7E3D8',
      '--regal-ink-muted': '#9AA1AE',
      '--regal-ink-subtle': '#C9CDD6',
      '--regal-accent': '#E2B04A',
      '--regal-accent-hover': '#F2C566',
      '--regal-hairline': 'rgba(231, 227, 216, 0.14)',
      '--regal-border': 'rgba(231, 227, 216, 0.12)',
      '--regal-radius': '12px',
      '--regal-radius-control': '999px',
      '--regal-shadow': '0 18px 40px rgba(0, 0, 0, 0.5)',
      '--regal-backdrop': 'blur(14px) saturate(1.2)',
      '--regal-font-title': 'Georgia, \'Times New Roman\', serif',
      '--regal-style-title': 'normal',
      '--regal-weight-title': '600',
    },
  },
  soft: {
    label: 'Soft',
    note: 'A light app with white cards, rounded corners and no frames.',
    theme: 'light',
    page: '#EEF0F3',
    tokens: {
      '--regal-surface': '#FFFFFF',
      '--regal-surface-raised': '#FFFFFF',
      '--regal-ink': '#1C2733',
      '--regal-ink-muted': '#5B6776',
      '--regal-accent': '#2F6FDE',
      '--regal-accent-hover': '#4A86F0',
      '--regal-hairline': 'rgba(28, 39, 51, 0.12)',
      '--regal-border-width': '0',
      '--regal-radius': '16px',
      '--regal-radius-control': '999px',
      '--regal-shadow': '0 12px 32px rgba(28, 39, 51, 0.14)',
      '--regal-font-body': 'system-ui, sans-serif',
      '--regal-font-title': 'system-ui, sans-serif',
      '--regal-style-title': 'normal',
      '--regal-weight-title': '600',
      '--regal-label-case': 'none',
      '--regal-label-tracking': '0',
      '--regal-floor-shadow': '0.6',
    },
  },
}

/** The tokens the playground puts on the component: the preset, then the accent and radius overrides. */
export function tokensOf(settings: Pick<PlaygroundSettings, 'tokens' | 'accent' | 'radius'>): Record<string, string> {
  const tokens: Record<string, string> = { ...TOKEN_PRESETS[settings.tokens].tokens }
  if (settings.accent) {
    tokens['--regal-accent'] = settings.accent
    tokens['--regal-accent-hover'] = settings.accent
  }
  if (settings.radius !== null) tokens['--regal-radius'] = `${settings.radius}px`
  return tokens
}

/** The card sizes of the row: a phone's card (about 20 Books) and a wide one. */
export const ROW_SIZES: Record<RowSize, { label: string, width: string, height: string }> = {
  phone: { label: 'Phone card 360 × 300', width: '360px', height: '300px' },
  wide: { label: 'Wide card 46rem × 20rem', width: '46rem', height: '20rem' },
}

/** One attribute of a component tag in the code shown: a string prop or a bound one. */
function attr(name: string, value: string | number | boolean): string {
  if (value === true) return name
  if (typeof value === 'string') return `${name}="${value}"`
  return `:${name}="${value}"`
}

function tag(name: string, attrs: string[], children: string[] = []): string {
  const open = attrs.length > 2 ? `<${name}\n${attrs.map(a => `  ${a}`).join('\n')}\n` : `<${name}${attrs.map(a => ` ${a}`).join('')}`
  if (!children.length) return `${open}${attrs.length > 2 ? '' : ' '}/>`
  return `${open}>\n${children.map(line => `  ${line}`).join('\n')}\n</${name}>`
}

function themeAttrs(settings: PlaygroundSettings): string[] {
  const attrs: string[] = []
  if (settings.theme !== DEFAULT_SETTINGS.theme) attrs.push(attr('theme', settings.theme))
  if (settings.unstyled) attrs.push(attr('unstyled', true))
  return attrs
}

function slotLines(settings: PlaygroundSettings): string[] {
  if (settings.slots === 'whole') {
    return [
      '<template #tooltip="{ book }">',
      '  <strong>{{ book.title }}</strong> — {{ book.author }}',
      '</template>',
      '<template #detail="{ book, close, flip, face }">',
      '  <MyBookCard :book="book" :face="face" @flip="flip" @close="close" />',
      '</template>',
    ]
  }
  if (settings.slots === 'parts') {
    return [
      '<template #detail-header="{ book }">',
      '  <h2>{{ book.title }}</h2>',
      '</template>',
      '<template #detail-about="{ book, description }">',
      `  <p>{{ description ?? 'No blurb for this one.' }}</p>`,
      '</template>',
    ]
  }
  return []
}

/** The host's template for these settings. */
export function templateSnippet(settings: PlaygroundSettings): string {
  const parts: string[] = []
  if (settings.component === 'row') {
    const attrs = ['class="books-row"']
    if (settings.inspect !== DEFAULT_SETTINGS.inspect) attrs.push(attr('inspect', settings.inspect))
    if (settings.limit !== null) attrs.push(attr('limit', settings.limit))
    if (settings.rowYear !== null) attrs.push(attr('year', settings.rowYear))
    if (settings.rowRotate !== DEFAULT_SETTINGS.rowRotate) attrs.push(attr('rotate', settings.rowRotate))
    if (!settings.backButton) attrs.push(attr('back-button', false))
    if (!settings.accessibleList) attrs.push(attr('accessible-list', false))
    if (settings.label) attrs.push(attr('label', settings.label))
    attrs.push(...themeAttrs(settings))
    parts.push(tag('RegalBooksRow', attrs, slotLines(settings)))
  }
  else {
    if (settings.filterBar) parts.push(tag('RegalBooksFilters', ['class="books-filters"']))
    const attrs = ['class="books-stage"']
    if (settings.controls) attrs.push(attr('controls', true))
    if (!settings.accessibleList) attrs.push(attr('accessible-list', false))
    if (settings.stageRotate !== DEFAULT_SETTINGS.stageRotate) attrs.push(attr('rotate', settings.stageRotate))
    attrs.push(...themeAttrs(settings))
    parts.push(tag('RegalBooksStage', attrs, slotLines(settings)))
    if (settings.sidebar) {
      const side: string[] = []
      if (settings.heading !== DEFAULT_SETTINGS.heading) side.push(attr('heading', settings.heading))
      if (settings.countLabel !== DEFAULT_SETTINGS.countLabel) side.push(attr('count-label', settings.countLabel))
      if (!settings.sidebarFilters) side.push(attr('filters', false))
      if (!settings.sidebarList) side.push(attr('list', false))
      side.push(...themeAttrs(settings))
      parts.push(tag('RegalBooksSidebar', side))
    }
  }
  return `<template>\n${parts.map(part => part.split('\n').map(line => `  ${line}`).join('\n')).join('\n')}\n</template>`
}

/** The host's CSS for these settings: the component's size and the tokens set. */
export function styleSnippet(settings: PlaygroundSettings): string {
  const selector = settings.component === 'row' ? '.books-row' : '.books-stage'
  const size = settings.component === 'row'
    ? [`width: ${ROW_SIZES[settings.rowSize].width};`, `height: ${ROW_SIZES[settings.rowSize].height};`]
    : ['height: 36rem;']
  const tokens = Object.entries(tokensOf(settings)).map(([name, value]) => `${name}: ${value};`)
  const lines = [...size, ...(tokens.length ? ['/* Theme tokens (README: "Theming") */', ...tokens] : [])]
  return `<style scoped>\n${selector} {\n${lines.map(line => `  ${line}`).join('\n')}\n}\n</style>`
}

/** The host's nuxt.config.ts: the layer and runtimeConfig.public.regal. */
export function configSnippet(settings: PlaygroundSettings, librarySrc: string): string {
  const regal = [`librarySrc: '${librarySrc}',`]
  if (!settings.haptics) regal.push('haptics: false,')
  return [
    'export default defineNuxtConfig({',
    '  extends: [[\'github:fabkho/regal\', { install: true }]],',
    '  runtimeConfig: {',
    '    public: {',
    '      regal: {',
    ...regal.map(line => `        ${line}`),
    '        // theme: \'light\' | \'dark\' | \'auto\', the default of every component\'s theme prop',
    '      },',
    '    },',
    '  },',
    '})',
  ].join('\n')
}
