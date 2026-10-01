// Stack view settings: how the pile is ordered and which Books it shows.
// Pure; the composable keeps them in the URL (?sort=rating&year=2026&min=4).
import type { Book } from '#shared/types/book'
import { sortForShelves } from '../bookcase/layout'

export type StackSort = 'date' | 'rating' | 'author' | 'title'

export interface StackView {
  sort: StackSort
  /** Year read, or null for all years. */
  year: number | null
  /** Minimum rating (0 = all, unrated included). */
  minRating: number
}

export const DEFAULT_STACK_VIEW: StackView = { sort: 'date', year: null, minRating: 0 }
export const STACK_SORTS: { value: StackSort, label: string }[] = [
  { value: 'date', label: 'Date read' },
  { value: 'rating', label: 'Rating' },
  { value: 'author', label: 'Author' },
  { value: 'title', label: 'Title' },
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
