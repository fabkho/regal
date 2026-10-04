// Touch scrolling in the Stack: how far the pile moves under a finger, and
// how a flick glides on. The first touch feel moved the pile twice as far as
// the finger and carried a flick on at its full speed, so on a phone the pile
// raced past and the riffle (utils/stack/scrollHighlight.ts) never showed.
// Three feels to compare on a phone (?touch=a|b|c, dev only); the wheel and
// the mouse keep theirs. Pure, so it's unit-testable; Scene.vue applies it.

export type TouchFeelName = 'a' | 'b' | 'c'

export interface TouchFeel {
  /** Pile travel per finger travel: 1 keeps the Book under the finger under it. */
  gain: number
  /** While the finger is down the view sits where the finger puts it, instead of easing after it. */
  direct: boolean
  /** A glide slows as e^(-t/τ): τ in seconds; it covers its start speed × τ. */
  glideTau: number
  /** Fastest glide (m/s), so the riffle can keep up. */
  maxSpeed: number
  /** The glide comes to rest with a Book centred on the focus line. */
  snap: boolean
}

export const TOUCH_FEELS: Readonly<Record<TouchFeelName, Readonly<TouchFeel>>> = Object.freeze({
  // a: the pile sticks to the finger; a flick glides on gently.
  a: Object.freeze({ gain: 1, direct: true, glideTau: 0.35, maxSpeed: 1.2, snap: false }),
  // b: slower than the finger, eased; a short, damped glide with a low speed cap.
  b: Object.freeze({ gain: 0.6, direct: false, glideTau: 0.25, maxSpeed: 0.5, snap: false }),
  // c: sticks to the finger; a flick riffles through at a readable speed and
  // lands on a Book, its label beside it, like leafing to a page.
  c: Object.freeze({ gain: 1, direct: true, glideTau: 0.4, maxSpeed: 0.7, snap: true }),
})

/** The feel for a `?touch=` value; null keeps the first one. */
export function touchFeel(value: unknown): Readonly<TouchFeel> | null {
  return typeof value === 'string' && value in TOUCH_FEELS ? TOUCH_FEELS[value as TouchFeelName] : null
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
  /** Where a snapping glide comes to rest (m), or null. */
  rest: number | null
}

export function clampSpeed(speed: number, max: number): number {
  return Math.max(-max, Math.min(max, speed))
}

/**
 * The glide a release starts. `from`: where the view is (m); `speed`: the
 * pile's speed at release (m/s); `bounds`: the view's range; `snapTo`: maps a
 * resting view to the nearest view with a Book centred (snapping feels only).
 */
export function startGlide(
  feel: Readonly<TouchFeel>,
  from: number,
  speed: number,
  bounds: readonly [number, number],
  snapTo?: (view: number) => number,
): Glide {
  const capped = clampSpeed(speed, feel.maxSpeed)
  if (!feel.snap || !snapTo) return { speed: Math.abs(capped) < STOP_SPEED ? 0 : capped, rest: null }
  const free = Math.min(bounds[1], Math.max(bounds[0], from + capped * feel.glideTau))
  const rest = Math.min(bounds[1], Math.max(bounds[0], snapTo(free)))
  // The speed that comes to rest exactly there.
  return { speed: (rest - from) / feel.glideTau, rest }
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

// --- Snapping -------------------------------------------------------------------

/**
 * The view (m) whose focus line is nearest a Book centre, for a view resting
 * at `view`. `focusOf` maps a view to its focus line (rising, continuous);
 * `centres` are the Books' centre heights, in any order.
 */
export function snapView(view: number, centres: readonly number[], focusOf: (view: number) => number, bounds: readonly [number, number]): number {
  if (centres.length === 0) return view
  const focus = focusOf(view)
  let nearest = centres[0]!
  for (const centre of centres) {
    if (Math.abs(centre - focus) < Math.abs(nearest - focus)) nearest = centre
  }
  return viewFor(nearest, focusOf, bounds)
}

/** The view (m) whose focus line is at `focus`, by bisection within `bounds` (the nearest end beyond them). */
export function viewFor(focus: number, focusOf: (view: number) => number, bounds: readonly [number, number]): number {
  let [low, high] = bounds
  if (focus <= focusOf(low)) return low
  if (focus >= focusOf(high)) return high
  for (let step = 0; step < 40; step++) {
    const middle = (low + high) / 2
    if (focusOf(middle) < focus) low = middle
    else high = middle
  }
  return (low + high) / 2
}
