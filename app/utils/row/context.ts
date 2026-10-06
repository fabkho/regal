// What one row (RegalBooksRow → RowCard) shares with the 3D inside its canvas,
// handed down as a prop. Each row has its own: its own Pick, so a row and
// RegalBooksStage (or two rows) can share a page.
import type { Ref } from 'vue'
import type { PickState } from '#layers/regal/app/utils/books/pick'
import type { LoadView } from '#layers/regal/app/utils/covers/loadWindow'
import type { SpinMode } from '#layers/regal/app/utils/books/spin'
import type { RowIntroMode, RowIntroState } from '#layers/regal/app/utils/row/intro'

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
  /** The press going down only stopped a flinging row (RowCard): it takes no Book out. */
  caught: boolean
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
  /** The floor shadow's strength (utils/theme/tokens.ts floorShadowStrength): 1 in the light theme, 0 in the dark (RowCard). */
  floorShadow: { value: number }
  /**
   * The veil behind a Book taken out (RowCard `readVeil`): its colour (`#rrggbb`, `--regal-veil-color`, else the
   * card's surface, so dark in the dark theme) and its opacity, 0..1, in the card (`--regal-veil-opacity-card`)
   * and broken out (`--regal-veil-opacity`); RowScene multiplies the one in use by `dim`.
   */
  veil: { color: string, opacity: number, opacityFull: number }
  /** Render only while the row shows (an IntersectionObserver in RowCard). */
  visible: Ref<boolean>
  /** When the intro plays (RegalBooksRow's `intro`, utils/row/intro.ts). */
  introMode: Readonly<Ref<RowIntroMode>>
  /** Enough of the card is in the viewport for the intro to start (`INTRO_VISIBLE`; RowCard's observer). */
  introVisible: Ref<boolean>
  /** How a drag turns a Book taken out (RegalBooksRow's `rotate`, utils/books/spin.ts). */
  rotate: Readonly<Ref<SpinMode>>
  /**
   * The row's intro (utils/row/intro.ts): 'waiting' (nothing shows until the
   * Spines in view are drawn), 'playing' (the Books come into place), 'done'.
   */
  intro: Ref<RowIntroState>
  /** 0..1 through the intro (RowScene grows the month sheets with it). */
  introProgress: { value: number }
  /**
   * The labels (dates and leader lines, focus label, scroll bar) are due: false
   * while the row waits and the Books settle, true for the intro's last moment
   * on (and at once with no intro). RowCard fades them in on it.
   */
  introLabels: Ref<boolean>
}

export function createRowView(): RowView {
  return { cameraX: 0, focusY: 0, targetY: 0, halfView: 0.3, speed: 0, bounds: [0, 0], distance: 1, scrollLed: false, touching: false, caught: false }
}
