// How a Book comes in and goes out at the arc's edge (RegalBooksReel `edge`). The arc shows the Books up to
// REEL_FADE_AT (2.6) from the front; the prototype cut them in and out there. Now a Book's `edge`
// (layout.ts: 1 inside REEL_EDGE_FROM, down to 0 at REEL_FADE_AT, from its distance to the arc's position)
// drives how much of it is there, so it scrubs with the beat, a swipe and a glide rather than playing as a
// timed tween, and its floor shadow follows. At rest (whole Books in front) every Book shown is at 1.
// Pure: edge in, a look out.
//
//   'fade'       it fades (opacity = edge).
//   'fadeScale'  it fades and grows from 0.85 (opacity = edge, scale 0.85 + 0.15 edge). The default.
//   'sink'       it fades and rises out of the floor along the arc (opacity = edge, 28 px lower and a
//                little smaller while it is not all there): the shelf language, as the Stack's pop is.
//   'none'       the prototype's hard cut.
import { clamp } from './timeline'

export type ReelEdge = 'fade' | 'fadeScale' | 'sink' | 'none'
export const REEL_EDGES: readonly ReelEdge[] = ['fade', 'fadeScale', 'sink', 'none']
export const REEL_EDGE_DEFAULT: ReelEdge = 'fadeScale'

/** What the edge does to one Book. */
export interface EdgeLook {
  /** 0 (gone) to 1. */
  opacity: number
  /** Size, 1 at rest. */
  scale: number
  /** Lower on the stage by this much (CSS px). */
  sink: number
}

/** The ramp eased (smoothstep), so a Book doesn't start or stop abruptly under a finger. */
const ease = (edge: number) => edge * edge * (3 - 2 * edge)

/** `edge` (0..1, layout.ts `ReelPose.edge`) as a look for `mode`; written into `out`. */
export function edgeLook(mode: ReelEdge, edge: number, out: EdgeLook): EdgeLook {
  const e = ease(clamp(edge))
  out.sink = 0
  out.scale = 1
  out.opacity = 1
  if (mode === 'none') return out
  out.opacity = e
  if (mode === 'fadeScale') out.scale = 0.85 + 0.15 * e
  else if (mode === 'sink') {
    out.scale = 0.92 + 0.08 * e
    out.sink = 28 * (1 - e)
  }
  return out
}
