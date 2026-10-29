// The reel's entrance (utils/reel/entrance.ts) is the Stack's: the same cascade, settle, slide and
// easing (utils/stack/shuffle.ts, utils/row/intro.ts), played from the canvas's takeover. And the
// Covers the first frame needs are asked for ahead (utils/reel/preload.ts, covers/images.ts).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { planReelEntrance, REEL_COVER_PATIENCE, REEL_ENTRANCE_HOLD, REEL_ENTRANCES } from '../../app/utils/reel/entrance'
import type { EntranceOffset } from '../../app/utils/reel/entrance'
import { SETTLE_DROP, SWAP_CASCADE, SWAP_SETTLE } from '../../app/utils/stack/shuffle'
import { popScale } from '../../app/utils/row/intro'
import { coverRequestsAt, preloadReelCovers, reelCoverRequests } from '../../app/utils/reel/preload'
import { clearPreloadedImages, fetchImage, preloadImage } from '../../app/utils/covers/images'
import type { Book } from '../../shared/types/book'
import type { AssetFaces } from '../../app/utils/covers/bookAssets'
import { reelStartFrame } from '../../app/utils/reel/state'

const shown = [{ index: 11, x: 0 }, { index: 0, x: 132 }, { index: 10, x: -132 }, { index: 1, x: 194 }, { index: 9, x: -194 }]
const at = (plan: ReturnType<typeof planReelEntrance>, index: number, t: number): EntranceOffset => ({ ...plan.at(index, t, { dx: 0, scale: 1 }) })

describe('the Stack\'s entrance for the reel (\'pop\')', () => {
  const plan = planReelEntrance('pop', shown)

  it('runs the Stack\'s cascade and settle: 0.3 s across the Books, 0.45 s a Book', () => {
    expect(plan.duration).toBeCloseTo(SWAP_CASCADE + SWAP_SETTLE, 6)
    expect(planReelEntrance('pop', shown.slice(0, 1)).duration).toBeCloseTo(SWAP_SETTLE, 6)
    expect(planReelEntrance('pop', []).duration).toBe(0)
  })

  it('every Book is unseen before its turn, the left one first, the right one last (the newest land last)', () => {
    // Just before a Book's turn it is not there; the first left to right turn is at 0, the last at the cascade's end.
    const order = [...shown].sort((a, b) => a.x - b.x)
    order.forEach(({ index }, rank) => {
      const start = SWAP_CASCADE * (rank / (order.length - 1))
      expect(at(plan, index, start - 0.001).scale).toBe(0)
      expect(at(plan, index, start + 0.02).scale).toBeGreaterThan(0)
    })
    expect(at(plan, 9, 0.01).scale).toBeGreaterThan(0)
    expect(at(plan, 1, 0.01).scale).toBe(0)
    expect(at(plan, 1, 0).dx).toBe(SETTLE_DROP)
  })

  it('pops in with the Stack\'s easeOutBack over 70 % of the settle and slides home on a smoothstep', () => {
    const start = SWAP_CASCADE * 0.5 // the front Book, the middle of the cascade
    const quarter = at(plan, 11, start + SWAP_SETTLE * 0.25)
    expect(quarter.scale).toBeCloseTo(popScale(0.25 / 0.7), 6)
    // It overshoots a little, then is exactly 1 (the Book at rest).
    const peak = Math.max(...Array.from({ length: 50 }, (_, k) => at(plan, 11, start + (SWAP_SETTLE * k) / 49).scale))
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThan(1.15)
    expect(at(plan, 11, start + SWAP_SETTLE)).toEqual({ dx: 0, scale: 1 })
    // A gap's width (SETTLE_DROP) to the right at the start, home at the end, never past it.
    expect(at(plan, 11, start).dx).toBeCloseTo(SETTLE_DROP, 6)
    const slide = Array.from({ length: 20 }, (_, k) => at(plan, 11, start + (SWAP_SETTLE * k) / 19).dx)
    expect(slide.every((dx, k) => k === 0 || dx <= slide[k - 1]! + 1e-9)).toBe(true)
    expect(slide.at(-1)).toBe(0)
  })

  it('after the plan every Book is at rest', () => {
    for (const { index } of shown) expect(at(plan, index, plan.duration + 0.5)).toEqual({ dx: 0, scale: 1 })
    // A Book the plan doesn't know (not on the first frame) is untouched.
    expect(at(plan, 5, 0)).toEqual({ dx: 0, scale: 1 })
  })
})

describe('the other entrances', () => {
  it('\'settle\' starts and ends at rest (no jump from the poster), swelling in between, in the same cascade', () => {
    const plan = planReelEntrance('settle', shown)
    expect(plan.duration).toBeCloseTo(SWAP_CASCADE + SWAP_SETTLE, 6)
    for (const { index } of shown) {
      expect(at(plan, index, -1)).toEqual({ dx: 0, scale: 1 })
      expect(at(plan, index, 0)).toEqual({ dx: 0, scale: 1 })
      expect(at(plan, index, plan.duration)).toEqual({ dx: 0, scale: 1 })
    }
    const middle = at(plan, 11, SWAP_CASCADE * 0.5 + SWAP_SETTLE / 2)
    expect(middle.scale).toBeLessThan(1)
    expect(middle.scale).toBeGreaterThan(0.85)
    expect(middle.dx).toBeGreaterThan(0)
  })

  it('\'none\' has no entrance', () => {
    const plan = planReelEntrance('none', shown)
    expect(plan.duration).toBe(0)
    expect(at(plan, 11, 0)).toEqual({ dx: 0, scale: 1 })
    expect(REEL_ENTRANCES).toEqual(['pop', 'settle', 'none'])
  })

  it('waits for the Covers a short while and breathes before the beat', () => {
    expect(REEL_COVER_PATIENCE).toBeLessThanOrEqual(600)
    expect(REEL_ENTRANCE_HOLD).toBeGreaterThan(0)
    expect(REEL_ENTRANCE_HOLD).toBeLessThan(0.5)
  })
})

function bookOf(id: string): Book {
  return { id, title: id, seriesTitle: null, author: 'A', additionalAuthors: [], isbn10: null, isbn13: null, pages: 1, binding: null, yearPublished: null, originalYear: null, rating: 0, status: 'read', tags: [], dateRead: null, dateAdded: null, review: null, reviewHasSpoiler: false, readCount: 1, description: null }
}

const library = (count: number) => ({
  version: 2,
  generatedAt: '2026-10-28T00:00:00Z',
  books: Array.from({ length: count }, (_, index) => ({ id: `c-${index}`, title: `C${index}`, authors: ['A'], status: 'read', rating: 0, assets: { color: '#336699', front: `https://covers.example/c-${index}.jpg` } })),
})

describe('the Covers asked for ahead', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    clearPreloadedImages()
  })

  it('are the first frame\'s: the Book in front first at high priority, no more than the arc shows, each once', () => {
    const requests = reelCoverRequests(library(300))
    expect(requests.length).toBeLessThanOrEqual(5)
    // The reel plays: it opens with the last Book in front.
    expect(requests[0]).toEqual({ url: 'https://covers.example/c-299.jpg', priority: 'high' })
    expect(requests.slice(1).every(request => request.priority === 'auto')).toBe(true)
    expect(new Set(requests.map(request => request.url)).size).toBe(requests.length)
    // Still (autoplay off): the first Book.
    expect(reelCoverRequests(library(12), { autoplay: false })[0]!.url).toBe('https://covers.example/c-0.jpg')
    expect(reelStartFrame(12, { autoplay: false }).focus).toBe(0)
    expect(reelCoverRequests(null)).toEqual([])
    expect(reelCoverRequests(library(0))).toEqual([])
  })

  it('come from the faces\' pile copy when there is one, as the canvas loads them', () => {
    const faces = (id: string) => ({ pileFront: `https://covers.example/pile-${id}.jpg`, front: `https://covers.example/${id}.jpg` }) as AssetFaces
    expect(coverRequestsAt([bookOf('a'), bookOf('b')], faces, 0)[0]).toEqual({ url: 'https://covers.example/pile-a.jpg', priority: 'high' })
    expect(coverRequestsAt([bookOf('a')], () => null, 0)).toEqual([])
  })

  it('are fetched once: the texture takes the bytes asked for ahead, then asks for itself', async () => {
    // A browser (it does nothing on the server).
    vi.stubGlobal('window', {})
    const fetched: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit & { priority?: string }) => {
      fetched.push(`${url} ${init?.priority ?? ''}`)
      return { ok: true, blob: async () => new Blob([url]) }
    }))
    const doc = library(12)
    await preloadReelCovers(doc)
    expect(fetched.length).toBeGreaterThan(0)
    expect(fetched[0]).toBe('https://covers.example/c-11.jpg high')
    const count = fetched.length
    // A second call for the same Library does nothing more.
    await preloadReelCovers(doc)
    expect(fetched.length).toBe(count)
    // The canvas's texture load takes the bytes (no new request), once; then the queue's own request.
    const blob = await fetchImage('https://covers.example/c-11.jpg')
    expect(await blob!.text()).toBe('https://covers.example/c-11.jpg')
    expect(fetched.length).toBe(count)
    await fetchImage('https://covers.example/c-11.jpg')
    expect(fetched.length).toBe(count + 1)
  })

  it('fall back to the queue\'s request when the early one failed', async () => {
    let calls = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++
      if (calls === 1) throw new Error('offline')
      return { ok: true, blob: async () => new Blob(['ok']) }
    }))
    expect(await preloadImage('https://covers.example/x.jpg')).toBeNull()
    const blob = await fetchImage('https://covers.example/x.jpg')
    expect(await blob!.text()).toBe('ok')
    expect(calls).toBe(2)
  })
})
