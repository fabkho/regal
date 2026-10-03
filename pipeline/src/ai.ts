// AI Spines and backs (Gemini) for Books that have a front but no Spine/back
// art, the way today's asset build makes them: the Batch API by default (half
// price, results within minutes to 24 h; open jobs kept in the cache and
// collected by the next run), `--now` for direct calls at full price.
//
// Never paid twice: every generated jacket is kept in the cache with the
// front it was made from, and a Book whose front is unchanged is cut from
// its stored jacket again for free.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import type { BookRecord } from './enrich'
import { FACE_HEIGHT } from './enrich'
import type { BatchStatus, ImageRequest } from './assets/gemini'
import { BATCH_COST_USD, BATCH_INLINE_LIMIT, IMAGE_COST_USD, IMAGE_MODEL } from './assets/gemini'
import type { JacketLayout, JacketResult } from './assets/jacket'
import { cropJacket, jacketPlaceholderShare, PLACEHOLDER_LIMIT, PROMPT_VERSION } from './assets/jacket'
import type { PileFields } from './assets/pile'
import { updatePile } from './assets/pile'
import type { Book } from './layer'
import { sha256, writeIfChanged } from './util'

/** Price of one Spine/back pair. */
export const aiCost = (batch: boolean) => (batch ? BATCH_COST_USD : IMAGE_COST_USD)

/** The Gemini calls, injected so tests never reach the API. */
export interface AiTools {
  jacketRequest: (book: Book, front: Buffer, key: string, format: 'png' | 'jpeg') => Promise<{ layout: JacketLayout, request: ImageRequest }>
  generateJacket: (book: Book, front: Buffer) => Promise<JacketResult>
  submitImageBatch: (requests: ImageRequest[], displayName: string) => Promise<string>
  getImageBatch: (name: string) => Promise<BatchStatus>
}

export interface AiContext {
  out: string
  /** Jackets in `<cache>/jackets/`, open batch jobs in `<cache>/batches.json`. */
  cacheDir: string
  tools: AiTools
  log: (line: string) => void
}

interface JacketMeta { promptVersion: number, frontSha: string, layout: JacketLayout, model: string, spineFit: number, stretched: boolean }
interface PendingBook { key: string, title: string, layout: JacketLayout, frontSha: string }
interface PendingJob { name: string, submittedAt: string, books: PendingBook[] }

/** A jacket per Book and front: a front that changes back finds its jacket again. */
const jacketFile = (cacheDir: string, key: string, frontSha: string) => join(cacheDir, 'jackets', `${key}-${frontSha.slice(0, 16)}.webp`)
const frontOf = (out: string, record: BookRecord) => (record.assets.front ? readFileSync(join(out, record.assets.front)) : null)

/**
 * Writes the cut Spine/back for the faces a Book is missing (an adopted or
 * photographed face stays), keeps the jacket, and brings the pile up to date.
 */
/** Keeps a paid-for jacket with the front it was made from, so it is never bought twice. */
function storeJacket(context: AiContext, key: string, jacket: JacketResult, frontSha: string): JacketMeta {
  mkdirSync(join(context.cacheDir, 'jackets'), { recursive: true })
  writeIfChanged(jacketFile(context.cacheDir, key, frontSha), jacket.jacket)
  const meta: JacketMeta = { promptVersion: PROMPT_VERSION, frontSha, layout: jacket.layout, model: IMAGE_MODEL, spineFit: Number(jacket.spineFit.toFixed(2)), stretched: jacket.stretched }
  writeIfChanged(`${jacketFile(context.cacheDir, key, frontSha).slice(0, -5)}.json`, `${JSON.stringify(meta, null, 1)}\n`)
  return meta
}

export async function applyJacket(context: AiContext, key: string, record: BookRecord, jacket: JacketResult, frontSha: string): Promise<void> {
  const meta = storeJacket(context, key, jacket, frontSha)

  const assets = record.assets
  for (const [face, image, quality] of [['spine', jacket.spine, 90], ['back', jacket.back, 88]] as const) {
    if (assets[face]) continue
    const ref = `${key}/${face}.webp`
    writeIfChanged(join(context.out, ref), await sharp(image).resize({ height: FACE_HEIGHT, withoutEnlargement: true }).webp({ quality }).toBuffer())
    assets[face] = ref
  }
  if ((assets.photoFaces ?? []).length < 3) assets.source = 'ai'
  const pile: PileFields = { front: assets.front ?? undefined, spine: assets.spine ?? undefined, palette: assets.palette ?? undefined, spineColor: assets.spineColor ?? undefined }
  await updatePile(context.out, pile)
  Object.assign(assets, { pile: pile.pile, palette: pile.palette, spineColor: pile.spineColor })
  record.needsAi = false
  record.meta.ai = { model: meta.model, promptVersion: meta.promptVersion, spineFit: meta.spineFit, stretched: meta.stretched }
}

/** Cuts a Book's Spine/back from its stored jacket when it was made from the same front (free). */
export async function reuseJacket(context: AiContext, key: string, record: BookRecord): Promise<boolean> {
  const front = frontOf(context.out, record)
  if (!front) return false
  const file = jacketFile(context.cacheDir, key, sha256(front))
  const metaFile = `${file.slice(0, -5)}.json`
  if (!existsSync(file) || !existsSync(metaFile)) return false
  const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as JacketMeta
  if (meta.promptVersion !== PROMPT_VERSION || meta.frontSha !== sha256(front)) return false
  const jacket = await cropJacket(readFileSync(file), meta.layout)
  if (await jacketPlaceholderShare(jacket) > PLACEHOLDER_LIMIT) return false
  await applyJacket(context, key, record, jacket, meta.frontSha)
  return true
}

const pendingFile = (context: AiContext) => join(context.cacheDir, 'batches.json')
export const readPending = (context: AiContext): PendingJob[] => (existsSync(pendingFile(context)) ? JSON.parse(readFileSync(pendingFile(context), 'utf8')) as PendingJob[] : [])
const writePending = (context: AiContext, jobs: PendingJob[]) => {
  mkdirSync(context.cacheDir, { recursive: true })
  writeFileSync(pendingFile(context), `${JSON.stringify(jobs, null, 1)}\n`)
}

/**
 * Collects finished batch jobs into the records. Polls every 30 s for up to
 * `waitMinutes`; returns the asset keys still waiting.
 */
export async function collectBatches(context: AiContext, records: Map<string, BookRecord>, waitMinutes: number): Promise<Set<string>> {
  const deadline = Date.now() + waitMinutes * 60_000
  let jobs = readPending(context)
  while (jobs.length) {
    const remaining: PendingJob[] = []
    for (const job of jobs) {
      const status = await context.tools.getImageBatch(job.name)
      if (status.state === 'pending' || status.state === 'running' || status.state === 'unknown') {
        remaining.push(job)
        continue
      }
      if (status.state !== 'succeeded') {
        context.log(`Batch ${job.name} ${status.state}; its ${job.books.length} Book(s) will be queued again.`)
        continue
      }
      for (const book of job.books) {
        const result = status.results.get(book.key)
        const record = records.get(book.key)
        if (!Buffer.isBuffer(result)) {
          context.log(`  ${book.title}: ${result ?? 'missing from batch'}; will be queued again`)
          continue
        }
        // Kept whatever happens next: a Book outside this run (or one whose front is back) reuses it for free.
        const jacket = await cropJacket(result, book.layout)
        const left = await jacketPlaceholderShare(jacket)
        if (left > PLACEHOLDER_LIMIT) {
          context.log(`  ${book.title}: ${Math.round(left * 100)}% of the Spine/back still placeholder colour; rejected, will be queued again`)
          continue
        }
        storeJacket(context, book.key, jacket, book.frontSha)
        const front = record ? frontOf(context.out, record) : null
        if (!record || !front) continue
        if (sha256(front) !== book.frontSha) {
          context.log(`  ${book.title}: front changed since the batch was sent; queued again`)
          continue
        }
        await applyJacket(context, book.key, record, jacket, book.frontSha)
        context.log(`✓ ${book.title}: AI back + Spine from batch, Spine fit ${Math.round(jacket.spineFit * 100)}%${jacket.stretched ? ' (detected folds)' : ''}`)
      }
    }
    jobs = remaining
    writePending(context, jobs)
    if (!jobs.length || Date.now() >= deadline) break
    context.log(`  waiting for ${jobs.length} batch job(s)… (${Math.ceil((deadline - Date.now()) / 60_000)} min left)`)
    await new Promise(resolve => setTimeout(resolve, 30_000))
  }
  return new Set(jobs.flatMap(job => job.books.map(book => book.key)))
}

/** Submits queued requests in jobs that stay under the inline size limit. */
export async function submitQueued(context: AiContext, queue: { request: ImageRequest, book: PendingBook }[]): Promise<void> {
  const jobs = readPending(context)
  let chunk: typeof queue = []
  let size = 0
  const flush = async () => {
    if (!chunk.length) return
    const name = await context.tools.submitImageBatch(chunk.map(item => item.request), `regal-assets-${new Date().toISOString().slice(0, 16)}`)
    jobs.push({ name, submittedAt: new Date().toISOString(), books: chunk.map(item => item.book) })
    writePending(context, jobs)
    context.log(`Submitted ${chunk.length} Book(s) as ${name} (≈ $${(chunk.length * BATCH_COST_USD).toFixed(2)})`)
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

export interface AiRun {
  /** Make images (false: only count what they would cost). */
  generate: boolean
  /** Direct calls at full price instead of the Batch API. */
  now: boolean
  /** Minutes to wait for a new batch job. */
  wait: number
}

/**
 * Gives the Books that want them their AI Spine/back: stored jackets first
 * (free), then batch results, then new requests. Returns how many images were
 * (or, without `generate`, would be) paid for and the keys still waiting.
 */
export async function runAi(context: AiContext, wanting: { key: string, book: Book, record: BookRecord }[], records: Map<string, BookRecord>, run: AiRun): Promise<{ images: number, waiting: Set<string>, reused: number }> {
  let reused = 0
  const open: typeof wanting = []
  for (const item of wanting) {
    if (await reuseJacket(context, item.key, item.record)) reused++
    else open.push(item)
  }
  if (reused) context.log(`AI: ${reused} Spine/back pair(s) cut again from stored jackets (free).`)
  if (!run.generate) {
    const pending = new Set(readPending(context).flatMap(job => job.books.map(book => book.key)))
    return { images: open.filter(item => !pending.has(item.key)).length, waiting: pending, reused }
  }

  const waiting = await collectBatches(context, records, 0)
  const queue: { request: ImageRequest, book: PendingBook }[] = []
  let images = 0
  for (const { key, book, record } of open) {
    if (!record.needsAi || waiting.has(key)) continue
    const front = frontOf(context.out, record)
    if (!front) continue
    const frontSha = sha256(front)
    if (run.now) {
      const started = Date.now()
      const jacket = await context.tools.generateJacket(book, front)
      images++
      const left = await jacketPlaceholderShare(jacket)
      if (left > PLACEHOLDER_LIMIT) {
        context.log(`  AI ${book.title}: ${Math.round(left * 100)}% of the Spine/back still placeholder colour; rejected (run again to retry)`)
        continue
      }
      await applyJacket(context, key, record, jacket, frontSha)
      context.log(`  AI ${book.title}: done in ${Math.round((Date.now() - started) / 1000)} s, Spine fit ${Math.round(jacket.spineFit * 100)}%`)
    }
    else {
      const { layout, request } = await context.tools.jacketRequest(book, front, key, 'jpeg')
      queue.push({ request, book: { key, title: book.title, layout, frontSha } })
      images++
    }
  }
  if (queue.length) {
    await submitQueued(context, queue)
    if (run.wait > 0) {
      context.log(`Waiting up to ${run.wait} min for the batch (Ctrl+C is fine: the next run collects it).`)
      const still = await collectBatches(context, records, run.wait)
      if (still.size) context.log(`${still.size} Book(s) still in a batch job; run again later to collect them.`)
      return { images, waiting: still, reused }
    }
  }
  return { images, waiting: new Set([...waiting, ...queue.map(item => item.book.key)]), reused }
}
