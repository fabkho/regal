// Page edges: the paper you see on a Book's head, tail and fore-edge.
// One small canvas per Book, drawn across the Book's thickness (canvas x =
// thickness, matching u on the box's top, bottom and fore-edge faces):
// a cover board at each side, then one fine line per sheet, with darker
// lines where signatures meet and slight yellowing towards the outside.
// The same canvas doubles as bump map so the sheets catch the light.
//
// Technique after MengTo/complete-shelf (per-sheet wavy lines + bump) and
// gracious-tech/bookcover (stripe count from thickness); code is our own.
import type { RGB } from '../covers/palette'
import { hashString } from '../bookcase/layout'

export interface PageEdgeBook {
  id: string
  pages: number | null
  binding: string | null
}

export interface PageEdgePlan {
  width: number
  height: number
  /** Paper colour of the page block. */
  paper: RGB
  /** Cover board thickness at each side, in px. */
  boardPx: number
  /** Hardcovers overhang their pages, so a shadow line sits inside the board. */
  inset: boolean
  /** Rows at the bottom of the canvas showing the Spine's board (head/tail only). */
  spineRows: number
  /** Sheet line positions (px, across the thickness). */
  sheets: number[]
  /** Indices into `sheets` where a signature ends (drawn darker). */
  signatures: Set<number>
}

/** Canvas rows along the depth; the fore-edge samples the middle half. */
export const PAGE_EDGE_ROWS = 128
const MAX_WIDTH = 512
const MIN_WIDTH = 48
const PX_PER_SHEET = 1.6

export type PaperStock = 'pulp' | 'cream' | 'white'

/** Mass-market paperbacks are printed on yellowish groundwood pulp, hardcovers on whiter stock. */
export function paperStock(binding: string | null): PaperStock {
  const value = (binding ?? '').toLowerCase()
  if (value.includes('mass market')) return 'pulp'
  if (value.includes('hardcover') || value.includes('hardback') || value.includes('gebunden')) return 'white'
  return 'cream'
}

const STOCK_COLORS: Record<PaperStock, RGB> = {
  pulp: [0xD8, 0xCA, 0xA8],
  cream: [0xE8, 0xDE, 0xC6],
  white: [0xEE, 0xE8, 0xD8],
}

/** Small deterministic PRNG (mulberry32). */
export function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Where everything goes on the page-edge canvas. Pure: same Book, same plan.
 * `thickness` and `depth` are world metres (the Book's pose).
 */
export function pageEdgePlan(book: PageEdgeBook, thickness: number, depth: number): PageEdgePlan {
  const pages = book.pages && book.pages > 0 ? book.pages : 300
  const leaves = Math.max(8, Math.round(pages / 2))
  const width = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, leaves * PX_PER_SHEET)))
  const stock = paperStock(book.binding)
  const hard = stock === 'white'
  const boardMetres = hard ? 0.0028 : 0.0004
  const boardPx = Math.max(1, Math.round(width * boardMetres / thickness))
  const spineRows = Math.max(1, Math.round(PAGE_EDGE_ROWS * boardMetres / depth))

  const random = seeded(hashString(`${book.id}:pages`))
  // Paper varies a little from copy to copy.
  const tone = 1 + (random() - 0.5) * 0.06
  const paper = STOCK_COLORS[stock].map(channel => Math.min(255, channel * tone)) as RGB

  const inner = width - boardPx * 2 - (hard ? 2 : 0)
  const step = inner / leaves
  const start = boardPx + (hard ? 1 : 0)
  const sheets: number[] = []
  const signatures = new Set<number>()
  const signature = random() > 0.5 ? 16 : 8
  for (let leaf = 1; leaf < leaves; leaf++) {
    sheets.push(start + leaf * step + (random() - 0.5) * step * 0.35)
    if (leaf % signature === 0) signatures.add(sheets.length - 1)
  }
  return { width, height: PAGE_EDGE_ROWS, paper, boardPx, inset: hard, spineRows, sheets, signatures }
}

const rgba = ([r, g, b]: RGB, alpha = 1) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`

/**
 * Draws the page edges for a Book: paper, sheet lines, board edges in the
 * Cover's colour. Returns the canvas; reuse it across head, tail and fore-edge.
 */
export function drawPageEdges(plan: PageEdgePlan, board: RGB, seed: string, target?: HTMLCanvasElement): HTMLCanvasElement {
  const element = target ?? document.createElement('canvas')
  element.width = plan.width
  element.height = plan.height
  const context = element.getContext('2d')!
  const { width, height, paper } = plan
  const random = seeded(hashString(`${seed}:lines`))

  context.fillStyle = rgba(paper)
  context.fillRect(0, 0, width, height)

  // Pages never line up perfectly: groups of sheets catch the light a little differently.
  for (let x = 0; x < width;) {
    const group = 2 + random() * 10
    const shade = (random() - 0.5) * 0.09
    context.fillStyle = shade > 0 ? `rgba(255, 252, 240, ${shade})` : `rgba(60, 45, 25, ${-shade})`
    context.fillRect(x, 0, group, height)
    x += group
  }

  // One line per sheet: fine, uneven, darker where signatures meet; now and
  // then a sheet stands proud and shows a lit edge beside its shadow.
  const line = paper.map(channel => channel * 0.58) as RGB
  for (let index = 0; index < plan.sheets.length; index++) {
    const x = plan.sheets[index]!
    const signature = plan.signatures.has(index)
    const wobble = () => (random() - 0.5) * 0.8
    const stroke = (offset: number, style: string, lineWidth: number) => {
      context.strokeStyle = style
      context.lineWidth = lineWidth
      context.beginPath()
      context.moveTo(x + offset + wobble(), 0)
      context.bezierCurveTo(x + offset + wobble(), height * 0.33, x + offset + wobble(), height * 0.66, x + offset + wobble(), height)
      context.stroke()
    }
    stroke(0, rgba(line, signature ? 0.55 : 0.08 + random() * 0.26), signature ? 1.1 : 0.3 + random() * 0.5)
    if (random() < 0.18) stroke(0.7, `rgba(255, 253, 245, ${0.25 + random() * 0.3})`, 0.5)
  }

  // Paper fibres and specks.
  for (let speck = 0; speck < width * height / 30; speck++) {
    const light = random() > 0.5
    context.fillStyle = light ? `rgba(255, 255, 250, ${random() * 0.12})` : `rgba(70, 55, 35, ${random() * 0.1})`
    context.fillRect(random() * width, random() * height, 0.6 + random(), 0.6 + random() * 2)
  }

  // Outer sheets yellow first; the middle of the block stays lighter.
  const age = context.createLinearGradient(0, 0, width, 0)
  age.addColorStop(0, 'rgba(120, 90, 40, 0.2)')
  age.addColorStop(0.1, 'rgba(120, 90, 40, 0.04)')
  age.addColorStop(0.9, 'rgba(120, 90, 40, 0.04)')
  age.addColorStop(1, 'rgba(120, 90, 40, 0.2)')
  context.fillStyle = age
  context.fillRect(0, 0, width, height)
  // Handled ends: a touch darker towards the corners.
  const ends = context.createLinearGradient(0, 0, 0, height)
  ends.addColorStop(0, 'rgba(90, 70, 45, 0.1)')
  ends.addColorStop(0.2, 'rgba(90, 70, 45, 0)')
  ends.addColorStop(0.8, 'rgba(90, 70, 45, 0)')
  ends.addColorStop(1, 'rgba(90, 70, 45, 0.1)')
  context.fillStyle = ends
  context.fillRect(0, 0, width, height)

  // Cover boards at both sides, plus the Spine's board along the bottom rows.
  context.fillStyle = rgba(board)
  context.fillRect(0, 0, plan.boardPx, height)
  context.fillRect(width - plan.boardPx, 0, plan.boardPx, height)
  context.fillRect(0, height - plan.spineRows, width, plan.spineRows)
  if (plan.inset) {
    // Pages sit back from a hardcover's boards: a soft shadow inside each board.
    context.fillStyle = 'rgba(40, 30, 20, 0.45)'
    context.fillRect(plan.boardPx, 0, 1.5, height - plan.spineRows)
    context.fillRect(width - plan.boardPx - 1.5, 0, 1.5, height - plan.spineRows)
    context.fillRect(plan.boardPx, height - plan.spineRows - 1.5, width - plan.boardPx * 2, 1.5)
  }
  return element
}
