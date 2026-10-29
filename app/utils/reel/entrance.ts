// The reel's entrance (RegalBooksReel `entrance`): how its Books come in when the
// canvas takes over, the way the Stack's pile does (utils/stack/shuffle.ts
// `settleIn`) and the row's (utils/row/intro.ts): each Book unseen until its
// turn, then it pops in (easeOutBack, over 70 % of its settle) a gap's width to
// the right of its place and slides home (smoothstep), the cascade starting at
// the left and the next Book SWAP_CASCADE x its rank (0..1) later. The Stack's own numbers
// (0.45 s a Book, 0.3 s across the pile), not the row's quicker ones.
//
//   'pop'     the Stack's entrance, exactly: the reel stands empty (its poster draws
//             nothing, as the Stack's stage is quiet paper before its pile comes in)
//             until the canvas has the first Covers; then the Books pop in, then it plays.
//   'settle'  the first frame stands in place from the server's HTML on (the poster),
//             and the canvas takes over from it; the Books then do the cascade as a
//             swell from rest: each dips and settles with a slide, no jump at the start.
//   'none'    the first frame stands in place; the canvas takes over; the first beat is
//             the intro (the arc's first move). The first look of #91.
//
// Reduce Motion: none, whatever it says (the poster stands, the Books just show).
// Pure: a plan read per Book and per frame as offsets from the Book's rest pose.
import { SETTLE_DROP, SWAP_CASCADE, SWAP_SETTLE } from '../stack/shuffle'
import { popScale, smoothstep } from '../row/intro'

export type ReelEntrance = 'pop' | 'settle' | 'none'
export const REEL_ENTRANCES: readonly ReelEntrance[] = ['pop', 'settle', 'none']

/** Share of its settle over which a Book pops in (the Stack's appear, and the row's). */
const POP = 0.7
/** How far a settling Book swells and slides (the 'settle' entrance): a tenth of its size, a fifth of the pop's slide. */
const SWELL = 0.1
const SWELL_SLIDE = SETTLE_DROP * 0.2
/** The Cover wait, the Books held back (ms): past it the Books pop in on their colours and the Covers swap in as they arrive. */
export const REEL_COVER_PATIENCE = 600
/** The beat starts this long after the Books are home (s), so the entrance reads as one thing and the first move as another. */
export const REEL_ENTRANCE_HOLD = 0.2

/** What the entrance does to one Book at one moment, on top of its rest pose. */
export interface EntranceOffset {
  /** Along the stage, to the right (m). */
  dx: number
  /** Size, 0 (not there yet) to 1. */
  scale: number
}

export interface ReelEntrancePlan {
  mode: ReelEntrance
  /** Seconds until every Book is home (0 for 'none'). */
  duration: number
  /** Book `index`'s offset `t` seconds in (t < 0: not started); `into` is filled and returned. */
  at: (index: number, t: number, into: EntranceOffset) => EntranceOffset
}

const clamp01 = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u)

/**
 * Plans the entrance of the Books the first frame shows: `shown` is each one's
 * Book index and its x on the stage, in any order (the cascade runs left to right).
 */
export function planReelEntrance(mode: ReelEntrance, shown: { index: number, x: number }[]): ReelEntrancePlan {
  const order = [...shown].sort((a, b) => a.x - b.x)
  const span = Math.max(1, order.length - 1)
  const starts = new Map(order.map(({ index }, rank) => [index, SWAP_CASCADE * (rank / span)]))
  const duration = mode === 'none' || !order.length ? 0 : (order.length > 1 ? SWAP_CASCADE : 0) + SWAP_SETTLE

  const at = (index: number, t: number, into: EntranceOffset): EntranceOffset => {
    const start = starts.get(index)
    into.dx = 0
    into.scale = 1
    if (start === undefined || mode === 'none') return into
    const u = clamp01((t - start) / SWAP_SETTLE)
    if (mode === 'pop') {
      if (t < start) {
        into.dx = SETTLE_DROP
        into.scale = 0
        return into
      }
      into.dx = SETTLE_DROP * (1 - smoothstep(u))
      into.scale = popScale(clamp01(u / POP))
      return into
    }
    // 'settle': from rest, a swell that comes back home; nothing before its turn or after it.
    if (t < start || u >= 1) return into
    const bell = Math.sin(Math.PI * smoothstep(u))
    into.dx = SWELL_SLIDE * bell
    into.scale = 1 - SWELL * bell
    return into
  }

  return { mode, duration, at }
}

/** Whether the entrance holds the Books back until it starts (the Stack's: they are not there before their turn). */
export const entranceHidesBooks = (mode: ReelEntrance): boolean => mode === 'pop'
