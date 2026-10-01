import { describe, expect, it } from 'vitest'
import { Euler, Matrix4, Vector3 } from 'three'
import type { Book } from '../../shared/types/book'
import type { BookPose } from '../../app/utils/books/pose'
import { layoutStack } from '../../app/utils/stack/layout'
import { applyStackView, DEFAULT_STACK_VIEW, stackGroups } from '../../app/utils/stack/view'
import type { ShufflePlan, ShuffleStyle } from '../../app/utils/stack/shuffle'
import { ENTRANCE_STYLES, planShuffle, presenceAt, sampleTrack, SHUFFLE_STYLES } from '../../app/utils/stack/shuffle'

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

/** A plan with no Books entering or leaving, for hand-made cases. */
const plain = (duration: number, tracks: ShufflePlan['tracks']): ShufflePlan =>
  ({ duration, tracks, leaving: new Map(), appear: new Map(), vanish: new Map() })

const sampleTimes = (plan: ShufflePlan, count: number): number[] => {
  const times = new Set<number>()
  const near = (t: number) => {
    times.add(t)
    times.add(Math.max(0, t - 1e-4))
    times.add(t + 1e-4)
  }
  for (let i = 0; i <= count; i++) times.add((plan.duration * i) / count)
  for (const track of [...plan.tracks.values(), ...plan.leaving.values()]) {
    for (const keyframe of track) near(keyframe.t)
  }
  for (const presence of [...plan.appear.values(), ...plan.vanish.values()]) {
    near(presence.start)
    near(presence.end)
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

/**
 * First moment at which two Books intersect, or null. Leaving Books count
 * too; a Book that is not shown (before it appears, after it vanished) cannot.
 */
const findCollision = (plan: ShufflePlan, poses: Map<string, BookPose>, samples = 400): Collision | null => {
  const entries = [...plan.tracks.entries(), ...plan.leaving.entries()]
  for (const t of sampleTimes(plan, samples)) {
    const boxes = entries.filter(([id]) => presenceAt(plan, id, t) > 0).map(([id, track]) => {
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

const STYLES: ShuffleStyle[] = ['hand', 'carousel', 'spin', 'helix', 'fan']
const SIZES = [2, 10, 40]
/** Seconds a plan may take, per Style, for ten and for forty Books. */
const BUDGET: Record<ShuffleStyle, [number, number]> = {
  hand: [4, 8],
  carousel: [3.5, 4],
  spin: [3.5, 4],
  helix: [3.5, 4],
  fan: [3.5, 4],
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
})

describe('planShuffle with date separators in the pile', () => {
  const grouped = (books: Book[], grouping: 'off' | 'year' | 'month'): BookPose[] =>
    layoutStack(books, { keepOrder: true, groups: stackGroups(books, grouping), separatorThickness: 0.014 }).poses
  const byDate = (books: Book[]) => applyStackView(books, DEFAULT_STACK_VIEW)

  for (const style of STYLES) {
    it(`${style}: grouped by date ↔ sorted by rating (gaps open and close)`, () => {
      const books = library(24)
      const from = grouped(byDate(books), 'month')
      const to = grouped(applyStackView(books, { ...DEFAULT_STACK_VIEW, sort: 'rating' }), 'off')
      for (const [a, b] of [[from, to], [to, from]] as const) {
        const plan = planShuffle(a, b, style)
        expect(findCollision(plan, poseMap(a, b))).toBeNull()
      }
    })
  }

  it('settles the Books when only the grouping changes (same order, new gaps)', () => {
    const books = byDate(library(16))
    const from = grouped(books, 'year')
    const to = grouped(books, 'month')
    const plan = planShuffle(from, to, 'hand')
    expect(findCollision(plan, poseMap(from, to))).toBeNull()
    for (const pose of to) expect(sampleTrack(plan.tracks.get(pose.bookId)!, plan.duration).position).toEqual([pose.x, pose.y, pose.z])
  })
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

// ------------------------------------------------- entering and leaving

const ENTRANCES = ENTRANCE_STYLES.map(entry => entry.value)
/** What the camera shows: the lower part of the pile, like a view scrolled down. */
const VIEW = { bottom: 0.05, top: 0.55 }
const shown = (books: Book[], minRating = 0): BookPose[] => stack(applyStackView(books, { ...DEFAULT_STACK_VIEW, minRating }))

/** Filter changes, as the Stack controls make them. */
const CHANGES: { name: string, from: (books: Book[]) => BookPose[], to: (books: Book[]) => BookPose[] }[] = [
  { name: 'many enter (★ 5 → all)', from: books => shown(books, 5), to: books => shown(books) },
  { name: 'many leave (all → ★ 5)', from: books => shown(books), to: books => shown(books, 5) },
  { name: 'some enter (★ 5 → ★ 4)', from: books => shown(books, 5), to: books => shown(books, 4) },
  { name: 'two enter', from: books => shown(books.slice(0, 20)), to: books => shown(books.slice(0, 22)) },
  { name: 'one leaves', from: books => shown(books.slice(0, 21)), to: books => shown(books.slice(0, 20)) },
  { name: 'some swap', from: books => shown(books.slice(0, 16)), to: books => shown(books.slice(4, 19)) },
]

const newIds = (from: BookPose[], to: BookPose[]): string[] => to.filter(pose => !from.some(old => old.bookId === pose.bookId)).map(pose => pose.bookId)

describe('Books entering and leaving the view never collide', () => {
  for (const style of STYLES) {
    for (const { name, from: before, to: after } of CHANGES) {
      it(`${style}: ${name}`, () => {
        const books = library(30)
        const from = before(books)
        const to = after(books)
        ENTRANCES.forEach((entrance, index) => {
          // Every other entrance with a view scrolled to the lower pile, the rest with the whole pile in view.
          const plan = planShuffle(from, to, style, { entrance, view: index % 2 === 0 ? VIEW : undefined })
          expect(plan.tracks.size).toBe(to.length)
          expect(plan.leaving.size).toBe(from.length - to.length + newIds(from, to).length)
          expect(findCollision(plan, poseMap(from, to), 300), `${entrance}`).toBeNull()
        })
      })
    }
  }

  it('nothing re-sorts: the pile holds while the leaving Book goes', () => {
    const from = shown(library(12))
    const top = [...from].sort((a, b) => b.y - a.y)[0]!
    const to = from.filter(pose => pose !== top)
    const plan = planShuffle(from, to, 'carousel')
    expect(plan.duration).toBeGreaterThan(0.2)
    expect([...plan.leaving.keys()]).toEqual([top.bookId])
    for (const track of plan.tracks.values()) expect(track).toHaveLength(1)
    expect(findCollision(plan, poseMap(from, to))).toBeNull()
  })

  it('everything leaves (no Book matches the filters)', () => {
    const from = shown(library(12))
    const plan = planShuffle(from, [], 'carousel')
    expect(plan.tracks.size).toBe(0)
    expect(plan.leaving.size).toBe(12)
    expect(plan.duration).toBeGreaterThan(0.2)
    expect(findCollision(plan, poseMap(from))).toBeNull()
  })
})

describe('Books new to the view', () => {
  for (const style of ['hand', 'carousel'] as ShuffleStyle[]) {
    it(`${style}: appear scattered around the pile, near where they go when that is in view`, () => {
      const books = library(30)
      const from = shown(books, 5)
      const to = shown(books)
      const plan = planShuffle(from, to, style, { view: VIEW })
      const entering = newIds(from, to)
      const spots = entering.map((id) => {
        const appear = plan.appear.get(id)!
        expect(appear.end).toBeGreaterThan(appear.start)
        // Unseen until it appears.
        expect(presenceAt(plan, id, 0)).toBe(0)
        expect(presenceAt(plan, id, appear.end)).toBe(1)
        const spot = sampleTrack(plan.tracks.get(id)!, appear.start).position
        const target = to.find(pose => pose.bookId === id)!
        if (target.y >= VIEW.bottom && target.y <= VIEW.top) {
          expect(spot[1]).toBeGreaterThanOrEqual(VIEW.bottom - 1e-9)
          expect(spot[1]).toBeLessThanOrEqual(VIEW.top + 1e-9)
          expect(Math.abs(spot[1] - target.y)).toBeLessThanOrEqual(0.04 + 1e-9)
        }
        // Beside the pile, not inside it.
        expect(Math.hypot(spot[0], spot[2])).toBeGreaterThan(0.15)
        return spot
      })
      // Not all from one point: no two new Books share a spot.
      for (let i = 0; i < spots.length; i++) {
        for (let j = i + 1; j < spots.length; j++) {
          expect(Math.hypot(spots[i]![0] - spots[j]![0], spots[i]![1] - spots[j]![1], spots[i]![2] - spots[j]![2])).toBeGreaterThan(0.01)
        }
      }
      // Their starts are staggered, not all at once.
      expect(new Set(entering.map(id => plan.appear.get(id)!.start.toFixed(3))).size).toBeGreaterThan(1)
    })
  }

  it('carousel: a new Book above the old pile appears right away, the rest once the ring is out', () => {
    const books = library(30)
    const from = shown(books, 5)
    const to = shown(books)
    const plan = planShuffle(from, to, 'carousel')
    const starts = newIds(from, to).map(id => plan.appear.get(id)!.start)
    expect(Math.min(...starts)).toBeLessThan(0.35)
    expect(Math.max(...starts)).toBeGreaterThanOrEqual(0.5)
  })

  for (const style of ['hand', 'carousel', 'fan'] as ShuffleStyle[]) {
    it(`${style}: with 'drop' a new Book comes down onto its spot while it appears`, () => {
      const books = library(30)
      const from = shown(books, 5)
      const to = shown(books, 4)
      const plan = planShuffle(from, to, style, { entrance: 'drop' })
      for (const id of newIds(from, to)) {
        const appear = plan.appear.get(id)!
        const track = plan.tracks.get(id)!
        const fall = sampleTrack(track, appear.start).position[1] - sampleTrack(track, appear.end).position[1]
        expect(fall).toBeCloseTo(0.07, 6)
      }
    })
  }

  for (const entrance of ENTRANCES) {
    it(`${entrance}: every track still ends exactly at its target pose`, () => {
      const books = library(30)
      const from = shown(books.slice(0, 16))
      const to = shown(books.slice(4, 19))
      for (const style of STYLES) {
        const plan = planShuffle(from, to, style, { entrance, view: VIEW })
        for (const pose of to) {
          const track = plan.tracks.get(pose.bookId)!
          for (let i = 1; i < track.length; i++) expect(track[i]!.t).toBeGreaterThanOrEqual(track[i - 1]!.t)
          expect(sampleTrack(track, plan.duration)).toEqual({ position: [pose.x, pose.y, pose.z], rotation: pose.rotation })
        }
      }
    })
  }
})

describe('Books leaving the view', () => {
  for (const style of STYLES) {
    it(`${style}: slide outwards at their own height and are gone before the plan ends`, () => {
      const books = library(30)
      const from = shown(books)
      const to = shown(books, 5)
      const plan = planShuffle(from, to, style)
      const radii: number[] = []
      for (const [id, track] of plan.leaving) {
        const pose = from.find(item => item.bookId === id)!
        const first = track[0]!
        const last = track[track.length - 1]!
        expect(first.position).toEqual([pose.x, pose.y, pose.z])
        for (const keyframe of track) expect(keyframe.position[1]).toBe(pose.y)
        expect(Math.hypot(last.position[0], last.position[2])).toBeGreaterThan(Math.hypot(pose.x, pose.z) + 0.15)
        radii.push(Math.atan2(last.position[0], last.position[2]))
        const vanish = plan.vanish.get(id)!
        expect(vanish.end).toBeLessThanOrEqual(last.t + 1e-9)
        expect(vanish.end).toBeLessThan(plan.duration)
        expect(presenceAt(plan, id, 0)).toBe(1)
        expect(presenceAt(plan, id, vanish.end)).toBe(0)
      }
      // Each its own way, not all to one point.
      expect(new Set(radii.map(angle => Math.round(angle * 4))).size).toBeGreaterThan(4)
    })
  }
})

describe('the entrance list', () => {
  it('describes every entrance once', () => {
    expect(ENTRANCES).toEqual(['fade', 'pop', 'drop'])
    for (const entry of ENTRANCE_STYLES) expect(entry.text.length).toBeGreaterThan(20)
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

describe('turning rings keep their steps small', () => {
  // A turning ring is sampled as chords, so a Book may only turn a little
  // between two keyframes while its height moves; otherwise it would cut across
  // the slots beside it. Height changes and wide turns therefore never share a
  // segment in any Style.
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

  it('spin and helix really turn the ring the long way round', () => {
    const books = library(12)
    const from = stack(books)
    const to = stack([...books].reverse())
    for (const style of ['spin', 'helix'] as ShuffleStyle[]) {
      const plan = planShuffle(from, to, style)
      const swings = [...plan.tracks.values()].map((track) => {
        const angles = track.map(keyframe => keyframe.rotation[1])
        return Math.max(...angles) - Math.min(...angles)
      })
      expect(Math.min(...swings)).toBeGreaterThan((200 * Math.PI) / 180)
    }
  })
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
    const naive = plain(1, tracks)
    expect(findCollision(naive, poseMap(from, to))).not.toBeNull()
  })

  it('catches a Book sunk two millimetres into the one below it', () => {
    const poses = stack(library(2)).sort((a, b) => a.y - b.y)
    const resting = (sink: number): ShufflePlan => plain(0, new Map(poses.map((pose, index) => [pose.bookId, [{
      t: 0,
      position: [pose.x, pose.y - (index === 1 ? sink : 0), pose.z] as [number, number, number],
      rotation: pose.rotation,
    }]])))
    expect(findCollision(resting(0.002), poseMap(poses), 2)).not.toBeNull()
    // Still a gap, so the 0.2 mm tolerance must not raise a false alarm.
    expect(findCollision(resting(0.0005), poseMap(poses), 2)).toBeNull()
  })

  it('reports no overlap for a pile at rest', () => {
    const from = stack(library(12))
    const resting = plain(0, new Map(from.map(pose => [pose.bookId, [{ t: 0, position: [pose.x, pose.y, pose.z] as [number, number, number], rotation: pose.rotation }]])))
    expect(findCollision(resting, poseMap(from), 2)).toBeNull()
  })
})
