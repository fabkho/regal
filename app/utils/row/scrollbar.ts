// RegalBooksRow's scroll bar: the thumb's size and where a drag puts it. Pure.

/** The thumb never gets thinner than this (px): the mark stays findable with 100 Books. */
export const SCROLLBAR_MIN_THUMB = 28

/** The thumb's width (px): the share of the track the card shows, but not thinner than SCROLLBAR_MIN_THUMB. */
export function thumbWidth(share: number, trackWidth: number): number {
  return Math.min(trackWidth, Math.max(SCROLLBAR_MIN_THUMB, share * trackWidth))
}

/**
 * Where a press at `x` (px from the track's left) holds the thumb: on it, it
 * keeps the spot that was grabbed; beside it, its middle goes to `x`.
 */
export function grabOffset(x: number, progress: number, share: number, trackWidth: number): number {
  const thumb = thumbWidth(share, trackWidth)
  const left = progress * (trackWidth - thumb)
  return x >= left && x <= left + thumb ? x - left : thumb / 2
}

/** The scroll progress (0..1) with the thumb's grabbed spot at `x`. */
export function scrubProgress(x: number, grab: number, share: number, trackWidth: number): number {
  const free = trackWidth - thumbWidth(share, trackWidth)
  if (free <= 0) return 0
  return Math.min(1, Math.max(0, (x - grab) / free))
}
