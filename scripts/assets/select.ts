// Which Books an asset build covers: the latest N finished Books of a shelf,
// or the whole shelf (`--limit all`), newest first. Books without a finish
// date only come with `all`, after the dated ones (the end of the history).
import type { Book } from '../../shared/types/book'

/** `--limit`: a positive count, or 'all' (also 0) for the whole shelf. */
export function parseLimit(value: string | undefined): number {
  if (!value || value === 'all' || value === '0') return Infinity
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit < 0) throw new Error(`--limit must be a positive number or "all", got "${value}"`)
  return limit
}

const newestFirst = (a: string | null, b: string | null) => (a === b ? 0 : !a ? 1 : !b ? -1 : a < b ? 1 : -1)

export function selectBooks(books: Book[], shelf: string, limit: number): Book[] {
  const onShelf = books.filter(book => book.status === shelf && (book.dateRead || limit === Infinity))
  return onShelf
    .sort((a, b) => newestFirst(a.dateRead, b.dateRead) || newestFirst(a.dateAdded, b.dateAdded) || a.title.localeCompare(b.title))
    .slice(0, limit)
}
