// The look of the 3D: decisions the owner made in the dev choices panel, now
// hard-wired (the panel keeps only links that play them).
//
// Decided (no longer choices): Regal is a Nuxt layer for a separate portfolio
// page; ratings show as a hover label (plus the details card); covers default
// to the best automatic image + Gemini back/spine (Batch API), with photos for
// a few special editions; new Books pop in scattered around the pile, and a
// replaced pile (a new year) sweeps out while the new one settles in.

import type { SeparatorStyle } from '#layers/regal/app/utils/stack/separators'
import type { PickOutside } from '#layers/regal/app/utils/books/pick'

/** What the 3D looks like: the decided picks plus the open ones (the dev panel previews those). */
export interface Look {
  separatorStyle: SeparatorStyle
  pickOutside: PickOutside
}

/**
 * Decided and hard-wired (no longer choices): a click on another Book while
 * one is out swaps them ('swap'), the 'label' date separators, the riffle
 * scroll highlight (utils/stack/scrollHighlight.ts), the re-sort animation (utils/stack/moves.ts),
 * new Books popping in scattered around the pile, the swap of a whole pile
 * (utils/stack/shuffle.ts), the classic back cover and the title + stars hover label.
 */
export const DECIDED_LOOK: Readonly<Look> = Object.freeze({
  // Decided (owner, dev panel): the flat label with a leader line beside the pile.
  separatorStyle: 'label',
  // Decided (owner): clicking another Book while one is out swaps them.
  pickOutside: 'swap',
})

/**
 * The look of the 3D. Every look is decided (DECIDED_LOOK), in Regal's own dev
 * server and in any app that extends Regal as a layer; the dev panel keeps
 * only links that play them. A computed so a future open choice can join again.
 */
export function useLook() {
  return computed<Look>(() => DECIDED_LOOK)
}
