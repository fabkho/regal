import { describe, expect, it } from 'vitest'
import {
  clampInto, closeTarget, easeInOut, followRect, fromStage, labelFor, nearRect, pickChange, planClose, planOpen,
  sampleLeg, toStage,
} from '../../app/utils/books/labelMorph'
import type { MorphFrame, Rect, ShownLabel } from '../../app/utils/books/labelMorph'

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height })
const stage = rect(100, 50, 800, 600)
const card = rect(560, 300, 320, 330)
const hover = (bookId: string, r = rect(300, 200, 180, 26)): ShownLabel => ({ kind: 'hover', bookId, rect: r })
const focus = (bookId: string, r = rect(420, 260, 200, 26)): ShownLabel => ({ kind: 'focus', bookId, rect: r })

describe('pickChange', () => {
  it('tells open, close, swap and no change apart', () => {
    expect(pickChange(null, 'a')).toBe('open')
    expect(pickChange('a', null)).toBe('close')
    expect(pickChange('a', 'b')).toBe('swap')
    expect(pickChange('a', 'a')).toBe('none')
    expect(pickChange(null, null)).toBe('none')
  })
})

describe('labelFor', () => {
  it('prefers the hover label, else the focus label showing that Book', () => {
    expect(labelFor('a', [focus('a'), hover('a')])?.kind).toBe('hover')
    expect(labelFor('a', [focus('a'), hover('b')])?.kind).toBe('focus')
    expect(labelFor('a', [focus('b'), hover('b'), null])).toBeNull()
  })
})

describe('planOpen', () => {
  it('morphs from the label on screen, label text showing, card content not yet', () => {
    const plan = planOpen({ bookId: 'a', labels: [hover('a')], running: null, reduced: false })
    expect(plan).toEqual({ kind: 'morph', from: { rect: hover('a').rect, label: 1, card: 0 }, source: hover('a') })
  })

  it('falls back to the focus label when the hover label shows another Book', () => {
    const plan = planOpen({ bookId: 'a', labels: [hover('b'), focus('a')], running: null, reduced: false })
    expect(plan.kind === 'morph' && plan.source?.kind).toBe('focus')
  })

  it('fades in when no label shows the Book (a pick from the list or the keyboard)', () => {
    expect(planOpen({ bookId: 'a', labels: [hover('b')], running: null, reduced: false })).toEqual({ kind: 'fade' })
    expect(planOpen({ bookId: 'a', labels: [], running: null, reduced: false })).toEqual({ kind: 'fade' })
  })

  it('retargets from wherever the box is when a close is still under way', () => {
    const running: MorphFrame = { rect: rect(400, 260, 250, 120), label: 0.4, card: 0.3 }
    expect(planOpen({ bookId: 'b', labels: [], running, reduced: false })).toEqual({ kind: 'morph', from: running, source: null })
  })

  it('never morphs with reduced motion', () => {
    expect(planOpen({ bookId: 'a', labels: [hover('a')], running: null, reduced: true })).toEqual({ kind: 'fade' })
  })
})

describe('planClose', () => {
  it('morphs back from the card when the card came from a label', () => {
    expect(planClose({ card, running: null, hasSource: true, reduced: false }))
      .toEqual({ kind: 'morph', from: { rect: card, label: 0, card: 1 }, source: null })
  })

  it('fades out when there is nothing to go back to (opened from the list)', () => {
    expect(planClose({ card, running: null, hasSource: false, reduced: false })).toEqual({ kind: 'fade' })
  })

  it('turns round mid-open from where the box is', () => {
    const running: MorphFrame = { rect: rect(420, 250, 200, 90), label: 0.2, card: 0.1 }
    expect(planClose({ card, running, hasSource: true, reduced: false })).toEqual({ kind: 'morph', from: running, source: null })
  })

  it('fades with reduced motion or without a card to start from', () => {
    expect(planClose({ card, running: null, hasSource: true, reduced: true })).toEqual({ kind: 'fade' })
    expect(planClose({ card: null, running: null, hasSource: true, reduced: false })).toEqual({ kind: 'fade' })
  })
})

describe('closeTarget', () => {
  const stored = toStage(rect(300, 200, 180, 26), stage)

  it('lands on the label that shows the Book, which then takes over', () => {
    const live = hover('a', rect(510, 330, 180, 26))
    expect(closeTarget({ bookId: 'a', labels: [live], stored, stage })).toEqual({ rect: live.rect, landing: 'label' })
  })

  it('else goes back where the label was at open, sized for this Book, and fades', () => {
    expect(closeTarget({ bookId: 'a', labels: [hover('b')], stored, stage, size: { width: 150, height: 26 } }))
      .toEqual({ rect: rect(300, 200, 150, 26), landing: 'fade' })
  })

  it('follows the stage when the page scrolled since the open', () => {
    const scrolled = { ...stage, y: stage.y - 120 }
    expect(closeTarget({ bookId: 'a', labels: [], stored, stage: scrolled }).rect).toEqual(rect(300, 80, 180, 26))
  })

  it('keeps the stored place inside the stage', () => {
    const outside = toStage(rect(820, 40, 180, 26), stage)
    expect(closeTarget({ bookId: 'a', labels: [], stored: outside, stage }).rect).toEqual(rect(712, 58, 180, 26))
  })
})

describe('geometry', () => {
  it('converts to the stage and back', () => {
    const r = rect(300, 200, 10, 20)
    expect(fromStage(toStage(r, stage), stage)).toEqual(r)
  })

  it('clamps into bounds and shrinks what does not fit', () => {
    expect(clampInto(rect(0, 0, 50, 20), stage)).toEqual(rect(108, 58, 50, 20))
    expect(clampInto(rect(0, 0, 2000, 20), stage, 0)).toEqual(rect(100, 50, 800, 20))
  })

  it('eases in and out, from 0 to 1', () => {
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(0.5)).toBe(0.5)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.25)).toBeLessThan(0.25)
    expect(easeInOut(-1)).toBe(0)
  })

  it('follows a moving target without jumping to it', () => {
    const from = rect(0, 0, 100, 100)
    const to = rect(100, 0, 100, 100)
    const step = followRect(from, to, 16)
    expect(step.x).toBeGreaterThan(0)
    expect(step.x).toBeLessThan(50)
    let current = from
    for (let frame = 0; frame < 40; frame++) current = followRect(current, to, 16)
    expect(nearRect(current, to)).toBe(true)
  })
})

describe('sampleLeg', () => {
  const label = rect(300, 200, 180, 26)

  it('opens: the box starts as the label and ends as the card', () => {
    const leg = { direction: 'open' as const, from: { rect: label, label: 1, card: 0 } }
    expect(sampleLeg(leg, 0, card)).toEqual({ rect: label, label: 1, card: 0 })
    expect(sampleLeg(leg, 1, card)).toEqual({ rect: card, label: 0, card: 1 })
  })

  it('fades the label text out early and the card content in as the box arrives', () => {
    const leg = { direction: 'open' as const, from: { rect: label, label: 1, card: 0 } }
    const early = sampleLeg(leg, 0.4, card)
    expect(early.label).toBe(0)
    expect(early.card).toBe(0)
    const late = sampleLeg(leg, 0.8, card)
    expect(late.card).toBeGreaterThan(0.5)
  })

  it('closes the other way round', () => {
    const leg = { direction: 'close' as const, from: { rect: card, label: 0, card: 1 } }
    expect(sampleLeg(leg, 0.4, label).card).toBe(0)
    expect(sampleLeg(leg, 1, label)).toEqual({ rect: label, label: 1, card: 0 })
  })

  it('retargets continuously: a turned-round leg starts exactly where the box was', () => {
    const open = { direction: 'open' as const, from: { rect: label, label: 1, card: 0 } }
    const midway = sampleLeg(open, 0.6, card)
    const close = { direction: 'close' as const, from: midway }
    expect(sampleLeg(close, 0, label)).toEqual(midway)
  })
})
