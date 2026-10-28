// The Reel's swipe (libellus plan section H): the arc follows a finger 1:1, a
// flick glides on and snaps to a Book. It is Regal's row drag (utils/row/touchDrag.ts:
// the slop, the axis, the release speed, Android's fling curve), so the reel
// feels like the row; only the snap is new. Pure: the component feeds it the
// finger and the clock, and reads back the arc's focus (timeline.ts, layout.ts).

import { dragAxis, flingAt, followed, releaseVelocity, ROW_TOUCH_SLOP, startFling, trackDrag } from '../row/touchDrag'
import type { DragAxis, DragSample } from '../row/touchDrag'
import { REEL_WRAP_FROM, REEL_SPACING } from './layout'
import { clamp, REEL_SNAP_MS, wholeBook } from './timeline'

export { dragAxis, releaseVelocity, ROW_TOUCH_SLOP, trackDrag }
export type { DragAxis, DragSample }

/**
 * Px of finger movement that moves the arc by one Book: `REEL_SPACING` (132 px),
 * the distance from the front Book to its first neighbour. So a drag of one
 * neighbour's width brings that neighbour to the front, 1:1 at the front. The
 * arc's further Books move on in less px (REEL_STEP, 62) but still one Book per
 * step, so the snap stays on whole Books. W3 passes this as `pxPerBook`.
 */
export const REEL_DRAG_PX_PER_BOOK = REEL_SPACING

/**
 * The arc's focus while a finger drags it: `startFocus` (where the arc was when
 * the drag took over, see `frontFocus`) moved by the finger's sideways distance
 * past the slop. Finger right → content right → the previous Book comes in.
 */
export function dragFocus(startFocus: number, dx: number, pxPerBook = REEL_DRAG_PX_PER_BOOK): number {
  return startFocus - followed(dx) / pxPerBook
}

/** Book boundaries passed between two focus values: one haptic tick each. */
export function bookTicks(from: number, to: number): number {
  return Math.abs(wholeBook(to) - wholeBook(from))
}

export interface ReelGlide {
  /** Focus when the finger let go (or the snap began). */
  from: number
  /** The Book it snaps to (whole). */
  to: number
  /** Px per Book (see REEL_DRAG_PX_PER_BOOK). */
  pxPerBook: number
  /** ms: REEL_SNAP_MS per Book travelled, at most REEL_SNAP_MS. */
  duration: number
}

/**
 * The glide after a release at `focus` with `velocity` (px/s, right is positive,
 * from `releaseVelocity`). A flick (fast enough for Regal's fling) carries the
 * arc on by its fling distance; the arc then snaps to the nearest Book there.
 * A slow release snaps to the nearest Book where it stands. The target is kept
 * on the arc: for n < REEL_WRAP_FROM within [0, n-1]; for a ringing arc at most
 * one lap (n Books) away.
 */
export function releaseGlide(focus: number, pxPerBook: number, velocity: number, n: number): ReelGlide {
  const fling = startFling(velocity)
  // Content travels with the finger: a right flick (distance > 0) lowers the focus.
  const landing = fling ? focus - fling.distance / pxPerBook : focus
  let to = wholeBook(landing)
  if (n >= REEL_WRAP_FROM) to = clamp(to, wholeBook(focus) - n, wholeBook(focus) + n)
  if (n >= 1 && n < REEL_WRAP_FROM) to = clamp(to, 0, n - 1)
  const duration = Math.min(REEL_SNAP_MS, REEL_SNAP_MS * Math.abs(to - focus))
  return { from: focus, to: to + 0, pxPerBook, duration: duration + 0 }
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
