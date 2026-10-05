// Row layout: the Stack turned 90° clockwise for an inline card
// (RegalBooksRow). The pile's bottom is on the left and what was read last
// on the right; the Books stand pressed together, Spines to the viewer, each
// month after the Stack's hairline sheet, its date above the row. Pure and
// deterministic (seeded by Book Id), like the Stack's layout.
//
// Book axes as everywhere (utils/books/pose.ts): thickness along local x (the
// front Cover is +x), height along y, depth along z, the Spine is +z.
import type { Book } from '#layers/regal/shared/types/book'
import type { BookPose } from '#layers/regal/app/utils/books/pose'
import { bookDimensions, CLOTH_COLORS, hashString, random01, sortForShelves } from '#layers/regal/app/utils/bookcase/layout'
import { SEPARATOR_THICKNESS } from '#layers/regal/app/utils/stack/separators'
import { stackGroups } from '#layers/regal/app/utils/stack/view'

/** A month (or status) group along the row: where its sheet stands and its date goes. */
export interface RowMarker {
  key: string
  /** 'MAR 2026', 'READING'. */
  label: string
  count: number
  /** World x of the sheet before the group. */
  x: number
  /** The taller of the sheet's neighbours: where the date's leader line ends. */
  height: number
}

export interface RowLayout {
  /** Left to right: oldest first. */
  poses: BookPose[]
  markers: RowMarker[]
  /** World x range the row takes. */
  extent: [number, number]
}

/** How the row's camera looks at it: it only ever slides along x. */
export const ROW_CAMERA = {
  /** Vertical field of view, degrees. */
  fov: 30,
  /** How far it looks down, degrees. */
  tilt: 14,
  /** The point it looks at: height and depth (the plane scrolling is matched to: the Spines). */
  targetY: 0.13,
  targetZ: 0,
  /** World metres of that plane the view's height shows. */
  viewHeight: 0.38,
} as const

/** The Stack's separator ('label'): a hairline ink sheet in the pile. */
export const ROW_SHEET = SEPARATOR_THICKNESS.label
/** The sheet's height: shorter than the Books, so only its front edge shows between the Spines. */
export const ROW_SHEET_HEIGHT = 0.16
/** Dates stand this high, above the tallest Books. */
export const ROW_LABEL_Y = 0.272
/** The Stack's hand-stacked front/back offsets and twists (utils/stack/layout.ts), turned with the pile. */
const OFFSET_Z = 0.008
const TWIST = 0.07
const MARGIN = 0.008

/**
 * The Books a row shows: what is being read and what was read, newest first
 * (as the Stack), only those read in `year` if given, the newest `limit` if given.
 */
export function rowBooks(books: Book[], options: { limit?: number | null, year?: number | null } = {}): Book[] {
  const shown = sortForShelves(books.filter(book =>
    options.year
      ? book.status === 'read' && book.dateRead?.startsWith(String(options.year))
      : book.status === 'currently-reading' || (book.status === 'read' && !!book.dateRead),
  ))
  return options.limit && options.limit > 0 ? shown.slice(0, options.limit) : shown
}

/**
 * Lays the row out left to right from Books given oldest first. Turned for a
 * row: the Books stand on one line (gravity) instead of the Stack's sideways
 * offsets; its front/back offsets and twists stay.
 */
export function layoutRow(oldestFirst: Book[]): RowLayout {
  const byId = new Map(oldestFirst.map(book => [book.id, book]))
  const poses: BookPose[] = []
  const markers: RowMarker[] = []
  let x = 0
  for (const group of stackGroups(oldestFirst, 'month')) {
    const marker: RowMarker = { key: group.key, label: group.label, count: group.bookIds.length, x: x + ROW_SHEET / 2, height: 0 }
    x += ROW_SHEET
    for (const id of group.bookIds) {
      const book = byId.get(id)!
      const dims = bookDimensions(book, 1, 1)
      poses.push({
        bookId: id,
        ...dims,
        x: x + dims.thickness / 2,
        y: dims.height / 2,
        z: -dims.depth / 2 + (random01(id, 'stack-z') - 0.5) * 2 * OFFSET_Z,
        // The Stack twists a Book about the pile's axis: about x, turned.
        rotation: [(random01(id, 'stack-twist') - 0.5) * 2 * TWIST, 0, 0],
        color: CLOTH_COLORS[hashString(id) % CLOTH_COLORS.length]!,
        section: book.status,
      })
      x += dims.thickness
    }
    markers.push(marker)
  }
  for (const marker of markers) {
    const near = poses.filter(pose => Math.abs(pose.x - marker.x) < 0.04)
    marker.height = Math.max(0.15, ...near.map(pose => pose.height))
  }
  return { poses, markers, extent: poses.length ? [-MARGIN, x + MARGIN] : [0, 0] }
}

/** Px per character of the date's font (IBM Plex Mono 600 at 0.7 rem). */
const LABEL_CHAR = 7

export interface RowLabel extends RowMarker {
  /** The month ('MAR'), or a status ('READING'). */
  text: string
  /** The year set small beside it, as on the Stack's dates; '' when the whole row is one year. */
  small: string
}

/**
 * The dates that fit at `pxPerMetre`: each month with its year small; a date
 * that would run into the one before it is left out (its sheet still shows),
 * so short months don't pile their dates on each other.
 */
export function rowLabels(markers: RowMarker[], pxPerMetre: number): RowLabel[] {
  const years = new Set(markers.map(marker => /\d{4}$/.exec(marker.label)?.[0] ?? marker.label))
  const oneYear = years.size === 1
  let lastRight = -Infinity
  const shown: RowLabel[] = []
  for (const marker of markers) {
    const [, month, year] = /^(.*?)(?: (\d{4}))?$/.exec(marker.label) ?? [marker.label, marker.label, undefined]
    const small = year && !oneYear ? year : ''
    const width = (month!.length + small.length * 0.5 + String(marker.count).length + 1) * LABEL_CHAR + 16
    // Centred on the sheet.
    const from = marker.x * pxPerMetre - width / 2
    if (from < lastRight + 6) continue
    lastRight = from + width
    shown.push({ ...marker, text: month!, small })
  }
  return shown
}

/** Where the row's native scroll puts the camera (RowCard). */
export interface RowScroll {
  /** World x the camera looks at with scrollLeft 0: the first (oldest) Book's centre. */
  cameraStart: number
  /** The scroll's range, px: from the first Book in the card's middle to the last. */
  maxScroll: number
  /** Width of the scrolled track, px: the card's width plus maxScroll. */
  trackWidth: number
}

/**
 * The row's scroll for a card `width` px wide at `pxPerMetre`. The focus line
 * is the card's middle everywhere: the track has room before the first Book
 * and after the last (half the card less half an end Book's Spine), so either
 * end Book can stand in the middle as well, and the Book in focus never sits
 * off-centre. Scrolled to its end, the newest Book is in the middle.
 */
export function rowScroll(layout: Pick<RowLayout, 'poses'>, width: number, pxPerMetre: number): RowScroll {
  const first = layout.poses[0]?.x ?? 0
  const last = layout.poses.at(-1)?.x ?? first
  const span = Math.max(0, last - first) * pxPerMetre
  // Whole px: scrollLeft only reaches whole (device) px at its end.
  const maxScroll = span > 0.5 ? Math.ceil(span) : 0
  return { cameraStart: first, maxScroll, trackWidth: Math.max(0, width) + maxScroll }
}

/** Where a row starts: at what was read last (its right end), or at its first Book (a year row's January). */
export type RowStart = 'newest' | 'oldest'

/**
 * The scrollLeft (px) a row rests at before the reader scrolls it: the card
 * full of Books. Starting at the newest, the last Book's Spine is flush with
 * the card's right edge (the end space that lets it be centred stays out of
 * sight); starting at the oldest, the first Book's Spine is flush with the
 * left edge. The Book in focus at rest is then the one in the card's middle.
 * A row that doesn't fill the card stands centred in it as a group. Measured
 * at the plane scrolling is matched to (the Spines), from the Spine widths:
 * the camera's x is `scroll.cameraStart + scrollLeft / pxPerMetre`, the card
 * shows `width / pxPerMetre` metres around it. Within 0..maxScroll, so
 * scrolling on still centres either end Book.
 */
export function rowRest(layout: Pick<RowLayout, 'poses'>, scroll: RowScroll, width: number, pxPerMetre: number, start: RowStart): number {
  const first = layout.poses[0]
  const last = layout.poses.at(-1)
  if (!first || !last || !scroll.maxScroll || width <= 0 || pxPerMetre <= 0) return 0
  const left = first.x - first.thickness / 2
  const right = last.x + last.thickness / 2
  const half = width / 2 / pxPerMetre
  const camera = (right - left) * pxPerMetre <= width
    ? (left + right) / 2
    : start === 'newest' ? right - half : left + half
  return Math.min(scroll.maxScroll, Math.max(0, (camera - scroll.cameraStart) * pxPerMetre))
}

/**
 * Where the row's resting camera (RowScene at rest: looking at `cameraX`, no
 * step back, in a card `width` × `height` px) shows the world point (x, y,
 * z = 0): px from the card's top left. The dates are placed with it, so they
 * stay where they belong whatever the 3D camera does meanwhile (a Book taken
 * out, broken out over the viewport, landing back).
 */
export function rowProject(x: number, y: number, cameraX: number, width: number, height: number): { x: number, y: number } {
  const tan = Math.tan(ROW_CAMERA.fov * Math.PI / 360)
  const tilt = ROW_CAMERA.tilt * Math.PI / 180
  const distance = ROW_CAMERA.viewHeight / (2 * tan)
  // The point in the camera's frame: across, up and ahead.
  const dy = y - ROW_CAMERA.targetY
  const across = x - cameraX
  const up = dy * Math.cos(tilt) + ROW_CAMERA.targetZ * Math.sin(tilt)
  const ahead = distance - dy * Math.sin(tilt) + ROW_CAMERA.targetZ * Math.cos(tilt)
  const scale = height / 2 / (ahead * tan)
  return { x: width / 2 + across * scale, y: height / 2 - up * scale }
}

/** A date keeps at least this far (px) from the card's sides while its sheet is in the card. */
export const ROW_LABEL_INSET = 6

/**
 * How far (px) a date `labelWidth` px wide, centred on its sheet at `x` px in
 * a card `width` px wide, slides sideways to stay inside the card: in from
 * either side, the inset from it, until its sheet is half a date beyond the
 * edge (January's sheet at a year row's rest is just off the card, behind
 * the first Spine's edge), then out with it, without a jump. Its leader line
 * stays on the sheet.
 */
export function rowLabelNudge(x: number, labelWidth: number, width: number, inset = ROW_LABEL_INSET): number {
  const half = labelWidth / 2
  const most = labelWidth + inset
  const fromLeft = Math.min(most, Math.max(0, inset + half - x))
  const fromRight = Math.min(most, Math.max(0, x + half + inset - width))
  return fromLeft - fromRight
}

/** Px between the row's front bottom edge and the top of its focus label. */
export const ROW_FOCUS_GAP = 10

/**
 * Where the focus label (title and stars of the Book in focus) sits, px from
 * the card's top in a card `height` px tall: just under the row, where the
 * camera sees the Books' front bottom edge (the floor at z = 0) in the
 * middle. Fixed: the same for every Book in focus and every card width, so
 * the label doesn't wander; it is centred across the card (RowCard).
 */
export function rowFocusLabelTop(height: number): number {
  const fov = ROW_CAMERA.fov * Math.PI / 180
  const tilt = ROW_CAMERA.tilt * Math.PI / 180
  const distance = ROW_CAMERA.viewHeight / (2 * Math.tan(fov / 2))
  // The floor's front edge under the camera's target, in the camera's frame:
  // how far below the view's axis, over how far ahead.
  const below = ROW_CAMERA.targetY * Math.cos(tilt) - ROW_CAMERA.targetZ * Math.sin(tilt)
  const ahead = distance + ROW_CAMERA.targetY * Math.sin(tilt) + ROW_CAMERA.targetZ * Math.cos(tilt)
  const ndc = below / ahead / Math.tan(fov / 2)
  return height / 2 * (1 + ndc) + ROW_FOCUS_GAP
}
