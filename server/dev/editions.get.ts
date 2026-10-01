// Dev only: other editions of a Book on Apple Books (cover thumbnails), for
// choosing a cover edition visually. Flags film tie-ins.
import { cleanTitle, USER_AGENT } from '../utils/covers'

interface AppleBook { trackId?: number, trackName?: string, artistName?: string, artworkUrl100?: string, description?: string, releaseDate?: string }

const comparable = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '')
/** Editions must have the same title; only bracketed edition notes are dropped (not ": subtitles"). */
const editionTitle = (value: string | undefined) => comparable((value ?? '').replace(/\s*[([][^()[\]]*[)\]]\s*/g, ' '))
const FILM = /motion picture|movie tie|film tie|tie-in|now a major|starring/i

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404 })
  const query = getQuery(event)
  const title = cleanTitle(String(query.title ?? ''))
  const author = String(query.author ?? '')
  if (!title) throw createError({ statusCode: 400, statusMessage: 'title required' })
  const surname = comparable(author.split(/\s+/).at(-1) ?? '')
  const results: AppleBook[] = []
  for (const country of ['us', 'gb']) {
    const params = new URLSearchParams({ term: `${title} ${author}`.trim(), entity: 'ebook', country, limit: '25' })
    const response = await fetch(`https://itunes.apple.com/search?${params}`, { headers: { 'User-Agent': USER_AGENT } }).catch(() => null)
    const data = response?.ok ? await response.json() as { results?: AppleBook[] } : null
    results.push(...(data?.results ?? []))
  }
  const seen = new Set<string>()
  const editions = results
    .filter(item => item.artworkUrl100
      && editionTitle(item.trackName) === editionTitle(title)
      && (!surname || comparable(item.artistName ?? '').includes(surname)))
    .filter((item) => {
      // One entry per artwork.
      const art = item.artworkUrl100!.replace(/\/\d+x\d+bb\.\w+$/, '')
      if (seen.has(art)) return false
      seen.add(art)
      return true
    })
    .map(item => ({
      id: String(item.trackId),
      name: item.trackName,
      released: item.releaseDate?.slice(0, 10) ?? null,
      thumb: item.artworkUrl100!.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/300x450bb.jpg'),
      full: item.artworkUrl100!.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/10000x10000bb.jpg'),
      film: FILM.test(`${item.trackName} ${(item.description ?? '').slice(0, 400)}`),
    }))
  // Auto pick: the earliest non-film edition.
  const auto = [...editions].filter(edition => !edition.film).sort((a, b) => (a.released ?? '9') < (b.released ?? '9') ? -1 : 1)[0]
  return { editions: editions.slice(0, 8), auto: auto?.id ?? null }
})
