// Book asset set (first cut of #20): real or AI-made faces for a Book, listed
// in manifest.json under the assets base (default /book-assets/, see
// setAssetsBase) and keyed by ISBN-13 (Goodreads Book Id as fallback). A
// face that's present replaces the generated one; everything else falls back
// to the Cover resolver and the drawn Spine/back.
import { schedule } from './coverTextures'

export type AssetSource = 'photo' | 'ai'

/** A face of the Book that the owner photographed rather than us generating it. */
export type PhotoFace = 'front' | 'spine' | 'back'

/** A line of praise from the publisher copy, printed on the back cover. */
export interface AssetQuote {
  text: string
  source: string
}

export interface BookAssetEntry {
  /** URLs relative to the assets base (default /book-assets/). */
  front?: string
  spine?: string
  back?: string
  source?: AssetSource
  /** The cleaned blurb for this edition. */
  description?: string
  /** Up to two verified praise quotes from the publisher description. */
  quotes?: AssetQuote[]
  /** Shelf category as printed on a back cover: 'SCIENCE FICTION'. */
  genre?: string
  /** Publisher imprint, as printed at the foot of the back cover. */
  publisher?: string
  /** Faces that come from the owner's own photographs: drawn as they are. */
  photoFaces?: PhotoFace[]
  /** Pipeline bookkeeping (prompt version, sources, sizes…). */
  meta?: Record<string, unknown>
}

/** True when `face` of this Book is a photo of the real thing, not artwork. */
export const isPhotoFace = (entry: BookAssetEntry | null | undefined, face: PhotoFace): boolean =>
  Boolean(entry?.photoFaces?.includes(face))

export type AssetManifest = Record<string, BookAssetEntry>

export interface AssetBook {
  id: string
  isbn13: string | null
}

export interface LoadedAssets {
  entry: BookAssetEntry
  frontUrl?: string
  spine?: HTMLImageElement
  back?: HTMLImageElement
}

let base = '/book-assets/'
let manifest: Promise<AssetManifest> | null = null

/** Where manifest.json and the images live (runtimeConfig.public.regal.assetsBase). */
export function setAssetsBase(value: string) {
  const next = value.endsWith('/') ? value : `${value}/`
  if (next === base) return
  base = next
  manifest = null
}

/** The manifest, fetched once; an absent or broken one means no assets. */
export function loadAssetManifest(): Promise<AssetManifest> {
  manifest ??= fetch(`${base}manifest.json`)
    .then(response => (response.ok ? response.json() as Promise<AssetManifest> : {}))
    .catch(() => ({}))
  return manifest
}

/** The manifest entry for a Book: ISBN-13 first, then Goodreads Book Id. */
export function assetEntryFor(book: AssetBook, entries: AssetManifest): BookAssetEntry | null {
  const isbn = book.isbn13?.replace(/\D/g, '')
  return (isbn && entries[isbn]) || entries[book.id] || null
}

export const assetUrl = (path: string) => (/^(https?:)?\//.test(path) ? path : `${base}${path}`)

function loadImage(src: string): Promise<HTMLImageElement | undefined> {
  return schedule(() => new Promise<HTMLImageElement | undefined>((resolve) => {
    const image = new Image()
    // Asset sets may live on another origin (e.g. a CDN bucket): without CORS the
    // image would taint the canvas the Spine/back textures are drawn on.
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(undefined)
    image.src = src
  }))
}

/** A Book's asset faces, loaded; null when the manifest has nothing for it. */
export async function loadAssets(book: AssetBook): Promise<LoadedAssets | null> {
  const entry = assetEntryFor(book, await loadAssetManifest())
  if (!entry) return null
  const [spine, back] = await Promise.all([
    entry.spine ? loadImage(assetUrl(entry.spine)) : undefined,
    entry.back ? loadImage(assetUrl(entry.back)) : undefined,
  ])
  return { entry, frontUrl: entry.front ? assetUrl(entry.front) : undefined, spine, back }
}
