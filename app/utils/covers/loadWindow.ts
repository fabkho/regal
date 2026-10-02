// The load window: lazy loading for Book textures, the WebGL counterpart of
// <img loading="lazy"> with a generous rootMargin. Pure, so it's unit-tested.
//
// Every image job gets a rank (lower loads sooner, see loadQueue.ts), read
// again each time a slot frees up, so the window moves with the scroll:
//
// - the Book taken out, then the one under the pointer, before anything else;
// - faces the pile shows (the Spine; the front of the top Book): first those
//   in view and within LOOK_AHEAD view heights of it, then, as a background
//   fill, all the rest by distance, so even a fast fling finds them loaded;
// - faces only seen once a Book is taken out (back, blurb, a front under
//   another Book) after every face the pile shows.
//
// The stretch the view covers runs from where it is to where it is heading
// (the scroll target, plus SPEED_LOOK_AHEAD seconds at the current speed), so
// the window reaches further in the scroll direction, the more so the faster.

/** Where the Stack's view is and where it is going, in world metres. */
export interface LoadView {
  /** Height at the middle of the view. */
  focusY: number
  /** Height the middle of the view is easing to (a wheel step or fling ends there). */
  targetY: number
  /** Half the height of the view at the pile. */
  halfView: number
  /** Scroll speed, m/s (up is positive). */
  speed: number
}

/** Whether a face shows in the pile (Spine, top front) or only once taken out. */
export type FaceUse = 'shown' | 'hidden'

/** A Book the visitor is reaching for. */
export type Boost = 'picked' | 'hovered' | null

/** Eager margin around the view, in view heights, on each side. */
export const LOOK_AHEAD = 2
/** Seconds of the current scroll speed the window reaches ahead. */
export const SPEED_LOOK_AHEAD = 1.5

/** Rank bands: eager window below BACKGROUND, background fill below HIDDEN, then faces seen only when taken out. */
export const BACKGROUND = 100
export const HIDDEN = 1000

/** Metres a Book lies outside the stretch the view covers now or is heading to (0 inside). */
export function outsideView(y: number, view: LoadView): number {
  const ahead = view.targetY + view.speed * SPEED_LOOK_AHEAD
  const low = Math.min(view.focusY, ahead) - view.halfView
  const high = Math.max(view.focusY, ahead) + view.halfView
  return y < low ? low - y : y > high ? y - high : 0
}

/** Whether a Book is in the view right now. */
export const inView = (y: number, view: LoadView): boolean => Math.abs(y - view.focusY) <= view.halfView

/**
 * Load rank of one face of a Book at height `y`. Without a view (the
 * Bookcase) faces load in the order queued, the shown ones first.
 */
export function loadRank(y: number | undefined, view: LoadView | null, use: FaceUse, boost: Boost = null): number {
  const hidden = use === 'hidden' ? 0.5 : 0
  if (boost === 'picked') return -3 + hidden
  if (boost === 'hovered') return -2 + hidden
  if (!view) return use === 'hidden' ? HIDDEN : 0
  // No longer in the pile (filtered out): after everything in it.
  if (y === undefined) return (use === 'hidden' ? HIDDEN : BACKGROUND) + 50
  const outside = outsideView(y, view)
  // Inside the stretch, nearest where the view comes to rest first: the middle
  // of a resting view, the end of a fling (the Books in between only fly by).
  const distance = outside + Math.min(Math.abs(y - view.targetY), 10) * 1e-3
  if (use === 'hidden') return HIDDEN + distance
  const margin = LOOK_AHEAD * 2 * view.halfView
  return outside <= margin ? distance : BACKGROUND + distance
}

/**
 * Slots the less urgent bands may take (of loadQueue's eight): the background
 * fill six, faces seen only when taken out two, so the jobs a scroll makes
 * urgent always find a free slot.
 */
export const LOAD_BANDS = [{ from: BACKGROUND, max: 6 }, { from: HIDDEN, max: 2 }] as const
