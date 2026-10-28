// What the views of one Pick share: the picked Book, the label ↔ card morph
// around it, and the elements the morph measures. Handed down by provide/inject
// (composables/useBookPick.ts `providePickContext`); without a provider every
// view uses the shared one (the global Pick the Stack, the Bookcase and the
// accessible list have always used). A view that wants its own Pick (a reel
// next to Your shelf kept alive) provides a context of its own, so a Book out
// there is not out elsewhere, though the two Libraries may share Book ids.
// Pure (Vue refs only), so it is unit-testable.
import type { InjectionKey, MaybeRefOrGetter, Ref } from 'vue'
import { computed, ref, toValue } from 'vue'
import type { Book } from '#layers/regal/shared/types/book'
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

/** How much of the stage is covered over the 3D (composables/useInspectInsets.ts). */
export interface InspectInsets {
  /** Stage px covered over the 3D at the top (the controls' band, or the viewport's top edge). */
  top: number
  /** Stage px covered at the bottom (the details sheet, or the viewport's bottom edge). */
  bottom: number
  /**
   * Where the details sheet's top edge rests on a phone, in viewport px (it
   * sits on the viewport's bottom edge, over whatever the host has under the
   * stage); null while there is none. The stage turns it into `bottom`.
   */
  sheetTop: number | null
}

export interface PickContext {
  /** Which Book is out and which face it shows. */
  state: Ref<PickState>
  /** Reactive state of the morph (labels, card, ghost box). */
  morph: Ref<LabelMorphFlags>
  /** The Book with this id in the Library this Pick belongs to (null: none). Reactive where it reads reactive data. */
  bookById: (id: string) => Book | null
  /** Under the mouse (or hovered in the Book list). */
  hovered: Ref<string | null>
  /** The Book in the scroll focus (Stack). */
  focused: Ref<string | null>
  /** What covers the stage over the 3D (the details sheet, the controls' band): where the picked Book floats. */
  insets: Ref<InspectInsets>
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

export const initialInsets = (): InspectInsets => ({ top: 0, bottom: 0, sheetTop: null })

/**
 * A fresh, isolated Pick: nothing out, nothing hovered or focused, no morph,
 * nothing covering the stage, no listeners. `books` is the Library this Pick
 * shows (Books, a ref or a getter); without it no id resolves, so a Book of
 * another Library with an equal id can never show up.
 */
export function createPickContext(options: { books?: MaybeRefOrGetter<readonly Book[]> } = {}): PickContext {
  const byId = computed(() => new Map((toValue(options.books) ?? []).map(book => [book.id, book])))
  return {
    state: ref(initialPick()),
    morph: ref(initialMorph()),
    bookById: id => byId.value.get(id) ?? null,
    hovered: ref(null),
    focused: ref(null),
    insets: ref(initialInsets()),
    beforeChange: new Set(),
    labelSources: new Set(),
    cardSources: new Set(),
  }
}
