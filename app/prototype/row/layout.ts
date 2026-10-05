// Design round (horizontal Stack): the three prototype rows. Each lays the
// Books out left to right along x and says how its camera looks at them.
// Pure and deterministic (seeded by Book Id), like the Stack's layout.
//
// Book axes as everywhere (utils/books/pose.ts): thickness along local x (the
// front Cover is +x), height along y, depth along z, the Spine is +z.
import type { Book } from '#layers/regal/shared/types/book'
import type { BookPose } from '#layers/regal/app/utils/books/pose'
import { bookDimensions, CLOTH_COLORS, hashString, random01 } from '#layers/regal/app/utils/bookcase/layout'
import { stackGroups } from '#layers/regal/app/utils/stack/view'
import type { RowOrder } from './data'

export type RowVariantKey = 'a' | 'b' | 'c'

/** A month (or status) group along the row, where its label goes. */
export interface RowMarker {
  key: string
  /** 'MAR 2026', 'READING'. */
  label: string
  count: number
  /** World x of the marker: the divider, the sheet, the label's tick. */
  x: number
  /** World x range of the group's Books. */
  start: number
  end: number
  /** (a) How tall its index card stands. */
  height?: number
}

export interface RowLayout {
  poses: BookPose[]
  markers: RowMarker[]
  /** World x range the row takes, markers included. */
  extent: [number, number]
  /** (b) The pile each Book lies in. */
  piles?: Record<string, RowPile>
}

/** How a variant's camera looks at the row: it only ever slides along x. */
export interface RowCamera {
  /** Vertical field of view, degrees. */
  fov: number
  /** How far it looks down, degrees. */
  tilt: number
  /** The point it looks at: height and depth (the plane labels and scrolling are matched to). */
  targetY: number
  targetZ: number
  /** World metres of that plane the view's height shows. */
  viewHeight: number
}

export type RowFocus = 'tilt' | 'riffle' | 'flow'

export interface RowVariant {
  key: RowVariantKey
  name: string
  blurb: string
  camera: RowCamera
  /** How the Book in focus shows (RowBooks). */
  focus: RowFocus
  /** Where the focus is: the middle of the view (scroll), or under the pointer / finger. */
  focusAt: 'centre' | 'pointer'
  /** How the month labels look (RowCard). */
  labels: 'tab' | 'leader' | 'floor'
  layout: (books: Book[]) => RowLayout
}

const FREE = 1
const color = (id: string) => CLOTH_COLORS[hashString(id) % CLOTH_COLORS.length]!

/** Month groups in the row's order; status groups (READING) keep their own. */
function groups(books: Book[]) {
  return stackGroups(books, 'month')
}

function finish(poses: BookPose[], markers: RowMarker[], margin: number): RowLayout {
  if (!poses.length) return { poses, markers, extent: [0, 0] }
  let low = Infinity
  let high = -Infinity
  for (const pose of poses) {
    const half = Math.max(pose.thickness, pose.depth) / 2
    low = Math.min(low, pose.x - half)
    high = Math.max(high, pose.x + half)
  }
  for (const marker of markers) {
    low = Math.min(low, marker.x)
    high = Math.max(high, marker.x)
  }
  return { poses, markers, extent: [low - margin, high + margin] }
}

// --- (a) Standing row: a tidy Shelf --------------------------------------------

const SHELF_GAP = 0.0015
/** Room for a divider card between two months. */
const SHELF_GROUP_GAP = 0.026
const SHELF_LEAN = 0.01
/** Index cards stand this much above the taller of their neighbours, their tab on top (RowCard). */
const DIVIDER_RISE = 0.014

/**
 * Upright, Spines to the viewer, bottoms on one line (a Shelf without the
 * furniture), each month after an index card standing between the Books.
 */
export function layoutShelf(books: Book[]): RowLayout {
  const byId = new Map(books.map(book => [book.id, book]))
  const poses: BookPose[] = []
  const markers: RowMarker[] = []
  let x = 0
  for (const group of groups(books)) {
    const marker: RowMarker = { key: group.key, label: group.label, count: group.bookIds.length, x: x + SHELF_GROUP_GAP / 2, start: 0, end: 0 }
    x += SHELF_GROUP_GAP
    marker.start = x
    for (const id of group.bookIds) {
      const book = byId.get(id)!
      const dims = bookDimensions(book, FREE, FREE)
      poses.push({
        bookId: id,
        ...dims,
        x: x + dims.thickness / 2,
        y: dims.height / 2,
        // Spines on one line at z = 0.
        z: -dims.depth / 2,
        rotation: [0, 0, (random01(id, 'row-lean') - 0.5) * 2 * SHELF_LEAN],
        color: color(id),
        section: book.status,
      })
      x += dims.thickness + SHELF_GAP
    }
    marker.end = x
    markers.push(marker)
  }
  // Each card a little taller than the Books either side of it.
  for (const marker of markers) {
    const near = poses.filter(pose => Math.abs(pose.x - marker.x) < 0.05)
    marker.height = Math.max(0.15, ...near.map(pose => pose.height)) + DIVIDER_RISE
  }
  return finish(poses, markers, 0.01)
}

// --- (b) The Stack turned: a row of small piles -----------------------------------

/** One month's pile (or part of one): where it is, for the riffle (RowBooks). */
export interface RowPile {
  /** World x of its left and right ends. */
  left: number
  right: number
  /** Height of its top. */
  top: number
}

/** Most Books in one pile: a busier month continues in a second pile beside it. */
const PILE_MAX = 7
const PILE_GAP = 0.045
/** The ink sheet each pile rests on (the Stack's 'label' separator). */
export const PILE_SHEET = 0.003
/** The Stack's hand-stacked offsets and twists. */
const PILE_OFFSET_X = 0.012
const PILE_OFFSET_Z = 0.006
const PILE_TWIST = 0.06

/**
 * The Stack laid out sideways: Books lie flat as in today's pile (front Cover
 * up, Spine to the viewer, its text reading left to right), but each month is
 * its own small pile on its own ink sheet, and the piles follow one another to
 * the right, the date under each (the Stack's flat label with a leader line).
 * Within a pile the newest Book is on top.
 */
export function layoutPiles(books: Book[]): RowLayout {
  const byId = new Map(books.map(book => [book.id, book]))
  const poses: BookPose[] = []
  const markers: RowMarker[] = []
  const pileOf: Record<string, RowPile> = {}
  let x = 0
  for (const group of groups(books)) {
    const marker: RowMarker = { key: group.key, label: group.label, count: group.bookIds.length, x, start: x, end: 0 }
    for (let from = 0; from < group.bookIds.length; from += PILE_MAX) {
      const ids = group.bookIds.slice(from, from + PILE_MAX)
      const dims = ids.map(id => bookDimensions(byId.get(id)!, FREE, FREE))
      const width = Math.max(...dims.map(d => d.height)) + 2 * PILE_OFFSET_X
      const centre = x + width / 2
      const pile: RowPile = { left: x, right: x + width, top: 0 }
      let y = PILE_SHEET
      // Bottom first: the group lists its newest Book first, which goes on top.
      for (let index = ids.length - 1; index >= 0; index--) {
        const id = ids[index]!
        const book = byId.get(id)!
        const d = dims[index]!
        poses.push({
          bookId: id,
          ...d,
          x: centre + (random01(id, 'stack-x') - 0.5) * 2 * PILE_OFFSET_X,
          y: y + d.thickness / 2,
          z: (random01(id, 'stack-z') - 0.5) * 2 * PILE_OFFSET_Z,
          rotation: [0, (random01(id, 'stack-twist') - 0.5) * 2 * PILE_TWIST, Math.PI / 2],
          color: color(id),
          section: book.status,
        })
        pileOf[id] = pile
        y += d.thickness
      }
      pile.top = y
      x += width + PILE_GAP
    }
    marker.end = x - PILE_GAP
    markers.push(marker)
  }
  const layout = finish(poses, markers, 0.01)
  // Lying Books reach half their height (not their depth) to either side.
  if (poses.length) layout.extent = [markers[0]!.start - 0.01, markers.at(-1)!.end + 0.01]
  layout.piles = pileOf
  return layout
}

// --- (c) Fanned row ---------------------------------------------------------------

/** Turned this far from Spine-on, the front Covers face the viewer at an angle. */
export const FAN_YAW = -1.05
/** Between two Books' centres, and the extra step at a new month. */
const FAN_PITCH = 0.052
const FAN_GROUP_STEP = 0.07
const FAN_JITTER = 0.05

/**
 * A loose fanned row: every Book turned so its front Cover shows at an angle,
 * overlapping the one before like a fanned deck; a new month leaves a step,
 * its name on the floor in front.
 */
export function layoutFan(books: Book[]): RowLayout {
  const byId = new Map(books.map(book => [book.id, book]))
  const poses: BookPose[] = []
  const markers: RowMarker[] = []
  let x = 0
  groups(books).forEach((group, index) => {
    if (index > 0) x += FAN_GROUP_STEP - FAN_PITCH
    const marker: RowMarker = { key: group.key, label: group.label, count: group.bookIds.length, x: x - 0.04, start: x, end: 0 }
    for (const id of group.bookIds) {
      const book = byId.get(id)!
      const dims = bookDimensions(book, FREE, FREE)
      poses.push({
        bookId: id,
        ...dims,
        x,
        y: dims.height / 2,
        z: 0,
        rotation: [0, FAN_YAW + (random01(id, 'fan-yaw') - 0.5) * 2 * FAN_JITTER, 0],
        color: color(id),
        section: book.status,
      })
      x += FAN_PITCH
    }
    marker.end = x - FAN_PITCH
    markers.push(marker)
  })
  return finish(poses, markers, 0.03)
}

// --- Variants ------------------------------------------------------------------------

export const ROW_VARIANTS: Record<RowVariantKey, RowVariant> = {
  a: {
    key: 'a',
    name: 'Standing row',
    blurb: 'Upright like on a Shelf, Spines to you, seen a little from above. Each month starts behind an index card; the Book in the middle (or under the mouse) tips out at the top, as when you hook it with a finger.',
    camera: { fov: 30, tilt: 15, targetY: 0.125, targetZ: 0, viewHeight: 0.36 },
    focus: 'tilt',
    focusAt: 'centre',
    labels: 'tab',
    layout: layoutShelf,
  },
  b: {
    key: 'b',
    name: 'Stack turned sideways',
    blurb: 'Today\'s Stack laid out to the right: Books lie flat with their Spines to you (titles read left to right, as in the pile), each month a small pile on its ink sheet with the date under it. Scrolling across a pile riffles through it from top to bottom, as scrolling the Stack does.',
    camera: { fov: 30, tilt: 24, targetY: 0.03, targetZ: 0.05, viewHeight: 0.5 },
    focus: 'riffle',
    focusAt: 'centre',
    labels: 'leader',
    layout: layoutPiles,
  },
  c: {
    key: 'c',
    name: 'Fanned row',
    blurb: 'A loose row of front Covers turned at an angle and overlapping, months on the floor in front. The Book under your finger (or mouse) turns to face you and the others make room.',
    camera: { fov: 36, tilt: 14, targetY: 0.11, targetZ: 0.03, viewHeight: 0.33 },
    focus: 'flow',
    focusAt: 'pointer',
    labels: 'floor',
    layout: layoutFan,
  },
}

/** The Books in the row's order: newest first, or oldest first (a year in review from January). */
export function inRowOrder(books: Book[], order: RowOrder): Book[] {
  return order === 'chrono' ? [...books].reverse() : books
}
