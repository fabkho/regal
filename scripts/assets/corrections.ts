// Corrections to the reading tracker's history before the asset build: one
// entry per work (Fable keeps a row per edition), Goodreads' read dates and
// editions for the Books in both, and the owner's private overrides
// (~/.reading-tracker/regal-overrides.json, see docs/overrides.example.json).
// Pure: the build reads the files and passes their contents in.
import type { ReadingTrackerBook } from '../../shared/library/importReadingTracker'
import { isbnLanguage } from '../../server/utils/descriptions'
import type { GoodreadsMatch, GoodreadsRead, MatchTarget } from './goodreads'
import { matchGoodreads, normalize, sameAuthor, seriesKeys, toIsbn13, workTitles } from './goodreads'

/** Language a Book was read in; picks the cover edition and the Apple storefront. */
export type ReadLanguage = 'en' | 'de'

/** Per-Book corrections, keyed by tracker id (or an unambiguous id prefix of 8+ characters). */
export interface BookOverride {
  /** Leave the Book out (an omnibus next to its volumes, a collection next to the story). */
  skip?: boolean
  /** Same work as that Book: leave this row out, its rating/review/pages fill gaps there. */
  mergeInto?: string
  /** Finish date, YYYY-MM-DD (beats Goodreads). */
  dateRead?: string
  /** Start date, YYYY-MM-DD. */
  dateStarted?: string
  /** The edition read (beats Goodreads); drops the tracker's cover of its own edition. */
  isbn13?: string
  title?: string
  author?: string
  /** Read in this language (default 'en'): Goodreads editions and covers follow it. */
  lang?: ReadLanguage
  /** A cover image to use before any lookup. */
  coverUrl?: string
  /** Titles or ISBNs this Book has in the Goodreads files when the matcher can't tell ("Der Kleine Zauberer und der Kelch"). */
  goodreads?: string[]
  /** Free text for the owner; ignored. */
  note?: string
}

export interface Overrides {
  /** Goodreads Library exports, most trusted first. */
  goodreads?: string[]
  books?: Record<string, BookOverride>
}

/** A tracker entry after corrections, with the language it was read in. */
export type CorrectedBook = ReadingTrackerBook & {
  language: ReadLanguage
  /** coverUrl is the owner's pick (overrides), not the tracker's. */
  coverPinned?: boolean
}

export interface CorrectionReport {
  /** Latest Goodreads read date: the tracker's history counts from here on. */
  cutoff: string | null
  dropped: { id: string, title: string, reason: string }[]
  dateChanges: { id: string, title: string, from: string | null, to: string, source: string }[]
  editionChanges: { id: string, title: string, from: string | null, to: string, language: ReadLanguage, source: string, newTitle?: string }[]
  matched: { id: string, title: string, rows: string[] }[]
  /** Goodreads read rows no tracker Book took (not added to the Library). */
  unmatchedGoodreads: { file: string, title: string, author: string | null, dateRead: string | null }[]
  /** Tracker Books from before the cutoff (or undated) Goodreads doesn't have. */
  unmatchedTracker: { id: string, title: string, dateRead: string | null }[]
  /** A later volume of a series read before an earlier one. */
  contradictions: string[]
  warnings: string[]
}

const dateOf = (book: ReadingTrackerBook) => book.session?.finishedAt?.slice(0, 10) ?? null
const toTimestamp = (date: string) => `${date}T00:00:00.000Z`
const realIsbn = (book: ReadingTrackerBook) => toIsbn13(book.isbn13) ?? toIsbn13(book.isbn)
const surname = (name: string | null) => normalize(name ?? '').split(' ').at(-1) ?? ''
const GERMAN_WORDS = /\b(?:und|der|die|das|des|dem|von)\b/i
const NOT_AN_EDITION = /box(?:ed)? set|books set|cassette|h[öo]rbuch|audio|mp3|\bcds?\b/i

/** Language of a Goodreads row's edition: by ISBN, else by German function words in the title. */
export function rowLanguage(row: Pick<GoodreadsRead, 'isbn13' | 'isbn10' | 'title'>): string | null {
  const isbn = toIsbn13(row.isbn13) ?? toIsbn13(row.isbn10)
  return isbnLanguage(isbn) ?? (GERMAN_WORDS.test(row.title) ? 'de' : null)
}

function session(book: ReadingTrackerBook): NonNullable<ReadingTrackerBook['session']> {
  book.session ??= { startedAt: null, finishedAt: null, rating: null, review: null }
  return book.session
}

/** Copies what `into` lacks (rating, review, pages, blurb, dates) from a dropped edition of the same work. */
function fillGaps(into: ReadingTrackerBook, from: ReadingTrackerBook) {
  const target = session(into)
  target.rating ??= from.session?.rating ?? null
  target.review ??= from.session?.review ?? null
  if (!target.finishedAt && from.session?.finishedAt) {
    target.finishedAt = from.session.finishedAt
    target.startedAt ??= from.session.startedAt
  }
  into.pageCount ??= from.pageCount
  into.description ??= from.description
  into.originalPublicationYear ??= from.originalPublicationYear
}

/** Which of two editions of a work stays: the dated one, then a real ISBN, a rating, the earlier entry. */
function better(a: ReadingTrackerBook, b: ReadingTrackerBook): ReadingTrackerBook {
  const score = (book: ReadingTrackerBook) => [dateOf(book) ? 1 : 0, realIsbn(book) ? 1 : 0, book.session?.rating ? 1 : 0]
  const [sa, sb] = [score(a), score(b)]
  for (let index = 0; index < sa.length; index++) {
    if (sa[index] !== sb[index]) return sa[index]! > sb[index]! ? a : b
  }
  return (a.createdAt ?? '') <= (b.createdAt ?? '') ? a : b
}

/** Resolves override keys (full ids or 8+ character prefixes) to tracker ids. */
function resolveIds(books: ReadingTrackerBook[], overrides: Overrides, warnings: string[]): Map<string, BookOverride> {
  const resolved = new Map<string, BookOverride>()
  const find = (key: string) => {
    const hits = books.filter(book => book.id === key || (key.length >= 8 && book.id.startsWith(key)))
    if (hits.length !== 1) warnings.push(`Override "${key}" matches ${hits.length} tracker Books; ignored.`)
    return hits.length === 1 ? hits[0]!.id : null
  }
  for (const [key, override] of Object.entries(overrides.books ?? {})) {
    const id = find(key)
    if (!id) continue
    const mergeInto = override.mergeInto ? find(override.mergeInto) : undefined
    resolved.set(id, { ...override, mergeInto: mergeInto ?? undefined })
  }
  return resolved
}

/** The Goodreads row whose date counts: most trusted file first, the read language's edition first within a file. */
function dateRow(matches: GoodreadsMatch[], language: ReadLanguage): GoodreadsMatch | null {
  const strength = (match: GoodreadsMatch) => ['isbn', 'alias', 'title', 'series', 'typo', 'title-only'].indexOf(match.how)
  const languageRank = (match: GoodreadsMatch) => {
    const rowLang = rowLanguage(match.row)
    return rowLang === language ? 0 : rowLang === null ? 1 : 2
  }
  return matches
    .filter(match => match.row.dateRead)
    .sort((a, b) => a.row.file - b.row.file || languageRank(a) - languageRank(b) || strength(a) - strength(b))[0] ?? null
}

/** The Goodreads edition in the read language, by the Book's own author (not a study guide, set or audiobook). */
function editionRow(book: ReadingTrackerBook, matches: GoodreadsMatch[], language: ReadLanguage): GoodreadsRead | null {
  const target = { author: book.author, additionalAuthors: (book.additionalAuthors ?? '').split(',').map(name => name.trim()).filter(Boolean) }
  // An alias names the work, not necessarily this edition: the Book's own title and ISBN come first.
  const strength = (match: GoodreadsMatch) => ['isbn', 'title', 'series', 'typo', 'alias', 'title-only'].indexOf(match.how)
  return matches
    .filter(({ row }) => (toIsbn13(row.isbn13) ?? toIsbn13(row.isbn10))
      && rowLanguage(row) === language
      && sameAuthor(target, row)
      && !NOT_AN_EDITION.test(`${row.title} ${row.binding ?? ''}`))
    .sort((a, b) => a.row.file - b.row.file || strength(a) - strength(b))[0]?.row ?? null
}

/** Series volumes read out of order, from series numbers in the tracker's and Goodreads' titles. */
function seriesContradictions(books: CorrectedBook[], matches: Map<string, GoodreadsMatch[]>): string[] {
  const volumes = new Map<string, { title: string, number: number, date: string }[]>()
  for (const book of books) {
    const date = dateOf(book)
    if (!date) continue
    const keys = new Set([book.title, ...(matches.get(book.id) ?? []).map(match => match.row.title)].flatMap(seriesKeys))
    for (const key of keys) {
      const [name, number] = key.split('#')
      if (!number || number.includes('-')) continue
      const list = volumes.get(name!) ?? []
      if (!list.some(volume => volume.title === book.title)) list.push({ title: book.title, number: Number(number), date })
      volumes.set(name!, list)
    }
  }
  const found: string[] = []
  for (const [name, list] of volumes) {
    for (const later of list) {
      const earlier = list.filter(volume => volume.number < later.number && volume.date > later.date)
      for (const volume of earlier) found.push(`${name}: #${later.number} "${later.title}" ${later.date} before #${volume.number} "${volume.title}" ${volume.date}`)
    }
  }
  return found
}

/**
 * Applies, in order: skips and merges from the overrides, one entry per work
 * (same title, same author), Goodreads' read dates and read-language editions,
 * then the explicit override fields. Returns the corrected entries and a report.
 */
export function applyCorrections(raw: ReadingTrackerBook[], options: { overrides?: Overrides, goodreads?: GoodreadsRead[] } = {}): { books: CorrectedBook[], report: CorrectionReport } {
  const warnings: string[] = []
  const rows = options.goodreads ?? []
  const report: CorrectionReport = {
    cutoff: rows.reduce<string | null>((latest, row) => (row.dateRead && (!latest || row.dateRead > latest) ? row.dateRead : latest), null),
    dropped: [],
    dateChanges: [],
    editionChanges: [],
    matched: [],
    unmatchedGoodreads: [],
    unmatchedTracker: [],
    contradictions: [],
    warnings,
  }
  let books: (ReadingTrackerBook & { coverPinned?: boolean })[] = raw.map(book => structuredClone(book))
  const overrides = resolveIds(books, options.overrides ?? {}, warnings)
  const byId = new Map(books.map(book => [book.id, book]))

  // 1. Skips and merges the owner decided.
  const drop = new Set<string>()
  for (const [id, override] of overrides) {
    const book = byId.get(id)!
    if (override.mergeInto && override.mergeInto !== id) {
      fillGaps(byId.get(override.mergeInto)!, book)
      drop.add(id)
      report.dropped.push({ id, title: book.title, reason: `same work as ${override.mergeInto} "${byId.get(override.mergeInto)!.title}" (override)` })
    }
    else if (override.skip) {
      drop.add(id)
      report.dropped.push({ id, title: book.title, reason: override.note ? `skipped: ${override.note}` : 'skipped (override)' })
    }
  }
  books = books.filter(book => !drop.has(book.id))

  // 2. One entry per work: same shelf, same title, same author surname.
  const works = new Map<string, ReadingTrackerBook>()
  for (const book of books) {
    const key = `${book.shelf}|${workTitles(book.title)[0] ?? book.title}|${surname(book.author)}`
    const kept = works.get(key)
    if (!kept) {
      works.set(key, book)
      continue
    }
    const keep = better(kept, book)
    const gone = keep === kept ? book : kept
    fillGaps(keep, gone)
    works.set(key, keep)
    drop.add(gone.id)
    report.dropped.push({ id: gone.id, title: gone.title, reason: `edition of ${keep.id} "${keep.title}" (same title and author)` })
  }
  books = books.filter(book => !drop.has(book.id))

  // 3. Goodreads: read dates, and the edition in the language the Book was read in.
  const languageOf = (book: ReadingTrackerBook): ReadLanguage => overrides.get(book.id)?.lang ?? 'en'
  const targets: MatchTarget[] = books.map(book => ({
    id: book.id,
    title: book.title,
    author: book.author,
    additionalAuthors: (book.additionalAuthors ?? '').split(',').map(name => name.trim()).filter(Boolean),
    isbns: [book.isbn13, book.isbn].filter((isbn): isbn is string => Boolean(isbn)),
    aliases: overrides.get(book.id)?.goodreads ?? [],
  }))
  const matches = rows.length ? matchGoodreads(targets, rows) : new Map<string, GoodreadsMatch[]>()
  const used = new Set<GoodreadsRead>()
  for (const book of books) {
    const found = matches.get(book.id)
    const language = languageOf(book)
    if (!found) continue
    found.forEach(match => used.add(match.row))
    report.matched.push({ id: book.id, title: book.title, rows: found.map(match => `${match.row.fileLabel}: "${match.row.title}" ${match.row.dateRead ?? 'undated'} (${match.how})`) })
    const dated = dateRow(found, language)
    if (dated && dated.row.dateRead !== dateOf(book)) {
      report.dateChanges.push({ id: book.id, title: book.title, from: dateOf(book), to: dated.row.dateRead!, source: `goodreads ${dated.row.fileLabel} "${dated.row.title}" (${dated.how})` })
      session(book).finishedAt = toTimestamp(dated.row.dateRead!)
    }
    const edition = editionRow(book, found, language)
    const isbn = edition && (toIsbn13(edition.isbn13) ?? toIsbn13(edition.isbn10))
    if (edition && isbn && isbn !== realIsbn(book)) {
      const before = realIsbn(book)
      const languageChanged = (isbnLanguage(before) ?? (GERMAN_WORDS.test(book.title) ? 'de' : 'en')) !== language
      report.editionChanges.push({
        id: book.id,
        title: book.title,
        from: before,
        to: isbn,
        language,
        source: `goodreads ${edition.fileLabel} "${edition.title}"`,
        newTitle: languageChanged ? edition.title : undefined,
      })
      book.isbn13 = isbn
      book.isbn = null
      if (languageChanged) {
        // The tracker's cover and title belong to the other language's edition.
        book.title = edition.title
        book.coverUrl = null
      }
    }
  }
  // Books now titled as their Goodreads edition ("Gold Book") also own that title's other rows.
  const renamed = targets.filter(target => byId.get(target.id)!.title !== target.title)
    .map(target => ({ ...target, title: byId.get(target.id)!.title }))
  for (const [id, again] of matchGoodreads(renamed, rows.filter(row => !used.has(row)))) {
    again.forEach(match => used.add(match.row))
    report.matched.find(item => item.id === id)?.rows.push(...again.map(match => `${match.row.fileLabel}: "${match.row.title}" ${match.row.dateRead ?? 'undated'} (${match.how}, edition title)`))
  }
  report.unmatchedGoodreads = rows.filter(row => !used.has(row) && row.shelf === 'read')
    .map(row => ({ file: row.fileLabel, title: row.title, author: row.author, dateRead: row.dateRead }))

  // 4. The owner's explicit fields win over everything.
  for (const book of books) {
    const override = overrides.get(book.id)
    if (!override) continue
    if (override.dateRead && override.dateRead !== dateOf(book)) {
      report.dateChanges = report.dateChanges.filter(change => change.id !== book.id || change.source === 'override')
      const from = raw.find(entry => entry.id === book.id)!.session?.finishedAt?.slice(0, 10) ?? null
      report.dateChanges.push({ id: book.id, title: book.title, from, to: override.dateRead, source: 'override' })
      session(book).finishedAt = toTimestamp(override.dateRead)
    }
    if (override.dateStarted) session(book).startedAt = toTimestamp(override.dateStarted)
    if (override.isbn13 && override.isbn13 !== realIsbn(book)) {
      report.editionChanges = report.editionChanges.filter(change => change.id !== book.id)
      const from = realIsbn(raw.find(entry => entry.id === book.id)!)
      report.editionChanges.push({ id: book.id, title: book.title, from, to: override.isbn13, language: languageOf(book), source: 'override', newTitle: override.title })
      book.isbn13 = override.isbn13
      book.isbn = null
      book.coverUrl = null
    }
    if (override.title) book.title = override.title
    if (override.author) book.author = override.author
    if (override.coverUrl) {
      book.coverUrl = override.coverUrl
      book.coverPinned = true
    }
  }

  // Read before the cutoff (or still undated) but in no Goodreads export.
  report.unmatchedTracker = rows.length
    ? books.filter(book => book.shelf === 'read' && !matches.has(book.id) && (!dateOf(book) || dateOf(book)! <= report.cutoff!))
        .map(book => ({ id: book.id, title: book.title, dateRead: dateOf(book) }))
    : []

  const corrected = books.map(book => ({ ...book, language: languageOf(book) }))
  for (const book of corrected) {
    const editionLanguage = isbnLanguage(realIsbn(book))
    if (editionLanguage && editionLanguage !== book.language) warnings.push(`"${book.title}" was read in ${book.language} but its edition (${realIsbn(book)}) is ${editionLanguage}; set isbn13 in the overrides.`)
  }
  report.contradictions = seriesContradictions(corrected, matches)
  return { books: corrected, report }
}

/** The report as console lines. */
export function formatReport(report: CorrectionReport): string[] {
  const lines = [`Goodreads cutoff: ${report.cutoff ?? '—'}`]
  const section = (title: string, items: string[]) => {
    if (!items.length) return
    lines.push('', `${title} (${items.length}):`, ...items.map(item => `  ${item}`))
  }
  section('Dropped (one entry per work)', report.dropped.map(item => `${item.title} [${item.id.slice(0, 8)}]: ${item.reason}`))
  section('Date changes', report.dateChanges.map(item => `${item.title}: ${item.from ?? 'undated'} → ${item.to} (${item.source})`))
  section('Edition changes', report.editionChanges.map(item => `${item.title}: ${item.from ?? '—'} → ${item.to} [${item.language}]${item.newTitle ? ` as "${item.newTitle}"` : ''} (${item.source})`))
  section('Goodreads reads not in the tracker (not added)', report.unmatchedGoodreads.map(item => `${item.file}: "${item.title}" by ${item.author ?? '?'}, ${item.dateRead ?? 'undated'}`))
  section('Tracker Books before the cutoff without a Goodreads row', report.unmatchedTracker.map(item => `${item.title} [${item.id.slice(0, 8)}] ${item.dateRead ?? 'undated'}`))
  section('Series read out of order', report.contradictions)
  section('Warnings', report.warnings)
  lines.push('', `Matched with Goodreads: ${report.matched.length} Books.`)
  return lines
}
