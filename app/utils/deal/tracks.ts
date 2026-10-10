// Tracks of the deal: a Book's pose as a function of time, built from
// segments (a tween between two poses, or any closed-form function of the
// segment's own 0..1). Pure; sampling writes into a pose you pass in, so the
// frame loop allocates nothing.
import { clamp, ease, lerp, qMul, qSlerp } from './math'
import type { Ease, Quat, Vec3 } from './math'

/** What a Book is doing at one moment. `thickness` multiplies the Spine's thickness (a deck of flat cards). */
export interface DealPose {
  position: Vec3
  /** x, y, z, w. */
  quaternion: Quat
  /** Uniform, on the Book's real size. */
  scale: number
  thickness: number
  opacity: number
}

export const makePose = (): DealPose => ({ position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: 1, thickness: 1, opacity: 1 })

export function copyPose(from: Readonly<DealPose>, to: DealPose = makePose()): DealPose {
  to.position[0] = from.position[0]
  to.position[1] = from.position[1]
  to.position[2] = from.position[2]
  to.quaternion[0] = from.quaternion[0]
  to.quaternion[1] = from.quaternion[1]
  to.quaternion[2] = from.quaternion[2]
  to.quaternion[3] = from.quaternion[3]
  to.scale = from.scale
  to.thickness = from.thickness
  to.opacity = from.opacity
  return to
}

export function poseOf(position: Readonly<Vec3>, quaternion: Readonly<Quat>, extra: Partial<Pick<DealPose, 'scale' | 'thickness' | 'opacity'>> = {}): DealPose {
  return {
    position: [position[0], position[1], position[2]],
    quaternion: [quaternion[0], quaternion[1], quaternion[2], quaternion[3]],
    scale: extra.scale ?? 1,
    thickness: extra.thickness ?? 1,
    opacity: extra.opacity ?? 1,
  }
}

/** `u` runs 0..1 over [t0, t1] (ms). */
export interface Segment<T = DealPose> {
  t0: number
  t1: number
  fn: (u: number, out: T) => void
}

export type Track = Segment[]

/** The segment in force at `t`: the last one that has started. */
export function segmentAt<T>(track: readonly Segment<T>[], t: number): { segment: Segment<T>, u: number } | null {
  if (!track.length) return null
  let index = 0
  for (let at = track.length - 1; at >= 0; at--) {
    if (track[at]!.t0 <= t) {
      index = at
      break
    }
  }
  const segment = track[index]!
  const span = segment.t1 - segment.t0
  return { segment, u: span > 0 ? clamp((t - segment.t0) / span, 0, 1) : 1 }
}

export function sampleTrack(track: readonly Segment[], t: number, out: DealPose): DealPose {
  const found = segmentAt(track, t)
  if (found) found.segment.fn(found.u, out)
  return out
}

export interface TweenOptions {
  ease?: Ease
  /** Extra offset that peaks half way (a card's arc through the air). */
  arc?: Readonly<Vec3>
  /** An extra turn about a world axis that swells and fades (a card's wobble). */
  wobble?: { axis: Readonly<Vec3>, angle: number }
}

const wobbleQuat: Quat = [0, 0, 0, 1]

/** A tween from one pose to another (both copied). */
export function tween(from: Readonly<DealPose>, to: Readonly<DealPose>, t0: number, t1: number, options: TweenOptions = {}): Segment {
  const a = copyPose(from)
  const b = copyPose(to)
  const kind = options.ease ?? 'inOut'
  const arc = options.arc
  const wobble = options.wobble
  return {
    t0,
    t1,
    fn(u, out) {
      const e = ease(kind, u)
      const lift = arc ? Math.sin(Math.PI * clamp(e, 0, 1)) : 0
      out.position[0] = lerp(a.position[0], b.position[0], e) + (arc ? arc[0] * lift : 0)
      out.position[1] = lerp(a.position[1], b.position[1], e) + (arc ? arc[1] * lift : 0)
      out.position[2] = lerp(a.position[2], b.position[2], e) + (arc ? arc[2] * lift : 0)
      qSlerp(a.quaternion, b.quaternion, clamp(e, 0, 1), out.quaternion)
      if (wobble) {
        const half = wobble.angle * Math.sin(Math.PI * clamp(e, 0, 1)) / 2
        const sin = Math.sin(half)
        wobbleQuat[0] = wobble.axis[0] * sin
        wobbleQuat[1] = wobble.axis[1] * sin
        wobbleQuat[2] = wobble.axis[2] * sin
        wobbleQuat[3] = Math.cos(half)
        qMul(wobbleQuat, out.quaternion, out.quaternion)
      }
      out.scale = lerp(a.scale, b.scale, e)
      out.thickness = lerp(a.thickness, b.thickness, e)
      out.opacity = clamp(lerp(a.opacity, b.opacity, e), 0, 1)
    },
  }
}

/** Builds one Book's track from where it is: each step starts where the last ended. */
export class TrackBuilder {
  readonly segments: Track = []
  private pose: DealPose
  private time = 0

  constructor(start: Readonly<DealPose>) {
    this.pose = copyPose(start)
  }

  /** The pose at the end of what is built so far (a copy). */
  current(): DealPose {
    return copyPose(this.pose)
  }

  get end(): number {
    return this.time
  }

  /** Stays put until `t`. */
  hold(t: number): this {
    if (t > this.time) {
      const pose = copyPose(this.pose)
      this.segments.push({ t0: this.time, t1: t, fn: (_u, out) => void copyPose(pose, out) })
      this.time = t
    }
    return this
  }

  /** Moves to `pose` over [t0, t1] (holding until t0 first; never starts before the last step ended). */
  to(pose: Readonly<DealPose>, t0: number, t1: number, options: TweenOptions = {}): this {
    this.hold(t0)
    const start = this.time
    const end = Math.max(t1, start)
    this.segments.push(tween(this.pose, pose, start, end, options))
    this.pose = copyPose(pose)
    this.time = end
    return this
  }

  /** A closed-form step ending at `end` (its own `u` is 0..1 over [t0, t1]). */
  custom(t0: number, t1: number, fn: Segment['fn'], end: Readonly<DealPose>): this {
    this.hold(t0)
    const start = this.time
    this.segments.push({ t0: start, t1: Math.max(t1, start), fn })
    this.pose = copyPose(end)
    this.time = Math.max(t1, start)
    return this
  }
}
