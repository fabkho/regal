// Goodreads exports as a second opinion on the reading tracker's history:
// the rows of one or more Goodreads Library exports, matched to tracker Books
// by ISBN, by work title + author (typos, subtitles, "Title / Other title"
// 2-in-1 editions, study guides "… by Author"), by series number, or by an
// explicit alias. Pure; reading the files is the build's job.
import Papa from 'papaparse'
import type { Book } from '../../shared/types/book'
import { importLibrary } from '../../shared/library/importLibrary'

/** One read row of a Goodreads export. */
export interface GoodreadsRead {
  /** Position of its file in precedence order (0 = most trusted). */
  file: number
  /** Short name of its file for reports. */
  fileLabel: string
  /** Full title, series included: "Gold Book (Ember Saga, #2)". */
  title: string
  author: string | null
  additionalAuthors: string[]
  isbn10: string | null
  isbn13: string | null
  dateRead: string | null
  shelf: string
  binding: string | null
}

/** A tracker Book as the matcher sees it. */
export interface MatchTarget {
  id: string
  title: string
  author: string | null
  additionalAuthors: string[]
  isbns: string[]
  /** Extra titles or ISBNs this Book goes by in the Goodreads files (overrides). */
  aliases: string[]
}

export type MatchHow = 'isbn' | 'alias' | 'title' | 'series' | 'typo' | 'title-only'

export interface GoodreadsMatch {
  row: GoodreadsRead
  how: MatchHow
}

/**
 * Read rows of a Goodreads export: the Read shelf, plus rows on other shelves
 * that carry a read date (a re-shelved Book keeps its date).
 */
export function parseGoodreads(text: string, file: number, fileLabel: string): GoodreadsRead[] {
  // Exports made by other apps ("Goodreads Import from …") leave Book Id empty; the importer needs one.
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true })
  const rows = parsed.data.map((row, index) => ({ ...row, 'Book Id': row['Book Id']?.trim() || `row-${index + 1}` }))
  return importLibrary(Papa.unparse(rows, { columns: parsed.meta.fields })).books
    .filter((book: Book) => book.status === 'read' || book.dateRead)
    .map(book => ({
      file,
      fileLabel,
      title: book.seriesTitle ? `${book.title} (${book.seriesTitle})` : book.title,
      author: book.author,
      additionalAuthors: book.additionalAuthors,
      isbn10: book.isbn10,
      isbn13: book.isbn13,
      dateRead: book.dateRead,
      shelf: book.status,
      binding: book.binding,
    }))
}

const ascii = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036F]/g, '').toLowerCase()

/** Lower-case ASCII words, '&' as 'and'. */
export function normalize(value: string): string {
  return ascii(value.replace(/&/g, ' and ')).replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim()
}

/**
 * The comparable names of the work(s) behind a title: brackets dropped, each
 * half of a "Title / Other title" 2-in-1, the part before and after a colon,
 * and a study guide's "Title by|von Author" cut to the title.
 */
export function workTitles(title: string): string[] {
  const bare = title.replace(/\s*[([][^()[\]]*[)\]]/g, ' ').replace(/\s+/g, ' ').trim()
  const keys = new Set<string>()
  for (const part of bare.split(/\s+\/\s+/)) {
    // A study guide names its Book's author: "… von A. B. Author", "… by Ada Example".
    const guide = part.replace(/\s+(?:by|von)\s+(?:\p{Lu}[\p{L}'-]*\.?\s+){1,3}\p{Lu}[\p{L}'-]+$/u, '')
    for (const work of new Set([part, guide])) {
      const [main, ...rest] = work.split(':')
      keys.add(normalize(main!))
      const subtitle = normalize(rest.join(' '))
      if (subtitle.length >= 8) keys.add(subtitle)
      if (rest.length) keys.add(normalize(work))
    }
  }
  keys.delete('')
  return [...keys]
}

const SERIES_NOISE = new Set(['the', 'saga', 'series', 'trilogy', 'cycle', 'chronicles', 'book', 'books'])

/** "Red Rising Saga, #2" / "Discworld, #8; City Watch, #1" → ["red rising#2", "discworld#8", "city watch#1"]. */
export function seriesKeys(title: string): string[] {
  const match = title.match(/\(([^()]*#[^()]*)\)\s*$/)
  if (!match) return []
  return match[1]!.split(';').flatMap((part) => {
    const series = part.match(/^(.*?),?\s*#\s*([\d.]+(?:-[\d.]+)?)\s*$/)
    if (!series) return []
    const name = normalize(series[1]!).split(' ').filter(word => !SERIES_NOISE.has(word)).join(' ')
    return name ? [`${name}#${series[2]}`] : []
  })
}

/** ISBN-10 → ISBN-13 (978 prefix); ISBN-13s pass through; anything else is null. */
export function toIsbn13(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/[^0-9X]/gi, '').toUpperCase()
  if (/^97[89]\d{10}$/.test(digits)) return digits
  if (!/^\d{9}[\dX]$/.test(digits)) return null
  const body = `978${digits.slice(0, 9)}`
  const sum = [...body].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0)
  return `${body}${(10 - (sum % 10)) % 10}`
}

const surnameOf = (name: string | null | undefined) => normalize(name ?? '').split(' ').at(-1) ?? ''

/** True when the row is by one of the Book's authors (author columns only). */
export function sameAuthor(target: Pick<MatchTarget, 'author' | 'additionalAuthors'>, row: Pick<GoodreadsRead, 'author' | 'additionalAuthors'>): boolean {
  const rowNames = normalize([row.author, ...row.additionalAuthors].join(' '))
  const targetNames = normalize([target.author, ...target.additionalAuthors].join(' '))
  const targetSurnames = [target.author, ...target.additionalAuthors].map(surnameOf).filter(Boolean)
  const rowSurnames = [row.author, ...row.additionalAuthors].map(surnameOf).filter(Boolean)
  return targetSurnames.some(name => ` ${rowNames} `.includes(` ${name} `))
    || rowSurnames.some(name => ` ${targetNames} `.includes(` ${name} `))
}

/** Author columns, or the author named in the title ("1984 (A. Writer)", "… von A. B. Author"). */
function authorAgrees(target: MatchTarget, row: GoodreadsRead): boolean {
  if (sameAuthor(target, row)) return true
  const title = ` ${normalize(row.title)} `
  return [target.author, ...target.additionalAuthors].map(surnameOf).some(name => name.length > 2 && title.includes(` ${name} `))
}

/** Edit distance, for typos in titles ("The Clock Maschine"). */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = current
  }
  return previous[b.length]!
}

/** Long, number-free titles one or two letters apart ("Vol. 3" and "Vol. 4" are different Books). */
const isTypo = (a: string, b: string) => a !== b && a.length >= 12 && !/\d/.test(a + b) && editDistance(a, b) <= 2

const rowIsbns = (row: GoodreadsRead) => [toIsbn13(row.isbn13), toIsbn13(row.isbn10)].filter((isbn): isbn is string => Boolean(isbn))

/**
 * Goodreads rows for each target. Strongest evidence first: ISBN, an explicit
 * alias, the work title by the same author, the same series number by the same
 * author, a title one or two typos off, then a long title no other target has.
 */
export function matchGoodreads(targets: MatchTarget[], rows: GoodreadsRead[]): Map<string, GoodreadsMatch[]> {
  const titleOwners = new Map<string, number>()
  for (const target of targets) {
    for (const key of workTitles(target.title)) titleOwners.set(key, (titleOwners.get(key) ?? 0) + 1)
  }
  const result = new Map<string, GoodreadsMatch[]>()
  for (const target of targets) {
    const isbns = new Set(target.isbns.map(toIsbn13).filter(Boolean))
    const titles = workTitles(target.title)
    const series = seriesKeys(target.title)
    const aliasIsbns = new Set(target.aliases.map(toIsbn13).filter(Boolean))
    const aliasTitles = new Set(target.aliases.filter(alias => !toIsbn13(alias)).map(normalize))
    const matches: GoodreadsMatch[] = []
    for (const row of rows) {
      const keys = workTitles(row.title)
      const how: MatchHow | null = rowIsbns(row).some(isbn => isbns.has(isbn))
        ? 'isbn'
        : rowIsbns(row).some(isbn => aliasIsbns.has(isbn)) || keys.some(key => [...aliasTitles].some(alias => key === alias || key.startsWith(`${alias} `)))
          ? 'alias'
          : !authorAgrees(target, row)
              ? (keys.some(key => key.length >= 10 && titles.includes(key) && titleOwners.get(key) === 1) ? 'title-only' : null)
              : keys.some(key => titles.includes(key))
                ? 'title'
                : seriesKeys(row.title).some(key => series.includes(key))
                  ? 'series'
                  : keys.some(key => titles.some(title => isTypo(key, title)))
                    ? 'typo'
                    : null
      if (how) matches.push({ row, how })
    }
    if (matches.length) result.set(target.id, matches)
  }
  return result
}
