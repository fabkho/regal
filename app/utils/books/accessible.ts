// What an assistive technology reads of a Book in the accessible Book list
// (components/books/AccessibleList.vue): the Books are drawn in 3D, this is the
// same Book as one phrase. Pure, so it's unit-testable.
import type { Book } from '../../../shared/types/book'
import { ratingStarsText } from './rating'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "March 2025" from an ISO day (2025-03-14); null when there is none or it can't be read. */
export function monthYear(date: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})/.exec(date ?? '')
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined
  return match && month ? `${month} ${match[1]}` : null
}

/**
 * The parts of a Book's phrase: title, author, when it was finished (or that
 * it is being read now) and its rating in words. Missing parts are left out.
 */
export function bookListParts(book: Pick<Book, 'title' | 'author' | 'dateRead' | 'status' | 'rating'>): string[] {
  const finished = monthYear(book.dateRead)
  return [
    book.title,
    book.author,
    finished ? `finished ${finished}` : book.status === 'currently-reading' ? 'reading now' : null,
    book.rating ? ratingStarsText(book.rating) : null,
  ].filter((part): part is string => !!part)
}

/** One Book as the list's button text: "Dune, Frank Herbert, finished March 2025, 4 of 5 stars". */
export function bookListLabel(book: Pick<Book, 'title' | 'author' | 'dateRead' | 'status' | 'rating'>): string {
  return bookListParts(book).join(', ')
}
