// Client-side Cover loading: fetches Cover images through the same-origin
// Cover resolver, turns them into textures and measures their average colour
// (used for the Spine). Loads a few at a time, the most urgent first
// (loadQueue.ts), and caches per URL for the page's lifetime.
//
// A Book in the pile or on a Shelf barely shows its Cover, so its texture is
// a small copy (COVER_PREVIEW_HEIGHT); only the picked Book gets the full
// image (fullCoverTexture). A whole reading history at full size would take
// close to a gigabyte of GPU memory.
import { CanvasTexture, ImageLoader, SRGBColorSpace, Texture } from 'three'
import { coverUrl } from './coverUrl'
import type { CoverBook } from './coverUrl'
import { spinePalette } from './palette'
import type { SpinePalette } from './palette'
import { schedule } from './loadQueue'
import type { Priority } from './loadQueue'

export { schedule } from './loadQueue'

export interface LoadedCover {
  /** Small copy for Books in the pile / on a Shelf. */
  texture: Texture
  /** The full image (Spine/back drawing, fullCoverTexture). */
  image: HTMLImageElement
  /** Spine colours derived from the Cover (left edge + palette). */
  palette: SpinePalette
}

const cache = new Map<string, Promise<LoadedCover | null>>()

/** Spine palette of a Cover image, sampled on a small canvas. */
function paletteOf(image: CanvasImageSource): SpinePalette {
  const width = 48
  const height = 72
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(image, 0, 0, width, height)
  return spinePalette(context.getImageData(0, 0, width, height).data, width, height)
}

/** Height in pixels of the Cover texture of a Book that isn't picked. */
export const COVER_PREVIEW_HEIGHT = 512

/** A Cover texture no taller than `height` (the image itself when it already is). */
function previewTexture(image: HTMLImageElement, height = COVER_PREVIEW_HEIGHT): Texture {
  let texture: Texture
  if (image.naturalHeight <= height) {
    texture = new Texture(image)
  }
  else {
    const canvas = document.createElement('canvas')
    canvas.height = height
    canvas.width = Math.max(1, Math.round(image.naturalWidth * height / image.naturalHeight))
    const context = canvas.getContext('2d')!
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    texture = new CanvasTexture(canvas)
  }
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

const full = new WeakMap<LoadedCover, Texture>()

/** The Cover at full resolution, for the picked Book; shared until releaseFullCover. */
export function fullCoverTexture(loaded: LoadedCover): Texture {
  let texture = full.get(loaded)
  if (!texture) {
    texture = new Texture(loaded.image)
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 8
    texture.needsUpdate = true
    full.set(loaded, texture)
  }
  return texture
}

/** Frees the full-resolution Cover once no Book shows it any more. */
export function releaseFullCover(loaded: LoadedCover) {
  full.get(loaded)?.dispose()
  full.delete(loaded)
}

const imageLoader = new ImageLoader()

/**
 * Loads a Book's Cover once per URL; resolves null when there is none. `url`
 * overrides the resolver (asset set); `priority` ranks it in the load queue.
 */
export function loadCover(book: CoverBook, url = coverUrl(book), priority?: Priority): Promise<LoadedCover | null> {
  let pending = cache.get(url)
  if (!pending) {
    pending = schedule(() => imageLoader.loadAsync(url), priority)
      .then((image) => {
        return { texture: previewTexture(image), image, palette: paletteOf(image) }
      })
      .catch(() => null)
    cache.set(url, pending)
  }
  return pending
}
