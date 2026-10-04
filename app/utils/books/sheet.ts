// The details as a bottom sheet on narrow stages (a phone), where the card
// at the bottom right would cover the picked Book. Docked to the stage's
// bottom edge, full width, as short as it can be; more on demand.
//
// Prototype variants (?sheet=a|b|c), for the owner to choose one:
//   a  compact: title, author, stars, meta, actions and a two-line blurb;
//      "More" (or a drag up) opens it to the whole blurb and the review.
//   b  capped: everything, at most CAPPED_SHARE of the stage, scrolling inside.
//   c  pages: one short strip (title … actions); the blurb and the review are
//      pages beside it, swiped to sideways, so the sheet never changes height.
// Dragging the grip down puts the Book back (or closes an open sheet).

export type SheetVariant = 'a' | 'b' | 'c'

const VARIANTS: readonly SheetVariant[] = ['a', 'b', 'c']

/** Stages this wide or narrower show the sheet instead of the card. */
export const SHEET_MAX_WIDTH = 560
/** Variant b: the sheet's most height, as a share of the stage. */
export const CAPPED_SHARE = 0.4
/** Variant a, opened: the sheet's most height, as a share of the stage. */
export const OPEN_SHARE = 0.72

/** Which sheet a stage of `width` px shows (null: the card), `query` being ?sheet. */
export function resolveSheetVariant(query: unknown, width: number): SheetVariant | null {
  // Not measured yet (server render, first frame): the card, as before.
  if (!width || width > SHEET_MAX_WIDTH) return null
  const value = String(Array.isArray(query) ? query[0] : query ?? '').toLowerCase()
  if (value === 'off') return null
  return VARIANTS.includes(value as SheetVariant) ? value as SheetVariant : 'a'
}

// --- Dragging the grip --------------------------------------------------------

/** Below this (px) a press on the grip is a tap. */
export const TAP_SLOP = 6
/** A release faster than this (px/ms) is a flick, whatever the distance. */
export const FLICK_SPEED = 0.45
/** Drag up (px) that opens a compact sheet. */
export const OPEN_DISTANCE = 36
/** Drag down that closes or puts back: this share of the sheet's height, DISMISS_MIN to DISMISS_MAX px. */
export const DISMISS_SHARE = 0.35
export const DISMISS_MIN = 56
export const DISMISS_MAX = 120
/** How far (px) the sheet gives when pulled up past its height. */
export const RUBBER = 28

export type SheetSettle = 'tap' | 'stay' | 'expand' | 'collapse' | 'dismiss'

export interface SheetDrag {
  /** Finger travel since the press, px, + down. */
  dy: number
  /** Finger speed at the release, px/ms, + down. */
  velocity: number
  /** The sheet's height, px. */
  height: number
  /** It can open further (variant a, compact). */
  expandable: boolean
  expanded: boolean
}

/** What a released drag on the grip does. */
export function settleDrag({ dy, velocity, height, expandable, expanded }: SheetDrag): SheetSettle {
  if (Math.abs(dy) < TAP_SLOP && Math.abs(velocity) < FLICK_SPEED) return 'tap'
  const distance = Math.min(DISMISS_MAX, Math.max(DISMISS_MIN, height * DISMISS_SHARE))
  const down = velocity > FLICK_SPEED || (velocity > -FLICK_SPEED && dy > distance)
  if (down) return expanded ? 'collapse' : 'dismiss'
  const up = velocity < -FLICK_SPEED || (velocity < FLICK_SPEED && dy < -OPEN_DISTANCE)
  if (up && expandable && !expanded) return 'expand'
  return 'stay'
}

/** Where the sheet is drawn while dragged `dy` px: it follows down, gives a little up. */
export function dragOffset(dy: number): number {
  if (dy >= 0) return dy
  return -RUBBER * (1 - Math.exp(dy / RUBBER))
}
