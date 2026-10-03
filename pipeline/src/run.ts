// One Regal assets run: read and validate the input library file, enrich its
// Books (incrementally), give the ones that want them AI Spines/backs, write
// the enriched file, publish what changed. The network and Gemini come in as
// `RunDeps`, so a test runs the whole thing offline.
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import type { AiTools } from './ai'
import { aiCost, runAi } from './ai'
import { latestBooks } from './assets/select'
import type { BookRecord, Tools } from './enrich'
import { assetKey, enrichBook, recordComplete } from './enrich'
import type { LibraryBook, RegalLibraryFile } from './layer'
import { formatLibraryFileErrors, libraryBookToBook, parseLibraryFile } from './layer'
import type { InputBase } from './load'
import { ImageLoader } from './load'
import { assembleLibrary, enrichedBook, writeLibrary } from './output'
import type { PublishPlan, Uploader } from './publish'
import { checkPrefix, publish } from './publish'
import { readState, writeState } from './state'
import { isHttpUrl, pool } from './util'

export interface RunOptions {
  /** Library file: URL or absolute path. */
  input: string
  out: string
  cacheDir: string
  /** Photo drop-ins (`<photos>/<key>/front.jpg` …). */
  photos: string | null
  limit: number
  ai: boolean
  model: boolean
  now: boolean
  wait: number
  force: boolean
  revalidate: boolean
  /** R2 prefix to publish to (`v2`); null: no publish. */
  publish: string | null
  /** Bucket name, for the state's bookkeeping and the log. */
  bucket: string
  dryRun: boolean
  concurrency: number
  /** Timestamp for the output file (default: now). */
  timestamp?: string
}

export interface RunDeps {
  tools: Tools
  aiTools: AiTools
  uploader: Uploader
  fetch?: typeof fetch
  log: (line: string) => void
  warn: (line: string) => void
}

export interface RunResult {
  library: RegalLibraryFile
  /** Did the library file change on disk? */
  written: boolean
  built: number
  cached: number
  /** Books whose enrichment threw (they keep what an earlier run made); nothing is published then. */
  failed: number
  /** AI images paid for (or, on a dry run, that would be). */
  aiImages: number
  /** Books without Spine/back art that AI could make. */
  wantingAi: number
  plan: PublishPlan | null
}

export class InvalidInputError extends Error {}

async function readInput(source: string, fetcher: typeof fetch): Promise<{ text: string, base: InputBase }> {
  if (isHttpUrl(source)) {
    const response = await fetcher(source, { headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`)
    return { text: await response.text(), base: { url: source } }
  }
  return { text: readFileSync(source, 'utf8'), base: { path: source } }
}

/** A Book passed through as it came: its references re-based on the output file. */
export function rebaser(base: InputBase, out: string) {
  return (ref: string) => {
    if (isHttpUrl(ref) || ref.startsWith('//')) return ref
    if ('url' in base) return new URL(ref, base.url).href
    if (ref.startsWith('/')) return ref
    return relative(out, resolve(dirname(base.path), ref)).split(sep).join('/')
  }
}

/** One line per rebuilt Book: what it has now and where it came from. */
function describe(book: LibraryBook, record: BookRecord): string {
  const faces = (['front', 'spine', 'back'] as const).map(face => (record.assets[face] ? face : `-${face}`)).join(' ')
  const front = record.meta.front ? ` front: ${record.meta.front.source} ${record.meta.front.size}` : ''
  const blurb = record.text.description ? ` blurb: ${record.meta.blurb?.source ?? '?'}` : ''
  const notes = record.meta.notes?.length ? ` (${record.meta.notes.join('; ')})` : ''
  return `→ ${book.dateRead ?? 'undated'}  ${book.title}: ${faces}${front}${blurb}${notes}`
}

/** Counts per face of a library file, for the log and the report. */
export function faceCounts(library: RegalLibraryFile): Record<string, number> {
  const count = (test: (book: LibraryBook) => unknown) => library.books.filter(test).length
  return {
    books: library.books.length,
    front: count(book => book.assets?.front),
    spine: count(book => book.assets?.spine),
    back: count(book => book.assets?.back),
    pile: count(book => book.assets?.pile),
    palette: count(book => book.assets?.palette),
    spineColor: count(book => book.assets?.spineColor),
    photoFaces: count(book => book.assets?.photoFaces?.length),
    ai: count(book => book.assets?.source === 'ai'),
    description: count(book => book.description),
  }
}

export async function runAssets(options: RunOptions, deps: RunDeps): Promise<RunResult> {
  const { out, cacheDir, dryRun } = options
  const { log } = deps
  const prefix = options.publish !== null ? checkPrefix(options.publish) : null
  if (prefix && options.limit !== Infinity) throw new Error('--publish needs every Book: drop --limit (a limited run is for trying things out)')

  const { text, base } = await readInput(options.input, deps.fetch ?? fetch)
  const parsed = parseLibraryFile(text)
  if (!parsed.ok) {
    throw new InvalidInputError(`${options.input} is not a valid Regal library file (${parsed.errors.length} error(s)):\n${formatLibraryFileErrors(parsed.errors).map(line => `  ${line}`).join('\n')}`)
  }
  const input = parsed.library
  log(`Input: ${options.input} (${input.books.length} Books${input.generator ? `, from ${input.generator}` : ''})`)
  log(`Output: ${out}${dryRun ? '  [dry run: nothing remote, no Gemini]' : ''}`)

  const state = readState(cacheDir, out)
  const loader = new ImageLoader({ cacheDir, revalidate: options.revalidate, fetch: deps.fetch })
  const context = { out, photos: options.photos, base, load: (location: string) => loader.load(location), tools: deps.tools, model: options.model && !dryRun, force: options.force, now: Date.parse(options.timestamp ?? '') || Date.now() }

  // One asset set per key (two Books of one edition share it), most recently read first.
  const byKey = new Map<string, LibraryBook>()
  for (const book of latestBooks(input.books, options.limit)) if (!byKey.has(assetKey(book))) byKey.set(assetKey(book), book)
  const records = new Map<string, BookRecord>()
  let built = 0
  let cached = 0
  const failed: string[] = []
  await pool([...byKey], options.concurrency, async ([key, book]) => {
    try {
      const { record, outcome } = await enrichBook(book, state.books[key], context)
      records.set(key, record)
      state.books[key] = record
      if (outcome === 'cached') {
        cached++
      }
      else {
        built++
        log(describe(book, record))
      }
    }
    catch (error) {
      failed.push(book.title)
      deps.warn(`✗ ${book.title}: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
  if (cached) log(`${cached} Book(s) unchanged since the last run (cached).`)
  for (const [location, reason] of loader.failures) deps.warn(`  input image not loaded: ${location} (${reason})`)

  // AI Spines and backs.
  const wanting = [...records].filter(([, record]) => record.needsAi).map(([key, record]) => ({ key, record, book: libraryBookToBook(byKey.get(key)!) }))
  const batch = !options.now
  let aiImages = 0
  if (options.ai && wanting.length) {
    const ai = await runAi({ out, cacheDir, tools: deps.aiTools, log }, wanting, records, { generate: !dryRun, now: options.now, wait: options.wait })
    aiImages = ai.images
    const cost = `$${(ai.images * aiCost(batch)).toFixed(2)}`
    if (dryRun) log(`Dry run: ${ai.images} AI image(s), about ${cost} (${batch ? 'Batch API, half price; --now for immediate' : 'immediate, full price'}).`)
    else log(`AI: ${ai.images} image(s) ≈ ${cost}${batch ? ' (batch)' : ''}${ai.waiting.size ? `, ${ai.waiting.size} Book(s) waiting in a batch job` : ''}.`)
  }
  else if (wanting.length) {
    log(`${wanting.length} Book(s) without Spine/back art: Regal draws them (AI would cost about $${(wanting.length * aiCost(true)).toFixed(2)} in the Batch API).`)
  }

  // The enriched file: Books of this run, the rest as an earlier run left them or as they came.
  const rebase = rebaser(base, out)
  const books = input.books.map((book) => {
    const key = assetKey(book)
    const earlier = state.books[key]
    const record = records.get(key) ?? (earlier && recordComplete(out, earlier) ? earlier : null)
    return enrichedBook(book, record, rebase)
  })
  const written = writeLibrary(out, assembleLibrary(input, books, options.timestamp ?? new Date().toISOString()))
  const inputKeys = new Set(input.books.map(book => assetKey(book)))
  for (const key of Object.keys(state.books)) if (!inputKeys.has(key)) Reflect.deleteProperty(state.books, key)
  writeState(cacheDir, state)
  const counts = faceCounts(written.library)
  log(`\n${written.written ? 'Wrote' : 'Unchanged:'} ${written.path} (valid Regal library file; ${built} Book(s) rebuilt, ${cached} cached).`)
  log(`  ${counts.books} Books: front ${counts.front}, Spine ${counts.spine}, back ${counts.back}, pile ${counts.pile}, palette ${counts.palette}, spineColor ${counts.spineColor}, photo faces ${counts.photoFaces}, AI ${counts.ai}, blurb ${counts.description}`)

  let plan: PublishPlan | null = null
  if (prefix && failed.length) {
    deps.warn(`Not published: ${failed.length} Book(s) failed (${failed.slice(0, 5).join(', ')}${failed.length > 5 ? ' …' : ''}).`)
  }
  else if (prefix) {
    const target = `${options.bucket}/${prefix}`
    const uploader: Uploader = dryRun
      ? { put: () => Promise.reject(new Error('dry run: no upload')), remove: () => Promise.reject(new Error('dry run: no delete')) }
      : deps.uploader
    const result = await publish({ out, library: written.library, prefix, before: state.published[target] ?? {}, dryRun, uploader, log })
    plan = result.plan
    if (!dryRun) {
      state.published[target] = result.hashes
      state.publishedAt[target] = options.timestamp ?? new Date().toISOString()
      writeState(cacheDir, state)
    }
  }
  return { library: written.library, written: written.written, built, cached, failed: failed.length, aiImages, wantingAi: wanting.filter(item => item.record.needsAi).length, plan }
}
