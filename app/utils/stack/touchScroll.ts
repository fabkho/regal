// Touch scrolling in the Stack: how far the pile moves under a finger, and
// how a flick glides on. The wheel, a mouse drag and the keys keep their own
// (Scene.vue's WHEEL_SPEED, DRAG_SPEED, KEY_STEP); this is fingers (and pens).
//
// The first touch feel moved the pile 2.2 mm per finger pixel (about 1.3× the
// finger on a phone), eased after it, and carried a flick on for 0.3 s at its
// full release speed, uncapped: on a phone the pile raced past and the riffle
// (utils/stack/scrollHighlight.ts) never showed. The owner compared four
// coherent feels on a Pixel 8 Pro, from 1:1 with a long glide down to half
// the finger with almost none, and chose the third. Its numbers are below;
// with them a slow drag moves the pile about two thirds of the finger and a
// hard flick carries a handful of Books, slowly enough to riffle.
// Pure, so it's unit-testable; Scene.vue applies it.

export interface TouchFeel {
  /** Pile travel per finger travel: 1 keeps the Book under the finger under it. */
  gain: number
  /** While the finger is down the view sits where the finger puts it, instead of easing after it. */
  direct: boolean
  /** A glide slows as e^(-t/τ): τ in seconds; it covers its start speed × τ. */
  glideTau: number
  /** Fastest glide (m/s); with τ it bounds how far a flick carries (maxSpeed × τ). */
  maxSpeed: number
}

/** Pile travel per finger travel: two thirds of the finger, so the riffle reads while dragging. */
export const TOUCH_GAIN = 0.65
/** The pile follows the finger directly: slowed by the gain, it needs no easing to feel calm. */
export const TOUCH_DIRECT = true
/** How quickly a flick slows down (τ, s): short, most of a glide (86 %) is over within half a second. */
export const GLIDE_TAU = 0.25
/** The fastest a flick glides (m/s): the riffle keeps up, and a flick carries at most 0.14 m (~4–5 Books). */
export const GLIDE_MAX_SPEED = 0.55

/** The touch feel (owner's choice on a Pixel 8 Pro; see the comment at the top). */
export const TOUCH_FEEL: Readonly<TouchFeel> = Object.freeze({
  gain: TOUCH_GAIN,
  direct: TOUCH_DIRECT,
  glideTau: GLIDE_TAU,
  maxSpeed: GLIDE_MAX_SPEED,
})

/** The farthest a flick carries the pile after the finger lets go (m): the capped speed × τ. */
export function longestGlide(feel: Readonly<TouchFeel>): number {
  return feel.maxSpeed * feel.glideTau
}

// --- Tuning (dev server only) -------------------------------------------------

/** What the tuning parameters may be set to: past these a feel stops being a feel. */
export const TOUCH_LIMITS = {
  gain: [0.2, 2],
  glide: [0.05, 1.5],
  cap: [0.1, 3],
} as const

function number(value: unknown, [low, high]: readonly [number, number]): number | null {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? Math.min(high, Math.max(low, parsed)) : null
}

/**
 * TOUCH_FEEL with single parameters tuned from a route query, to try a
 * change on a phone before it goes into the constants: `gain`, `glide` (τ,
 * s), `cap` (m/s) and `follow=direct|eased`, clamped to TOUCH_LIMITS. Scene.vue
 * only calls it on the dev server; production builds leave it out.
 */
export function tunedFeel(query: Readonly<Record<string, unknown>>): Readonly<TouchFeel> {
  const gain = number(query.gain, TOUCH_LIMITS.gain)
  const glide = number(query.glide, TOUCH_LIMITS.glide)
  const cap = number(query.cap, TOUCH_LIMITS.cap)
  const follow = query.follow === 'direct' || query.follow === 'eased' ? query.follow : null
  if (gain === null && glide === null && cap === null && follow === null) return TOUCH_FEEL
  return {
    gain: gain ?? TOUCH_FEEL.gain,
    glideTau: glide ?? TOUCH_FEEL.glideTau,
    maxSpeed: cap ?? TOUCH_FEEL.maxSpeed,
    direct: follow ? follow === 'direct' : TOUCH_FEEL.direct,
  }
}

// --- Release speed ---------------------------------------------------------------

/** Finger positions this far back (ms) give the speed at release. */
export const VELOCITY_WINDOW = 100
/** A finger lifted longer than this (ms) after its last move was held still: no glide. */
export const HOLD_STILL = 80

export interface TouchSample {
  /** Event time (ms). */
  t: number
  /** Finger position (CSS px, down is positive). */
  y: number
}

/** Remembers a finger's recent positions (drops those older than the window). */
export function trackTouch(samples: TouchSample[], t: number, y: number): void {
  samples.push({ t, y })
  while (samples.length > 2 && t - samples[0]!.t > VELOCITY_WINDOW) samples.shift()
}

/**
 * The finger's speed (px/s, down is positive) when lifted at `now`: its
 * average over the last VELOCITY_WINDOW ms, 0 when it rested before lifting.
 */
export function releaseSpeed(samples: readonly TouchSample[], now: number): number {
  const last = samples.at(-1)
  if (!last || now - last.t > HOLD_STILL) return 0
  const first = samples.find(sample => last.t - sample.t <= VELOCITY_WINDOW) ?? last
  const elapsed = last.t - first.t
  if (elapsed < 8) return 0
  return (last.y - first.y) / elapsed * 1000
}

// --- Glide -------------------------------------------------------------------------

/** A glide slower than this (m/s) has stopped. */
export const STOP_SPEED = 0.003

export interface Glide {
  /** Speed (m/s, up is positive). */
  speed: number
}

export function clampSpeed(speed: number, max: number): number {
  return Math.max(-max, Math.min(max, speed))
}

/** The glide a release starts: the pile's speed at release (m/s), capped; none when it barely moved. */
export function startGlide(feel: Readonly<TouchFeel>, speed: number): Glide {
  const capped = clampSpeed(speed, feel.maxSpeed)
  return { speed: Math.abs(capped) < STOP_SPEED ? 0 : capped }
}

/**
 * One frame (`seconds`) of a glide: how far the view moves (m). Updates the
 * glide's speed in place; it reaches 0 once the glide has stopped.
 */
export function glideStep(glide: Glide, tau: number, seconds: number): number {
  if (glide.speed === 0) return 0
  const decay = Math.exp(-seconds / tau)
  const distance = glide.speed * tau * (1 - decay)
  glide.speed *= decay
  if (Math.abs(glide.speed) < STOP_SPEED) glide.speed = 0
  return distance
}
