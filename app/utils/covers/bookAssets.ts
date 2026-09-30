// Book asset set (first cut of #20): real or AI-made faces for a Book, listed
// in /book-assets/manifest.json and keyed by ISBN-13 (Goodreads Book Id as
// fallback). A face that's present replaces the generated one; everything
// else falls back to the Cover resolver and the drawn Spine/back.
import { schedule } from './coverTextures'

export type AssetSource = 'photo' | 'ai'

export interface BookAssetEntry {
  /** URLs relative to /book-assets/. */
  front?: string
  spine?: string
  back?: string
  source?: AssetSource
}

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

const BASE = '/book-assets/'
let manifest: Promise<AssetManifest> | null = null

/** The manifest, fetched once; an absent or broken one means no assets. */
export function loadAssetManifest(): Promise<AssetManifest> {
  manifest ??= fetch(`${BASE}manifest.json`)
    .then(response => (response.ok ? response.json() as Promise<AssetManifest> : {}))
    .catch(() => ({}))
  return manifest
}

/** The manifest entry for a Book: ISBN-13 first, then Goodreads Book Id. */
export function assetEntryFor(book: AssetBook, entries: AssetManifest): BookAssetEntry | null {
  const isbn = book.isbn13?.replace(/\D/g, '')
  return (isbn && entries[isbn]) || entries[book.id] || null
}

export const assetUrl = (path: string) => (/^(https?:)?\//.test(path) ? path : `${BASE}${path}`)

function loadImage(src: string): Promise<HTMLImageElement | undefined> {
  return schedule(() => new Promise<HTMLImageElement | undefined>((resolve) => {
    const image = new Image()
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
