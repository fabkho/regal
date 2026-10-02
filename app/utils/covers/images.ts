// Images for Book textures: fetched through the load queue, then decoded off
// the main thread (createImageBitmap on the response body), already scaled to
// the size the texture needs. Drawing a decoded bitmap is cheap, where drawing
// a freshly loaded <img> decodes it on the main thread first (about 11 ms for
// a 1600 px front, a dropped frame each).
import { schedule } from './loadQueue'
import type { Priority } from './loadQueue'

/** A decoded picture, ready to draw on a canvas. */
export type Picture = CanvasImageSource & { width: number, height: number }

/** Fetches an image's bytes in the load queue; null when it isn't there or was dropped (`signal`). */
export function fetchImage(url: string, priority?: Priority, signal?: AbortSignal): Promise<Blob | null> {
  return schedule(async () => {
    // Same-origin or CORS (a CDN bucket): the canvases it is drawn on must stay untainted.
    const response = await fetch(url, { mode: 'cors', credentials: 'same-origin', signal })
    return response.ok ? response.blob() : null
  }, priority, signal).catch(() => null)
}

/**
 * Decodes an image, scaled to `size` when given (one side keeps the aspect
 * ratio). Falls back to the full size, then to an <img>, where the browser
 * can't resize or decode bitmaps.
 */
export async function decodeImage(blob: Blob, size?: { width?: number, height?: number }): Promise<Picture | null> {
  if (typeof createImageBitmap === 'function') {
    if (size) {
      try {
        return await createImageBitmap(blob, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' })
      }
      catch {
        // No resizing here: decode at full size below.
      }
    }
    try {
      return await createImageBitmap(blob)
    }
    catch {
      // No bitmaps for this format here: an <img> below.
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return image
  }
  catch {
    return null
  }
  finally {
    URL.revokeObjectURL(url)
  }
}

/** Fetches and decodes an image, scaled to `height` pixels when given; null once `signal` aborts. */
export async function loadPicture(url: string, priority?: Priority, height?: number, signal?: AbortSignal): Promise<Picture | null> {
  const blob = await fetchImage(url, priority, signal)
  return blob && !signal?.aborted ? decodeImage(blob, height ? { height } : undefined) : null
}

/** Copies a picture onto a canvas (a texture three.js can flip like any other). */
export function toCanvas(picture: Picture, height = picture.height): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.height = Math.max(1, Math.round(height))
  canvas.width = Math.max(1, Math.round(picture.width * canvas.height / picture.height))
  const context = canvas.getContext('2d')!
  context.imageSmoothingQuality = 'high'
  context.drawImage(picture, 0, 0, canvas.width, canvas.height)
  return canvas
}
