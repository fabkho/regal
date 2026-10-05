// Where the picked Book floats in front of the camera (Inspect). It fills part
// of the view height, a little above centre; on wide views it moves left,
// clear of the details card at the bottom right. On a phone the details are a
// bottom sheet (and the controls a band at the top): the Book sits centred in
// the band of the view those leave free, so neither covers it.

/** The picked Book fills this share of the view height. */
export const INSPECT_FILL = 0.52
/** Share of the half view width the picked Book moves left, clear of the details card. */
export const INSPECT_ASIDE = 0.3
/** How far above the centre it floats, as a share of its distance (nothing covering the view). */
export const INSPECT_LIFT = 0.04
/** Covered share of the view by which the lift is gone: in a band between a bar and a sheet the Book sits centred. */
export const LIFT_FADE = 0.1
/** In a band left free by a sheet: the most of the band's height the Book fills. */
export const BAND_FILL = 0.84
/** The most of the view width the Book's front fills. */
export const WIDTH_FILL = 0.8
/** The free band never gets narrower than this share of the view (a sheet taller than that covers the Book). */
const MIN_BAND = 0.3

export interface InspectInput {
  /** Vertical field of view, radians. */
  fov: number
  /** View width / height. */
  aspect: number
  /** The Book's height and its front's width (its depth), in world units. */
  height: number
  depth: number
  /** Shares of the view height covered at the top (controls) and the bottom (a sheet). */
  top?: number
  bottom?: number
  /** Move left on wide views (the details card is over the bottom right). */
  aside?: boolean
}

export interface InspectFrame {
  /** From the camera along its view direction. */
  distance: number
  /** Along the camera's up and right vectors. */
  up: number
  right: number
}

export function inspectFrame({ fov, aspect, height, depth, top = 0, bottom = 0, aside = false }: InspectInput): InspectFrame {
  const tan = Math.tan(fov / 2)
  const band = Math.max(MIN_BAND, 1 - top - bottom)
  // Never larger than without a sheet; smaller when the free band is short.
  const fill = Math.min(INSPECT_FILL, band * BAND_FILL)
  // Far enough that it fits the height share and the width.
  const distance = Math.max(height / (2 * tan * fill), depth / (2 * tan * aspect * WIDTH_FILL))
  const halfHeight = distance * tan
  // A little above the view's centre when nothing covers it; centred in a
  // band (fading out over the first LIFT_FADE covered, so it never jumps).
  const free = Math.max(0, 1 - (top + bottom) / LIFT_FADE)
  const lift = Math.min(INSPECT_LIFT / tan * band, (band - fill) / 2) * free
  // The free band's centre is (bottom - top) half view heights above the view's.
  const up = (lift + bottom - top) * halfHeight
  const right = aside && aspect > 1.1 ? -halfHeight * aspect * INSPECT_ASIDE : 0
  return { distance, up, right }
}

/**
 * What covers the stage over the 3D on a phone, in stage px, from where
 * things are on screen: the stage's own top band, or the part of the stage
 * above the viewport; below, the details sheet (it sits on the viewport's
 * bottom edge, wherever the stage ends), or the part below the viewport.
 */
export function stageInsets(input: {
  /** The stage's top and bottom edges, viewport px. */
  stageTop: number
  stageBottom: number
  viewportHeight: number
  /** The sheet's top edge, viewport px; null: no sheet. */
  sheetTop: number | null
  /** The stage's own band over its top, stage px. */
  band: number
}): { top: number, bottom: number } {
  const height = input.stageBottom - input.stageTop
  if (height <= 0) return { top: 0, bottom: 0 }
  const clamp = (value: number) => Math.min(height, Math.max(0, value))
  const lowest = Math.min(input.viewportHeight, input.sheetTop ?? input.viewportHeight)
  return {
    top: clamp(Math.max(input.band, -input.stageTop)),
    bottom: clamp(input.stageBottom - lowest),
  }
}
