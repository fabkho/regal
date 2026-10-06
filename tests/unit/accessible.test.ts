import { describe, expect, it } from 'vitest'
import { bookListLabel, bookListParts, monthYear } from '../../app/utils/books/accessible'
import { listIndex, trapIndex } from '../../app/utils/a11y/focus'
import { ratingStarsText } from '../../app/utils/books/rating'

const BOOK = { title: 'Dune', author: 'Frank Herbert', dateRead: '2025-03-14', status: 'read', rating: 4 }

describe('ratingStarsText (the rating in words)', () => {
  it('reads like the stars would', () => {
    expect(ratingStarsText(4)).toBe('4 of 5 stars')
    expect(ratingStarsText(4.25)).toBe('4.25 of 5 stars')
    expect(ratingStarsText(3.999)).toBe('4 of 5 stars')
  })
})

describe('monthYear', () => {
  it('writes the month and the year of an ISO day', () => {
    expect(monthYear('2025-03-14')).toBe('March 2025')
    expect(monthYear('2024-12-01')).toBe('December 2024')
    expect(monthYear('2024-01-31')).toBe('January 2024')
  })

  it('is null for no date or one that can\'t be read', () => {
    expect(monthYear(null)).toBeNull()
    expect(monthYear(undefined)).toBeNull()
    expect(monthYear('')).toBeNull()
    expect(monthYear('March')).toBeNull()
    expect(monthYear('2025-13-01')).toBeNull()
  })
})

describe('bookListLabel (what the accessible Book list reads)', () => {
  it('is title, author, month finished and the rating in words', () => {
    expect(bookListLabel(BOOK)).toBe('Dune, Frank Herbert, finished March 2025, 4 of 5 stars')
  })

  it('leaves out what a Book lacks', () => {
    expect(bookListLabel({ ...BOOK, author: null, rating: 0 })).toBe('Dune, finished March 2025')
    expect(bookListLabel({ ...BOOK, dateRead: null, rating: 4.5 })).toBe('Dune, Frank Herbert, 4.5 of 5 stars')
  })

  it('says a Book is being read now when it has no finish date', () => {
    expect(bookListParts({ ...BOOK, dateRead: null, status: 'currently-reading', rating: 0 })).toEqual(['Dune', 'Frank Herbert', 'reading now'])
    // A finish date wins.
    expect(bookListLabel({ ...BOOK, status: 'currently-reading' })).toContain('finished March 2025')
  })
})

describe('trapIndex (Tab in a dialog)', () => {
  it('moves on and wraps at both ends', () => {
    expect(trapIndex(3, 0, false)).toBe(1)
    expect(trapIndex(3, 2, false)).toBe(0)
    expect(trapIndex(3, 0, true)).toBe(2)
    expect(trapIndex(3, 2, true)).toBe(1)
  })

  it('enters at the first (Tab) or the last (Shift+Tab) from outside', () => {
    expect(trapIndex(3, -1, false)).toBe(0)
    expect(trapIndex(3, -1, true)).toBe(2)
  })

  it('has nowhere to go without stops', () => {
    expect(trapIndex(0, -1, false)).toBe(-1)
  })
})

describe('listIndex (the arrow keys in the Book list)', () => {
  it('steps and stops at the ends', () => {
    expect(listIndex(5, 2, 'ArrowDown')).toBe(3)
    expect(listIndex(5, 2, 'ArrowRight')).toBe(3)
    expect(listIndex(5, 2, 'ArrowUp')).toBe(1)
    expect(listIndex(5, 2, 'ArrowLeft')).toBe(1)
    expect(listIndex(5, 4, 'ArrowDown')).toBe(4)
    expect(listIndex(5, 0, 'ArrowUp')).toBe(0)
  })

  it('goes to the ends with Home and End', () => {
    expect(listIndex(5, 2, 'Home')).toBe(0)
    expect(listIndex(5, 2, 'End')).toBe(4)
  })

  it('leaves other keys alone', () => {
    expect(listIndex(5, 2, 'Enter')).toBeNull()
    expect(listIndex(5, 2, 'a')).toBeNull()
    expect(listIndex(0, 0, 'ArrowDown')).toBeNull()
  })
})
