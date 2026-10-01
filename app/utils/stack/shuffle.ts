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
// the footprints are laterally disjoint (ring slots), or while the Books share
// a column and keep their order.
//
// Books new to the view and Books leaving it follow one more rule: a Book that
// is not shown cannot collide. A new Book waits unseen at its own spot (its
// lane or ring slot, at about the height it will rest at, so new Books turn up
// scattered around the pile rather than all from one point) and appears there
// once nothing else can pass through that spot: straight away when the spot
// lies above the old pile, else once every other Book keeps to its own slot.
// A leaving Book slides out at its own height during the first phase, while
// every height is still disjoint, and has vanished before any height changes.
import type { BookPose } from '../books/pose'
import { hashString } from '../bookcase/layout'

export type ShuffleStyle = 'hand' | 'carousel'

/** How Books new to the view appear (leaving Books mirror it). */
export type EntranceStyle = 'fade' | 'pop' | 'drop'

/** Every entrance, for the dev choices panel. */
export const ENTRANCE_STYLES: { value: EntranceStyle, title: string, text: string }[] = [
  { value: 'fade', title: 'Scatter + fade', text: 'New Books fade in around the pile, close to where they belong, then join it. Leaving Books slide away and fade.' },
  { value: 'pop', title: 'Scatter + pop', text: 'New Books pop out of nowhere around the pile, then join it. Leaving Books slide away and shrink to nothing.' },
  { value: 'drop', title: 'Scatter + drop', text: 'New Books fade in a little above their spot and drop onto it, then join the pile. Leaving Books slide away and fade.' },
]

export interface ShuffleKeyframe {
  /** Seconds from the start of the plan. */
  t: number
  position: [number, number, number]
  /** Euler XYZ, radians; only the y component ever changes. */
  rotation: [number, number, number]
}

/** Seconds over which a Book appears or vanishes. */
export interface Presence {
  start: number
  end: number
}

export interface ShufflePlan {
  /** Seconds. */
  duration: number
  /** Book Id → keyframes, ascending in time. The last one is the target pose. */
  tracks: Map<string, ShuffleKeyframe[]>
  /** Books leaving the view → keyframes; they have vanished by the last one. */
  leaving: Map<string, ShuffleKeyframe[]>
  /** Books new to the view: unseen before `start`, fully there from `end`. */
  appear: Map<string, Presence>
  /** Leaving Books: fully there before `start`, gone from `end`. */
  vanish: Map<string, Presence>
}

/** World heights the camera shows, at the pile. */
export interface ShuffleView {
  bottom: number
  top: number
}

export interface ShuffleOptions {
  /** Playback rate; 2 plays the whole plan twice as fast. Default 1. */
  speed?: number
  /** How new Books appear; only 'drop' changes the tracks. Default 'fade'. */
  entrance?: EntranceStyle
  /** Heights in view: new Books headed for them appear near them. Default: the whole pile. */
  view?: ShuffleView
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
const MIN_PHASE = 0.15
/** Plans longer than this get their phases squeezed. */
const TARGET_TOTAL = 6
/** Sideways room between neighbouring ring slots. */
const RING_CLEARANCE = 0.012
/** Room between two laps of the ring. */
const RING_LAP_GAP = 0.05
const MAX_STAGGER = 0.04
const STAGGER_BUDGET = 0.5
/** A leaving Book's exit, when no first phase of the Style can carry it. */
const EXIT = 0.45
/** How far past its half length a leaving Book slides out, and how much it may twist. */
const EXIT_REACH = 0.16
const EXIT_TWIST = 0.5
/** How long a new Book takes to appear, and how far apart new Books may start. */
const APPEAR = 0.35
const APPEAR_SPREAD = 0.3
/** New Books appear this close above or below the height they will rest at. */
const APPEAR_JITTER = 0.04
/** How far above its spot a new Book appears with the 'drop' entrance. */
const DROP = 0.07

const vec = (value: readonly number[]): Vec3 => [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0]
const poseNode = (pose: BookPose): Node => ({ position: [pose.x, pose.y, pose.z], rotation: vec(pose.rotation) })
const samePose = (pose: BookPose, other: BookPose | undefined): boolean =>
  !!other && pose.x === other.x && pose.y === other.y && pose.z === other.z
  && pose.rotation.every((value, index) => value === other.rotation[index])

/** Deterministic 0 to 1 per Book, well mixed: Book Ids often differ in their last digit only. */
function scatter(bookId: string, salt: string): number {
  let hash = hashString(`${salt}:${bookId}`)
  hash = Math.imul(hash ^ (hash >>> 16), 0x85EBCA6B)
  hash = Math.imul(hash ^ (hash >>> 13), 0xC2B2AE35)
  return ((hash ^ (hash >>> 16)) >>> 0) / 0x1_0000_0000
}

/** What a Style needs to know about Books entering and leaving the view. */
interface Entrance {
  /** Height of a new Book's spot, where it appears (before any 'drop' lift). */
  spotY: (pose: BookPose) => number
  /** How far above its spot a new Book appears. */
  drop: number
  /** Whether any Book leaves; a Style then carries their exit in its first phase. */
  leaving: boolean
  /** Top of the pile as it lies now, leaving Books included. */
  oldTop: number
}

/** A new Book's spot sits wholly above the pile as it lies now. */
const aboveOldPile = (pose: BookPose, entrance: Entrance): boolean =>
  entrance.spotY(pose) - pose.thickness / 2 > entrance.oldTop + LAYER_GAP

/**
 * When a new Book may appear: from `start`, done by `end` (inside which its
 * spot is its own). `moveFrom` is when the Style first moves it; null leaves
 * its track as planned (it may already be moving when it appears).
 */
interface Window {
  start: number
  end: number
  moveFrom: number | null
}

/** A Style's plan for the Books in the target view, before entering and leaving are added. */
interface Staged {
  duration: number
  tracks: Map<string, ShuffleKeyframe[]>
  /** End of the phase in which leaving Books slide out and vanish. */
  exitEnd: number
  windows: Map<string, Window>
}

/**
 * Plans a collision-free move from the current poses to the target poses.
 * Books missing from `to` slide out and vanish; Books missing from `from`
 * appear around the pile and join it on the way.
 */
export function planShuffle(from: BookPose[], to: BookPose[], style: ShuffleStyle, options: ShuffleOptions = {}): ShufflePlan {
  const speed = options.speed && options.speed > 0 ? options.speed : 1
  const fromById = new Map(from.map(pose => [pose.bookId, pose]))
  const kept = new Set(to.map(pose => pose.bookId))
  const leaving = from.filter(pose => !kept.has(pose.bookId))
  const oldTop = pileTop(from)
  const band = options.view ?? { bottom: 0, top: Math.max(oldTop, pileTop(to)) }
  const entrance: Entrance = {
    spotY: pose => appearHeight(pose, band),
    drop: options.entrance === 'drop' ? DROP : 0,
    leaving: leaving.length > 0,
    oldTop,
  }

  if (to.length === 0 || to.every(pose => samePose(pose, fromById.get(pose.bookId)))) {
    // Nothing to re-sort: the pile holds still while any leaving Books go.
    const tracks = new Map(to.map(pose => [pose.bookId, [{ t: 0, ...poseNode(pose) }]]))
    const exitEnd = leaving.length > 0 ? EXIT / speed : 0
    return dress({ duration: exitEnd, tracks, exitEnd, windows: new Map() }, leaving, entrance, speed)
  }
  const plan = style === 'carousel'
    ? planCarousel(fromById, to, speed, entrance)
    : planHand(fromById, to, speed, entrance)
  return dress(plan, leaving, entrance, speed)
}

/**
 * Where a new Book appears: near the height it will rest at when that is in
 * view, so the new Books of a big change turn up scattered over the picture.
 * One headed out of view appears out of view, right at its height.
 */
function appearHeight(pose: BookPose, band: ShuffleView): number {
  if (pose.y < band.bottom || pose.y > band.top) return pose.y
  const jitter = (scatter(pose.bookId, 'appear-y') - 0.5) * 2 * APPEAR_JITTER
  return Math.min(Math.max(pose.y + jitter, band.bottom, pose.thickness / 2), Math.max(band.top, pose.thickness / 2))
}

/** How much of a Book is there at time t: 0 unseen, 1 fully there. */
export function presenceAt(plan: ShufflePlan, bookId: string, t: number): number {
  const appear = plan.appear.get(bookId)
  if (appear) {
    if (t <= appear.start) return 0
    if (t < appear.end) return (t - appear.start) / (appear.end - appear.start)
  }
  const vanish = plan.vanish.get(bookId)
  if (vanish) {
    if (t >= vanish.end) return 0
    if (t > vanish.start) return 1 - (t - vanish.start) / (vanish.end - vanish.start)
  }
  return 1
}

/**
 * Adds the leaving Books (each slides out its own way at its own height, then
 * vanishes) and times the new Books' appearance inside their windows.
 */
function dress(staged: Staged, leaving: BookPose[], entrance: Entrance, speed: number): ShufflePlan {
  const { duration, tracks, exitEnd, windows } = staged
  const leavingTracks = new Map<string, ShuffleKeyframe[]>()
  const vanish = new Map<string, Presence>()
  for (const pose of leaving) {
    const angle = scatter(pose.bookId, 'exit-angle') * 2 * Math.PI
    const reach = pose.height / 2 + EXIT_REACH
    const twist = (scatter(pose.bookId, 'exit-twist') - 0.5) * 2 * EXIT_TWIST
    const [rx, ry, rz] = vec(pose.rotation)
    leavingTracks.set(pose.bookId, [
      { t: 0, ...poseNode(pose) },
      { t: exitEnd, position: [pose.x + reach * Math.sin(angle), pose.y, pose.z + reach * Math.cos(angle)], rotation: [rx, ry + twist, rz] },
    ])
    vanish.set(pose.bookId, { start: exitEnd * (0.1 + 0.3 * scatter(pose.bookId, 'exit-delay')), end: exitEnd })
  }

  const appear = new Map<string, Presence>()
  for (const [id, window] of windows) {
    const room = window.end - window.start
    const span = Math.min(APPEAR / speed, room * 0.5)
    const spread = Math.max(0, Math.min(APPEAR_SPREAD / speed, room * 0.75 - span))
    const start = window.start + scatter(id, 'appear-delay') * spread
    appear.set(id, { start, end: start + span })
    const track = tracks.get(id)
    if (track && window.moveFrom !== null) landAt(track, start, start + span, window.moveFrom, entrance.drop)
  }
  return { duration, tracks, leaving: leavingTracks, appear, vanish }
}

/**
 * A new Book waits at its first keyframe (its spot, raised by `drop`), comes
 * down onto the spot while it appears, holds there until the Style first
 * moves it, then moves as planned. Its track must be still up to `moveFrom`.
 */
function landAt(track: ShuffleKeyframe[], start: number, end: number, moveFrom: number, drop: number) {
  const raised = track[0]!
  const landed: Node = { position: [raised.position[0], raised.position[1] - drop, raised.position[2]], rotation: vec(raised.rotation) }
  const head: ShuffleKeyframe[] = [{ t: 0, position: vec(raised.position), rotation: vec(raised.rotation) }]
  if (start > 0) head.push({ t: start, position: vec(raised.position), rotation: vec(raised.rotation) })
  head.push({ t: end, ...landed })
  if (moveFrom > end) head.push({ t: moveFrom, position: vec(landed.position), rotation: vec(landed.rotation) })
  const resume = Math.max(end, moveFrom)
  const tail = track.filter(keyframe => keyframe.t > resume + 1e-9)
  track.splice(0, track.length, ...head, ...tail)
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

/** Each Book keeps the twist it lies with; a new Book uses its target twist. */
const twistMap = (fromById: Map<string, BookPose>, target: BookPose[]): Map<string, number> =>
  new Map(target.map(pose => [pose.bookId, (fromById.get(pose.bookId) ?? pose).rotation[1]]))

const staggerStep = (count: number): number =>
  count > 1 ? Math.min(MAX_STAGGER, STAGGER_BUDGET / (count - 1)) : 0

/**
 * Last phase: every Book is already at its final, disjoint height, so they may
 * all move in at once; a bottom-up stagger makes it cascade instead.
 */
function staggerIn(timeline: ReturnType<typeof createTimeline>, target: BookPose[], inSpan: number, step: number): Pick<ShufflePlan, 'duration' | 'tracks'> {
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

/** Phase lengths, squeezed so even a long plan stays near TARGET_TOTAL seconds. */
function phaseScale(raw: number): number {
  return raw > TARGET_TOTAL ? TARGET_TOTAL / raw : 1
}

function planHand(fromById: Map<string, BookPose>, to: BookPose[], speed: number, entrance: Entrance): Staged {
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
  batches.forEach(batch => batch.forEach((id, slot) => lane.set(id, LANES[slot]!)))

  const maxLength = target.reduce((max, pose) => Math.max(max, pose.height), 0)
  const maxDepth = target.reduce((max, pose) => Math.max(max, pose.depth), 0)
  const laneX = maxLength + LANE_CLEARANCE
  const laneZ = maxDepth + LANE_CLEARANCE
  const lanePoint = (which: Lane, x: number, y: number, z: number): Vec3 => {
    if (which === 'front') return [x, y, laneZ]
    if (which === 'back') return [x, y, -laneZ]
    if (which === 'left') return [-laneX, y, z]
    return [laneX, y, z]
  }
  // New Books wait unseen in their lane, at about the height they will rest at,
  // until their batch has the lane to itself.
  const start = new Map<string, Node>()
  for (const pose of target) {
    const old = fromById.get(pose.bookId)
    if (old) start.set(pose.bookId, poseNode(old))
    else {
      const y = entrance.spotY(pose) + entrance.drop
      start.set(pose.bookId, { position: lanePoint(lane.get(pose.bookId) ?? 'front', 0, y, 0), rotation: vec(pose.rotation) })
    }
  }

  const timeline = createTimeline(start)
  // With nobody to pull out first, leaving Books get a phase of their own.
  const ownExit = entrance.leaving && batches.length === 0
  const raw = batches.length * (HAND_PULL + HAND_RESTACK + HAND_SLIDE) + HAND_SETTLE + (ownExit ? EXIT : 0)
  const scale = phaseScale(raw)
  const span = (base: number) => Math.max(MIN_PHASE, base * scale) / speed
  if (ownExit) timeline.phase(span(EXIT), new Map())
  // Leaving Books slide out during the first pull, while every height holds.
  const exitEnd = ownExit ? timeline.now() : span(HAND_PULL)
  const windows = new Map<string, Window>()

  for (const batch of batches) {
    const inBatch = new Set(batch)
    const batchStart = timeline.now()

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
    const restackStart = timeline.now()
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
    // A new Book has its lane to itself from the start of its batch (once the
    // leaving Books are gone, unless it waits above all of them) until it has
    // come down to its height.
    for (const id of batch) {
      const pose = byId.get(id)!
      if (fromById.has(id)) continue
      const clear = !entrance.leaving || aboveOldPile(pose, entrance)
      windows.set(id, { start: clear ? batchStart : Math.max(batchStart, exitEnd), end: timeline.now(), moveFrom: restackStart })
    }

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
  return { duration: timeline.now(), tracks: timeline.tracks, exitEnd, windows }
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

/**
 * Slots on a ring around the pile, spread evenly from the front (angle 0).
 * A lap only takes as many Books as fit side by side; the rest go a lap out.
 * Slots never reach the pile's own column either: their inner edge sits a full
 * depth/2 + 5 cm beyond a lying Book's half length.
 */
function ringSlots(count: number, length: number, depth: number): RingSlot[] {
  const slots: RingSlot[] = []
  let radius = length / 2 + depth + 0.05
  while (slots.length < count) {
    const inner = Math.max(radius - depth / 2, 0.01)
    const minAngle = 2 * Math.atan2(length / 2 + RING_CLEARANCE, inner)
    const capacity = Math.max(1, Math.floor((2 * Math.PI) / minAngle))
    const take = Math.min(capacity, count - slots.length)
    const step = (2 * Math.PI) / take
    for (let i = 0; i < take; i++) slots.push({ radius, angle: i * step })
    radius += depth + RING_LAP_GAP
  }
  return slots
}

/** A Book in a ring slot: the Spine faces outwards, so it lies along the ring. */
const ringNode = (slot: RingSlot, y: number, twist: number): Node => ({
  position: [slot.radius * Math.sin(slot.angle), y, slot.radius * Math.cos(slot.angle)],
  rotation: [0, twist + slot.angle, Math.PI / 2],
})

/** Where a new Book waits in its ring slot: at its spot, raised for a 'drop'. */
const spotNode = (slot: RingSlot, pose: BookPose, twist: number, entrance: Entrance): Node =>
  ringNode(slot, entrance.spotY(pose) + entrance.drop, twist)

/**
 * Windows for new Books waiting in their own ring slot: they may appear from
 * the start when their spot lies above the old pile (until the lift nothing
 * else leaves its height), else once every Book keeps to its own slot.
 */
function slotWindows(fromById: Map<string, BookPose>, target: BookPose[], entrance: Entrance, liftStart: number, liftEnd: number): Map<string, Window> {
  const windows = new Map<string, Window>()
  for (const pose of target) {
    if (fromById.has(pose.bookId)) continue
    windows.set(pose.bookId, { start: aboveOldPile(pose, entrance) ? 0 : liftStart, end: liftEnd, moveFrom: liftStart })
  }
  return windows
}

function planCarousel(fromById: Map<string, BookPose>, to: BookPose[], speed: number, entrance: Entrance): Staged {
  const target = [...to].sort((a, b) => a.y - b.y)
  const { length, depth } = extents(target)
  const slots = ringSlots(target.length, length, depth)
  const twist = twistMap(fromById, target)
  const twistOf = (pose: BookPose) => twist.get(pose.bookId)!

  const start = new Map<string, Node>()
  target.forEach((pose, index) => {
    const old = fromById.get(pose.bookId)
    // New Books wait unseen in their own slot until it is safe to appear.
    start.set(pose.bookId, old ? poseNode(old) : spotNode(slots[index]!, pose, twistOf(pose), entrance))
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
  const liftStart = timeline.now()

  // 2. Lift: to the final height, each Book inside its own slot.
  const lift = new Map<string, Node>()
  target.forEach((pose, index) => lift.set(pose.bookId, ringNode(slots[index]!, pose.y, twistOf(pose))))
  timeline.phase(span(CAROUSEL_LIFT), lift)
  const windows = slotWindows(fromById, target, entrance, liftStart, timeline.now())

  // 3. In: everyone is at a final, disjoint height, so they may come back at
  //    once; a bottom-up stagger makes it cascade.
  const plan = staggerIn(timeline, target, span(CAROUSEL_IN), (stagger * scale) / speed)
  // Leaving Books slide out while the pile swings out, at unchanged heights.
  return { ...plan, exitEnd: liftStart, windows }
}
