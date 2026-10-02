// Scroll highlight: the Stack's answer to hover for scrolling and touch. A
// fixed focus line runs through the middle of the view; Books passing it fan
// out like pages flipped through (a riffle), turning about their left end so
// their page edges show, the centred one most, with its label beside it.
// Decided by the owner (the focus-line and wave variants were dropped).
// Pure, so it's unit-testable; Scene.vue publishes the scroll, the Book meshes
// apply the lift (composables/useScrollHighlight.ts).
import type { InjectionKey } from 'vue'

/** The scroll as the Stack scene publishes it each frame (one shared object, no allocation). */
export interface StackScroll {
  /** Height (m) of the focus line where it crosses the Spines: the vertical centre of the view. */
  focusY: number
  /** How fast the view moves (m/s, up is positive). */
  speed: number
  /** Where the focus line is heading: the end of a wheel step or fling (the Books' load window). */
  targetY: number
  /** Half the height the view shows at the pile (m). */
  halfView: number
}

export const STACK_SCROLL: InjectionKey<StackScroll> = Symbol('regal:stack-scroll')

/** What a highlighted Book does, written in place each frame. */
export interface Lift {
  /** Towards the viewer (m). */
  out: number
  /** Top tilting out (rad), as on hover. */
  tilt: number
  /** Turned about the vertical through its left end (rad): the right end swings out. */
  yaw: number
  /** Gloss, 0..1 (same scale as hover). */
  shine: number
}

export const RIFFLE = {
  /** Books this far from the line (m) still fan out. */
  radius: 0.08,
  out: 0.02,
  tilt: 0.02,
  /** The centred Book turns this far (rad), showing its page edges. */
  yaw: 0.3,
  /** Easing rate (1/s) towards the target amount. */
  rate: 12,
} as const

/** A newly nearest Book takes the focus only when nearer than the current one by this much (m). */
export const FOCUS_HYSTERESIS = 0.002

/** Raised cosine: 1 on the line, 0 from `radius` on. */
export function bell(distance: number, radius: number): number {
  const u = Math.abs(distance) / radius
  if (u >= 1) return 0
  return 0.5 + 0.5 * Math.cos(Math.PI * u)
}

/** How far out (0..1) a Book wants to be, `distance` metres above (positive) or below the focus line. */
export function targetAmount(distance: number): number {
  return bell(distance, RIFFLE.radius)
}

/** One frame of exponential easing; snaps when close so a resting Book costs nothing. */
export function approach(current: number, target: number, rate: number, delta: number): number {
  const next = current + (target - current) * (1 - Math.exp(-rate * delta))
  return Math.abs(next - target) < 0.001 ? target : next
}

/** The lift for an amount (0..1). Reduced motion keeps the shine only. Writes into `into`. */
export function liftFor(amount: number, reduced: boolean, into: Lift): Lift {
  into.shine = amount
  into.out = reduced ? 0 : RIFFLE.out * amount
  into.tilt = reduced ? 0 : RIFFLE.tilt * amount
  into.yaw = reduced ? 0 : RIFFLE.yaw * amount
  return into
}

/** Over this much scroll (m) before either end, the focus line slides out to the end Book. */
export const END_RAMP = 0.25

/**
 * Where the focus line sits for a view at `centre` scrolled within `bounds`:
 * the middle of the view, except near either end, where the camera stops
 * before the first or last Book reaches the middle (the pile's bottom rests
 * low in the view). There the line slides on to `ends` (the end Books'
 * centres), so every Book can be focused. Continuous and rising with `centre`.
 */
export function focusLine(centre: number, bounds: readonly [number, number], ends: readonly [number, number]): number {
  const [low, high] = bounds
  const ramp = Math.min(END_RAMP, Math.max(0, (high - low) / 2))
  if (ramp <= 0) return centre
  const below = Math.max(0, 1 - (centre - low) / ramp)
  const above = Math.max(0, 1 - (high - centre) / ramp)
  return centre + Math.min(0, ends[0] - low) * below + Math.max(0, ends[1] - high) * above
}

/** How far (m) the focus line passes from a Book: 0 when it crosses it. */
export function lineDistance(pose: { y: number, thickness: number }, focusY: number): number {
  return Math.max(0, Math.abs(pose.y - focusY) - pose.thickness / 2)
}

/**
 * Index of the Book the focus line crosses, or the nearest one (-1 for none).
 * The current one keeps the focus until another is nearer by `hysteresis`, so
 * a line resting between two Books doesn't flicker between them.
 */
export function nearestBook(
  poses: readonly { bookId: string, y: number, thickness: number }[],
  focusY: number,
  current: string | null,
  hysteresis = FOCUS_HYSTERESIS,
): number {
  let best = -1
  let bestDistance = Infinity
  let currentIndex = -1
  for (let index = 0; index < poses.length; index++) {
    const distance = lineDistance(poses[index]!, focusY)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
    if (poses[index]!.bookId === current) currentIndex = index
  }
  if (currentIndex >= 0 && lineDistance(poses[currentIndex]!, focusY) - bestDistance < hysteresis) return currentIndex
  return best
}
