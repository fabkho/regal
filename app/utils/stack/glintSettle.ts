// When the Stack's focused Book glints (the light sweeping along it). Scrolling
// moves the focus line from Book to Book, and a glint on each one turned a
// flick into a chain of sparks. Now the glint waits until a scroll has come
// to rest on a Book (a glide counts as scrolling until it has run out), then
// a beat longer, and then glints that Book once. Scrolling again before the
// beat is up disarms it: nothing fires, nothing is kept for later. Only a
// scroll arms it, so a focus that changes under a resting pile (a Book put
// back, swapped, the pile loading) doesn't glint. A Book the pointer enters
// glints at once, elsewhere (Meshes.vue). Pure, so it's unit-testable;
// Meshes.vue feeds it each frame from the scroll the Stack publishes
// (utils/stack/scrollHighlight.ts: StackScroll).

/** Slower than this (m/s, under a Book's thickness per second) the pile is at rest. */
export const SETTLE_SPEED = 0.02
/** Nearer than this (m) to where it is heading (StackScroll.targetY) the view has arrived. */
export const SETTLE_GAP = 0.005
/** How long the pile rests on a Book before it glints (s): a beat, not a wait. */
export const GLINT_DELAY = 0.3
/** What the dev-only ?glintDelay= may be set to (s). */
export const GLINT_DELAY_LIMITS = [0, 3] as const

export interface GlintSettle {
  /** A scroll has happened since the last glint (or since the pile was blocked). */
  armed: boolean
  /** The Book the pile is resting on, timed. */
  bookId: string | null
  /** How long it has rested on it (s). */
  rested: number
}

export function createGlintSettle(): GlintSettle {
  return { armed: false, bookId: null, rested: 0 }
}

export interface ScrollFrame {
  /** The Book on the focus line (null when there is none or hover leads). */
  focusedId: string | null
  /** How fast the view moves (m/s, StackScroll.speed). */
  speed: number
  /** How far the view still has to go (m): |targetY − focusY|. */
  gap: number
  /** A Book is out or the pile is being re-sorted: no scroll highlight at all. */
  blocked: boolean
}

/** The pile is moving: scrolling, easing towards a wheel step or gliding after a flick. */
export function scrolling(frame: Pick<ScrollFrame, 'speed' | 'gap'>): boolean {
  return Math.abs(frame.speed) > SETTLE_SPEED || frame.gap > SETTLE_GAP
}

/**
 * One frame (`delta` s): the Book to glint now, or null. Updates `state` in
 * place. `delay`: the beat the pile rests before the glint.
 */
export function settledGlint(state: GlintSettle, frame: ScrollFrame, delta: number, delay = GLINT_DELAY): string | null {
  if (frame.blocked) {
    state.armed = false
    state.bookId = null
    state.rested = 0
    return null
  }
  if (scrolling(frame)) {
    state.armed = true
    state.bookId = null
    state.rested = 0
    return null
  }
  if (frame.focusedId !== state.bookId) {
    state.bookId = frame.focusedId
    state.rested = 0
  }
  // At rest on nothing (hover leads): the scroll's glint is spent, not kept for later.
  if (!state.bookId) state.armed = false
  if (!state.armed || !state.bookId) return null
  state.rested += delta
  if (state.rested < delay) return null
  state.armed = false
  return state.bookId
}

/** The beat before a glint, tuned from a route query on the dev server (?glintDelay= seconds, clamped). */
export function glintDelay(query: Readonly<Record<string, unknown>>): number {
  const value = query.glintDelay
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  if (!Number.isFinite(parsed)) return GLINT_DELAY
  return Math.min(GLINT_DELAY_LIMITS[1], Math.max(GLINT_DELAY_LIMITS[0], parsed))
}
