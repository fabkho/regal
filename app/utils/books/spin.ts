// Turning a Book taken out (Inspect) with a drag: the maths shared by the
// Stage (books/Meshes.vue) and the row (row/Books.vue). Two ways:
//
// - 'free': a trackball. A drag turns the Book about the picture's axes, left/
//   right about the vertical, up/down about the horizontal (drag down tips its
//   top towards you), each step after the ones before, so it spins freely in
//   every direction; let go while it still turns and it glides on, slowing.
//   Kept as a quaternion: no gimbal lock, no axis order.
// - 'turntable': the Stage's own: left/right turns it about its vertical,
//   up/down tips it, at most TURNTABLE_TIP either way (it stays upright).
//
// The facing (front Cover to the camera) and the turn over (front ↔ back)
// come on top: inspect = facing · spin · turn-over (spinQuaternion).
import { MathUtils, Quaternion, Vector3 } from 'three'

export type SpinMode = 'free' | 'turntable'

/** Rad per px dragged. */
export const SPIN_PER_PX = 0.01
/** The turntable tips the Book at most this far (rad) either way. */
export const TURNTABLE_TIP = 1.3
/** The glide after a release slows with this time constant (ms; free). */
export const GLIDE_DECAY_MS = 260
/** Below this (rad per ms) a glide stops. */
export const GLIDE_STOP = 0.00005
/** At most this fast (rad per ms) a glide starts. */
export const GLIDE_MAX = 0.03

export interface Spin {
  /** Free: the turn so far about the picture's axes. */
  q: Quaternion
  /** Turntable: the turn about the Book's vertical (rad). */
  x: number
  /** Turntable: the tip (rad), within ±TURNTABLE_TIP. */
  y: number
  /** Free: angular speed about the picture's vertical and horizontal axes (rad per ms), for the glide. */
  vx: number
  vy: number
  /** Settling back square (0 → 1, tweened): from where it was (free). */
  settle: number
  from: Quaternion | null
}

export function createSpin(): Spin {
  return { q: new Quaternion(), x: 0, y: 0, vx: 0, vy: 0, settle: 1, from: null }
}

const X_AXIS = new Vector3(1, 0, 0)
const Y_AXIS = new Vector3(0, 1, 0)
const step = new Quaternion()
const axis = new Vector3()

/**
 * Turns the free spin by `ax` rad about the picture's vertical and `ay` rad
 * about its horizontal, as one turn about the axis in between (a trackball:
 * the drag's direction across the screen), applied after the turn so far.
 */
function turn(spin: Spin, ax: number, ay: number) {
  const angle = Math.hypot(ax, ay)
  if (angle < 1e-12) return
  spin.q.premultiply(step.setFromAxisAngle(axis.set(ay / angle, ax / angle, 0), angle)).normalize()
}

/**
 * A drag by `dx`, `dy` px (screen: right and down) over `ms`. `tip`: the drag's
 * vertical part counts (false: a finger on a card whose vertical swipes scroll
 * the page, turntable). A drag takes over from a settle or a glide.
 */
export function dragSpin(spin: Spin, dx: number, dy: number, mode: SpinMode, options: { tip?: boolean, ms?: number } = {}) {
  const tip = options.tip ?? true
  const ax = dx * SPIN_PER_PX
  const ay = tip ? dy * SPIN_PER_PX : 0
  spin.from = null
  spin.settle = 1
  if (mode === 'turntable') {
    spin.x += ax
    spin.y = MathUtils.clamp(spin.y + ay, -TURNTABLE_TIP, TURNTABLE_TIP)
    return
  }
  turn(spin, ax, ay)
  // The speed for the glide, smoothed: one late pointer event shouldn't make or break it.
  const ms = Math.max(1, options.ms ?? 16)
  spin.vx = spin.vx * 0.5 + (ax / ms) * 0.5
  spin.vy = spin.vy * 0.5 + (ay / ms) * 0.5
}

/** A finger or button that rested before letting go: no glide. */
export function stopGlide(spin: Spin) {
  spin.vx = 0
  spin.vy = 0
}

/**
 * The free spin glides on after a release for `ms`, slowing down. Returns
 * whether it still moves.
 */
export function glideSpin(spin: Spin, ms: number, mode: SpinMode): boolean {
  if (mode !== 'free' || (!spin.vx && !spin.vy)) return false
  const speed = Math.hypot(spin.vx, spin.vy)
  if (speed > GLIDE_MAX) {
    spin.vx *= GLIDE_MAX / speed
    spin.vy *= GLIDE_MAX / speed
  }
  // Exact integral of v·e^(−t/τ) over the step, so the glide doesn't depend on the frame rate.
  const decay = Math.exp(-ms / GLIDE_DECAY_MS)
  const travelled = GLIDE_DECAY_MS * (1 - decay)
  turn(spin, spin.vx * travelled, spin.vy * travelled)
  spin.vx *= decay
  spin.vy *= decay
  if (Math.hypot(spin.vx, spin.vy) < GLIDE_STOP) {
    stopGlide(spin)
    return false
  }
  return true
}

/**
 * Starts settling the spin back square (a turn over, the way back to the
 * row): returns what to tween `spin` to (gsap.to(spin, target));
 * spinQuaternion follows.
 */
export function startSettle(spin: Spin): { x: number, y: number, settle: number } {
  stopGlide(spin)
  spin.from = spin.q.clone()
  spin.settle = 0
  return { x: 0, y: 0, settle: 1 }
}

/** Square again at once (a new Book taken out). */
export function resetSpin(spin: Spin) {
  spin.q.identity()
  spin.x = 0
  spin.y = 0
  stopGlide(spin)
  spin.settle = 1
  spin.from = null
}

const identity = new Quaternion()

/** The spin's turn, applied between the facing and the turn over. */
export function spinQuaternion(spin: Spin, mode: SpinMode, into: Quaternion): Quaternion {
  if (mode === 'turntable') {
    // About the picture's horizontal first, then the Book's vertical: as the Stage has always turned.
    return into.setFromAxisAngle(X_AXIS, spin.y).multiply(step.setFromAxisAngle(Y_AXIS, spin.x))
  }
  if (spin.from) {
    spin.q.slerpQuaternions(spin.from, identity, MathUtils.clamp(spin.settle, 0, 1))
    if (spin.settle >= 1) spin.from = null
  }
  return into.copy(spin.q)
}
