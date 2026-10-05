// What one row (RegalBooksRow → RowCard) shares with the 3D inside its canvas,
// handed down as a prop. Each row has its own: its own Pick, so a row and
// RegalBooksStage (or two rows) can share a page.
import type { Ref } from 'vue'
import type { PerspectiveCamera } from 'three'
import type { PickState } from '#layers/regal/app/utils/books/pick'
import type { LoadView } from '#layers/regal/app/utils/covers/loadWindow'

/**
 * Where the camera is along the row, per frame. A LoadView along x: `focusY`
 * is the camera's x (the load window is axis-agnostic), `halfView` half the
 * view's width at the row.
 */
export interface RowView extends LoadView {
  /** World x the camera looks at. */
  cameraX: number
  /** Where the camera may go: [first, last]. */
  bounds: [number, number]
  /** Camera distance to the row (RowScene), before it steps back for a picked Book. */
  distance: number
  /** The scroll leads (scrolling or touch since the mouse last moved): the riffle runs, hover waits. */
  scrollLed: boolean
  /** A finger is on the row (the scroll haptics). */
  touching: boolean
}

/** Where a broken-out row was on screen (viewport px) when its Book came out. */
export interface RowBreakout {
  active: boolean
  rect: { left: number, top: number, width: number, height: number }
}

export interface RowContext {
  pick: Ref<PickState>
  /** Under the mouse. */
  hovered: Ref<string | null>
  /** The Book in focus (riffle) or under the mouse, for the focus label. */
  focused: Ref<string | null>
  view: RowView
  /** Shares of the canvas covered by the details: top, bottom (height) and right (width). */
  insets: { top: number, bottom: number, right: number }
  /** The picked Book is inspected in the whole viewport (the row broke out). */
  inspectFull: Ref<boolean>
  /** Camera distance factor: the camera steps back from the row while a Book is out in the card. */
  zoom: { value: number }
  /** The canvas covers the viewport while a Book is out (RowCard); the camera keeps the card's view. */
  breakout: RowBreakout
  /** How faded the row is behind a picked Book, 0..1 (RowBooks; the paper veil and the floor's shadow follow it). */
  dim: { value: number }
  /** Each frame once the camera is placed: the card places its HTML labels in step with the 3D. */
  onCamera: ((camera: PerspectiveCamera, width: number, height: number) => void) | null
  /** Render only while the row shows (an IntersectionObserver in RowCard). */
  visible: Ref<boolean>
}

export function createRowView(): RowView {
  return { cameraX: 0, focusY: 0, targetY: 0, halfView: 0.3, speed: 0, bounds: [0, 0], distance: 1, scrollLed: false, touching: false }
}
