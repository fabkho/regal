// Book asset set (first cut of #20): real or AI-made faces for a Book, listed
// in manifest.json under the assets base (default /book-assets/, see
// setAssetsBase) and keyed by ISBN-13 (Goodreads Book Id as fallback). A
// face that's present replaces the generated one; everything else falls back
// to the Cover resolver and the drawn Spine/back.
//
// Newer manifests also list small pile copies of the front and Spine and the
// Spine colours (scripts/assets/pile.ts); older ones don't, and then the full
// faces and colours sampled from the front stand in.
import { fromHex } from './palette'
import type { RGB, SpinePalette } from './palette'

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
  /** Small copies for the pile: the front and Spine at a few hundred pixels. */
  pile?: { front?: string, spine?: string }
  /** Spine colours taken from the front, as hex. */
  palette?: { background: string, text: string, accent: string }
  /** Average colour of the Spine art, as hex. */
  spineColor?: string
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

/** Where a Book's faces are and what the manifest already knows about them. */
export interface AssetFaces {
  entry: BookAssetEntry
  /** The Spine art for the pile (its small copy when there is one). */
  spine?: string
  /** The front for the pile (its small copy when there is one). */
  pileFront?: string
  /** The front at full size, for a Book taken out. */
  front?: string
  back?: string
  /** Spine colours from the manifest; null when they must come from the front. */
  palette: SpinePalette | null
  /** Average colour of the Spine art, from the manifest. */
  spineColor: RGB | null
}

const hex = (value: unknown): RGB | null => (typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? fromHex(value) : null)

/** The faces of a manifest entry, small pile copies preferred (`url` resolves paths). */
export function assetFaces(entry: BookAssetEntry, url: (path: string) => string = assetUrl): AssetFaces {
  const at = (path: string | undefined) => (path ? url(path) : undefined)
  const [background, text, accent] = [entry.palette?.background, entry.palette?.text, entry.palette?.accent].map(hex)
  return {
    entry,
    spine: at(entry.pile?.spine ?? entry.spine),
    pileFront: at(entry.pile?.front ?? entry.front),
    front: at(entry.front),
    back: at(entry.back),
    palette: background && text && accent ? { background, text, accent } : null,
    spineColor: hex(entry.spineColor),
  }
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

/** A Book's faces from the manifest; null when it has nothing for the Book. */
export async function assetFacesFor(book: AssetBook): Promise<AssetFaces | null> {
  const entry = assetEntryFor(book, await loadAssetManifest())
  return entry ? assetFaces(entry) : null
}
