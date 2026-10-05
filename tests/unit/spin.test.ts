import { Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { createSpin, dragSpin, glideSpin, resetSpin, SPIN_PER_PX, spinQuaternion, startSettle, TURNTABLE_TIP } from '../../app/utils/books/spin'

/** Where the spin takes a direction of the Book (in the picture's frame: x right, y up, z towards you). */
function turned(spin: ReturnType<typeof createSpin>, mode: 'free' | 'turntable', direction: Vector3) {
  return direction.clone().applyQuaternion(spinQuaternion(spin, mode, new Quaternion()))
}

const close = (a: Vector3, b: Vector3) => expect(a.distanceTo(b)).toBeLessThan(1e-6)

describe('free spin (trackball)', () => {
  it('turns left/right about the picture\'s vertical and tips with up/down about its horizontal', () => {
    const right = createSpin()
    dragSpin(right, Math.PI / 2 / SPIN_PER_PX, 0, 'free')
    // A quarter turn to the right: what faced you faces right.
    close(turned(right, 'free', new Vector3(0, 0, 1)), new Vector3(1, 0, 0))

    const down = createSpin()
    dragSpin(down, 0, Math.PI / 2 / SPIN_PER_PX, 'free')
    // Dragged down: the top tips towards you.
    close(turned(down, 'free', new Vector3(0, 1, 0)), new Vector3(0, 0, 1))
  })

  it('turns about the screen\'s axes whatever it shows already: no gimbal lock, no tip limit', () => {
    const spin = createSpin()
    // Tip it over the top (past the turntable's limit) …
    dragSpin(spin, 0, Math.PI / SPIN_PER_PX, 'free')
    close(turned(spin, 'free', new Vector3(0, 1, 0)), new Vector3(0, -1, 0))
    // … then a sideways drag still turns it about the screen's vertical.
    const before = turned(spin, 'free', new Vector3(0, 0, 1))
    dragSpin(spin, Math.PI / 2 / SPIN_PER_PX, 0, 'free')
    const after = turned(spin, 'free', new Vector3(0, 0, 1))
    close(after, before.applyAxisAngle(new Vector3(0, 1, 0), Math.PI / 2))
  })

  it('glides on after a quick release, slowing to a stop; not after a held one', () => {
    const spin = createSpin()
    for (let index = 0; index < 4; index++) dragSpin(spin, 8, 0, 'free', { ms: 16 })
    const at = spinQuaternion(spin, 'free', new Quaternion()).clone()
    expect(glideSpin(spin, 16, 'free')).toBe(true)
    const moved = spinQuaternion(spin, 'free', new Quaternion()).angleTo(at)
    expect(moved).toBeGreaterThan(0)
    let frames = 0
    while (glideSpin(spin, 16, 'free') && frames < 1000) frames++
    expect(frames).toBeGreaterThan(5)
    expect(frames).toBeLessThan(1000)
    expect(spin.vx).toBe(0)

    const held = createSpin()
    dragSpin(held, 8, 0, 'free', { ms: 16 })
    resetSpin(held)
    expect(glideSpin(held, 16, 'free')).toBe(false)
  })

  it('a glide doesn\'t depend on the frame rate', () => {
    const a = createSpin()
    const b = createSpin()
    dragSpin(a, 10, 4, 'free', { ms: 16 })
    dragSpin(b, 10, 4, 'free', { ms: 16 })
    for (let index = 0; index < 60; index++) glideSpin(a, 16, 'free')
    for (let index = 0; index < 30; index++) glideSpin(b, 32, 'free')
    expect(spinQuaternion(a, 'free', new Quaternion()).angleTo(spinQuaternion(b, 'free', new Quaternion()))).toBeLessThan(1e-3)
  })

  it('settles back square along the shortest way (a turn over, the way back to the row)', () => {
    const spin = createSpin()
    dragSpin(spin, 120, -80, 'free')
    const target = startSettle(spin)
    expect(target).toEqual({ x: 0, y: 0, settle: 1 })
    const start = spinQuaternion(spin, 'free', new Quaternion()).clone()
    spin.settle = 0.5
    const half = spinQuaternion(spin, 'free', new Quaternion()).angleTo(new Quaternion())
    expect(half).toBeCloseTo(start.angleTo(new Quaternion()) / 2, 6)
    spin.settle = 1
    expect(spinQuaternion(spin, 'free', new Quaternion()).angleTo(new Quaternion())).toBeLessThan(1e-6)
    expect(spin.from).toBeNull()
  })

  it('a drag takes over from a settle', () => {
    const spin = createSpin()
    dragSpin(spin, 100, 0, 'free')
    startSettle(spin)
    spin.settle = 0.5
    spinQuaternion(spin, 'free', new Quaternion())
    dragSpin(spin, 1, 0, 'free')
    expect(spin.from).toBeNull()
    expect(spin.settle).toBe(1)
  })
})

describe('turntable spin (the Stage\'s)', () => {
  it('turns about the Book\'s vertical and tips at most TURNTABLE_TIP', () => {
    const spin = createSpin()
    dragSpin(spin, 50, 1000, 'turntable')
    expect(spin.x).toBeCloseTo(50 * SPIN_PER_PX)
    expect(spin.y).toBe(TURNTABLE_TIP)
    // As before: tip about the picture's horizontal, then turn about the Book's vertical.
    const expected = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), spin.y)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), spin.x))
    expect(spinQuaternion(spin, 'turntable', new Quaternion()).angleTo(expected)).toBeLessThan(1e-9)
  })

  it('ignores the vertical part on a finger in the card (the page scrolls), and never glides', () => {
    const spin = createSpin()
    dragSpin(spin, 10, 30, 'turntable', { tip: false })
    expect(spin.y).toBe(0)
    expect(glideSpin(spin, 16, 'turntable')).toBe(false)
  })
})
