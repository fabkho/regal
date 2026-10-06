import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, configSnippet, readSettings, styleSnippet, templateSnippet, tokensOf, writeSettings } from '../../app/showcase/settings'
import { parseLibraryFile } from '../../shared/library/libraryFile'

describe('playground settings', () => {
  it('reads the defaults from an empty query and writes nothing for them', () => {
    expect(readSettings({})).toEqual(DEFAULT_SETTINGS)
    expect(Object.values(writeSettings(DEFAULT_SETTINGS)).filter(value => value !== undefined)).toEqual([])
  })

  it('round-trips every setting through the URL, keeping the Stack\'s own keys', () => {
    const settings = { ...DEFAULT_SETTINGS, component: 'row', inspect: 'auto', limit: 80, rowYear: 2025, backButton: false, theme: 'dark', tokens: 'night', accent: '#e2b04a', radius: 0, slots: 'parts', haptics: false, label: 'Read' } as const
    const query = writeSettings(settings, { sort: 'rating', year: '2025' })
    expect(query.sort).toBe('rating')
    expect(query.year).toBe('2025')
    expect(query.ryear).toBe('2025')
    expect(readSettings(query as Record<string, string>)).toEqual(settings)
  })

  it('ignores invalid values and treats a src as the URL library', () => {
    const settings = readSettings({ c: 'shelf', limit: '-3', radius: '', accent: 'red', theme: 'sepia', src: ' https://example.com/library.json ' })
    expect(settings.component).toBe('stage')
    expect(settings.limit).toBeNull()
    expect(settings.radius).toBeNull()
    expect(settings.accent).toBeNull()
    expect(settings.theme).toBe('light')
    expect(settings).toMatchObject({ library: 'url', src: 'https://example.com/library.json' })
  })

  it('defaults to the site\'s live shelf when it has one, and only offers it then', () => {
    const live = { live: true }
    expect(readSettings({}, live).library).toBe('live')
    expect(writeSettings(readSettings({}, live), {}, live).lib).toBeUndefined()
    expect(writeSettings({ ...readSettings({}, live), library: 'shelf' }, {}, live).lib).toBe('shelf')
    expect(readSettings({ lib: 'shelf' }, live).library).toBe('shelf')
    expect(readSettings({ lib: 'live' }).library).toBe('shelf')
    expect(readSettings({ lib: 'live', src: 'https://example.com/library.json' }, live).library).toBe('url')
  })

  it('shows the host code for what is set', () => {
    const row = { ...DEFAULT_SETTINGS, component: 'row', inspect: 'viewport', rowYear: 2025, backButton: false } as const
    expect(templateSnippet(row)).toContain('inspect="viewport"')
    expect(templateSnippet(row)).toContain(':year="2025"')
    expect(templateSnippet(row)).toContain(':back-button="false"')
    const stage = { ...DEFAULT_SETTINGS, controls: true, filterBar: true, sidebarList: false }
    expect(templateSnippet(stage)).toMatch(/<RegalBooksFilters[\s\S]*<RegalBooksStage[^>]*controls[\s\S]*<RegalBooksSidebar :list="false" \/>/)
    expect(configSnippet({ ...DEFAULT_SETTINGS, haptics: false }, '/books/library.json')).toContain('haptics: false')
    expect(styleSnippet({ ...DEFAULT_SETTINGS, tokens: 'soft', accent: '#123456' })).toContain('--regal-accent: #123456;')
    expect(tokensOf({ tokens: 'regal', accent: null, radius: 6 })).toEqual({ '--regal-radius': '6px' })
  })
})

describe('the showcase shelf', () => {
  it('is a valid, synthetic Regal library file', () => {
    const result = parseLibraryFile(readFileSync(new URL('../../demo/showcase-library.json', import.meta.url), 'utf8'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.library.owner).toBe('Demo Reader')
    expect(result.library.generator).toContain('synthetic')
    expect(result.library.books.length).toBeGreaterThan(30)
  })
})
