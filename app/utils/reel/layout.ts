// A · The Reel's arc (libellus plan section C "A · The Reel"): the Books stand on
// an arc, the one in front square to the camera, the neighbours turned so their
// spines show, two more further out, the rest hidden. The numbers are the
// prototype's (libellus-ref/shared-books-reel-proto/index.html, `render`), in
// CSS px and degrees. Pure: `focus` (continuous, see timeline.ts) in, poses out.

import { clamp, REEL_CAMERA_Z, REEL_DOLLY_PERIOD, REEL_DOLLY_PX, REEL_SWAY_DEG, REEL_TILT_DEG } from './timeline'

/** From the front Book to the first neighbour's centre (px). */
export const REEL_SPACING = 132
/** From the first neighbour on, each further Book (px). */
export const REEL_STEP = 62
/** The neighbours' turn (deg): the spines show. */
export const REEL_TURN = 52
/** The extra turn per Book beyond the first, up to two more (deg). */
export const REEL_TURN_STEP = 6
/** How far the first neighbour is pulled back (px). */
export const REEL_DEPTH = 120
/** The extra pull back per Book beyond the first (px). */
export const REEL_DEPTH_STEP = 40
/** Books this far (in Books) from the front are hidden. */
export const REEL_FADE_AT = 2.6
/** The arc's lift (px, up is negative). */
export const REEL_LIFT = -10
/** Rings only from this many Books: with 2 or 3 there is no wrap (the arc has ends). */
export const REEL_WRAP_FROM = 4

export interface ReelPose {
  /** Signed Books from the front (0 = in front, negative = left). */
  distance: number
  /** px, right is positive. */
  x: number
  /** px, up is negative. */
  y: number
  /** px, towards the viewer is positive. */
  z: number
  /** deg about the vertical axis. */
  rotateY: number
  /** 0 or 1: hidden Books are 0 (the prototype's hard cut at REEL_FADE_AT). */
  opacity: number
  /** The floor shadow's opacity (0..1). */
  shadow: number
  zIndex: number
}

/**
 * Signed distance (Books) from `focus` to Book `index`. With `n` ≥ REEL_WRAP_FROM the
 * arc rings: the distance is taken the short way round, into (-n/2, n/2].
 */
export function reelDistance(index: number, focus: number, n: number): number {
  const raw = index - focus
  if (n < REEL_WRAP_FROM) return raw
  let d = ((raw % n) + n) % n
  if (d > n / 2) d -= n
  return d
}

/** The pose of Book `index` for the arc at `focus` (n Books). */
export function reelPose(index: number, focus: number, n: number): ReelPose {
  const d = reelDistance(index, focus, n)
  const ad = Math.abs(d)
  const s = Math.sign(d)
  const hidden = ad > REEL_FADE_AT
  return {
    distance: d,
    x: s * (ad < 1 ? ad * REEL_SPACING : REEL_SPACING + (ad - 1) * REEL_STEP),
    y: REEL_LIFT,
    z: -Math.min(ad, 1) * REEL_DEPTH - Math.max(0, ad - 1) * REEL_DEPTH_STEP,
    rotateY: -clamp(d, -1, 1) * REEL_TURN - s * clamp(ad - 1, 0, 2) * REEL_TURN_STEP,
    opacity: hidden ? 0 : 1,
    shadow: hidden ? 0 : 1 - ad * 0.3,
    zIndex: 100 - Math.round(ad * 10),
  }
}

/** Poses of all `n` Books for the arc at `focus`, in Book order. */
export function reelLayout(focus: number, n: number): ReelPose[] {
  return Array.from({ length: Math.max(0, n) }, (_, index) => reelPose(index, focus, n))
}

export interface ReelCamera {
  /** px. */
  z: number
  /** deg. */
  rotateY: number
  /** deg. */
  rotateX: number
}

/** The slow dolly and sway at `time` ms on the reel's clock (index.html: the world's transform). */
export function reelCamera(time: number): ReelCamera {
  const phase = (time / REEL_DOLLY_PERIOD) * Math.PI * 2
  return {
    z: REEL_CAMERA_Z + REEL_DOLLY_PX * Math.cos(phase),
    rotateY: Math.sin(phase) * REEL_SWAY_DEG,
    rotateX: REEL_TILT_DEG,
  }
}
