// The Reel's 3D stage (utils/reel/scene.ts) and the allocation-free helpers the
// reel reads every frame (timeline, layout): the prototype's camera turned into
// a three.js projection, the same pixels in the card and broken out, the eased
// jumps, the caption's Book and the drag's rubber band.
import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { reelCamera, reelCameraInto, reelLayout, reelPose, reelPoseInto } from '../../app/utils/reel/layout'
import type { ReelPose } from '../../app/utils/reel/layout'
import { REEL_BEAT, REEL_MOVE, reelBadge, reelFocus, reelMoveClock, reelPhase } from '../../app/utils/reel/timeline'
import { fillLabel, jumpOffset, REEL_AXIS_Y, REEL_LABELS, REEL_PERSPECTIVE, REEL_PX, reelShownIndex, reelWindow, rubberFocus, settleOffset } from '../../app/utils/reel/scene'

/** The camera ReelScene sets up for a stage `height` px tall, with the window it shows. */
function reelCam(canvas: { width: number, height: number }, axis: { x: number, y: number }, stageHeight: number) {
  const camera = new PerspectiveCamera(20, 1, 0.02, 6)
  camera.position.set(0, (0.5 - REEL_AXIS_Y) * stageHeight * REEL_PX, REEL_PERSPECTIVE * REEL_PX)
  const view = reelWindow(canvas.width, canvas.height, axis.x, axis.y)
  camera.fov = view.fov
  camera.aspect = view.aspect
  camera.setViewOffset(view.fullWidth, view.fullHeight, view.offsetX, view.offsetY, view.width, view.height)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  return camera
}

/** Canvas px of a world point. */
function toPixels(camera: PerspectiveCamera, point: Vector3, canvas: { width: number, height: number }) {
  const ndc = point.clone().project(camera)
  return { x: (ndc.x + 1) / 2 * canvas.width, y: (1 - ndc.y) / 2 * canvas.height }
}

describe('the reel\'s camera (the prototype\'s perspective: 900px, origin 50% 40%)', () => {
  const stage = { width: 390, height: 330 }

  it('shows a point on the stage\'s plane where the CSS stage does: 1:1 px, centred, the axis 40 % down', () => {
    const camera = reelCam(stage, { x: stage.width / 2, y: stage.height * REEL_AXIS_Y }, stage.height)
    // The world's origin (the stage's middle) on the plane z = 0: in the stage's middle.
    const middle = toPixels(camera, new Vector3(0, 0, 0), stage)
    expect(middle.x).toBeCloseTo(195, 3)
    expect(middle.y).toBeCloseTo(165, 3)
    // 100 CSS px right and 50 down on the plane: 100 px right and 50 px down on screen.
    const off = toPixels(camera, new Vector3(100 * REEL_PX, -50 * REEL_PX, 0), stage)
    expect(off.x).toBeCloseTo(295, 3)
    expect(off.y).toBeCloseTo(215, 3)
  })

  it('shrinks what is further away as `perspective: 900px` does', () => {
    const camera = reelCam(stage, { x: stage.width / 2, y: stage.height * REEL_AXIS_Y }, stage.height)
    // 120 px back (the first neighbour's depth): scaled by 900 / 1020 about the axis.
    const point = toPixels(camera, new Vector3(132 * REEL_PX, 0, -120 * REEL_PX), stage)
    expect(point.x - 195).toBeCloseTo(132 * 900 / 1020, 2)
  })

  it('broken out over the viewport, the card\'s pixels stay where they were', () => {
    const card = { left: 20, top: 300, width: 390, height: 330 }
    const viewport = { width: 430, height: 932 }
    const inCard = reelCam(stage, { x: stage.width / 2, y: stage.height * REEL_AXIS_Y }, stage.height)
    const out = reelCam(viewport, { x: card.left + card.width / 2, y: card.top + card.height * REEL_AXIS_Y }, stage.height)
    for (const point of [new Vector3(0, 0, 0), new Vector3(0.132, 0.01, -0.12), new Vector3(-0.19, -0.1, -0.16)]) {
      const a = toPixels(inCard, point, stage)
      const b = toPixels(out, point, viewport)
      expect(b.x - card.left).toBeCloseTo(a.x, 3)
      expect(b.y - card.top).toBeCloseTo(a.y, 3)
    }
  })

  it('writes the window into the object it is given (no allocation per frame)', () => {
    const into = reelWindow(1, 1, 0, 0)
    expect(reelWindow(390, 330, 195, 132, REEL_PERSPECTIVE, into)).toBe(into)
    expect(into.width).toBe(390)
    expect(into.offsetY).toBeCloseTo(198 - 132, 6)
  })
})

describe('allocation-free helpers read every frame', () => {
  it('reelFocus and reelBadge are reelPhase\'s focus and badge', () => {
    for (let t = 0; t < 3 * REEL_BEAT; t += 137) {
      expect(reelFocus(t)).toBeCloseTo(reelPhase(t).focus, 12)
      expect(reelBadge(t)).toBeCloseTo(reelPhase(t).badge, 12)
    }
  })

  it('reelPoseInto writes reelPose into the given object', () => {
    const out: ReelPose = { distance: 0, x: 0, y: 0, z: 0, rotateY: 0, opacity: 0, edge: 0, shadow: 0, zIndex: 0 }
    for (const focus of [-1, 0, 0.4, 5.5, 11.9]) {
      for (let index = 0; index < 12; index++) {
        expect(reelPoseInto(index, focus, 12, out)).toBe(out)
        expect(out).toEqual(reelPose(index, focus, 12))
      }
    }
    expect(reelLayout(0.5, 3)).toHaveLength(3)
  })

  it('reelCameraInto writes reelCamera into the given object', () => {
    const out = { z: 0, rotateY: 0, rotateX: 0 }
    for (const time of [0, 1000, 4800, 9600]) {
      expect(reelCameraInto(time, out)).toBe(out)
      expect(out).toEqual(reelCamera(time))
    }
  })
})

describe('the phone\'s dolly clock (moves only while the arc moves)', () => {
  it('holds still through a hold and runs a whole beat in a move', () => {
    expect(reelMoveClock(0)).toBe(0)
    expect(reelMoveClock(REEL_MOVE)).toBeCloseTo(REEL_BEAT, 6)
    expect(reelMoveClock(REEL_MOVE + 1)).toBeCloseTo(REEL_BEAT, 6)
    expect(reelMoveClock(REEL_BEAT - 1)).toBeCloseTo(REEL_BEAT, 6)
    expect(reelMoveClock(REEL_BEAT + REEL_MOVE / 2)).toBeGreaterThan(REEL_BEAT)
    expect(reelMoveClock(2 * REEL_BEAT)).toBeCloseTo(2 * REEL_BEAT, 6)
  })

  it('never runs backwards', () => {
    let last = -1
    for (let t = 0; t < 4 * REEL_BEAT; t += 50) {
      expect(reelMoveClock(t)).toBeGreaterThanOrEqual(last)
      last = reelMoveClock(t)
    }
  })
})

describe('a jump of the arc, eased', () => {
  it('fades the offset on `standard` over its duration', () => {
    const settle = { offset: 1, start: 1000, duration: 800 }
    expect(settleOffset(settle, 1000)).toBe(1)
    expect(settleOffset(settle, 1400)).toBeGreaterThan(0)
    expect(settleOffset(settle, 1400)).toBeLessThan(0.5)
    expect(settleOffset(settle, 1800)).toBe(0)
    expect(settleOffset(null, 0)).toBe(0)
  })

  it('takes the short way round a ringing arc', () => {
    expect(jumpOffset(11, 0, 12)).toBe(-1)
    expect(jumpOffset(0, 11, 12)).toBe(1)
    expect(jumpOffset(2.4, 3, 12)).toBeCloseTo(-0.6, 9)
    // An arc with ends never rings.
    expect(jumpOffset(2, 0, 3)).toBe(2)
  })
})

describe('the Book the caption, pills and dots show', () => {
  it('is the nearest Book, wrapped', () => {
    expect(reelShownIndex(0.4, 12, false)).toBe(0)
    expect(reelShownIndex(0.6, 12, false)).toBe(1)
    expect(reelShownIndex(-1, 12, false)).toBe(11)
    expect(reelShownIndex(12, 12, false)).toBe(0)
  })

  it('while it plays, the Book the beat brings (the caption changes while it is faded out)', () => {
    expect(reelShownIndex(-0.9, 12, true)).toBe(0)
    expect(reelShownIndex(0, 12, true)).toBe(0)
    expect(reelShownIndex(0.1, 12, true)).toBe(1)
  })

  it('stays on the arc\'s Books when it has ends', () => {
    expect(reelShownIndex(-0.3, 3, false)).toBe(0)
    expect(reelShownIndex(2.4, 3, false)).toBe(2)
    expect(reelShownIndex(5, 3, false)).toBe(2)
    expect(reelShownIndex(0, 0, false)).toBe(0)
  })
})

describe('a drag past the ends of an arc with ends', () => {
  it('gives way less and less, never a whole Book', () => {
    expect(rubberFocus(1.5, 3)).toBe(1.5)
    expect(rubberFocus(-0.2, 3)).toBeLessThan(0)
    expect(rubberFocus(-0.2, 3)).toBeGreaterThan(-0.2)
    expect(rubberFocus(-5, 3)).toBeGreaterThan(-0.36)
    expect(rubberFocus(7, 3)).toBeLessThan(2.36)
    // A ringing arc has no ends.
    expect(rubberFocus(-5, 12)).toBe(-5)
  })
})

describe('the reel\'s words', () => {
  it('fills a label\'s placeholders', () => {
    expect(fillLabel(REEL_LABELS.slide, { n: 3, count: 12 })).toBe('Book 3 of 12')
    expect(fillLabel('{n} von {count}', { n: 1, count: 2 })).toBe('1 von 2')
    expect(fillLabel('{missing}', {})).toBe('{missing}')
  })
})
