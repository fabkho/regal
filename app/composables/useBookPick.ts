import type { PickState } from '~/utils/books/pick'
import { clickBook, flip, putAway, SHELVED } from '~/utils/books/pick'

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
    click: (bookId: string) => {
      state.value = clickBook(state.value, bookId)
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
