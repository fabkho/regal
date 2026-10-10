// Variant B, "stack": Regal's Stack. The Books pile up lying flat, Spines to the
// camera; the pile re-sorts a few times (a Book slides out sideways, the pile
// closes and opens again, the Book slides back in at its new height: the Stack's
// "hand" shuffle); then a scroll runs through the pile and slows down, the
// Books passing the middle fanning out like the Stack's riffle
// (utils/stack/scrollHighlight.ts), until the winner stops in the middle. It is
// pulled out of the pile, turned to show its front and stood to the end pose
// while the pile sinks.
//
// Safe the way utils/stack/shuffle.ts is: Books move sideways while heights
// don't overlap, and up or down only as a whole column keeping its order or
// while apart from it.
import { AXIS_X, AXIS_Y, clamp, ease, orient, qAxisAngle, qMul, shuffled, spinProfile } from './math'
import type { Quat } from './math'
import { copyPose, poseOf } from './tracks'
import type { DealPose } from './tracks'
import type { DealCamera, VariantContext, VariantPlan } from './types'
import { copyCamera, DEAL_DISTANCE, lerpCamera } from './layout'
import { bell, RIFFLE } from '../stack/scrollHighlight'

/** Lying flat, the front cover up, the top to the left, the Spine to the camera (the Stack's pose). */
export const PILE_LYING: Readonly<Quat> = orient([0, 1, 0], [-1, 0, 0])
/** Standing up facing the camera, the top still to the left. */
const PILE_UP: Readonly<Quat> = orient([0, 0, 1], [-1, 0, 0])
/** The camera's tilt over the pile (rad). */
export const STACK_TILT = 0.24
/** The fan's reach (m) and strength; the Stack's own numbers a little stronger. */
export const SCROLL_FAN = { radius: RIFFLE.radius * 1.15, out: 0.03, yaw: 0.34 } as const

export function planStack(ctx: VariantContext): VariantPlan {
  const { dims, winner, stage, random, end, timeline, builders } = ctx
  const count = dims.length
  const thickness = dims.map(d => d.thickness)
  const totalHeight = thickness.reduce((sum, value) => sum + value, 0)
  const longest = Math.max(...dims.map(d => d.height))
  const scale = clamp(Math.min((0.8 * stage.width) / longest, (0.72 * stage.height) / totalHeight, 1.5), 0.45, 1.5)

  const start = timeline.shuffleStart
  const length = timeline.presentStart - start
  const present = timeline.presentEnd - timeline.presentStart
  const at = (share: number) => start + share * length

  const twist = dims.map(() => (random() - 0.5) * 0.12)
  const offsetX = dims.map(() => (random() - 0.5) * 0.03)
  const offsetZ = dims.map(() => (random() - 0.5) * 0.014)
  const yawed = (book: number): Quat => qMul(qAxisAngle(AXIS_Y, twist[book]!), PILE_LYING)

  /** Heights (unit) of a pile, bottom to top, the pile's middle at 0. */
  const heights = (order: readonly number[]): Map<number, number> => {
    const out = new Map<number, number>()
    let y = -totalHeight / 2
    for (const book of order) {
      out.set(book, y + thickness[book]! / 2)
      y += thickness[book]!
    }
    return out
  }
  const lying = (book: number, y: number, x = offsetX[book]!, opacity = 1): DealPose =>
    poseOf([x * scale, y * scale, offsetZ[book]! * scale], yawed(book), { scale, thickness: 1, opacity })

  // --- Gather: the fan drops into a pile, bottom Book first -------------------------
  let order = shuffled(Array.from({ length: count }, (_, index) => index), random)
  const gatherEnd = at(0.14)
  {
    const y = heights(order)
    const stagger = count > 1 ? clamp((gatherEnd - start - 340) / (count - 1), 8, 45) : 0
    order.forEach((book, slot) => {
      const t0 = start + slot * stagger
      builders[book]!.to(lying(book, y.get(book)!), t0, t0 + 340, {
        ease: 'inOut',
        arc: [0, 0.12, 0.07],
        wobble: { axis: AXIS_Y, angle: (random() - 0.5) * 0.6 },
      })
    })
  }

  // --- Re-sorts: one Book at a time out sideways, the pile closes, opens, the Book back in ---
  const moves = count >= 4 ? 5 : count
  const sortEnd = at(0.58)
  const moveLength = (sortEnd - gatherEnd) / moves
  for (let move = 0; move < moves; move++) {
    const t0 = gatherEnd + move * moveLength
    const at2 = (share: number) => t0 + share * moveLength
    const from = Math.floor(random() * count)
    let to = from
    const apart = Math.max(1, Math.floor(count / 3))
    for (let attempt = 0; attempt < 32 && (to === from || Math.abs(to - from) < apart); attempt++) to = Math.floor(random() * count)
    if (to === from) to = (from + 1) % count
    const book = order[from]!
    const rest = order.filter(other => other !== book)
    const next = [...rest]
    next.splice(to, 0, book)
    const side = move % 2 === 0 ? -1 : 1
    const outX = side * dims[book]!.height * 1.08
    const before = heights(order)
    const after = heights(next)

    const out = builders[book]!
    out.to(lying(book, before.get(book)!, outX), at2(0), at2(0.36), { ease: 'out', wobble: { axis: AXIS_Y, angle: side * 0.25 } })
    out.to(lying(book, after.get(book)!, outX), at2(0.3), at2(0.68), { ease: 'inOut' })
    out.to(lying(book, after.get(book)!), at2(0.66), at2(1), { ease: 'out', wobble: { axis: AXIS_Y, angle: -side * 0.2 } })
    for (const other of rest) {
      const y0 = before.get(other)!
      const y1 = after.get(other)!
      if (Math.abs(y1 - y0) > 1e-9) builders[other]!.to(lying(other, y1), at2(0.3), at2(0.68), { ease: 'inOut' })
    }
    order = next
  }

  // --- Scroll: the focus line runs through the pile and slows to the winner ----------
  const pile = heights(order)
  const winnerY = pile.get(winner)!
  const scrollStart = sortEnd
  const scrollEnd = at(0.96)
  const middle = 0
  // Where the focus line goes (unit heights): to the top, down to the bottom, any more sweeps a short pile needs, then up to the winner.
  const top = totalHeight / 2
  const bottom = -totalHeight / 2
  const waypoints = [middle, top, bottom]
  const around = (top - middle) + totalHeight + (winnerY - bottom)
  const sweeps = clamp(Math.ceil((0.95 / scale - around) / (2 * totalHeight)), 0, 6)
  for (let sweep = 0; sweep < sweeps; sweep++) waypoints.push(top, bottom)
  waypoints.push(winnerY)
  const legs: number[] = []
  let travel = 0
  for (let index = 1; index < waypoints.length; index++) {
    travel += Math.abs(waypoints[index]! - waypoints[index - 1]!)
    legs.push(travel)
  }
  const progress = spinProfile(2, 0.04)
  const focusAt = (u: number): number => {
    const distance = travel * progress(u)
    let leg = 0
    while (leg < legs.length - 1 && legs[leg]! < distance) leg++
    const legStart = leg === 0 ? 0 : legs[leg - 1]!
    const span = legs[leg]! - legStart
    const share = span > 0 ? clamp((distance - legStart) / span, 0, 1) : 1
    return waypoints[leg]! + (waypoints[leg + 1]! - waypoints[leg]!) * share
  }

  /** A pile Book at focus `f` (unit): where the line is, the Books near it fan out. */
  const fanned = (book: number, y: number, f: number, strength: number, out: DealPose) => {
    const amount = bell(y - f, SCROLL_FAN.radius) * strength
    const half = (dims[book]!.height * scale) / 2
    const yaw = -SCROLL_FAN.yaw * amount
    out.position[0] = offsetX[book]! * scale - half + half * Math.cos(yaw)
    out.position[1] = (y - f) * scale
    out.position[2] = offsetZ[book]! * scale - half * Math.sin(yaw) + SCROLL_FAN.out * amount * scale
    const q = yawed(book)
    const x = q[0]
    const yq = q[1]
    const z = q[2]
    const w = q[3]
    // Turned about the vertical axis: Y rotation by `yaw` times the pile's pose.
    const s = Math.sin(yaw / 2)
    const c = Math.cos(yaw / 2)
    out.quaternion[0] = c * x + s * z
    out.quaternion[1] = c * yq + s * w
    out.quaternion[2] = c * z - s * x
    out.quaternion[3] = c * w - s * yq
    out.scale = scale
    out.thickness = 1
    out.opacity = 1
  }

  for (const book of order) {
    const y = pile.get(book)!
    const finish = makePoseAt(book, y, focusAt(1), fanned)
    builders[book]!.custom(scrollStart, scrollEnd, (u, out) => fanned(book, y, focusAt(u), ease('inOut', Math.min(1, u / 0.1)), out), finish)
  }

  // --- Present: the winner is pulled out, turned and stood; the pile sinks -----------
  const presentStart = timeline.presentStart
  const presentAt = (share: number) => presentStart + share * present
  const winnerBuilder = builders[winner]!
  const resting = winnerBuilder.current()
  const pulled = copyPose(resting)
  pulled.position[2] += 0.16
  pulled.position[1] += 0.01
  pulled.quaternion = qMul(qAxisAngle(AXIS_X, 0.5), resting.quaternion)
  pulled.scale = scale * 1.1
  const standing = poseOf([0, 0.02, 0.1], PILE_UP, { scale: scale * 1.3, thickness: 1 })
  winnerBuilder.to(pulled, presentAt(0), presentAt(0.3), { ease: 'out' })
  winnerBuilder.to(standing, presentAt(0.28), presentAt(0.62), { ease: 'inOut' })
  winnerBuilder.to(end, presentAt(0.6), presentAt(1), { ease: 'inOut' })
  order.forEach((book) => {
    if (book === winner) return
    const sink = copyPose(builders[book]!.current())
    sink.position[1] -= 0.4
    sink.opacity = 0
    const t0 = presentAt(0.03) + Math.abs(pile.get(book)! - winnerY) * 90
    builders[book]!.to(sink, t0, t0 + 0.55 * present, { ease: 'in' })
  })
  for (const builder of builders) builder.hold(timeline.total)

  const resting3: DealCamera = { tilt: STACK_TILT, targetY: 0, targetZ: 0, distance: DEAL_DISTANCE }
  const gone: DealCamera = { tilt: 0, targetY: 0, targetZ: 0, distance: DEAL_DISTANCE }
  return {
    camera: [
      { t0: start, t1: gatherEnd + 100, fn: (u, out) => lerpCamera(ctx.startCamera, resting3, ease('inOut', u), out) },
      { t0: gatherEnd + 100, t1: presentAt(0.2), fn: (_u, out) => copyCamera(resting3, out) },
      { t0: presentAt(0.2), t1: timeline.presentEnd, fn: (u, out) => lerpCamera(resting3, gone, ease('inOut', u), out) },
    ],
    floor: null,
    info: { pileOrder: order, scrollEnd },
  }
}

function makePoseAt(book: number, y: number, f: number, fanned: (book: number, y: number, f: number, strength: number, out: DealPose) => void): DealPose {
  const pose = poseOf([0, 0, 0], [0, 0, 0, 1])
  fanned(book, y, f, 1, pose)
  return pose
}
