import { describe, expect, it } from 'vitest'
import { Euler, Matrix4, Vector3 } from 'three'
import type { Book } from '../../shared/types/book'
import type { BookPose } from '../../app/utils/books/pose'
import { layoutStack } from '../../app/utils/stack/layout'
import { applyStackView, DEFAULT_STACK_VIEW } from '../../app/utils/stack/view'
import type { ShuffleKeyframe, ShufflePlan, ShuffleStyle } from '../../app/utils/stack/shuffle'
import { planShuffle, sampleTrack, SHUFFLE_STYLES } from '../../app/utils/stack/shuffle'

const book = (id: string, overrides: Partial<Book>): Book => ({
  id, title: id, seriesTitle: null, author: null, additionalAuthors: [], isbn10: null, isbn13: null, pages: 300, binding: null,
  yearPublished: null, originalYear: null, rating: 0, status: 'read', tags: [], dateRead: null, dateAdded: null,
  review: null, reviewHasSpoiler: false, readCount: 1, ...overrides,
})

const BINDINGS = ['Hardcover', 'Paperback', 'Mass Market Paperback', 'Taschenbuch', null]
const NAMES = ['Ash', 'Brook', 'Crane', 'Dunn', 'Elm', 'Frost', 'Gale']

/** A Library with varied page counts and bindings, so dimensions vary a lot. */
const library = (count: number): Book[] => Array.from({ length: count }, (_, i) => book(`b${String(i).padStart(2, '0')}`, {
  title: `Title ${String((i * 17) % 97).padStart(2, '0')}`,
  author: `Ida ${NAMES[i % NAMES.length]!}`,
  pages: 90 + ((i * 331) % 1100),
  binding: BINDINGS[i % BINDINGS.length]!,
  rating: (i * 7) % 6,
  dateRead: `202${4 + (i % 2)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
}))

/** Deterministic PRNG, so a "random" order is reproducible. */
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6D2B79F5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const shuffled = (books: Book[], seed: number): Book[] => {
  const random = mulberry32(seed)
  const out = [...books]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

// ---------------------------------------------------------------- collisions

/** Half extents shrink by this, to allow the 0.8 mm resting gap. */
const SHRINK = 0.0002

interface Box {
  center: Vector3
  axes: [Vector3, Vector3, Vector3]
  half: [number, number, number]
}

const makeBox = (pose: BookPose, position: readonly number[], rotation: readonly number[]): Box => {
  const matrix = new Matrix4().makeRotationFromEuler(new Euler(rotation[0]!, rotation[1]!, rotation[2]!, 'XYZ'))
  return {
    center: new Vector3(position[0]!, position[1]!, position[2]!),
    axes: [
      new Vector3().setFromMatrixColumn(matrix, 0),
      new Vector3().setFromMatrixColumn(matrix, 1),
      new Vector3().setFromMatrixColumn(matrix, 2),
    ],
    half: [pose.thickness / 2 - SHRINK, pose.height / 2 - SHRINK, pose.depth / 2 - SHRINK],
  }
}

/** Separating axis theorem for two oriented boxes: 6 face axes + 9 cross axes. */
const overlaps = (a: Box, b: Box): boolean => {
  const EPS = 1e-9
  const R: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  const absR: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      R[i]![j] = a.axes[i]!.dot(b.axes[j]!)
      absR[i]![j] = Math.abs(R[i]![j]!) + EPS
    }
  }
  const delta = b.center.clone().sub(a.center)
  const t = [delta.dot(a.axes[0]!), delta.dot(a.axes[1]!), delta.dot(a.axes[2]!)]
  const ea = a.half
  const eb = b.half
  for (let i = 0; i < 3; i++) {
    const span = eb[0]! * absR[i]![0]! + eb[1]! * absR[i]![1]! + eb[2]! * absR[i]![2]!
    if (Math.abs(t[i]!) > ea[i]! + span) return false
  }
  for (let j = 0; j < 3; j++) {
    const span = ea[0]! * absR[0]![j]! + ea[1]! * absR[1]![j]! + ea[2]! * absR[2]![j]!
    if (Math.abs(t[0]! * R[0]![j]! + t[1]! * R[1]![j]! + t[2]! * R[2]![j]!) > eb[j]! + span) return false
  }
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const i1 = (i + 1) % 3
      const i2 = (i + 2) % 3
      const j1 = (j + 1) % 3
      const j2 = (j + 2) % 3
      const ra = ea[i1]! * absR[i2]![j]! + ea[i2]! * absR[i1]![j]!
      const rb = eb[j1]! * absR[i]![j2]! + eb[j2]! * absR[i]![j1]!
      const distance = Math.abs(t[i2]! * R[i1]![j]! - t[i1]! * R[i2]![j]!)
      if (distance > ra + rb) return false
    }
  }
  return true
}

/** Vertical half extent of a box, for a cheap reject. */
const halfY = (box: Box): number =>
  box.axes.reduce((sum, axis, i) => sum + Math.abs(axis.y) * box.half[i]!, 0)

const keyframeTimes = (plan: ShufflePlan): number[] => {
  const times = new Set<number>()
  for (const track of plan.tracks.values()) {
    for (const keyframe of track) times.add(keyframe.t)
  }
  return [...times].sort((a, b) => a - b)
}

const sampleTimes = (plan: ShufflePlan, count: number): number[] => {
  const times = new Set<number>()
  for (let i = 0; i <= count; i++) times.add((plan.duration * i) / count)
  for (const t of keyframeTimes(plan)) {
    times.add(t)
    times.add(Math.max(0, t - 1e-4))
    times.add(t + 1e-4)
  }
  return [...times].sort((a, b) => a - b)
}

interface Collision {
  t: number
  a: string
  b: string
}

/** Furthest a Book gets from the pile's axis while the plan plays. */
const maxRadius = (plan: ShufflePlan): number => {
  let radius = 0
  for (const track of plan.tracks.values()) {
    for (const t of sampleTimes(plan, 60)) {
      const { position } = sampleTrack(track, t)
      radius = Math.max(radius, Math.hypot(position[0], position[2]))
    }
  }
  return radius
}

/** First moment at which two Books intersect, or null. */
const findCollision = (plan: ShufflePlan, poses: Map<string, BookPose>, samples = 400): Collision | null => {
  const entries = [...plan.tracks.entries()]
  for (const t of sampleTimes(plan, samples)) {
    const boxes = entries.map(([id, track]) => {
      const { position, rotation } = sampleTrack(track, t)
      return { id, box: makeBox(poses.get(id)!, position, rotation) }
    })
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!
        const b = boxes[j]!
        if (Math.abs(a.box.center.y - b.box.center.y) > halfY(a.box) + halfY(b.box)) continue
        if (overlaps(a.box, b.box)) return { t, a: a.id, b: b.id }
      }
    }
  }
  return null
}

const poseMap = (...lists: BookPose[][]): Map<string, BookPose> =>
  new Map(lists.flat().map(pose => [pose.bookId, pose]))

const stack = (books: Book[]): BookPose[] => layoutStack(books, { keepOrder: true }).poses

// --------------------------------------------------------------------- cases

const STYLES: ShuffleStyle[] = ['hand', 'constellation', 'rain', 'deal']
/** The Styles built on the shared float opening. */
const FANCY: ShuffleStyle[] = ['constellation', 'rain', 'deal']
const SIZES = [2, 10, 40]
/** Seconds a plan may take, per Style, for ten and for forty Books. */
const BUDGET: Record<ShuffleStyle, [number, number]> = {
  hand: [4, 8],
  constellation: [3.5, 5],
  rain: [3.5, 5],
  deal: [3.5, 5],
}
const ORDERS: { name: string, reorder: (books: Book[]) => Book[] }[] = [
  { name: 'reversed', reorder: books => [...books].reverse() },
  { name: 'seeded random', reorder: books => shuffled(books, 1337) },
  { name: 'by rating', reorder: books => applyStackView(books, { ...DEFAULT_STACK_VIEW, sort: 'rating' }) },
]

describe('planShuffle keeps Books apart', () => {
  for (const style of STYLES) {
    for (const size of SIZES) {
      for (const { name, reorder } of ORDERS) {
        it(`${style}: ${size} Books re-sorted ${name}`, () => {
          const books = library(size)
          const from = stack(books)
          const to = stack(reorder(books))
          const plan = planShuffle(from, to, style)
          expect(plan.tracks.size).toBe(size)
          expect(findCollision(plan, poseMap(from, to))).toBeNull()
          // The Books really leave the pile instead of easing through it.
          expect(maxRadius(plan)).toBeGreaterThan(0.15)
        })
      }
    }
  }

  for (const style of STYLES) {
    it(`${style}: a filter that drops and adds Books`, () => {
      const books = library(24)
      const from = stack(books.slice(0, 16))
      const to = stack(shuffled(books.slice(6), 99))
      const plan = planShuffle(from, to, style)
      expect(plan.tracks.size).toBe(18)
      // Six Books vanish, eight are new to the view.
      expect([...plan.tracks.keys()].filter(id => !from.some(pose => pose.bookId === id))).toHaveLength(8)
      expect(findCollision(plan, poseMap(from, to))).toBeNull()
    })
  }

  for (const style of STYLES) {
    it(`${style}: a filter that swaps most of the view`, () => {
      const books = library(30)
      const from = stack(books.slice(0, 20))
      const to = stack(shuffled(books.slice(8), 42))
      const plan = planShuffle(from, to, style)
      expect(plan.tracks.size).toBe(22)
      expect([...plan.tracks.keys()].filter(id => !from.some(pose => pose.bookId === id))).toHaveLength(10)
      expect(findCollision(plan, poseMap(from, to))).toBeNull()
    })
  }

  for (const style of STYLES) {
    it(`${style}: a view where every Book is new, and one that keeps a single Book`, () => {
      const books = library(12)
      const all = stack(books)
      const fresh = planShuffle([], all, style)
      expect(fresh.tracks.size).toBe(12)
      expect(findCollision(fresh, poseMap(all))).toBeNull()
      const narrowed = planShuffle(all, stack(books.slice(0, 1)), style)
      expect(narrowed.tracks.size).toBe(1)
      expect(findCollision(narrowed, poseMap(all))).toBeNull()
    })
  }

  for (const style of FANCY) {
    it(`${style}: Books new to the view wait outside the pile's column`, () => {
      const books = library(24)
      const from = stack(books.slice(0, 16))
      const to = stack(shuffled(books.slice(6), 99))
      const plan = planShuffle(from, to, style)
      const arrivals = to.filter(pose => !from.some(old => old.bookId === pose.bookId))
      expect(arrivals.length).toBe(8)
      for (const pose of arrivals) {
        const start = sampleTrack(plan.tracks.get(pose.bookId)!, 0).position
        // Clear of the column by more than a lying Book's half diagonal.
        expect(Math.hypot(start[0], start[2])).toBeGreaterThan(Math.hypot(pose.height, pose.depth) / 2)
      }
    })
  }
})

describe('planShuffle lands on the target poses', () => {
  for (const style of STYLES) {
    it(`${style}: every track ends exactly at its target pose`, () => {
      const books = library(10)
      const from = stack(books)
      const to = stack(shuffled(books, 7))
      const plan = planShuffle(from, to, style)
      for (const pose of to) {
        const track = plan.tracks.get(pose.bookId)!
        const last = track[track.length - 1]!
        expect(last.t).toBeLessThanOrEqual(plan.duration + 1e-9)
        expect(last.position).toEqual([pose.x, pose.y, pose.z])
        expect(last.rotation).toEqual(pose.rotation)
        const sampled = sampleTrack(track, plan.duration)
        expect(sampled.position).toEqual([pose.x, pose.y, pose.z])
        expect(sampled.rotation).toEqual(pose.rotation)
      }
      // Keyframes are ordered and start at the current pose.
      for (const [id, track] of plan.tracks) {
        const start = sampleTrack(track, 0)
        const old = from.find(pose => pose.bookId === id)
        if (old) expect(start.position).toEqual([old.x, old.y, old.z])
        for (let i = 1; i < track.length; i++) expect(track[i]!.t).toBeGreaterThanOrEqual(track[i - 1]!.t)
      }
    })
  }
})

describe('planShuffle duration', () => {
  it('is nothing to do when the order does not change', () => {
    const books = library(10)
    const from = stack(books)
    const to = stack(books)
    for (const style of STYLES) {
      const plan = planShuffle(from, to, style)
      expect(plan.duration).toBeLessThan(0.5)
      expect(findCollision(plan, poseMap(from, to))).toBeNull()
    }
  })

  it('stays watchable for a small and a big Library', () => {
    for (const size of [10, 40]) {
      const books = library(size)
      const from = stack(books)
      const to = stack([...books].reverse())
      for (const style of STYLES) {
        const plan = planShuffle(from, to, style)
        expect(plan.duration).toBeGreaterThan(1)
        expect(plan.duration).toBeLessThanOrEqual(BUDGET[style][size === 10 ? 0 : 1])
      }
    }
  })

  it('gives a pile of ten Books between two and a half and three and a half seconds', () => {
    const books = library(10)
    const from = stack(books)
    const to = stack(shuffled(books, 3))
    for (const style of FANCY) {
      const plan = planShuffle(from, to, style)
      expect(plan.duration).toBeGreaterThanOrEqual(2.5)
      expect(plan.duration).toBeLessThanOrEqual(3.5)
    }
  })

  it('scales with speed', () => {
    const books = library(10)
    const from = stack(books)
    const to = stack([...books].reverse())
    for (const style of STYLES) {
      const normal = planShuffle(from, to, style)
      const quick = planShuffle(from, to, style, { speed: 2 })
      expect(quick.duration).toBeCloseTo(normal.duration / 2, 6)
      expect(findCollision(quick, poseMap(from, to))).toBeNull()
    }
  })
})

describe('the Style list', () => {
  it('describes every Style exactly once', () => {
    expect(SHUFFLE_STYLES.map(entry => entry.value)).toEqual(STYLES)
    for (const entry of SHUFFLE_STYLES) {
      expect(entry.title.length).toBeGreaterThan(2)
      expect(entry.text.length).toBeGreaterThan(20)
    }
  })
})

// ------------------------------------------------------------- the float open

/** The spread-out column: heights only, taken at the first keyframe that shows it. */
const floatFrame = (plan: ShufflePlan, from: BookPose[], minGap: number): Map<string, number> | null => {
  const column = [...from].sort((a, b) => a.y - b.y)
  for (const t of keyframeTimes(plan)) {
    const frame = column.map(pose => ({ pose, sample: sampleTrack(plan.tracks.get(pose.bookId)!, t) }))
    // Nothing has left the column yet: the spread is purely vertical.
    const overColumn = frame.every(({ pose, sample }) =>
      Math.abs(sample.position[0] - pose.x) < 1e-12 && Math.abs(sample.position[2] - pose.z) < 1e-12)
    if (!overColumn) return null
    const spread = frame.every(({ pose, sample }, index) => {
      if (index === 0) return true
      const below = frame[index - 1]!
      const surface = sample.position[1] - pose.thickness / 2
      return surface - (below.sample.position[1] + below.pose.thickness / 2) >= minGap - 1e-9
    })
    if (spread) return new Map(frame.map(({ pose, sample }) => [pose.bookId, sample.position[1]]))
  }
  return null
}

describe('the float every fancy Style opens with', () => {
  it('spreads the pile straight up, in order, with room between the Books', () => {
    const books = library(10)
    const from = stack(books)
    const to = stack(shuffled(books, 11))
    const frames = FANCY.map(style => floatFrame(planShuffle(from, to, style), from, 0.03))
    for (const frame of frames) expect(frame).not.toBeNull()
    // The pile keeps its order on the way up.
    const column = [...from].sort((a, b) => a.y - b.y).map(pose => pose.bookId)
    for (const frame of frames) {
      const heights = column.map(id => frame!.get(id)!)
      for (let i = 1; i < heights.length; i++) expect(heights[i]!).toBeGreaterThan(heights[i - 1]!)
    }
    // And all three Styles open with exactly the same float.
    for (const frame of frames.slice(1)) {
      for (const [id, y] of frames[0]!) expect(frame!.get(id)).toBeCloseTo(y, 12)
    }
  })

  it('still leaves two centimetres of air for a Library of forty', () => {
    const books = library(40)
    const from = stack(books)
    const to = stack(shuffled(books, 13))
    for (const style of FANCY) {
      expect(floatFrame(planShuffle(from, to, style), from, 0.02)).not.toBeNull()
    }
  })
})

/** When a track reaches its target pose for good. */
const restTime = (track: ShuffleKeyframe[], pose: BookPose): number => {
  const resting = (keyframe: ShuffleKeyframe): boolean =>
    keyframe.position[0] === pose.x && keyframe.position[1] === pose.y && keyframe.position[2] === pose.z
  let index = track.length - 1
  while (index > 0 && resting(track[index - 1]!)) index--
  return track[index]!.t
}

describe('Rain and Deal fill the new pile from the bottom', () => {
  for (const style of ['rain', 'deal'] as ShuffleStyle[]) {
    it(`${style}: every Book lands after the one below it`, () => {
      const books = library(12)
      const from = stack(books)
      const to = stack(shuffled(books, 21)).sort((a, b) => a.y - b.y)
      const plan = planShuffle(from, to, style)
      const landings = to.map(pose => restTime(plan.tracks.get(pose.bookId)!, pose))
      for (let i = 1; i < landings.length; i++) expect(landings[i]!).toBeGreaterThan(landings[i - 1]!)
      expect(landings[landings.length - 1]!).toBeLessThanOrEqual(plan.duration + 1e-9)
    })
  }
})

describe('Books stay flat', () => {
  // A tilt would raise a Book's vertical extent from its thickness to
  // thickness * cos(t) + height * sin(t), which the gaps are not built for, so
  // every rotation in every Style is about the vertical axis alone.
  for (const style of STYLES) {
    it(`${style}: only the twist about the vertical ever changes`, () => {
      const books = library(16)
      const from = stack(books)
      const to = stack(shuffled(books, 8))
      const plan = planShuffle(from, to, style)
      for (const pose of to) {
        for (const keyframe of plan.tracks.get(pose.bookId)!) {
          expect(keyframe.rotation[0]).toBe(pose.rotation[0])
          expect(keyframe.rotation[2]).toBe(pose.rotation[2])
        }
      }
    })
  }
})

describe('turns stay small while a Book changes height', () => {
  // Positions interpolate component-wise, so a Book that turns far inside one
  // segment travels a chord, not an arc. Height changes and wide turns
  // therefore never share a segment in any Style.
  for (const style of STYLES) {
    it(`${style}: no segment both lifts a Book and turns it far`, () => {
      const books = library(24)
      const plan = planShuffle(stack(books), stack(shuffled(books, 5)), style)
      for (const track of plan.tracks.values()) {
        for (let i = 1; i < track.length; i++) {
          const lift = Math.abs(track[i]!.position[1] - track[i - 1]!.position[1])
          const turn = Math.abs(track[i]!.rotation[1] - track[i - 1]!.rotation[1])
          if (lift > 1e-9) expect(turn).toBeLessThanOrEqual(0.35)
        }
      }
    })
  }
})

describe('sampleTrack', () => {
  const track = [
    { t: 1, position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] },
    { t: 2, position: [10, 0, 0] as [number, number, number], rotation: [0, 1, 0] as [number, number, number] },
  ]

  it('clamps outside the track and eases with smoothstep inside it', () => {
    expect(sampleTrack(track, 0).position).toEqual([0, 0, 0])
    expect(sampleTrack(track, 9).position).toEqual([10, 0, 0])
    expect(sampleTrack(track, 1.5).position[0]).toBeCloseTo(5, 9)
    expect(sampleTrack(track, 1.25).position[0]).toBeCloseTo(10 * 0.15625, 9)
    expect(sampleTrack(track, 1.5).rotation[1]).toBeCloseTo(0.5, 9)
    // Monotone, so a Book never backs up inside a segment.
    let previous = -1
    for (let i = 0; i <= 20; i++) {
      const x = sampleTrack(track, 1 + i / 20).position[0]
      expect(x).toBeGreaterThanOrEqual(previous)
      previous = x
    }
  })

  it('survives an empty or single keyframe track', () => {
    expect(sampleTrack([], 3).position).toEqual([0, 0, 0])
    expect(sampleTrack([track[0]!], 3).position).toEqual([0, 0, 0])
  })
})

describe('the collision checker itself', () => {
  it('catches Books gliding through each other on a naive tween', () => {
    const books = library(10)
    const from = stack(books)
    const to = stack([...books].reverse())
    const tracks = new Map(to.map((pose) => {
      const old = from.find(item => item.bookId === pose.bookId)!
      return [pose.bookId, [
        { t: 0, position: [old.x, old.y, old.z] as [number, number, number], rotation: old.rotation },
        { t: 1, position: [pose.x, pose.y, pose.z] as [number, number, number], rotation: pose.rotation },
      ]]
    }))
    const naive: ShufflePlan = { duration: 1, tracks }
    expect(findCollision(naive, poseMap(from, to))).not.toBeNull()
  })

  it('catches a Book sunk two millimetres into the one below it', () => {
    const poses = stack(library(2)).sort((a, b) => a.y - b.y)
    const resting = (sink: number): ShufflePlan => ({
      duration: 0,
      tracks: new Map(poses.map((pose, index) => [pose.bookId, [{
        t: 0,
        position: [pose.x, pose.y - (index === 1 ? sink : 0), pose.z] as [number, number, number],
        rotation: pose.rotation,
      }]])),
    })
    expect(findCollision(resting(0.002), poseMap(poses), 2)).not.toBeNull()
    // Still a gap, so the 0.2 mm tolerance must not raise a false alarm.
    expect(findCollision(resting(0.0005), poseMap(poses), 2)).toBeNull()
  })

  it('reports no overlap for a pile at rest', () => {
    const from = stack(library(12))
    const resting: ShufflePlan = {
      duration: 0,
      tracks: new Map(from.map(pose => [pose.bookId, [{ t: 0, position: [pose.x, pose.y, pose.z] as [number, number, number], rotation: pose.rotation }]])),
    }
    expect(findCollision(resting, poseMap(from), 2)).toBeNull()
  })
})
