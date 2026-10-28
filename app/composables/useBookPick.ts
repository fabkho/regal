import type { PickOutside, PickState } from '#layers/regal/app/utils/books/pick'
import { clickAt, flip, putAway } from '#layers/regal/app/utils/books/pick'
import type { BeforePickChange, LabelMorphFlags, LabelSource, PickContext } from '#layers/regal/app/utils/books/pickContext'
import { createPickContext, initialMorph, initialPick, PICK_CONTEXT_KEY } from '#layers/regal/app/utils/books/pickContext'

/**
 * The shared Pick's client-side registries (module level, like the state is
 * app-wide): listeners for a change of the picked Book, and the elements the
 * label ↔ card morph measures.
 */
const sharedBeforeChange = new Set<BeforePickChange>()
const sharedLabelSources = new Set<LabelSource>()
const sharedCardSources = new Set<() => HTMLElement | null>()

/** The shared (global) Pick: the default of every view that has no context provided. */
export function useSharedPickContext(): PickContext {
  return {
    state: useState<PickState>('book-pick', initialPick),
    morph: useState<LabelMorphFlags>('books:label-morph', initialMorph),
    beforeChange: sharedBeforeChange,
    labelSources: sharedLabelSources,
    cardSources: sharedCardSources,
  }
}

/**
 * The Pick context of the view this runs in: the nearest one provided
 * (`providePickContext`), else the shared one. Call in setup, where `inject` works.
 */
export function usePickContext(): PickContext {
  const provided = hasInjectionContext() ? inject(PICK_CONTEXT_KEY, null) : null
  return provided ?? useSharedPickContext()
}

/**
 * Gives the views below (the Details card, the labels, the morph, the Books)
 * a Pick of their own instead of the shared one. Call in the hosting view's
 * setup; returns the context (a fresh one unless given).
 */
export function providePickContext(context: PickContext = createPickContext()): PickContext {
  provide(PICK_CONTEXT_KEY, context)
  return context
}

/**
 * Runs `listener` right before the picked Book changes, while the page still
 * shows the old state (the label on screen, the card of the Book that was out):
 * what the label ↔ card morph measures (composables/useLabelMorph.ts).
 * Returns the unregister function. On the shared Pick unless `context` is given.
 */
export function onBeforePickChange(listener: BeforePickChange, context?: PickContext): () => void {
  const listeners = (context ?? useSharedPickContext()).beforeChange
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Pick state: which Book is out and which face it shows. Used by the 3D
 * views, the details card and the accessible Book list alike. The shared Pick,
 * unless a hosting view provided its own (`providePickContext`).
 */
export function useBookPick() {
  const { state, beforeChange } = usePickContext()

  function set(next: PickState) {
    const previous = state.value.bookId
    if (previous !== next.bookId) for (const listener of beforeChange) listener(previous, next.bookId)
    state.value = next
  }

  return {
    state: readonly(state),
    pickedId: computed(() => state.value.bookId),
    face: computed(() => state.value.face),
    /** A click in the 3D: on a Book, or on empty space (null). */
    clickAt: (bookId: string | null, outside?: PickOutside) => {
      set(clickAt(state.value, bookId, outside))
    },
    /** Takes a Book out showing its front, whatever was out before. */
    pick: (bookId: string) => {
      set({ bookId, face: 'front' })
    },
    flip: () => {
      set(flip(state.value))
    },
    putAway: () => {
      set(putAway())
    },
  }
}

export type ViewMode = 'bookcase' | 'stack'

/** Which view the Library is shown in. */
export function useViewMode() {
  return useState<ViewMode>('view-mode', () => 'bookcase')
}
