/**
 * Normalized Book, produced by Library import from a Goodreads Library export.
 * See CONTEXT.md for the domain glossary.
 */
export interface Book {
  /** Goodreads Book Id */
  id: string
  title: string
  /** e.g. "Red Rising, #2" split out of a title like "Golden Son (Red Rising, #2)" */
  seriesTitle: string | null
  author: string | null
  additionalAuthors: string[]
  isbn10: string | null
  isbn13: string | null
  pages: number | null
  /** Paperback, Hardcover, Kindle Edition, ... */
  binding: string | null
  yearPublished: number | null
  originalYear: number | null
  rating: 0 | 1 | 2 | 3 | 4 | 5
  /** Reading status: read | currently-reading | to-read | custom exclusive shelf */
  status: string
  /** Non-exclusive Goodreads "Bookshelves" */
  tags: string[]
  /** ISO date (YYYY-MM-DD) */
  dateRead: string | null
  /** ISO date (YYYY-MM-DD) */
  dateAdded: string | null
  review: string | null
  reviewHasSpoiler: boolean
  readCount: number
}
