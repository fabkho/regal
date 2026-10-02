import { describe, expect, it } from 'vitest'
import { BACKGROUND, HIDDEN, inView, LOAD_BANDS, LOOK_AHEAD, loadRank, outsideView, SPEED_LOOK_AHEAD } from '../../app/utils/covers/loadWindow'
import type { LoadView } from '../../app/utils/covers/loadWindow'
import { nextJob } from '../../app/utils/covers/loadQueue'

/** The Stack's view resting at the top of a 2.5 m pile: 0.35 m either side of the middle. */
const resting: LoadView = { focusY: 2.3, targetY: 2.3, halfView: 0.35, speed: 0 }

describe('outsideView', () => {
  it('is 0 inside the view and grows with the distance outside it', () => {
    expect(outsideView(2.3, resting)).toBe(0)
    expect(outsideView(2.0, resting)).toBe(0)
    expect(outsideView(1.85, resting)).toBeCloseTo(0.1, 9)
    expect(outsideView(2.75, resting)).toBeCloseTo(0.1, 9)
  })

  it('stretches to where the view is heading: a wheel step or a fling', () => {
    const fling: LoadView = { ...resting, targetY: 0.5 }
    for (const y of [2.3, 1.5, 0.5, 0.2]) expect(outsideView(y, fling)).toBe(0)
    expect(outsideView(0.1, fling)).toBeCloseTo(0.05, 9)
  })

  it('reaches further ahead the faster the view moves', () => {
    const moving: LoadView = { ...resting, speed: -1 }
    expect(outsideView(2.3 - 0.35 - SPEED_LOOK_AHEAD + 0.01, moving)).toBe(0)
    // Behind the motion the window does not grow.
    expect(outsideView(2.75, moving)).toBeCloseTo(0.1, 9)
  })
})

describe('inView', () => {
  it('only counts the view itself, not where it is heading', () => {
    expect(inView(2.3, { ...resting, targetY: 0.5 })).toBe(true)
    expect(inView(1.0, { ...resting, targetY: 0.5 })).toBe(false)
  })
})

describe('loadRank', () => {
  const rank = (y: number, use: 'shown' | 'hidden' = 'shown', view: LoadView | null = resting) => loadRank(y, view, use)

  it('loads the picked Book, then the hovered one, before anything else', () => {
    const picked = loadRank(0.1, resting, 'hidden', 'picked')
    const hovered = loadRank(0.1, resting, 'hidden', 'hovered')
    expect(picked).toBeLessThan(hovered)
    expect(hovered).toBeLessThan(rank(2.3))
    // The Spine of a picked Book still comes before its back.
    expect(loadRank(0.1, resting, 'shown', 'picked')).toBeLessThan(picked)
  })

  it('loads where a fling comes to rest before the Books it flies past', () => {
    const fling: LoadView = { ...resting, targetY: 0.5, speed: -2 }
    expect(rank(0.5, 'shown', fling)).toBeLessThan(rank(1.5, 'shown', fling))
    expect(rank(1.5, 'shown', fling)).toBeLessThan(rank(2.3, 'shown', fling))
  })

  it('loads the Spines in view first, the middle of the view first', () => {
    expect(rank(2.3)).toBeLessThan(rank(2.1))
    expect(rank(2.1)).toBeLessThan(rank(1.9))
    expect(rank(1.9)).toBeLessThan(1)
  })

  it('takes the margin of LOOK_AHEAD view heights eagerly, the rest as a background fill', () => {
    const margin = LOOK_AHEAD * 2 * resting.halfView
    expect(rank(2.3 - 0.35 - margin + 0.01)).toBeLessThan(BACKGROUND)
    expect(rank(2.3 - 0.35 - margin - 0.01)).toBeGreaterThanOrEqual(BACKGROUND)
    expect(rank(0.1)).toBeGreaterThan(rank(0.6))
    expect(rank(0.1)).toBeLessThan(HIDDEN)
  })

  it('puts faces only seen when a Book is taken out after every face the pile shows', () => {
    expect(rank(2.3, 'hidden')).toBeGreaterThan(rank(0.01))
    expect(rank(2.3, 'hidden')).toBeLessThan(rank(0.01, 'hidden'))
  })

  it('pulls the Books ahead of a scroll forward', () => {
    const down: LoadView = { ...resting, targetY: 1.0, speed: -1.5 }
    expect(rank(0.9, 'shown', down)).toBeLessThan(BACKGROUND)
    expect(rank(0.9, 'shown', down)).toBeLessThan(rank(0.9))
  })

  it('loads in the order queued without a view (the Bookcase), shown faces first', () => {
    expect(rank(0.5, 'shown', null)).toBe(0)
    expect(rank(0.5, 'hidden', null)).toBe(HIDDEN)
    expect(loadRank(undefined, resting, 'shown')).toBeGreaterThanOrEqual(BACKGROUND)
  })
})

describe('the load bands in the queue', () => {
  it('keep slots free for what a scroll makes urgent', () => {
    const background = Array.from({ length: 10 }, (_, i) => BACKGROUND + i)
    const fill = (count: number, rank = BACKGROUND) => Array.from({ length: count }, () => rank)
    // Nothing urgent waiting: the background fill takes at most six slots.
    expect(nextJob(background, fill(5), LOAD_BANDS)).toBe(0)
    expect(nextJob(background, fill(6), LOAD_BANDS)).toBe(-1)
    // A Spine in the window still starts.
    expect(nextJob([...background, 0.2], fill(6), LOAD_BANDS)).toBe(10)
    // Faces seen only when taken out get two slots, and count against the background's six.
    expect(nextJob([HIDDEN, HIDDEN], fill(2, HIDDEN), LOAD_BANDS)).toBe(-1)
    expect(nextJob([BACKGROUND + 1], [...fill(2, HIDDEN), ...fill(4)], LOAD_BANDS)).toBe(-1)
    expect(nextJob([BACKGROUND + 1], [...fill(2, HIDDEN), ...fill(3)], LOAD_BANDS)).toBe(0)
    // Eight in flight is the most, urgent or not.
    expect(nextJob([0], fill(8, 0), LOAD_BANDS)).toBe(-1)
  })
})
