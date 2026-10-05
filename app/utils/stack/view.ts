// Stack view settings: how the pile is ordered and which Books it shows.
// Pure; the composable keeps them in the URL (?sort=rating&year=2026&min=4&group=month).
import type { Book } from '#layers/regal/shared/types/book'
import { sortForShelves } from '../bookcase/layout'

export type StackSort = 'date' | 'rating' | 'author' | 'title'
/** Date separators between Books: under each year or month read, or none. */
export type StackGrouping = 'year' | 'month' | 'off'

export interface StackView {
  sort: StackSort
  /** Year read, or null for all years. */
  year: number | null
  /** Minimum rating (0 = all, unrated included). */
  minRating: number
  /** Date separators (only when sorted by date read). */
  group: StackGrouping
}

export const DEFAULT_STACK_VIEW: StackView = { sort: 'date', year: null, minRating: 0, group: 'year' }
export const STACK_SORTS: { value: StackSort, label: string }[] = [
  { value: 'date', label: 'Date read' },
  { value: 'rating', label: 'Rating' },
  { value: 'author', label: 'Author' },
  { value: 'title', label: 'Title' },
]
export const STACK_GROUPINGS: { value: StackGrouping, label: string }[] = [
  { value: 'year', label: 'Year' },
  { value: 'month', label: 'Month' },
  { value: 'off', label: 'Off' },
]

/** A grouping from a URL; anything else (an old link's 'auto', say) is the default. */
export function parseGrouping(value: unknown): StackGrouping {
  return STACK_GROUPINGS.some(option => option.value === value) ? value as StackGrouping : DEFAULT_STACK_VIEW.group
}

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

/** The grouping in effect: none unless sorted by date read. */
export function resolveGrouping(view: Pick<StackView, 'sort' | 'group'>): StackGrouping {
  return view.sort === 'date' ? view.group : 'off'
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

/** The choices in one line for a closed filter bar: "Date read · Year · All years · All ratings". */
export function viewSummary(view: StackView, hasYears: boolean): string {
  const parts = [STACK_SORTS.find(option => option.value === view.sort)!.label]
  if (view.sort === 'date') parts.push(STACK_GROUPINGS.find(option => option.value === view.group)!.label)
  if (hasYears) parts.push(view.year ? String(view.year) : 'All years')
  parts.push(view.minRating ? `★ ${view.minRating}+` : 'All ratings')
  return parts.join(' · ')
}
