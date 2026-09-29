import type { Book } from '#shared/types/book'

export type CoverBook = Pick<Book, 'isbn13' | 'isbn10' | 'title' | 'author'>

/** Same-origin Cover resolver URL for a Book (see server/api/cover.get.ts). */
export function coverUrl(book: CoverBook, size: 'M' | 'L' = 'L'): string {
  const params = new URLSearchParams()
  if (book.isbn13) params.set('isbn13', book.isbn13)
  if (book.isbn10) params.set('isbn10', book.isbn10)
  if (book.title) params.set('title', book.title)
  if (book.author) params.set('author', book.author)
  params.set('size', size)
  return `/api/cover?${params}`
}
