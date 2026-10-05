import { describe, expect, it } from 'vitest'
import { backArtUrl, backDrawDue } from '../../app/utils/books/backs'
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

describe('backArtUrl', () => {
  it('is unknown (undefined) until the Book\'s faces are known: no back is prepared then', () => {
    expect(backArtUrl(undefined)).toBeUndefined()
  })

  it('tells a Book without art (null) from one whose faces are not known yet', () => {
    expect(backArtUrl(null)).toBeNull()
    expect(backArtUrl({})).toBeNull()
    expect(backArtUrl({ back: 'https://books.example/v2/123/back.webp' })).toBe('https://books.example/v2/123/back.webp')
  })

  it('a back asked for before the faces were known waits instead of being drawn without its art', () => {
    // Pressed during a slow entrance: unknown, nothing prepared, nothing due.
    const before: { back?: string } | null | undefined = undefined
    expect(backArtUrl(before)).toBeUndefined()
    // The faces arrive: the next frame prepares it with its art.
    const after: { back?: string } | null | undefined = { back: 'back.webp' }
    expect(backArtUrl(after)).toBe('back.webp')
    // Only now is the art awaited; drawing waits for it (artReady false until decoded).
    expect(backDrawDue({ pick: 1, face: 'back', artReady: false, queued: false })).toBe(false)
  })
})
