import { describe, expect, it } from 'vitest'
import { createRowIntro, INTRO_MAX, INTRO_WAIT, introWindow, planRowIntro } from '../../app/utils/row/intro'
import type { IntroFrame, IntroOffset } from '../../app/utils/row/intro'

// 60 Books 3 cm apart; the view shows x 1.0 … 1.4.
const books = Array.from({ length: 60 }, (_, index) => ({ x: index * 0.03 }))
const view = { cameraX: 1.2, halfView: 0.2 }
const offset = (): IntroOffset => ({ dx: 0, scale: 1 })
const REST = { dx: 0, scale: 1 }

describe('row intro: the plan', () => {
  it('takes the Books in view, and with margins those whose shadows reach into it', () => {
    const core = introWindow(books, view)
    expect(core.map(index => books[index]!.x).every(x => x >= 1 && x <= 1.4)).toBe(true)
    const wide = introWindow(books, view, true)
    expect(wide.length).toBeGreaterThan(core.length)
    expect(wide).toEqual(expect.arrayContaining(core))
  })

  it('runs no longer than INTRO_MAX and ends with every Book at rest', () => {
    const plan = planRowIntro(books, view)
    expect(plan.duration).toBeGreaterThan(0.5)
    expect(plan.duration).toBeLessThanOrEqual(INTRO_MAX + 1e-9)
    for (let index = 0; index < books.length; index++) expect(plan.at(index, plan.duration, offset())).toEqual(REST)
  })

  it('settles in like the Stack, turned: unseen until its turn, in from the right, left to right', () => {
    const plan = planRowIntro(books, view)
    const [first, , , , , , middle] = introWindow(books, view)
    const last = introWindow(books, view).at(-1)!
    // At the start the leftmost Book in view pops in a gap to the right of its place; the rightmost is unseen.
    const start = plan.at(first!, 0.001, offset())
    expect(start.dx).toBeGreaterThan(0.04)
    expect(start.scale).toBeLessThan(0.2)
    expect(plan.at(last, 0.05, offset()).scale).toBe(0)
    // Halfway, Books further left are further on their way home.
    expect(plan.at(first!, 0.3, offset()).dx).toBeLessThan(plan.at(middle!, 0.3, offset()).dx)
  })

  it('leaves the Books far from the view at rest', () => {
    const plan = planRowIntro(books, view)
    expect(plan.at(0, 0, offset())).toEqual(REST)
    expect(plan.at(59, 0, offset())).toEqual(REST)
  })

  it('has nothing to play without Books in view', () => {
    expect(planRowIntro([], view).duration).toBe(0)
  })
})

describe('row intro: when it plays', () => {
  const frame = (now: number, patch: Partial<IntroFrame> = {}): IntroFrame => ({ now, laidOut: true, spinesReady: true, reduced: false, picked: false, ...patch })

  it('waits for the Spines in view, then plays once and is done for good', () => {
    const intro = createRowIntro()
    expect(intro.step(frame(0, { laidOut: false }))).toBe(false)
    expect(intro.step(frame(16, { spinesReady: false }))).toBe(false)
    expect(intro.state).toBe('waiting')
    expect(intro.step(frame(400))).toBe(true)
    intro.setDuration(0.7)
    expect(intro.state).toBe('playing')
    intro.step(frame(750))
    expect(intro.progress).toBeCloseTo(0.5, 5)
    intro.step(frame(1100))
    expect(intro.state).toBe('done')
    expect(intro.progress).toBe(1)
    // Once per mount: nothing makes it play again.
    expect(intro.step(frame(2000))).toBe(false)
    expect(intro.state).toBe('done')
  })

  it('plays anyway once it has waited INTRO_WAIT', () => {
    const intro = createRowIntro()
    intro.step(frame(1000, { spinesReady: false }))
    expect(intro.step(frame(1000 + INTRO_WAIT - 1, { spinesReady: false }))).toBe(false)
    expect(intro.step(frame(1000 + INTRO_WAIT, { spinesReady: false }))).toBe(true)
  })

  it('counts the wait from when the row is laid out', () => {
    const intro = createRowIntro(100)
    intro.step(frame(0, { laidOut: false, spinesReady: false }))
    expect(intro.step(frame(5000, { spinesReady: false }))).toBe(false)
    expect(intro.step(frame(5100, { spinesReady: false }))).toBe(true)
  })

  it('has none under Reduce Motion: the row just shows once its Spines are drawn', () => {
    const intro = createRowIntro()
    expect(intro.step(frame(0, { reduced: true, spinesReady: false }))).toBe(false)
    expect(intro.state).toBe('waiting')
    expect(intro.step(frame(10, { reduced: true }))).toBe(false)
    expect(intro.state).toBe('done')
  })

  it('skips the rest when a Book is taken out', () => {
    const intro = createRowIntro()
    intro.step(frame(0))
    intro.setDuration(0.7)
    intro.step(frame(100, { picked: true }))
    expect(intro.state).toBe('done')
  })
})
