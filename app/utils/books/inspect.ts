// Where the picked Book floats in front of the camera (Inspect). It fills part
// of the view height, a little above centre; on wide views it moves left,
// clear of the details card at the bottom right. On a phone the details are a
// bottom sheet (and the controls a band at the top): the Book sits in the band
// of the view those leave free, so neither covers it.

/** The picked Book fills this share of the view height. */
export const INSPECT_FILL = 0.52
/** Share of the half view width the picked Book moves left, clear of the details card. */
export const INSPECT_ASIDE = 0.3
/** How far above the centre it floats, as a share of its distance. */
export const INSPECT_LIFT = 0.04
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
  // A little above the free band's centre, keeping at least half the room above the Book.
  const lift = Math.min(INSPECT_LIFT / tan * band, (band - fill) / 2)
  // The free band's centre is (bottom - top) half view heights above the view's.
  const up = (lift + bottom - top) * halfHeight
  const right = aside && aspect > 1.1 ? -halfHeight * aspect * INSPECT_ASIDE : 0
  return { distance, up, right }
}
