// Asset pipeline (#25): the latest N finished Books from the reading tracker
// (or a Library export file) → high-res front, clean blurb, AI back + spine,
// written as an asset set (#20) under public/book-assets/.
//
//   pnpm assets:build                     # latest 10 read Books from `reading list --json`
//   pnpm assets:build --limit 3 --dry-run # what would happen, and what it would cost
//   pnpm assets:build --limit all --no-ai --no-model  # the whole Read shelf, undated too, $0
//   pnpm assets:build --from library.json # a Library export instead of the CLI
//   pnpm assets:build --no-ai             # fronts + blurbs only (free)
//   pnpm assets:build --no-model          # no Gemini call at all: blurbs cut by rules, no quotes
//   pnpm assets:build --force             # rebuild even if a Book is done
//   pnpm assets:build --recrop            # re-cut spine/back from stored jackets (free)
//   pnpm assets:build --refresh-text      # blurb, quotes, genre, publisher only (text model, free)
//   pnpm assets:build --photos-only       # (re)process photo drop-ins, nothing else
//   pnpm assets:build --retry-fronts      # look again for fronts below 800 px (free)
//   pnpm assets:build --pile-only         # (re)make the pile copies and Spine colours only (free)
//   pnpm assets:build --overrides <file>  # corrections file (default ~/.reading-tracker/regal-overrides.json)
//   pnpm assets:build --now               # AI right away at full price instead of the Batch API
//   pnpm assets:build --wait 0            # submit the batch and exit (collect on a later run)
//
// AI images go through Gemini's Batch API by default (half price; results in
// minutes, at most 24 h). Open jobs are kept in <out>/batches.json; every run
// first collects finished jobs, then submits what's still missing, then waits
// up to --wait minutes (default 30) for the new job.
//
// Idempotent: a Book whose asset set exists (same prompt version) is skipped,
// so re-runs only cost for new Books.
//
// Photo drop-ins (special editions the owner photographed): put the faces in
//
//   public/book-assets/<key>/photo/front.(jpg|jpeg|png|webp)
//   public/book-assets/<key>/photo/spine.*
//   public/book-assets/<key>/photo/back.*
//
// where <key> is the ISBN-13 (or the Book id when it has none). The build
// converts them to <key>/<face>.webp (≤ 1600 px tall), lists them in the
// manifest's `photoFaces` and never overwrites them with AI output. With a
// photographed back AND spine, no image is generated at all; a photographed
// front alone is still used as the source for the AI back/spine.
//
// Every run that writes faces also brings the pile copies up to date (see
// pile.ts): <key>/front-pile.webp and spine-pile.webp, small enough for the
// Stack, plus the Spine colours, listed in the manifest as `pile`, `palette`
// and `spineColor`.
//
// History corrections (tracker JSON only): the private overrides file
// (--overrides, $REGAL_OVERRIDES, else ~/.reading-tracker/regal-overrides.json)
// lists Goodreads exports and per-Book fixes. Before anything else the build
// drops duplicate editions of a work, takes read dates and read-language
// editions from Goodreads, applies the fixes and prints what changed (also in
// <out>/corrections.json). See corrections.ts and docs/overrides.example.json.
// A coverUrl there, or a cover picked in the dev panel's "Override a cover"
// tool (.data/choices.json), is used as the front.
//
// A Book whose key (ISBN-13) changed keeps its blurb from the old key when the
// language is the same; its front is fetched again, as is a front of another
// language. With --limit all, asset folders of keys no longer in the Library
// (nor in a bundled dev Library) move to .data/book-assets-stale/.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import sharp from 'sharp'
import type { Book } from '../../shared/types/book'
import { importLibrary } from '../../shared/library/importLibrary'
import type { ReadingTrackerBook } from '../../shared/library/importReadingTracker'
import { isbnLanguage } from '../../server/utils/descriptions'
import type { Quote } from './backText'
import { mapGenre, resolvePublisher, resolveQuotes } from './backText'
import { resolveBlurb } from './blurb'
import { findApple, isPlaceholder, MIN_HEIGHT, resolveFront } from './front'
import type { CorrectedBook, Overrides } from './corrections'
import { applyCorrections, formatReport } from './corrections'
import type { GoodreadsRead } from './goodreads'
import { parseGoodreads } from './goodreads'
import { parseLimit, selectBooks } from './select'
import { BATCH_COST_USD, BATCH_INLINE_LIMIT, getImageBatch, IMAGE_COST_USD, IMAGE_MODEL, submitImageBatch } from './gemini'
import type { ImageRequest } from './gemini'
import type { PhotoFace } from './photos'
import { convertPhotos, photoFacesIn, photoFiles } from './photos'
import type { PileFields } from './pile'
import { updatePile } from './pile'
import { cropJacket, generateJacket, jacketRequest, layoutFor, planLayout, PROMPT_VERSION, spineRatio } from './jacket'
import type { JacketLayout, JacketResult } from './jacket'

const { values: args } = parseArgs({
  options: {
    'from': { type: 'string' },
    'shelf': { type: 'string', default: 'read' },
    'limit': { type: 'string', default: '10' },
    'out': { type: 'string', default: 'public/book-assets' },
    'dry-run': { type: 'boolean', default: false },
    'no-ai': { type: 'boolean', default: false },
    'no-model': { type: 'boolean', default: false },
    'force': { type: 'boolean', default: false },
    'recrop': { type: 'boolean', default: false },
    'refresh-text': { type: 'boolean', default: false },
    'photos-only': { type: 'boolean', default: false },
    'retry-fronts': { type: 'boolean', default: false },
    'pile-only': { type: 'boolean', default: false },
    'overrides': { type: 'string' },
    'now': { type: 'boolean', default: false },
    'wait': { type: 'string', default: '30' },
  },
})

const OUT = resolve(args.out!)
const CLI = process.env.READING_TRACKER_CLI ?? join(homedir(), 'code/reading-tracker-cli/dist/index.js')

interface ManifestEntry extends PileFields {
  front?: string
  spine?: string
  back?: string
  description?: string
  quotes?: Quote[]
  genre?: string
  publisher?: string
  photoFaces?: PhotoFace[]
  source?: 'photo' | 'ai'
  meta?: Record<string, unknown>
}

const expandHome = (path: string) => (path.startsWith('~/') ? join(homedir(), path.slice(2)) : path)

/** The private corrections file, if there is one. */
function loadOverrides(): Overrides | null {
  const path = resolve(expandHome(args.overrides ?? process.env.REGAL_OVERRIDES ?? '~/.reading-tracker/regal-overrides.json'))
  if (!existsSync(path)) {
    if (args.overrides || process.env.REGAL_OVERRIDES) throw new Error(`Overrides file not found: ${path}`)
    return null
  }
  console.log(`Overrides: ${path}`)
  return JSON.parse(readFileSync(path, 'utf8')) as Overrides
}

/** Read rows of the Goodreads exports the overrides list, most trusted first. */
function loadGoodreads(overrides: Overrides): GoodreadsRead[] {
  return (overrides.goodreads ?? []).flatMap((file, index) => {
    const path = resolve(expandHome(file))
    if (!existsSync(path)) {
      console.warn(`  Goodreads export missing: ${path}`)
      return []
    }
    const rows = parseGoodreads(readFileSync(path, 'utf8'), index, `#${index + 1} ${basename(path)}`)
    console.log(`  Goodreads #${index + 1}: ${basename(path)} (${rows.length} read rows)`)
    return rows
  })
}

/** Raw source entries (kept for library.json) plus normalized Books. */
function loadSource(): { raw: ReadingTrackerBook[] | null, books: Book[] } {
  let text: string
  if (args.from) {
    text = readFileSync(resolve(args.from), 'utf8')
  }
  else {
    console.log(`Reading tracker: ${CLI} list --json --shelf ${args.shelf}`)
    text = execFileSync(process.execPath, [CLI, 'list', '--json', '--shelf', args.shelf!], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  }
  const parsed = text.trimStart().startsWith('{') || text.trimStart().startsWith('[') ? JSON.parse(text) : null
  let raw = parsed ? (Array.isArray(parsed) ? parsed : parsed.books) as ReadingTrackerBook[] : null
  const overrides = raw ? loadOverrides() : null
  if (raw && overrides) {
    const corrected = applyCorrections(raw, { overrides, goodreads: loadGoodreads(overrides) })
    console.log(`\n${formatReport(corrected.report).join('\n')}\n`)
    mkdirSync(OUT, { recursive: true })
    writeFileSync(join(OUT, 'corrections.json'), `${JSON.stringify(corrected.report, null, 1)}\n`)
    raw = corrected.books
    text = JSON.stringify({ books: raw })
  }
  const { books } = importLibrary(text)
  return { raw, books }
}

const keyOf = (book: Book) => book.isbn13 ?? book.id

/** Language the Book was read in: the corrections' call, else its edition's, else English. */
const languageOf = (raw: ReadingTrackerBook[] | null, book: Book) =>
  (raw?.find(entry => entry.id === book.id) as CorrectedBook | undefined)?.language ?? isbnLanguage(book.isbn13) ?? 'en'

/** Covers picked in the dev panel's "Override a cover" tool (.data/choices.json: asset key → URL). */
function editionPicks(): Record<string, string> {
  const path = resolve('.data/choices.json')
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')).editionPicks ?? {}) : {}
  }
  catch {
    return {}
  }
}

/** The owner's cover pick for a Book: the overrides' coverUrl, else the dev panel's pick. */
const pinnedCover = (raw: ReadingTrackerBook[] | null, book: Book, picks: Record<string, string>) =>
  ((raw?.find(entry => entry.id === book.id) as CorrectedBook | undefined)?.coverPinned ? book.coverUrl : null) ?? picks[keyOf(book)] ?? null

/** Asset key per tracker id in the library.json of the previous build (keys change with the edition). */
function previousKeys(): Map<string, string> {
  const path = join(OUT, 'library.json')
  if (!existsSync(path)) return new Map()
  try {
    return new Map(importLibrary(readFileSync(path, 'utf8')).books.map(book => [book.id, keyOf(book)]))
  }
  catch {
    return new Map()
  }
}

const TEXT_FIELDS = ['description', 'quotes', 'genre', 'publisher'] as const

/** Language of an entry's front and words: as recorded, else its key's ISBN's, else English. */
const entryLanguage = (entry: ManifestEntry | undefined, key: string) =>
  (entry?.meta?.lang as string | undefined) ?? isbnLanguage(key) ?? 'en'

/**
 * A Book whose key changed (another edition, same language) keeps its words:
 * blurb, quotes, genre and imprint move over from the old key's entry.
 */
function carryText(manifest: Record<string, ManifestEntry>, from: string, to: string, language: string): boolean {
  const old = manifest[from]
  const current = manifest[to]
  if (!old?.description || current?.description || entryLanguage(old, from) !== language) return false
  const entry: ManifestEntry = { ...current }
  for (const field of TEXT_FIELDS) {
    if (old[field] !== undefined) (entry as Record<string, unknown>)[field] = old[field]
  }
  const { blurbSource, blurbMethod, quotes } = old.meta ?? {}
  entry.meta = { ...entry.meta, blurbSource, blurbMethod, quotes, lang: language }
  manifest[to] = entry
  return true
}

/** A stored front worth looking for again: the Google placeholder or below 800 px. */
function lowFront(entry: ManifestEntry | undefined): boolean {
  const [width, height] = String(entry?.meta?.frontSize ?? '').split('x').map(Number)
  if (!width || !height) return false
  return isPlaceholder(width, height) || height < MIN_HEIGHT
}

/** Keys of the bundled dev Libraries (app/assets/data/*.csv), whose assets share the folder. */
function devLibraryKeys(): Set<string> {
  const dir = resolve('app/assets/data')
  if (!existsSync(dir)) return new Set()
  return new Set(readdirSync(dir).filter(file => file.endsWith('.csv'))
    .flatMap(file => importLibrary(readFileSync(join(dir, file), 'utf8')).books.map(keyOf)))
}

/** Moves asset folders and manifest entries of keys no longer in use to .data/book-assets-stale/. */
function pruneStale(manifest: Record<string, ManifestEntry>, keep: Set<string>): string[] {
  const staleDir = resolve('.data/book-assets-stale')
  const pruned: string[] = []
  const folders = readdirSync(OUT).filter(name => statSync(join(OUT, name)).isDirectory())
  for (const key of new Set([...Object.keys(manifest), ...folders])) {
    if (keep.has(key)) continue
    if (existsSync(join(OUT, key))) {
      mkdirSync(staleDir, { recursive: true })
      renameSync(join(OUT, key), join(staleDir, existsSync(join(staleDir, key)) ? `${key}-${Date.now()}` : key))
    }
    Reflect.deleteProperty(manifest, key)
    pruned.push(key)
  }
  return pruned
}

function readManifest(): Record<string, ManifestEntry> {
  const path = join(OUT, 'manifest.json')
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
}

const writeManifest = (manifest: Record<string, ManifestEntry>) =>
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`)

/** Brings every entry's pile copies and Spine colours up to date (see pile.ts). */
async function updatePiles(manifest: Record<string, ManifestEntry>) {
  let changed = 0
  for (const [key, entry] of Object.entries(manifest)) {
    // A broken face must not stop the daily publish: that Book keeps its full faces.
    try {
      if (await updatePile(OUT, entry)) changed++
    }
    catch (error) {
      console.warn(`  ${key}: no pile copies (${error instanceof Error ? error.message : String(error)})`)
    }
  }
  if (changed) console.log(`Pile copies and Spine colours updated for ${changed} Book(s).`)
  writeManifest(manifest)
}

/** The selected Books as a Library export for Regal (dev button "My library"), blurbs cleaned. */
function writeLibrary(raw: ReadingTrackerBook[] | null, selected: Book[], manifest: Record<string, ManifestEntry>) {
  if (!raw) return
  const ids = new Set(selected.map(book => book.id))
  const library = raw.filter(entry => ids.has(entry.id)).map((entry) => {
    const book = selected.find(item => item.id === entry.id)!
    const { coverPinned: _pinned, ...rest } = entry as CorrectedBook
    return { ...rest, description: manifest[keyOf(book)]?.description || entry.description }
  })
  writeFileSync(join(OUT, 'library.json'), `${JSON.stringify({ books: library, total: library.length }, null, 1)}\n`)
}

/** The tracker's own publisher for a Book, when its export carries one. */
const publisherOf = (raw: ReadingTrackerBook[] | null, book: Book) =>
  (raw?.find(entry => entry.id === book.id) as { publisher?: string | null } | undefined)?.publisher ?? null

interface TextExtras {
  entry: ManifestEntry
  quotes: Quote[]
  genre: string | null
  publisher: string | null
  log: string
}

/**
 * Everything a printed back cover needs in words: the blurb, up to two
 * verified praise quotes, the shelf category and the imprint. Text model and
 * two JSON lookups only — no image is ever generated here.
 */
async function textExtras(book: Book, appleDescription: string | null, appleGenres: string[], knownPublisher: string | null): Promise<TextExtras> {
  const useModel = !args['no-model']
  const blurb = await resolveBlurb(appleDescription, book.description, useModel)
  const quotes = useModel ? await resolveQuotes(appleDescription ?? book.description) : []
  const genre = mapGenre(appleGenres)
  const publisher = await resolvePublisher(knownPublisher, book.isbn13)
  const entry: ManifestEntry = {
    description: blurb.text,
    meta: { blurbSource: blurb.source, blurbMethod: blurb.method, quotes: quotes.length },
  }
  if (quotes.length) entry.quotes = quotes
  if (genre) entry.genre = genre
  if (publisher) entry.publisher = publisher
  const log = `blurb: ${blurb.source} via ${blurb.method}, ${blurb.text.length} chars; quotes: ${quotes.length}; genre: ${genre ?? '—'}; publisher: ${publisher ?? '—'}`
  return { entry, quotes, genre, publisher, log }
}

/** Merges recomputed text into an entry, dropping what the sources no longer have. */
function mergeText(existing: ManifestEntry | undefined, extras: TextExtras): ManifestEntry {
  const merged: ManifestEntry = { ...existing, ...extras.entry, meta: { ...existing?.meta, ...extras.entry.meta } }
  if (!extras.quotes.length) delete merged.quotes
  if (!extras.genre) delete merged.genre
  if (!extras.publisher) delete merged.publisher
  return merged
}

/** Converts the Book's photo drop-ins and records them on its manifest entry. */
async function adoptPhotos(dir: string, key: string, entry: ManifestEntry): Promise<PhotoFace[]> {
  const faces = photoFacesIn(photoFiles(dir))
  if (!faces.length) return faces
  mkdirSync(dir, { recursive: true })
  await convertPhotos(dir, faces)
  for (const face of faces) entry[face] = `${key}/${face}.webp`
  entry.photoFaces = faces
  if (faces.length === 3) entry.source = 'photo'
  return faces
}

// --- AI jackets: shared by direct calls and the Batch API ----------------------

const useBatch = !args.now
const AI_COST = useBatch ? BATCH_COST_USD : IMAGE_COST_USD

/** Writes the cut spine/back (never over a photographed face) and records them in the entry. */
async function applyJacket(key: string, entry: ManifestEntry, jacket: JacketResult, photoFaces: PhotoFace[]) {
  const dir = join(OUT, key)
  writeFileSync(join(dir, 'jacket.webp'), jacket.jacket)
  if (!photoFaces.includes('spine')) {
    writeFileSync(join(dir, 'spine.webp'), await sharp(jacket.spine).resize({ height: 1600, withoutEnlargement: true }).webp({ quality: 90 }).toBuffer())
    entry.spine = `${key}/spine.webp`
  }
  if (!photoFaces.includes('back')) {
    writeFileSync(join(dir, 'back.webp'), await sharp(jacket.back).resize({ height: 1600, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer())
    entry.back = `${key}/back.webp`
  }
  if (photoFaces.length < 3) entry.source = 'ai'
  entry.meta = { ...entry.meta, promptVersion: PROMPT_VERSION, model: IMAGE_MODEL, spineFit: Number(jacket.spineFit.toFixed(2)), stretched: jacket.stretched }
}

interface PendingBook { key: string, title: string, layout: JacketLayout, photoFaces: PhotoFace[] }
interface PendingJob { name: string, submittedAt: string, books: PendingBook[] }

const PENDING_FILE = join(OUT, 'batches.json')
const readPending = (): PendingJob[] => (existsSync(PENDING_FILE) ? JSON.parse(readFileSync(PENDING_FILE, 'utf8')) : [])
const writePending = (jobs: PendingJob[]) => writeFileSync(PENDING_FILE, `${JSON.stringify(jobs, null, 1)}\n`)

/**
 * Collects finished batch jobs into the manifest. Polls every 30 s for up to
 * `waitMinutes`; returns the asset keys still waiting.
 */
async function collectBatches(manifest: Record<string, ManifestEntry>, waitMinutes: number): Promise<Set<string>> {
  const deadline = Date.now() + waitMinutes * 60_000
  let jobs = readPending()
  while (jobs.length) {
    const remaining: PendingJob[] = []
    for (const job of jobs) {
      const status = await getImageBatch(job.name)
      if (status.state === 'pending' || status.state === 'running' || status.state === 'unknown') {
        remaining.push(job)
        continue
      }
      if (status.state !== 'succeeded') {
        console.warn(`Batch ${job.name} ${status.state}; its ${job.books.length} book(s) will be queued again.`)
        continue
      }
      for (const book of job.books) {
        const result = status.results.get(book.key)
        if (!Buffer.isBuffer(result)) {
          console.warn(`  ${book.title}: ${result ?? 'missing from batch'}; will be queued again`)
          continue
        }
        const entry: ManifestEntry = { ...manifest[book.key] }
        const jacket = await cropJacket(result, book.layout)
        await applyJacket(book.key, entry, jacket, book.photoFaces)
        manifest[book.key] = entry
        console.log(`✓ ${book.title}: AI back + spine from batch, spine fit ${Math.round(jacket.spineFit * 100)}%${jacket.stretched ? ' (detected folds)' : ''}`)
      }
      writeManifest(manifest)
    }
    jobs = remaining
    writePending(jobs)
    if (!jobs.length || Date.now() >= deadline) break
    console.log(`  waiting for ${jobs.length} batch job(s)… (${Math.ceil((deadline - Date.now()) / 60_000)} min left)`)
    await new Promise(resolve => setTimeout(resolve, 30_000))
  }
  return new Set(jobs.flatMap(job => job.books.map(book => book.key)))
}

/** Submits queued requests in jobs that stay under the inline size limit. */
async function submitQueued(queue: { request: ImageRequest, book: PendingBook }[]) {
  const jobs = readPending()
  let chunk: typeof queue = []
  let size = 0
  const flush = async () => {
    if (!chunk.length) return
    const name = await submitImageBatch(chunk.map(item => item.request), `regal-${new Date().toISOString().slice(0, 16)}`)
    jobs.push({ name, submittedAt: new Date().toISOString(), books: chunk.map(item => item.book) })
    writePending(jobs)
    console.log(`Submitted ${chunk.length} book(s) as ${name} (≈ $${(chunk.length * BATCH_COST_USD).toFixed(2)})`)
    chunk = []
    size = 0
  }
  for (const item of queue) {
    const bytes = item.request.images.reduce((sum, image) => sum + image.data.length * 1.37, item.request.prompt.length)
    if (size + bytes > BATCH_INLINE_LIMIT) await flush()
    chunk.push(item)
    size += bytes
  }
  await flush()
}

async function main() {
  if (args['pile-only']) {
    await updatePiles(readManifest())
    return
  }
  const { raw, books } = loadSource()
  const selected = selectBooks(books, args.shelf!, parseLimit(args.limit))
  if (!selected.length) throw new Error(`No finished Books on shelf "${args.shelf}"`)
  const undated = selected.filter(book => !book.dateRead).length
  if (undated) console.log(`${selected.length} Books (${undated} without a finish date, last).`)

  mkdirSync(OUT, { recursive: true })
  const manifest = readManifest()
  const previous = previousKeys()
  const picks = editionPicks()
  const report: Record<string, unknown>[] = []
  let images = 0

  // Photo drop-ins only: convert what's there, leave everything else alone.
  if (args['photos-only']) {
    for (const book of selected) {
      const key = keyOf(book)
      const entry: ManifestEntry = { ...manifest[key] }
      const faces = await adoptPhotos(join(OUT, key), key, entry)
      if (!faces.length) continue
      manifest[key] = entry
      console.log(`📷 ${book.title}: ${faces.join(', ')}`)
    }
    await updatePiles(manifest)
    console.log(`Photo drop-ins processed. Manifest: ${join(OUT, 'manifest.json')}`)
    return
  }

  // Words only: blurb, praise quotes, shelf category and imprint. No images.
  if (args['refresh-text']) {
    for (const book of selected) {
      const key = keyOf(book)
      console.log(`→ ${book.dateRead ?? 'undated'}  ${book.title}`)
      const apple = await findApple(book, { language: languageOf(raw, book) })
      const extras = await textExtras(book, apple?.description ?? null, apple?.genres ?? [], publisherOf(raw, book))
      manifest[key] = mergeText(manifest[key], extras)
      console.log(`  ${extras.log}`)
      report.push({ book: book.title, ...extras.entry.meta })
      writeManifest(manifest)
    }
    writeLibrary(raw, selected, manifest)
    console.log(`\n${selected.length} Books, text only (no images). Manifest: ${join(OUT, 'manifest.json')}`)
    writeFileSync(join(OUT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`)
    return
  }

  // Results of earlier batch jobs first; books still waiting aren't submitted twice.
  const waiting = args['dry-run'] || args.recrop || args['no-ai'] ? new Set<string>() : await collectBatches(manifest, 0)
  const queue: { request: ImageRequest, book: PendingBook }[] = []

  for (const book of selected) {
    const key = keyOf(book)
    const dir = join(OUT, key)
    const language = languageOf(raw, book)
    const pinned = pinnedCover(raw, book, picks)
    const oldKey = previous.get(book.id)
    if (oldKey && oldKey !== key && !args['dry-run'] && carryText(manifest, oldKey, key, language)) console.log(`  ${book.title}: blurb carried over from ${oldKey}`)
    const existing = manifest[key]
    const languageChanged = Boolean(existing) && entryLanguage(existing, key) !== language
    // A front of the other language's edition, a placeholder or small one (--retry-fronts), or not the pinned cover.
    const frontStale = Boolean(existing?.front) && !(existing?.photoFaces ?? []).includes('front') && existing?.source !== 'ai' && (
      languageChanged
      || (args['retry-fronts'] && lowFront(existing))
      || (pinned !== null && existing?.meta?.frontUrl !== pinned))
    if (waiting.has(key) && existing?.front && !args.force) {
      console.log(`… ${book.dateRead ?? 'undated'}  ${book.title} (AI back/spine waiting in a batch job)`)
      continue
    }
    if (args.recrop) {
      if (!existsSync(join(dir, 'jacket.webp')) || !existsSync(join(dir, 'front.webp'))) continue
      const cut = await cropJacket(readFileSync(join(dir, 'jacket.webp')), await layoutFor(book, readFileSync(join(dir, 'front.webp'))))
      writeFileSync(join(dir, 'spine.webp'), await sharp(cut.spine).resize({ height: 1600, withoutEnlargement: true }).webp({ quality: 90 }).toBuffer())
      writeFileSync(join(dir, 'back.webp'), await sharp(cut.back).resize({ height: 1600, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer())
      manifest[key] = { ...existing, meta: { ...existing?.meta, spineFit: Number(cut.spineFit.toFixed(2)), stretched: cut.stretched } }
      console.log(`✂ ${book.title}: spine fit ${Math.round(cut.spineFit * 100)}%${cut.stretched ? ' (detected folds)' : ''}`)
      continue
    }
    // Photographed faces replace generated ones; back + spine photos mean no AI at all.
    const drops = photoFacesIn(photoFiles(dir))
    const photoPair = drops.includes('spine') && drops.includes('back')
    const newPhotos = drops.some(face => !(existing?.photoFaces ?? []).includes(face))
    const done = !newPhotos && !frontStale && existing?.front && existing.description !== undefined
      && (args['no-ai'] || photoPair || (existing.back && existing.meta?.promptVersion === PROMPT_VERSION))
    const label = `${book.dateRead ?? 'undated'}  ${book.title}`
    if (done && !args.force) {
      console.log(`✓ ${label} (cached)`)
      report.push({ book: book.title, cached: true })
      continue
    }
    const needsAi = !args['no-ai'] && !photoPair && !(existing?.back && existing.meta?.promptVersion === PROMPT_VERSION && !args.force)
    if (args['dry-run']) {
      const photos = drops.length ? ` + photo ${drops.join('/')}` : ''
      console.log(`• ${label}  → front + blurb${photos}${needsAi ? ` + AI back/spine ($${AI_COST.toFixed(3)}${useBatch ? ', batch' : ''})` : ''}`)
      if (needsAi) images++
      continue
    }

    // Only the front is out of date: look again, keep the better one, leave the words alone.
    if (frontStale && !languageChanged && !newPhotos && existing?.description && !needsAi) {
      const front = await resolveFront(book, { language, pinnedUrl: pinned })
      const [, oldHeight] = String(existing.meta?.frontSize ?? '0x0').split('x').map(Number)
      if (front && (pinned !== null || front.height > (oldHeight ?? 0))) {
        const webp = await sharp(front.image).resize({ height: 1600, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer()
        const size = await sharp(webp).metadata()
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'front.webp'), webp)
        manifest[key] = { ...existing, front: `${key}/front.webp`, meta: { ...existing.meta, frontSource: front.source, frontSize: `${size.width}x${size.height}`, frontUrl: front.url, lang: language } }
        console.log(`↻ ${label}: front ${existing.meta?.frontSource ?? '?'} ${existing.meta?.frontSize ?? '?'} → ${front.source} ${size.width}×${size.height}`)
      }
      else {
        manifest[key] = { ...existing, meta: { ...existing.meta, lang: language } }
        console.log(`✓ ${label}: no better front (${front ? `${front.source} ${front.width}×${front.height}` : 'none'}), kept ${existing.meta?.frontSize ?? '?'}`)
      }
      writeManifest(manifest)
      report.push({ book: book.title, ...manifest[key]!.meta })
      continue
    }

    console.log(`→ ${label}`)
    mkdirSync(dir, { recursive: true })
    let entry: ManifestEntry = { ...existing }
    const faces = await adoptPhotos(dir, key, entry)
    if (faces.length) console.log(`  photo: ${faces.join(', ')}`)

    // A photographed front is the real thing: only Apple's words are still wanted.
    const photoFront = faces.includes('front')
    const apple = photoFront ? await findApple(book, { language }) : null
    const front = photoFront ? null : await resolveFront(book, { language, pinnedUrl: pinned })
    if (!front && !photoFront) {
      console.warn('  no front found; skipped')
      report.push({ book: book.title, error: 'no front' })
      continue
    }
    const frontWebp = front
      ? await sharp(front.image).resize({ height: 1600, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer()
      : readFileSync(join(dir, 'front.webp'))
    if (front) writeFileSync(join(dir, 'front.webp'), frontWebp)
    const size = await sharp(frontWebp).metadata()
    const frontWidth = size.width ?? 1
    const frontHeight = size.height ?? 1
    console.log(`  front: ${front?.source ?? 'photo'} ${frontWidth}×${frontHeight}${frontHeight < MIN_HEIGHT ? ' (low-res)' : ''}`)

    // Words carried over from the same language's other edition stay; otherwise they're looked up.
    if (entry.description && !languageChanged && entryLanguage(entry, key) === language && !args.force) {
      console.log('  blurb: kept')
    }
    else {
      const extras = await textExtras(book, front?.appleDescription ?? apple?.description ?? null, front?.appleGenres ?? apple?.genres ?? [], publisherOf(raw, book))
      console.log(`  ${extras.log}`)
      entry = mergeText(entry, extras)
    }
    entry.front = `${key}/front.webp`
    entry.meta = { ...entry.meta, title: book.title, frontSource: front?.source ?? 'photo', frontSize: `${frontWidth}x${frontHeight}`, frontUrl: front?.url, lang: language }

    if (needsAi && useBatch) {
      const { layout, request } = await jacketRequest(book, front?.image ?? frontWebp, key, 'jpeg')
      queue.push({ request, book: { key, title: book.title, layout, photoFaces: faces } })
      images++
      console.log(`  AI: queued for the batch (${layout.ratio} canvas, spine ${layout.spineWidth}px)`)
    }
    else if (needsAi) {
      const layout = planLayout(frontWidth / frontHeight, spineRatio(book))
      console.log(`  AI: ${layout.ratio} canvas, spine ${layout.spineWidth}px … (${IMAGE_MODEL}, ~$${IMAGE_COST_USD})`)
      const started = Date.now()
      const jacket = await generateJacket(book, front?.image ?? frontWebp)
      images++
      await applyJacket(key, entry, jacket, faces)
      console.log(`  AI: done in ${Math.round((Date.now() - started) / 1000)} s, spine fit ${Math.round(jacket.spineFit * 100)}%${jacket.stretched ? ' (stretched)' : ''}`)
    }

    manifest[key] = entry
    writeManifest(manifest)
    report.push({ book: book.title, ...entry.meta })
  }

  if (args.recrop) {
    await updatePiles(manifest)
    return
  }
  if (args['dry-run']) {
    console.log(`\nDry run: ${images} AI image(s), about $${(images * AI_COST).toFixed(2)} (${useBatch ? 'Batch API, half price; --now for immediate' : 'immediate, full price'}).`)
    return
  }

  if (queue.length) {
    await submitQueued(queue)
    const wait = Number(args.wait) || 0
    if (wait > 0) {
      console.log(`Waiting up to ${wait} min for the batch (Ctrl+C is fine: the next run collects it).`)
      const still = await collectBatches(manifest, wait)
      if (still.size) console.log(`${still.size} book(s) still in a batch job; run the build again later to collect them.`)
    }
  }

  // The whole shelf: keys no longer in the Library (nor in a dev Library, nor waiting in a batch) are stale.
  if (parseLimit(args.limit) === Infinity) {
    const keep = new Set([...selected.map(keyOf), ...devLibraryKeys(), ...readPending().flatMap(job => job.books.map(book => book.key))])
    const pruned = pruneStale(manifest, keep)
    if (pruned.length) console.log(`\nMoved ${pruned.length} stale asset set(s) to .data/book-assets-stale/: ${pruned.join(', ')}`)
    writeManifest(manifest)
  }
  const low = selected.filter(book => !manifest[keyOf(book)]?.front || lowFront(manifest[keyOf(book)]))
  if (low.length) console.log(`\nFronts below ${MIN_HEIGHT} px (${low.length}):\n${low.map(book => `  ${book.title}: ${manifest[keyOf(book)]?.meta?.frontSource ?? 'no front'} ${manifest[keyOf(book)]?.meta?.frontSize ?? ''}`).join('\n')}`)

  await updatePiles(manifest)
  writeLibrary(raw, selected, manifest)
  console.log(`\n${selected.length} Books, ${images} AI image(s) ≈ $${(images * AI_COST).toFixed(2)}${useBatch ? ' (batch)' : ''}. Manifest: ${join(OUT, 'manifest.json')}`)
  writeFileSync(join(OUT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
