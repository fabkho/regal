import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { importLibrary, NotAGoodreadsExportError } from '../../shared/library/importLibrary'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(__dirname, '..', 'fixtures')

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8')
}

describe('importLibrary', () => {
  it('parses the main fixture into Books, skipping unparseable rows with warnings', () => {
    const csv = readFixture('goodreads-export.csv')
    const { books, warnings } = importLibrary(csv)

    // 7 data rows, 2 skipped (empty title, empty Book Id)
    expect(books).toHaveLength(5)
    expect(warnings.some(w => w.includes('empty title'))).toBe(true)
    expect(warnings.some(w => w.includes('empty Book Id'))).toBe(true)
  })

  it('unwraps ="..." ISBN wrapping', () => {
    const { books } = importLibrary(readFixture('goodreads-export.csv'))
    const gatsby = books.find(b => b.title === 'The Great Gatsby')!
    expect(gatsby.isbn10).toBe('0743273567')
    expect(gatsby.isbn13).toBe('9780743273565')
  })

  it('leaves ISBN null when missing', () => {
    const { books } = importLibrary(readFixture('goodreads-export.csv'))
    const anna = books.find(b => b.title === 'Anna Karenina')!
    expect(anna.isbn10).toBeNull()
    expect(anna.isbn13).toBeNull()
    expect(anna.pages).toBeNull()
  })

  it('parses YYYY/MM/DD dates to ISO', () => {
    const { books } = importLibrary(readFixture('goodreads-export.csv'))
    const gatsby = books.find(b => b.title === 'The Great Gatsby')!
    expect(gatsby.dateRead).toBe('2024-01-15')
    expect(gatsby.dateAdded).toBe('2023-12-01')
  })

  it('splits a series suffix out of the title', () => {
    const { books } = importLibrary(readFixture('goodreads-export.csv'))
    const morningStar = books.find(b => b.title === 'Morning Star')!
    expect(morningStar).toBeDefined()
    expect(morningStar.seriesTitle).toBe('Red Rising, #3')
  })

  it('imports a custom exclusive shelf (wishlist) as the status', () => {
    const { books } = importLibrary(readFixture('goodreads-export.csv'))
    const rare = books.find(b => b.title === 'Some Rare Import')!
    expect(rare.status).toBe('wishlist')
  })

  it('handles multi-line quoted reviews containing commas', () => {
    const { books } = importLibrary(readFixture('goodreads-export.csv'))
    const quoted = books.find(b => b.title === 'Quoted Review Book')!
    expect(quoted.review).toContain('I loved this, it was great.')
    expect(quoted.review).toContain('Would read again, no doubt.')
  })

  it('never includes Private Notes in the output', () => {
    const csv = readFixture('goodreads-export.csv')
    const { books } = importLibrary(csv)
    const json = JSON.stringify(books)
    expect(json).not.toContain('Bought as a gift')
    expect(books.every(b => !('privateNotes' in b))).toBe(true)
  })

  it('skips a row with an empty title and warns', () => {
    const { books, warnings } = importLibrary(readFixture('goodreads-export.csv'))
    expect(books.find(b => b.author === 'No Title')).toBeUndefined()
    expect(warnings.some(w => w.includes('empty title'))).toBe(true)
  })

  it('works when optional columns like Average Rating are absent', () => {
    const { books, warnings } = importLibrary(readFixture('no-average-rating.csv'))
    expect(warnings).toHaveLength(0)
    expect(books).toHaveLength(1)
    expect(books[0]!.title).toBe('Newer Export Book')
    expect(books[0]!.rating).toBe(4)
  })

  it('handles a leading UTF-8 BOM', () => {
    const { books, warnings } = importLibrary(readFixture('bom.csv'))
    expect(warnings).toHaveLength(0)
    expect(books).toHaveLength(1)
    expect(books[0]!.title).toBe('BOM Book')
  })

  it('throws NotAGoodreadsExportError when required headers are missing', () => {
    const csv = readFixture('not-goodreads.csv')
    expect(() => importLibrary(csv)).toThrow(NotAGoodreadsExportError)
  })

  it('reports which headers are missing', () => {
    const csv = readFixture('not-goodreads.csv')
    try {
      importLibrary(csv)
      expect.unreachable()
    }
    catch (error) {
      expect(error).toBeInstanceOf(NotAGoodreadsExportError)
      const err = error as NotAGoodreadsExportError
      expect(err.missingHeaders).toContain('Book Id')
      expect(err.missingHeaders).toContain('Title')
      expect(err.missingHeaders).toContain('Author')
      expect(err.missingHeaders).toContain('Exclusive Shelf')
    }
  })

  it('handles an empty CSV (header only)', () => {
    const csv = 'Book Id,Title,Author,Exclusive Shelf\n'
    const { books, warnings } = importLibrary(csv)
    expect(books).toHaveLength(0)
    expect(warnings).toHaveLength(0)
  })

  it('defaults unknown pages, keeps binding and status', () => {
    const { books } = importLibrary(readFixture('goodreads-export.csv'))
    const anna = books.find(b => b.title === 'Anna Karenina')!
    expect(anna.status).toBe('to-read')
    expect(anna.binding).toBe('Paperback')
  })
})
