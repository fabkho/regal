import { describe, expect, it } from 'vitest'
import type { Fetcher } from '../src/resolvers/covers'
import { cleanDescription, guessLanguage, isbnLanguage, MAX_DESCRIPTION, resolveDescription } from '../src/resolvers/descriptions'

function stubFetch(routes: Record<string, unknown>) {
  const calls: string[] = []
  const fetch: Fetcher = async (url) => {
    calls.push(url)
    const hit = Object.entries(routes).find(([fragment]) => url.includes(fragment))
    return hit
      ? new Response(JSON.stringify(hit[1]), { status: 200 })
      : new Response('not found', { status: 404 })
  }
  return { fetch, calls }
}

const empire = { isbn13: '9780756413026', title: 'Empire of Silence (The Sun Eater, #1)', author: 'Christopher Ruocchio' }

describe('resolveDescription', () => {
  it('falls back from the edition to its work', async () => {
    const { fetch } = stubFetch({
      '/isbn/9780756413026.json': { works: [{ key: '/works/OL1W' }] },
      '/works/OL1W.json': { description: { type: '/type/text', value: 'It was not his war.' } },
    })
    expect(await resolveDescription(empire, { fetch })).toEqual({ description: 'It was not his war.', source: 'openlibrary-isbn' })
  })

  it('searches by title and author when the ISBN has nothing', async () => {
    const { fetch, calls } = stubFetch({
      'search.json': { docs: [{ key: '/works/OL2W' }] },
      '/works/OL2W.json': { description: 'Found by search.' },
    })
    expect((await resolveDescription(empire, { fetch }))?.source).toBe('openlibrary-search')
    const search = new URL(calls.find(url => url.includes('search.json'))!)
    expect(search.searchParams.get('title')).toBe('Empire of Silence')
  })

  it('prefers the publisher blurb from Apple Books by ISBN', async () => {
    const { fetch } = stubFetch({
      'itunes.apple.com/lookup?isbn=9780756413026': { results: [{ trackName: 'Empire of Silence', description: '<b>Tagline.</b><br /><br />It was not his war.' }] },
      '/isbn/9780756413026.json': { description: 'Open Library text.' },
    })
    expect(await resolveDescription(empire, { fetch })).toEqual({ description: 'Tagline.\n\nIt was not his war.', source: 'apple-isbn' })
  })

  it('finds Apple Books by title and author, only on a matching title and surname', async () => {
    const howling = { isbn13: '9780756413040', title: 'Howling Dark (The Sun Eater, #2)', author: 'Christopher Ruocchio' }
    const { fetch } = stubFetch({
      'itunes.apple.com/search': { results: [
        { trackName: 'The Howling', artistName: 'Someone Else', description: 'Wrong book.' },
        { trackName: 'Howling Dark', artistName: 'Christopher Ruocchio', description: 'Right book.' },
      ] },
    })
    expect(await resolveDescription(howling, { fetch })).toEqual({ description: 'Right book.', source: 'apple-search' })

    const { fetch: other } = stubFetch({
      'itunes.apple.com/search': { results: [{ trackName: 'Howling Dark', artistName: 'Another Author', description: 'Same title, other author.' }] },
    })
    expect(await resolveDescription(howling, { fetch: other })).toBeNull()
  })

  it('skips a blurb in another language than the edition', async () => {
    const hadrian = { isbn13: '9780374529260', title: 'Memoirs of Hadrian', author: 'Marguerite Yourcenar' }
    const { fetch } = stubFetch({
      '/isbn/9780374529260.json': { description: 'Mémoires d\'Hadrien est un roman historique de la romancière française, qui est publié en 1951 dans une collection et le livre est un succès pour les lecteurs du monde.' },
      'itunes.apple.com/search': { results: [{ trackName: 'Memoirs of Hadrian', artistName: 'Marguerite Yourcenar', description: 'Both an intimate portrait of the emperor and a meditation on history, this is the story of Hadrian as he looks back on his life and the empire he ruled with care.' }] },
    })
    expect((await resolveDescription(hadrian, { fetch }))?.source).toBe('apple-search')
  })

  it('returns null when no source knows the book', async () => {
    const { fetch } = stubFetch({})
    expect(await resolveDescription(empire, { fetch })).toBeNull()
  })
})

describe('cleanDescription', () => {
  it('normalises line endings and strips Open Library markdown, footnotes and HTML', () => {
    const raw = 'It was not his war.\r\n\r\nA <b>hero</b> [of legend][1] ([source][2]).\r\n\r\n----------\r\nAlso contained:\r\n[1]: https://example.com'
    expect(cleanDescription(raw)).toBe('It was not his war.\n\nA hero of legend .')
  })

  it('strips markdown bold and "From inside cover" prefixes', () => {
    expect(cleanDescription('**The sixth novel.** Hadrian returns.')).toBe('The sixth novel. Hadrian returns.')
    expect(cleanDescription('From inside cover Tor First Edition March 1999: Thirty thousand years before…')).toBe('Thirty thousand years before…')
  })

  it('decodes numeric entities and drops blank non-breaking paragraphs', () => {
    expect(cleanDescription('Hadrian is lost.<br /><br />&#xa0;<br /><br />For half a century&#8212;he searched.')).toBe('Hadrian is lost.\n\nFor half a century—he searched.')
  })

  it('drops leading review quotes and edition notes', () => {
    const raw = '<b><b>"[E]pic science fiction at its most genuinely epic</b>." —James S.A. Corey, <i>NYT</i>-bestselling author<br /><br />"A must." —Library Journal (starred)<br /><br />Hadrian Marlowe chronicles his tale.<br /></b><br />It was not his war.'
    expect(cleanDescription(raw)).toBe('Hadrian Marlowe chronicles his tale.\n\nIt was not his war.')
    expect(cleanDescription('Now in paperback, the second novel of the series.')).toBe('The second novel of the series.')
  })

  it('knows the edition language from the ISBN and guesses a blurb\'s', () => {
    expect(isbnLanguage('9780756413026')).toBe('en')
    expect(isbnLanguage('9783453534421')).toBe('de')
    expect(isbnLanguage(null)).toBeNull()
    expect(guessLanguage('Er ist nicht der Mann, der die Welt mit einer Hand und das Schwert mit der anderen hält.')).toBe('de')
    expect(guessLanguage('It was not his war, and the galaxy remembers him as the hero of the story that was told.')).toBe('en')
    expect(guessLanguage('Too short.')).toBeNull()
  })

  it('trims long blurbs to a sentence boundary', () => {
    const long = `${'A sentence that goes on. '.repeat(80)}`
    const cleaned = cleanDescription(long)
    expect(cleaned.length).toBeLessThanOrEqual(MAX_DESCRIPTION)
    expect(cleaned.endsWith('.')).toBe(true)
  })
})
