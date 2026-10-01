// Pick state machine, after mawise/bookshelf: clicking a Book takes it out and
// shows its front Cover, clicking it again turns it to the back, a third click
// puts it away. Clicking another Book swaps (or puts away, see PickOutside);
// Escape or empty space puts away.
// Pure, so it's unit-testable; the composable and the scene drive it.

export type Face = 'front' | 'back'

export interface PickState {
  /** The Book out of the Shelf/Stack, or null. */
  bookId: string | null
  face: Face
}

export const SHELVED: PickState = Object.freeze({ bookId: null, face: 'front' })

export function clickBook(state: PickState, bookId: string): PickState {
  if (state.bookId !== bookId) return { bookId, face: 'front' }
  if (state.face === 'front') return { bookId, face: 'back' }
  return SHELVED
}

/**
 * What a click on another Book does while one is out: 'swap' takes that one
 * out instead, 'put-back' only puts the picked one back (in the Stack the
 * pile shows all around a picked Book, so "next to it" is often another Book).
 */
export type PickOutside = 'swap' | 'put-back'

/** A click in the 3D on `bookId`, or on empty space when null. */
export function clickAt(state: PickState, bookId: string | null, outside: PickOutside = 'swap'): PickState {
  if (!bookId) return SHELVED
  if (state.bookId && state.bookId !== bookId && outside === 'put-back') return SHELVED
  return clickBook(state, bookId)
}

export function flip(state: PickState): PickState {
  if (!state.bookId) return state
  return { bookId: state.bookId, face: state.face === 'front' ? 'back' : 'front' }
}

export function putAway(): PickState {
  return SHELVED
}
