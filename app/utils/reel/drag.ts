// The Reel's swipe (libellus plan section H): the arc follows a finger 1:1, a
// flick glides on and snaps to a Book. It is Regal's row drag (utils/row/touchDrag.ts:
// the slop, the axis, the release speed, Android's fling curve), so the reel
// feels like the row; only the snap is new. Pure: the component feeds it the
// finger and the clock, and reads back the arc's focus (timeline.ts, layout.ts).

import { dragAxis, flingAt, releaseVelocity, startFling, trackDrag, followed, ROW_TOUCH_SLOP } from '../row/touchDrag'
import type { DragAxis, DragSample } from '../row/touchDrag'
import { REEL_SNAP_MS } from './timeline'

export { dragAxis, releaseVelocity, ROW_TOUCH_SLOP, trackDrag }
export type { DragAxis, DragSample }

/** A glide is at least this long (ms): a barely-moving release still eases into its Book. */
export const REEL_GLIDE_MIN_MS = 200
/** A glide is at most this long (ms): one move, however hard the flick. */
export const REEL_GLIDE_MAX_MS = REEL_SNAP_MS

/**
 * The arc's focus while a finger drags it: `startFocus` (where the arc was when
 * the drag took over, see `frontFocus`) moved by the finger's sideways distance
 * past the slop. Finger right → content right → the previous Book comes in.
 */
export function dragFocus(startFocus: number, dx: number, pxPerBook: number): number {
  return startFocus - followed(dx) / pxPerBook
}

/** Book boundaries passed between two focus values: one haptic tick each. */
export function bookTicks(from: number, to: number): number {
  return Math.abs(Math.round(to) - Math.round(from))
}

export interface ReelGlide {
  /** Focus when the finger let go (or the snap began). */
  from: number
  /** The Book it snaps to (whole). */
  to: number
  /** Px per Book on screen (the arc's spacing at this width). */
  pxPerBook: number
  /** ms. */
  duration: number
}

/**
 * The glide after a release at `focus` with `velocity` (px/s, right is
 * positive, from `releaseVelocity`). A flick (fast enough for Regal's fling)
 * carries the arc on along its fling distance and snaps to the nearest Book
 * there; no flick snaps to the nearest Book where it stands.
 */
export function releaseGlide(focus: number, pxPerBook: number, velocity: number): ReelGlide {
  const fling = startFling(velocity)
  if (!fling) return { from: focus, to: Math.round(focus), pxPerBook, duration: REEL_SNAP_MS }
  // Content travels with the finger: a right flick (distance > 0) lowers the focus.
  const to = Math.round(focus - fling.distance / pxPerBook)
  const duration = Math.min(REEL_GLIDE_MAX_MS, Math.max(REEL_GLIDE_MIN_MS, fling.duration))
  return { from: focus, to, pxPerBook, duration }
}

/**
 * The arc's focus `elapsed` ms into a glide, and whether it has landed.
 * The shape is Android's Scroller curve (`flingAt`), over the glide's own distance
 * and duration. Landing is exact: `to`.
 */
export function glideFocus(glide: ReelGlide, elapsed: number): { focus: number, done: boolean } {
  // Px the content travels (right is positive): the focus goes from `from` down to `to`.
  const distance = (glide.from - glide.to) * glide.pxPerBook
  if (distance === 0) return { focus: glide.to, done: true }
  const at = flingAt({ velocity: 0, distance, duration: glide.duration }, elapsed)
  if (at.done) return { focus: glide.to, done: true }
  return { focus: glide.from - at.offset / glide.pxPerBook, done: false }
}
