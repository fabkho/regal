import { describe, expect, it } from 'vitest'
import type { BookPose } from '../../app/utils/books/pose'
import { chooseShuffle, countMoves, longestIncreasing } from '../../app/utils/stack/moves'

/** Poses bottom-up in the given order (only bookId and y matter here). */
const pile = (...ids: string[]): BookPose[] => ids.map((bookId, index) => ({
  bookId, x: 0, y: index * 0.03, z: 0, rotation: [0, 0, Math.PI / 2], thickness: 0.03, height: 0.2, depth: 0.13, color: '#000', section: 'read',
}))

describe('longestIncreasing', () => {
  it('finds the longest run already in order', () => {
    expect(longestIncreasing([])).toBe(0)
    expect(longestIncreasing([0, 1, 2, 3])).toBe(4)
    expect(longestIncreasing([3, 2, 1, 0])).toBe(1)
    expect(longestIncreasing([2, 0, 3, 1, 4])).toBe(3)
  })
})

describe('countMoves', () => {
  it('counts only the books that must move', () => {
    expect(countMoves(pile('a', 'b', 'c', 'd'), pile('a', 'b', 'c', 'd'))).toBe(0)
    expect(countMoves(pile('a', 'b', 'c', 'd'), pile('b', 'c', 'd', 'a'))).toBe(1)
    expect(countMoves(pile('a', 'b', 'c', 'd'), pile('d', 'c', 'b', 'a'))).toBe(3)
  })

  it('counts newly shown books and ignores vanished ones', () => {
    expect(countMoves(pile('a', 'b', 'c'), pile('a', 'c', 'x'))).toBe(1)
  })
})

describe('chooseShuffle', () => {
  it('stays calm up to the threshold', () => {
    expect(chooseShuffle(5, 5, 'carousel')).toBe('hand')
    expect(chooseShuffle(6, 5, 'carousel')).toBe('carousel')
    expect(chooseShuffle(40, null, 'carousel')).toBe('hand')
  })
})
