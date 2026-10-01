import type { PickOutside, PickState } from '#layers/regal/app/utils/books/pick'
import { clickAt, flip, putAway, SHELVED } from '#layers/regal/app/utils/books/pick'

/**
 * Shared Pick state: which Book is out and which face it shows. Used by the
 * 3D views, the details card and the accessible Book list alike.
 */
export function useBookPick() {
  const state = useState<PickState>('book-pick', () => ({ ...SHELVED }))

  return {
    state: readonly(state),
    pickedId: computed(() => state.value.bookId),
    face: computed(() => state.value.face),
    /** A click in the 3D: on a Book, or on empty space (null). */
    clickAt: (bookId: string | null, outside?: PickOutside) => {
      state.value = clickAt(state.value, bookId, outside)
    },
    /** Takes a Book out showing its front, whatever was out before. */
    pick: (bookId: string) => {
      state.value = { bookId, face: 'front' }
    },
    flip: () => {
      state.value = flip(state.value)
    },
    putAway: () => {
      state.value = putAway()
    },
  }
}

export type ViewMode = 'bookcase' | 'stack'

/** Which view the Library is shown in. */
export function useViewMode() {
  return useState<ViewMode>('view-mode', () => 'bookcase')
}
