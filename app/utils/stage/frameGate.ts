// On-demand frames (utils/stage/frameState.ts): a frame is drawn only when what
// it would show changed since the last one drawn. One hole in "nothing
// changed": the drawing buffer itself. Setting a canvas' size clears it, even
// to the size it already has, and three's `setSize` always sets it. Tres does
// so when its observed size changes, RowScene when the row's canvas moves into
// <body> and back; when the scene and the size end up as they were drawn last
// (a broken-out row landing back in its card, a resize that settles where it
// began), the keys match and the canvas would stay blank until something
// moves. The gate forgets what was drawn whenever the renderer is resized.

/** What a gate needs of the renderer: three's WebGLRenderer. */
export interface SizedRenderer {
  setSize: (width: number, height: number, updateStyle?: boolean) => void
}

export interface FrameGate {
  /** Whether a frame showing `motion` is due; `looks` is read only when the motion matches. */
  due: (motion: number, looks: () => number) => boolean
  /** Note the frame just drawn (call after rendering what `due` allowed). */
  drawn: () => void
  /** The canvas no longer shows the last frame drawn: the next one must be drawn. */
  invalidate: () => void
  /** Stops watching the renderer's resizes. */
  dispose: () => void
}

/**
 * A gate for one canvas. With a `renderer`, its `setSize` (which clears the
 * drawing buffer) invalidates the gate; `setPixelRatio` goes through it too.
 */
export function createFrameGate(renderer?: SizedRenderer | null): FrameGate {
  let drawnMotion: number | null = null
  let drawnLooks: number | null = null
  let pendingMotion: number | null = null
  let pendingLooks: number | null = null

  function invalidate() {
    drawnMotion = null
    drawnLooks = null
  }

  let restore = () => {}
  if (renderer) {
    // An own property on this renderer only, so `this.setSize` inside three
    // (setPixelRatio) comes through here as well.
    const own = Object.prototype.hasOwnProperty.call(renderer, 'setSize')
    const original = renderer.setSize
    renderer.setSize = function (this: SizedRenderer, ...args: Parameters<SizedRenderer['setSize']>) {
      original.apply(this, args)
      invalidate()
    }
    restore = () => {
      if (own) renderer.setSize = original
      else delete (renderer as Partial<SizedRenderer>).setSize
    }
  }

  return {
    due(motion, looks) {
      pendingMotion = motion
      // While things move every frame is drawn: the looks are read once they rest.
      pendingLooks = motion === drawnMotion ? looks() : null
      return !(motion === drawnMotion && pendingLooks === drawnLooks)
    },
    drawn() {
      drawnMotion = pendingMotion
      drawnLooks = pendingLooks
    },
    invalidate,
    dispose() {
      restore()
      restore = () => {}
    },
  }
}
