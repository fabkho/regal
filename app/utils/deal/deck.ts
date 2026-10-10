// Variant A, "deck": a card game's shuffle. The Books gather into one deck lying
// flat, back covers up (thin, like cards); it splits in two halves that riffle
// together, twice, then is cut (the top part put under the bottom one). The
// cut is where the winner is put on top: it is the Book that ends up last in the
// deck. Then the top card is lifted, turned face up and stood to the end pose
// while the camera comes down from the table to face it.
//
// Every move keeps the cards apart the way real cards are: sideways at
// heights that don't overlap, or up and down only while the piles are beside each other.
import { AXIS_Y, AXIS_Z, clamp, ease, orient, qAxisAngle, qMul, shuffled } from './math'
import type { Quat } from './math'
import { copyPose, poseOf } from './tracks'
import type { DealPose } from './tracks'
import type { DealCamera, VariantContext, VariantPlan } from './types'
import { copyCamera, DEAL_DISTANCE, lerpCamera } from './layout'

/** Face down (the back cover up), its top away from the camera, the Spine to the right. */
export const DECK_DOWN: Readonly<Quat> = orient([0, -1, 0], [0, 0, -1])
/** How thick the cards are on the table, of the Books' own thickness. */
export const DECK_THICKNESS = 0.26
/** The camera's tilt over the table (rad). */
export const DECK_TILT = 0.92

/** Face up, lying, its top away from the camera (DECK_DOWN turned over about the view axis). */
const FACE_UP: Readonly<Quat> = qMul(qAxisAngle(AXIS_Z, Math.PI), DECK_DOWN)
const tipQuat: Quat = [0, 0, 0, 1]

const yawed = (yaw: number): Quat => qMul(qAxisAngle(AXIS_Y, yaw), DECK_DOWN)

interface Jitter { x: number, z: number, yaw: number }

export function planDeck(ctx: VariantContext): VariantPlan {
  const { dims, winner, stage, random, end, timeline, builders } = ctx
  const count = dims.length
  const maxWidth = Math.max(...dims.map(d => d.depth))
  const scale = clamp((0.88 * stage.width) / (2.16 * maxWidth), 0.5, 1.3)
  const pitch = dims.map(d => d.thickness * DECK_THICKNESS + 0.0008)
  const total = pitch.reduce((sum, value) => sum + value, 0)
  const base = -total / 2
  const half = 0.58 * maxWidth

  const start = timeline.shuffleStart
  const length = timeline.presentStart - start
  const present = timeline.presentEnd - timeline.presentStart
  const at = (share: number) => start + share * length

  /** A card of the deck in world terms (unit coordinates, scaled about the table's centre). */
  const card = (x: number, y: number, z: number, yaw: number, opacity = 1): DealPose =>
    poseOf([x * scale, y * scale, z * scale], yawed(yaw), { scale, thickness: DECK_THICKNESS, opacity })

  /** Heights (unit) of a pile standing on the table: `order` bottom to top. */
  const heights = (order: readonly number[], from = base): Map<number, number> => {
    const out = new Map<number, number>()
    let y = from
    for (const book of order) {
      out.set(book, y + pitch[book]! / 2)
      y += pitch[book]!
    }
    return out
  }
  const jitterOf = (amount: number): Jitter => ({ x: (random() - 0.5) * 0.012 * amount, z: (random() - 0.5) * 0.012 * amount, yaw: (random() - 0.5) * 0.12 * amount })

  // --- Gather: the fan sweeps together into a deck, bottom card first ---------------
  const gatherOrder = shuffled(Array.from({ length: count }, (_, index) => index), random)
  const gatherEnd = at(0.22)
  const gatherStagger = count > 1 ? clamp((gatherEnd - start - 360) / (count - 1), 12, 60) : 0
  let order = gatherOrder
  let jitters = new Map<number, Jitter>()
  {
    const y = heights(order)
    order.forEach((book, slot) => {
      const jitter = jitterOf(1)
      jitters.set(book, jitter)
      const t0 = start + slot * gatherStagger
      builders[book]!.to(card(jitter.x, y.get(book)!, jitter.z, jitter.yaw), t0, t0 + 360, {
        ease: 'inOut',
        arc: [0, 0.09, 0.05],
        wobble: { axis: AXIS_Z, angle: (random() - 0.5) * 0.7 },
      })
    })
  }

  // --- Riffle: split in two, then drop the cards alternately onto one deck ----------
  function riffle(from: number, until: number, spread: number): void {
    const span = until - from
    // Where the cut falls, near the middle.
    const split = clamp(Math.round(count / 2 + (random() - 0.5) * 2), 1, count - 1)
    const lower = order.slice(0, split)
    const upper = order.slice(split)

    // The order the cards land in: from the top of either half, in runs of one or two.
    const landing = (): number[] => {
      const a = [...lower]
      const b = [...upper]
      const out: number[] = []
      let side = random() < 0.5 ? a : b
      while (a.length || b.length) {
        if (!side.length) side = side === a ? b : a
        out.push(side.pop()!)
        const other = side === a ? b : a
        if (other.length && random() < 0.74) side = other
      }
      return out
    }

    // The winner must not already be the last card (the cut needs a card to cut above it):
    // only matters for the second riffle, where `needsCut` is set.
    let landed = landing()
    for (let attempt = 0; attempt < 24 && needsCut && landed[count - 1] === winner; attempt++) landed = landing()

    const leftX = -spread * half
    const rightX = spread * half
    const lowerY = heights(lower)
    const upperY = heights(upper)

    // Split: the halves slide apart at their own heights, the upper one then sets down.
    lower.forEach((book, index) => {
      const j = jitters.get(book)!
      const t0 = from + index * 6
      builders[book]!.to(card(leftX + j.x, lowerY.get(book)!, j.z, j.yaw), t0, from + 0.15 * span, { ease: 'inOut', wobble: { axis: AXIS_Z, angle: 0.12 } })
    })
    const raised = heights(order)
    upper.forEach((book, index) => {
      const j = jitters.get(book)!
      const t0 = from + (upper.length - index) * 6
      const mid = card(rightX + j.x, raised.get(book)!, j.z, j.yaw)
      builders[book]!.to(mid, t0, from + 0.15 * span, { ease: 'inOut', wobble: { axis: AXIS_Z, angle: -0.12 } })
      builders[book]!.to(card(rightX + j.x, upperY.get(book)!, j.z, j.yaw), from + 0.15 * span, from + 0.24 * span, { ease: 'inOut' })
    })

    // Drop: each card in turn leaves the top of its half and arcs onto the deck.
    const landingY = heights(landed)
    const stagger = count > 1 ? clamp((0.74 * span - 270) / (count - 1), 10, 70) : 0
    const nextJitters = new Map<number, Jitter>()
    landed.forEach((book, slot) => {
      const fromLeft = lower.includes(book)
      const jitter = jitterOf(slot === count - 1 ? 0.6 : 1)
      nextJitters.set(book, jitter)
      const t0 = from + 0.26 * span + slot * stagger
      builders[book]!.to(card(jitter.x, landingY.get(book)!, jitter.z, jitter.yaw), t0, t0 + 270, {
        ease: 'inOut',
        arc: [0, 0.06, 0.02],
        wobble: { axis: AXIS_Z, angle: fromLeft ? -0.5 : 0.5 },
      })
    })
    order = landed
    jitters = nextJitters
  }

  let needsCut = false
  riffle(gatherEnd + 30, at(0.50), 1)
  needsCut = true
  riffle(at(0.50) + 30, at(0.74), 0.78)

  // --- Cut: the top part is set down beside the deck, the rest is lifted onto it ---
  const cutStart = at(0.74) + 30
  const cutLength = at(0.98) - cutStart
  const cutAt = (share: number) => cutStart + share * cutLength
  const winnerSlot = order.indexOf(winner)
  // The cut falls just above the winner (none at all when it is on top already).
  const cut = winnerSlot + 1
  const bottom = order.slice(0, cut)
  const top = order.slice(cut)
  const through = heights(order)
  const sideX = 0.58 * maxWidth
  const topDown = heights(top)

  top.forEach((book, index) => {
    const j = jitters.get(book)!
    const t0 = cutAt(0) + index * 7
    const lifted = card(sideX + j.x * 0.5, through.get(book)!, j.z * 0.5, j.yaw * 0.5)
    builders[book]!.to(lifted, t0, cutAt(0.2), { ease: 'inOut', arc: [0, 0.03, 0.03], wobble: { axis: AXIS_Z, angle: -0.1 } })
    builders[book]!.to(card(sideX + j.x * 0.5, topDown.get(book)!, j.z * 0.5, j.yaw * 0.5), cutAt(0.2), cutAt(0.34), { ease: 'inOut' })
  })
  bottom.forEach((book, index) => {
    const j = jitters.get(book)!
    const t0 = cutAt(0) + index * 7
    builders[book]!.to(card(-sideX + j.x * 0.5, through.get(book)!, j.z * 0.5, j.yaw * 0.5), t0, cutAt(0.2), { ease: 'inOut', wobble: { axis: AXIS_Z, angle: 0.1 } })
  })
  const finalOrder = [...top, ...bottom]
  const finalY = heights(finalOrder)
  bottom.forEach((book, index) => {
    const j = jitters.get(book)!
    const y = finalY.get(book)!
    // Lifted clear of the part on the table, then slid across above it.
    builders[book]!.to(card(-sideX + j.x * 0.5, y, j.z * 0.5, j.yaw * 0.5), cutAt(0.36) + index * 6, cutAt(0.5), { ease: 'inOut' })
  })
  bottom.forEach((book, index) => {
    const j = jitters.get(book)!
    builders[book]!.to(card(sideX + j.x * 0.3, finalY.get(book)!, j.z * 0.3, j.yaw * 0.3), cutAt(0.5) + index * 6, cutAt(0.76), { ease: 'inOut', arc: [0, 0.025, 0.02], wobble: { axis: AXIS_Z, angle: 0.08 } })
  })
  // Squared up in the middle.
  for (const book of finalOrder) {
    builders[book]!.to(card(0, finalY.get(book)!, 0, 0), cutAt(0.78), cutAt(1), { ease: 'inOut' })
  }
  if (finalOrder[count - 1] !== winner) throw new Error('deck: the winner is not on top')

  // --- Present: the top card is lifted, turned face up, and held up to the camera as it comes down ---
  const presentStart = timeline.presentStart
  const presentAt = (share: number) => presentStart + share * present
  const topY = finalY.get(winner)! * scale
  const winnerBuilder = builders[winner]!
  // The camera comes down from the table in [cameraFrom, presentEnd]; the card follows it, always facing it.
  const cameraFrom = presentAt(0.14)
  const tiltAt = (t: number) => DECK_TILT * (1 - ease('inOut', clamp((t - cameraFrom) / (timeline.presentEnd - cameraFrom), 0, 1)))
  const faceFrom = presentAt(0.5)
  const facing = (tilt: number, out: Quat): Quat => {
    const half = (Math.PI / 2 - tilt) / 2
    tipQuat[0] = Math.sin(half)
    tipQuat[3] = Math.cos(half)
    return qMul(tipQuat, FACE_UP, out)
  }
  // Kept low and near the deck so the card never leaves the frame.
  const lifted = poseOf([0, topY + 0.02, 0.05], DECK_DOWN, { scale, thickness: DECK_THICKNESS })
  const halfTurn = poseOf([0, topY + 0.03, 0.09], qMul(qAxisAngle(AXIS_Z, Math.PI / 2), DECK_DOWN), { scale: scale * 1.04, thickness: DECK_THICKNESS })
  const faceUp = poseOf([0, topY + 0.03, 0.1], facing(tiltAt(faceFrom), [0, 0, 0, 1]), { scale: scale * 1.08, thickness: 0.6 })
  winnerBuilder.to(lifted, presentAt(0), presentAt(0.22), { ease: 'out' })
  winnerBuilder.to(halfTurn, presentAt(0.22), presentAt(0.36), { ease: 'in' })
  winnerBuilder.to(faceUp, presentAt(0.36), faceFrom, { ease: 'out' })
  winnerBuilder.custom(faceFrom, timeline.presentEnd, (u, out) => {
    const e = ease('inOut', u)
    out.position[0] = 0
    out.position[1] = faceUp.position[1] + (end.position[1] - faceUp.position[1]) * e
    out.position[2] = faceUp.position[2] + (end.position[2] - faceUp.position[2]) * e
    facing(tiltAt(faceFrom + u * (timeline.presentEnd - faceFrom)), out.quaternion)
    out.scale = faceUp.scale + (end.scale - faceUp.scale) * e
    out.thickness = faceUp.thickness + (end.thickness - faceUp.thickness) * e
    out.opacity = 1
  }, end)

  // The rest of the deck sinks away, top card first.
  finalOrder.forEach((book, index) => {
    if (book === winner) return
    const from = copyPose(builders[book]!.current())
    const gone = copyPose(from)
    gone.position[1] -= 0.22
    gone.scale *= 0.9
    gone.opacity = 0
    const t0 = presentAt(0.04) + (finalOrder.length - 2 - index) * 12
    builders[book]!.to(gone, t0, t0 + 0.34 * present, { ease: 'out' })
  })
  // Everyone holds the end.
  for (const builder of builders) builder.hold(timeline.total)

  // --- Camera: down onto the table with the gathering deck, back to face the card ---
  const table: DealCamera = { tilt: DECK_TILT, targetY: 0, targetZ: 0, distance: DEAL_DISTANCE }
  const floorY = (base - 0.0006) * scale
  return {
    camera: [
      { t0: start, t1: gatherEnd + 80, fn: (u, out) => lerpCamera(ctx.startCamera, table, ease('inOut', u), out) },
      { t0: gatherEnd + 80, t1: cameraFrom, fn: (_u, out) => copyCamera(table, out) },
      { t0: cameraFrom, t1: timeline.presentEnd, fn: (u, out) => lerpCamera(table, { tilt: 0, targetY: 0, targetZ: 0, distance: DEAL_DISTANCE }, ease('inOut', u), out) },
    ],
    // The floor's shadow comes in as the camera leaves the fan (a plane seen edge-on would veil the covers).
    floor: { y: floorY, opacity: t => clamp((t - start - 250) / 550, 0, 1) * (t < presentStart ? 1 : clamp(1 - (t - presentStart) / (0.45 * present), 0, 1)) },
    info: { deckOrder: finalOrder, turnAt: presentStart },
  }
}
