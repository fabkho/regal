// The reel's opening timeline: the clock starts a breath (REEL_ENTRANCE_HOLD) after the entrance has landed
// its last Book, and the first Book then has a full beat in front, like every other, before the arc moves
// on (state.ts `lead`). Pure: the state machine driven by ms.
import { describe, expect, it } from 'vitest'
import { advance, badgeOpacity, dollyClock, enterView, frontFocus, frontIndex, initialReel, playClock, play, takeOver } from '../../app/utils/reel/state'
import { REEL_BADGE_OUT, REEL_BEAT, REEL_MOVE, REEL_OPENING_HOLD, reelBadge, reelPhase } from '../../app/utils/reel/timeline'
import { REEL_ENTRANCE_HOLD } from '../../app/utils/reel/entrance'

const opening = (n = 12) => enterView({ ...initialReel(n), visible: true })

describe('the first Book\'s beat', () => {
  it('is a full beat from the moment all the Books are home (the breath, then the hold)', () => {
    expect(REEL_OPENING_HOLD + REEL_ENTRANCE_HOLD * 1000).toBe(REEL_BEAT)
  })

  it('stands in front through the lead, moves to the second Book, then every Book gets a beat', () => {
    const run = opening()
    expect(run.lead).toBe(REEL_OPENING_HOLD)
    // The clock has not started (the entrance is playing): nothing moves.
    expect(frontFocus(run)).toBe(0)
    expect(frontFocus(advance(run, 0))).toBe(0)
    // Through the whole lead: Book 0, not a pixel of the arc has moved.
    for (const ms of [1, 500, 1500, REEL_OPENING_HOLD - 1, REEL_OPENING_HOLD]) expect(frontFocus(advance(run, ms)), `${ms}`).toBe(0)
    // The first move starts after it and lands a move later on the second Book.
    expect(frontFocus(advance(run, REEL_OPENING_HOLD + 50))).toBeGreaterThan(0)
    expect(frontFocus(advance(run, REEL_OPENING_HOLD + REEL_MOVE))).toBeCloseTo(1, 10)
    expect(frontIndex(advance(run, REEL_OPENING_HOLD + REEL_MOVE))).toBe(1)
    // From there the beat is the prototype's: the next Book a beat later.
    expect(frontFocus(advance(run, REEL_OPENING_HOLD + REEL_BEAT))).toBeCloseTo(1, 10)
    expect(frontFocus(advance(run, REEL_OPENING_HOLD + REEL_BEAT + REEL_MOVE))).toBeCloseTo(2, 10)
  })

  it('the clock is only as late as it is started: held, the lead has not begun (covers late, the entrance long)', () => {
    // The card does not advance the state until the entrance is done (Card.vue tick), however long that took.
    let run = opening()
    run = advance(run, 0)
    expect(run.elapsed).toBe(0)
    expect(frontFocus(run)).toBe(0)
    expect(badgeOpacity(run)).toBe(1)
  })

  it('the caption and pills are in through the hold and go out before the first move, as at the end of every beat', () => {
    const run = opening()
    expect(badgeOpacity(run)).toBe(1)
    expect(badgeOpacity(advance(run, REEL_OPENING_HOLD - REEL_BADGE_OUT))).toBe(1)
    const mid = badgeOpacity(advance(run, REEL_OPENING_HOLD - REEL_BADGE_OUT / 2))
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(badgeOpacity(advance(run, REEL_OPENING_HOLD))).toBeCloseTo(0, 6)
    // Then the beat's own: out through the move, in on the hold.
    expect(badgeOpacity(advance(run, REEL_OPENING_HOLD + REEL_MOVE / 2))).toBe(0)
    expect(badgeOpacity(advance(run, REEL_OPENING_HOLD + REEL_BEAT - 400))).toBe(reelBadge(2 * REEL_BEAT - 400))
  })

  it('the camera runs on through the lead (continuous from the poster\'s clock); the arc\'s clock starts after it', () => {
    const run = opening()
    const later = advance(run, 1000)
    expect(dollyClock(run)).toBe(REEL_BEAT)
    expect(dollyClock(later)).toBe(REEL_BEAT + 1000)
    expect(playClock(later)).toBe(REEL_BEAT)
    const after = advance(run, REEL_OPENING_HOLD + 500)
    expect(playClock(after)).toBe(REEL_BEAT + 500)
    expect(frontFocus(after)).toBeCloseTo(reelPhase(REEL_BEAT + 500).focus, 10)
  })

  it('the round still ends on the last Book, a lead later', () => {
    let run = opening(4)
    run = advance(run, REEL_OPENING_HOLD + 3 * REEL_BEAT - 1)
    expect(run.mode).toBe('playing')
    run = advance(run, 1)
    expect(run.mode).toBe('manual')
    expect(frontIndex(run)).toBe(3)
  })

  it('a takeover in the lead rests on the first Book; Play afterwards moves at once (no lead)', () => {
    const run = advance(opening(), 1000)
    const manual = takeOver(run)
    expect(manual.mode).toBe('manual')
    expect(manual.focus).toBe(0)
    const replay = play(manual)
    expect(replay.mode).toBe('playing')
    expect(replay.lead).toBe(0)
  })
})
