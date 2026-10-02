// Client-side Cover loading: fetches Cover images (an asset set's front, else
// through the same-origin Cover resolver), turns them into textures and takes
// their Spine colours. Loads a few at a time, the most urgent first
// (loadQueue.ts), decodes off the main thread (images.ts) and caches per URL
// for the page's lifetime.
//
// A Book in the pile or on a Shelf barely shows its Cover, so its texture is
// a small copy (COVER_PREVIEW_HEIGHT); only the picked Book gets the full
// image (loadFullCover). A whole reading history at full size would take
// close to a gigabyte of GPU memory.
import { CanvasTexture, SRGBColorSpace } from 'three'
import type { Texture } from 'three'
import { coverUrl } from './coverUrl'
import type { CoverBook } from './coverUrl'
import { spinePalette } from './palette'
import type { SpinePalette } from './palette'
import { decodeImage, fetchImage, toCanvas } from './images'
import type { Picture } from './images'
import type { Priority } from './loadQueue'

export { schedule } from './loadQueue'

export interface LoadedCover {
  /** Small copy for Books in the pile / on a Shelf. */
  texture: Texture
  /** The small copy as a picture (Spine/back drawing). */
  image: Picture
  /** Spine colours derived from the Cover (left edge + palette). */
  palette: SpinePalette
}

const cache = new Map<string, Promise<LoadedCover | null>>()

/** Frees a decoded bitmap once it has been copied. */
const close = (picture: Picture | null) => {
  if (picture && 'close' in picture && typeof picture.close === 'function') picture.close()
}

/** Spine palette of a Cover, sampled on a 48 × 72 copy. */
function paletteOf(image: CanvasImageSource): SpinePalette {
  const width = 48
  const height = 72
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(image, 0, 0, width, height)
  const colours = spinePalette(context.getImageData(0, 0, width, height).data, width, height)
  canvas.width = 0
  return colours
}

/** Height in pixels of the Cover texture of a Book that isn't picked. */
export const COVER_PREVIEW_HEIGHT = 512

function coverTexture(canvas: HTMLCanvasElement, anisotropy: number): Texture {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = anisotropy
  return texture
}

/**
 * Loads a Book's Cover once per URL; resolves null when there is none. `url`
 * overrides the resolver (an asset set's front, best its small pile copy);
 * `priority` ranks it in the load queue.
 */
export function loadCover(book: CoverBook, url = coverUrl(book), priority?: Priority): Promise<LoadedCover | null> {
  let pending = cache.get(url)
  if (!pending) {
    pending = fetchImage(url, priority)
      .then(async (blob) => {
        if (!blob) return null
        const [preview, sample] = await Promise.all([
          decodeImage(blob, { height: COVER_PREVIEW_HEIGHT }),
          decodeImage(blob, { width: 48, height: 72 }),
        ])
        try {
          if (!preview) return null
          const canvas = toCanvas(preview, Math.min(preview.height, COVER_PREVIEW_HEIGHT))
          return { texture: coverTexture(canvas, 4), image: canvas, palette: paletteOf(sample ?? canvas) }
        }
        finally {
          // Copied (or of no use): the bitmaps go either way.
          close(preview)
          close(sample)
        }
      })
      .catch(() => null)
    cache.set(url, pending)
  }
  return pending
}

const full = new Map<string, Promise<Texture | null>>()
/** Full-size Covers fetched ahead (a Book the pointer rests on), the latest few. */
const ahead = new Map<string, Promise<Blob | null>>()
const AHEAD_KEPT = 4

/** Fetches a full-size Cover ahead of its Book being taken out (bytes only, no texture yet). */
export function prefetchFullCover(url: string, priority?: Priority) {
  if (ahead.has(url) || full.has(url)) return
  ahead.set(url, fetchImage(url, priority))
  if (ahead.size > AHEAD_KEPT) ahead.delete(ahead.keys().next().value!)
}

/** The Cover at full resolution, for the picked Book; shared until releaseFullCover. */
export function loadFullCover(url: string, priority?: Priority): Promise<Texture | null> {
  let pending = full.get(url)
  if (!pending) {
    const bytes = ahead.get(url)
    ahead.delete(url)
    pending = (bytes ?? fetchImage(url, priority))
      .then(async (blob) => {
        const picture = blob ? await decodeImage(blob) : null
        if (!picture) return null
        const texture = coverTexture(toCanvas(picture), 8)
        close(picture)
        return texture
      })
      .catch(() => null)
    full.set(url, pending)
  }
  return pending
}

/** Frees the full-resolution Cover once no Book shows it any more. */
export function releaseFullCover(url: string) {
  const pending = full.get(url)
  full.delete(url)
  void pending?.then((texture) => {
    if (!texture) return
    ;(texture.image as HTMLCanvasElement).width = 0
    texture.dispose()
  })
}
