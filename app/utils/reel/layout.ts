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
/**
 * Books this far (in Books) from the front or nearer are fully there; between this and REEL_FADE_AT a Book
 * is coming in or going out at the arc's edge (`ReelPose.edge`, 1 to 0). At rest (whole Books in front) the
 * Books stand 0, 1 and 2 away: all fully there.
 */
export const REEL_EDGE_FROM = 2.1
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
  /**
   * How much of the Book is there at the arc's edge, 1 (fully) to 0 (gone): continuous with the arc's position
   * (the distance from REEL_EDGE_FROM to REEL_FADE_AT), so it scrubs with a swipe. What a Book looks like at
   * the edge is edge.ts' (`ReelEdge`).
   */
  edge: number
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
  return reelPoseInto(index, focus, n, { distance: 0, x: 0, y: 0, z: 0, rotateY: 0, opacity: 0, edge: 0, shadow: 0, zIndex: 0 })
}

/** `reelPose`, written into `out` (the reel poses its Books every frame without allocating). */
export function reelPoseInto(index: number, focus: number, n: number, out: ReelPose): ReelPose {
  const d = reelDistance(index, focus, n)
  const ad = Math.abs(d)
  const s = Math.sign(d)
  const hidden = ad > REEL_FADE_AT
  out.distance = d
  out.x = s * (ad < 1 ? ad * REEL_SPACING : REEL_SPACING + (ad - 1) * REEL_STEP) + 0
  out.y = REEL_LIFT
  out.z = -Math.min(ad, 1) * REEL_DEPTH - Math.max(0, ad - 1) * REEL_DEPTH_STEP + 0
  out.rotateY = -clamp(d, -1, 1) * REEL_TURN - s * clamp(ad - 1, 0, 2) * REEL_TURN_STEP + 0
  out.opacity = hidden ? 0 : 1
  out.edge = hidden ? 0 : clamp((REEL_FADE_AT - ad) / (REEL_FADE_AT - REEL_EDGE_FROM))
  out.shadow = hidden ? 0 : 1 - ad * 0.3
  out.zIndex = 100 - Math.round(ad * 10)
  return out
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
  return reelCameraInto(time, { z: 0, rotateY: 0, rotateX: 0 })
}

/** `reelCamera`, written into `out`. */
export function reelCameraInto(time: number, out: ReelCamera): ReelCamera {
  const phase = (time / REEL_DOLLY_PERIOD) * Math.PI * 2
  out.z = REEL_CAMERA_Z + REEL_DOLLY_PX * Math.cos(phase)
  out.rotateY = Math.sin(phase) * REEL_SWAY_DEG
  out.rotateX = REEL_TILT_DEG
  return out
}
