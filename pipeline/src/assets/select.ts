// Which Books a run covers: `--limit n` takes the n most recently read Books
// (then the most recently added), `--limit all` (the default) every Book.
// `selectBooks` is the older shelf-wise variant: the latest N finished Books
// of a shelf; Books without a finish date only with `all`, after the dated ones.

/** The fields the order looks at; a Regal Book and a library file Book both have them. */
export interface Selectable {
  title: string
  status: string
  dateRead?: string | null
  dateAdded?: string | null
}

/** `--limit`: a positive count, or 'all' (also 0) for the whole shelf. */
export function parseLimit(value: string | undefined): number {
  if (!value || value === 'all' || value === '0') return Infinity
  const limit = Number(value)
  if (!Number.isInteger(limit) || limit < 0) throw new Error(`--limit must be a positive number or "all", got "${value}"`)
  return limit
}

const newestFirst = (a: string | null | undefined, b: string | null | undefined) => (a === b || (!a && !b) ? 0 : !a ? 1 : !b ? -1 : a < b ? 1 : -1)
const byRecency = (a: Selectable, b: Selectable) => newestFirst(a.dateRead, b.dateRead) || newestFirst(a.dateAdded, b.dateAdded) || a.title.localeCompare(b.title)

export function selectBooks<T extends Selectable>(books: T[], shelf: string, limit: number): T[] {
  return books.filter(book => book.status === shelf && (book.dateRead || limit === Infinity)).sort(byRecency).slice(0, limit)
}

/** Every Book, most recently read first (undated ones last), at most `limit`. */
export function latestBooks<T extends Selectable>(books: T[], limit: number): T[] {
  return [...books].sort(byRecency).slice(0, limit)
}
