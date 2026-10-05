import { describe, expect, it } from 'vitest'
import { backDrawDue } from '../../app/utils/books/backs'
import type { BackDue } from '../../app/utils/books/backs'

const state = (over: Partial<BackDue> = {}): BackDue => ({ pick: 1, face: 'front', artReady: true, queued: false, ...over })

describe('backDrawDue', () => {
  it('draws the back once the Book has arrived in front of the camera', () => {
    expect(backDrawDue(state({ pick: 1 }))).toBe(true)
  })

  it('never during the flight: the drawing would stutter it', () => {
    for (const pick of [0, 0.3, 0.7, 0.999]) expect(backDrawDue(state({ pick }))).toBe(false)
  })

  it('at once when the back is asked for before the Book has arrived', () => {
    expect(backDrawDue(state({ pick: 0.4, face: 'back' }))).toBe(true)
  })

  it('waits for the art rather than drawing a back without it', () => {
    expect(backDrawDue(state({ artReady: false }))).toBe(false)
    expect(backDrawDue(state({ artReady: false, face: 'back' }))).toBe(false)
  })

  it('draws once', () => {
    expect(backDrawDue(state({ queued: true }))).toBe(false)
  })
})
