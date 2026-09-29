// Generated Spine and back-cover textures, drawn on canvases. Real spine and
// back images aren't available from any free source (see #1 notes), so both
// are designed from the front Cover: colours from its palette, title/author
// typeset along the Spine, and a real EAN-13 barcode from the ISBN on the back.
import type { RGB, SpinePalette } from './palette'
import { ean13Modules } from './ean13'

const SPINE_HEIGHT_PX = 512
/** Spine typography after mawise/bookshelf: Patua One titles, Antonio authors (both OFL). */
export const SPINE_TITLE_FONT = '"Patua One", Georgia, serif'
export const SPINE_AUTHOR_FONT = 'Antonio, "Arial Narrow", sans-serif'
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif'
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif'

/** Resolves once the Spine fonts are available to canvas drawing. */
export function spineFontsReady(): Promise<unknown> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve()
  return Promise.all([
    document.fonts.load(`20px ${SPINE_TITLE_FONT}`),
    document.fonts.load(`400 20px ${SPINE_AUTHOR_FONT}`),
  ]).catch(() => undefined)
}

export interface FaceBook {
  id: string
  title: string
  seriesTitle: string | null
  author: string | null
  isbn13: string | null
}

export interface FaceInput {
  book: FaceBook
  /** World-space size of the Book, used for the canvas aspect ratio. */
  thickness: number
  height: number
  depth: number
  palette: SpinePalette
  /** The front Cover, when available: lends its texture to Spine and back. */
  cover?: CanvasImageSource & { width: number, height: number }
  /** Deterministic style choice. */
  seed: number
  /** The book's blurb, typeset on the back cover when known. */
  description?: string | null
}

const rgba = ([r, g, b]: RGB, alpha = 1) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`

function canvas(width: number, height: number) {
  const element = document.createElement('canvas')
  element.width = width
  element.height = height
  return { element, context: element.getContext('2d')! }
}

/** Largest font size (px) at which `text` fits `maxWidth`, clamped. */
function fitFont(context: CanvasRenderingContext2D, text: string, family: string, weight: string, maxWidth: number, maxSize: number, minSize: number) {
  context.font = `${weight} ${maxSize}px ${family}`
  const width = context.measureText(text).width
  return Math.max(minSize, Math.min(maxSize, maxSize * maxWidth / Math.max(1, width)))
}

/** Cuts text with an ellipsis so it fits `maxWidth` at the current font. */
function ellipsize(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (context.measureText(text).width <= maxWidth) return text
  let cut = text
  while (cut.length > 1 && context.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1)
  return `${cut.trimEnd()}…`
}

const seriesNumber = (seriesTitle: string | null) => seriesTitle?.match(/#\s*([\d.]+)/)?.[1] ?? null

/** Near-black or near-white, whichever reads on the background (mawise's rule). */
export function spineTextColor([r, g, b]: RGB): RGB {
  return (r + g + b) / 3 > 128 ? [0x11, 0x11, 0x11] : [0xEE, 0xEE, 0xEE]
}

/**
 * The Spine, after mawise/bookshelf: a solid colour taken from the Cover's
 * left edge with a soft sheen, the series number at the head, and title +
 * author in one line running top to bottom.
 */
export function drawSpine(input: FaceInput): HTMLCanvasElement {
  const height = SPINE_HEIGHT_PX
  const width = Math.round(Math.min(200, Math.max(28, height * input.thickness / input.height)))
  const { element, context } = canvas(width, height)
  const { palette, book } = input
  const text = spineTextColor(palette.background)

  context.fillStyle = rgba(palette.background)
  context.fillRect(0, 0, width, height)

  // Sheen across the Spine, darker at the hinges.
  const sheen = context.createLinearGradient(0, 0, width, 0)
  sheen.addColorStop(0, 'rgba(0,0,0,0.28)')
  sheen.addColorStop(0.2, 'rgba(255,255,255,0.1)')
  sheen.addColorStop(0.8, 'rgba(255,255,255,0.1)')
  sheen.addColorStop(1, 'rgba(0,0,0,0.3)')
  context.fillStyle = sheen
  context.fillRect(0, 0, width, height)

  context.fillStyle = rgba(text)
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  // Series number at the head.
  const number = seriesNumber(book.seriesTitle)
  const head = number ? height * 0.1 : height * 0.04
  if (number) {
    context.font = `${Math.min(width * 0.42, 22)}px ${SPINE_AUTHOR_FONT}`
    context.fillText(number, width / 2, height * 0.05)
  }

  // Title and author on one line, top to bottom: rotate so +x runs down the Spine.
  const available = height - head - height * 0.05
  const maxSize = Math.min(width * 0.62, 34)
  const author = book.author ?? ''
  const measure = (size: number) => {
    context.font = `${size}px ${SPINE_TITLE_FONT}`
    const titleWidth = context.measureText(book.title).width
    context.font = `${size * 0.9}px ${SPINE_AUTHOR_FONT}`
    const authorWidth = author ? context.measureText(author).width + size * 1.2 : 0
    return titleWidth + authorWidth
  }
  const size = Math.max(9, Math.min(maxSize, maxSize * available / Math.max(1, measure(maxSize))))
  const titleText = ellipsizeWith(context, book.title, `${size}px ${SPINE_TITLE_FONT}`, available * (author ? 0.72 : 1))
  context.font = `${size}px ${SPINE_TITLE_FONT}`
  const titleWidth = context.measureText(titleText).width
  context.font = `${size * 0.9}px ${SPINE_AUTHOR_FONT}`
  const authorText = author ? ellipsizeWith(context, author, `${size * 0.9}px ${SPINE_AUTHOR_FONT}`, available - titleWidth - size * 1.2) : ''
  const authorWidth = authorText ? context.measureText(authorText).width + size * 1.2 : 0
  const start = head + (available - titleWidth - authorWidth) / 2

  context.save()
  context.translate(width / 2, 0)
  context.rotate(Math.PI / 2)
  context.textAlign = 'left'
  context.textBaseline = 'middle'
  context.fillStyle = rgba(text)
  context.font = `${size}px ${SPINE_TITLE_FONT}`
  context.fillText(titleText, start, 0)
  if (authorText) {
    context.font = `${size * 0.9}px ${SPINE_AUTHOR_FONT}`
    context.fillStyle = rgba(text, 0.85)
    context.fillText(authorText, start + titleWidth + size * 1.2, 0)
  }
  context.restore()

  return element
}

function ellipsizeWith(context: CanvasRenderingContext2D, text: string, font: string, maxWidth: number) {
  context.font = font
  return ellipsize(context, text, Math.max(0, maxWidth))
}

/** The back cover: Cover-coloured, title at the head, a real EAN-13 barcode from the ISBN. */
export function drawBack(input: FaceInput): HTMLCanvasElement {
  const height = SPINE_HEIGHT_PX
  const width = Math.round(height * input.depth / input.height)
  const { element, context } = canvas(width, height)
  const { book } = input
  const palette = { ...input.palette, text: spineTextColor(input.palette.background) }

  // A soft, blurred echo of the front Cover under the background colour.
  context.fillStyle = rgba(palette.background)
  context.fillRect(0, 0, width, height)
  if (input.cover) {
    context.filter = 'blur(10px)'
    context.globalAlpha = 0.35
    context.drawImage(input.cover, 0, 0, width, height)
    context.filter = 'none'
    context.globalAlpha = 1
  }

  const margin = width * 0.1
  context.fillStyle = rgba(palette.text)
  context.textAlign = 'center'
  context.textBaseline = 'top'
  const titleSize = fitFont(context, book.title, SERIF, '600', width - margin * 2, 22, 9)
  context.font = `600 ${titleSize}px ${SERIF}`
  context.fillText(ellipsize(context, book.title, width - margin * 2), width / 2, height * 0.08)
  if (book.author) {
    context.font = `400 ${titleSize * 0.7}px ${SERIF}`
    context.fillStyle = rgba(palette.text, 0.8)
    context.fillText(ellipsize(context, book.author, width - margin * 2), width / 2, height * 0.08 + titleSize * 1.4)
  }

  const blurbTop = height * 0.25
  const blurbBottom = height * 0.74
  if (input.description) {
    // The real blurb, wrapped to the back cover's measure.
    const size = Math.max(9, Math.min(13, width / 27))
    const lineHeight = size * 1.38
    context.font = `400 ${size}px ${SERIF}`
    context.fillStyle = rgba(palette.text, 0.9)
    context.textAlign = 'left'
    context.textBaseline = 'top'
    const lines = wrapText(context, input.description, width - margin * 2)
    const fit = Math.floor((blurbBottom - blurbTop) / lineHeight)
    const shown = lines.slice(0, fit)
    if (lines.length > fit && shown.length) shown[shown.length - 1] = ellipsize(context, `${shown.at(-1)}…`, width - margin * 2)
    shown.forEach((line, index) => context.fillText(line, margin, blurbTop + index * lineHeight))
  }
  else {
    // Placeholder lines: suggest text without inventing any.
    context.fillStyle = rgba(palette.text, 0.18)
    for (let line = 0; line < 9; line++) {
      const lineWidth = (width - margin * 2) * (line % 4 === 3 ? 0.62 : 1)
      context.fillRect(margin, height * 0.26 + line * height * 0.034, lineWidth, Math.max(1, height * 0.009))
    }
  }

  // Barcode panel, bottom right.
  const modules = ean13Modules(book.isbn13)
  if (modules) {
    const moduleWidth = Math.max(1, Math.floor((width * 0.46) / 95))
    const barsWidth = moduleWidth * 95
    const panelX = width - margin - barsWidth - moduleWidth * 6
    const panelY = height * 0.78
    const barsHeight = height * 0.1
    context.fillStyle = '#fbfaf6'
    context.fillRect(panelX, panelY, barsWidth + moduleWidth * 12, barsHeight + height * 0.05)
    context.fillStyle = '#111'
    for (let i = 0; i < 95; i++) {
      if (modules[i] === '1') context.fillRect(panelX + moduleWidth * (6 + i), panelY + height * 0.012, moduleWidth, barsHeight)
    }
    context.font = `400 ${Math.max(7, moduleWidth * 7)}px ${SANS}`
    context.textAlign = 'center'
    context.fillText(book.isbn13!.replace(/\D/g, ''), panelX + (barsWidth + moduleWidth * 12) / 2, panelY + barsHeight + height * 0.016)
  }

  return element
}

/** Greedy word wrap; paragraph breaks become an empty line. */
function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\n+/)) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (context.measureText(candidate).width <= maxWidth || !line) line = candidate
      else {
        lines.push(line)
        line = word
      }
    }
    if (line) lines.push(line)
    lines.push('')
  }
  while (lines.at(-1) === '') lines.pop()
  return lines
}
