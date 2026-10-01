// Shuffle: plans how the Stack re-orders itself when the view is re-sorted or
// filtered. Every Book is a solid object, so no two may ever intersect while
// the plan plays. Pure and deterministic, no three.js.
//
// Safety rests on one invariant: two lying Books can only touch if their world
// y intervals overlap (a Book lying flat is thickness tall whatever its twist).
// So every phase either moves Books that are vertically disjoint, or moves them
// vertically while keeping their order. Because all Books in a phase share the
// same keyframe times and easing, a gap between two Books interpolates
// linearly, so a gap that is open at both ends of a phase never closes inside
// it.
//
// Stated as the rule every Style is designed against: while all Books keep
// mutually disjoint height intervals (the pile as it lies, or an
// order-preserving vertical spread of it), ANY horizontal motion and any
// rotation about the vertical axis is safe. Height changes are only safe while
// the footprints are laterally disjoint (ring or helix slots), or while the
// Books share a column and keep their order.
//
// One trap follows from the per-segment smoothstep in sampleTrack: positions
// interpolate component-wise, so turning a ring is not a rotation, it is a set
// of chords that cut inside the circle. A turning ring therefore gets
// intermediate keyframes every ≤ 20°, and its slots are built for the shrunken
// ring the chords pass through (see turnProgress and ringSlots' shrink).
import type { BookPose } from '../books/pose'

export type ShuffleStyle = 'hand' | 'carousel' | 'spin' | 'helix' | 'fan'

/** Every Style, for the view settings UI. */
export const SHUFFLE_STYLES: { value: ShuffleStyle, title: string, text: string }[] = [
  { value: 'hand', title: 'Hand', text: 'Pulls a handful of Books out to the side and slides them back into the pile.' },
  { value: 'carousel', title: 'Carousel', text: 'The whole pile swings out into a ring, finds its new heights and drops back in.' },
  { value: 'spin', title: 'Spin', text: 'A Carousel whose ring turns most of a full circle while the Books change height.' },
  { value: 'helix', title: 'Helix', text: 'The pile stretches into a spiral staircase that turns, then collapses back together.' },
  { value: 'fan', title: 'Fan', text: 'Fans the pile out like a hand of cards, swaps the Books around and closes it again.' },
]

export interface ShuffleKeyframe {
  /** Seconds from the start of the plan. */
  t: number
  position: [number, number, number]
  /** Euler XYZ, radians; only the y component ever changes. */
  rotation: [number, number, number]
}

export interface ShufflePlan {
  /** Seconds. */
  duration: number
  /** Book Id → keyframes, ascending in time. The last one is the target pose. */
  tracks: Map<string, ShuffleKeyframe[]>
}

export interface ShuffleOptions {
  /** Playback rate; 2 plays the whole plan twice as fast. Default 1. */
  speed?: number
}

type Vec3 = [number, number, number]

interface Node {
  position: Vec3
  rotation: Vec3
}

/** Mirrors LAYER_GAP in layout.ts, which does not export it. */
const LAYER_GAP = 0.0008
/** Room between the pile's footprint and a lane, sideways and front to back. */
const LANE_CLEARANCE = 0.06
const LANES = ['front', 'back', 'left', 'right'] as const
type Lane = (typeof LANES)[number]
/** One lane per Book, so a batch is at most four Books. */
const BATCH_SIZE = LANES.length
const HAND_PULL = 0.35
const HAND_RESTACK = 0.45
const HAND_SLIDE = 0.35
const HAND_SETTLE = 0.25
const CAROUSEL_OUT = 0.5
const CAROUSEL_LIFT = 0.6
const CAROUSEL_IN = 0.5
const SPIN_OUT = 0.5
const SPIN_TURN = 1.3
const SPIN_IN = 0.5
/** How far the ring turns while the Books change height. */
const SPIN_SWEEP = (250 * Math.PI) / 180
const HELIX_SPREAD = 0.45
const HELIX_SWING = 0.5
const HELIX_TURN = 1.1
const HELIX_IN = 0.45
const HELIX_COLLAPSE = 0.5
const HELIX_SWEEP = (200 * Math.PI) / 180
/** Room between two steps of the spread-out column. */
const SPREAD_GAP = 0.02
/** How far out and how far behind its slot a Book swings on the way out. */
const SWING_RADIUS = 0.55
const SWING_LEAD = 0.5
const FAN_OPEN = 0.45
const FAN_OUT = 0.4
const FAN_LIFT = 0.55
const FAN_BACK = 0.4
const FAN_CLOSE = 0.45
/** Angle the whole fan covers, and the most any two neighbours may differ. */
const FAN_SWEEP = (150 * Math.PI) / 180
const FAN_STEP = 0.25
/** Largest angle a turning ring may cover between two keyframes. */
const TURN_MAX_STEP = 0.32
/** Extra slot clearance for a turning ring, for the slight chord mis-twist. */
const RING_TURN_MARGIN = 0.008
const MIN_PHASE = 0.15
/** Plans longer than this get their phases squeezed. */
const TARGET_TOTAL = 6
/** Sideways room between neighbouring ring slots. */
const RING_CLEARANCE = 0.012
/** Room between two laps of the ring. */
const RING_LAP_GAP = 0.05
const MAX_STAGGER = 0.04
const STAGGER_BUDGET = 0.5
/** Headroom above everything, where Books new to the view wait. */
const PARK_CLEARANCE = 0.02

const vec = (value: readonly number[]): Vec3 => [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0]
const poseNode = (pose: BookPose): Node => ({ position: [pose.x, pose.y, pose.z], rotation: vec(pose.rotation) })
const samePose = (pose: BookPose, other: BookPose | undefined): boolean =>
  !!other && pose.x === other.x && pose.y === other.y && pose.z === other.z
  && pose.rotation.every((value, index) => value === other.rotation[index])

/**
 * Plans a collision-free move from the current poses to the target poses.
 * Books missing from `to` are dropped (they vanish); Books missing from `from`
 * are new to the view and join the pile on the way.
 */
export function planShuffle(from: BookPose[], to: BookPose[], style: ShuffleStyle, options: ShuffleOptions = {}): ShufflePlan {
  const speed = options.speed && options.speed > 0 ? options.speed : 1
  const fromById = new Map(from.map(pose => [pose.bookId, pose]))
  if (to.length === 0) return { duration: 0, tracks: new Map() }
  if (to.every(pose => samePose(pose, fromById.get(pose.bookId)))) {
    const tracks = new Map(to.map(pose => [pose.bookId, [{ t: 0, ...poseNode(pose) }]]))
    return { duration: 0, tracks }
  }
  if (style === 'carousel') return planCarousel(fromById, to, speed)
  if (style === 'spin') return planSpin(fromById, to, speed)
  if (style === 'helix') return planHelix(fromById, to, speed)
  if (style === 'fan') return planFan(fromById, to, speed)
  return planHand(fromById, to, speed)
}

/**
 * Pose of a track at time t, clamped to the first and last keyframe. Each
 * segment eases with smoothstep; position and rotation interpolate per
 * component, which is safe because only the twist (Euler y) ever changes.
 */
export function sampleTrack(track: ShuffleKeyframe[], t: number): { position: Vec3, rotation: Vec3 } {
  const first = track[0]
  if (!first) return { position: [0, 0, 0], rotation: [0, 0, 0] }
  if (t <= first.t) return { position: vec(first.position), rotation: vec(first.rotation) }
  const last = track[track.length - 1]!
  if (t >= last.t) return { position: vec(last.position), rotation: vec(last.rotation) }
  let low = 0
  let high = track.length - 1
  while (high - low > 1) {
    const mid = (low + high) >> 1
    if (track[mid]!.t <= t) low = mid
    else high = mid
  }
  const a = track[low]!
  const b = track[low + 1]!
  const span = b.t - a.t
  const u = span > 0 ? (t - a.t) / span : 1
  const eased = u * u * (3 - 2 * u)
  const mix = (from: readonly number[], to: readonly number[]): Vec3 =>
    [0, 1, 2].map(i => (from[i] ?? 0) + ((to[i] ?? 0) - (from[i] ?? 0)) * eased) as Vec3
  return { position: mix(a.position, b.position), rotation: mix(a.rotation, b.rotation) }
}

/** Collects keyframes; every Book gets one at every phase boundary. */
function createTimeline(start: Map<string, Node>) {
  const tracks = new Map<string, ShuffleKeyframe[]>()
  const state = new Map<string, Node>()
  let now = 0
  for (const [id, node] of start) {
    state.set(id, { position: vec(node.position), rotation: vec(node.rotation) })
    tracks.set(id, [{ t: 0, position: vec(node.position), rotation: vec(node.rotation) }])
  }
  return {
    tracks,
    state,
    now: () => now,
    phase(duration: number, moves: Map<string, Node>) {
      now += duration
      for (const [id, node] of moves) state.set(id, { position: vec(node.position), rotation: vec(node.rotation) })
      for (const [id, node] of state) tracks.get(id)!.push({ t: now, position: vec(node.position), rotation: vec(node.rotation) })
    },
  }
}

/** Indices of a longest increasing subsequence (patience sorting). */
function longestIncreasing(values: number[]): number[] {
  const tails: number[] = []
  const previous: number[] = values.map(() => -1)
  for (let i = 0; i < values.length; i++) {
    let low = 0
    let high = tails.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (values[tails[mid]!]! < values[i]!) low = mid + 1
      else high = mid
    }
    if (low > 0) previous[i] = tails[low - 1]!
    tails[low] = i
  }
  const result: number[] = []
  let index = tails.length > 0 ? tails[tails.length - 1]! : -1
  while (index >= 0) {
    result.push(index)
    index = previous[index]!
  }
  return result.reverse()
}

/** Pile heights, exactly as layoutStack accumulates them; a wider gap spreads it. */
function stackHeights(order: string[], thickness: Map<string, number>, gap = LAYER_GAP): Map<string, number> {
  const heights = new Map<string, number>()
  let y = 0
  for (const id of order) {
    const height = thickness.get(id) ?? 0
    heights.set(id, y + height / 2)
    y += height + gap
  }
  return heights
}

const pileTop = (poses: BookPose[]): number =>
  poses.reduce((top, pose) => Math.max(top, pose.y + pose.thickness / 2), 0)

/** Largest Book in each direction: length along the Spine's axis, depth, thickness. */
const extents = (poses: BookPose[]): { length: number, depth: number, thickness: number } => ({
  length: poses.reduce((max, pose) => Math.max(max, pose.height), 0),
  depth: poses.reduce((max, pose) => Math.max(max, pose.depth), 0),
  thickness: poses.reduce((max, pose) => Math.max(max, pose.thickness), 0),
})

/** Height at which a Book new to the view waits, clear of every given top. */
const parkHeight = (tops: number[], thickness: number): number =>
  tops.reduce((max, top) => Math.max(max, top), 0) + thickness / 2 + PARK_CLEARANCE

/** Each Book keeps the twist it lies with; a new Book uses its target twist. */
const twistMap = (fromById: Map<string, BookPose>, target: BookPose[]): Map<string, number> =>
  new Map(target.map(pose => [pose.bookId, (fromById.get(pose.bookId) ?? pose).rotation[1]]))

const staggerStep = (count: number): number =>
  count > 1 ? Math.min(MAX_STAGGER, STAGGER_BUDGET / (count - 1)) : 0

/**
 * Last phase: every Book is already at its final, disjoint height, so they may
 * all move in at once; a bottom-up stagger makes it cascade instead.
 */
function staggerIn(timeline: ReturnType<typeof createTimeline>, target: BookPose[], inSpan: number, step: number): ShufflePlan {
  const started = timeline.now()
  let duration = started
  target.forEach((pose, index) => {
    const track = timeline.tracks.get(pose.bookId)!
    const held = track[track.length - 1]!
    const delay = index * step
    if (delay > 0) track.push({ t: started + delay, position: vec(held.position), rotation: vec(held.rotation) })
    track.push({ t: started + delay + inSpan, ...poseNode(pose) })
    duration = Math.max(duration, started + delay + inSpan)
  })
  return { duration, tracks: timeline.tracks }
}

/**
 * Eased 0 to 1 progress for a ring turn, in steps no wider than maxStep. The
 * sampler lerps positions, so each step is a chord: with small steps the ring
 * only ever shrinks a little, instead of books cutting across the circle.
 */
function turnProgress(sweep: number, maxStep: number): number[] {
  // Smoothstep is steepest in the middle, where it advances 1.5 times the average.
  const steps = Math.max(1, Math.ceil((1.5 * Math.abs(sweep)) / maxStep))
  return Array.from({ length: steps }, (_, index) => {
    const u = (index + 1) / steps
    return u * u * (3 - 2 * u)
  })
}

/**
 * Worst radius factor the chords of a turn pass through. Halfway along a step
 * of angle d every Book sits at radius cos(d/2) with its angle kept, so the
 * whole ring is simply a smaller ring: build the slots for that one.
 */
function turnShrink(sweep: number, progress: number[]): number {
  let widest = 0
  let previous = 0
  for (const u of progress) {
    widest = Math.max(widest, Math.abs(sweep) * (u - previous))
    previous = u
  }
  return Math.cos(widest / 2)
}

/** Phase lengths, squeezed so even a long plan stays near TARGET_TOTAL seconds. */
function phaseScale(raw: number): number {
  return raw > TARGET_TOTAL ? TARGET_TOTAL / raw : 1
}

function planHand(fromById: Map<string, BookPose>, to: BookPose[], speed: number): ShufflePlan {
  const target = [...to].sort((a, b) => a.y - b.y)
  const byId = new Map(target.map(pose => [pose.bookId, pose]))
  const thickness = new Map(target.map(pose => [pose.bookId, pose.thickness]))
  const rank = new Map(target.map((pose, index) => [pose.bookId, index]))
  const rankOf = (id: string) => rank.get(id) ?? 0

  // Books already in the pile, bottom to top as they lie now.
  let pile = target
    .filter(pose => fromById.has(pose.bookId))
    .map(pose => pose.bookId)
    .sort((a, b) => fromById.get(a)!.y - fromById.get(b)!.y)
  // The longest run already in the right relative order stays put; the rest move.
  const settled = new Set<string>()
  for (const index of longestIncreasing(pile.map(rankOf))) settled.add(pile[index]!)
  const movers = target.map(pose => pose.bookId).filter(id => !settled.has(id))

  const batches: string[][] = []
  for (let i = 0; i < movers.length; i += BATCH_SIZE) batches.push(movers.slice(i, i + BATCH_SIZE))
  const lane = new Map<string, Lane>()
  const parked = new Map<string, number>()
  batches.forEach((batch, index) => batch.forEach((id, slot) => {
    lane.set(id, LANES[slot]!)
    parked.set(id, index)
  }))

  const maxLength = target.reduce((max, pose) => Math.max(max, pose.height), 0)
  const maxDepth = target.reduce((max, pose) => Math.max(max, pose.depth), 0)
  const maxThickness = target.reduce((max, pose) => Math.max(max, pose.thickness), 0)
  const laneX = maxLength + LANE_CLEARANCE
  const laneZ = maxDepth + LANE_CLEARANCE
  const lanePoint = (which: Lane, x: number, y: number, z: number): Vec3 => {
    if (which === 'front') return [x, y, laneZ]
    if (which === 'back') return [x, y, -laneZ]
    if (which === 'left') return [-laneX, y, z]
    return [laneX, y, z]
  }
  // New Books wait high in their lane, above the pile and above every Book that
  // shares the lane later, so nothing passes through them.
  const parkStep = maxThickness + 0.01
  const parkBase = Math.max(pileTop([...fromById.values()]), pileTop(target)) + maxThickness / 2 + PARK_CLEARANCE

  const start = new Map<string, Node>()
  for (const pose of target) {
    const old = fromById.get(pose.bookId)
    if (old) start.set(pose.bookId, poseNode(old))
    else {
      const which = lane.get(pose.bookId) ?? 'front'
      const y = parkBase + (parked.get(pose.bookId) ?? 0) * parkStep
      start.set(pose.bookId, { position: lanePoint(which, 0, y, 0), rotation: vec(pose.rotation) })
    }
  }

  const timeline = createTimeline(start)
  const raw = batches.length * (HAND_PULL + HAND_RESTACK + HAND_SLIDE) + HAND_SETTLE
  const scale = phaseScale(raw)
  const span = (base: number) => Math.max(MIN_PHASE, base * scale) / speed

  for (const batch of batches) {
    const inBatch = new Set(batch)

    // 1. Pull out: slide to the lane at constant height; the pile holds still.
    const pull = new Map<string, Node>()
    for (const id of batch) {
      if (!pile.includes(id)) continue
      const node = timeline.state.get(id)!
      pull.set(id, { position: lanePoint(lane.get(id)!, node.position[0], node.position[1], node.position[2]), rotation: node.rotation })
    }
    timeline.phase(span(HAND_PULL), pull)
    pile = pile.filter(id => !inBatch.has(id))

    // 2. Re-stack: the pile keeps its order and opens a gap for each batch Book
    //    directly above its predecessor among the Books already in place.
    const next: string[] = []
    const slots = batch.map(id => insertionSlot(pile, settled, rankOf, rankOf(id)))
    for (let i = 0; i <= pile.length; i++) {
      batch.forEach((id, index) => {
        if (slots[index] === i) next.push(id)
      })
      if (i < pile.length) next.push(pile[i]!)
    }
    const heights = stackHeights(next, thickness)
    const restack = new Map<string, Node>()
    for (const id of next) {
      const node = timeline.state.get(id)!
      restack.set(id, { position: [node.position[0], heights.get(id)!, node.position[2]], rotation: node.rotation })
    }
    timeline.phase(span(HAND_RESTACK), restack)

    // 3. Slide in: horizontally into the waiting gap.
    const slide = new Map<string, Node>()
    for (const id of batch) {
      const node = timeline.state.get(id)!
      const pose = byId.get(id)!
      slide.set(id, { position: [pose.x, node.position[1], pose.z], rotation: node.rotation })
    }
    timeline.phase(span(HAND_SLIDE), slide)
    pile = next
    for (const id of batch) settled.add(id)
  }

  // The order is final now, so the last correction is safe for everyone at once.
  timeline.phase(span(HAND_SETTLE), new Map(target.map(pose => [pose.bookId, poseNode(pose)])))
  return { duration: timeline.now(), tracks: timeline.tracks }
}

/** Where a mover belongs: straight above the last settled Book below it. */
function insertionSlot(pile: string[], settled: Set<string>, rankOf: (id: string) => number, rank: number): number {
  let slot = 0
  for (let i = 0; i < pile.length; i++) {
    if (settled.has(pile[i]!) && rankOf(pile[i]!) < rank) slot = i + 1
  }
  return slot
}

interface RingSlot {
  radius: number
  angle: number
}

interface RingOptions {
  /** Smallest radius factor the ring passes through while it turns. */
  shrink?: number
  /** Sideways room between neighbours. */
  clearance?: number
}

/**
 * Slots on a ring around the pile, spread evenly from the front (angle 0).
 * A lap only takes as many Books as fit side by side; the rest go a lap out.
 * The slots stay disjoint at every radius from shrink to 1, because scaling a
 * ring up only ever widens the gaps between its slots. Slots never reach the
 * pile's own column either: their inner edge sits a full depth/2 + 5 cm beyond
 * a lying Book's half length.
 */
function ringSlots(count: number, length: number, depth: number, options: RingOptions = {}): RingSlot[] {
  const shrink = options.shrink ?? 1
  const clearance = options.clearance ?? RING_CLEARANCE
  const slots: RingSlot[] = []
  let radius = (length / 2 + depth + 0.05) / shrink
  while (slots.length < count) {
    const inner = Math.max(radius * shrink - depth / 2, 0.01)
    const minAngle = 2 * Math.atan2(length / 2 + clearance, inner)
    const capacity = Math.max(1, Math.floor((2 * Math.PI) / minAngle))
    const take = Math.min(capacity, count - slots.length)
    const step = (2 * Math.PI) / take
    for (let i = 0; i < take; i++) slots.push({ radius, angle: i * step })
    radius += (depth + RING_LAP_GAP) / shrink
  }
  return slots
}

/** A Book in a ring slot: the Spine faces outwards, so it lies along the ring. */
const ringNode = (slot: RingSlot, y: number, twist: number): Node => ({
  position: [slot.radius * Math.sin(slot.angle), y, slot.radius * Math.cos(slot.angle)],
  rotation: [0, twist + slot.angle, Math.PI / 2],
})

/** The same slot, turned by angle; used while a ring turns as a whole. */
const turned = (slot: RingSlot, angle: number): RingSlot => ({ radius: slot.radius, angle: slot.angle + angle })

function planCarousel(fromById: Map<string, BookPose>, to: BookPose[], speed: number): ShufflePlan {
  const target = [...to].sort((a, b) => a.y - b.y)
  const { length, depth, thickness } = extents(target)
  const slots = ringSlots(target.length, length, depth)
  const parkY = parkHeight([pileTop([...fromById.values()]), pileTop(target)], thickness)
  const twist = twistMap(fromById, target)
  const twistOf = (pose: BookPose) => twist.get(pose.bookId)!

  const start = new Map<string, Node>()
  target.forEach((pose, index) => {
    const old = fromById.get(pose.bookId)
    // New Books wait in their own slot above everything until the lift.
    start.set(pose.bookId, old ? poseNode(old) : ringNode(slots[index]!, parkY, twistOf(pose)))
  })

  const timeline = createTimeline(start)
  const stagger = staggerStep(target.length)
  const raw = CAROUSEL_OUT + CAROUSEL_LIFT + CAROUSEL_IN + stagger * (target.length - 1)
  const scale = phaseScale(raw)
  const span = (base: number) => Math.max(MIN_PHASE, base * scale) / speed

  // 1. Out: radially to the ring at the current height (heights are disjoint).
  const out = new Map<string, Node>()
  target.forEach((pose, index) => {
    out.set(pose.bookId, ringNode(slots[index]!, timeline.state.get(pose.bookId)!.position[1], twistOf(pose)))
  })
  timeline.phase(span(CAROUSEL_OUT), out)

  // 2. Lift: to the final height, each Book inside its own slot.
  const lift = new Map<string, Node>()
  target.forEach((pose, index) => lift.set(pose.bookId, ringNode(slots[index]!, pose.y, twistOf(pose))))
  timeline.phase(span(CAROUSEL_LIFT), lift)

  // 3. In: everyone is at a final, disjoint height, so they may come back at
  //    once; a bottom-up stagger makes it cascade.
  return staggerIn(timeline, target, span(CAROUSEL_IN), (stagger * scale) / speed)
}

/** Slot per Book: the pile keeps its bottom-to-top order, new Books follow it. */
function slotOrder(fromById: Map<string, BookPose>, target: BookPose[]): { present: string[], slotOf: Map<string, number> } {
  const present = target
    .filter(pose => fromById.has(pose.bookId))
    .map(pose => pose.bookId)
    .sort((a, b) => fromById.get(a)!.y - fromById.get(b)!.y)
  const slotOf = new Map<string, number>(present.map((id, index) => [id, index]))
  let next = present.length
  for (const pose of target) {
    if (!slotOf.has(pose.bookId)) slotOf.set(pose.bookId, next++)
  }
  return { present, slotOf }
}

/** Height part way through a lift; the last step lands exactly on the target. */
const liftY = (from: number, to: number, u: number): number => (u >= 1 ? to : from + (to - from) * u)

/**
 * Spin: a Carousel whose ring turns as a whole while the Books change height.
 * Turning is cut into small eased steps, because the sampler lerps positions
 * and a wide step would chord straight through the neighbouring slots.
 */
function planSpin(fromById: Map<string, BookPose>, to: BookPose[], speed: number): ShufflePlan {
  const target = [...to].sort((a, b) => a.y - b.y)
  const { length, depth, thickness } = extents(target)
  const progress = turnProgress(SPIN_SWEEP, TURN_MAX_STEP)
  const slots = ringSlots(target.length, length, depth, {
    shrink: turnShrink(SPIN_SWEEP, progress),
    clearance: RING_CLEARANCE + RING_TURN_MARGIN,
  })
  const parkY = parkHeight([pileTop([...fromById.values()]), pileTop(target)], thickness)
  const twist = twistMap(fromById, target)

  const start = new Map<string, Node>()
  target.forEach((pose, index) => {
    const old = fromById.get(pose.bookId)
    // New Books wait in their own slot above everything until the turn.
    start.set(pose.bookId, old ? poseNode(old) : ringNode(slots[index]!, parkY, twist.get(pose.bookId)!))
  })

  const timeline = createTimeline(start)
  const stagger = staggerStep(target.length)
  const raw = SPIN_OUT + SPIN_TURN + SPIN_IN + stagger * (target.length - 1)
  const scale = phaseScale(raw)
  const span = (base: number) => Math.max(MIN_PHASE, base * scale) / speed

  // 1. Out: radially to the ring at the current height (heights are disjoint).
  const out = new Map<string, Node>()
  target.forEach((pose, index) => {
    out.set(pose.bookId, ringNode(slots[index]!, timeline.state.get(pose.bookId)!.position[1], twist.get(pose.bookId)!))
  })
  timeline.phase(span(SPIN_OUT), out)

  // 2. Turn: the ring revolves while each Book rises or sinks inside its own
  //    slot. The slots stay disjoint at every radius the chords pass through,
  //    so the heights may cross each other freely.
  const held = new Map(target.map(pose => [pose.bookId, timeline.state.get(pose.bookId)!.position[1]]))
  const stepSpan = span(SPIN_TURN) / progress.length
  for (const u of progress) {
    const moves = new Map<string, Node>()
    target.forEach((pose, index) => {
      const y = liftY(held.get(pose.bookId)!, pose.y, u)
      moves.set(pose.bookId, ringNode(turned(slots[index]!, SPIN_SWEEP * u), y, twist.get(pose.bookId)!))
    })
    timeline.phase(stepSpan, moves)
  }

  // 3. In: every height is final and disjoint, so the Books may slide in and
  //    unwind the whole spin at once, cascading from the bottom.
  return staggerIn(timeline, target, span(SPIN_IN), (stagger * scale) / speed)
}

/**
 * Helix: the pile stretches into a spiral staircase, the staircase turns while
 * the Books swap steps, then the column collapses back into a pile.
 */
function planHelix(fromById: Map<string, BookPose>, to: BookPose[], speed: number): ShufflePlan {
  const target = [...to].sort((a, b) => a.y - b.y)
  const { length, depth, thickness } = extents(target)
  const progress = turnProgress(HELIX_SWEEP, TURN_MAX_STEP)
  const slots = ringSlots(target.length, length, depth, {
    shrink: turnShrink(HELIX_SWEEP, progress),
    clearance: RING_CLEARANCE + RING_TURN_MARGIN,
  })
  const twist = twistMap(fromById, target)
  const { present, slotOf } = slotOrder(fromById, target)
  const slotFor = (id: string) => slots[slotOf.get(id)!]!

  // Two spread-out columns: the pile's own order on the way up, the new order
  // on the way down. Both leave a clear step between any two Books, so a column
  // phase only has to keep its order to stay safe.
  const thicknessById = new Map(target.map(pose => [pose.bookId, pose.thickness]))
  const spread = stackHeights(present, thicknessById, SPREAD_GAP)
  const steps = stackHeights(target.map(pose => pose.bookId), thicknessById, SPREAD_GAP)
  const columnTop = [...spread.values(), ...steps.values()].reduce((max, y) => Math.max(max, y), 0) + thickness / 2
  const parkY = parkHeight([pileTop([...fromById.values()]), pileTop(target), columnTop], thickness)

  const start = new Map<string, Node>()
  for (const pose of target) {
    const old = fromById.get(pose.bookId)
    // New Books wait in their own slot, clear of the whole staircase.
    start.set(pose.bookId, old ? poseNode(old) : ringNode(slotFor(pose.bookId), parkY, twist.get(pose.bookId)!))
  }

  const timeline = createTimeline(start)
  const raw = HELIX_SPREAD + HELIX_SWING + HELIX_TURN + HELIX_IN + HELIX_COLLAPSE
  const scale = phaseScale(raw)
  const span = (base: number) => Math.max(MIN_PHASE, base * scale) / speed

  // 1. Spread: the pile stretches upwards, keeping its order, until every Book
  //    stands on a step of its own.
  const stretch = new Map<string, Node>()
  for (const id of present) {
    const node = timeline.state.get(id)!
    stretch.set(id, { position: [node.position[0], spread.get(id)!, node.position[2]], rotation: node.rotation })
  }
  timeline.phase(span(HELIX_SPREAD), stretch)

  // 2. Swing out: the heights hold still and are disjoint, so any path is safe;
  //    trailing the slot halfway out reads as a swing rather than a slide.
  const swingSpan = span(HELIX_SWING)
  const swing = new Map<string, Node>()
  for (const id of present) {
    const slot = slotFor(id)
    const halfway = { radius: slot.radius * SWING_RADIUS, angle: slot.angle - SWING_LEAD }
    swing.set(id, ringNode(halfway, timeline.state.get(id)!.position[1], twist.get(id)!))
  }
  timeline.phase(swingSpan * 0.45, swing)
  const arrive = new Map<string, Node>()
  for (const id of present) arrive.set(id, ringNode(slotFor(id), timeline.state.get(id)!.position[1], twist.get(id)!))
  timeline.phase(swingSpan * 0.55, arrive)

  // 3. Turn: the staircase revolves while every Book climbs to the step its new
  //    rank asks for; the slots keep the footprints apart while they cross.
  const held = new Map(target.map(pose => [pose.bookId, timeline.state.get(pose.bookId)!.position[1]]))
  const stepSpan = span(HELIX_TURN) / progress.length
  for (const u of progress) {
    const moves = new Map<string, Node>()
    for (const pose of target) {
      const y = liftY(held.get(pose.bookId)!, steps.get(pose.bookId)!, u)
      moves.set(pose.bookId, ringNode(turned(slotFor(pose.bookId), HELIX_SWEEP * u), y, twist.get(pose.bookId)!))
    }
    timeline.phase(stepSpan, moves)
  }

  // 4. In: the steps are already in the new order, so the Books come back to
  //    the column together, at the height they will keep.
  const back = new Map<string, Node>()
  for (const pose of target) {
    back.set(pose.bookId, { position: [pose.x, steps.get(pose.bookId)!, pose.z], rotation: vec(pose.rotation) })
  }
  timeline.phase(span(HELIX_IN), back)

  // 5. Collapse: the column sinks into the pile, order preserved.
  timeline.phase(span(HELIX_COLLAPSE), new Map(target.map(pose => [pose.bookId, poseNode(pose)])))
  return { duration: timeline.now(), tracks: timeline.tracks }
}

/**
 * Fan: the pile opens like a hand of cards about a pivot off one end, glides
 * out to the ring to swap heights, then closes back into a fan and a pile.
 * Every move but the one in the ring happens at unchanged, disjoint heights.
 */
function planFan(fromById: Map<string, BookPose>, to: BookPose[], speed: number): ShufflePlan {
  const target = [...to].sort((a, b) => a.y - b.y)
  const { length, depth, thickness } = extents(target)
  const slots = ringSlots(target.length, length, depth)
  const twist = twistMap(fromById, target)
  const { present, slotOf } = slotOrder(fromById, target)
  const slotFor = (id: string) => slots[slotOf.get(id)!]!
  const parkY = parkHeight([pileTop([...fromById.values()]), pileTop(target)], thickness)

  // A lying Book runs along x, so the pivot sits just off one end of the pile.
  const pivot = length / 2
  const fanStep = Math.min(FAN_STEP, FAN_SWEEP / Math.max(1, target.length - 1))
  /** Rigid turn about the shared vertical pivot: position and twist together. */
  const fanned = (node: Node, angle: number): Node => {
    const dx = node.position[0] - pivot
    const dz = node.position[2]
    return {
      position: [
        pivot + dx * Math.cos(angle) + dz * Math.sin(angle),
        node.position[1],
        dz * Math.cos(angle) - dx * Math.sin(angle),
      ],
      rotation: [node.rotation[0], node.rotation[1] + angle, node.rotation[2]],
    }
  }

  const start = new Map<string, Node>()
  for (const pose of target) {
    const old = fromById.get(pose.bookId)
    // New Books wait in their own slot above everything until the lift.
    start.set(pose.bookId, old ? poseNode(old) : ringNode(slotFor(pose.bookId), parkY, twist.get(pose.bookId)!))
  }

  const timeline = createTimeline(start)
  const stagger = staggerStep(target.length)
  const raw = FAN_OPEN + FAN_OUT + FAN_LIFT + FAN_BACK + FAN_CLOSE + stagger * (target.length - 1)
  const scale = phaseScale(raw)
  const span = (base: number) => Math.max(MIN_PHASE, base * scale) / speed

  // 1. Open: each Book swings further round the pivot than the one below it,
  //    all at their resting heights, which are disjoint.
  const open = new Map<string, Node>()
  present.forEach((id, index) => open.set(id, fanned(timeline.state.get(id)!, fanStep * index)))
  timeline.phase(span(FAN_OPEN), open)

  // 2. Out: from the fan to the ring, still without touching a height.
  const out = new Map<string, Node>()
  for (const id of present) out.set(id, ringNode(slotFor(id), timeline.state.get(id)!.position[1], twist.get(id)!))
  timeline.phase(span(FAN_OUT), out)

  // 3. Lift: to the final height, each Book inside its own slot.
  const lift = new Map<string, Node>()
  for (const pose of target) lift.set(pose.bookId, ringNode(slotFor(pose.bookId), pose.y, twist.get(pose.bookId)!))
  timeline.phase(span(FAN_LIFT), lift)

  // 4. Back: into the fan again, now in the new order and at final heights.
  const fan = new Map<string, Node>()
  target.forEach((pose, rank) => fan.set(pose.bookId, fanned(poseNode(pose), fanStep * rank)))
  timeline.phase(span(FAN_BACK), fan)

  // 5. Close: the fan folds shut on the pile, bottom Book first.
  return staggerIn(timeline, target, span(FAN_CLOSE), (stagger * scale) / speed)
}
