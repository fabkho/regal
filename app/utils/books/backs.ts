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

export function backDrawDue(state: BackDue): boolean {
  if (state.queued || !state.artReady) return false
  return state.pick >= 1 || state.face === 'back'
}
