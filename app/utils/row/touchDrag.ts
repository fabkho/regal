// RegalBooksRow's own sideways touch drag. The row scrolls natively for the
// wheel, a trackpad, the keys and the scroll bar; a finger (or pen) moving it
// sideways is handled here instead (RowCard, touch-action pan-y). Why: Chrome
// turns a native touch scroll into a `pointercancel`, which never counts as a
// user activation, so `navigator.vibrate` stays blocked for the scroll ticks
// until the first tap in the document (README: "Haptics"). A drag the page
// handles itself ends in a real `pointerup`, which does count: from the
// first swipe on, the fling after it ticks, as the Stack's does.
//
// It should feel like the native scroll it replaces: the row follows the
// finger 1:1 once it has moved past the touch slop (the slop itself is left
// out, so it doesn't jump), and a fling glides on along the curve Android's
// Scroller uses and Chrome on Android ports (ui/events/android/scroller.cc):
// a spline whose distance and duration grow with the release speed. Pure, so
// it's unit-testable.

/** CSS px a finger moves before the row follows it (Android's touch slop, 8 dp). */
export const ROW_TOUCH_SLOP = 8
/** Slower releases (px/s) don't fling (Android's minimum fling velocity, 50 dp/s). */
export const MIN_FLING_SPEED = 50
/** Faster releases (px/s) fling as fast as this (Android's maximum fling velocity, 8000 dp/s). */
export const MAX_FLING_SPEED = 8000
/** Finger positions this far back (ms) give the speed at release (Android's VelocityTracker horizon). */
export const VELOCITY_HORIZON = 100
/** A finger lifted this long (ms) after its last move was held still: no fling (Android's). */
export const ASSUME_STOPPED = 40

/**
 * Where a drag stands: undecided until the finger leaves the slop, then
 * sideways (the row follows it) or not ours (an up/down swipe the page scrolls).
 */
export type DragAxis = 'pending' | 'x' | 'y'

/** The axis a finger `dx`, `dy` px from where it went down takes; `pending` inside the slop. */
export function dragAxis(dx: number, dy: number, slop = ROW_TOUCH_SLOP): DragAxis {
  if (Math.hypot(dx, dy) <= slop) return 'pending'
  return Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
}

/** How far the row has followed a finger `dx` px from where it went down: the slop left out. */
export function followed(dx: number, slop = ROW_TOUCH_SLOP): number {
  return Math.sign(dx) * Math.max(0, Math.abs(dx) - slop)
}

export interface DragSample {
  /** Event time (ms). */
  t: number
  /** Finger x (CSS px). */
  x: number
}

/** Remembers a finger's recent positions (drops those older than the horizon). */
export function trackDrag(samples: DragSample[], t: number, x: number): void {
  samples.push({ t, x })
  while (samples.length > 2 && t - samples[0]!.t > VELOCITY_HORIZON) samples.shift()
}

/** With fewer than two positions in the horizon (a janky page, no coalesced events), the last two this close (ms) still count. */
export const SPARSE_GAP = 300

/**
 * The finger's speed (px/s, right is positive) when lifted at `now`: a
 * least-squares line through its positions over the last VELOCITY_HORIZON ms
 * (as Android's VelocityTracker), 0 when it rested before lifting. Where
 * positions came sparsely (a slow frame and no getCoalescedEvents, which
 * needs a secure context), the last two within SPARSE_GAP.
 */
export function releaseVelocity(samples: readonly DragSample[], now: number): number {
  const last = samples.at(-1)
  if (!last || now - last.t > ASSUME_STOPPED) return 0
  let recent = samples.filter(sample => last.t - sample.t <= VELOCITY_HORIZON)
  const previous = samples.at(-2)
  if (recent.length < 2 && previous && last.t - previous.t <= SPARSE_GAP) recent = [previous, last]
  if (recent.length < 2 || last.t - recent[0]!.t < 8) return 0
  const meanT = recent.reduce((sum, sample) => sum + sample.t, 0) / recent.length
  const meanX = recent.reduce((sum, sample) => sum + sample.x, 0) / recent.length
  let num = 0
  let den = 0
  for (const sample of recent) {
    num += (sample.t - meanT) * (sample.x - meanX)
    den += (sample.t - meanT) ** 2
  }
  return den > 0 ? num / den * 1000 : 0
}

// --- The fling: Android's Scroller spline -------------------------------------------

const INFLEXION = 0.35
const START_TENSION = 0.5
const END_TENSION = 1
const P1 = START_TENSION * INFLEXION
const P2 = 1 - END_TENSION * (1 - INFLEXION)
const DECELERATION_RATE = Math.log(0.78) / Math.log(0.9)
/** ViewConfiguration.getScrollFriction(). */
const FRICTION = 0.015
/** g × inches per metre × px per inch (160: CSS px are DIPs) × 0.84, as Chrome's port. */
const PHYSICAL_COEFF = 9.80665 * 39.37 * 160 * 0.84
const SAMPLES = 100

/** The spline's distance (0..1) at SAMPLES + 1 even steps of time (Scroller's SPLINE_POSITION). */
const SPLINE: readonly number[] = (() => {
  const table: number[] = []
  let xMin = 0
  for (let i = 0; i < SAMPLES; i++) {
    const alpha = i / SAMPLES
    let xMax = 1
    for (;;) {
      const x = xMin + (xMax - xMin) / 2
      const coef = 3 * x * (1 - x)
      const tx = coef * ((1 - x) * P1 + x * P2) + x * x * x
      if (Math.abs(tx - alpha) < 1e-5) {
        table.push(coef * ((1 - x) * START_TENSION + x) + x * x * x)
        break
      }
      if (tx > alpha) xMax = x
      else xMin = x
    }
  }
  table.push(1)
  return table
})()

export interface Fling {
  /** The scroll's speed at the start (px/s; positive scrolls towards the end). */
  velocity: number
  /** How far it goes in all (px, signed like `velocity`). */
  distance: number
  /** How long it takes (ms). */
  duration: number
}

/** A fling starting at `velocity` (px/s, capped at MAX_FLING_SPEED); none (null) below MIN_FLING_SPEED. */
export function startFling(velocity: number): Fling | null {
  const speed = Math.min(MAX_FLING_SPEED, Math.abs(velocity))
  if (speed < MIN_FLING_SPEED) return null
  const l = Math.log(INFLEXION * speed / (FRICTION * PHYSICAL_COEFF))
  const duration = 1000 * Math.exp(l / (DECELERATION_RATE - 1))
  const distance = FRICTION * PHYSICAL_COEFF * Math.exp(DECELERATION_RATE / (DECELERATION_RATE - 1) * l)
  return { velocity: Math.sign(velocity) * speed, distance: Math.sign(velocity) * distance, duration }
}

/** Where a fling has got `elapsed` ms in (px from its start, signed), and its speed then (px/s). */
export function flingAt(fling: Fling, elapsed: number): { offset: number, velocity: number, done: boolean } {
  if (elapsed >= fling.duration) return { offset: fling.distance, velocity: 0, done: true }
  const t = Math.max(0, elapsed) / fling.duration
  const index = Math.floor(SAMPLES * t)
  const tInf = index / SAMPLES
  const dInf = SPLINE[index]!
  const dSup = SPLINE[index + 1]!
  const slope = (dSup - dInf) * SAMPLES
  return {
    offset: (dInf + (t - tInf) * slope) * fling.distance,
    velocity: slope * fling.distance / fling.duration * 1000,
    done: false,
  }
}

/**
 * A new fling's start speed (px/s) when the finger flicks again while the
 * last one still glides (`gliding`, its current speed): in the same direction
 * they add up (Chrome's fling boosting), otherwise the new one alone.
 */
export function boostFling(velocity: number, gliding: number): number {
  return Math.sign(velocity) === Math.sign(gliding) && gliding !== 0 ? velocity + gliding : velocity
}
