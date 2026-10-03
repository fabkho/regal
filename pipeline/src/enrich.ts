// One Book of the input library file → its asset set: what the file already
// has and is good enough is kept (copied next to the output file), the rest
// is looked up (front chain, blurb) and drawn from (pile copies, colours).
// AI Spines/backs are ai.ts; this only notes that a Book wants them.
//
// Incremental: a Book's fingerprint covers everything its assets are made
// from (the fields that size and describe it, its input images' content, its
// photo drop-ins, the pipeline version). Same fingerprint and files still
// there → nothing is done for it.
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import type { Quote } from './assets/backText'
import { mapGenre } from './assets/backText'
import type { BlurbResult } from './assets/blurb'
import type { AppleHit, FrontOptions, FrontResult } from './assets/front'
import { isPlaceholder, MIN_HEIGHT } from './assets/front'
import { PROMPT_VERSION } from './assets/jacket'
import type { PhotoFace } from './assets/photos'
import { convertPhoto, photoFacesIn, photoFileFor, photoFiles } from './assets/photos'
import type { PileFields } from './assets/pile'
import { updatePile } from './assets/pile'
import type { Book, LibraryBook, LibraryBookAssets, LibraryBookFace, LibraryQuote } from './layer'
import { libraryBookToBook } from './layer'
import type { InputBase, LoadedImage } from './load'
import { resolveRef } from './load'
import { guessLanguage, isbnLanguage } from './resolvers/descriptions'
import { compact, isHttpUrl, sha256, stableJson, writeIfChanged } from './util'

/** Bump when a change here should rebuild every Book. */
export const PIPELINE_VERSION = 1

const FACES: LibraryBookFace[] = ['front', 'spine', 'back']
/** Longest side of a stored face, as today's asset sets. */
export const FACE_HEIGHT = 1600
const QUALITY: Record<LibraryBookFace, number> = { front: 88, spine: 90, back: 88 }

/** What Regal assets made of one Book (kept in the state file between runs). */
export interface BookRecord {
  fingerprint: string
  /** References relative to the output file: `<key>/front.webp`. */
  assets: LibraryBookAssets
  /** Text the pipeline filled in because the input had none. */
  text: { description?: string, publisher?: string, genre?: string, quotes?: LibraryQuote[] }
  /** Spine and/or back art is missing and could be generated (there is a front, they aren't photographed). */
  needsAi: boolean
  meta: {
    front?: { source: string, size: string, url?: string }
    blurb?: { source: string, method: string }
    ai?: Record<string, unknown>
    notes?: string[]
    /** A lookup found nothing (no front, no blurb): looked for again after this time (ISO). */
    retryAt?: string
  }
}

/** The lookups enrichment uses; injected so tests run offline. */
export interface Tools {
  resolveFront: (book: Book, options: FrontOptions) => Promise<FrontResult | null>
  findApple: (book: Book, options: FrontOptions) => Promise<AppleHit | null>
  resolveBlurb: (appleDescription: string | null, libraryDescription: string | null, useModel: boolean) => Promise<BlurbResult>
  resolveDescription: (book: Book) => Promise<string | null>
  resolvePublisher: (isbn13: string | null) => Promise<string | null>
  resolveQuotes: (description: string | null) => Promise<Quote[]>
}

export interface EnrichContext {
  /** Output folder: the library file and `<key>/` asset folders. */
  out: string
  /** Photo drop-ins: `<photos>/<key>/front.jpg` …; null for none. */
  photos: string | null
  base: InputBase
  load: (location: string) => Promise<LoadedImage | null>
  tools: Tools
  /** May the Gemini text model be asked (blurb cutting, quotes)? */
  model: boolean
  force: boolean
  /** Current time (ms), for retrying failed lookups. */
  now: number
}

/** How long a Book whose lookups found nothing waits before they are tried again. */
export const RETRY_AFTER_MS = 20 * 60 * 60 * 1000

export type EnrichOutcome = 'cached' | 'built'

/** Folder name of a Book's asset set: the ISBN-13, else the id (made path-safe). */
export function assetKey(book: Pick<LibraryBook, 'id' | 'isbn13'>): string {
  if (book.isbn13) return book.isbn13
  return /^[\w.-]{1,80}$/.test(book.id) && !/^\.+$/.test(book.id) ? book.id : `id-${sha256(book.id).slice(0, 16)}`
}

/** The edition's language: its ISBN's, else its blurb's, else English (the file doesn't say). */
const languageOf = (book: Pick<LibraryBook, 'isbn13' | 'description'>) => isbnLanguage(book.isbn13) ?? guessLanguage(book.description ?? '') ?? 'en'

interface Inputs {
  images: Partial<Record<LibraryBookFace, LoadedImage>>
  drops: PhotoFace[]
  dropSignature: string[]
}

async function gatherInputs(book: LibraryBook, key: string, context: EnrichContext): Promise<Inputs> {
  const images: Inputs['images'] = {}
  for (const face of FACES) {
    const ref = book.assets?.[face]
    const location = ref ? resolveRef(ref, context.base) : null
    const image = location ? await context.load(location) : null
    if (image) images[face] = image
  }
  const folder = context.photos ? join(context.photos, key) : null
  const files = folder ? photoFiles(folder) : []
  const drops = photoFacesIn(files)
  const dropSignature = drops.map((face) => {
    const file = photoFileFor(files, face)!
    const stat = statSync(join(folder!, file))
    return `${file}:${stat.size}:${Math.round(stat.mtimeMs)}`
  })
  return { images, drops, dropSignature }
}

/** Everything a Book's assets are made from, as one hash. */
export function fingerprintOf(book: LibraryBook, inputs: Pick<Inputs, 'images' | 'dropSignature'>): string {
  return sha256(stableJson({
    pipeline: PIPELINE_VERSION,
    prompt: PROMPT_VERSION,
    book: [book.id, book.isbn13, book.isbn10, book.title, book.seriesTitle, book.authors, book.pages, book.binding],
    text: [book.description, book.publisher, book.genre, book.quotes],
    assets: [book.assets?.front, book.assets?.spine, book.assets?.back, book.assets?.photoFaces, book.assets?.source, book.assets?.palette],
    images: FACES.map(face => inputs.images[face]?.sha ?? null),
    photos: inputs.dropSignature,
  }))
}

/** Files a record's assets point at, all present in the output folder. */
export function recordComplete(out: string, record: BookRecord): boolean {
  const assets = record.assets
  const refs = [assets.front, assets.spine, assets.back, assets.pile?.front, assets.pile?.spine].filter((ref): ref is string => Boolean(ref))
  return refs.every(ref => existsSync(join(out, ref)))
}

/** A face as stored: WebP up to FACE_HEIGHT tall; a WebP that already is one is copied byte for byte. */
async function storeFace(out: string, key: string, face: LibraryBookFace, image: { bytes: Buffer, height: number, format: string }): Promise<{ ref: string, bytes: Buffer }> {
  const bytes = image.format === 'webp' && image.height <= FACE_HEIGHT
    ? image.bytes
    : await sharp(image.bytes).resize({ height: FACE_HEIGHT, withoutEnlargement: true }).webp({ quality: QUALITY[face] }).toBuffer()
  const ref = `${key}/${face}.webp`
  writeIfChanged(join(out, ref), bytes)
  return { ref, bytes }
}

const size = (image: { width: number, height: number }) => `${image.width}x${image.height}`

/**
 * Brings one Book's asset set up to date. `previous` is what an earlier run
 * made of it (reused when nothing it depends on changed).
 */
export async function enrichBook(book: LibraryBook, previous: BookRecord | undefined, context: EnrichContext): Promise<{ record: BookRecord, outcome: EnrichOutcome, key: string }> {
  const key = assetKey(book)
  const inputs = await gatherInputs(book, key, context)
  const fingerprint = fingerprintOf(book, inputs)
  const retry = previous?.meta.retryAt !== undefined && Date.parse(previous.meta.retryAt) <= context.now
  if (previous && previous.fingerprint === fingerprint && !context.force && !retry && recordComplete(context.out, previous)) {
    return { record: previous, outcome: 'cached', key }
  }

  const { out } = context
  const notes: string[] = []
  let missed = false
  const assets: LibraryBookAssets = {}
  const photoFaces = new Set<LibraryBookFace>()
  const inputPhotos = new Set(book.assets?.photoFaces ?? [])
  const regal = { ...libraryBookToBook(book), coverUrl: null }
  const language = languageOf(book)
  const meta: BookRecord['meta'] = {}

  // 1. Photo drop-ins: the owner's own copy beats everything.
  const folder = context.photos ? join(context.photos, key) : null
  if (folder) {
    const files = photoFiles(folder)
    for (const face of inputs.drops) {
      const bytes = await convertPhoto(folder, photoFileFor(files, face)!)
      assets[face] = (await storeFace(out, key, face, { bytes, height: FACE_HEIGHT, format: 'webp' })).ref
      photoFaces.add(face)
    }
  }

  // 2. Spine and back the file brings: kept as they are.
  const adopted = new Set<LibraryBookFace>()
  for (const face of ['spine', 'back'] as const) {
    const image = inputs.images[face]
    if (assets[face] || !image) continue
    if (face === 'spine' ? image.height <= 200 || image.width < 8 : isPlaceholder(image.width, image.height)) {
      notes.push(`input ${face} too small (${size(image)}), dropped`)
      continue
    }
    assets[face] = (await storeFace(out, key, face, image)).ref
    adopted.add(face)
    if (inputPhotos.has(face)) photoFaces.add(face)
  }

  // 3. The front: the file's when it is good enough, else the front chain (the file's one competing).
  let frontResult: FrontResult | null = null
  if (!assets.front) {
    const given = inputs.images.front
    const keep = given && (inputPhotos.has('front') || book.assets?.source === 'ai' || (!isPlaceholder(given.width, given.height) && given.height >= MIN_HEIGHT))
    if (given && keep) {
      assets.front = (await storeFace(out, key, 'front', given)).ref
      adopted.add('front')
      if (inputPhotos.has('front')) photoFaces.add('front')
      meta.front = { source: 'input', size: size(given), url: given.location }
    }
    else {
      // The file's front takes the place today's chain gives the tracker's own Cover: after the
      // edition's stores, before Open Library; a work-wide title match never replaces it.
      const fallback = given && !isPlaceholder(given.width, given.height) ? given : null
      frontResult = await context.tools.resolveFront({ ...regal, coverUrl: fallback && isHttpUrl(fallback.location) ? fallback.location : null }, { language })
      const better = frontResult && frontResult.url !== fallback?.location && !(fallback && frontResult.source.includes('(work)'))
      if (frontResult && better && (!fallback || frontResult.height > fallback.height)) {
        const meta0 = await sharp(frontResult.image).metadata()
        assets.front = (await storeFace(out, key, 'front', { bytes: frontResult.image, height: meta0.height ?? frontResult.height, format: meta0.format ?? 'unknown' })).ref
        meta.front = { source: frontResult.source, size: size(frontResult), url: frontResult.url }
      }
      else if (fallback) {
        assets.front = (await storeFace(out, key, 'front', fallback)).ref
        adopted.add('front')
        meta.front = { source: 'input', size: size(fallback), url: fallback.location }
        notes.push(`front below ${MIN_HEIGHT} px (${size(fallback)}), nothing better found`)
      }
      else {
        notes.push('no front found (Regal draws a placeholder)')
        missed = true
      }
    }
  }

  // 4. Words for a Book without a blurb (the display has no resolver any more).
  const text: BookRecord['text'] = {}
  if (!book.description?.trim()) {
    const apple = frontResult
      ? { description: frontResult.appleDescription ?? undefined, genres: frontResult.appleGenres }
      : await context.tools.findApple(regal, { language })
    const blurb = await context.tools.resolveBlurb(apple?.description ?? null, null, context.model)
    let description = blurb.text
    meta.blurb = { source: blurb.source, method: blurb.method }
    if (!description) {
      description = (await context.tools.resolveDescription(regal)) ?? ''
      if (description) meta.blurb = { source: 'lookup', method: 'rules' }
    }
    if (description) text.description = description
    else {
      notes.push('no blurb found')
      missed = true
    }
    if (!book.genre) {
      const genre = mapGenre(apple?.genres)
      if (genre) text.genre = genre
    }
    if (!book.publisher) {
      const publisher = await context.tools.resolvePublisher(book.isbn13 ?? null)
      if (publisher) text.publisher = publisher
    }
    if (!book.quotes?.length && context.model && apple?.description) {
      const quotes = await context.tools.resolveQuotes(apple.description)
      if (quotes.length) text.quotes = quotes
    }
  }

  // 5. Pile copies and colours from the faces the Book now has.
  const pileFields: PileFields = { front: assets.front ?? undefined, spine: assets.spine ?? undefined }
  try {
    await updatePile(out, pileFields)
  }
  catch (error) {
    notes.push(`no pile copies (${error instanceof Error ? error.message : String(error)})`)
  }
  if (pileFields.pile) assets.pile = pileFields.pile
  if (pileFields.palette) assets.palette = pileFields.palette
  else if (book.assets?.palette) assets.palette = book.assets.palette
  if (pileFields.spineColor) assets.spineColor = pileFields.spineColor

  const photographed = FACES.filter(face => photoFaces.has(face))
  if (photographed.length) assets.photoFaces = photographed
  if (photographed.length === 3) assets.source = 'photo'
  else if (book.assets?.source === 'ai' && (adopted.has('spine') || adopted.has('back'))) assets.source = 'ai'

  const needsAi = Boolean(assets.front) && !(assets.spine && assets.back) && !(photoFaces.has('spine') && photoFaces.has('back'))
  if (notes.length) meta.notes = notes
  if (missed) meta.retryAt = new Date(context.now + RETRY_AFTER_MS).toISOString()
  return { record: { fingerprint, assets: compact(assets), text, needsAi, meta }, outcome: 'built', key }
}

/** Faces of a record and where they came from, for the run's summary. */
export const recordFaces = (record: BookRecord) => FACES.filter(face => record.assets[face])
