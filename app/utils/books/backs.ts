// When the Stack draws a picked Book's back. In the pile a back faces down, so
// it is only drawn for the picked Book: its art is fetched from the press or
// hover on, decoded once the Book is picked, and drawn once the Book has
// arrived in front of the camera. Drawing a back (the blurb fitted, a canvas
// up to 1024 px tall uploaded) takes tens of milliseconds on a phone in one
// frame; done during the flight it would stutter the flight. If the back is
// asked for before the Book has arrived it is drawn at once: the reader wants
// the back now. Pure, so it's unit-testable; Meshes.vue applies it.
import type { Face } from './pick'

export interface BackDue {
  /** How far the Book is out: 0 in the pile, 1 in front of the camera. */
  pick: number
  /** The face the reader asked for. */
  face: Face
  /** The back art has arrived (or there is none): drawing won't wait on the network. */
  artReady: boolean
  /** Drawn already, or in the draw queue. */
  queued: boolean
}

/**
 * A Book's back art as far as it is known: undefined until its faces from the
 * library file are known (applyCover sets them a moment after the Book
 * appears; on a slow entrance a press can come first), then the URL, or null
 * when the Book has none. A back prepared while it was unknown would count as
 * having no art and be drawn without it for good, so it waits.
 */
export function backArtUrl(set: { back?: string } | null | undefined): string | null | undefined {
  if (set === undefined) return undefined
  return set?.back ?? null
}

export function backDrawDue(state: BackDue): boolean {
  if (state.queued || !state.artReady) return false
  return state.pick >= 1 || state.face === 'back'
}
