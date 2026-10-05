import { describe, expect, it, vi } from 'vitest'
import { createFrameGate } from '../../app/utils/stage/frameGate'

/** three's WebGLRenderer defines its methods on the instance, setPixelRatio calling this.setSize. */
function fakeRenderer() {
  const renderer = {
    width: 0,
    clears: 0,
    setSize(width: number, _height: number) {
      // Setting a canvas' width clears its drawing buffer, the same value too.
      renderer.width = width
      renderer.clears++
    },
    setPixelRatio(this: { setSize: (width: number, height: number) => void, width: number }) {
      this.setSize(this.width, 1)
    },
  }
  return renderer
}

describe('createFrameGate', () => {
  it('draws the first frame, then only when the motion or the looks change', () => {
    const gate = createFrameGate()
    const looks = vi.fn(() => 7)
    expect(gate.due(1, looks)).toBe(true)
    gate.drawn()
    // Moving: no looks read; the first rest reads them once and draws.
    expect(gate.due(2, looks)).toBe(true)
    gate.drawn()
    expect(looks).not.toHaveBeenCalled()
    expect(gate.due(2, looks)).toBe(true)
    gate.drawn()
    expect(gate.due(2, looks)).toBe(false)
    looks.mockReturnValue(8)
    expect(gate.due(2, looks)).toBe(true)
  })

  it('draws again after a resize to the same size: the buffer was cleared (a row landing back in its card)', () => {
    const renderer = fakeRenderer()
    const gate = createFrameGate(renderer)
    const looks = () => 1
    renderer.setSize(360, 300)
    expect(gate.due(5, looks)).toBe(true)
    gate.drawn()
    expect(gate.due(5, looks)).toBe(true)
    gate.drawn()
    expect(gate.due(5, looks)).toBe(false)
    // Tres' late resize to the size the row already has: blank, so due.
    renderer.setSize(360, 300)
    expect(renderer.clears).toBe(2)
    expect(gate.due(5, looks)).toBe(true)
  })

  it('catches setSize called from within the renderer (setPixelRatio)', () => {
    const renderer = fakeRenderer()
    const gate = createFrameGate(renderer)
    gate.due(3, () => 1)
    gate.drawn()
    gate.due(3, () => 1)
    gate.drawn()
    expect(gate.due(3, () => 1)).toBe(false)
    renderer.setPixelRatio()
    expect(gate.due(3, () => 1)).toBe(true)
  })

  it('invalidate() and dispose()', () => {
    const renderer = fakeRenderer()
    const original = renderer.setSize
    const gate = createFrameGate(renderer)
    expect(renderer.setSize).not.toBe(original)
    gate.due(3, () => 1)
    gate.drawn()
    gate.due(3, () => 1)
    gate.drawn()
    gate.invalidate()
    expect(gate.due(3, () => 1)).toBe(true)
    gate.dispose()
    expect(renderer.setSize).toBe(original)
  })
})
