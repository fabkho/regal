// What the views of one Pick share: the picked Book, the label ↔ card morph
// around it, and the elements the morph measures. Handed down by provide/inject
// (composables/useBookPick.ts `providePickContext`); without a provider every
// view uses the shared one (the global Pick the Stack, the Bookcase and the
// accessible list have always used). A view that wants its own Pick (a reel
// next to Your shelf kept alive) provides a context of its own, so a Book out
// there is not out elsewhere, though the two Libraries may share Book ids.
// Pure (Vue refs only), so it is unit-testable.
import type { InjectionKey, Ref } from 'vue'
import { ref } from 'vue'
import type { LabelKind } from '#layers/regal/app/utils/books/labelMorph'
import type { PickState } from '#layers/regal/app/utils/books/pick'
import { SHELVED } from '#layers/regal/app/utils/books/pick'

export type BeforePickChange = (previous: string | null, next: string | null) => void

export interface LabelMorphFlags {
  /** A morph is under way (the ghost box shows). */
  active: boolean
  /** The card is laid out but hidden: the box is still on its way to it. */
  cardHidden: boolean
  /** The card comes and goes with its own fade (no morph). */
  cardFade: boolean
  /** The labels hold back: the box is or will become the label. */
  labelsHidden: boolean
  /** The Book whose title the box shows while it is (or becomes) a label. */
  labelBookId: string | null
}

export interface LabelSource {
  kind: LabelKind
  read: () => { bookId: string, el: HTMLElement } | null
}

export interface PickContext {
  /** Which Book is out and which face it shows. */
  state: Ref<PickState>
  /** Reactive state of the morph (labels, card, ghost box). */
  morph: Ref<LabelMorphFlags>
  /** Listeners run right before the picked Book changes (client side, registered on mount). */
  beforeChange: Set<BeforePickChange>
  /** The labels and the card of this Pick, registered on mount: what the morph measures. */
  labelSources: Set<LabelSource>
  cardSources: Set<() => HTMLElement | null>
}

export const PICK_CONTEXT_KEY: InjectionKey<PickContext> = Symbol('regal-pick-context')

export const initialPick = (): PickState => ({ ...SHELVED })

export const initialMorph = (): LabelMorphFlags => ({
  active: false,
  cardHidden: false,
  cardFade: true,
  labelsHidden: false,
  labelBookId: null,
})

/** A fresh, isolated Pick: nothing out, no morph, no listeners. */
export function createPickContext(): PickContext {
  return {
    state: ref(initialPick()),
    morph: ref(initialMorph()),
    beforeChange: new Set(),
    labelSources: new Set(),
    cardSources: new Set(),
  }
}
