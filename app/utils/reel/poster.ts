// The reel's poster: its first frame as DOM (components/reel/Poster.vue), drawn
// before the canvas has taken over, and for a host's fallback (no WebGL, Reduce
// Motion, Save-Data: RegalBooksReelStill). The prototype's CSS 3D scene
// (libellus-ref/shared-books-reel-proto/index.html, base.css), with the same
// numbers the canvas is built from: the arc's poses (layout.ts `reelPose`), the
// camera's dolly (`reelCamera`) and the stage's perspective (scene.ts:
// `perspective: 900px`, its origin 50 % across and 40 % down). So the Books
// stand where the canvas draws them, to the pixel's width. Pure: strings and
// numbers, so the maths is testable against the canvas's camera.

import { reelPose } from './layout'
import type { ReelCamera, ReelPose } from './layout'
import { REEL_AXIS_Y, REEL_PERSPECTIVE, REEL_RISE, REEL_SHADOW } from './scene'

/** One Book of the poster: it is on screen (not hidden by the arc) and where. */
export interface PosterBook {
  /** The Book's place in the reel. */
  index: number
  pose: ReelPose
  /** The Book's box (`transform` of its element, in the world). */
  transform: string
  /** Its floor shadow (`transform`), tilted flat, and its opacity before the theme's strength (0..1). */
  shadowTransform: string
  shadowOpacity: number
  /** How much of its colours the lit Book keeps (0..1): see `posterShade`. */
  shade: number
}

const px = (value: number) => `${Math.round(value * 1000) / 1000}px`
const deg = (value: number) => `${Math.round(value * 1000) / 1000}deg`

/** The world's transform (index.html `world.style.transform`): the dolly's push and sway, the tilt back. */
export function posterWorldTransform(camera: ReelCamera): string {
  return `translateZ(${px(camera.z)}) rotateY(${deg(camera.rotateY)}) rotateX(${deg(camera.rotateX)})`
}

/** A Book's transform on the arc (index.html: `translate3d(x, -10px, z) rotateY(ry)`). */
export function posterBookTransform(pose: ReelPose): string {
  return `translate3d(${px(pose.x)}, ${px(pose.y)}, ${px(pose.z)}) rotateY(${deg(pose.rotateY)})`
}

/**
 * A floor shadow's transform (index.html `shadows`): its ellipse (the element is
 * `REEL_SHADOW.width` Books wide, `REEL_SHADOW.depth` px deep, centred on its own
 * middle) `REEL_SHADOW.drop` px under the Book's middle, tilted back `REEL_SHADOW.tilt`°.
 */
export function posterShadowTransform(pose: ReelPose): string {
  return `translate3d(${px(pose.x)}, ${px(REEL_SHADOW.drop)}, ${px(pose.z)}) rotateX(${deg(REEL_SHADOW.tilt)})`
}

/**
 * The light on a Book turned `rotateY`° (the canvas lights it: a key light from the
 * upper left, a hemisphere and an ambient): the share of its colours a face keeps.
 * A Book square to you keeps nearly all, one turned to the right a little less,
 * one turned left (away from the key light) the least. Fitted to what the canvas
 * draws for the arc's poses (a screenshot of both, a few levels per channel), so
 * the poster's Books are not paler than the canvas's.
 */
export function posterShade(rotateY: number): number {
  const turn = Math.min(60, Math.abs(rotateY))
  return rotateY >= 0 ? 0.97 - 0.0025 * turn : 0.97 - 0.0015 * turn
}

/**
 * The Books the arc shows at `focus` (those the arc doesn't hide: five at most),
 * in Book order. A Library of 300 poses 300 Books and draws five.
 */
export function posterBooks(n: number, focus: number): PosterBook[] {
  const out: PosterBook[] = []
  for (let index = 0; index < n; index++) {
    const pose = reelPose(index, focus, n)
    if (pose.opacity <= 0) continue
    out.push({
      index,
      pose,
      transform: posterBookTransform(pose),
      shadowTransform: posterShadowTransform(pose),
      shadowOpacity: Math.max(0, pose.shadow),
      shade: posterShade(pose.rotateY),
    })
  }
  return out
}

/** Where a point of the world lands on the stage. */
export interface PosterPoint {
  /** px from the stage's left. */
  x: number
  /** px from the stage's top. */
  y: number
  /** The perspective's scale at its depth: what a px of the world measures on screen there. */
  scale: number
}

/**
 * The browser's CSS perspective for a point (`x`, `y`, `z`: px, from the middle of
 * a `width` × `height` stage; y down, z towards the viewer) after the world's
 * transform `camera`: the point is turned (rotateX, then rotateY), pushed by
 * `camera.z`, and scaled from the perspective origin (50 % across, 40 % down)
 * by `perspective / (perspective - z)`. The world's origin stands `rise` px above
 * the stage's middle (`REEL_RISE`; the turn is about that origin). The canvas
 * draws what this says (the test projects the same point through its three.js camera).
 */
export function projectPosterPoint(
  point: { x: number, y: number, z: number },
  camera: ReelCamera,
  stage: { width: number, height: number },
  perspective = REEL_PERSPECTIVE,
  rise = REEL_RISE,
): PosterPoint {
  const rx = (camera.rotateX * Math.PI) / 180
  const ry = (camera.rotateY * Math.PI) / 180
  // rotateX(a): y' = y cos a - z sin a, z' = y sin a + z cos a (y down).
  const y1 = point.y * Math.cos(rx) - point.z * Math.sin(rx)
  const z1 = point.y * Math.sin(rx) + point.z * Math.cos(rx)
  // rotateY(a): x' = x cos a + z sin a, z' = -x sin a + z cos a.
  const x2 = point.x * Math.cos(ry) + z1 * Math.sin(ry)
  const z2 = -point.x * Math.sin(ry) + z1 * Math.cos(ry)
  const z = z2 + camera.z
  const scale = perspective / (perspective - z)
  const originY = stage.height * REEL_AXIS_Y
  return {
    x: stage.width / 2 + x2 * scale,
    y: originY + (stage.height / 2 - rise + y1 - originY) * scale,
    scale,
  }
}
