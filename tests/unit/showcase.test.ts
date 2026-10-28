import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, configSnippet, readSettings, styleSnippet, templateSnippet, tokensOf, writeSettings } from '../../app/showcase/settings'
import { parseLibraryFile } from '../../shared/library/libraryFile'
import { reelDocument } from '../../app/showcase/reel'
import { readLibraryDocument } from '../../app/utils/library/libraryFile'
import type { Book } from '../../shared/types/book'

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
    // The hidden Book list is on unless a host turns it off.
    expect(templateSnippet({ ...DEFAULT_SETTINGS, component: 'row' })).not.toContain('accessible-list')
    expect(templateSnippet({ ...DEFAULT_SETTINGS, component: 'row', accessibleList: false })).toContain(':accessible-list="false"')
    expect(templateSnippet({ ...DEFAULT_SETTINGS, accessibleList: false })).toContain(':accessible-list="false"')
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

describe('the playground\'s reel', () => {
  it('reads and writes the reel as a component, with its own code', () => {
    const settings = readSettings({ c: 'reel', rplay: '0' })
    expect(settings.component).toBe('reel')
    expect(settings.reelAutoplay).toBe(false)
    expect(writeSettings(settings)).toMatchObject({ c: 'reel', rplay: '0' })
    const code = templateSnippet(settings)
    expect(code).toContain('<RegalBooksReel')
    expect(code).toContain(':library="library"')
    expect(code).toContain(':autoplay="false"')
    expect(styleSnippet(settings)).toContain('.books-reel')
  })

  it('hands the reel the Library it shows as a valid document, its images absolute', () => {
    const book = (id: string, dateRead: string): Book => ({
      id, title: `Book ${id}`, seriesTitle: null, author: 'Ada Example', additionalAuthors: [], isbn10: null, isbn13: null,
      pages: 100, binding: null, yearPublished: null, originalYear: null, rating: 4, status: 'read', tags: [],
      dateRead, dateAdded: null, review: null, reviewHasSpoiler: false, readCount: 1, description: null,
    })
    const books = Array.from({ length: 15 }, (_, index) => book(`b${index}`, `2025-01-${String(index + 1).padStart(2, '0')}`))
    const document = reelDocument(books, { b14: { front: 'covers/b14.jpg', color: '#336699' } }, 'https://example.org/shelf/library.json', 'https://example.org/playground')
    expect(document.books).toHaveLength(12)
    // Newest first, as the row.
    expect(document.books[0]!.id).toBe('b14')
    expect(document.books[0]!.assets?.front).toBe('https://example.org/shelf/covers/b14.jpg')
    expect(document.books[0]!.assets?.color).toBe('#336699')
    const read = readLibraryDocument(JSON.parse(JSON.stringify(document)))
    expect(read.ok).toBe(true)
  })
})
