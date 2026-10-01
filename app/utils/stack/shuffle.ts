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
// the footprints are laterally disjoint (a cell or a lane of its own), or while
// the Books share a column and keep their order. A tilt out of the flat is the
// one move that breaks the invariant quietly: it raises a Book's vertical
// extent from thickness to thickness*cos(theta) + height*sin(theta), so it is
// only allowed where the gap covers that growth. No Style tilts a Book today -
// every rotation below is about the vertical axis alone.
//
// One trap follows from the per-segment smoothstep in sampleTrack: positions
// interpolate component-wise, so a curved path is not a curve, it is a set of
// chords that cut inside it. Every move the fancy Styles make is therefore a
// straight line between two keyframes, and a Book that has to go round
// something gets its own keyframe at each corner.
//
// Those three Styles also share one opening, the float: the pile spreads
// straight up, keeping its order, until every Book has a comfortable gap of air
// around it. From there each of them continues differently.
import type { BookPose } from '../books/pose'

export type ShuffleStyle = 'hand' | 'constellation' | 'rain' | 'deal'

/** Every Style, for the view settings UI. */
export const SHUFFLE_STYLES: { value: ShuffleStyle, title: string, text: string }[] = [
  { value: 'hand', title: 'Hand', text: 'Pulls a handful of Books out to the side and slides them back into the pile.' },
  { value: 'constellation', title: 'Constellation', text: 'The pile floats apart, drifts into a slow cloud around itself and gathers again in the new order.' },
  { value: 'rain', title: 'Rain', text: 'The floating Books climb above the pile and fall back into it one by one, bottom Book first.' },
  { value: 'deal', title: 'Deal', text: 'The floating pile turns into a deck and deals itself down into the new order, card by card.' },
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
const MIN_PHASE = 0.15
/** Plans longer than this get their phases squeezed. */
const TARGET_TOTAL = 6
/** Headroom above everything, where Books new to the view wait. */
const PARK_CLEARANCE = 0.02

// Fancy Styles: the float they share, the cells they use, and their phases.

/** Air between two floating Books, and the spread a whole pile aims for. */
const FLOAT_GAP_MAX = 0.045
const FLOAT_GAP_MIN = 0.02
const FLOAT_SPREAD = 0.45
/** The float's little breath: a share of the gap, so the heights stay disjoint. */
const BOB_SHARE = 0.3
const BOB_MAX = 0.012
const FLOAT_RISE = 0.6
const FLOAT_BOB = 0.26
/** Room around a cell, and between the innermost cells and the pile's column. */
const CELL_GAP = 0.05
/** Seconds a fancy plan aims for, and how far a big pile may stretch that. */
const FANCY_TOTAL = 3.2
const FANCY_FREE = 12
const FANCY_PER_BOOK = 0.05
const FANCY_MAX_TOTAL = 4.6
const SKY_OUT = 0.5
const SKY_SORT = 0.55
const SKY_DRIFT = 0.35
const SKY_IN = 0.5
const SKY_SETTLE = 0.45
/** How far a weightless Book turns about the vertical while it drifts. */
const SKY_TURN = 0.3
const RAIN_OUT = 0.45
const RAIN_RISE = 0.5
const RAIN_FLY = 0.22
const RAIN_DROP = 0.26
const RAIN_SETTLE = 0.14
/** How high a falling Book stops before it eases down the last bit. */
const RAIN_HOP = 0.012
/** Room between the cloud and the top of the final pile. */
const CLOUD_CLEARANCE = 0.05
const DEAL_JOIN = 0.4
const DEAL_LIFT = 0.6
/** One pipelined step: a Book leaves the deck, one falls, one lands. */
const DEAL_STEP = 0.3
const DEAL_CLOSE = 0.25
/** How many Books the deck deals before it closes the gaps they left. */
const DEAL_SETTLE_EVERY = 3
/** Room between the deck's lowest Book and the top of the final pile. */
const DECK_CLEARANCE = 0.05
/** The deck is tighter than the float: a Book only ever leaves it sideways. */
const DECK_GAP = 0.012

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
  if (style === 'constellation') return planConstellation(fromById, to, speed)
  if (style === 'rain') return planRain(fromById, to, speed)
  if (style === 'deal') return planDeal(fromById, to, speed)
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

// --------------------------------------------------------------- fancy Styles

/** A disc beside the pile, wide enough for one Book at any twist. */
interface Cell {
  x: number
  z: number
}

interface FancyStage {
  /** Final poses, bottom to top; this is also the order the Books are dealt in. */
  target: BookPose[]
  byId: Map<string, BookPose>
  thickness: Map<string, number>
  /** Books already in the pile, bottom to top as they lie now. */
  present: string[]
  /** Books new to the view, in the final order. */
  arrivals: string[]
  /** Air between two floating Books. */
  gap: number
  /** Floating heights of the pile as it lies, and of the new order. */
  float: Map<string, number>
  sorted: Map<string, number>
  /** The Book's own cell; no other Book ever enters it. */
  cellOf: (id: string) => Cell
  cellRadius: number
  columnRadius: number
  /** Top of the floating column, top of the final pile, fattest Book. */
  floatTop: number
  finalTop: number
  maxThickness: number
}

/**
 * Air between two floating Books: a small pile gets the full 4.5 cm, a big one
 * tapers towards 2 cm so forty Books do not stretch into a tower.
 */
function floatGap(count: number): number {
  return Math.min(FLOAT_GAP_MAX, Math.max(FLOAT_GAP_MIN, FLOAT_SPREAD / Math.max(1, count)))
}

/**
 * Cells around the pile, filled ring by ring from the inside out. Each cell is
 * a disc that holds its Book whatever it does inside it, so a Book may change
 * height, turn and hover in its cell no matter what the others are doing.
 *
 * Three things are kept clear: cells never overlap each other, no cell reaches
 * the pile's own column, and the straight line from a cell inwards to the
 * column passes no occupied cell on its own ring (its closest approach to a
 * neighbour on the same ring is radius * sin(step)) nor any cell further out.
 */
function cellLayout(count: number, cellRadius: number, columnRadius: number): Cell[] {
  const need = 2 * cellRadius + CELL_GAP
  const cells: Cell[] = []
  let radius = columnRadius + cellRadius + CELL_GAP
  while (cells.length < count) {
    let capacity = 1
    while (capacity < 64) {
      const step = (2 * Math.PI) / (capacity + 1)
      const chord = 2 * radius * Math.sin(step / 2)
      const passing = step < Math.PI / 2 ? radius * Math.sin(step) : radius
      if (chord < need || passing < need) break
      capacity++
    }
    const take = Math.min(capacity, count - cells.length)
    const step = (2 * Math.PI) / take
    for (let i = 0; i < take; i++) cells.push({ x: radius * Math.sin(i * step), z: radius * Math.cos(i * step) })
    radius += need
  }
  return cells
}

/** Everything the three fancy Styles work out before they move a single Book. */
function fancyStage(fromById: Map<string, BookPose>, to: BookPose[]): FancyStage {
  const target = [...to].sort((a, b) => a.y - b.y)
  const thickness = new Map(target.map(pose => [pose.bookId, pose.thickness]))
  const present = target
    .filter(pose => fromById.has(pose.bookId))
    .map(pose => pose.bookId)
    .sort((a, b) => fromById.get(a)!.y - fromById.get(b)!.y)
  const arrivals = target.filter(pose => !fromById.has(pose.bookId)).map(pose => pose.bookId)
  const gap = floatGap(target.length)
  const float = stackHeights(present, thickness, gap)
  const { length, depth, thickness: maxThickness } = extents(target)
  // A lying Book turning about the vertical sweeps a disc of its half diagonal.
  const half = Math.hypot(length, depth) / 2
  const offset = [...fromById.values(), ...target].reduce((max, pose) => Math.max(max, Math.hypot(pose.x, pose.z)), 0)
  const cellRadius = half + CELL_GAP / 2
  const columnRadius = offset + half + CELL_GAP / 2
  const cells = cellLayout(target.length, cellRadius, columnRadius)
  const index = new Map(target.map((pose, rank) => [pose.bookId, rank]))
  const floatTop = present.reduce((max, id) => Math.max(max, float.get(id)! + thickness.get(id)! / 2), 0)
  return {
    target,
    byId: new Map(target.map(pose => [pose.bookId, pose])),
    thickness,
    present,
    arrivals,
    gap,
    float,
    sorted: stackHeights(target.map(pose => pose.bookId), thickness, gap),
    cellOf: id => cells[index.get(id)!]!,
    cellRadius,
    columnRadius,
    floatTop,
    finalTop: pileTop(target),
    maxThickness,
  }
}

/**
 * Phase lengths for a fancy Style: about three seconds, a little more for a big
 * pile, and never longer than FANCY_MAX_TOTAL. Everything is one single factor,
 * so speed scales the whole plan exactly.
 */
function fancySpan(raw: number, count: number, speed: number): (base: number) => number {
  const total = Math.min(FANCY_MAX_TOTAL, FANCY_TOTAL + Math.max(0, count - FANCY_FREE) * FANCY_PER_BOOK)
  const scale = raw > total ? total / raw : 1
  return (base: number) => (base * scale) / speed
}

/**
 * The opening all three fancy Styles share: the pile spreads straight up until
 * every Book floats in air of its own, then breathes once. The spread keeps the
 * pile's order and only moves Books vertically inside their shared column, and
 * the bob shifts every Book by at most a third of the gap, so the heights stay
 * mutually disjoint from the first frame to the last.
 */
function floatOpening(timeline: ReturnType<typeof createTimeline>, stage: FancyStage, span: (base: number) => number): void {
  const column = new Map<string, Node>()
  for (const id of stage.present) {
    const node = timeline.state.get(id)!
    column.set(id, { position: [node.position[0], stage.float.get(id)!, node.position[2]], rotation: node.rotation })
  }
  timeline.phase(span(FLOAT_RISE), column)

  const amplitude = Math.min(BOB_MAX, stage.gap * BOB_SHARE)
  const bob = new Map<string, Node>()
  stage.present.forEach((id, rank) => {
    const node = timeline.state.get(id)!
    const lift = stage.float.get(id)! + amplitude * Math.sin(rank * 1.9)
    bob.set(id, { position: [node.position[0], lift, node.position[2]], rotation: node.rotation })
  })
  timeline.phase(span(FLOAT_BOB), bob)
  timeline.phase(span(FLOAT_BOB), column)
}

/**
 * Constellation: the floating pile drifts apart into a loose cloud, every Book
 * in a cell of its own, turns over its new height there and gathers back into
 * the column in the new order before it settles.
 */
function planConstellation(fromById: Map<string, BookPose>, to: BookPose[], speed: number): ShufflePlan {
  const stage = fancyStage(fromById, to)
  const drift = (rank: number, phase: number) => SKY_TURN * Math.sin(rank * 2.3 + phase)
  const cloudTop = stage.target.reduce((max, pose) => Math.max(max, stage.sorted.get(pose.bookId)! + pose.thickness / 2), 0)
  const parkY = parkHeight([stage.floatTop, cloudTop, pileTop([...fromById.values()])], stage.maxThickness)

  const start = new Map<string, Node>()
  for (const pose of stage.target) {
    const old = fromById.get(pose.bookId)
    const cell = stage.cellOf(pose.bookId)
    // A Book new to the view waits in its cell, above the whole cloud, so the
    // Books drifting out to their own cells pass underneath it.
    start.set(pose.bookId, old ? poseNode(old) : { position: [cell.x, parkY, cell.z], rotation: vec(pose.rotation) })
  }

  const timeline = createTimeline(start)
  const raw = FLOAT_RISE + 2 * FLOAT_BOB + SKY_OUT + SKY_SORT + SKY_DRIFT + SKY_IN + SKY_SETTLE
  const span = fancySpan(raw, stage.target.length, speed)
  floatOpening(timeline, stage, span)

  // 1. Out: every Book glides into its cell at the height it floats at. The
  //    heights are mutually disjoint, so the paths may cross as they like, and
  //    a turn about the vertical costs nothing either.
  const out = new Map<string, Node>()
  stage.target.forEach((pose, rank) => {
    const node = timeline.state.get(pose.bookId)!
    const cell = stage.cellOf(pose.bookId)
    out.set(pose.bookId, {
      position: [cell.x, node.position[1], cell.z],
      rotation: [0, node.rotation[1] + drift(rank, 0), node.rotation[2]],
    })
  })
  timeline.phase(span(SKY_OUT), out)

  // 2. Sort: each Book changes to the height its new rank asks for, inside its
  //    own cell. The cells are laterally disjoint, so heights may cross freely.
  const sort = new Map<string, Node>()
  for (const pose of stage.target) {
    const node = timeline.state.get(pose.bookId)!
    sort.set(pose.bookId, { position: [node.position[0], stage.sorted.get(pose.bookId)!, node.position[2]], rotation: node.rotation })
  }
  timeline.phase(span(SKY_SORT), sort)

  // 3. Drift: a slow weightless turn, heights untouched.
  const turn = new Map<string, Node>()
  stage.target.forEach((pose, rank) => {
    const node = timeline.state.get(pose.bookId)!
    turn.set(pose.bookId, { position: node.position, rotation: [0, node.rotation[1] + drift(rank, 1.1), node.rotation[2]] })
  })
  timeline.phase(span(SKY_DRIFT), turn)

  // 4. In: back over the pile, still at the new order's floating heights and
  //    now with the final twist. Those heights are disjoint, so any path is safe.
  const back = new Map<string, Node>()
  for (const pose of stage.target) {
    back.set(pose.bookId, { position: [pose.x, stage.sorted.get(pose.bookId)!, pose.z], rotation: vec(pose.rotation) })
  }
  timeline.phase(span(SKY_IN), back)

  // 5. Settle: the column collapses into the pile, order preserved.
  timeline.phase(span(SKY_SETTLE), new Map(stage.target.map(pose => [pose.bookId, poseNode(pose)])))
  return { duration: timeline.now(), tracks: timeline.tracks }
}

/**
 * Rain: the floating Books step aside into their cells, climb above the final
 * pile and come down one at a time, bottom Book of the new pile first, each
 * landing softly in its slot.
 */
function planRain(fromById: Map<string, BookPose>, to: BookPose[], speed: number): ShufflePlan {
  const stage = fancyStage(fromById, to)
  const hop = Math.min(RAIN_HOP, stage.gap / 2)
  const cloudY = stage.finalTop + stage.maxThickness / 2 + hop + CLOUD_CLEARANCE
  const parkY = parkHeight([stage.floatTop, cloudY, pileTop([...fromById.values()])], stage.maxThickness)

  const start = new Map<string, Node>()
  for (const pose of stage.target) {
    const old = fromById.get(pose.bookId)
    const cell = stage.cellOf(pose.bookId)
    // A Book new to the view waits in its cell, above the whole cloud, so the
    // Books on their way out pass underneath it.
    start.set(pose.bookId, old ? poseNode(old) : { position: [cell.x, parkY, cell.z], rotation: vec(pose.rotation) })
  }

  const timeline = createTimeline(start)
  const count = stage.target.length
  const raw = FLOAT_RISE + 2 * FLOAT_BOB + RAIN_OUT + RAIN_RISE + count * (RAIN_FLY + RAIN_DROP) + RAIN_SETTLE
  const span = fancySpan(raw, count, speed)
  floatOpening(timeline, stage, span)

  // 1. Out: into the cells at the heights the Books float at, which are
  //    disjoint, and below every waiting newcomer.
  const out = new Map<string, Node>()
  for (const id of stage.present) {
    const node = timeline.state.get(id)!
    const cell = stage.cellOf(id)
    out.set(id, { position: [cell.x, node.position[1], cell.z], rotation: node.rotation })
  }
  timeline.phase(span(RAIN_OUT), out)

  // 2. Rise: every Book climbs, inside its own cell, to one shared height well
  //    above the final pile. Sharing a height is safe: the cells never overlap.
  const rise = new Map<string, Node>()
  for (const pose of stage.target) {
    const node = timeline.state.get(pose.bookId)!
    rise.set(pose.bookId, { position: [node.position[0], cloudY, node.position[2]], rotation: node.rotation })
  }
  timeline.phase(span(RAIN_RISE), rise)

  // 3. Rain: one Book at a time, bottom Book of the new pile first.
  //    The flight goes straight inwards at cloud height. Cells are handed out in
  //    exactly this order, filling the rings from the inside out, so everything
  //    the flight passes over - inner rings, earlier cells on its own ring - is
  //    already empty, and the cells still occupied are either further out or
  //    cleared by the ring's spacing. The column itself is empty above the Books
  //    that have landed, so the drop is free too. The Book before it touches
  //    down during the same phase, a clear gap below the cloud.
  stage.target.forEach((pose, rank) => {
    const landing = new Map<string, Node>()
    landing.set(pose.bookId, { position: [pose.x, cloudY, pose.z], rotation: vec(pose.rotation) })
    const previous = stage.target[rank - 1]
    if (previous) landing.set(previous.bookId, poseNode(previous))
    timeline.phase(span(RAIN_FLY), landing)
    const node = timeline.state.get(pose.bookId)!
    const drop = new Map<string, Node>([[pose.bookId, { position: [pose.x, pose.y + hop, pose.z], rotation: node.rotation }]])
    timeline.phase(span(RAIN_DROP), drop)
  })

  // 4. The last Book eases down the final millimetres on its own.
  const last = stage.target[count - 1]!
  timeline.phase(span(RAIN_SETTLE), new Map([[last.bookId, poseNode(last)]]))
  return { duration: timeline.now(), tracks: timeline.tracks }
}

/**
 * Deal: the floating pile lifts clear of the ground as a deck and deals itself
 * down into the new order, one Book at a time, bottom Book first, down the two
 * lanes beside the pile.
 */
function planDeal(fromById: Map<string, BookPose>, to: BookPose[], speed: number): ShufflePlan {
  const stage = fancyStage(fromById, to)
  const count = stage.target.length
  // Two lanes, left and right of the pile, each a cell's width clear of the
  // column and more than a cell's width clear of each other.
  const laneX = stage.columnRadius + stage.cellRadius + CELL_GAP
  const lanes: Cell[] = [{ x: -laneX, z: 0 }, { x: laneX, z: 0 }]
  const deckBase = stage.finalTop + DECK_CLEARANCE
  const parkStep = stage.maxThickness + PARK_CLEARANCE
  const parkBase = parkHeight([stage.floatTop, pileTop([...fromById.values()])], stage.maxThickness)

  const start = new Map<string, Node>()
  stage.arrivals.forEach((id, rank) => {
    const cell = stage.cellOf(id)
    // Newcomers wait outside the column, each at a height of its own, so they
    // can all cross to the deck at once without ever meeting.
    start.set(id, { position: [cell.x, parkBase + rank * parkStep, cell.z], rotation: vec(stage.byId.get(id)!.rotation) })
  })
  for (const id of stage.present) start.set(id, poseNode(fromById.get(id)!))

  const timeline = createTimeline(start)
  const settleEvery = Math.max(DEAL_SETTLE_EVERY, Math.ceil(count / 6))
  const settles = Math.floor(Math.max(0, count - 1) / settleEvery)
  const raw = FLOAT_RISE + 2 * FLOAT_BOB + (stage.arrivals.length > 0 ? DEAL_JOIN : 0)
    + DEAL_LIFT + (count + 2) * DEAL_STEP + settles * DEAL_CLOSE
  const span = fancySpan(raw, count, speed)
  floatOpening(timeline, stage, span)

  // 1. Join: the newcomers glide in over the column, each at its parking height.
  //    Those heights are disjoint and above the whole floating column, so every
  //    one of them may take the shortest way in at the same time.
  if (stage.arrivals.length > 0) {
    const join = new Map<string, Node>()
    for (const id of stage.arrivals) {
      const node = timeline.state.get(id)!
      const pose = stage.byId.get(id)!
      join.set(id, { position: [pose.x, node.position[1], pose.z], rotation: node.rotation })
    }
    timeline.phase(span(DEAL_JOIN), join)
  }

  // The deck, bottom to top: the pile as it lies, newcomers stacked on top.
  let deck = [...stage.present, ...stage.arrivals]
  const deckMove = (order: string[]): Map<string, Node> => {
    const heights = stackHeights(order, stage.thickness, DECK_GAP)
    return new Map(order.map((id) => {
      const node = timeline.state.get(id)!
      return [id, { position: [node.position[0], deckBase + heights.get(id)!, node.position[2]] as Vec3, rotation: node.rotation }]
    }))
  }

  // 2. Lift: the deck rises until its lowest Book clears the final pile, and
  //    tightens up on the way. A column move with the order kept, so it is safe.
  timeline.phase(span(DEAL_LIFT), deckMove(deck))

  // 3. Deal, three steps per Book and pipelined: while Book k slides out of the
  //    deck into its lane at its deck height, Book k-1 falls down the other lane
  //    to its final height, and Book k-2 slides out of Book k's lane into its
  //    slot. The lanes alternate, so the two Books in the air are always on
  //    opposite sides; the two that share a lane are the one still at deck
  //    height, above the whole final pile, and the one already down at its slot.
  const gone = new Set<string>()
  for (let tick = 0; tick < count + 2; tick++) {
    const moves = new Map<string, Node>()
    const leaving = stage.target[tick]
    if (leaving) {
      const node = timeline.state.get(leaving.bookId)!
      const lane = lanes[tick % 2]!
      moves.set(leaving.bookId, { position: [lane.x, node.position[1], lane.z], rotation: vec(leaving.rotation) })
    }
    const falling = stage.target[tick - 1]
    if (falling) {
      const node = timeline.state.get(falling.bookId)!
      moves.set(falling.bookId, { position: [node.position[0], falling.y, node.position[2]], rotation: node.rotation })
    }
    const landing = stage.target[tick - 2]
    if (landing) moves.set(landing.bookId, poseNode(landing))
    timeline.phase(span(DEAL_STEP), moves)

    if (!leaving) continue
    gone.add(leaving.bookId)
    // Now and then the deck closes the gaps the dealt Books left and glides
    // down, while the Books in the air hold still: again a column move with the
    // order kept, and the deck never comes below the final pile's top.
    if (tick > 0 && tick % settleEvery === 0) {
      deck = deck.filter(id => !gone.has(id))
      timeline.phase(span(DEAL_CLOSE), deckMove(deck))
    }
  }
  return { duration: timeline.now(), tracks: timeline.tracks }
}
