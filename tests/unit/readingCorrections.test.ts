import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ReadingTrackerBook } from '../../shared/library/importReadingTracker'
import { applyCorrections, formatReport, rowLanguage } from '../../scripts/assets/corrections'
import type { Overrides } from '../../scripts/assets/corrections'
import { editDistance, matchGoodreads, parseGoodreads, seriesKeys, toIsbn13, workTitles } from '../../scripts/assets/goodreads'
import { isPlaceholder, storefronts, titleScore } from '../../scripts/assets/front'

// Synthetic Goodreads exports and tracker entries only (never a real export).
const fixture = (name: string) => readFileSync(new URL(`../fixtures/goodreads-merge/${name}`, import.meta.url), 'utf8')
const goodreads = [...parseGoodreads(fixture('primary.csv'), 0, 'primary'), ...parseGoodreads(fixture('secondary.csv'), 1, 'secondary')]

const entry = (id: string, title: string, author: string, overrides: Partial<ReadingTrackerBook> & { finished?: string | null } = {}): ReadingTrackerBook => {
  const { finished = null, ...rest } = overrides
  return {
    id,
    title,
    author,
    additionalAuthors: null,
    shelf: 'read',
    isbn: null,
    isbn13: null,
    goodreadsId: null,
    description: null,
    coverUrl: `https://cdn.example.com/${id}.jpg`,
    pageCount: 300,
    yearPublished: null,
    originalPublicationYear: null,
    binding: null,
    format: 'physical',
    createdAt: '2026-03-28 00:00:00',
    session: { startedAt: null, finishedAt: finished ? `${finished}T00:00:00.000Z` : null, rating: 4, review: null },
    ...rest,
  }
}

const tracker: ReadingTrackerBook[] = [
  entry('gold-0001', 'Im Haus der Glut (Ember, #2)', 'Ada Example', { isbn13: '9783000000002', finished: '2023-10-03' }),
  entry('rising-0001', 'Ember Rising', 'Ada Example', { isbn13: '9781000000001', finished: '2023-09-26' }),
  entry('clock-a-0001', 'The Clock Machine', 'Hal Writer', { isbn13: '9781111111111', finished: '2023-08-17', createdAt: '2026-04-01 00:00:00' }),
  entry('clock-b-0001', 'The Clock Machine', 'Hal  Writer', { isbn13: '9781222222222', createdAt: '2026-03-01 00:00:00', session: { startedAt: null, finishedAt: null, rating: null, review: 'Loved it' } }),
  entry('night-0001', 'Nachtweg', 'Rick Alias', { isbn13: 'xYzNotAnIsbn', finished: '2023-08-14' }),
  entry('night-en-0001', 'The Night Road', 'Rick Alias', { isbn13: '9781333333333' }),
  entry('wizard-4-0001', 'The Little Wizard and the Cup (Wizard, #4)', 'A. B. Author', { finished: '2025-05-09' }),
  entry('wizard-1-0001', 'The Little Wizard and the Stone', 'A. B. Author', { finished: '2023-12-01' }),
  entry('harbor-0001', 'Silent Harbor', 'Mia Sample', { finished: '2023-12-25' }),
  entry('pair-0001', 'Shadow Pair', 'Gene Sample', { isbn13: '9781444444444', finished: '2025-06-19' }),
  entry('late-0001', 'After the Cutoff', 'Zed Other', { finished: '2026-01-01' }),
  entry('early-0001', 'Before Goodreads', 'Zed Other', { finished: '2023-01-01' }),
  entry('placed-0001', 'Placed Book', 'Mia Sample', { isbn13: '9781555555555' }),
]

const overrides: Overrides = {
  books: {
    'night-0001': { lang: 'de', title: 'Nachtweg' },
    'night-en': { mergeInto: 'night-0001' },
    'wizard-4-0001': { lang: 'de', isbn13: '9783000000099', title: 'Der Kleine Zauberer und der Kelch', goodreads: ['Der Kleine Zauberer und der Kelch'] },
    'wizard-1-0001': { lang: 'de', goodreads: ['Der Kleine Zauberer und der Stein'] },
    'pair-0001': { skip: true, note: 'omnibus' },
    'placed-0001': { dateRead: '2025-02-03', dateStarted: '2025-01-30', coverUrl: 'https://covers.example.com/placed.jpg' },
    'missing-0001': { skip: true },
  },
}

const run = () => applyCorrections(tracker, { overrides, goodreads })
const byId = (id: string) => run().books.find(book => book.id === id)
const finished = (id: string) => byId(id)?.session?.finishedAt?.slice(0, 10) ?? null

describe('Goodreads parsing and matching', () => {
  it('reads read rows from both exports, also ones without a Book Id', () => {
    expect(goodreads.filter(row => row.file === 0)).toHaveLength(9)
    expect(goodreads.filter(row => row.file === 1).map(row => row.title)).toEqual(['Silent Harbor', 'Ember Rising', 'Der Kleine Zauberer und der Stein'])
    expect(goodreads.some(row => row.title === 'Unread Thing')).toBe(false)
  })

  it('normalises titles to their works', () => {
    expect(workTitles('Nachtweg / Sturm')).toEqual(expect.arrayContaining(['nachtweg', 'sturm']))
    expect(workTitles('Der Kleine Zauberer und der Kelch von A. B. Author (Lektürehilfe)')).toContain('der kleine zauberer und der kelch')
    expect(workTitles('Lena und der Gefangene von Burgstein')).toContain('lena und der gefangene von burgstein')
    expect(workTitles('Good Words: The Nice and Accurate Notes')).toEqual(expect.arrayContaining(['good words', 'the nice and accurate notes']))
    expect(seriesKeys('Gold Book (Ember Saga, #2)')).toEqual(['ember#2'])
    expect(seriesKeys('Watch (Disc, #8; City Watch, #1)')).toEqual(['disc#8', 'city watch#1'])
    expect(editDistance('the clock maschine', 'the clock machine')).toBe(1)
  })

  it('converts ISBN-10 to ISBN-13', () => {
    expect(toIsbn13('0306406152')).toBe('9780306406157')
    expect(toIsbn13('9780306406157')).toBe('9780306406157')
    expect(toIsbn13('YlsoGKoxeN')).toBeNull()
  })

  it('tells a German edition by ISBN or by its title', () => {
    expect(rowLanguage({ isbn13: '9783000000002', isbn10: null, title: 'x' })).toBe('de')
    expect(rowLanguage({ isbn13: null, isbn10: null, title: 'Lena und die Kammer des Nebels' })).toBe('de')
    expect(rowLanguage({ isbn13: null, isbn10: null, title: 'Silent Harbor' })).toBeNull()
  })

  it('does not match volumes one apart or another author by title alone', () => {
    const rows = parseGoodreads(fixture('primary.csv'), 0, 'primary')
    const matches = matchGoodreads([
      { id: 'v3', title: 'The Sandglass, Vol. 3: Dream', author: 'Neil Sample', additionalAuthors: [], isbns: [], aliases: [] },
      { id: 'other', title: 'Silent Harbor', author: 'Someone Else', additionalAuthors: [], isbns: [], aliases: [] },
      { id: 'twin', title: 'Silent Harbor', author: 'Another One', additionalAuthors: [], isbns: [], aliases: [] },
    ], rows)
    expect(matches.size).toBe(0)
  })
})

describe('reading history corrections', () => {
  it('keeps one entry per work: overrides first, then same title and author', () => {
    const { books, report } = run()
    expect(books.map(book => book.id)).not.toContain('pair-0001')
    expect(books.map(book => book.id)).not.toContain('night-en-0001')
    expect(books.map(book => book.id)).not.toContain('clock-b-0001')
    expect(books.map(book => book.id)).toContain('clock-a-0001')
    // The dropped edition's review fills the gap on the one kept.
    expect(byId('clock-a-0001')!.session?.review).toBe('Loved it')
    expect(report.dropped.map(item => item.id).sort()).toEqual(['clock-b-0001', 'night-en-0001', 'pair-0001'])
    expect(books).toHaveLength(tracker.length - 3)
  })

  it('takes the read date from the most trusted export that has one', () => {
    // Primary beats secondary (and the tracker).
    expect(finished('rising-0001')).toBe('2025-05-02')
    // Primary has the Book undated: the secondary's date counts.
    expect(finished('harbor-0001')).toBe('2024-05-12')
    // A study guide named after the Book, matched by an alias.
    expect(finished('wizard-4-0001')).toBe('2024-03-15')
    expect(finished('wizard-1-0001')).toBe('2023-12-15')
    // Typo in the Goodreads title.
    expect(finished('clock-a-0001')).toBe('2023-08-17')
    // Books after the cutoff keep the tracker's date.
    expect(finished('late-0001')).toBe('2026-01-01')
  })

  it('switches to the Goodreads edition in the read language', () => {
    const gold = byId('gold-0001')!
    expect(gold.isbn13).toBe('9780306406157')
    expect(gold.title).toBe('Gold Book (Ember Saga, #2)')
    expect(gold.coverUrl).toBeNull()
    expect(gold.language).toBe('en')
    // A German read: the German half of a 2-in-1, title kept from the overrides.
    const night = byId('night-0001')!
    expect(night.isbn13).toBe('9783000000004')
    expect(night.title).toBe('Nachtweg')
    expect(night.language).toBe('de')
    // Same language, other edition: ISBN changes, title and cover fallback stay.
    const clock = byId('clock-a-0001')!
    expect(clock.isbn13).toBe('9781000000003')
    expect(clock.title).toBe('The Clock Machine')
    expect(clock.coverUrl).toBe('https://cdn.example.com/clock-a-0001.jpg')
  })

  it('never takes an edition from a study guide or a boxed set', () => {
    const wizard = byId('wizard-4-0001')!
    expect(wizard.isbn13).toBe('9783000000099')
    expect(wizard.title).toBe('Der Kleine Zauberer und der Kelch')
    expect(wizard.coverUrl).toBeNull()
    expect(byId('harbor-0001')!.isbn13).toBeNull()
  })

  it('applies explicit dates, start dates and pinned covers last', () => {
    const placed = byId('placed-0001')!
    expect(placed.session?.finishedAt).toBe('2025-02-03T00:00:00.000Z')
    expect(placed.session?.startedAt).toBe('2025-01-30T00:00:00.000Z')
    expect(placed.coverUrl).toBe('https://covers.example.com/placed.jpg')
    expect(placed.coverPinned).toBe(true)
  })

  it('reports changes, leftovers on both sides and series read out of order', () => {
    const { report } = run()
    expect(report.cutoff).toBe('2025-05-02')
    expect(report.dateChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'rising-0001', from: '2023-09-26', to: '2025-05-02' }),
      expect.objectContaining({ id: 'placed-0001', from: null, to: '2025-02-03', source: 'override' }),
    ]))
    expect(report.editionChanges.find(change => change.id === 'gold-0001')).toMatchObject({ from: '9783000000002', to: '9780306406157', newTitle: 'Gold Book (Ember Saga, #2)' })
    expect(report.unmatchedGoodreads.map(row => row.title)).toEqual(['Northern Lights Boxed Set (North, #1-3)', 'A Book Nobody Logged'])
    expect(report.unmatchedTracker.map(book => book.id)).toEqual(['early-0001', 'placed-0001'])
    expect(report.contradictions).toEqual([expect.stringContaining('ember: #2')])
    expect(report.warnings).toEqual([expect.stringContaining('missing-0001')])
    expect(formatReport(report).join('\n')).toContain('Ember Rising: 2023-09-26 → 2025-05-02')
  })

  it('leaves the history alone without overrides or exports', () => {
    const { books, report } = applyCorrections(tracker)
    expect(books.map(book => book.id)).toEqual(tracker.filter(book => book.id !== 'clock-b-0001').map(book => book.id))
    expect(books.every(book => book.language === 'en')).toBe(true)
    expect(report.dateChanges).toEqual([])
    // The input is not mutated.
    expect(tracker[0]!.isbn13).toBe('9783000000002')
  })
})

describe('front lookup helpers', () => {
  it('rejects Google placeholders and thumbnails', () => {
    expect(isPlaceholder(128, 184)).toBe(true)
    expect(isPlaceholder(130, 200)).toBe(true)
    expect(isPlaceholder(384, 599)).toBe(false)
  })

  it('looks German reads up in the German store', () => {
    expect(storefronts('de')).toEqual(['de'])
    expect(storefronts('en')).toEqual(['us', 'gb'])
  })

  it('matches store titles with subtitles or series on either side, not omnibus to volume', () => {
    expect(titleScore('The Light of All (The Trilogy, #3)', 'The Light of All')).toBe(2)
    expect(titleScore('Queen of Ash: A Tale', 'Queen of Ash')).toBe(2)
    expect(titleScore('Shadow & Claw: The First Half', 'Shadow & Claw')).toBe(2)
    expect(titleScore('Ember', 'The Ember Trilogy')).toBe(0)
    expect(titleScore('Dune Messiah', 'Dune')).toBe(0)
    expect(titleScore('Sandglass Volume One Deluxe', 'Sandglass Volume One')).toBe(1)
  })
})
