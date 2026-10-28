// The Reel's state machine (libellus plan section H, "The refined behaviour").
// Three modes: Playing (the beat runs), Manual (a hand or a key drives the arc,
// auto-play is over for this visit), Detail (the Book in front is out, the sheet
// is open). Pure: each event returns the next state, so the table is testable.
//
// Playing rests (its clock stops, without leaving Playing) while the reel is off
// screen or the tab is hidden, and goes to Manual when its round ends. The pause
// button reads Pause while Playing, rests included (`pauseControl`).
// Reduce Motion never auto-plays; Play is then a no-op.
//
// A release may leave a glide running (a snap to a Book). The arc's live
// position is `frontFocus`, whatever the mode; every event that takes the arc
// (a catch, an arrow key, a tap) reads that, never a stale `focus`.

import { glideFocus, releaseGlide, REEL_DRAG_PX_PER_BOOK } from './drag'
import type { ReelGlide } from './drag'
import { reelDistance, REEL_WRAP_FROM } from './layout'
import { clamp, REEL_BEAT, reelBadge, reelFocus, wholeBook } from './timeline'

export type ReelMode = 'playing' | 'manual' | 'detail'

export interface ReelGlideRun {
  readonly glide: ReelGlide
  /** ms since the glide began. */
  readonly elapsed: number
}

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
  /** The auto-play clock's origin (ms), see `reelPhase`. */
  readonly origin: number
  /** Beats in the current auto-play run (its round). */
  readonly span: number
  /** ms of auto-play since `origin`. */
  readonly elapsed: number
  /** Where the arc stands when not Playing or gliding (whole Books at rest). */
  readonly focus: number
  /** A snap in progress (manual only), or null. */
  readonly glide: ReelGlideRun | null
}

export function createReel(n: number, options: { reduced?: boolean } = {}): ReelState {
  return {
    mode: 'manual',
    n: Math.max(0, n),
    reduced: options.reduced ?? false,
    visible: true,
    played: false,
    origin: 0,
    span: 0,
    elapsed: 0,
    focus: 0,
    glide: null,
  }
}

/** Auto-play can run: at least two Books, and no Reduce Motion. */
export function canAutoPlay(state: Pick<ReelState, 'n' | 'reduced'>): boolean {
  return state.n >= 2 && !state.reduced
}

/** The arc's live position: the clock's while Playing, the glide's while it snaps, `focus` otherwise. */
export function frontFocus(state: ReelState): number {
  if (state.mode === 'playing') return reelFocus(state.origin + state.elapsed)
  if (state.glide) return glideFocus(state.glide.glide, state.glide.elapsed).focus
  return state.focus
}

/** The Book in front (whole Books, wrapped to 0..n-1). */
export function frontIndex(state: ReelState): number {
  if (state.n < 1) return 0
  return modulo(wholeBook(frontFocus(state)), state.n)
}

/** The pause button's label: Pause while Playing (also while it rests off screen), otherwise Play. */
export function pauseControl(state: ReelState): 'pause' | 'play' {
  return state.mode === 'playing' ? 'pause' : 'play'
}

/**
 * The caption's and pills' opacity (0..1): the beat's badge while Playing, 1
 * otherwise (after a takeover, in Manual and in Detail, they stay).
 */
export function badgeOpacity(state: ReelState): number {
  return state.mode === 'playing' ? reelBadge(state.origin + state.elapsed) : 1
}

/** Playing → Manual, keeping the arc where the clock has it (or the glide, where it is). Catches a glide. Detail is untouched. */
export function takeOver(state: ReelState): ReelState {
  if (state.mode === 'detail') return state
  if (state.mode !== 'playing' && !state.glide) return state
  return { ...state, mode: 'manual', focus: frontFocus(state), glide: null }
}

/**
 * A takeover that ends on a Book: Playing (or a glide) is taken over from where
 * the arc is, then the arc snaps to the nearest Book by a drag release's rule
 * (`releaseGlide` at rest: nearest whole Book, REEL_SNAP_MS per Book travelled,
 * kept on the arc). Reduce Motion: no glide, it is there at once. A reel resting
 * on a Book is left as it is (same state back). A tap beside the Books, Pause,
 * a catch that never became a swipe and Reduce Motion switching on use it, so
 * the reel never rests between two Books (a tap at the centre would hit nothing).
 * Detail is untouched.
 */
export function settleOnBook(state: ReelState): ReelState {
  if (state.mode === 'detail' || state.n < 1) return state
  const base = takeOver(state)
  if (base.mode === 'manual' && !base.glide && Number.isInteger(base.focus)) return base
  const glide = releaseGlide(base.focus, REEL_DRAG_PX_PER_BOOK, 0, base.n)
  if (base.reduced || glide.to === base.focus) return { ...base, focus: glide.to, glide: null }
  return { ...base, glide: { glide, elapsed: 0 } }
}

/**
 * Manual → Playing (Play on the pause button). A ringing arc (n ≥ REEL_WRAP_FROM)
 * begins its round at the Book in front and runs n beats. An arc with ends
 * begins at its first Book (or the second, from the last Book) and runs to its
 * last, so it never shows an empty slot. No-op in Detail, without auto-play.
 */
export function play(state: ReelState): ReelState {
  if (state.mode !== 'manual' || !canAutoPlay(state)) return state
  const at = wholeBook(frontFocus(state))
  if (state.n >= REEL_WRAP_FROM) {
    const front = modulo(at, state.n)
    return startRun(state, (front + 1) * REEL_BEAT, state.n)
  }
  let front = clamp(at, 0, state.n - 1)
  if (front >= state.n - 1) front = 0
  return startRun(state, (front + 1) * REEL_BEAT, state.n - 1 - front)
}

/**
 * The first time the reel is in view this visit: Playing. A ringing arc opens
 * with the prototype's swing-in (the last Book comes in from the right). An arc
 * with ends opens on its first Book and runs to its last.
 * Once per visit (`newVisit`), and only while visible.
 */
export function enterView(state: ReelState): ReelState {
  if (state.played || !state.visible || state.mode !== 'manual' || !canAutoPlay(state)) return state
  if (state.n >= REEL_WRAP_FROM) return startRun(state, 0, state.n, true)
  return startRun(state, REEL_BEAT, state.n - 1, true)
}

function startRun(state: ReelState, origin: number, span: number, first = false): ReelState {
  return { ...state, mode: 'playing', played: true, origin, span, elapsed: 0, glide: null, focus: first ? -1 : state.focus }
}

/** A new visit to the page: the reel may auto-play once again. */
export function newVisit(state: ReelState): ReelState {
  return { ...state, played: false }
}

/** The reel went on or off screen, or the tab was hidden or shown. Shown again, it starts its first visit (`enterView`). */
export function setVisible(state: ReelState, visible: boolean): ReelState {
  if (state.visible === visible) return state
  const next = { ...state, visible }
  return visible ? enterView(next) : next
}

/** Reduce Motion switched on or off during the visit. On: a Playing reel is taken over. */
export function setReduced(state: ReelState, reduced: boolean): ReelState {
  if (state.reduced === reduced) return state
  const next = { ...state, reduced }
  return reduced ? settleOnBook(next) : next
}

/**
 * Advance the clocks by `dt` ms: the auto-play while Playing on screen (at the
 * end of its round it rests in Manual on the round's last Book), and a glide.
 */
export function advance(state: ReelState, dt: number): ReelState {
  if (dt <= 0) return state
  let next = state
  if (state.mode === 'playing' && state.visible) {
    const elapsed = state.elapsed + dt
    const total = state.span * REEL_BEAT
    if (elapsed >= total) {
      return {
        ...state,
        mode: 'manual',
        elapsed: total,
        focus: wholeBook(state.origin / REEL_BEAT - 1 + state.span),
        glide: null,
      }
    }
    next = { ...state, elapsed }
  }
  if (next.mode === 'manual' && next.glide) {
    const elapsed = next.glide.elapsed + dt
    const at = glideFocus(next.glide.glide, elapsed)
    if (at.done) return { ...next, focus: next.glide.glide.to, glide: null }
    return { ...next, glide: { glide: next.glide.glide, elapsed } }
  }
  return next
}

/**
 * The finger let go at `velocity` (px/s, right positive): the arc glides and snaps
 * to a Book (see drag.ts). Takes over Playing first, from where the arc is.
 */
export function release(state: ReelState, velocity: number): ReelState {
  if (state.mode === 'detail' || state.n < 1) return state
  const base = takeOver(state)
  const glide = releaseGlide(base.focus, REEL_DRAG_PX_PER_BOOK, velocity, base.n)
  return { ...base, glide: { glide, elapsed: 0 } }
}

/** A drag moves the arc to `focus` (the caller computes it from `frontFocus` at the drag's start). Not from Detail. */
export function dragTo(state: ReelState, focus: number): ReelState {
  if (state.mode === 'detail') return state
  return { ...state, mode: 'manual', focus, glide: null }
}

/**
 * A tap on the Book in front (also mid-play): it comes out and the detail opens.
 * The arc rests on whole Books.
 */
export function openDetail(state: ReelState): ReelState {
  if (state.n < 1 || state.mode === 'detail') return state
  return { ...state, mode: 'detail', focus: wholeBook(frontFocus(state)), glide: null }
}

/** Detail → Manual: Put back, the sheet dragged down, a tap beside the Book, Escape, system Back. */
export function closeDetail(state: ReelState): ReelState {
  if (state.mode !== 'detail') return state
  return { ...state, mode: 'manual' }
}

/**
 * A tap on Book `index`. The front Book opens its detail; a neighbour comes to
 * the front (the short way round for a ringing arc). Either takes over Playing
 * and any glide, from the live position.
 */
export function tapBook(state: ReelState, index: number): ReelState {
  if (state.mode === 'detail' || state.n < 1) return state
  const front = wholeBook(frontFocus(state))
  if (index === modulo(front, state.n)) return openDetail(state)
  return { ...state, mode: 'manual', focus: front + reelDistance(index, front, state.n), glide: null }
}

/** An arrow key: one Book from the live position (stops at the ends unless the arc rings). Takes over Playing and a glide. */
export function step(state: ReelState, direction: -1 | 1): ReelState {
  if (state.mode === 'detail' || state.n < 1) return state
  const next = wholeBook(frontFocus(state)) + direction
  const focus = state.n >= REEL_WRAP_FROM ? next : clamp(next, 0, state.n - 1)
  return { ...state, mode: 'manual', focus: focus + 0, glide: null }
}

function modulo(value: number, n: number): number {
  return ((value % n) + n) % n
}
