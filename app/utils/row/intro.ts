// The row's intro (RegalBooksRow): the first time a row shows, its Books come
// into place the way the Stack's pile does (utils/stack/shuffle.ts settleIn),
// turned for a row: each Book pops in a little to the right of its place and
// slides home, cascading from the left (the pile's bottom) to the right, so
// the newest land last. Pure: a plan, read per Book and per frame as offsets
// from the Book's rest pose, and the gate that decides when it plays.
//
// It plays once per mount, and only once the Spines of the Books in view are
// drawn (nothing shows before, so no texture pops in after it), at most
// INTRO_WAIT after the row has its Books. Reduce Motion: no intro, the row
// just shows once its Spines are drawn.

/** What the intro does to one Book at one moment, on top of its rest pose. */
export interface IntroOffset {
  /** Along the row (m). */
  dx: number
  /** Size, 0 (not there yet) to 1. */
  scale: number
}

export interface RowIntroBook {
  x: number
}

export interface RowIntroView {
  /** World x the camera looks at. */
  cameraX: number
  /** Half the width the view shows at the row (m). */
  halfView: number
}

export interface RowIntroPlan {
  /** Seconds. */
  duration: number
  /** Offsets of Book `index` (of the poses planned) at `t` seconds; `into` is filled and returned. */
  at: (index: number, t: number, into: IntroOffset) => IntroOffset
}

/** The Stack's settle-in (shuffle.ts): SWAP_SETTLE, SWAP_CASCADE, SETTLE_DROP. */
const STACK = { settle: 0.45, cascade: 0.3, drop: 0.05 }
/** Longest the intro runs (s): the Stack's, a little quicker. */
export const INTRO_MAX = 0.7
const SPEED = (STACK.settle + STACK.cascade) / INTRO_MAX
const SETTLE = STACK.settle / SPEED
const CASCADE = STACK.cascade / SPEED
/** Share of its settle over which a Book pops in (the Stack's appear, settleIn). */
const POP = 0.7

/**
 * The dates, their leader lines, the focus label and the scroll bar fade in
 * (Card.vue, a short CSS fade) once the Books are home: this long before the
 * intro ends (s), so the two overlap a little and read as one motion.
 */
export const INTRO_LABELS_OVERLAP = 0.1

/** Longest the row waits, unseen, for the Spines in view (ms); past it, it plays anyway. */
export const INTRO_WAIT = 2500

/**
 * Margins beyond the view's edges in which Books take part too (m): as far
 * as a Book's shadow reaches into the view (the key light is up left, and the
 * floor behind the row shows wider than the row), so no shadow stands in the
 * card before its Book. They move with the Book nearest them in view.
 */
const VIEW_MARGIN = { left: 0.4, right: 0.15 }

const smoothstep = (u: number) => u * u * (3 - 2 * u)
const clamp01 = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u)

/** easeOutBack with a small overshoot (the Stack's pop, Meshes.vue presenceLook). */
function popScale(u: number): number {
  if (u >= 1) return 1
  const v = u - 1
  return 1 + 2 * v * v * v + v * v
}

/** Indices of the Books in view (with `margins`, those whose shadows are), left to right. */
export function introWindow(books: RowIntroBook[], view: RowIntroView, margins = false): number[] {
  const low = view.cameraX - view.halfView - (margins ? VIEW_MARGIN.left : 0)
  const high = view.cameraX + view.halfView + (margins ? VIEW_MARGIN.right : 0)
  const indices: number[] = []
  books.forEach((book, index) => {
    if (book.x >= low && book.x <= high) indices.push(index)
  })
  return indices
}

/** Plans the intro of `books` (left to right, at rest) for what the view shows now. */
export function planRowIntro(books: RowIntroBook[], view: RowIntroView): RowIntroPlan {
  const core = introWindow(books, view)
  const first = core[0] ?? Number.POSITIVE_INFINITY
  const last = core.at(-1) ?? Number.NEGATIVE_INFINITY
  const span = Math.max(1, core.length - 1)
  /** When each Book starts: its rank in view, 0 (left) to 1 (right); those beside the view go with its ends. */
  const starts = new Map<number, number>()
  for (const index of introWindow(books, view, true)) {
    const rank = index <= first ? 0 : index >= last ? 1 : (index - first) / span
    starts.set(index, CASCADE * rank)
  }
  const duration = starts.size ? Math.max(...starts.values()) + SETTLE : 0

  const at = (index: number, t: number, into: IntroOffset): IntroOffset => {
    const start = starts.get(index)
    if (start === undefined || t >= start + SETTLE) {
      into.dx = 0
      into.scale = 1
      return into
    }
    // Unseen before its turn, then pops in a gap's width right of its place and slides home.
    const u = clamp01((t - start) / SETTLE)
    into.dx = STACK.drop * (1 - smoothstep(u))
    into.scale = t < start ? 0 : popScale(clamp01(u / POP))
    return into
  }

  return { duration, at }
}

export type RowIntroState = 'waiting' | 'playing' | 'done'

/** What the row knows on a frame (RowBooks). */
export interface IntroFrame {
  /** performance.now(). */
  now: number
  /** The row has Books and a size. */
  laidOut: boolean
  /** Every Book in view wears its drawn Spine. */
  spinesReady: boolean
  /** Reduce Motion. */
  reduced: boolean
  /** A Book is out (the rest of the intro is skipped). */
  picked: boolean
}

export interface RowIntroGate {
  readonly state: RowIntroState
  /** Seconds into the intro while it plays. */
  readonly t: number
  /** 0..1 through the intro (1 once done). */
  readonly progress: number
  /**
   * The labels (dates with their leader lines, focus label, scroll bar) may fade in:
   * the last INTRO_LABELS_OVERLAP of the intro on, and for good once it is done
   * (also when there is none: Reduce Motion, a Book taken out first).
   */
  readonly labelsIn: boolean
  /** One frame: returns true when the intro starts on it (plan it then). */
  step: (frame: IntroFrame) => boolean
  /** How long the plan runs, once planned (s). */
  setDuration: (seconds: number) => void
}

/**
 * When the intro plays: it waits until the row is laid out and its Spines in
 * view are drawn (or `wait` ms have passed), plays once, and is done for the
 * life of the row. Reduce Motion, or a Book taken out first: done at once.
 */
export function createRowIntro(wait = INTRO_WAIT): RowIntroGate {
  let state: RowIntroState = 'waiting'
  let askedAt = -1
  let startedAt = 0
  let duration = 0
  let t = 0
  return {
    get state() {
      return state
    },
    get t() {
      return t
    },
    get progress() {
      return state === 'done' ? 1 : state === 'playing' && duration > 0 ? Math.min(1, t / duration) : 0
    },
    get labelsIn() {
      return state === 'done' || (state === 'playing' && duration > 0 && t >= duration - INTRO_LABELS_OVERLAP)
    },
    step(frame) {
      if (state === 'waiting') {
        if (!frame.laidOut) return false
        if (askedAt < 0) askedAt = frame.now
        if (!frame.spinesReady && frame.now - askedAt < wait) return false
        if (frame.reduced || frame.picked) {
          state = 'done'
          return false
        }
        state = 'playing'
        startedAt = frame.now
        t = 0
        return true
      }
      if (state === 'playing') {
        t = (frame.now - startedAt) / 1000
        if (frame.picked || t >= duration) state = 'done'
      }
      return false
    },
    setDuration(seconds) {
      duration = seconds
    },
  }
}
