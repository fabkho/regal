// Client-side Cover loading: fetches Cover images through the same-origin
// Cover resolver, turns them into textures and measures their average colour
// (used for the Spine). Loads a few at a time so a big Library doesn't flood
// the resolver, and caches per URL for the page's lifetime.
import { SRGBColorSpace, TextureLoader } from 'three'
import type { Texture } from 'three'
import { coverUrl } from './coverUrl'
import type { CoverBook } from './coverUrl'
import { spinePalette } from './palette'
import type { SpinePalette } from './palette'

export interface LoadedCover {
  texture: Texture
  image: HTMLImageElement
  /** Spine colours derived from the Cover (left edge + palette). */
  palette: SpinePalette
}

const MAX_IN_FLIGHT = 6
const loader = new TextureLoader()
const cache = new Map<string, Promise<LoadedCover | null>>()
const queue: (() => void)[] = []
let inFlight = 0

function next() {
  if (inFlight >= MAX_IN_FLIGHT) return
  const start = queue.shift()
  if (!start) return
  inFlight++
  start()
}

function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(() => {
      task().then(resolve, reject).finally(() => {
        inFlight--
        next()
      })
    })
    next()
  })
}

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

/** Loads a Book's Cover once per URL; resolves null when there is none. */
export function loadCover(book: CoverBook): Promise<LoadedCover | null> {
  const url = coverUrl(book)
  let pending = cache.get(url)
  if (!pending) {
    pending = schedule(() => loader.loadAsync(url))
      .then((texture) => {
        texture.colorSpace = SRGBColorSpace
        texture.anisotropy = 4
        const image = texture.image as HTMLImageElement
        return { texture, image, palette: paletteOf(image) }
      })
      .catch(() => null)
    cache.set(url, pending)
  }
  return pending
}
