// Scroll highlight: the Stack's answer to hover for scrolling and touch. A
// fixed focus line runs through the middle of the view; Books near it come out
// of the pile and catch the light the way a hovered Book does. Three variants
// (open choice, see the dev panel):
// - 'focus': the Book on the line comes out like a hovered one; scrolling on
//   hands over to the next;
// - 'wave': scrolling sends a ripple through the pile, Books near the line come
//   out as far as the scroll is fast and settle back when it stops;
// - 'riffle': Books passing the line fan out like pages flipped through, the
//   centred one most.
// Pure, so it's unit-testable; Scene.vue publishes the scroll, the Book meshes
// apply the lift (composables/useScrollHighlight.ts).
import type { InjectionKey } from 'vue'

export type ScrollHighlight = 'focus' | 'wave' | 'riffle'

export const SCROLL_HIGHLIGHTS: readonly { value: ScrollHighlight, title: string, text: string }[] = [
  { value: 'focus', title: 'Focus line', text: 'The Book in the middle of the view comes out and catches the light like on hover, its title and stars beside it. Scrolling hands over to the next one.' },
  { value: 'wave', title: 'Wave', text: 'Scrolling sends a ripple through the pile: Books near the middle come out as far as you scroll fast and settle back when you stop. The middle one keeps a little lift and its label.' },
  { value: 'riffle', title: 'Riffle', text: 'Books passing the middle fan out like pages flipped through, the centred one most, with its label beside it.' },
]

/** The scroll as the Stack scene publishes it each frame (one shared object, no allocation). */
export interface StackScroll {
  /** Height (m) of the focus line where it crosses the Spines: the vertical centre of the view. */
  focusY: number
  /** How fast the view moves (m/s, up is positive). */
  speed: number
}

export const STACK_SCROLL: InjectionKey<StackScroll> = Symbol('regal:stack-scroll')

/** What a highlighted Book does, written in place each frame. */
export interface Lift {
  /** Towards the viewer (m). */
  out: number
  /** To the right (m), as if drawn out of the pile by its end. */
  slide: number
  /** Top tilting out (rad), as on hover. */
  tilt: number
  /** Turned about the vertical through its left end (rad): the right end swings out. */
  yaw: number
  /** Gloss, 0..1 (same scale as hover). */
  shine: number
}

/** 'focus' moves like a hovered Book (Meshes.vue HOVER_OUT / HOVER_TILT). */
export const FOCUS = { out: 0.035, slide: 0, tilt: 0.045 } as const

export const WAVE = {
  /** Books this far from the line (m) still ride the wave. */
  radius: 0.1,
  out: 0.04,
  slide: 0.035,
  tilt: 0.06,
  /** Scroll speed (m/s) at which the wave is at full height. */
  fullSpeed: 0.45,
  /** The crest trails the line by this much time of travel (s). */
  lag: 0.12,
  /** What the Book on the line keeps once the scroll has stopped. */
  rest: 0.3,
} as const

export const RIFFLE = {
  radius: 0.08,
  out: 0.02,
  slide: 0,
  tilt: 0.02,
  /** The centred Book turns this far (rad), showing its page edges. */
  yaw: 0.3,
} as const

/** A newly nearest Book takes the focus only when nearer than the current one by this much (m). */
export const FOCUS_HYSTERESIS = 0.002

/** Raised cosine: 1 on the line, 0 from `radius` on. */
export function bell(distance: number, radius: number): number {
  const u = Math.abs(distance) / radius
  if (u >= 1) return 0
  return 0.5 + 0.5 * Math.cos(Math.PI * u)
}

/** How high the wave runs at a scroll speed: 0 at rest, 1 from `WAVE.fullSpeed` on, eased in between. */
export function waveLevel(speed: number): number {
  const t = Math.min(1, Math.abs(speed) / WAVE.fullSpeed)
  return t * t * (3 - 2 * t)
}

/**
 * How far out (0..1) a Book wants to be, `distance` metres above (positive) or
 * below the focus line; `focused` is the one on the line.
 */
export function targetAmount(variant: ScrollHighlight, distance: number, focused: boolean, level: number, speed: number): number {
  if (variant === 'focus') return focused ? 1 : 0
  if (variant === 'riffle') return bell(distance, RIFFLE.radius)
  // The crest trails the line: moving up, it runs a little below it.
  const wave = bell(distance + speed * WAVE.lag, WAVE.radius) * level
  return Math.max(focused ? WAVE.rest : 0, wave)
}

/** Easing rate (1/s) towards the target: the wave rises fast and settles slowly. */
export function easeRate(variant: ScrollHighlight, rising: boolean): number {
  if (variant === 'wave') return rising ? 16 : 3.5
  return 12
}

/** One frame of exponential easing; snaps when close so a resting Book costs nothing. */
export function approach(current: number, target: number, rate: number, delta: number): number {
  const next = current + (target - current) * (1 - Math.exp(-rate * delta))
  return Math.abs(next - target) < 0.001 ? target : next
}

/** The lift for an amount (0..1). Reduced motion keeps the shine only. Writes into `into`. */
export function liftFor(variant: ScrollHighlight, amount: number, reduced: boolean, into: Lift): Lift {
  const shape = variant === 'wave' ? WAVE : variant === 'riffle' ? RIFFLE : FOCUS
  into.shine = amount
  into.out = reduced ? 0 : shape.out * amount
  into.slide = reduced ? 0 : shape.slide * amount
  into.tilt = reduced ? 0 : shape.tilt * amount
  into.yaw = reduced || variant !== 'riffle' ? 0 : RIFFLE.yaw * amount
  return into
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
