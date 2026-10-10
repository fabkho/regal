// Variant C, "wheel": a carousel against a fixed pointer. The covers stand on a
// ring about a vertical axis, facing out, the front one nearest the camera, with
// a small marker above the front. The ring spins fast and slows the way a
// wheel does, through several turns whose total is worked out so the winner
// stops exactly under the marker (with a tiny overshoot and settle). Then the
// winner steps forward to the end pose while the ring sinks.
import { AXIS_Y, clamp, ease, shuffled, spinPeak, spinProfile } from './math'
import { copyPose, poseOf } from './tracks'
import type { DealPose } from './tracks'
import type { DealCamera, VariantContext, VariantPlan } from './types'
import { copyCamera, DEAL_DISTANCE, FRONT, lerpCamera } from './layout'

/** The camera's tilt over the ring (rad). */
export const WHEEL_TILT = 0.3
/** The fastest the ring turns (rad/s): the cover next to it has moved less than half a gap per frame at 60 fps. */
const MAX_SPEED = 16
const SPIN = { power: 1.1, ramp: 0.06 } as const

export function planWheel(ctx: VariantContext): VariantPlan {
  const { dims, winner, stage, random, end, timeline, builders } = ctx
  const count = dims.length
  const widest = Math.max(...dims.map(d => d.depth))
  const tallest = Math.max(...dims.map(d => d.height))
  // Radius: room for every cover side by side; the ring may run wider than a narrow stage (it is a carousel).
  const radiusUnit = Math.max(0.11, (count * widest * 1.12) / (2 * Math.PI))
  const scale = clamp(Math.min((0.95 * stage.width) / (2 * radiusUnit + widest), (0.38 * stage.height) / tallest), 0.5, 1.1)
  const radius = radiusUnit * scale
  const floor = (-tallest * scale) / 2

  const start = timeline.shuffleStart
  const length = timeline.presentStart - start
  const present = timeline.presentEnd - timeline.presentStart
  const at = (share: number) => start + share * length

  // Who stands where on the ring.
  const slots = shuffled(Array.from({ length: count }, (_, index) => index), random)
  // Two covers on opposite sides of a ring would stand one behind the other: they sit 126° apart instead.
  const angles = dims.map((_, book) => (count === 2 ? 2.2 * slots.indexOf(book) : (2 * Math.PI * slots.indexOf(book)) / count))

  /** A cover on the ring turned by `turn` rad (written to `out`). */
  const ringPose = (book: number, turn: number, out: DealPose) => {
    const phi = angles[book]! + turn
    const half = phi / 2
    const s = Math.sin(half)
    const c = Math.cos(half)
    const [fx, fy, fz, fw] = FRONT
    out.position[0] = radius * Math.sin(phi)
    out.position[1] = floor + (dims[book]!.height * scale) / 2
    out.position[2] = -radius + radius * Math.cos(phi)
    // Y rotation by phi times the upright pose.
    out.quaternion[0] = c * fx + s * fz
    out.quaternion[1] = c * fy + s * fw
    out.quaternion[2] = c * fz - s * fx
    out.quaternion[3] = c * fw - s * fy
    out.scale = scale
    out.thickness = 1
    out.opacity = 1
    return out
  }
  const ringAt = (book: number, turn: number): DealPose => ringPose(book, turn, poseOf([0, 0, 0], [0, 0, 0, 1]))

  // --- Form: the fan steps onto the ring -------------------------------------------
  const formEnd = at(0.2)
  const stagger = count > 1 ? clamp((formEnd - start - 400) / (count - 1), 8, 34) : 0
  dims.forEach((_, book) => {
    const t0 = start + book * stagger
    builders[book]!.to(ringAt(book, 0), t0, t0 + 400, {
      ease: 'inOut',
      arc: [0, 0.07, 0.06],
      wobble: { axis: AXIS_Y, angle: (random() - 0.5) * 0.8 },
    })
  })

  // --- Spin: ends with the winner at the front, under the marker ---------------------
  const spinStart = formEnd + 20
  const spinEnd = at(0.95)
  const spinLength = spinEnd - spinStart
  const mainEnd = spinStart + 0.88 * spinLength
  const fast = Math.min(MAX_SPEED, (0.5 * (2 * Math.PI / count) * 60))
  const speed = Math.max(6, fast)
  const wanted = (speed * (spinLength / 1000)) / spinPeak(SPIN.power, SPIN.ramp)
  const turns = Math.max(2, Math.round((wanted - angles[winner]!) / (2 * Math.PI)))
  // Turning towards negative angles; the winner's slot comes round to the front (angle 0) at the end.
  const total = angles[winner]! + 2 * Math.PI * turns
  const overshoot = Math.min(0.05, (0.3 * 2 * Math.PI) / count)
  const progress = spinProfile(SPIN.power, SPIN.ramp)
  const settled = -total

  for (let book = 0; book < count; book++) {
    const rest = ringAt(book, settled)
    builders[book]!.custom(spinStart, mainEnd, (u, out) => void ringPose(book, -(total + overshoot) * progress(u), out), ringAt(book, -(total + overshoot)))
    builders[book]!.custom(mainEnd, spinEnd, (u, out) => void ringPose(book, -(total + overshoot) + overshoot * ease('inOut', u), out), rest)
  }

  // --- Present: the winner steps forward; the ring sinks ------------------------------
  const presentStart = timeline.presentStart
  const presentAt = (share: number) => presentStart + share * present
  builders[winner]!.to(end, presentAt(0), presentAt(1), { ease: 'inOut', arc: [0, 0, 0.09] })
  for (let book = 0; book < count; book++) {
    if (book === winner) continue
    const sink = copyPose(builders[book]!.current())
    sink.position[1] -= 0.3
    sink.opacity = 0
    const turned = Math.abs(Math.atan2(Math.sin(angles[book]! + settled), Math.cos(angles[book]! + settled)))
    const t0 = presentAt(0.02) + (turned / Math.PI) * 0.15 * present
    builders[book]!.to(sink, t0, t0 + 0.5 * present, { ease: 'in' })
  }
  for (const builder of builders) builder.hold(timeline.total)

  const ring: DealCamera = { tilt: WHEEL_TILT, targetY: -0.012, targetZ: -radius * 0.8, distance: DEAL_DISTANCE }
  const gone: DealCamera = { tilt: 0, targetY: 0, targetZ: 0, distance: DEAL_DISTANCE }
  // Its tip rests just above the winner's top, where the ring stops.
  const pointerY = floor + dims[winner]!.height * scale + 0.014
  return {
    camera: [
      { t0: start, t1: formEnd + 120, fn: (u, out) => lerpCamera(ctx.startCamera, ring, ease('inOut', u), out) },
      { t0: formEnd + 120, t1: presentAt(0.1), fn: (_u, out) => copyCamera(ring, out) },
      { t0: presentAt(0.1), t1: timeline.presentEnd, fn: (u, out) => lerpCamera(ring, gone, ease('inOut', u), out) },
    ],
    floor: { y: floor - 0.001, opacity: t => clamp((t - start - 250) / 550, 0, 1) * (t < presentStart ? 1 : clamp(1 - (t - presentStart) / (0.4 * present), 0, 1)) },
    pointer: {
      position: [0, pointerY, 0.02],
      opacity: t => clamp((t - (spinStart - 200)) / 260, 0, 1) * clamp(1 - (t - presentStart) / (0.25 * present), 0, 1),
    },
    info: { finalAngle: settled, slotAngles: angles, spinEnd },
  }
}
