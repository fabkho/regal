// What the three variants share (utils/deal/plan.ts): the stage's world
// measures, the start (the covers laid out like a hand of cards, coming in)
// and the end (the winner upright, its front cover square to the camera).
import { AXIS_Z, clamp, orient, qAxisAngle, qMul } from './math'
import type { Quat } from './math'
import { makePose, poseOf, TrackBuilder } from './tracks'
import type { DealPose } from './tracks'
import type { DealCamera, DealDims, DealStage } from './types'

/** Vertical field of view of the deal's camera, degrees. */
export const DEAL_FOV = 30
/** What the camera sees of the world, top to bottom, at its target (metres). */
export const DEAL_VIEW_HEIGHT = 0.5
export const DEAL_DISTANCE = DEAL_VIEW_HEIGHT / (2 * Math.tan((DEAL_FOV * Math.PI) / 360))

/** The covers have come in. */
export const INTRO_END = 420
/** Where the variant's middle begins (a beat after the intro). */
export const SHUFFLE_START = 450
/** The end held still before `picked`. */
export const HOLD_MS = 300
/** The winner's way to its end pose, as a share of the shuffle part and its bounds (ms). */
export const PRESENT_SHARE = 0.2
export const PRESENT_MIN = 650
export const PRESENT_MAX = 900
/** The reduced-motion plan: the winner's fade. */
export const FADE_MS = 200

/** The winner's front cover fills this much of the stage's height ... */
export const END_FILL = 0.55
/** ... and at most this much of its width. */
export const END_WIDTH_FILL = 0.82
/** Its centre sits this much of the stage's height above the middle. */
export const END_LIFT = 0.07

/** The Book upright, its front cover facing the camera (+z), its top up; the Spine to the left. */
export const FRONT: Readonly<Quat> = orient([0, 0, 1], [0, 1, 0])

export function stageFor(aspect: number): DealStage {
  const safe = Number.isFinite(aspect) && aspect > 0.2 ? Math.min(aspect, 4) : 1.6
  return { aspect: safe, height: DEAL_VIEW_HEIGHT, width: DEAL_VIEW_HEIGHT * safe }
}

export const START_CAMERA: Readonly<DealCamera> = { tilt: 0.07, targetY: 0, targetZ: 0, distance: DEAL_DISTANCE }
export const END_CAMERA: Readonly<DealCamera> = { tilt: 0, targetY: 0, targetZ: 0, distance: DEAL_DISTANCE }

/** The winner at rest. */
export function endPose(dims: DealDims, stage: DealStage): DealPose {
  const scale = Math.min((END_FILL * stage.height) / dims.height, (END_WIDTH_FILL * stage.width) / dims.depth)
  return poseOf([0, END_LIFT * stage.height, 0], FRONT, { scale, thickness: 1, opacity: 1 })
}

const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)

/** How thick the covers are in the fan (a hand of thin cards). */
export const FAN_THICKNESS = 0.18

/**
 * The covers laid out like a hand of cards across the middle of the stage:
 * one fanned row, or on a narrow stage with many Books two or three rows,
 * each Book a little over its neighbour. In the host's order, left to right.
 */
export function fanPoses(dims: readonly DealDims[], stage: DealStage, random: () => number): DealPose[] {
  const count = dims.length
  const width = Math.max(...dims.map(d => d.depth))
  const height = mean(dims.map(d => d.height))
  const { width: viewWidth, height: viewHeight } = stage

  let best = { rows: 1, columns: count, scale: 0 }
  for (let rows = 1; rows <= Math.min(3, count); rows++) {
    const columns = Math.ceil(count / rows)
    const fitWidth = (0.92 * viewWidth) / (width * (1 + 0.34 * (columns - 1)))
    const fitHeight = (0.7 * viewHeight) / (height * (1 + 0.6 * (rows - 1)))
    const scale = Math.min(1.3, fitWidth, fitHeight)
    if (best.scale === 0 || scale > best.scale * 1.06) best = { rows, columns, scale }
  }

  const { rows, scale } = best
  const poses: DealPose[] = []
  const radius = 0.95
  const step = Math.max(0.0045, mean(dims.map(d => d.thickness)) * FAN_THICKNESS * 1.2 + 0.001)
  let index = 0
  for (let row = 0; row < rows; row++) {
    const inRow = Math.min(best.columns, count - index, Math.ceil((count - index) / (rows - row)))
    const cardWidth = width * scale
    const spread = Math.min(0.9 * viewWidth - cardWidth * 1.03, Math.max(0, inRow - 1) * 0.8 * cardWidth)
    const rowY = ((rows - 1) / 2 - row) * 0.6 * height * scale - 0.012
    for (let column = 0; column < inRow; column++) {
      const x = inRow > 1 ? -spread / 2 + (spread * column) / (inRow - 1) : 0
      const angle = Math.asin(clamp(x / radius, -0.9, 0.9))
      const y = rowY + radius * Math.cos(angle) - radius + (random() - 0.5) * 0.006
      const roll = -angle + (random() - 0.5) * 0.05
      const z = row * 0.03 + (index - (count - 1) / 2) * step
      const quaternion = qMul(qAxisAngle(AXIS_Z, roll), FRONT)
      poses.push(poseOf([x, y, z], quaternion, { scale, thickness: FAN_THICKNESS, opacity: 1 }))
      index++
    }
  }
  return poses
}

/** A builder per Book: out of sight, in with a little pop, staggered, at its fan pose by INTRO_END. */
export function introBuilders(fan: readonly DealPose[]): TrackBuilder[] {
  const count = fan.length
  const stagger = count > 1 ? Math.min(24, 110 / (count - 1)) : 0
  return fan.map((pose, index) => {
    const from = makePose()
    from.position = [pose.position[0], pose.position[1] - 0.05, pose.position[2] - 0.04]
    from.quaternion = [...pose.quaternion]
    from.scale = pose.scale * 0.88
    from.thickness = pose.thickness
    from.opacity = 0
    const builder = new TrackBuilder(from)
    const start = 20 + index * stagger
    builder.to(pose, start, Math.min(INTRO_END, start + 290), { ease: 'outBack' })
    builder.hold(INTRO_END)
    return builder
  })
}

export function lerpCamera(a: Readonly<DealCamera>, b: Readonly<DealCamera>, e: number, out: DealCamera) {
  out.tilt = a.tilt + (b.tilt - a.tilt) * e
  out.targetY = a.targetY + (b.targetY - a.targetY) * e
  out.targetZ = a.targetZ + (b.targetZ - a.targetZ) * e
  out.distance = a.distance + (b.distance - a.distance) * e
}

export function copyCamera(from: Readonly<DealCamera>, out: DealCamera) {
  out.tilt = from.tilt
  out.targetY = from.targetY
  out.targetZ = from.targetZ
  out.distance = from.distance
}
