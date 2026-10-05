import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { hostThemeOf, nearestHostTheme, normalizeTheme, REGAL_TOKENS, resolveScheme, ROW_SHEET_TOKENS } from '#layers/regal/app/utils/theme/tokens'
import { parseRgb } from '#layers/regal/app/utils/theme/color'

const css = readFileSync(new URL('../../app/assets/css/regal-theme.css', import.meta.url), 'utf8')
const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8')

/** The declarations of the first rule whose selector is exactly `selector`. */
function block(selector: string) {
  const start = css.indexOf(`${selector} {`)
  expect(start, selector).toBeGreaterThanOrEqual(0)
  return css.slice(start, css.indexOf('}', start))
}

function element(attributes: Record<string, string> = {}, classes: string[] = [], parent: unknown = null) {
  return {
    getAttribute: (name: string) => attributes[name] ?? null,
    classList: { contains: (name: string) => classes.includes(name) },
    parentElement: parent,
  } as unknown as Element
}

describe('resolveScheme', () => {
  it('keeps light and dark as they are', () => {
    expect(resolveScheme({ theme: 'light', hostTheme: 'dark', prefersDark: true })).toBe('light')
    expect(resolveScheme({ theme: 'dark', hostTheme: 'light' })).toBe('dark')
  })

  it('auto: the host\'s hook first, then a single color-scheme, then the OS', () => {
    expect(resolveScheme({ theme: 'auto', hostTheme: 'dark', colorScheme: 'light', prefersDark: false })).toBe('dark')
    expect(resolveScheme({ theme: 'auto', hostTheme: 'light', prefersDark: true })).toBe('light')
    expect(resolveScheme({ theme: 'auto', colorScheme: 'dark', prefersDark: false })).toBe('dark')
    expect(resolveScheme({ theme: 'auto', colorScheme: 'only light', prefersDark: true })).toBe('light')
    expect(resolveScheme({ theme: 'auto', colorScheme: 'light dark', prefersDark: true })).toBe('dark')
    expect(resolveScheme({ theme: 'auto', colorScheme: 'normal', prefersDark: false })).toBe('light')
    expect(resolveScheme({ theme: 'auto' })).toBe('light')
  })
})

describe('normalizeTheme', () => {
  it('accepts the three themes, anything else is the fallback', () => {
    expect(normalizeTheme('dark')).toBe('dark')
    expect(normalizeTheme('auto')).toBe('auto')
    expect(normalizeTheme(undefined)).toBe('light')
    expect(normalizeTheme('sepia')).toBe('light')
    expect(normalizeTheme(undefined, 'dark')).toBe('dark')
  })
})

describe('host theme hooks', () => {
  it('reads data-theme, data-color-scheme and a dark/light class', () => {
    expect(hostThemeOf(element({ 'data-theme': 'dark' }))).toBe('dark')
    expect(hostThemeOf(element({ 'data-color-scheme': 'Light' }))).toBe('light')
    expect(hostThemeOf(element({}, ['dark']))).toBe('dark')
    expect(hostThemeOf(element({ 'data-theme': 'sepia' }, ['light']))).toBe('light')
    expect(hostThemeOf(element())).toBeNull()
  })

  it('takes the nearest hook up the tree', () => {
    const html = element({ 'data-theme': 'dark' })
    const wrapper = element({}, ['light'], html)
    expect(nearestHostTheme(element({}, [], wrapper))).toBe('light')
    expect(nearestHostTheme(element({}, [], element({}, [], html)))).toBe('dark')
    expect(nearestHostTheme(element())).toBeNull()
  })
})

describe('token contract', () => {
  it('every token has a light default from its public property', () => {
    const light = block('.regal')
    for (const name of REGAL_TOKENS) expect(light, name).toContain(`--_regal-${name}: var(--regal-${name},`)
  })

  it('the dark set only re-colours, each colour still overridable', () => {
    const dark = block('.regal[data-regal-theme="dark"]')
    for (const name of ['surface', 'surface-raised', 'ink', 'ink-muted', 'ink-subtle', 'ink-faint', 'accent', 'accent-hover', 'hairline', 'border', 'shadow']) {
      expect(dark, name).toContain(`--_regal-${name}: var(--regal-${name},`)
    }
    expect(dark).toContain('color-scheme: dark')
  })

  it('unstyled unsets colours, frame and type but keeps spacing', () => {
    const unstyled = block('.regal.regal--unstyled')
    for (const name of REGAL_TOKENS) {
      if (['space', 'tooltip-padding', 'panel-padding'].includes(name)) expect(unstyled, name).not.toContain(`--_regal-${name}:`)
      else expect(unstyled, name).toContain(`--_regal-${name}:`)
    }
  })

  it('the README documents every token', () => {
    for (const name of REGAL_TOKENS) expect(readme, name).toContain(`\`--regal-${name}\``)
  })

  it('the row\'s card and sheet tokens are read by the row and documented', () => {
    const card = readFileSync(new URL('../../app/components/row/Card.vue', import.meta.url), 'utf8')
    for (const name of [...ROW_SHEET_TOKENS, 'row-border', 'row-radius', 'row-background', 'row-z-index']) {
      expect(card, name).toContain(`var(--regal-${name},`)
      expect(readme, name).toContain(`| \`--regal-${name}\` |`)
    }
  })
})

describe('parseRgb (the veil takes the card\'s surface)', () => {
  it('reads computed rgb()/rgba() in both syntaxes', () => {
    expect(parseRgb('rgb(245, 242, 235)')).toEqual({ hex: '#f5f2eb', alpha: 1 })
    expect(parseRgb('rgba(23, 27, 36, 0.82)')).toEqual({ hex: '#171b24', alpha: 0.82 })
    expect(parseRgb('rgb(31 30 27 / 50%)')).toEqual({ hex: '#1f1e1b', alpha: 0.5 })
    expect(parseRgb('rgba(0, 0, 0, 0)')).toEqual({ hex: '#000000', alpha: 0 })
  })

  it('leaves other syntaxes to the canvas', () => {
    expect(parseRgb('oklch(0.3 0.02 80)')).toBeNull()
    expect(parseRgb('transparent')).toBeNull()
  })
})
