import type { PickOutside, PickState } from '#layers/regal/app/utils/books/pick'
import { clickAt, flip, putAway, SHELVED } from '#layers/regal/app/utils/books/pick'

type BeforePickChange = (previous: string | null, next: string | null) => void

/** Client-side listeners (registered on mount) for a change of the picked Book. */
const beforePickChange = new Set<BeforePickChange>()

/**
 * Runs `listener` right before the picked Book changes, while the page still
 * shows the old state (the label on screen, the card of the Book that was out):
 * what the label ↔ card morph measures (composables/useLabelMorph.ts).
 * Returns the unregister function.
 */
export function onBeforePickChange(listener: BeforePickChange): () => void {
  beforePickChange.add(listener)
  return () => beforePickChange.delete(listener)
}

/**
 * Shared Pick state: which Book is out and which face it shows. Used by the
 * 3D views, the details card and the accessible Book list alike.
 */
export function useBookPick() {
  const state = useState<PickState>('book-pick', () => ({ ...SHELVED }))

  function set(next: PickState) {
    const previous = state.value.bookId
    if (previous !== next.bookId) for (const listener of beforePickChange) listener(previous, next.bookId)
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
