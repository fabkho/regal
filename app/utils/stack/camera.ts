// Where the Stack's camera rests at the top of the pile. Pure; Scene.vue feeds it.
import { MathUtils } from 'three'

/**
 * Where the top Book starts, as a fraction of the view's half height above its
 * centre (0 = mid-view, 1 = upper edge): 0.5 puts its middle at 75 % of the
 * way up, its upper face near 80 %. Wide views keep it mid-view; a tall, narrow
 * one (a phone) would show half a screen of blank paper above the pile, so
 * there it starts high.
 */
export const TOP_AT_NARROW = 0.5
/** Aspect ratios (width / height) where the top starts at TOP_AT_NARROW (and narrower) and where it is mid-view again (and wider). */
export const TOP_AT_TALL = 0.7
export const TOP_AT_WIDE = 1

/** The top's place for a view of this aspect ratio, easing between the two. */
export function topAt(aspect: number): number {
  if (!(aspect > 0)) return 0
  const t = MathUtils.clamp((TOP_AT_WIDE - aspect) / (TOP_AT_WIDE - TOP_AT_TALL), 0, 1)
  return TOP_AT_NARROW * t
}

/**
 * The height the camera looks at when the pile's `top` shows at `at` (see
 * topAt) of the view's half height: the camera sits `rise` above that height,
 * `distance` in front of the pile, and looks at it.
 */
export function viewForTop(top: number, at: number, distance: number, rise: number, fovDegrees: number): number {
  const angle = Math.atan(rise / distance) - Math.atan(at * Math.tan(MathUtils.degToRad(fovDegrees) / 2))
  return top + distance * Math.tan(angle) - rise
}
