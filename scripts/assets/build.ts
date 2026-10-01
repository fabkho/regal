// Asset pipeline (#25): the latest N finished Books from the reading tracker
// (or a Library export file) → high-res front, clean blurb, AI back + spine,
// written as an asset set (#20) under public/book-assets/.
//
//   pnpm assets:build                     # latest 10 read Books from `reading list --json`
//   pnpm assets:build --limit 3 --dry-run # what would happen, and what it would cost
//   pnpm assets:build --from library.json # a Library export instead of the CLI
//   pnpm assets:build --no-ai             # fronts + blurbs only (free)
//   pnpm assets:build --force             # rebuild even if a Book is done
//   pnpm assets:build --recrop            # re-cut spine/back from stored jackets (free)
//   pnpm assets:build --refresh-text      # blurb, quotes, genre, publisher only (text model, free)
//   pnpm assets:build --photos-only       # (re)process photo drop-ins, nothing else
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
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import sharp from 'sharp'
import type { Book } from '../../shared/types/book'
import { importLibrary } from '../../shared/library/importLibrary'
import type { ReadingTrackerBook } from '../../shared/library/importReadingTracker'
import type { Quote } from './backText'
import { mapGenre, resolvePublisher, resolveQuotes } from './backText'
import { resolveBlurb } from './blurb'
import { findApple, resolveFront } from './front'
import { BATCH_COST_USD, BATCH_INLINE_LIMIT, getImageBatch, IMAGE_COST_USD, IMAGE_MODEL, submitImageBatch } from './gemini'
import type { ImageRequest } from './gemini'
import type { PhotoFace } from './photos'
import { convertPhotos, photoFacesIn, photoFiles } from './photos'
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
    'force': { type: 'boolean', default: false },
    'recrop': { type: 'boolean', default: false },
    'refresh-text': { type: 'boolean', default: false },
    'photos-only': { type: 'boolean', default: false },
    'now': { type: 'boolean', default: false },
    'wait': { type: 'string', default: '30' },
  },
})

const OUT = resolve(args.out!)
const CLI = process.env.READING_TRACKER_CLI ?? join(homedir(), 'code/reading-tracker-cli/dist/index.js')

interface ManifestEntry {
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
  const { books } = importLibrary(text)
  const parsed = text.trimStart().startsWith('{') || text.trimStart().startsWith('[') ? JSON.parse(text) : null
  const raw = parsed ? (Array.isArray(parsed) ? parsed : parsed.books) as ReadingTrackerBook[] : null
  return { raw, books }
}

const keyOf = (book: Book) => book.isbn13 ?? book.id

function readManifest(): Record<string, ManifestEntry> {
  const path = join(OUT, 'manifest.json')
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
}

const writeManifest = (manifest: Record<string, ManifestEntry>) =>
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`)

/** The selected Books as a Library export for Regal (dev button "My latest"), blurbs cleaned. */
function writeLibrary(raw: ReadingTrackerBook[] | null, selected: Book[], manifest: Record<string, ManifestEntry>) {
  if (!raw) return
  const ids = new Set(selected.map(book => book.id))
  const library = raw.filter(entry => ids.has(entry.id)).map((entry) => {
    const book = selected.find(item => item.id === entry.id)!
    return { ...entry, description: manifest[keyOf(book)]?.description ?? entry.description }
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
  const blurb = await resolveBlurb(appleDescription, book.description)
  const quotes = await resolveQuotes(appleDescription ?? book.description)
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
  const { raw, books } = loadSource()
  const selected = books
    .filter(book => book.status === args.shelf && book.dateRead)
    .sort((a, b) => (a.dateRead! < b.dateRead! ? 1 : -1))
    .slice(0, Number(args.limit))
  if (!selected.length) throw new Error(`No finished Books on shelf "${args.shelf}"`)

  mkdirSync(OUT, { recursive: true })
  const manifest = readManifest()
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
    writeManifest(manifest)
    console.log(`Photo drop-ins processed. Manifest: ${join(OUT, 'manifest.json')}`)
    return
  }

  // Words only: blurb, praise quotes, shelf category and imprint. No images.
  if (args['refresh-text']) {
    for (const book of selected) {
      const key = keyOf(book)
      console.log(`→ ${book.dateRead}  ${book.title}`)
      const apple = await findApple(book)
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
    const existing = manifest[key]
    if (waiting.has(key) && existing?.front && !args.force) {
      console.log(`… ${book.dateRead}  ${book.title} (AI back/spine waiting in a batch job)`)
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
    const done = !newPhotos && existing?.front && existing.description !== undefined
      && (args['no-ai'] || photoPair || (existing.back && existing.meta?.promptVersion === PROMPT_VERSION))
    const label = `${book.dateRead}  ${book.title}`
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

    console.log(`→ ${label}`)
    mkdirSync(dir, { recursive: true })
    let entry: ManifestEntry = { ...existing }
    const faces = await adoptPhotos(dir, key, entry)
    if (faces.length) console.log(`  photo: ${faces.join(', ')}`)

    // A photographed front is the real thing: only Apple's words are still wanted.
    const photoFront = faces.includes('front')
    const apple = photoFront ? await findApple(book) : null
    const front = photoFront ? null : await resolveFront(book)
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
    console.log(`  front: ${front?.source ?? 'photo'} ${frontWidth}×${frontHeight}`)

    const extras = await textExtras(book, front?.appleDescription ?? apple?.description ?? null, front?.appleGenres ?? apple?.genres ?? [], publisherOf(raw, book))
    console.log(`  ${extras.log}`)
    entry = mergeText(entry, extras)
    entry.front = `${key}/front.webp`
    entry.meta = { ...entry.meta, title: book.title, frontSource: front?.source ?? 'photo', frontSize: `${frontWidth}x${frontHeight}` }

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
    writeManifest(manifest)
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

  writeLibrary(raw, selected, manifest)
  console.log(`\n${selected.length} Books, ${images} AI image(s) ≈ $${(images * AI_COST).toFixed(2)}${useBatch ? ' (batch)' : ''}. Manifest: ${join(OUT, 'manifest.json')}`)
  writeFileSync(join(OUT, 'report.json'), `${JSON.stringify(report, null, 1)}\n`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
