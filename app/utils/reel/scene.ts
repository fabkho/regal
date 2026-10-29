// The Reel's 3D stage (components/reel/*): the prototype's CSS 3D scene
// (libellus-ref/shared-books-reel-proto/index.html, base.css) turned into a
// three.js one, one CSS px to one millimetre. A CSS `perspective: 900px` with
// `perspective-origin: 50% 40%` is a camera 900 px in front of the stage's
// plane, its axis through the point 40 % down the stage, looking straight in;
// the stage is the window of that view the canvas shows (`reelWindow`). Broken
// out (a Book taken out, the canvas over the viewport) the same camera shows
// the whole viewport, the card's part of it unchanged. Pure, so it's testable.

import { REEL_EASE } from './timeline'
import { REEL_WRAP_FROM } from './layout'

/** World units (metres) per CSS px of the prototype. */
export const REEL_PX = 0.001

/** The prototype's Book (index.html `W`, `H`, `T`), CSS px: across the Cover, its height, its thickness. */
export const REEL_BOOK = Object.freeze({ width: 124, height: 186, thickness: 26 })

/** `perspective: 900px` (base.css `.stage`): the camera's distance from the stage's plane, CSS px. */
export const REEL_PERSPECTIVE = 900

/** `perspective-origin: 50% 40%`: where the camera's axis meets the stage, as a share of its height from the top. */
export const REEL_AXIS_Y = 0.4

/** The stage's height in the prototype (CSS px): `.stage { height: 330px }`. */
export const REEL_STAGE_HEIGHT = 330

/**
 * How far the arc stands higher in the stage than the prototype's (CSS px): the world's origin is
 * this far above the stage's middle, so there is less empty stage above the Books (a host's heading
 * stands closer to them). The camera and its perspective stay where they were; the poster, the still
 * and the canvas all move by it (`--regal-reel-rise`, default this).
 */
export const REEL_RISE = 40

/**
 * The soft floor shadow under each Book (index.html `shadows`, base.css
 * `.shadow`): an ellipse 1.25 Book widths wide and 26 px deep, its middle
 * `drop` px under the Book's middle, tilted back 80°, a radial gradient of
 * rgba(30, 20, 10, .28) to transparent.
 */
export const REEL_SHADOW = Object.freeze({ width: 1.25, depth: 26, drop: REEL_BOOK.height / 2 + 10 + 13, tilt: 80, rgb: [30, 20, 10] as const, alpha: 0.28 })

/** The window of the camera's view a canvas shows (three's `setViewOffset` and the frustum around it). */
export interface ReelWindow {
  /** Vertical field of view of the whole (centred) view, degrees. */
  fov: number
  aspect: number
  fullWidth: number
  fullHeight: number
  /** The canvas inside the whole view. */
  offsetX: number
  offsetY: number
  width: number
  height: number
}

/**
 * The view a canvas `width` × `height` px shows of a camera whose axis meets it
 * at (`axisX`, `axisY`) px with a focal length of `focal` px: a view centred on
 * the axis, as large as it needs to be for the canvas to be a window of it.
 * For the card: its own size, the axis 50 % across and 40 % down. Broken out:
 * the viewport, the axis where it is in the card (the card's pixels unchanged).
 * `into`: written there instead of a new object (every frame).
 */
export function reelWindow(width: number, height: number, axisX: number, axisY: number, focal = REEL_PERSPECTIVE, into?: ReelWindow): ReelWindow {
  const w = Math.max(1, width)
  const h = Math.max(1, height)
  const halfWidth = Math.max(axisX, w - axisX, 1)
  const halfHeight = Math.max(axisY, h - axisY, 1)
  const out = into ?? { fov: 0, aspect: 1, fullWidth: 0, fullHeight: 0, offsetX: 0, offsetY: 0, width: 0, height: 0 }
  out.fov = (2 * Math.atan(halfHeight / Math.max(1, focal)) * 180) / Math.PI
  out.aspect = halfWidth / halfHeight
  out.fullWidth = 2 * halfWidth
  out.fullHeight = 2 * halfHeight
  out.offsetX = halfWidth - axisX
  out.offsetY = halfHeight - axisY
  out.width = w
  out.height = h
  return out
}

/**
 * A jump of the arc made smooth: a tap on a neighbour, an arrow key or a Book
 * taken out mid-move set where the arc stands at once (state.ts); what shows
 * eases from where it was, the offset fading over `duration` on `standard`.
 */
export interface ReelSettle {
  /** Books between what showed and the new position, when the jump happened. */
  offset: number
  /** performance.now() of the jump. */
  start: number
  duration: number
}

/** The settle's offset left at `now` (0 once it is over). */
export function settleOffset(settle: ReelSettle | null, now: number): number {
  if (!settle || settle.duration <= 0) return 0
  const t = (now - settle.start) / settle.duration
  if (t >= 1) return 0
  return settle.offset * (1 - REEL_EASE.standard(Math.max(0, t)))
}

/**
 * The offset for a jump from `shown` to `target` on an arc of `n` Books: the
 * short way round for a ringing arc, so a tap on the Book left of the first
 * never travels the whole ring.
 */
export function jumpOffset(shown: number, target: number, n: number): number {
  const raw = shown - target
  if (n < REEL_WRAP_FROM || n < 1) return raw
  let d = ((raw % n) + n) % n
  if (d > n / 2) d -= n
  return d
}

/**
 * Which Book the caption, the pills and the dots show: the one the arc is
 * nearest; while it plays, the one the beat brings to the front (the
 * prototype's `beat % n`: the caption changes while it is faded out).
 */
export function reelShownIndex(focus: number, n: number, playing: boolean): number {
  if (n < 1) return 0
  const whole = playing ? Math.ceil(focus - 1e-6) : Math.round(focus)
  const index = n >= REEL_WRAP_FROM ? ((whole % n) + n) % n : Math.min(n - 1, Math.max(0, whole))
  return index + 0
}

/**
 * A drag past the ends of an arc that doesn't ring (2–3 Books) gives way less
 * and less, as a scroll view at its end does.
 */
export function rubberFocus(focus: number, n: number): number {
  if (n >= REEL_WRAP_FROM || n < 1) return focus
  const max = n - 1
  if (focus < 0) return -0.35 * (1 - Math.exp(focus / 0.35))
  if (focus > max) return max + 0.35 * (1 - Math.exp(-(focus - max) / 0.35))
  return focus
}

/** How the label text of the pause button reads: `labels` replaced the defaults (`ReelLabels`). */
export interface ReelLabels {
  /** The pause button while the reel plays. */
  pause: string
  /** The pause button while it doesn't. */
  play: string
  /** The reel's name for assistive technology (also the `label` prop). */
  reel: string
  /** "Book {n} of {count}: …" */
  slide: string
  /** The hint on the stage for keyboard users. */
  keys: string
  /** The Book list's name. */
  list: string
  /** The details' Open book action (default actions). */
  open: string
  /** The details' turn action. */
  showBack: string
  showFront: string
  /** The details' put back action. */
  putBack: string
}

export const REEL_LABELS: Readonly<ReelLabels> = Object.freeze({
  pause: 'Pause',
  play: 'Play',
  reel: 'Books',
  slide: 'Book {n} of {count}',
  keys: 'Left and right arrow keys move the reel, Enter takes the Book out',
  list: 'Book list',
  open: 'Open book',
  showBack: 'Show back',
  showFront: 'Show front',
  putBack: 'Put back',
})

/** Fills `{n}` and `{count}` (and any other `{key}`) in a label. */
export function fillLabel(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole))
}
