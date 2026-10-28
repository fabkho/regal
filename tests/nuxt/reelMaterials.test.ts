// The reel's first-frame preparation (utils/reel/materials.ts): the warm-up
// hands the very materials the Books wear to the renderer's `compileAsync`
// (so the programs match), draws each once, and `gpuIdle` waits for the GPU
// without blocking, whatever the context can do.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PerspectiveCamera, Scene } from 'three'
import type { Mesh, MeshPhysicalMaterial, MeshStandardMaterial, WebGLRenderer } from 'three'
import { clothMaterial, gpuIdle, pageEdgeMaterial, printedMaterial, shadowMaterial, warmReelMaterials, faceTexture } from '#layers/regal/app/utils/reel/materials'

function fakeGl(statuses: boolean[]) {
  const SIGNALED = 0x9119
  let polls = 0
  return {
    SYNC_GPU_COMMANDS_COMPLETE: 1, SYNC_STATUS: 2, SIGNALED, UNSIGNALED: 0x9118,
    fenceSync: vi.fn(() => ({})),
    flush: vi.fn(),
    isContextLost: () => false,
    getSyncParameter: vi.fn(() => (statuses[Math.min(polls++, statuses.length - 1)] ? SIGNALED : 0x9118)),
    deleteSync: vi.fn(),
  }
}
const rendererOf = (gl: unknown) => ({ getContext: () => gl }) as unknown as WebGLRenderer

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('gpuIdle', () => {
  it('waits for the fence, polling between frames, then frees it', async () => {
    const gl = fakeGl([false, false, true])
    let done = false
    void gpuIdle(rendererOf(gl)).then(() => (done = true))
    expect(gl.fenceSync).toHaveBeenCalledTimes(1)
    expect(gl.flush).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(8)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(16)
    expect(done).toBe(true)
    expect(gl.deleteSync).toHaveBeenCalledTimes(1)
  })

  it('gives up after its patience', async () => {
    const gl = fakeGl([false])
    let done = false
    void gpuIdle(rendererOf(gl), 100).then(() => (done = true))
    await vi.advanceTimersByTimeAsync(60)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(80)
    expect(done).toBe(true)
  })

  it('resolves at once without WebGL 2 fences', async () => {
    let done = false
    void gpuIdle(rendererOf({ flush: vi.fn() })).then(() => (done = true))
    await vi.advanceTimersByTimeAsync(0)
    expect(done).toBe(true)
  })
})

describe('warmReelMaterials', () => {
  function fakeRenderer() {
    const calls: { group: { children: Mesh[] }, camera: unknown, target: unknown }[] = []
    const renders: Mesh[][] = []
    const renderer = {
      autoClear: true,
      getScissorTest: () => false,
      setScissorTest: vi.fn(),
      setScissor: vi.fn(),
      compileAsync: vi.fn((group: { children: Mesh[] }, camera: unknown, target: unknown) => {
        calls.push({ group, camera, target })
        return Promise.resolve(group)
      }),
      render: vi.fn((scene: Scene) => {
        renders.push(scene.children.flatMap(child => child.children as Mesh[]))
      }),
    }
    return { renderer: renderer as unknown as WebGLRenderer, calls, renders, spy: renderer }
  }

  it('compiles the materials the Books wear, against the scene\'s lights, and draws each once', async () => {
    const { renderer, calls, renders } = fakeRenderer()
    const scene = new Scene()
    const camera = new PerspectiveCamera()
    const warmup = warmReelMaterials(renderer, scene, camera)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.camera).toBe(camera)
    expect(calls[0]!.target).toBe(scene)
    const materials = calls[0]!.group.children.map(mesh => mesh.material as MeshPhysicalMaterial | MeshStandardMaterial)
    // The same factories as Books.vue: cloth (no map), a printed face, a page edge (map + bump), the floor shadow.
    expect(materials.map(material => material.type)).toEqual(['MeshPhysicalMaterial', 'MeshPhysicalMaterial', 'MeshStandardMaterial', 'MeshBasicMaterial'])
    const texture = faceTexture(document.createElement('canvas'))
    const alike = [clothMaterial('#123456'), printedMaterial(texture), pageEdgeMaterial(texture), shadowMaterial(null)]
    for (const [index, material] of materials.entries()) {
      const twin = alike[index]! as typeof material
      expect(!!material.map).toBe(!!(twin as { map: unknown }).map || index === 3)
      expect(material.transparent).toBe(twin.transparent)
      expect(material.side).toBe(twin.side)
    }
    await warmup.ready
    warmup.draw()
    // The group is in the scene only while it is drawn, a pixel big.
    expect(renders).toHaveLength(1)
    expect(renders[0]).toHaveLength(4)
    expect(scene.children).toHaveLength(0)
    warmup.dispose()
    warmup.draw()
    expect(renders).toHaveLength(1)
  })

  it('never rejects: a renderer that cannot compile ahead resolves', async () => {
    const { renderer, spy } = fakeRenderer()
    spy.compileAsync.mockImplementation(() => Promise.reject(new Error('lost')))
    await expect(warmReelMaterials(renderer, new Scene(), new PerspectiveCamera()).ready).resolves.toBeUndefined()
    spy.compileAsync.mockImplementation(() => {
      throw new Error('nope')
    })
    await expect(warmReelMaterials(renderer, new Scene(), new PerspectiveCamera()).ready).resolves.toBeUndefined()
  })
})
