// Client-side Cover loading: fetches Cover images through the same-origin
// Cover resolver, turns them into textures and measures their average colour
// (used for the Spine). Loads a few at a time so a big Library doesn't flood
// the resolver, and caches per URL for the page's lifetime.
import { SRGBColorSpace, TextureLoader } from 'three'
import type { Texture } from 'three'
import { coverUrl } from './coverUrl'
import type { CoverBook } from './coverUrl'

export interface LoadedCover {
  texture: Texture
  /** Average colour of the Cover as a CSS hex string. */
  color: string
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

/** Average colour of an image, sampled on a small canvas. */
export function averageColor(image: CanvasImageSource): string {
  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return '#6B5A45'
  context.drawImage(image, 0, 0, size, size)
  const { data } = context.getImageData(0, 0, size, size)
  let r = 0
  let g = 0
  let b = 0
  const pixels = data.length / 4
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]!
    g += data[i + 1]!
    b += data[i + 2]!
  }
  const hex = (value: number) => Math.round(value / pixels).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
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
        return { texture, color: averageColor(texture.image as CanvasImageSource) }
      })
      .catch(() => null)
    cache.set(url, pending)
  }
  return pending
}
