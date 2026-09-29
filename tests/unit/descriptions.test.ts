import { describe, expect, it } from 'vitest'
import type { Fetcher } from '../../server/utils/covers'
import { cleanDescription, MAX_DESCRIPTION, resolveDescription } from '../../server/utils/descriptions'

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

  it('trims long blurbs to a sentence boundary', () => {
    const long = `${'A sentence that goes on. '.repeat(80)}`
    const cleaned = cleanDescription(long)
    expect(cleaned.length).toBeLessThanOrEqual(MAX_DESCRIPTION)
    expect(cleaned.endsWith('.')).toBe(true)
  })
})
