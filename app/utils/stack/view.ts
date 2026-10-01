// Stack view settings: how the pile is ordered and which Books it shows.
// Pure; the composable keeps them in the URL (?sort=rating&year=2026&min=4&group=month).
import type { Book } from '~~/shared/types/book'
import { sortForShelves } from '../bookcase/layout'

export type StackSort = 'date' | 'rating' | 'author' | 'title'
/** Date separators between Books: 'auto' is by year, by month when one year is shown. */
export type StackGrouping = 'auto' | 'off' | 'year' | 'month'

export interface StackView {
  sort: StackSort
  /** Year read, or null for all years. */
  year: number | null
  /** Minimum rating (0 = all, unrated included). */
  minRating: number
  /** Date separators (only when sorted by date read). */
  group: StackGrouping
}

export const DEFAULT_STACK_VIEW: StackView = { sort: 'date', year: null, minRating: 0, group: 'auto' }
export const STACK_SORTS: { value: StackSort, label: string }[] = [
  { value: 'date', label: 'Date read' },
  { value: 'rating', label: 'Rating' },
  { value: 'author', label: 'Author' },
  { value: 'title', label: 'Title' },
]
export const STACK_GROUPINGS: { value: StackGrouping, label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'year', label: 'Year' },
  { value: 'month', label: 'Month' },
  { value: 'off', label: 'Off' },
]

const surname = (author: string | null) => (author ?? '').trim().split(/\s+/).at(-1) ?? ''

/** Years with at least one Book read, newest first. */
export function readYears(books: Book[]): number[] {
  const years = new Set(books.map(book => Number(book.dateRead?.slice(0, 4))).filter(year => year > 0))
  return [...years].sort((a, b) => b - a)
}

/** The Books the Stack shows, top of the pile first. */
export function applyStackView(books: Book[], view: StackView): Book[] {
  const shown = books.filter(book =>
    (view.year === null || book.dateRead?.startsWith(String(view.year)))
    && (view.minRating === 0 || book.rating >= view.minRating),
  )
  const byDate = sortForShelves(shown)
  if (view.sort === 'date') return byDate
  const rank = new Map(byDate.map((book, index) => [book.id, index]))
  const tie = (a: Book, b: Book) => rank.get(a.id)! - rank.get(b.id)!
  const sorted = [...shown]
  if (view.sort === 'rating') sorted.sort((a, b) => b.rating - a.rating || tie(a, b))
  if (view.sort === 'author') sorted.sort((a, b) => surname(a.author).localeCompare(surname(b.author)) || tie(a, b))
  if (view.sort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title) || tie(a, b))
  return sorted
}

// --- Date separators ----------------------------------------------------------

/** A run of consecutive Books (top of the pile first) that share a separator. */
export interface StackGroup {
  key: string
  /** What the separator says: '2025', 'MAR 2026', 'UNDATED'. */
  label: string
  /** Book Ids, top of the pile first. */
  bookIds: string[]
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** The grouping in effect: none unless sorted by date read; 'auto' = month inside one year, else year. */
export function resolveGrouping(view: Pick<StackView, 'sort' | 'year' | 'group'>): 'off' | 'year' | 'month' {
  if (view.sort !== 'date') return 'off'
  if (view.group === 'auto') return view.year ? 'month' : 'year'
  return view.group
}

/** The separator a Book falls under: its year or month read; other shelves and undated reads get their own. */
export function groupOf(book: Pick<Book, 'status' | 'dateRead'>, grouping: 'year' | 'month'): { key: string, label: string } {
  if (book.status !== 'read') {
    const label = book.status === 'currently-reading' ? 'READING' : book.status.replace(/[-_]+/g, ' ').toUpperCase()
    return { key: `status:${book.status}`, label }
  }
  const year = book.dateRead?.slice(0, 4)
  if (!year || !/^\d{4}$/.test(year)) return { key: 'undated', label: 'UNDATED' }
  const month = Number(book.dateRead!.slice(5, 7))
  if (grouping === 'year' || !(month >= 1 && month <= 12)) return { key: year, label: year }
  return { key: `${year}-${String(month).padStart(2, '0')}`, label: `${MONTHS[month - 1]} ${year}` }
}

/** Consecutive runs of the shown Books (top of the pile first) under one separator; [] when grouping is off. */
export function stackGroups(books: Pick<Book, 'id' | 'status' | 'dateRead'>[], grouping: 'off' | 'year' | 'month'): StackGroup[] {
  if (grouping === 'off') return []
  const groups: StackGroup[] = []
  for (const book of books) {
    const { key, label } = groupOf(book, grouping)
    const last = groups.at(-1)
    if (last?.key === key) last.bookIds.push(book.id)
    // A key seen before (only possible in a hand-made order) gets its own run.
    else groups.push({ key: groups.some(group => group.key === key) ? `${key}#${groups.length}` : key, label, bookIds: [book.id] })
  }
  return groups
}
