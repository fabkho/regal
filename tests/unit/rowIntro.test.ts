import { describe, expect, it } from 'vitest'
import { createRowIntro, INTRO_LABELS_OVERLAP, INTRO_MAX, INTRO_VISIBLE, INTRO_WAIT, introVisible, introWindow, planRowIntro } from '../../app/utils/row/intro'
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
  const frame = (now: number, patch: Partial<IntroFrame> = {}): IntroFrame => ({ now, laidOut: true, spinesReady: true, visible: true, reduced: false, picked: false, ...patch })

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

describe('row intro: when the labels come in', () => {
  const frame = (now: number, patch: Partial<IntroFrame> = {}): IntroFrame => ({ now, laidOut: true, spinesReady: true, visible: true, reduced: false, picked: false, ...patch })

  it('holds them while it waits and while the Books settle, then lets them in for its last moment', () => {
    const intro = createRowIntro()
    expect(intro.labelsIn).toBe(false)
    intro.step(frame(0, { laidOut: false }))
    intro.step(frame(16, { spinesReady: false }))
    expect(intro.labelsIn).toBe(false)
    intro.step(frame(1000))
    intro.setDuration(0.7)
    expect(intro.state).toBe('playing')
    expect(intro.labelsIn).toBe(false)
    intro.step(frame(1000 + 300))
    expect(intro.labelsIn).toBe(false)
    intro.step(frame(1000 + (0.7 - INTRO_LABELS_OVERLAP) * 1000 - 1))
    expect(intro.labelsIn).toBe(false)
    intro.step(frame(1000 + (0.7 - INTRO_LABELS_OVERLAP) * 1000))
    expect(intro.state).toBe('playing')
    expect(intro.labelsIn).toBe(true)
    intro.step(frame(2000))
    expect(intro.state).toBe('done')
    expect(intro.labelsIn).toBe(true)
  })

  it('overlaps the end a little, not more than the intro itself', () => {
    expect(INTRO_LABELS_OVERLAP).toBeGreaterThan(0)
    expect(INTRO_LABELS_OVERLAP).toBeLessThanOrEqual(0.15)
    expect(INTRO_LABELS_OVERLAP).toBeLessThan(INTRO_MAX)
  })

  it('shows them at once with no intro: Reduce Motion, or a Book taken out first', () => {
    const reduced = createRowIntro()
    reduced.step(frame(0, { reduced: true }))
    expect(reduced.state).toBe('done')
    expect(reduced.labelsIn).toBe(true)

    const picked = createRowIntro()
    picked.step(frame(0))
    picked.setDuration(0.7)
    picked.step(frame(100, { picked: true }))
    expect(picked.labelsIn).toBe(true)
  })

  it('stays held when it starts after the Spines wait ran out, until the plan is in', () => {
    const intro = createRowIntro(100)
    intro.step(frame(0, { spinesReady: false }))
    expect(intro.labelsIn).toBe(false)
    intro.step(frame(100, { spinesReady: false }))
    expect(intro.state).toBe('playing')
    expect(intro.labelsIn).toBe(false)
  })
})

describe('row intro: waiting for the row to show', () => {
  const frame = (now: number, patch: Partial<IntroFrame> = {}): IntroFrame => ({ now, laidOut: true, spinesReady: true, visible: true, reduced: false, picked: false, ...patch })

  it('holds while the row is off screen, however ready it is, then plays once it shows', () => {
    const intro = createRowIntro()
    for (let now = 0; now < 60_000; now += 1000) expect(intro.step(frame(now, { visible: false }))).toBe(false)
    expect(intro.state).toBe('waiting')
    expect(intro.labelsIn).toBe(false)
    expect(intro.progress).toBe(0)
    expect(intro.step(frame(61_000))).toBe(true)
    intro.setDuration(0.7)
    expect(intro.state).toBe('playing')
  })

  it('counts the wait for the Spines from when the row shows, not from when it mounted', () => {
    const intro = createRowIntro()
    intro.step(frame(0, { visible: false, spinesReady: false }))
    // Off screen for ages: the wait hasn't started.
    expect(intro.step(frame(10_000, { visible: false, spinesReady: false }))).toBe(false)
    expect(intro.step(frame(10_100, { spinesReady: false }))).toBe(false)
    expect(intro.step(frame(10_100 + INTRO_WAIT - 1, { spinesReady: false }))).toBe(false)
    expect(intro.step(frame(10_100 + INTRO_WAIT, { spinesReady: false }))).toBe(true)
  })

  it('restarts the wait when the row leaves before it ran out', () => {
    const intro = createRowIntro(1000)
    intro.step(frame(0, { spinesReady: false }))
    intro.step(frame(900, { visible: false, spinesReady: false }))
    expect(intro.step(frame(1200, { spinesReady: false }))).toBe(false)
    expect(intro.step(frame(2200, { spinesReady: false }))).toBe(true)
  })

  it('plays at once when the row is visible from the start (as before)', () => {
    const intro = createRowIntro()
    expect(intro.step(frame(0))).toBe(true)
  })

  it('has none under Reduce Motion or intro="none", visible or not: done once its Spines are drawn', () => {
    const intro = createRowIntro()
    expect(intro.step(frame(0, { visible: false, reduced: true, spinesReady: false }))).toBe(false)
    expect(intro.state).toBe('waiting')
    expect(intro.step(frame(10, { visible: false, reduced: true }))).toBe(false)
    expect(intro.state).toBe('done')
    expect(intro.labelsIn).toBe(true)
  })

  it('skips it when a Book is taken out before the row ever showed', () => {
    const intro = createRowIntro()
    intro.step(frame(0, { visible: false }))
    expect(intro.step(frame(10, { visible: false, picked: true }))).toBe(false)
    expect(intro.state).toBe('done')
  })

  it('keeps playing when the row scrolls away mid-intro', () => {
    const intro = createRowIntro()
    intro.step(frame(0))
    intro.setDuration(0.7)
    intro.step(frame(300, { visible: false }))
    expect(intro.state).toBe('playing')
    intro.step(frame(800, { visible: false }))
    expect(intro.state).toBe('done')
  })
})

describe('row intro: when a card counts as visible', () => {
  it('needs INTRO_VISIBLE of the card in the viewport', () => {
    expect(introVisible(0, 0, 800)).toBe(false)
    expect(introVisible(INTRO_VISIBLE - 0.01, 90, 800)).toBe(false)
    expect(introVisible(INTRO_VISIBLE, 100, 800)).toBe(true)
    expect(introVisible(1, 288, 800)).toBe(true)
  })

  it('counts a card taller than the window by the half of the window it fills', () => {
    expect(introVisible(0.2, 500, 800)).toBe(true)
    expect(introVisible(0.2, 300, 800)).toBe(false)
  })
})
