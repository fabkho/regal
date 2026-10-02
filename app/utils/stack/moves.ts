// How many Books a re-sort really moves: everything outside the longest run
// already in the right relative order (those can stay put), plus Books that
// newly appear. The same count the 'hand' shuffle works with; used to pick a
// calm animation for small re-sorts and the carousel for big ones.
import type { BookPose } from '../books/pose'

/** Length of the longest strictly increasing subsequence (patience sorting, O(n log n)). */
export function longestIncreasing(values: number[]): number {
  const tails: number[] = []
  for (const value of values) {
    let low = 0
    let high = tails.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (tails[mid]! < value) low = mid + 1
      else high = mid
    }
    tails[low] = value
  }
  return tails.length
}

/** Books that must move when the Stack goes from `from` to `to` (bottom-up order by height). */
export function countMoves(from: BookPose[], to: BookPose[]): number {
  const before = new Set(from.map(pose => pose.bookId))
  const newRank = new Map([...to].sort((a, b) => a.y - b.y).map((pose, index) => [pose.bookId, index]))
  const kept = [...from]
    .sort((a, b) => a.y - b.y)
    .filter(pose => newRank.has(pose.bookId))
    .map(pose => newRank.get(pose.bookId)!)
  const appearing = to.filter(pose => !before.has(pose.bookId)).length
  return kept.length - longestIncreasing(kept) + appearing
}

/** Re-sorts moving up to this many Books use the calm 'hand' style. */
export const HAND_MAX_MOVES = 3

/** The animation for a re-sort: 'hand' up to HAND_MAX_MOVES moved Books, else 'carousel'. */
export function chooseShuffle(moves: number): 'hand' | 'carousel' {
  return moves <= HAND_MAX_MOVES ? 'hand' : 'carousel'
}
