import { describe, expect, it } from 'vitest'
import { bookTicks, dragFocus, glideFocus, REEL_GLIDE_MAX_MS, REEL_GLIDE_MIN_MS, releaseGlide, releaseVelocity, trackDrag } from '../../app/utils/reel/drag'
import type { DragSample } from '../../app/utils/reel/drag'
import { reelCamera, reelDistance, reelLayout, reelPose, REEL_FADE_AT, REEL_SPACING, REEL_STEP, REEL_TURN } from '../../app/utils/reel/layout'
import { advance, canAutoPlay, closeDetail, createReel, dragTo, enterView, frontFocus, frontIndex, newVisit, openDetail, play, setVisible, step, takeOver, tapBook } from '../../app/utils/reel/state'
import type { ReelState } from '../../app/utils/reel/state'
import { clamp, REEL_BADGE_IN, REEL_BEAT, REEL_CAMERA_Z, REEL_DOLLY_PX, REEL_EASE, REEL_MOVE, reelPhase, reelTotal, seg } from '../../app/utils/reel/timeline'

/** Every pose in a layout must be a finite number (no NaN from the wrap or the zero Book). */
function expectFinite(poses: ReturnType<typeof reelLayout>) {
  for (const pose of poses) {
    for (const value of Object.values(pose)) expect(Number.isFinite(value)).toBe(true)
  }
}

describe('timeline (A · The Reel beat, the prototype\'s constants)', () => {
  it('uses the prototype\'s beat, move and badge timing', () => {
    expect(REEL_BEAT).toBe(3200)
    expect(REEL_MOVE).toBe(800)
    expect(REEL_BADGE_IN).toBe(250)
  })

  it('starts one Book before the first, then lands on it at the end of the first move', () => {
    expect(reelPhase(0).focus).toBe(-1)
    expect(reelPhase(REEL_MOVE).focus).toBeCloseTo(0, 10)
    expect(reelPhase(REEL_MOVE * 0.5).focus).toBeGreaterThan(-1)
    expect(reelPhase(REEL_MOVE * 0.5).focus).toBeLessThan(0)
  })

  it('holds the Book for the rest of the beat (2.4 s), then moves on', () => {
    expect(reelPhase(1500).focus).toBeCloseTo(0, 10)
    expect(reelPhase(REEL_BEAT - 1).focus).toBeCloseTo(0, 10)
    expect(reelPhase(REEL_BEAT + REEL_MOVE).focus).toBeCloseTo(1, 10)
  })

  it('brings the badges in after the move lands, and out before the next beat', () => {
    expect(reelPhase(REEL_MOVE - 1).badge).toBe(0)
    expect(reelPhase(REEL_MOVE + REEL_BADGE_IN).badge).toBeCloseTo(1, 10)
    expect(reelPhase(1500).badge).toBeCloseTo(1, 10)
    expect(reelPhase(REEL_BEAT - 200).badge).toBeCloseTo(1, 10)
    expect(reelPhase(REEL_BEAT - 1).badge).toBeLessThan(0.05)
  })

  it('counts rounds as one beat per Book', () => {
    expect(reelTotal(12)).toBe(12 * REEL_BEAT)
    expect(reelTotal(0)).toBe(0)
  })

  it('has standard ease endpoints and a monotone curve', () => {
    expect(REEL_EASE.standard(0)).toBe(0)
    expect(REEL_EASE.standard(1)).toBe(1)
    let last = 0
    for (let x = 0; x <= 1; x += 0.05) {
      const y = REEL_EASE.standard(x)
      expect(y).toBeGreaterThanOrEqual(last - 1e-9)
      last = y
    }
  })

  it('clamp and seg', () => {
    expect(clamp(-1)).toBe(0)
    expect(clamp(2)).toBe(1)
    expect(seg(5, 0, 10)).toBe(0.5)
  })

  it('the camera dollies and sways around the prototype\'s rest pose', () => {
    expect(reelCamera(0)).toEqual({ z: REEL_CAMERA_Z + REEL_DOLLY_PX, rotateY: 0, rotateX: -4 })
    const quarter = reelCamera(3 * REEL_BEAT / 4)
    expect(quarter.z).toBeCloseTo(REEL_CAMERA_Z, 6)
    expect(quarter.rotateY).toBeCloseTo(4, 6)
  })
})

describe('layout (A · The Reel arc)', () => {
  it('for n = 1, 2, 3, 12: no NaN, a front Book square to the camera, symmetric neighbours', () => {
    for (const n of [1, 2, 3, 12]) {
      for (const focus of [0, 0.37, -1, n - 1]) {
        const poses = reelLayout(focus, n)
        expect(poses).toHaveLength(n)
        expectFinite(poses)
      }
      const front = reelPose(0, 0, n)
      expect(front.distance).toBe(0)
      expect(front.rotateY).toBeCloseTo(0, 10)
      expect(front.x).toBe(0)
      expect(front.opacity).toBe(1)
    }
    expect(reelLayout(0, 0)).toEqual([])
  })

  it('places the first neighbours at the prototype\'s spacing, turn and depth, mirrored', () => {
    const right = reelPose(1, 0, 12)
    const left = reelPose(11, 0, 12)
    expect(right.x).toBe(REEL_SPACING)
    expect(right.rotateY).toBe(-REEL_TURN)
    expect(left.x).toBe(-REEL_SPACING)
    expect(left.rotateY).toBe(REEL_TURN)
    expect(left.z).toBe(right.z)
    expect(right.z).toBe(-120)
    expect(left.opacity).toBe(right.opacity)
  })

  it('spaces further Books by the step, and hides those past the fade', () => {
    const second = reelPose(2, 0, 12)
    expect(second.x).toBe(REEL_SPACING + REEL_STEP)
    expect(second.z).toBe(-120 - 40)
    expect(reelPose(3, 0, 12).opacity).toBe(0)
    expect(reelPose(2, 0, 12).distance).toBeLessThanOrEqual(REEL_FADE_AT)
  })

  it('rings for n ≥ 4 (the short way round), and not for 2 or 3', () => {
    expect(reelDistance(11, 0, 12)).toBe(-1)
    expect(reelDistance(6, 0, 12)).toBe(6)
    expect(reelDistance(3, 0, 3)).toBe(3)
    expect(reelDistance(2, 0, 3)).toBe(2)
    expect(reelDistance(0, 2, 3)).toBe(-2)
    expect(reelDistance(0, 3, 4)).toBe(1)
  })

  it('moves the arc with a fractional focus, the front Book fading to its neighbour', () => {
    const half = reelPose(0, 0.5, 12)
    expect(half.distance).toBeCloseTo(-0.5, 10)
    expect(Math.abs(half.x)).toBeCloseTo(REEL_SPACING / 2, 10)
    expect(Math.abs(half.rotateY)).toBeCloseTo(REEL_TURN / 2, 10)
  })
})

describe('state (section H table)', () => {
  const twelve = () => createReel(12)

  it('enters Playing once per visit, from the opening pose', () => {
    const first = enterView(twelve())
    expect(first.mode).toBe('playing')
    expect(frontFocus(first)).toBeCloseTo(-1, 10)
    const after = takeOver(first)
    expect(enterView(after).mode).toBe('manual')
    expect(enterView(newVisit(after)).mode).toBe('playing')
  })

  it('auto-plays for one round, then rests in Manual on the last Book', () => {
    let s = enterView(twelve())
    s = advance(s, reelTotal(12) - 1)
    expect(s.mode).toBe('playing')
    s = advance(s, 1)
    expect(s.mode).toBe('manual')
    expect(frontIndex(s)).toBe(11)
    expect(play(s).mode).toBe('playing')
  })

  it('tells the beat from the clock, so a phase is exact at every ms', () => {
    let s = enterView(twelve())
    s = advance(s, REEL_BEAT + 100)
    expect(frontFocus(s)).toBeCloseTo(reelPhase(REEL_BEAT + 100).focus, 10)
    expect(frontIndex(s)).toBe(0)
  })

  it('rests off screen and resumes where it stopped', () => {
    let s = enterView(twelve())
    s = advance(s, 1000)
    s = setVisible(s, false)
    const before = s.elapsed
    s = advance(s, 5000)
    expect(s.mode).toBe('playing')
    expect(s.elapsed).toBe(before)
    s = setVisible(s, true)
    s = advance(s, 500)
    expect(s.elapsed).toBe(before + 500)
  })

  it('a pause / takeover from Playing lands in Manual, where the clock had the arc', () => {
    let s = enterView(twelve())
    s = advance(s, 1500)
    const at = frontFocus(s)
    s = takeOver(s)
    expect(s.mode).toBe('manual')
    expect(s.focus).toBeCloseTo(at, 10)
    expect(takeOver(s)).toBe(s)
  })

  it('Play resumes from Manual and stays Manual on a second takeover', () => {
    let s = takeOver(enterView(twelve()))
    s = play(s)
    expect(s.mode).toBe('playing')
    expect(play(s)).toBe(s)
  })

  it('arrow keys take over and step one Book, clamped for 2 or 3 and ringing for 12', () => {
    let s = twelve()
    s = step(s, 1)
    expect(s.mode).toBe('manual')
    expect(frontIndex(s)).toBe(1)
    s = step(s, -1)
    s = step(s, -1)
    expect(frontIndex(s)).toBe(11)

    let three = createReel(3)
    three = step(three, -1)
    expect(frontIndex(three)).toBe(0)
    three = step(step(step(three, 1), 1), 1)
    expect(frontIndex(three)).toBe(2)
  })

  it('a tap on the front Book opens the detail, also while Playing; a neighbour comes to the front', () => {
    const playing = enterView(twelve())
    const mid = advance(playing, 1200)
    const detail = tapBook(mid, frontIndex(mid))
    expect(detail.mode).toBe('detail')
    expect(frontIndex(detail)).toBe(frontIndex(mid))

    const neighbour = tapBook(twelve(), 1)
    expect(neighbour.mode).toBe('manual')
    expect(frontIndex(neighbour)).toBe(1)
    expect(Number.isInteger(neighbour.focus)).toBe(true)
  })

  it('brings a Book from the far side of a ringing arc the short way', () => {
    const s = tapBook(createReel(12), 11)
    expect(frontIndex(s)).toBe(11)
    expect(s.focus).toBe(-1)
  })

  it('Detail is left to Manual (Put back, sheet down, Escape, Back), and a drag does not leave it', () => {
    const detail = openDetail(takeOver(enterView(twelve())))
    expect(dragTo(detail, 3)).toBe(detail)
    expect(step(detail, 1)).toBe(detail)
    expect(tapBook(detail, 2)).toBe(detail)
    const back = closeDetail(detail)
    expect(back.mode).toBe('manual')
    expect(frontIndex(back)).toBe(frontIndex(detail))
    expect(closeDetail(back)).toBe(back)
  })

  it('a drag takes the reel over and catches it where it is', () => {
    const playing = enterView(twelve())
    const mid = advance(playing, REEL_BEAT + 300)
    const at = frontFocus(mid)
    const dragged = dragTo(takeOver(mid), at + 0.25)
    expect(dragged.mode).toBe('manual')
    expect(dragged.focus).toBeCloseTo(at + 0.25, 10)
  })

  it('Reduce Motion never auto-plays, and Play is a no-op', () => {
    const reduced = createReel(12, { reduced: true })
    expect(canAutoPlay(reduced)).toBe(false)
    expect(enterView(reduced)).toBe(reduced)
    expect(play(reduced)).toBe(reduced)
    expect(step(reduced, 1).mode).toBe('manual')
  })

  it('a single Book never auto-plays', () => {
    expect(enterView(createReel(1)).mode).toBe('manual')
    expect(enterView(createReel(0)).mode).toBe('manual')
  })

  it('the Play from the rest on a ringing arc begins its round at the Book in front', () => {
    let s: ReelState = takeOver(enterView(twelve()))
    s = dragTo(s, 5)
    s = play(s)
    expect(frontFocus(s)).toBeCloseTo(5, 10)
    s = advance(s, REEL_MOVE + 10)
    expect(frontFocus(s)).toBeCloseTo(6, 10)
  })
})

describe('drag (Regal row drag, reused)', () => {
  it('follows the finger 1:1 past the slop, in the direction of the finger', () => {
    // The first 8 px are the slop; the arc moves 1 Book per px-per-Book after.
    expect(dragFocus(0, 0, 124)).toBe(0)
    expect(dragFocus(0, 8 + 124, 124)).toBeCloseTo(-1, 10)
    expect(dragFocus(0, -(8 + 124), 124)).toBeCloseTo(1, 10)
  })

  it('counts one tick per Book passed', () => {
    expect(bookTicks(0, 0.4)).toBe(0)
    expect(bookTicks(0, 1.2)).toBe(1)
    expect(bookTicks(0, -2.6)).toBe(3)
  })

  it('a slow release snaps to the nearest Book where it stands', () => {
    const glide = releaseGlide(2.3, 124, 10)
    expect(glide.to).toBe(2)
    expect(glide.duration).toBe(REEL_MOVE)
    const up = releaseGlide(2.6, 124, -10)
    expect(up.to).toBe(3)
  })

  it('a flick glides on and snaps to a Book (right flick: the previous Book comes in)', () => {
    const glide = releaseGlide(0, 124, 800)
    expect(glide.to).toBeLessThan(0)
    expect(Number.isInteger(glide.to)).toBe(true)
    expect(glide.duration).toBeGreaterThanOrEqual(REEL_GLIDE_MIN_MS)
    expect(glide.duration).toBeLessThanOrEqual(REEL_GLIDE_MAX_MS)
    const left = releaseGlide(0, 124, -800)
    expect(left.to).toBeGreaterThan(0)
  })

  it('a glide starts at the release and lands exactly on its Book', () => {
    const glide = releaseGlide(0, 124, -2000)
    expect(glideFocus(glide, 0).focus).toBeCloseTo(0, 3)
    const end = glideFocus(glide, glide.duration)
    expect(end.done).toBe(true)
    expect(end.focus).toBe(glide.to)
    const mid = glideFocus(glide, glide.duration / 2)
    expect(mid.done).toBe(false)
    expect(mid.focus).toBeGreaterThan(Math.min(glide.from, glide.to))
    expect(mid.focus).toBeLessThan(Math.max(glide.from, glide.to))
  })

  it('a glide with nowhere to go is done at once', () => {
    expect(glideFocus({ from: 2, to: 2, pxPerBook: 124, duration: 300 }, 0)).toEqual({ focus: 2, done: true })
  })

  it('the velocity from the samples: a finger moving 1000 px/s reads as about that', () => {
    const samples: DragSample[] = []
    for (let t = 0; t <= 100; t += 8) trackDrag(samples, t, t)
    expect(releaseVelocity(samples, 100)).toBeCloseTo(1000, -1)
  })
})
