import { describe, expect, it } from 'vitest'
import { bookTicks, dragFocus, glideFocus, REEL_DRAG_PX_PER_BOOK, releaseGlide, releaseVelocity, trackDrag } from '../../app/utils/reel/drag'
import type { DragSample } from '../../app/utils/reel/drag'
import { reelCamera, reelDistance, reelLayout, reelPose, REEL_FADE_AT, REEL_SPACING, REEL_STEP, REEL_TURN } from '../../app/utils/reel/layout'
import { advance, badgeOpacity, canAutoPlay, closeDetail, createReel, dragTo, enterView, frontFocus, frontIndex, newVisit, openDetail, pauseControl, play, release, setReduced, setVisible, settleOnBook, step, takeOver, tapBook } from '../../app/utils/reel/state'
import type { ReelState } from '../../app/utils/reel/state'
import { clamp, REEL_BADGE_IN, REEL_BEAT, REEL_CAMERA_Z, REEL_DOLLY_PX, REEL_EASE, REEL_MOVE, REEL_SNAP_MS, reelPhase, reelTotal, seg, wholeBook } from '../../app/utils/reel/timeline'

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

describe('layout golden values (prototype formula, index.html render)', () => {
  // n = 12, focus 0: x = sign(d)·(|d|<1 ? 132|d| : 132 + (|d|-1)·62), rotY = -clamp(d)·52 - sign(d)·clamp(|d|-1)·6,
  // z = -min(|d|,1)·120 - max(0,|d|-1)·40, hidden past 2.6, shadow 1-0.3|d|, zIndex 100 - round(10|d|).
  it('matches the prototype for d = 0, ±1, ±2, 2.6 and 3', () => {
    const at = (d: number) => reelPose(0, -d, 12)
    expect(at(0)).toMatchObject({ x: 0, rotateY: 0, z: 0, opacity: 1, zIndex: 100 })
    expect(at(0).shadow).toBeCloseTo(1, 10)
    expect(at(1)).toMatchObject({ x: 132, rotateY: -52, z: -120, opacity: 1, zIndex: 90 })
    expect(at(1).shadow).toBeCloseTo(0.7, 10)
    expect(at(2)).toMatchObject({ x: 194, rotateY: -58, z: -160, opacity: 1, zIndex: 80 })
    expect(at(2).shadow).toBeCloseTo(0.4, 10)
    expect(at(2.6)).toMatchObject({ opacity: 1, zIndex: 74 })
    expect(at(2.6).x).toBeCloseTo(231.2, 10)
    expect(at(2.6).rotateY).toBeCloseTo(-61.6, 10)
    expect(at(2.6).z).toBeCloseTo(-184, 10)
    expect(at(3)).toMatchObject({ opacity: 0, shadow: 0 })
  })

  it('mirrors the left side: x and rotateY flip sign, z stays', () => {
    const left = reelPose(10, 0, 12)
    expect(left.distance).toBe(-2)
    expect(left.x).toBe(-194)
    expect(left.rotateY).toBe(58)
    expect(left.z).toBe(-160)
  })
})

describe('0 and 1 Books', () => {
  it('a layout of nothing is empty; one Book sits square in front', () => {
    expect(reelLayout(0, 0)).toEqual([])
    expect(reelLayout(0, 1)[0]).toMatchObject({ distance: 0, x: 0, opacity: 1 })
  })

  it('step, tap and play on one Book stay in place, or open its detail', () => {
    const one = createReel(1)
    expect(frontIndex(step(one, 1))).toBe(0)
    expect(frontIndex(step(one, -1))).toBe(0)
    expect(tapBook(one, 0).mode).toBe('detail')
    expect(play(one)).toBe(one)
    expect(enterView(one)).toBe(one)
  })

  it('zero Books: every event is a no-op on an empty reel', () => {
    const none = createReel(0)
    expect(step(none, 1)).toBe(none)
    expect(tapBook(none, 0)).toBe(none)
    expect(openDetail(none)).toBe(none)
    expect(frontIndex(none)).toBe(0)
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

describe('state: live position, wrap, visibility, reduced', () => {
  it('stepped left three times, Play runs the full round on time (no frozen clock)', () => {
    let s = step(step(step(createReel(12), -1), -1), -1)
    expect(frontIndex(s)).toBe(9)
    s = play(s)
    expect(frontFocus(s)).toBeCloseTo(9, 10)
    s = advance(s, REEL_BEAT + REEL_MOVE + 10)
    expect(frontFocus(s)).toBeCloseTo(11, 10)
    s = advance(s, 10 * REEL_BEAT)
    expect(s.mode).toBe('playing')
    s = advance(s, 2 * REEL_BEAT)
    expect(s.mode).toBe('manual')
    expect(frontIndex(s)).toBe(9)
  })

  it('a dragged-below-zero focus, then Play: the round ends on the Book it began on', () => {
    let s = dragTo(createReel(12), -4.2)
    s = play(s)
    s = advance(s, 12 * REEL_BEAT)
    expect(s.mode).toBe('manual')
    expect(frontFocus(s)).toBe(20)
    expect(frontIndex(s)).toBe(8)
  })

  it('a 2-Book reel opens on its first Book (no empty slot) and rests on the second', () => {
    let s = enterView(createReel(2))
    expect(s.mode).toBe('playing')
    expect(frontIndex(s)).toBe(0)
    expect(frontFocus(s)).toBeCloseTo(0, 10)
    s = advance(s, REEL_BEAT)
    expect(s.mode).toBe('manual')
    expect(frontFocus(s)).toBe(1)
  })

  it('a 3-Book reel started from its last Book restarts at the first, never off the arc', () => {
    const last = step(createReel(3), 1)
    const s = step(step(last, 1), 1)
    expect(frontIndex(s)).toBe(2)
    const played = play(s)
    expect(frontFocus(played)).toBeCloseTo(0, 10)
    expect(advance(played, 2 * REEL_BEAT).focus).toBe(2)
  })

  it('a Playing reel that is hidden keeps its clock; shown again it does not restart the visit', () => {
    let s = enterView(createReel(12))
    s = advance(s, 1000)
    s = setVisible(s, false)
    s = setVisible(s, true)
    expect(s.elapsed).toBe(1000)
    expect(s.played).toBe(true)
  })

  it('a reel first shown on screen starts; one first shown hidden starts when it comes into view', () => {
    const hidden = setVisible(createReel(12), false)
    expect(hidden.mode).toBe('manual')
    expect(setVisible(hidden, true).mode).toBe('playing')
  })

  it('Reduce Motion mid-visit takes a Playing reel over; off again, it may auto-play after a new visit', () => {
    const playing = enterView(createReel(12))
    const reduced = setReduced(advance(playing, 1200), true)
    expect(reduced.mode).toBe('manual')
    expect(frontFocus(reduced)).toBeCloseTo(0, 10)
    const back = setReduced(reduced, false)
    expect(enterView(newVisit(back)).mode).toBe('playing')
  })

  it('the pause button reads Pause while Playing, rests included, and Play otherwise', () => {
    const playing = enterView(createReel(12))
    expect(pauseControl(playing)).toBe('pause')
    expect(pauseControl(setVisible(playing, false))).toBe('pause')
    expect(pauseControl(takeOver(playing))).toBe('play')
    expect(pauseControl(openDetail(takeOver(playing)))).toBe('play')
  })

  it('the caption stays after a takeover: badge is 1 in Manual and Detail', () => {
    const playing = enterView(createReel(12))
    expect(badgeOpacity(playing)).toBeLessThan(1)
    const manual = takeOver(advance(playing, 1500))
    expect(badgeOpacity(manual)).toBe(1)
    expect(badgeOpacity(openDetail(manual))).toBe(1)
  })
})

describe('state: glides, catches and live reads', () => {
  it('a release glides, and arrows during the glide step from where the arc is now', () => {
    let s = release(createReel(12), -2000)
    expect(s.mode).toBe('manual')
    expect(s.glide).not.toBeNull()
    s = advance(s, (s.glide?.glide.duration ?? 0) / 2)
    const live = frontFocus(s)
    expect(live).toBeGreaterThan(Math.min(0, s.glide?.glide.to ?? 0))
    const next = step(s, 1)
    expect(next.glide).toBeNull()
    expect(next.focus).toBe(Math.round(live) + 1)
  })

  it('a tap during a glide tapping the Book now in front opens its detail from the live position', () => {
    let s = release(createReel(12), -2000)
    s = advance(s, 1)
    const live = Math.round(frontFocus(s))
    const tapped = tapBook(s, ((live % 12) + 12) % 12)
    expect(tapped.mode).toBe('detail')
    expect(tapped.focus).toBe(live)
  })

  it('a drag that catches a glide takes its live focus, not the release target', () => {
    let s = release(createReel(12), -2000)
    s = advance(s, 60)
    const at = frontFocus(s)
    s = takeOver(s)
    expect(s.glide).toBeNull()
    expect(s.focus).toBeCloseTo(at, 10)
  })

  it('a real catch mid-move: a drag starts while the beat is moving and takes the arc where it is', () => {
    const playing = enterView(createReel(12))
    const midMove = advance(playing, REEL_BEAT + REEL_MOVE / 2)
    const expected = reelPhase(REEL_BEAT + REEL_MOVE / 2).focus
    expect(frontFocus(midMove)).toBeCloseTo(expected, 10)
    const caught = takeOver(midMove)
    expect(caught.focus).toBeCloseTo(expected, 10)
    expect(caught.focus).not.toBe(0)
    expect(caught.focus).not.toBe(Math.round(expected))
  })

  it('settleOnBook: a takeover mid-move snaps to the nearest Book by a release\'s rule, and lands exactly', () => {
    let s = advance(enterView(createReel(12)), REEL_BEAT + REEL_MOVE / 2)
    const live = frontFocus(s)
    expect(live % 1).not.toBe(0)
    s = settleOnBook(s)
    expect(s.mode).toBe('manual')
    expect(s.glide).not.toBeNull()
    expect(s.glide!.glide).toEqual(releaseGlide(live, REEL_DRAG_PX_PER_BOOK, 0, 12))
    expect(s.glide!.glide.to).toBe(Math.round(live))
    // From the live position (it does not jump), then rests on the Book.
    expect(frontFocus(s)).toBeCloseTo(live, 4)
    s = advance(s, REEL_MOVE)
    expect(s.glide).toBeNull()
    expect(s.focus).toBe(Math.round(live))
    expect(settleOnBook(s)).toBe(s)
  })

  it('settleOnBook takes a snap in progress over and re-snaps from where it is; Reduce Motion lands at once', () => {
    const playing = advance(enterView(createReel(12)), REEL_BEAT + 100)
    const gliding = advance(release(playing, 0), 50)
    const live = frontFocus(gliding)
    expect(live % 1).not.toBe(0)
    expect(settleOnBook(gliding).glide!.glide.from).toBeCloseTo(live, 10)
    const still = settleOnBook(advance(enterView(createReel(12, { reduced: true })), 1))
    expect(still.glide).toBeNull()
    const mid = setReduced(advance(playing, 500), true)
    expect(mid.glide).toBeNull()
    expect(Number.isInteger(mid.focus)).toBe(true)
    const caught = takeOver(advance(playing, 300))
    expect(settleOnBook({ ...caught, reduced: true })).toMatchObject({ mode: 'manual', glide: null, focus: Math.round(caught.focus) })
  })

  it('settleOnBook keeps the target on the arc and leaves Detail and an empty reel alone', () => {
    const few = settleOnBook({ ...createReel(5), focus: 3.6 })
    expect(few.glide!.glide.to).toBe(4)
    const edge = settleOnBook({ ...createReel(5), focus: 4.4 })
    expect(edge.glide!.glide.to).toBe(4)
    const detail = openDetail(createReel(12))
    expect(settleOnBook(detail)).toBe(detail)
    const none = createReel(0)
    expect(settleOnBook(none)).toBe(none)
  })

  it('wholeBook never returns -0', () => {
    expect(Object.is(wholeBook(-0.2), -0)).toBe(false)
    expect(Object.is(releaseGlide(0.2, REEL_DRAG_PX_PER_BOOK, 0, 12).to, -0)).toBe(false)
  })
})

describe('drag (Regal row drag, reused)', () => {
  it('follows the finger 1:1 past the slop, in the direction of the finger', () => {
    // The first 8 px are the slop, then one Book per REEL_DRAG_PX_PER_BOOK (132 px).
    expect(dragFocus(0, 0)).toBe(0)
    expect(dragFocus(0, 8 + 132)).toBeCloseTo(-1, 10)
    expect(dragFocus(0, -(8 + 132))).toBeCloseTo(1, 10)
  })

  it('pxPerBook is the arc spacing: a neighbour\'s width of drag brings it to the front', () => {
    expect(REEL_DRAG_PX_PER_BOOK).toBe(132)
  })

  it('counts one tick per Book passed', () => {
    expect(bookTicks(0, 0.4)).toBe(0)
    expect(bookTicks(0, 1.2)).toBe(1)
    expect(bookTicks(0, -2.6)).toBe(3)
  })

  it('a slow release snaps to the nearest Book where it stands, for the duration per Book', () => {
    const glide = releaseGlide(2.3, REEL_DRAG_PX_PER_BOOK, 10, 12)
    expect(glide.to).toBe(2)
    expect(glide.duration).toBeCloseTo(REEL_SNAP_MS * 0.3, 6)
    const up = releaseGlide(2.6, REEL_DRAG_PX_PER_BOOK, -10, 12)
    expect(up.to).toBe(3)
    expect(releaseGlide(2.6, REEL_DRAG_PX_PER_BOOK, -10, 12).duration).toBeCloseTo(REEL_SNAP_MS * 0.4, 6)
  })

  it('one duration rule: a whole Book takes one move, a longer snap is capped at one move', () => {
    expect(releaseGlide(0.45, REEL_DRAG_PX_PER_BOOK, 0, 12).duration).toBeCloseTo(REEL_SNAP_MS * 0.45, 6)
    expect(releaseGlide(0, REEL_DRAG_PX_PER_BOOK, -3000, 12).duration).toBe(REEL_SNAP_MS)
    expect(releaseGlide(0, REEL_DRAG_PX_PER_BOOK, 0, 12).duration).toBe(0)
  })

  it('a flick glides on and snaps to a Book (right flick: the previous Book comes in)', () => {
    const glide = releaseGlide(0, REEL_DRAG_PX_PER_BOOK, 800, 12)
    expect(glide.to).toBeLessThan(0)
    expect(Number.isInteger(glide.to)).toBe(true)
    expect(releaseGlide(0, REEL_DRAG_PX_PER_BOOK, -800, 12).to).toBeGreaterThan(0)
  })

  it('the target stays on the arc: whole Books for n < 4, at most one lap away for a ring', () => {
    expect(releaseGlide(0, REEL_DRAG_PX_PER_BOOK, 8000, 3).to).toBe(0)
    expect(releaseGlide(2, REEL_DRAG_PX_PER_BOOK, -8000, 3).to).toBe(2)
    expect(releaseGlide(0, REEL_DRAG_PX_PER_BOOK, 8000, 3).to).toBeGreaterThanOrEqual(0)
    const ring = releaseGlide(0, REEL_DRAG_PX_PER_BOOK, -8000, 12)
    expect(Math.abs(ring.to - 0)).toBeLessThanOrEqual(12)
    expect(releaseGlide(0, REEL_DRAG_PX_PER_BOOK, -8000, 1).to).toBe(0)
  })

  it('a glide starts at the release and lands exactly on its Book', () => {
    const glide = releaseGlide(0, REEL_DRAG_PX_PER_BOOK, -2000, 12)
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
    expect(glideFocus({ from: 2, to: 2, pxPerBook: 132, duration: 300 }, 0)).toEqual({ focus: 2, done: true })
  })

  it('the velocity from the samples: a finger moving 1000 px/s reads as about that', () => {
    const samples: DragSample[] = []
    for (let t = 0; t <= 100; t += 8) trackDrag(samples, t, t)
    expect(releaseVelocity(samples, 100)).toBeCloseTo(1000, -1)
  })
})
