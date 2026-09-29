import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { importLibrary } from '../../shared/library/importLibrary'
import { clickBook, flip, putAway, SHELVED } from '../../app/utils/books/pick'
import { layoutStack } from '../../app/utils/stack/layout'

const demo = importLibrary(readFileSync(new URL('../../app/assets/data/demo-library.csv', import.meta.url), 'utf8')).books

describe('Pick state machine', () => {
  it('cycles a Book through front, back and put away, like mawise/bookshelf', () => {
    const front = clickBook(SHELVED, 'a')
    expect(front).toEqual({ bookId: 'a', face: 'front' })
    const back = clickBook(front, 'a')
    expect(back).toEqual({ bookId: 'a', face: 'back' })
    expect(clickBook(back, 'a')).toEqual(SHELVED)
  })

  it('swaps to another Book showing its front', () => {
    expect(clickBook({ bookId: 'a', face: 'back' }, 'b')).toEqual({ bookId: 'b', face: 'front' })
  })

  it('flips only when a Book is out, and puts away from anywhere', () => {
    expect(flip(SHELVED)).toEqual(SHELVED)
    expect(flip({ bookId: 'a', face: 'front' })).toEqual({ bookId: 'a', face: 'back' })
    expect(putAway()).toEqual(SHELVED)
  })
})

describe('layoutStack', () => {
  const { poses, height } = layoutStack(demo)

  it('stacks every Book once', () => {
    expect(poses).toHaveLength(demo.length)
    expect(new Set(poses.map(p => p.bookId)).size).toBe(demo.length)
  })

  it('lies Books flat on top of each other without overlapping', () => {
    const sorted = [...poses].sort((a, b) => a.y - b.y)
    expect(sorted[0]!.y - sorted[0]!.thickness / 2).toBeCloseTo(0)
    for (let i = 1; i < sorted.length; i++) {
      const below = sorted[i - 1]!
      const above = sorted[i]!
      expect(above.y - above.thickness / 2).toBeGreaterThanOrEqual(below.y + below.thickness / 2)
    }
    const top = sorted.at(-1)!
    expect(height).toBeGreaterThanOrEqual(top.y + top.thickness / 2)
    for (const pose of poses) expect(pose.rotation[2]).toBeCloseTo(Math.PI / 2)
  })

  it('puts what you are reading now on top', () => {
    const top = [...poses].sort((a, b) => b.y - a.y)[0]!
    expect(top.section).toBe('currently-reading')
  })

  it('is deterministic', () => {
    expect(layoutStack([...demo].reverse())).toEqual(layoutStack(demo))
  })
})
