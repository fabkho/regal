// Design round (horizontal Stack): what one row card shares with the 3D inside
// its canvas. Each card has its own (several rows on one page don't share a
// Pick), handed down as a prop.
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
  /** Card px (from its left) of a resting mouse or a finger on it, else null. */
  pointerPx: number | null
  /** The same in world x at the row, worked out each frame (RowScene). */
  pointerX: number | null
  /** A finger is on the card. */
  touching: boolean
  /** Camera distance to the row (RowScene). */
  distance: number
}

export interface RowContext {
  pick: Ref<PickState>
  /** Under the mouse (or pressed). */
  hovered: Ref<string | null>
  /** The Book in focus (middle of the view or under the finger), for the caption. */
  focused: Ref<string | null>
  view: RowView
  /** Shares of the canvas height covered at the top and bottom (the card's own caption). */
  insets: { top: number, bottom: number }
  /** Inspect left of centre (a details panel on the right). */
  aside: Ref<boolean>
  /** Frames rendered, render time and the renderer's counts (RowScene), for the dev HUD. */
  stats: { frames: number, renderMs: number, calls: number, triangles: number, textures: number, geometries: number, loopMs: number[] }
  /** How faded the row is behind a picked Book, 0..1 (RowBooks; the floor's shadow fades with it). */
  dim: { value: number }
  /** Each frame once the camera is placed: the card places its HTML labels in step with the 3D. */
  onCamera: ((camera: PerspectiveCamera, width: number, height: number) => void) | null
  /** Render only when the card shows (an IntersectionObserver in RowCard). */
  visible: Ref<boolean>
}

export function createRowView(): RowView {
  return { cameraX: 0, focusY: 0, targetY: 0, halfView: 0.3, speed: 0, bounds: [0, 0], pointerPx: null, pointerX: null, touching: false, distance: 1 }
}
