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

/** A line of praise printed on the back, with its attribution. */
export interface FaceQuote {
  text: string
  source: string
}

/** 'classic': a printed paperback back. 'clean': title, author, blurb, barcode. */
export type BackStyle = 'classic' | 'clean'

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
  /** Real or AI-made Spine artwork (asset set); our typography goes on top. */
  spineArt?: CanvasImageSource & { width: number, height: number }
  /** Real or AI-made back artwork (asset set). */
  backArt?: CanvasImageSource & { width: number, height: number }
  /** Up to two praise quotes with their attribution, printed above the blurb ('classic'). */
  quotes?: FaceQuote[] | null
  /** Shelf category, printed as a small letter-spaced label: 'SCIENCE FICTION'. */
  genre?: string | null
  /** Publisher imprint, printed small and uppercase at the foot of the back. */
  publisher?: string | null
  /** Back-cover design: a printed paperback ('classic', default) or just the blurb ('clean'). */
  backStyle?: BackStyle
  /** The back art is a photo of the real Book: draw it as is, it carries its own text. */
  backIsPhoto?: boolean
  /** The Spine art is a photo of the real Book: draw it as is, it carries its own text. */
  spineIsPhoto?: boolean
}

type Art = CanvasImageSource & { width: number, height: number }

/** Average colour of a region of an image (fractions of its size). */
export function averageColor(image: Art, x = 0, y = 0, w = 1, h = 1): RGB {
  const { element, context } = canvas(8, 8)
  context.drawImage(image, image.width * x, image.height * y, image.width * w, image.height * h, 0, 0, 8, 8)
  const data = context.getImageData(0, 0, 8, 8).data
  const sum: RGB = [0, 0, 0]
  for (let i = 0; i < data.length; i += 4) {
    sum[0] += data[i]!
    sum[1] += data[i + 1]!
    sum[2] += data[i + 2]!
  }
  element.width = 0
  return sum.map(channel => channel / 64) as RGB
}

/** A soft halo so text stays readable on busy artwork. */
function textHalo(context: CanvasRenderingContext2D, text: RGB, blur: number) {
  const dark = text[0] < 128
  context.shadowColor = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.65)'
  context.shadowBlur = blur
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
  const art = input.spineArt
  // Artwork gets twice the resolution; `k` scales every size below.
  const k = art ? 2 : 1
  const height = SPINE_HEIGHT_PX * k
  const width = Math.round(Math.min(200 * k, Math.max(28 * k, height * input.thickness / input.height)))
  const { element, context } = canvas(width, height)

  // A photo of the real Book: it carries its printed Spine text already.
  if (art && input.spineIsPhoto) {
    context.drawImage(art, 0, 0, width, height)
    return element
  }

  const { palette, book } = input
  const text = spineTextColor(art ? averageColor(art, 0.15, 0.2, 0.7, 0.6) : palette.background)

  if (art) {
    context.drawImage(art, 0, 0, width, height)
  }
  else {
    context.fillStyle = rgba(palette.background)
    context.fillRect(0, 0, width, height)
  }

  // Sheen across the Spine, darker at the hinges (subtler on artwork, which has its own light).
  const sheen = context.createLinearGradient(0, 0, width, 0)
  sheen.addColorStop(0, `rgba(0,0,0,${art ? 0.22 : 0.28})`)
  sheen.addColorStop(0.2, `rgba(255,255,255,${art ? 0.04 : 0.1})`)
  sheen.addColorStop(0.8, `rgba(255,255,255,${art ? 0.04 : 0.1})`)
  sheen.addColorStop(1, `rgba(0,0,0,${art ? 0.24 : 0.3})`)
  context.fillStyle = sheen
  context.fillRect(0, 0, width, height)
  if (art) textHalo(context, text, 6 * k)

  context.fillStyle = rgba(text)
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  // Series number at the head.
  const number = seriesNumber(book.seriesTitle)
  const head = number ? height * 0.1 : height * 0.04
  if (number) {
    context.font = `${Math.min(width * 0.42, 22 * k)}px ${SPINE_AUTHOR_FONT}`
    context.fillText(number, width / 2, height * 0.05)
  }

  // Title and author on one line, top to bottom: rotate so +x runs down the Spine.
  const available = height - head - height * 0.05
  const maxSize = Math.min(width * 0.62, 34 * k)
  const author = book.author ?? ''
  const measure = (size: number) => {
    context.font = `${size}px ${SPINE_TITLE_FONT}`
    const titleWidth = context.measureText(book.title).width
    context.font = `${size * 0.9}px ${SPINE_AUTHOR_FONT}`
    const authorWidth = author ? context.measureText(author).width + size * 1.2 : 0
    return titleWidth + authorWidth
  }
  const size = Math.max(9 * k, Math.min(maxSize, maxSize * available / Math.max(1, measure(maxSize))))
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

/**
 * The ISBN as printed above the bars, grouped 3-1-4-4-1:
 * 9781466858756 → 978-1-4668-5875-6. Real hyphenation follows the registration
 * ranges (which we don't ship); the fixed grouping reads the same on a cover.
 */
export function formatIsbn13(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '')
  if (digits.length !== 13) return null
  return `${digits.slice(0, 3)}-${digits[3]}-${digits.slice(4, 8)}-${digits.slice(8, 12)}-${digits[12]}`
}

/** The 13 digits as printed under the bars: 9 780756 413026. */
export function barcodeDigits(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '')
  if (digits.length !== 13) return null
  return `${digits[0]} ${digits.slice(1, 7)} ${digits.slice(7)}`
}

// Left-hand EAN digit patterns; ean13.ts keeps its own copies private.
const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const EAN_G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const EAN5_PARITY = ['GGLLL', 'GLGLL', 'GLLGL', 'GLLLG', 'LGGLL', 'LLGGL', 'LLLGG', 'LGLGL', 'LGLLG', 'LLGLG']

/**
 * Modules of the EAN-5 add-on beside the ISBN bars ('90000' = no price set),
 * as '0'/'1' ('1' = bar): guard, then five digits separated by '01'.
 */
export function ean5Modules(value: string): string | null {
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 5) return null
  const sum = [...digits].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 9 : 3), 0)
  const parity = EAN5_PARITY[sum % 10]!
  return [...digits]
    .map((digit, index) => (index ? '01' : '01011') + (parity[index] === 'L' ? EAN_L : EAN_G)[Number(digit)]!)
    .join('')
}

/** One run of text in a fitted stack: the blurb's opening line, a quote, its attribution… */
export interface FitBlock {
  text: string
  /** Font size relative to the fitted base size. */
  scale?: number
  /** Blank space after the block, in base sizes. */
  gapAfter?: number
}

export interface FitLine {
  text: string
  size: number
  /** Index of the block this line came from. */
  block: number
  /** Top of the line, relative to the top of the stack. */
  y: number
}

export interface FitOptions {
  /** Width of `text` drawn at `size` in block `block`'s font. */
  measure: (text: string, size: number, block: number) => number
  maxWidth: number
  maxHeight: number
  min: number
  max: number
  /** Line height as a multiple of the line's own font size. */
  lineHeight?: number
}

export interface FitResult {
  size: number
  lines: FitLine[]
  height: number
  /** Share of `maxHeight` the stack uses: ~0.85–1 when it fits. */
  fill: number
  /** True when even `min` overflows; `lines` are then cut to the space. */
  overflow: boolean
}

/** Greedy word wrap through a `measure` callback; paragraph breaks become an empty line. */
export function wrapWith(text: string, size: number, block: number, maxWidth: number, measure: FitOptions['measure']): string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\n+/)) {
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (measure(candidate, size, block) <= maxWidth || !line) line = candidate
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

/**
 * The largest font size at which the blocks, wrapped to `maxWidth`, still fit
 * `maxHeight` — so the text fills its area instead of floating in it. Pure:
 * all measuring goes through the callback, which keeps it testable off-canvas.
 */
export function fitTextBlocks(blocks: FitBlock[], options: FitOptions): FitResult {
  const lineHeight = options.lineHeight ?? 1.38
  const layout = (size: number) => {
    const lines: FitLine[] = []
    let y = 0
    blocks.forEach((block, index) => {
      if (!block.text.trim()) return
      const blockSize = size * (block.scale ?? 1)
      for (const text of wrapWith(block.text, blockSize, index, options.maxWidth, options.measure)) {
        lines.push({ text, size: blockSize, block: index, y })
        y += blockSize * lineHeight
      }
      y += size * (block.gapAfter ?? 0)
    })
    const last = lines.at(-1)
    return { lines, height: last ? last.y + last.size * lineHeight : 0 }
  }
  const done = (size: number, { lines, height }: { lines: FitLine[], height: number }, overflow = false): FitResult =>
    ({ size, lines, height, fill: options.maxHeight > 0 ? height / options.maxHeight : 0, overflow })

  const largest = layout(options.max)
  if (largest.height <= options.maxHeight) return done(options.max, largest)
  const smallest = layout(options.min)
  if (smallest.height > options.maxHeight) {
    // Too much text even at the smallest size: keep the lines that fit.
    const lines = smallest.lines.filter(line => line.y + line.size * lineHeight <= options.maxHeight)
    const last = lines.at(-1)
    return done(options.min, { lines, height: last ? last.y + last.size * lineHeight : 0 }, true)
  }
  let low = options.min
  let high = options.max
  let best = smallest
  while (high - low > 0.05) {
    const middle = (low + high) / 2
    const candidate = layout(middle)
    if (candidate.height <= options.maxHeight) {
      low = middle
      best = candidate
    }
    else high = middle
  }
  return done(low, best)
}

interface BlockStyle {
  font: (size: number) => string
  alpha?: number
}

const canvasMeasure = (context: CanvasRenderingContext2D, styles: BlockStyle[]): FitOptions['measure'] => (text, size, block) => {
  context.font = styles[block]!.font(size)
  return context.measureText(text).width
}

function drawFitted(context: CanvasRenderingContext2D, fitted: FitResult, styles: BlockStyle[], color: RGB, x: number, top: number) {
  context.textAlign = 'left'
  context.textBaseline = 'top'
  for (const line of fitted.lines) {
    if (!line.text) continue
    const style = styles[line.block]!
    context.font = style.font(line.size)
    context.fillStyle = rgba(color, style.alpha ?? 1)
    context.fillText(line.text, x, top + line.y)
  }
}

/** Canvas has no tracking: letter-spaced text is drawn one glyph at a time. */
function drawTracked(context: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) {
  let cursor = x
  for (const glyph of [...text]) {
    context.fillText(glyph, cursor, y)
    cursor += context.measureText(glyph).width + tracking
  }
}

/** The opening sentence of a blurb, set apart as printed backs do, and the rest. */
export function splitLede(text: string): [string, string] {
  const match = text.match(/^[^\n]{20,180}?[.!?…](?=\s|$)/)
  if (!match) return ['', text]
  const lede = match[0].trim()
  const rest = text.slice(match[0].length).trim()
  return rest ? [lede, rest] : ['', text]
}

/** Artwork (with a scrim) or the Cover-coloured ground the typography sits on. */
function paintBackGround(context: CanvasRenderingContext2D, input: FaceInput, width: number, height: number, text: RGB, k: number) {
  const art = input.backArt
  context.fillStyle = rgba(input.palette.background)
  context.fillRect(0, 0, width, height)
  if (art) {
    context.drawImage(art, 0, 0, width, height)
    // A soft scrim behind the text, as printed backs do on busy artwork.
    const dark = text[0] > 128
    const tone = dark ? '0, 0, 0' : '255, 255, 255'
    const scrim = context.createLinearGradient(0, 0, 0, height)
    scrim.addColorStop(0, `rgba(${tone}, ${dark ? 0.34 : 0.3})`)
    scrim.addColorStop(0.72, `rgba(${tone}, ${dark ? 0.3 : 0.26})`)
    scrim.addColorStop(0.9, `rgba(${tone}, ${dark ? 0.2 : 0.16})`)
    context.fillStyle = scrim
    context.fillRect(0, 0, width, height)
    textHalo(context, text, 5 * k)
  }
  else if (input.cover) {
    context.filter = 'blur(10px)'
    context.globalAlpha = 0.35
    context.drawImage(input.cover, 0, 0, width, height)
    context.filter = 'none'
    context.globalAlpha = 1
  }
}

interface BarcodePanel {
  x: number
  y: number
  width: number
  height: number
  module: number
  barsHeight: number
  textSize: number
  modules: string
  addon: string | null
  isbn: string
  digits: string
}

/** Geometry of the white barcode panel, or null without a (valid) ISBN. */
function barcodePanel(input: FaceInput, width: number, height: number, margin: number, k: number): BarcodePanel | null {
  const modules = ean13Modules(input.book.isbn13)
  const isbn = formatIsbn13(input.book.isbn13)
  const digits = barcodeDigits(input.book.isbn13)
  if (!modules || !isbn || !digits) return null
  const inner = width - margin * 2
  const addon = ean5Modules('90000')
  // Panel units: quiet zone, 95 bars, gap, the 48-module add-on, quiet zone.
  const full = 6 + 95 + 8 + 48 + 6
  const plain = 6 + 95 + 6
  // Half the back's width, as a printed barcode takes.
  let module = Math.max(1, Math.floor(width * 0.58 / full))
  let withAddon = addon !== null
  let panelWidth = module * (withAddon ? full : plain)
  if (panelWidth > inner) {
    withAddon = false
    panelWidth = module * plain
  }
  if (panelWidth > inner) {
    module = Math.max(1, Math.floor(inner / plain))
    panelWidth = module * plain
  }
  const textSize = Math.max(5.5 * k, module * 3.2)
  const barsHeight = Math.min(Math.max(14 * k, height * 0.075), panelWidth * 0.32)
  const panelHeight = textSize * 1.5 + barsHeight + textSize * 1.6 + module * 4
  return {
    x: Math.max(margin, width - margin - panelWidth),
    y: height - margin * 0.8 - panelHeight,
    width: panelWidth,
    height: panelHeight,
    module,
    barsHeight,
    textSize,
    modules,
    addon: withAddon ? addon : null,
    isbn,
    digits,
  }
}

/** The barcode as printed: ISBN above the bars, the digits below, '90000' add-on. */
function drawBarcodePanel(context: CanvasRenderingContext2D, panel: BarcodePanel) {
  // Printed flat on white: no halo, no scrim.
  context.shadowColor = 'transparent'
  context.shadowBlur = 0
  const { x, y, module, barsHeight, textSize } = panel
  context.fillStyle = '#fbfaf6'
  context.fillRect(x, y, panel.width, panel.height)
  context.fillStyle = '#111'
  context.textAlign = 'left'
  context.textBaseline = 'top'
  context.font = `400 ${textSize}px ${SANS}`
  const barsX = x + module * 6
  const barsY = y + textSize * 1.5
  drawTracked(context, `ISBN ${panel.isbn}`, barsX, y + module * 2, textSize * 0.06)
  for (let i = 0; i < panel.modules.length; i++) {
    if (panel.modules[i] === '1') context.fillRect(barsX + module * i, barsY, module, barsHeight)
  }
  context.textAlign = 'center'
  context.font = `400 ${textSize * 1.05}px ${SANS}`
  context.fillText(panel.digits, barsX + module * 47.5, barsY + barsHeight + module * 1.5)
  if (panel.addon) {
    const addonX = barsX + module * (95 + 8)
    context.font = `400 ${textSize * 0.95}px ${SANS}`
    context.fillText('90000', addonX + module * 24, y + module * 2)
    for (let i = 0; i < panel.addon.length; i++) {
      if (panel.addon[i] === '1') context.fillRect(addonX + module * i, barsY + textSize * 0.2, module, barsHeight - textSize * 0.2)
    }
  }
}

/** Suggests a blurb without inventing one: grey rules where the text would be. */
function drawPlaceholderLines(context: CanvasRenderingContext2D, color: RGB, x: number, top: number, width: number, bottom: number, k: number) {
  context.shadowColor = 'transparent'
  context.fillStyle = rgba(color, 0.18)
  const step = Math.max(6 * k, (bottom - top) / 11)
  for (let line = 0; top + line * step < bottom - step; line++) {
    context.fillRect(x, top + line * step, width * (line % 4 === 3 ? 0.62 : 1), Math.max(1, step * 0.16))
  }
}

/**
 * A printed paperback back, top to bottom: the shelf category, praise quotes,
 * the blurb (set to fill the space it has), the barcode panel and the imprint.
 */
function drawClassicBack(context: CanvasRenderingContext2D, input: FaceInput, width: number, height: number, color: RGB, k: number) {
  const { book } = input
  const margin = width * 0.085
  const inner = width - margin * 2
  const panel = barcodePanel(input, width, height, margin, k)
  // Without a barcode the text simply runs further down: the back stays balanced.
  const panelTop = panel ? panel.y : height - margin * 1.2
  // The imprint sits on its own line above the barcode, as printed backs do.
  const imprintSize = Math.max(5.5 * k, Math.min(10 * k, width * 0.026))
  const foot = input.publisher ? panelTop - imprintSize * 1.9 : panelTop
  let top = height * 0.06

  context.textAlign = 'left'
  context.textBaseline = 'top'
  if (input.genre) {
    const size = Math.max(6 * k, Math.min(12 * k, width * 0.03))
    context.font = `600 ${size}px ${SANS}`
    context.fillStyle = rgba(color, 0.85)
    drawTracked(context, input.genre.toUpperCase(), margin, top, size * 0.24)
    context.fillStyle = rgba(color, 0.35)
    context.fillRect(margin, top + size * 1.9, inner, Math.max(1, 0.9 * k))
    top += size * 3.2
  }

  const quotes = (input.quotes ?? []).filter(quote => quote?.text?.trim()).slice(0, 2)
  const space = Math.max(0, foot - top)
  if (quotes.length) {
    const blocks: FitBlock[] = quotes.flatMap(quote => [
      { text: `“${quote.text.replace(/^["“'‘]+|["”'’]+$/g, '').trim()}”` },
      { text: `—${quote.source}`, scale: 0.8, gapAfter: 0.9 },
    ])
    const styles = blocks.map((_, index) => (index % 2
      ? { font: (size: number) => `600 ${size}px ${SANS}`, alpha: 0.72 }
      : { font: (size: number) => `italic 400 ${size}px ${SERIF}`, alpha: 0.96 }))
    const fitted = fitTextBlocks(blocks, {
      measure: canvasMeasure(context, styles),
      maxWidth: inner,
      maxHeight: space * (quotes.length > 1 ? 0.4 : 0.26),
      min: 5.5 * k,
      max: Math.max(7 * k, Math.min(15 * k, width * 0.042)),
      lineHeight: 1.32,
    })
    drawFitted(context, fitted, styles, color, margin, top)
    top += fitted.height + height * 0.035
  }
  else {
    // No praise to print: the title and author head the back, as paperbacks do.
    const size = fitFont(context, book.title, SERIF, '600', inner, Math.min(20 * k, width * 0.07), 9 * k)
    context.font = `600 ${size}px ${SERIF}`
    context.fillStyle = rgba(color, 0.95)
    context.fillText(ellipsize(context, book.title, inner), margin, top)
    top += size * 1.35
    if (book.author) {
      context.font = `400 ${size * 0.62}px ${SERIF}`
      context.fillStyle = rgba(color, 0.8)
      context.fillText(ellipsize(context, book.author, inner), margin, top)
      top += size * 0.95
    }
    top += height * 0.025
  }

  const blurbBottom = foot - height * 0.035
  const description = input.description?.trim()
  if (description && blurbBottom > top) {
    const [lede, body] = splitLede(description)
    const blocks: FitBlock[] = lede
      ? [{ text: lede, scale: 1.18, gapAfter: 0.5 }, { text: body }]
      : [{ text: description }]
    const styles: BlockStyle[] = lede
      ? [{ font: size => `600 ${size}px ${SERIF}` }, { font: size => `400 ${size}px ${SERIF}`, alpha: 0.92 }]
      : [{ font: size => `400 ${size}px ${SERIF}`, alpha: 0.92 }]
    const fitted = fitTextBlocks(blocks, {
      measure: canvasMeasure(context, styles),
      maxWidth: inner,
      maxHeight: blurbBottom - top,
      min: 6 * k,
      max: Math.min(14 * k, Math.max(9 * k, width * 0.046)),
      lineHeight: 1.4,
    })
    const last = fitted.lines.at(-1)
    if (fitted.overflow && last) {
      context.font = styles[last.block]!.font(last.size)
      last.text = ellipsize(context, `${last.text}…`, inner)
    }
    // A blurb too short to fill even at the largest size sits a little low, not pinned to the top.
    drawFitted(context, fitted, styles, color, margin, top + (blurbBottom - top - fitted.height) * 0.3)
  }
  else if (blurbBottom > top) {
    drawPlaceholderLines(context, color, margin, top, inner, blurbBottom, k)
    if (input.backArt) textHalo(context, color, 5 * k)
  }

  if (input.publisher) {
    context.shadowColor = 'transparent'
    context.font = `600 ${imprintSize}px ${SANS}`
    context.fillStyle = rgba(color, 0.75)
    context.textAlign = 'left'
    context.textBaseline = 'alphabetic'
    if (input.backArt) textHalo(context, color, 4 * k)
    const imprint = ellipsize(context, input.publisher.toUpperCase(), inner / 1.25)
    drawTracked(context, imprint, margin, panelTop - imprintSize * 0.7, imprintSize * 0.2)
  }

  if (panel) drawBarcodePanel(context, panel)
}

/** The plainer back: title and author at the head, the blurb set to fill the measure. */
function drawCleanBack(context: CanvasRenderingContext2D, input: FaceInput, width: number, height: number, color: RGB, k: number) {
  const { book } = input
  const margin = width * 0.1
  const inner = width - margin * 2
  context.fillStyle = rgba(color)
  context.textAlign = 'center'
  context.textBaseline = 'top'
  const titleSize = fitFont(context, book.title, SERIF, '600', inner, 22 * k, 9 * k)
  context.font = `600 ${titleSize}px ${SERIF}`
  context.fillText(ellipsize(context, book.title, inner), width / 2, height * 0.08)
  if (book.author) {
    context.font = `400 ${titleSize * 0.7}px ${SERIF}`
    context.fillStyle = rgba(color, 0.8)
    context.fillText(ellipsize(context, book.author, inner), width / 2, height * 0.08 + titleSize * 1.4)
  }

  const blurbTop = height * 0.25
  const blurbBottom = height * 0.74
  if (input.description) {
    const styles: BlockStyle[] = [{ font: size => `400 ${size}px ${SERIF}`, alpha: 0.9 }]
    const fitted = fitTextBlocks([{ text: input.description }], {
      measure: canvasMeasure(context, styles),
      maxWidth: inner,
      maxHeight: blurbBottom - blurbTop,
      min: 7 * k,
      max: Math.min(18 * k, Math.max(10 * k, width * 0.06)),
      lineHeight: 1.38,
    })
    const last = fitted.lines.at(-1)
    if (fitted.overflow && last) {
      context.font = styles[last.block]!.font(last.size)
      last.text = ellipsize(context, `${last.text}…`, inner)
    }
    drawFitted(context, fitted, styles, color, margin, blurbTop)
  }
  else {
    drawPlaceholderLines(context, color, margin, height * 0.26, inner, blurbBottom, k)
  }

  // Barcode panel, bottom right (printed flat: no halo).
  const panel = barcodePanel(input, width, height, margin, k)
  if (panel) drawBarcodePanel(context, panel)
}

/**
 * The back cover: the asset artwork or a Cover-coloured ground, our typography
 * on top, and a real EAN-13 barcode from the ISBN. A photographed back is left
 * exactly as it is — it already carries the publisher's printing.
 */
export function drawBack(input: FaceInput): HTMLCanvasElement {
  const art = input.backArt
  // Artwork gets twice the resolution; `k` scales every size below.
  const k = art ? 2 : 1
  const height = SPINE_HEIGHT_PX * k
  const width = Math.round(height * input.depth / input.height)
  const { element, context } = canvas(width, height)

  if (art && input.backIsPhoto) {
    context.drawImage(art, 0, 0, width, height)
    return element
  }

  const color = spineTextColor(art ? averageColor(art, 0.1, 0.05, 0.8, 0.7) : input.palette.background)
  paintBackGround(context, input, width, height, color, k)
  if ((input.backStyle ?? 'classic') === 'clean') drawCleanBack(context, input, width, height, color, k)
  else drawClassicBack(context, input, width, height, color, k)
  return element
}
