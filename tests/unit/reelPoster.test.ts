// The reel's poster (utils/reel/poster.ts, components/reel/Poster.vue): its first frame
// as DOM stands where the canvas draws it. The maths is checked against the canvas's own
// camera (three.js, as ReelScene and ReelBooks set it up): every Book of the arc, at the
// first frame and mid-intro, lands on the same pixel through CSS perspective and through
// the canvas. And the first frame itself (`reelStartFrame`) is where the auto-play begins,
// so the intro starts from the very frame the poster showed.
import { describe, expect, it } from 'vitest'
import { Euler, MathUtils, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { reelCamera, reelCameraInto, reelPose } from '../../app/utils/reel/layout'
import type { ReelCamera } from '../../app/utils/reel/layout'
import { posterBooks, posterBookTransform, posterShade, posterShadowTransform, posterWorldTransform, projectPosterPoint } from '../../app/utils/reel/poster'
import { REEL_AXIS_Y, REEL_BOOK, REEL_PERSPECTIVE, REEL_PX, REEL_SHADOW, reelWindow } from '../../app/utils/reel/scene'
import { enterView, frontFocus, initialReel, reelStartFrame } from '../../app/utils/reel/state'
import { REEL_BEAT } from '../../app/utils/reel/timeline'

const stage = { width: 390, height: 330 }

/** The camera ReelScene sets up for the card (its stage's window of the 900 px perspective). */
function canvasCamera() {
  const camera = new PerspectiveCamera(20, 1, 0.02, 6)
  camera.position.set(0, (0.5 - REEL_AXIS_Y) * stage.height * REEL_PX, REEL_PERSPECTIVE * REEL_PX)
  const view = reelWindow(stage.width, stage.height, stage.width / 2, stage.height * REEL_AXIS_Y)
  camera.fov = view.fov
  camera.aspect = view.aspect
  camera.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  return camera
}

/** The world ReelBooks composes every frame from the dolly: pushed by its z, turned by the sway and the tilt. */
function canvasWorld(dolly: ReelCamera) {
  const quaternion = new Quaternion().setFromEuler(new Euler(MathUtils.degToRad(-dolly.rotateX), MathUtils.degToRad(dolly.rotateY), 0, 'YXZ'))
  return new Matrix4().compose(new Vector3(0, 0, dolly.z * REEL_PX), quaternion, new Vector3(1, 1, 1))
}

/** Where the canvas draws a point of a Book's box (CSS px from the stage's middle; y down; the Book's own frame turned by `rotateY`°). */
function canvasPixels(camera: PerspectiveCamera, point: { x: number, y: number, z: number }, pose: { x: number, y: number, z: number, rotateY: number }, dolly: ReelCamera) {
  const turn = new Matrix4().makeRotationY(MathUtils.degToRad(pose.rotateY))
  // CSS (y down) to the scene (y up), px to m.
  const local = new Vector3(point.x, -point.y, point.z).applyMatrix4(turn).add(new Vector3(pose.x, -pose.y, pose.z))
  const world = local.multiplyScalar(REEL_PX).applyMatrix4(canvasWorld(dolly))
  const ndc = world.project(camera)
  return { x: ((ndc.x + 1) / 2) * stage.width, y: ((1 - ndc.y) / 2) * stage.height }
}

/** The number list of a CSS transform, in order of appearance. */
const numbers = (text: string) => (text.replace('translate3d', 'translate').match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)

describe('the poster stands where the canvas draws (CSS perspective vs the canvas\'s camera)', () => {
  const corners = [
    [0, 0, 0],
    [-REEL_BOOK.width / 2, -REEL_BOOK.height / 2, REEL_BOOK.thickness / 2],
    [REEL_BOOK.width / 2, REEL_BOOK.height / 2, REEL_BOOK.thickness / 2],
    [-REEL_BOOK.width / 2, REEL_BOOK.height / 2, -REEL_BOOK.thickness / 2],
    [REEL_BOOK.width / 2, -REEL_BOOK.height / 2, -REEL_BOOK.thickness / 2],
  ].map(([x, y, z]) => ({ x: x!, y: y!, z: z! }))

  it.each([
    { name: 'the first frame, a ringing arc (the last Book in front)', n: 12, focus: -1, time: 0 },
    { name: 'the first frame of an arc with ends', n: 3, focus: 0, time: REEL_BEAT },
    { name: 'a Book in front, the camera at its dolly\'s widest sway', n: 12, focus: 4, time: (REEL_BEAT * 3) / 4 },
    { name: 'mid-move, mid-dolly', n: 7, focus: 2.37, time: 5234 },
  ])('$name: every corner of every Book lands on the same pixel', ({ n, focus, time }) => {
    const camera = canvasCamera()
    const dolly = reelCamera(time)
    for (const { pose } of posterBooks(n, focus)) {
      for (const corner of corners) {
        const css = projectPosterPoint(
          // The Book's frame turned by rotateY, then placed on the arc (the CSS transform list, right to left).
          { x: pose.x + corner.x * Math.cos(MathUtils.degToRad(pose.rotateY)) + corner.z * Math.sin(MathUtils.degToRad(pose.rotateY)), y: pose.y + corner.y, z: pose.z - corner.x * Math.sin(MathUtils.degToRad(pose.rotateY)) + corner.z * Math.cos(MathUtils.degToRad(pose.rotateY)) },
          dolly,
          stage,
        )
        const canvas = canvasPixels(camera, corner, pose, dolly)
        expect(css.x).toBeCloseTo(canvas.x, 2)
        expect(css.y).toBeCloseTo(canvas.y, 2)
      }
    }
  })

  it('the stage\'s middle on its own plane is the stage\'s middle, the origin of the perspective 40 % down', () => {
    const flat: ReelCamera = { z: 0, rotateY: 0, rotateX: 0 }
    expect(projectPosterPoint({ x: 0, y: 0, z: 0 }, flat, stage)).toEqual({ x: 195, y: 165, scale: 1 })
    // On the axis (40 % down) a point moves only by the scale; a point 100 px forward is 900/800 larger.
    const axis = projectPosterPoint({ x: 100, y: stage.height * REEL_AXIS_Y - stage.height / 2, z: 100 }, flat, stage)
    expect(axis.y).toBeCloseTo(stage.height * REEL_AXIS_Y, 6)
    expect(axis.scale).toBeCloseTo(REEL_PERSPECTIVE / (REEL_PERSPECTIVE - 100), 6)
    expect(axis.x).toBeCloseTo(195 + 100 * axis.scale, 6)
  })
})

describe('the poster\'s Books are the layout\'s', () => {
  it('draws only the Books the arc shows (five at most, whatever the Library), in Book order', () => {
    // The last Book in front: the one before it and the one before that to the left, the first two to the right.
    expect(posterBooks(12, -1).map(book => book.index)).toEqual([0, 1, 9, 10, 11])
    expect(posterBooks(300, 150).length).toBe(5)
  })

  it('each Book carries its layout pose as the prototype\'s transform; nothing is invented', () => {
    for (const [n, focus] of [[12, -1], [3, 0], [4, 1.5], [300, 150], [2, 0.5], [1, 0]] as const) {
      const books = posterBooks(n, focus)
      const shown = Array.from({ length: n }, (_, index) => index).filter(index => reelPose(index, focus, n).opacity > 0)
      expect(books.map(book => book.index)).toEqual(shown)
      expect(books.length).toBeLessThanOrEqual(5)
      for (const { index, pose, transform, shadowTransform, shadowOpacity } of books) {
        expect(pose).toEqual(reelPose(index, focus, n))
        expect(transform).toBe(posterBookTransform(pose))
        const [x, y, z, rotateY] = numbers(transform)
        expect([x, y, z, rotateY]).toEqual([pose.x, pose.y, pose.z, pose.rotateY].map(value => Math.round(value * 1000) / 1000))
        expect(numbers(shadowTransform)).toEqual([Math.round(pose.x * 1000) / 1000, REEL_SHADOW.drop, Math.round(pose.z * 1000) / 1000, REEL_SHADOW.tilt])
        expect(shadowTransform).toBe(posterShadowTransform(pose))
        expect(shadowOpacity).toBe(Math.max(0, pose.shadow))
      }
    }
  })

  it('the world is the canvas\'s: the dolly\'s push, sway and tilt', () => {
    const dolly = reelCameraInto(5234, { z: 0, rotateY: 0, rotateX: 0 })
    const [z, rotateY, rotateX] = numbers(posterWorldTransform(dolly))
    expect(z).toBeCloseTo(dolly.z, 3)
    expect(rotateY).toBeCloseTo(dolly.rotateY, 3)
    expect(rotateX).toBe(dolly.rotateX)
    // Time 0: pushed 22 px (-40 + 18), no sway, tilted back 4°.
    expect(posterWorldTransform(reelCamera(0))).toBe('translateZ(-22px) rotateY(0deg) rotateX(-4deg)')
  })

  it('a Book square to you keeps most of its colours, one turned away from the light the least', () => {
    expect(posterShade(0)).toBeGreaterThan(0.95)
    expect(posterShade(52)).toBeLessThan(posterShade(-52))
    expect(posterShade(-52)).toBeLessThan(posterShade(0))
    for (const turn of [-70, -52, 0, 52, 70]) expect(posterShade(turn)).toBeGreaterThan(0.7)
  })
})

describe('the first frame is where the auto-play begins (no jump when the intro starts)', () => {
  it('a ringing arc opens with the last Book in front and the first coming in from the right', () => {
    expect(reelStartFrame(12)).toEqual({ focus: -1, dolly: 0 })
    // The last Book in front, the first at the first neighbour's place.
    expect(reelPose(11, -1, 12).x).toBe(0)
    expect(reelPose(0, -1, 12).x).toBe(132)
  })

  it('an arc with ends opens on its first Book, the clock at the second beat', () => {
    expect(reelStartFrame(3)).toEqual({ focus: 0, dolly: REEL_BEAT })
    expect(reelStartFrame(2)).toEqual({ focus: 0, dolly: REEL_BEAT })
  })

  it('still (autoplay off, Reduce Motion, one Book, none): the first Book, the camera at rest', () => {
    expect(reelStartFrame(12, { autoplay: false })).toEqual({ focus: 0, dolly: 0 })
    expect(reelStartFrame(12, { reduced: true })).toEqual({ focus: 0, dolly: 0 })
    expect(reelStartFrame(1)).toEqual({ focus: 0, dolly: 0 })
    expect(reelStartFrame(0)).toEqual({ focus: 0, dolly: 0 })
  })

  it.each([2, 3, 4, 5, 12, 300])('with %i Books: the reel\'s state at mount, the state when it first plays and the poster agree', (n) => {
    const frame = reelStartFrame(n)
    const mounted = initialReel(n)
    // At mount it is still, where the round will begin...
    expect(mounted.mode).toBe('manual')
    expect(frontFocus(mounted)).toBe(frame.focus)
    // ... and when it comes into view the clock starts there: the same focus, the same dolly clock.
    const playing = enterView({ ...mounted, visible: true })
    expect(playing.mode).toBe('playing')
    expect(playing.elapsed).toBe(0)
    expect(frontFocus(playing)).toBe(frame.focus)
    expect(playing.origin + playing.elapsed).toBe(frame.dolly)
  })
})
