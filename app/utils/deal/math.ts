// Small vector, quaternion, easing and random helpers for the deal's plans.
// Plain arrays and numbers, no three.js: the plans are pure and run in node.

export type Vec3 = [number, number, number]
/** x, y, z, w (the order three.js uses). */
export type Quat = [number, number, number, number]

export const IDENTITY: Readonly<Quat> = [0, 0, 0, 1]

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u

// --- Easing (u in 0..1) ---------------------------------------------------------

export type Ease = 'linear' | 'in' | 'out' | 'inOut' | 'outBack' | 'outQuart'

export function ease(kind: Ease, u: number): number {
  const x = clamp(u, 0, 1)
  switch (kind) {
    case 'in': return x * x * x
    case 'out': return 1 - (1 - x) ** 3
    case 'outQuart': return 1 - (1 - x) ** 4
    case 'inOut': return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
    case 'outBack': {
      const c1 = 1.25
      const c3 = c1 + 1
      return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
    }
    default: return x
  }
}

// --- Random ---------------------------------------------------------------------

/** mulberry32: a small seeded generator, 0 ≤ value < 1. */
export function rng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates on a copy. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items]
  for (let index = out.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    const held = out[index]!
    out[index] = out[other]!
    out[other] = held
  }
  return out
}

// --- Quaternions ----------------------------------------------------------------

export function qNormalize(q: Quat): Quat {
  const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1
  q[0] /= length
  q[1] /= length
  q[2] /= length
  q[3] /= length
  return q
}

export function qAxisAngle(axis: Readonly<Vec3>, angle: number): Quat {
  const half = angle / 2
  const sin = Math.sin(half)
  return [axis[0] * sin, axis[1] * sin, axis[2] * sin, Math.cos(half)]
}

/** a * b (b first, then a, as three.js's `a.multiply(b)`), written to `out`. */
export function qMul(a: Readonly<Quat>, b: Readonly<Quat>, out: Quat = [0, 0, 0, 1]): Quat {
  const ax = a[0]
  const ay = a[1]
  const az = a[2]
  const aw = a[3]
  const bx = b[0]
  const by = b[1]
  const bz = b[2]
  const bw = b[3]
  out[0] = aw * bx + ax * bw + ay * bz - az * by
  out[1] = aw * by - ax * bz + ay * bw + az * bx
  out[2] = aw * bz + ax * by - ay * bx + az * bw
  out[3] = aw * bw - ax * bx - ay * by - az * bz
  return out
}

/** Spherical interpolation, the short way round, written to `out` (allocation-free). */
export function qSlerp(a: Readonly<Quat>, b: Readonly<Quat>, u: number, out: Quat): Quat {
  let bx = b[0]
  let by = b[1]
  let bz = b[2]
  let bw = b[3]
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw
  if (cos < 0) {
    cos = -cos
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }
  let wa: number
  let wb: number
  if (cos > 0.9995) {
    wa = 1 - u
    wb = u
  }
  else {
    const angle = Math.acos(cos)
    const sin = Math.sin(angle)
    wa = Math.sin((1 - u) * angle) / sin
    wb = Math.sin(u * angle) / sin
  }
  out[0] = a[0] * wa + bx * wb
  out[1] = a[1] * wa + by * wb
  out[2] = a[2] * wa + bz * wb
  out[3] = a[3] * wa + bw * wb
  const length = Math.hypot(out[0], out[1], out[2], out[3]) || 1
  out[0] /= length
  out[1] /= length
  out[2] /= length
  out[3] /= length
  return out
}

/** Whether two quaternions are the same rotation (q and -q are). */
export function qSame(a: Readonly<Quat>, b: Readonly<Quat>, epsilon = 1e-6): boolean {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])
  return 1 - dot < epsilon
}

const cross = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

/**
 * The orientation of a Book from where two of its local axes point in the
 * world: its front Cover (local +x) and its top (local +y); the Spine (local
 * +z) follows. `top` must not be parallel to `cover`.
 */
export function orient(cover: Readonly<Vec3>, top: Readonly<Vec3>): Quat {
  const x = normalize([...cover])
  const y0 = normalize([...top])
  const z = normalize(cross(x, y0))
  const y = cross(z, x)
  // Rotation matrix with columns x, y, z.
  const m00 = x[0]
  const m10 = x[1]
  const m20 = x[2]
  const m01 = y[0]
  const m11 = y[1]
  const m21 = y[2]
  const m02 = z[0]
  const m12 = z[1]
  const m22 = z[2]
  const trace = m00 + m11 + m22
  let q: Quat
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1)
    q = [(m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s]
  }
  else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22)
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]
  }
  else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22)
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s]
  }
  else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11)
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s]
  }
  return qNormalize(q)
}

/** Rotates `v` by `q`. */
export function qRotate(q: Readonly<Quat>, v: Readonly<Vec3>): Vec3 {
  const [qx, qy, qz, qw] = q
  const [x, y, z] = v
  // t = 2 * cross(q.xyz, v); v' = v + w * t + cross(q.xyz, t)
  const tx = 2 * (qy * z - qz * y)
  const ty = 2 * (qz * x - qx * z)
  const tz = 2 * (qx * y - qy * x)
  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx),
  ]
}

export const AXIS_X: Readonly<Vec3> = [1, 0, 0]
export const AXIS_Y: Readonly<Vec3> = [0, 1, 0]
export const AXIS_Z: Readonly<Vec3> = [0, 0, 1]

// --- A spin that ramps up and slows down -----------------------------------------

/**
 * The distance (0..1) covered by time `u` (0..1) of a spin whose speed ramps
 * up over the first `ramp` of it, then falls off as (1 - u)^power: a quick
 * start, a long natural slowing. Integrated once into a table (closed form
 * isn't needed; it is the same on every call).
 */
export function spinProfile(power: number, ramp: number, steps = 256): (u: number) => number {
  const table = new Float64Array(steps + 1)
  let sum = 0
  let previous = 0
  for (let step = 1; step <= steps; step++) {
    const x = step / steps
    const r = clamp(x / ramp, 0, 1)
    const speed = r * r * (3 - 2 * r) * (1 - x) ** power
    sum += (previous + speed) / 2
    table[step] = sum
    previous = speed
  }
  const total = table[steps]! || 1
  return (u) => {
    const x = clamp(u, 0, 1) * steps
    const index = Math.min(steps - 1, Math.floor(x))
    const part = x - index
    return (table[index]! + (table[index + 1]! - table[index]!) * part) / total
  }
}

/** The fastest the profile goes, as a multiple of its average speed. */
export function spinPeak(power: number, ramp: number, steps = 256): number {
  let sum = 0
  let peak = 0
  for (let step = 1; step <= steps; step++) {
    const x = step / steps
    const r = clamp(x / ramp, 0, 1)
    const speed = r * r * (3 - 2 * r) * (1 - x) ** power
    sum += speed
    peak = Math.max(peak, speed)
  }
  return peak / (sum / steps || 1)
}
