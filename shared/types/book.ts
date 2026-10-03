/**
 * Normalized Book: a Regal library file's Book with defaults filled in
 * (libraryBookToBook); the bridge converter also reads reading-tracker exports into it.
 * See CONTEXT.md for the domain glossary.
 */
export interface Book {
  /** Goodreads Book Id, or the reading tracker's id */
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
  /** 0 = unrated, else 1–5; Goodreads whole stars, Fable quarter stars (e.g. 4.25) */
  rating: number
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
  /** The source's own blurb (Fable), used before the description resolver */
  description?: string | null
  /** The source's own Cover URL (the converter's tracker Cover; the front chain's own-cover candidate) */
  coverUrl?: string | null
}
