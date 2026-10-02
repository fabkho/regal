import Papa from 'papaparse'
import type { Book } from '../types/book'
import { importReadingTracker, looksLikeJson } from './importReadingTracker'

/**
 * Thrown when the given CSV text doesn't look like a Goodreads Library export
 * (missing one or more required headers).
 */
export class NotAGoodreadsExportError extends Error {
  missingHeaders: string[]

  constructor(missingHeaders: string[]) {
    super(`Not a Goodreads library export — missing required column(s): ${missingHeaders.join(', ')}`)
    this.name = 'NotAGoodreadsExportError'
    this.missingHeaders = missingHeaders
  }
}

export interface ImportLibraryResult {
  books: Book[]
  warnings: string[]
}

const REQUIRED_HEADERS = ['Book Id', 'Title', 'Author', 'Exclusive Shelf'] as const

/** Raw row shape as produced by papaparse with `header: true`. Every column but the required ones may be absent. */
interface GoodreadsRow {
  'Book Id'?: string
  'Title'?: string
  'Author'?: string
  'Additional Authors'?: string
  'ISBN'?: string
  'ISBN13'?: string
  'My Rating'?: string
  'Average Rating'?: string
  'Binding'?: string
  'Number of Pages'?: string
  'Year Published'?: string
  'Original Publication Year'?: string
  'Date Read'?: string
  'Date Added'?: string
  'Bookshelves'?: string
  'Exclusive Shelf'?: string
  'My Review'?: string
  'Spoiler'?: string
  'Private Notes'?: string
  'Read Count'?: string
}

// Goodreads wraps ISBNs in `="..."` to stop Excel mangling them.
function cleanIsbn(raw: string | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/^="?|"?$/g, '').trim()
  return cleaned || null
}

function parseIntOrNull(val: string | undefined): number | null {
  if (!val || val.trim() === '') return null
  const n = Number.parseInt(val.trim(), 10)
  return Number.isNaN(n) ? null : n
}

// Goodreads dates are YYYY/MM/DD — convert to ISO YYYY-MM-DD.
function parseGoodreadsDate(dateStr: string | undefined): string | null {
  if (!dateStr || dateStr.trim() === '') return null
  const trimmed = dateStr.trim()
  const parts = trimmed.split('/')
  if (parts.length === 3) {
    const [year, month, day] = parts
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`
  }
  return trimmed
}

function splitSeriesTitle(rawTitle: string): { title: string, seriesTitle: string | null } {
  const match = rawTitle.match(/^(.*)\s\(([^()]*#[^()]*)\)\s*$/)
  if (!match) return { title: rawTitle, seriesTitle: null }
  return { title: match[1]!.trim(), seriesTitle: match[2]!.trim() }
}

function splitList(raw: string | undefined): string[] {
  if (!raw || raw.trim() === '') return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

function clampRating(n: number | null): number {
  if (!n || n < 0) return 0
  return Math.min(5, n)
}

function rowToBook(row: GoodreadsRow): Book {
  const rawTitle = row.Title!.trim()
  const { title, seriesTitle } = splitSeriesTitle(rawTitle)
  const exclusiveShelf = row['Exclusive Shelf']?.trim() || 'to-read'
  const bookshelves = splitList(row.Bookshelves)
  const tags = bookshelves.filter(s => s !== exclusiveShelf)

  return {
    id: row['Book Id']!.trim(),
    title,
    seriesTitle,
    author: row.Author?.trim() || null,
    additionalAuthors: splitList(row['Additional Authors']),
    isbn10: cleanIsbn(row.ISBN),
    isbn13: cleanIsbn(row.ISBN13),
    pages: parseIntOrNull(row['Number of Pages']),
    binding: row.Binding?.trim() || null,
    yearPublished: parseIntOrNull(row['Year Published']),
    originalYear: parseIntOrNull(row['Original Publication Year']),
    rating: clampRating(parseIntOrNull(row['My Rating'])),
    status: exclusiveShelf,
    tags,
    dateRead: parseGoodreadsDate(row['Date Read']),
    dateAdded: parseGoodreadsDate(row['Date Added']),
    review: row['My Review']?.trim() || null,
    reviewHasSpoiler: Boolean(row.Spoiler?.trim()),
    readCount: parseIntOrNull(row['Read Count']) ?? 0,
  }
}

/**
 * Parses a Library export (already read as text) into normalized Books: a
 * Goodreads Library export CSV, or reading-tracker JSON (`reading list --json`).
 * Pure: no DOM or Node APIs, safe to run in the browser or in tests.
 *
 * @throws {NotAGoodreadsExportError} when a CSV misses required headers.
 * @throws {NotAReadingTrackerExportError} when JSON isn't a reading-tracker export.
 */
export function importLibrary(csvText: string): ImportLibraryResult {
  if (looksLikeJson(csvText)) return importReadingTracker(csvText)
  // Strip a leading UTF-8 BOM, which some Goodreads exports include.
  const text = csvText.replace(/^\uFEFF/, '')

  const parsed = Papa.parse<GoodreadsRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: header => header.trim(),
  })

  const fields = parsed.meta.fields ?? []
  const missingHeaders = REQUIRED_HEADERS.filter(header => !fields.includes(header))
  if (missingHeaders.length > 0) {
    throw new NotAGoodreadsExportError(missingHeaders)
  }

  const warnings: string[] = []
  for (const error of parsed.errors) {
    warnings.push(`Row ${error.row}: ${error.message}`)
  }

  const books: Book[] = []
  for (const row of parsed.data) {
    if (!row.Title?.trim()) {
      warnings.push(`Skipped row with empty title (Book Id: ${row['Book Id']?.trim() || 'unknown'})`)
      continue
    }
    if (!row['Book Id']?.trim()) {
      warnings.push(`Skipped row with empty Book Id (Title: ${row.Title.trim()})`)
      continue
    }

    try {
      books.push(rowToBook(row))
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      warnings.push(`Failed to parse "${row.Title}": ${message}`)
    }
  }

  return { books, warnings }
}
