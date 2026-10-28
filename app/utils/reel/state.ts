// The Reel's state machine (libellus plan section H, "The refined behaviour").
// Three modes: Playing (the beat runs), Manual (a hand or a key drives the arc,
// auto-play is over for this visit), Detail (the Book in front is out, the sheet
// is open). Pure: each event returns the next state, so the table is testable.
//
// Playing rests (its clock stops, without leaving Playing) while the reel is off
// screen or the tab is hidden, and goes to Manual when the first round ends.
// Reduce Motion never auto-plays; Play is then a no-op.

import { reelDistance, REEL_WRAP_FROM } from './layout'
import { clamp, REEL_BEAT, REEL_ROUNDS, reelPhase, reelTotal } from './timeline'

export type ReelMode = 'playing' | 'manual' | 'detail'

export interface ReelState {
  readonly mode: ReelMode
  /** Books in the reel. */
  readonly n: number
  /** prefers-reduced-motion: reduce. */
  readonly reduced: boolean
  /** The reel is on screen and its tab visible. */
  readonly visible: boolean
  /** Auto-play has started in this visit (it starts once per visit). */
  readonly played: boolean
  /** The auto-play clock's origin (ms): where the beats start, see `reelPhase`. */
  readonly origin: number
  /** ms of auto-play since `origin`. */
  readonly elapsed: number
  /** Where the arc stands when not Playing (continuous while dragged, whole Books at rest). */
  readonly focus: number
}

export function createReel(n: number, options: { reduced?: boolean } = {}): ReelState {
  return {
    mode: 'manual',
    n: Math.max(0, n),
    reduced: options.reduced ?? false,
    visible: true,
    played: false,
    origin: 0,
    elapsed: 0,
    focus: 0,
  }
}

/** Auto-play can run: at least two Books, and no Reduce Motion. */
export function canAutoPlay(state: Pick<ReelState, 'n' | 'reduced'>): boolean {
  return state.n >= 2 && !state.reduced
}

/** The arc's position now: the clock's while Playing, `focus` otherwise. */
export function frontFocus(state: ReelState): number {
  return state.mode === 'playing' ? reelPhase(state.origin + state.elapsed).focus : state.focus
}

/** The index of the Book in front (whole Books, wrapped). */
export function frontIndex(state: ReelState): number {
  if (state.n < 1) return 0
  return ((Math.round(frontFocus(state)) % state.n) + state.n) % state.n
}

/** Playing → Manual, keeping the arc where the clock has it. Otherwise unchanged. */
export function takeOver(state: ReelState): ReelState {
  if (state.mode !== 'playing') return state
  return { ...state, mode: 'manual', focus: frontFocus(state) }
}

/**
 * Manual → Playing (Play on the pause button). It restarts from the Book in
 * front: a ringing arc (n ≥ REEL_WRAP_FROM) begins its round there, an arc
 * with ends begins at its first Book. No-op in Detail, without auto-play.
 */
export function play(state: ReelState): ReelState {
  if (state.mode !== 'manual' || !canAutoPlay(state)) return state
  const origin = state.n >= REEL_WRAP_FROM ? (Math.round(state.focus) + 1) * REEL_BEAT : 0
  return { ...state, mode: 'playing', played: true, origin, elapsed: 0 }
}

/**
 * The first time the reel is in view this visit: Playing, from the prototype's
 * opening pose (the last Book swings in from the right). Once per visit (`newVisit`).
 */
export function enterView(state: ReelState): ReelState {
  if (state.played || state.mode !== 'manual' || !canAutoPlay(state)) return state
  return { ...state, mode: 'playing', played: true, origin: 0, elapsed: 0, focus: -1 }
}

/** A new visit to the page: the reel may auto-play once again. */
export function newVisit(state: ReelState): ReelState {
  return { ...state, played: false }
}

/** The reel went on or off screen, or the tab was hidden or shown. Off, Playing rests. */
export function setVisible(state: ReelState, visible: boolean): ReelState {
  return state.visible === visible ? state : { ...state, visible }
}

/**
 * Advance the auto-play clock by `dt` ms. Only Playing, on screen, moves.
 * At the end of the round the reel rests in Manual on the last Book of the round.
 */
export function advance(state: ReelState, dt: number): ReelState {
  if (state.mode !== 'playing' || !state.visible || dt <= 0) return state
  const elapsed = state.elapsed + dt
  const total = reelTotal(state.n, REEL_ROUNDS)
  if (elapsed < total) return { ...state, elapsed }
  return {
    ...state,
    mode: 'manual',
    elapsed: total,
    focus: state.origin / REEL_BEAT - 1 + state.n * REEL_ROUNDS,
  }
}

/** Playing or Manual → Manual with the arc at `focus` (a drag, its catch, its snap). Detail is not left by a drag. */
export function dragTo(state: ReelState, focus: number): ReelState {
  if (state.mode === 'detail') return state
  return { ...state, mode: 'manual', focus }
}

/**
 * A tap on the Book in front (also mid-play): it comes out and the detail opens.
 * The arc rests on whole Books.
 */
export function openDetail(state: ReelState): ReelState {
  if (state.n < 1 || state.mode === 'detail') return state
  return { ...state, mode: 'detail', focus: Math.round(frontFocus(state)) }
}

/** Detail → Manual: Put back, the sheet dragged down, a tap beside the Book, Escape, system Back. */
export function closeDetail(state: ReelState): ReelState {
  if (state.mode !== 'detail') return state
  return { ...state, mode: 'manual' }
}

/**
 * A tap on Book `index`. The front Book opens its detail; a neighbour comes to
 * the front (the short way round for a ringing arc). Either takes over Playing.
 */
export function tapBook(state: ReelState, index: number): ReelState {
  if (state.mode === 'detail' || state.n < 1) return state
  const front = Math.round(frontFocus(state))
  if (index === frontIndex(state)) return openDetail(state)
  return { ...state, mode: 'manual', focus: front + reelDistance(index, front, state.n) }
}

/** An arrow key, one Book (the arc stops at the ends unless it rings). Takes over Playing. */
export function step(state: ReelState, direction: -1 | 1): ReelState {
  if (state.mode === 'detail' || state.n < 1) return state
  const next = Math.round(frontFocus(state)) + direction
  const focus = state.n >= REEL_WRAP_FROM ? next : clamp(next, 0, state.n - 1)
  return { ...state, mode: 'manual', focus }
}
