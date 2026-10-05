// The details as a bottom sheet on narrow stages (a phone), where the card
// at the bottom right would cover the picked Book. On the viewport's bottom
// edge, full width, over whatever the host has under the stage; its top edge
// no higher than SHEET_SHARE of the stage up from the stage's bottom. What
// doesn't fit scrolls inside. Dragging its grip down puts the Book back.

/** Stages this wide or narrower show the sheet instead of the card. */
export const SHEET_MAX_WIDTH = 560
/** How far up the stage the sheet reaches at most, as a share of the stage. */
export const SHEET_SHARE = 0.3

/**
 * The sheet's most height (px): SHEET_SHARE of the stage, plus the room
 * between the stage's bottom and the viewport's (the host's content there,
 * which the sheet covers while it is open).
 */
export function sheetMaxHeight(input: { stageHeight: number, stageBottom: number, viewportHeight: number }): number {
  return Math.round(input.stageHeight * SHEET_SHARE + Math.max(0, input.viewportHeight - input.stageBottom))
}

/** A stage `width` px wide shows the sheet (0: not measured yet, the card as before). */
export function showsSheet(width: number): boolean {
  return width > 0 && width <= SHEET_MAX_WIDTH
}

// --- Dragging the grip --------------------------------------------------------

/** The finger moves this far (px) before the sheet follows (a tap stays a tap). */
export const TAP_SLOP = 6
/** A release faster than this (px/ms) is a flick, whatever the distance. */
export const FLICK_SPEED = 0.45
/** Drag down that puts back: this share of the sheet's height, DISMISS_MIN to DISMISS_MAX px. */
export const DISMISS_SHARE = 0.35
export const DISMISS_MIN = 56
export const DISMISS_MAX = 120
/** How far (px) the sheet gives when pulled up. */
export const RUBBER = 28

export type SheetSettle = 'stay' | 'dismiss'

export interface SheetDrag {
  /** Finger travel since the press, px, + down. */
  dy: number
  /** Finger speed at the release, px/ms, + down. */
  velocity: number
  /** The sheet's height, px. */
  height: number
}

/** What a released drag on the grip does: put the Book back, or spring back. */
export function settleDrag({ dy, velocity, height }: SheetDrag): SheetSettle {
  const distance = Math.min(DISMISS_MAX, Math.max(DISMISS_MIN, height * DISMISS_SHARE))
  const down = velocity > FLICK_SPEED || (velocity > -FLICK_SPEED && dy > distance)
  return down ? 'dismiss' : 'stay'
}

/** Where the sheet is drawn while dragged `dy` px: it follows down, gives a little up. */
export function dragOffset(dy: number): number {
  if (dy >= 0) return dy
  return -RUBBER * (1 - Math.exp(dy / RUBBER))
}
