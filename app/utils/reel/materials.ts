// The Reel's materials (components/reel/Books.vue dresses every Book with them)
// and the warm-up that compiles their shaders before the first frame: the
// programs a reel needs are a handful (cloth, printed face, page edge, floor
// shadow), the same for every Book, so one tiny group of meshes wearing the
// very same materials, handed to `renderer.compileAsync`, has them compiled
// (in parallel, off the main thread where KHR_parallel_shader_compile is
// there) while the page still sets up. The Books' own materials then find
// their programs in three's cache instead of stalling the first frame.
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector4,
} from 'three'
import type { Material, PerspectiveCamera, Scene, WebGLRenderer } from 'three'

export const CLOTH_ALBEDO = 0.6
export const COVER_ALBEDO = 1
export const FACE_ALBEDO = 0.85
export const PAPER_ALBEDO = 0.78
export const HEAD_DUST = 0.9
export const PAGE_BUMP = 0.5

/** A drawn face (Spine, back, page edge) as a texture: sRGB, filtered at an angle. */
export function faceTexture(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

/** A Book's cloth (its Cover until the front loads, and a plain face's colour). */
export function clothMaterial(color: string): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({ roughness: 0.72, metalness: 0, clearcoat: 0.12, clearcoatRoughness: 0.6, envMapIntensity: 0.35 })
  material.userData.cloth = color
  material.color.set(color).multiplyScalar(CLOTH_ALBEDO)
  return material
}

/** A printed face: the Spine, the back (and the front once it has a Cover, see Books.vue `printCover`). */
export function printedMaterial(texture: CanvasTexture): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({ map: texture, color: new Color(1, 1, 1).multiplyScalar(FACE_ALBEDO), roughness: 0.68, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.55, envMapIntensity: 0.35 })
}

/** One page edge (head, tail, fore edge): paper with a bumped grain. */
export function pageEdgeMaterial(texture: CanvasTexture, dust = 1): MeshStandardMaterial {
  return new MeshStandardMaterial({
    map: texture,
    bumpMap: texture,
    bumpScale: PAGE_BUMP,
    color: new Color(1, 1, 1).multiplyScalar(PAPER_ALBEDO * dust),
    roughness: 0.93,
    metalness: 0,
    envMapIntensity: 0.3,
  })
}

/** The floor shadow under a Book (it fades with `opacity`). */
export function shadowMaterial(texture: CanvasTexture | null): MeshBasicMaterial {
  return new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, side: DoubleSide, opacity: 0 })
}

/**
 * Resolves once the GPU has finished what was issued so far, without blocking the
 * main thread (a fence polled between frames). A canvas nobody sees yet is not
 * presented, so the browser may hold its drawing until the first time it is shown
 * and then make the page wait for all of it at once; waiting here, while nothing
 * depends on it, moves that cost off the frame that shows the canvas. Resolves at
 * once without WebGL 2 fences, after `patience` ms at the latest, and when `signal` aborts.
 */
export function gpuIdle(renderer: WebGLRenderer, patience = 1500, signal?: AbortSignal): Promise<void> {
  const gl = renderer.getContext() as WebGL2RenderingContext
  const sync = typeof gl.fenceSync === 'function' ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null
  if (!sync) return Promise.resolve()
  gl.flush()
  const until = performance.now() + patience
  return new Promise((resolve) => {
    const poll = () => {
      let done: boolean
      try {
        done = signal?.aborted || gl.isContextLost() || gl.getSyncParameter(sync, gl.SYNC_STATUS) === gl.SIGNALED || performance.now() > until
        if (done) gl.deleteSync(sync)
      }
      catch {
        done = true
      }
      if (done) resolve()
      else setTimeout(poll, 8)
    }
    poll()
  })
}

export interface ReelWarmup {
  /** Resolves once the programs are compiled (also where compiling ahead isn't possible: then the first frame compiles). Never rejects. */
  ready: Promise<void>
  /**
   * Draws every warm mesh once, a pixel big, into the canvas: a GPU builds a program's
   * pipeline at its first draw, not when the program links, so this is what readies it.
   * The real Books' frame is drawn over it (it clears first).
   */
  draw: () => void
  /** Frees the warm-up's materials; call once the real Books have drawn (until then it holds the programs). */
  dispose: () => void
}

/**
 * Starts compiling the reel's programs for `scene`'s lights and the renderer's
 * settings: the cloth, a printed face, a page edge and a floor shadow, worn by
 * the same factories as the Books' own (so the programs match), in a group
 * that is only in the scene while `draw` runs. Never rejects; a renderer that
 * can't compile ahead resolves at once and the first frame compiles as it
 * always did.
 */
export function warmReelMaterials(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): ReelWarmup {
  const plain = document.createElement('canvas')
  plain.width = plain.height = 1
  const texture = faceTexture(plain)
  const materials: Material[] = [clothMaterial('#888888'), printedMaterial(texture), pageEdgeMaterial(texture), shadowMaterial(texture)]
  const box = new BoxGeometry(1, 1, 1)
  const plane = new PlaneGeometry(1, 1)
  const group = new Group()
  group.add(...materials.map(material => new Mesh(material instanceof MeshBasicMaterial ? plane : box, material)))
  // In front of the camera, on its axis, tiny.
  group.position.set(0, 0, -0.3)
  group.scale.setScalar(0.001)
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    scene.remove(group)
    for (const material of materials) material.dispose()
    texture.dispose()
    box.dispose()
    plane.dispose()
  }
  const draw = () => {
    if (disposed) return
    const autoClear = renderer.autoClear
    const scissorTest = renderer.getScissorTest()
    const scissor = renderer.getScissor(new Vector4())
    try {
      scene.add(group)
      group.updateMatrixWorld(true)
      camera.updateMatrixWorld()
      renderer.autoClear = false
      renderer.setScissorTest(true)
      renderer.setScissor(0, 0, 1, 1)
      renderer.render(scene, camera)
    }
    finally {
      renderer.setScissor(scissor.x, scissor.y, scissor.z, scissor.w)
      renderer.setScissorTest(scissorTest)
      renderer.autoClear = autoClear
      scene.remove(group)
    }
  }
  let ready: Promise<void>
  try {
    ready = renderer.compileAsync(group, camera, scene).then(() => undefined, () => undefined)
  }
  catch {
    ready = Promise.resolve()
  }
  return { ready, draw, dispose }
}
