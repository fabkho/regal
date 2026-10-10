// The deal's plan (RegalBooksDeal): the host has decided the winner; this
// works out, for every Book, where it is at any moment of a 3–5 s shuffle that
// ends with the winner standing face to the camera. Pure and deterministic:
// `(books, winner, variant, duration, seed)` in, tracks out, no three.js, no
// DOM. The seed only varies the look (riffle order, wobble), never the winner.
//
// One start (the covers come in as a fan), one end (the winner square to the
// camera), three middles: deck.ts, stack.ts, wheel.ts.
import { clamp, rng } from './math'
import type { Vec3 } from './math'
import { copyPose, makePose, sampleTrack, segmentAt, tween } from './tracks'
import type { DealPose } from './tracks'
import type { DealCamera, DealPlan, DealPlanInput, DealTimeline, VariantContext, VariantPlan } from './types'
import {
  copyCamera, DEAL_DISTANCE, DEAL_FOV, END_CAMERA, endPose, fanPoses, FADE_MS, HOLD_MS, INTRO_END, introBuilders, lerpCamera, PRESENT_MAX, PRESENT_MIN, PRESENT_SHARE, SHUFFLE_START, START_CAMERA, stageFor,
} from './layout'
import { planDeck } from './deck'
import { planStack } from './stack'
import { planWheel } from './wheel'

export type { DealCamera, DealDims, DealPlan, DealPlanInput, DealVariantName } from './types'
export type { DealPose } from './tracks'
export { DEAL_DISTANCE, DEAL_FOV } from './layout'

export const DEFAULT_DURATION = 4000
const MIN_DURATION = 900
const MAX_DURATION = 12000

export function planDeal(input: DealPlanInput): DealPlan {
  const count = input.books.length
  if (count < 1) throw new RangeError('planDeal: needs at least one Book')
  if (!Number.isInteger(input.winner) || input.winner < 0 || input.winner >= count) throw new RangeError(`planDeal: winner ${input.winner} is not one of ${count} Books`)

  const seed = input.seed ?? 1
  const random = rng(seed)
  const stage = stageFor(input.aspect ?? 1.6)
  const dims = input.books
  const winner = input.winner
  const duration = clamp(input.duration ?? DEFAULT_DURATION, MIN_DURATION, MAX_DURATION)
  const end = endPose(dims[winner]!, stage)

  const base = { variant: input.variant, count, winner, duration, seed, stage, dims, end, endCamera: { ...END_CAMERA } }

  // Reduced motion: no shuffle, the winner fades in where it ends up.
  if (input.reducedMotion) {
    const total = FADE_MS + HOLD_MS
    const timeline: DealTimeline = { introEnd: FADE_MS, shuffleStart: 0, presentStart: 0, presentEnd: FADE_MS, total }
    const from = copyPose(end)
    from.opacity = 0
    const gone = copyPose(end)
    gone.opacity = 0
    gone.scale = 0.001
    return {
      ...base,
      reducedMotion: true,
      timeline,
      total,
      tracks: dims.map((_, index) => [index === winner ? tween(from, end, 0, FADE_MS, { ease: 'out' }) : tween(gone, gone, 0, FADE_MS, { ease: 'linear' })]),
      camera: [{ t0: 0, t1: total, fn: (_u, out) => copyCamera(END_CAMERA, out) }],
      floor: null,
      pointer: null,
      info: {},
    }
  }

  const fan = fanPoses(dims, stage, random)
  const builders = introBuilders(fan)

  // One Book: just presented.
  if (count === 1) {
    const presentStart = SHUFFLE_START + 160
    const presentEnd = presentStart + PRESENT_MIN
    const timeline: DealTimeline = { introEnd: INTRO_END, shuffleStart: SHUFFLE_START, presentStart, presentEnd, total: presentEnd + HOLD_MS }
    builders[0]!.to(end, presentStart, presentEnd, { ease: 'inOut' })
    builders[0]!.hold(timeline.total)
    const tilt = START_CAMERA
    return {
      ...base,
      reducedMotion: false,
      timeline,
      total: timeline.total,
      tracks: builders.map(builder => builder.segments),
      camera: [
        { t0: 0, t1: presentStart, fn: (_u, out) => copyCamera(tilt, out) },
        { t0: presentStart, t1: presentEnd, fn: (u, out) => lerpCamera(tilt, END_CAMERA, u * u * (3 - 2 * u), out) },
      ],
      floor: null,
      pointer: null,
      info: {},
    }
  }

  const presentEnd = SHUFFLE_START + duration
  const present = Math.min(clamp(PRESENT_SHARE * duration, PRESENT_MIN, PRESENT_MAX), 0.45 * duration)
  const timeline: DealTimeline = {
    introEnd: INTRO_END,
    shuffleStart: SHUFFLE_START,
    presentStart: presentEnd - present,
    presentEnd,
    total: presentEnd + HOLD_MS,
  }
  const context: VariantContext = { dims, winner, stage, random, end, timeline, builders, startCamera: { ...START_CAMERA } }
  const variant: VariantPlan = input.variant === 'stack' ? planStack(context) : input.variant === 'wheel' ? planWheel(context) : planDeck(context)
  return {
    ...base,
    reducedMotion: false,
    timeline,
    total: timeline.total,
    tracks: builders.map(builder => builder.segments),
    camera: variant.camera,
    floor: variant.floor ?? null,
    pointer: variant.pointer ?? null,
    info: variant.info,
  }
}

/** A Book at `t` ms: written to `out` (a fresh pose when none is given; pass one in a frame loop). */
export function sampleDeal(plan: DealPlan, book: number, t: number, out: DealPose = makePose()): DealPose {
  const track = plan.tracks[book]
  if (!track) throw new RangeError(`sampleDeal: no Book ${book}`)
  return sampleTrack(track, t, out)
}

/** The camera at `t` ms. */
export function sampleCamera(plan: DealPlan, t: number, out: DealCamera = { tilt: 0, targetY: 0, targetZ: 0, distance: DEAL_DISTANCE }): DealCamera {
  const found = segmentAt(plan.camera, t)
  if (found) found.segment.fn(found.u, out)
  return out
}

// --- Where things are on screen ------------------------------------------------------

/** The camera's eye and the point it looks at. */
export function cameraFrame(camera: Readonly<DealCamera>): { eye: Vec3, target: Vec3 } {
  return {
    eye: [0, camera.targetY + camera.distance * Math.sin(camera.tilt), camera.targetZ + camera.distance * Math.cos(camera.tilt)],
    target: [0, camera.targetY, camera.targetZ],
  }
}

/** A world point in the stage's pixels (y down), seen by `camera` in a stage `width` × `height`. */
export function projectToStage(camera: Readonly<DealCamera>, point: Readonly<Vec3>, width: number, height: number): { x: number, y: number } {
  const sin = Math.sin(camera.tilt)
  const cos = Math.cos(camera.tilt)
  const { eye } = cameraFrame(camera)
  const vx = point[0] - eye[0]
  const vy = point[1] - eye[1]
  const vz = point[2] - eye[2]
  // The camera looks along (0, -sin, -cos) with up (0, cos, -sin) and right (1, 0, 0).
  const depth = -(vy * sin + vz * cos)
  const up = vy * cos - vz * sin
  const tan = Math.tan((DEAL_FOV * Math.PI) / 360)
  const ndcX = vx / (depth * tan * (width / height))
  const ndcY = up / (depth * tan)
  return { x: (ndcX * 0.5 + 0.5) * width, y: (0.5 - ndcY * 0.5) * height }
}

export interface StageRect { left: number, top: number, width: number, height: number }

/**
 * The winner's front cover face in the stage's pixels (relative to the stage's
 * top left) at `t` ms (default: the end): the bounding box of its four corners.
 */
export function winnerRect(plan: DealPlan, size: { width: number, height: number }, t: number = plan.total): StageRect {
  const pose = sampleDeal(plan, plan.winner, t)
  const camera = sampleCamera(plan, t)
  const dims = plan.dims[plan.winner]!
  const sx = dims.thickness * pose.thickness * pose.scale
  const sy = dims.height * pose.scale
  const sz = dims.depth * pose.scale
  const [qx, qy, qz, qw] = pose.quaternion
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const cy of [-0.5, 0.5]) {
    for (const cz of [-0.5, 0.5]) {
      // The front cover is the +x face of the unit box.
      const x = 0.5 * sx
      const y = cy * sy
      const z = cz * sz
      const tx = 2 * (qy * z - qz * y)
      const ty = 2 * (qz * x - qx * z)
      const tz = 2 * (qx * y - qy * x)
      const world: Vec3 = [
        pose.position[0] + x + qw * tx + (qy * tz - qz * ty),
        pose.position[1] + y + qw * ty + (qz * tx - qx * tz),
        pose.position[2] + z + qw * tz + (qx * ty - qy * tx),
      ]
      const point = projectToStage(camera, world, size.width, size.height)
      left = Math.min(left, point.x)
      right = Math.max(right, point.x)
      top = Math.min(top, point.y)
      bottom = Math.max(bottom, point.y)
    }
  }
  return { left, top, width: right - left, height: bottom - top }
}
