// The rest of a printed back cover (#27): the praise quotes, the shelf
// category and the imprint that go around the blurb. Text-model calls only
// (free tier); nothing here generates images.
//
// Quotes are extracted the way blurb.ts cuts the blurb: the model may only
// copy, never write. Every quote has to appear verbatim in the publisher
// description (normalized) or it is dropped.
import { USER_AGENT } from '../resolvers/covers'
import { generateText } from './gemini'

export interface Quote {
  text: string
  source: string
}

/** Longest quote we print on a back cover. */
export const MAX_QUOTE = 160

const QUOTES_PROMPT = `Below is a book's publisher description. Some publisher copy opens with praise quotes from reviewers ("A masterpiece." —The New York Times).

Return at most 2 of those praise quotes as JSON: [{"text": "...", "source": "..."}]. "text" is the quoted praise, copied EXACTLY as it appears (no quotation marks around it, no ellipsis, no rewriting, no shortening); "source" is who said it (publication or critic), without the dash. Prefer short, punchy quotes under ${MAX_QUOTE} characters. If a quote is longer, pick a different one rather than cutting it.

If the description contains no praise quotes, return [].

Output JSON only, nothing else.

Description:
"""
{TEXT}
"""`

const normalize = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Publisher copy as plain text, keeping the praise quotes that
 * `cleanDescription` strips (they're exactly what we're after here).
 */
export function plainText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t\u00A0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Strips the quotation marks, dashes and ellipses around a model's quote. */
export function tidyQuote(quote: Quote): Quote {
  return {
    text: quote.text.replace(/^[\s"“”'‘’]+|[\s"“”'‘’]+$/g, '').replace(/^[….]{1,3}\s*/, '').trim(),
    source: quote.source.replace(/^[\s—–\-"“”]+|[\s"“”]+$/g, '').trim(),
  }
}

/** Praise worth printing: a whole sentence, not a fragment lifted mid-clause. */
const SENTENCE = /^[A-Z“‘"'(\d]/
const ENDS = /[.!?][”’"']?$/

/**
 * Keeps the quotes the model really copied: the text has to appear in the
 * source (ignoring case and punctuation), read as a full sentence and be short
 * enough to print, with an attribution. Same contract as blurb.ts's
 * `onlyDeleted` — the model may only copy, never write.
 */
export function verifiedQuotes(quotes: Quote[], source: string, limit = 2): Quote[] {
  const haystack = normalize(source)
  const kept: Quote[] = []
  for (const raw of quotes) {
    if (typeof raw?.text !== 'string' || typeof raw?.source !== 'string') continue
    const quote = tidyQuote(raw)
    const text = normalize(quote.text)
    if (!quote.text || !quote.source) continue
    if (quote.text.length > MAX_QUOTE || text.length < 25) continue
    if (!SENTENCE.test(quote.text) || !ENDS.test(quote.text)) continue
    if (!haystack.includes(text)) continue
    if (kept.some(other => normalize(other.text) === text)) continue
    kept.push(quote)
    if (kept.length >= limit) break
  }
  return kept
}

/** The JSON array in a model answer, however it wrapped it (```json fences, prose). */
export function parseQuotes(answer: string): Quote[] {
  const match = answer.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const parsed = JSON.parse(match[0]) as unknown
    return Array.isArray(parsed) ? parsed as Quote[] : []
  }
  catch {
    return []
  }
}

/** Up to two praise quotes copied out of the publisher description, verified. */
export async function resolveQuotes(description: string | null | undefined, ask: (prompt: string) => Promise<string> = generateText): Promise<Quote[]> {
  const source = plainText(description ?? '')
  if (source.length < 120) return []
  try {
    return verifiedQuotes(parseQuotes(await ask(QUOTES_PROMPT.replace('{TEXT}', source))), source)
  }
  catch (error) {
    console.warn(`  quotes model failed: ${(error as Error).message}`)
    return []
  }
}

/** Apple's genre names → the shelf category a back cover prints. */
const GENRES: [RegExp, string][] = [
  [/^sci-?fi(\s*&\s*fantasy)?$|^science fiction/i, 'SCIENCE FICTION'],
  [/^fantasy/i, 'FICTION / FANTASY'],
  [/^horror/i, 'FICTION / HORROR'],
  [/mysteries|mystery|thriller|suspense|crime/i, 'FICTION / THRILLER'],
  [/^romance/i, 'FICTION / ROMANCE'],
  [/historical/i, 'FICTION / HISTORICAL'],
  [/graphic novels?|^comics/i, 'GRAPHIC NOVEL'],
  [/young adult/i, 'YOUNG ADULT FICTION'],
  [/children/i, 'CHILDREN\'S FICTION'],
  [/short stories/i, 'FICTION / SHORT STORIES'],
  [/^literary|^fiction & literature$|^literature/i, 'FICTION / LITERARY'],
  [/biograph|memoir/i, 'BIOGRAPHY / MEMOIR'],
  [/^history|^historical studies/i, 'HISTORY'],
  [/computers|internet|programming|technology/i, 'TECHNOLOGY'],
  [/business|personal finance|economic/i, 'BUSINESS'],
  [/science & nature|^nature|^science$|^physics|^biology/i, 'SCIENCE'],
  [/health|mind & body|self-?improvement/i, 'SELF-HELP'],
  [/philosoph/i, 'PHILOSOPHY'],
  [/politics|current events|social science/i, 'POLITICS'],
  [/^travel/i, 'TRAVEL'],
  [/essays/i, 'NONFICTION / ESSAYS'],
  [/cook|food & drink/i, 'COOKING'],
  [/art & architecture|^design|^photograph/i, 'ART & DESIGN'],
  [/^poetry/i, 'POETRY'],
  [/religion|spiritual/i, 'RELIGION'],
]

/** Shelf labels Apple lists on every book: never a category on their own. */
const GENERIC = /^(books|ebooks|audiobooks|all|kindle|general)$/i

/**
 * One clean, printable shelf category from a source's genre list
 * (["Sci-Fi & Fantasy", "Books", "Fiction & Literature"] → "SCIENCE FICTION"),
 * or null when nothing specific is on offer. The rules are tried in their own
 * order, not the list's: Apple leads with sub-shelves ("Adventure Sci-Fi")
 * that would otherwise beat the shelf a cover actually prints.
 */
export function mapGenre(genres: (string | null | undefined)[] | null | undefined): string | null {
  const names = (genres ?? [])
    .filter((name): name is string => Boolean(name?.trim()))
    .map(name => name.trim())
    .filter(name => !GENERIC.test(name))
  for (const [pattern, label] of GENRES) {
    if (names.some(name => pattern.test(name))) return label
  }
  // Nothing specific: the broad shelf is still better than an empty label.
  for (const name of names) {
    if (/^non-?fiction$/i.test(name)) return 'NONFICTION'
    if (/^fiction$/i.test(name)) return 'FICTION'
  }
  return null
}

/**
 * The imprint as printed: trimmed, un-inverted and without the legal tail Open
 * Library carries ("Doherty Associates, LLC, Tom" → "Tom Doherty Associates").
 */
export function cleanPublisher(value: string | null | undefined): string | null {
  let text = (value ?? '').replace(/\s+/g, ' ').trim()
  text = text.replace(/,? (?:LLC|Inc|Ltd|GmbH|Co)\.?(?=$|,)/i, '')
  // Catalogue inversion: a given name parked at the end.
  text = text.replace(/^(.+), ([A-Z][a-z]+)$/, '$2 $1').replace(/[.,;:]+$/, '').trim()
  return text && text.length <= 48 ? text : null
}

/** The edition's publisher from Open Library, by ISBN-13. */
export async function fetchPublisher(isbn13: string | null | undefined): Promise<string | null> {
  const isbn = (isbn13 ?? '').replace(/\D/g, '')
  if (isbn.length !== 13) return null
  try {
    const response = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) })
    if (!response.ok) return null
    const data = await response.json() as { publishers?: string[] }
    return cleanPublisher(data.publishers?.[0])
  }
  catch {
    return null
  }
}

/** The tracker's own publisher first (it knows the edition), then Open Library. */
export async function resolvePublisher(known: string | null | undefined, isbn13: string | null | undefined): Promise<string | null> {
  return cleanPublisher(known) ?? await fetchPublisher(isbn13)
}
