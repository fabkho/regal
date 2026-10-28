// A · The Reel's beat (libellus plan docs/plans/shared-books-slideshow.md, section C
// "A · The Reel" and H): one beat every 3.2 s, the arc moves one place in 0.8 s on
// `standard`, then holds 2.4 s. The constants and curves are the prototype's
// (libellus-ref/shared-books-reel-proto/lib.js and index.html), so the timing is
// the same as the one the owner picked. Pure: time in, pose out.

/** One beat (ms): `BEAT = 3200` in index.html. */
export const REEL_BEAT = 3200
/** The move at the start of a beat (ms): `MOVE = 800` in index.html. */
export const REEL_MOVE = 800
/** The pills and caption come in over `standard`, this long after the move lands (ms): `seg(local, MOVE, MOVE + 250)`. */
export const REEL_BADGE_IN = 250
/** The pills and caption go out over `exit`, this long before the next beat (ms): `seg(local, BEAT - 200, BEAT)`. */
export const REEL_BADGE_OUT = 200
/** The dolly's period (ms): three beats, `BEAT * 3` in index.html. */
export const REEL_DOLLY_PERIOD = REEL_BEAT * 3
/** The camera's sway either side (deg): `sway * 4`. */
export const REEL_SWAY_DEG = 4
/** The camera's tilt (deg): `rotateX(-4deg)`. */
export const REEL_TILT_DEG = -4
/** The dolly's push in and out (px): `18 * cos(...)`. */
export const REEL_DOLLY_PX = 18
/** The camera's rest distance (px): `translateZ(-40px)`. */
export const REEL_CAMERA_Z = -40
/** Auto-play rounds before the reel rests (the first round is one pass over the Books). */
export const REEL_ROUNDS = 1
/**
 * The snap's duration (ms) per Book it travels: one move (REEL_MOVE) for a whole
 * Book, less for a part of one, never more than REEL_MOVE. The same rule for a
 * flick and a slow release (see drag.ts `releaseGlide`).
 */
export const REEL_SNAP_MS = REEL_MOVE

export type Easing = (x: number) => number

/** A CSS cubic-bezier as the prototype computes it (Newton steps, 8 at most). */
function bezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t
  const sy = (t: number) => ((ay * t + by) * t + cy) * t
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let t = x
    for (let i = 0; i < 8; i++) {
      const d = dx(t)
      if (Math.abs(d) < 1e-6) break
      t -= (sx(t) - x) / d
    }
    return sy(Math.min(1, Math.max(0, t)))
  }
}

/** The prototype's curves (lib.js `E`): `standard` for moves, `exit` for the badge going out, `sheet` for the detail. */
export const REEL_EASE = {
  standard: bezier(0.2, 0, 0, 1),
  sheet: bezier(0.32, 0.72, 0, 1),
  exit: bezier(0.4, 0, 1, 1),
} as const

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value))
}

/** Progress (0..1) of `t` through [a, b] (lib.js `seg`). */
export function seg(t: number, a: number, b: number): number {
  return clamp((t - a) / (b - a))
}

/** Time (ms) the auto-play runs for `n` Books: `rounds` passes, one beat per Book. */
export function reelTotal(n: number, rounds = REEL_ROUNDS): number {
  return Math.max(0, n) * rounds * REEL_BEAT
}

export interface ReelPhase {
  /** Beat number (0-based, counts from the start of the clock). */
  beat: number
  /** Continuous front position: beat - 1 + the move's progress (lib.js `focus`). */
  focus: number
  /** The pills and caption's opacity (0..1). */
  badge: number
  /** Index of the Book the beat holds in front, unwrapped (`beat % n` in index.html, without wrapping). */
  index: number
}

/**
 * The reel's state at `time` ms on its clock (not the page's): which beat,
 * where the arc stands, and how far the badges have come in. `index` counts
 * beats, so a caller wraps it with `n`.
 */
export function reelPhase(time: number): ReelPhase {
  const t = Math.max(0, time)
  const beat = Math.floor(t / REEL_BEAT)
  const local = t - beat * REEL_BEAT
  const move = REEL_EASE.standard(seg(local, 0, REEL_MOVE))
  const badge = REEL_EASE.standard(seg(local, REEL_MOVE, REEL_MOVE + REEL_BADGE_IN))
    * (1 - REEL_EASE.exit(seg(local, REEL_BEAT - REEL_BADGE_OUT, REEL_BEAT)))
  return { beat, focus: beat - 1 + move, badge, index: beat }
}

/** The nearest whole Book, as a number that is never -0 (so poses and tests see +0). */
export function wholeBook(focus: number): number {
  return Math.round(focus) + 0
}
