// Library import from the reading-tracker CLI (github.com/fabkho/reading-tracker-cli):
// the output of `reading list --json`, whose books come from Fable. Pure, like
// the Goodreads importer.
import type { Book } from '../types/book'

/** The parts of `reading list --json` Regal reads (LibraryBookJson in the CLI). */
export interface ReadingTrackerBook {
  id: string
  title: string
  author: string | null
  additionalAuthors: string | null
  shelf: string | null
  isbn: string | null
  isbn13: string | null
  goodreadsId: string | null
  description: string | null
  coverUrl: string | null
  pageCount: number | null
  yearPublished: string | null
  originalPublicationYear: string | null
  binding: string | null
  format: 'physical' | 'ebook' | 'audiobook' | null
  createdAt: string | null
  session: {
    startedAt: string | null
    finishedAt: string | null
    rating: number | null
    review: string | null
  } | null
}

export class NotAReadingTrackerExportError extends Error {
  constructor(message = 'Not a reading-tracker export — expected `reading list --json` output with a "books" array') {
    super(message)
    this.name = 'NotAReadingTrackerExportError'
  }
}

/** The CLI's shelf keys → Regal's reading status (Goodreads' names). */
const SHELF_STATUS: Record<string, string> = {
  'read': 'read',
  'currently-reading': 'currently-reading',
  'want-to-read': 'to-read',
  'did-not-finish': 'dnf',
  'dnf': 'dnf',
}

/** True when the text looks like JSON rather than a CSV. */
export function looksLikeJson(text: string): boolean {
  return /^\s*[[{]/.test(text.replace(/^\uFEFF/, ''))
}

/**
 * Sorts an ISBN-ish value into ISBN-13 / ISBN-10. Fable sometimes stores an
 * ISBN-10 or its own id (e.g. "YlsoGKoxeN") in the ISBN-13 field.
 */
export function splitIsbn(...values: (string | null | undefined)[]): { isbn10: string | null, isbn13: string | null } {
  let isbn10: string | null = null
  let isbn13: string | null = null
  for (const value of values) {
    const digits = (value ?? '').replace(/[^0-9X]/gi, '').toUpperCase()
    if (!isbn13 && /^97[89]\d{10}$/.test(digits)) isbn13 = digits
    else if (!isbn10 && /^\d{9}[\dX]$/.test(digits)) isbn10 = digits
  }
  return { isbn10, isbn13 }
}

/** Ratings in quarter steps, 0 (unrated) to 5. */
export function quarterRating(value: number | null | undefined): number {
  if (!value || value < 0) return 0
  return Math.min(5, Math.round(value * 4) / 4)
}

const isoDate = (value: string | null | undefined) => (value ? value.slice(0, 10) : null)
const year = (value: string | null | undefined) => {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isNaN(parsed) ? null : parsed
}

function splitSeriesTitle(rawTitle: string): { title: string, seriesTitle: string | null } {
  const match = rawTitle.match(/^(.*)\s\(([^()]*#[^()]*)\)\s*$/)
  if (!match) return { title: rawTitle, seriesTitle: null }
  return { title: match[1]!.trim(), seriesTitle: match[2]!.trim() }
}

function toBook(entry: ReadingTrackerBook): Book {
  const { title, seriesTitle } = splitSeriesTitle(entry.title.trim())
  const { isbn10, isbn13 } = splitIsbn(entry.isbn13, entry.isbn)
  const binding = entry.binding?.trim() || (entry.format === 'ebook' ? 'Kindle Edition' : entry.format === 'audiobook' ? 'Audiobook' : null)
  return {
    id: entry.id,
    title,
    seriesTitle,
    author: entry.author?.trim() || null,
    additionalAuthors: (entry.additionalAuthors ?? '').split(',').map(name => name.trim()).filter(Boolean),
    isbn10,
    isbn13,
    pages: entry.pageCount && entry.pageCount > 0 ? entry.pageCount : null,
    binding,
    yearPublished: year(entry.yearPublished),
    originalYear: year(entry.originalPublicationYear),
    rating: quarterRating(entry.session?.rating),
    status: SHELF_STATUS[entry.shelf ?? ''] ?? entry.shelf ?? 'to-read',
    tags: [],
    dateRead: isoDate(entry.session?.finishedAt),
    dateAdded: isoDate(entry.createdAt),
    review: entry.session?.review?.trim() || null,
    reviewHasSpoiler: false,
    readCount: entry.session?.finishedAt ? 1 : 0,
    description: entry.description?.trim() || null,
    coverUrl: entry.coverUrl || null,
  }
}

/**
 * Parses `reading list --json` output (`{ books: [...] }` or a bare array).
 * @throws {NotAReadingTrackerExportError} when it isn't that shape.
 */
export function importReadingTracker(jsonText: string): { books: Book[], warnings: string[] } {
  let data: unknown
  try {
    data = JSON.parse(jsonText.replace(/^\uFEFF/, ''))
  }
  catch {
    throw new NotAReadingTrackerExportError('Not valid JSON')
  }
  const entries = Array.isArray(data) ? data : (data as { books?: unknown })?.books
  if (!Array.isArray(entries)) throw new NotAReadingTrackerExportError()

  const books: Book[] = []
  const warnings: string[] = []
  for (const entry of entries as Partial<ReadingTrackerBook>[]) {
    if (!entry?.id || !entry.title?.trim()) {
      warnings.push(`Skipped an entry without id or title (${entry?.title ?? entry?.id ?? 'unknown'})`)
      continue
    }
    books.push(toBook(entry as ReadingTrackerBook))
  }
  return { books, warnings }
}
