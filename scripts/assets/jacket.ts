// AI back + spine (#22): the real front on a flat wraparound layout, Gemini
// paints back and spine without any text, we crop them out. The model
// sometimes paints a narrower spine than asked and continues the front art
// into the rest of the band, so the real fold is detected and, if needed,
// that band is stretched to the Spine's width.
import sharp from 'sharp'
import type { Book } from '../../shared/types/book'
import { bookDimensions } from '../../app/utils/bookcase/layout'
import { generateImage } from './gemini'
import type { ImageRequest } from './gemini'

export const PROMPT_VERSION = 2

const CANVASES = [
  { ratio: '3:2', width: 2528, height: 1696 },
  { ratio: '16:9', width: 2752, height: 1536 },
  { ratio: '21:9', width: 3168, height: 1344 },
]

export interface JacketLayout {
  ratio: string
  width: number
  height: number
  frontWidth: number
  spineWidth: number
  /** x where the spine starts (back/spine fold) and the front starts (spine/front fold). */
  spineX: number
  frontX: number
}

export interface JacketResult {
  jacket: Buffer
  spine: Buffer
  back: Buffer
  layout: JacketLayout
  /** Width of the spine the model actually painted, as a share of the one asked for. */
  spineFit: number
  stretched: boolean
}

/** Spine width / front width, from the same dimensions the 3D Book gets. */
export function spineRatio(book: Book): number {
  const { thickness, depth } = bookDimensions(book, 10, 10)
  return thickness / depth
}

/** The largest canvas that fits back + spine + front at the Book's proportions. */
export function planLayout(frontAspect: number, ratio: number): JacketLayout {
  for (const canvas of CANVASES) {
    const frontWidth = Math.round(canvas.height * frontAspect)
    const spineWidth = Math.max(40, Math.round(frontWidth * ratio))
    if (canvas.width - frontWidth - spineWidth >= frontWidth) {
      const frontX = canvas.width - frontWidth
      return { ...canvas, frontWidth, spineWidth, frontX, spineX: frontX - spineWidth }
    }
  }
  throw new Error('Book too thick for any canvas')
}

function prompt(layout: JacketLayout) {
  return `This image is the flat print layout of a book's wraparound cover, ${layout.width}×${layout.height} px, laid out left to right: BACK COVER (magenta, x = 0–${layout.spineX}), SPINE (cyan, x = ${layout.spineX}–${layout.frontX}, ${layout.spineWidth} px wide because the book is thick), FRONT COVER (the real cover, x = ${layout.frontX}–${layout.width}).

Replace the magenta area with the book's back cover and the cyan band with its spine, so the whole jacket reads as one professionally designed wraparound from the same publisher: continue the front cover's artwork, colours, textures and design language across the spine onto the back.

Strict rules:
- The spine is the WHOLE cyan band: its two folds are exactly at x = ${layout.spineX} and x = ${layout.frontX}. Do not extend the front artwork into the cyan band.
- Keep the front cover exactly as it is (same pixels, same position).
- Absolutely NO text, letters, numbers, logos, publisher marks, barcodes, price boxes or symbols anywhere on the back or the spine. Only artwork and colour.
- Keep the upper two thirds of the back calm and fairly dark (a blurb will be printed there) and the spine calm along its whole length (a title will run down it): no figures or busy detail on the spine.
- Keep the exact layout and proportions. No magenta or cyan may remain.`
}

/** Column-wise vertical-edge strength (median + half mean of |dx| over the middle rows). */
async function edgeProfile(image: Buffer, width: number, height: number): Promise<Float32Array> {
  const { data } = await sharp(image).resize(width, height, { fit: 'fill' }).greyscale().raw().toBuffer({ resolveWithObject: true })
  const top = Math.round(height * 0.1)
  const bottom = Math.round(height * 0.9)
  const rows = bottom - top
  const profile = new Float32Array(width)
  const column = new Float32Array(rows)
  for (let x = 1; x < width; x++) {
    let sum = 0
    for (let y = top; y < bottom; y++) {
      const diff = Math.abs(data[y * width + x]! - data[y * width + x - 1]!)
      column[y - top] = diff
      sum += diff
    }
    const sorted = column.slice().sort()
    profile[x] = sorted[rows >> 1]! + 0.5 * sum / rows
  }
  return profile
}

function peak(profile: Float32Array, from: number, to: number): number {
  let best = Math.max(1, from)
  for (let x = Math.max(1, from); x < Math.min(profile.length, to); x++) {
    if (profile[x]! > profile[best]!) best = x
  }
  return best
}

/**
 * The Gemini request for a Book's jacket: its layout and the flat input image
 * (real front on the right, magenta back, cyan spine). PNG for direct calls;
 * JPEG keeps batch jobs under the inline size limit (flat colours survive it).
 */
export async function jacketRequest(book: Book, front: Buffer, key: string, format: 'png' | 'jpeg' = 'png'): Promise<{ layout: JacketLayout, request: ImageRequest }> {
  const meta = await sharp(front).metadata()
  const layout = planLayout(meta.width! / meta.height!, spineRatio(book))
  const { width, height, frontWidth, spineWidth, spineX, frontX } = layout

  const frontFitted = await sharp(front).resize(frontWidth, height, { fit: 'fill' }).png().toBuffer()
  const canvas = sharp({ create: { width, height, channels: 3, background: '#FF00FF' } })
    .composite([
      { input: await sharp({ create: { width: spineWidth, height, channels: 3, background: '#00FFFF' } }).png().toBuffer(), left: spineX, top: 0 },
      { input: frontFitted, left: frontX, top: 0 },
    ])
  const input = format === 'jpeg' ? await canvas.jpeg({ quality: 92 }).toBuffer() : await canvas.png().toBuffer()
  return {
    layout,
    request: { key, prompt: prompt(layout), images: [{ mime: `image/${format}`, data: input }], aspectRatio: layout.ratio },
  }
}

/** Generates a jacket right away (standard price) and cuts it. */
export async function generateJacket(book: Book, front: Buffer): Promise<JacketResult> {
  const { layout, request } = await jacketRequest(book, front, 'single')
  const raw = await generateImage(request.prompt, request.images, request.aspectRatio)
  return cropJacket(raw, layout)
}

/** Layout for a Book and its front image (to re-crop a stored jacket). */
export async function layoutFor(book: Book, front: Buffer): Promise<JacketLayout> {
  const meta = await sharp(front).metadata()
  return planLayout(meta.width! / meta.height!, spineRatio(book))
}

/** How far the painted spine may differ from the asked one before we use the detected folds instead. */
const FIT_TOLERANCE = 0.12

/**
 * Cuts spine and back out of a generated jacket. Free: re-run it on a stored
 * jacket after changing the rules. Uses the folds the model actually painted
 * when they differ from the layout by more than FIT_TOLERANCE.
 */
export async function cropJacket(raw: Buffer, layout: JacketLayout): Promise<JacketResult> {
  const { width, height, frontWidth, spineWidth, spineX, frontX } = layout
  const jacket = await sharp(raw).resize(width, height, { fit: 'fill' }).png().toBuffer()

  // Where did the model actually fold?
  const profile = await edgeProfile(jacket, width, height)
  const left = peak(profile, spineX - Math.round(spineWidth / 5), spineX + Math.round(spineWidth / 6))
  const right = peak(profile, spineX + Math.round(spineWidth / 5), frontX + Math.round(spineWidth / 12))
  const spineFit = (right - left) / spineWidth
  const stretched = Math.abs(spineFit - 1) > FIT_TOLERANCE
  const [from, to] = stretched ? [left + 3, right - 3] : [spineX, frontX]
  const spine = await sharp(jacket).extract({ left: from, top: 0, width: to - from, height }).resize(spineWidth, height, { fit: 'fill' }).webp({ quality: 90 }).toBuffer()

  // The back: a front-wide slice left of whichever fold comes first, kept clear of the fold line.
  const margin = Math.round(frontWidth * 0.05)
  const backRight = Math.min(left, spineX) - margin
  const back = await sharp(jacket).extract({ left: Math.max(0, backRight - frontWidth), top: 0, width: frontWidth, height }).webp({ quality: 88 }).toBuffer()

  return { jacket: await sharp(jacket).webp({ quality: 85 }).toBuffer(), spine, back, layout, spineFit, stretched }
}
