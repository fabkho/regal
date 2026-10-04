import { describe, expect, it } from 'vitest'
import { BoxGeometry, CanvasTexture, DirectionalLight, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Texture } from 'three'
import {
  createPacing,
  DESKTOP_QUALITY,
  DPR_STEP,
  FRAME_WINDOW,
  LONG_FRAME_MS,
  MOBILE_QUALITY,
  paceFrame,
  renderQuality,
  shadowFor,
} from '../../app/utils/stage/quality'
import { looksKey, motionKey } from '../../app/utils/stage/frameState'

describe('renderQuality', () => {
  it('gives touch-first devices the mobile tier, others the desktop one', () => {
    expect(renderQuality({ coarsePointer: true })).toBe(MOBILE_QUALITY)
    expect(renderQuality({ coarsePointer: false })).toBe(DESKTOP_QUALITY)
  })

  it('lets ?quality= pick either tier', () => {
    expect(renderQuality({ coarsePointer: false, override: 'mobile' })).toBe(MOBILE_QUALITY)
    expect(renderQuality({ coarsePointer: true, override: 'desktop' })).toBe(DESKTOP_QUALITY)
    expect(renderQuality({ coarsePointer: true, override: 'nonsense' })).toBe(MOBILE_QUALITY)
  })

  it('keeps the desktop as approved: 2048² shadows, pixel ratio up to 2, every frame drawn', () => {
    expect(shadowFor(DESKTOP_QUALITY, 2048, 6)).toEqual({ mapSize: 2048, radius: 6 })
    expect(DESKTOP_QUALITY.maxDpr).toBe(2)
    expect(DESKTOP_QUALITY.onDemand).toBe(false)
  })

  it('halves the mobile shadow map and its blur radius in texels, so it stays as soft', () => {
    const { mapSize, radius } = shadowFor(MOBILE_QUALITY, 2048, 6)
    expect(mapSize).toBe(1024)
    expect(radius / mapSize).toBeCloseTo(6 / 2048)
  })
})

describe('paceFrame', () => {
  const feed = (interval: number, frames: number, dpr: number, min = 1.5) => {
    const pacing = createPacing()
    let value = dpr
    for (let index = 0; index < frames; index++) value = paceFrame(pacing, interval, value, min)
    return value
  }

  it('keeps the ratio while frames are on time', () => {
    expect(feed(16.7, FRAME_WINDOW * 3, 2)).toBe(2)
  })

  it('steps down once per full window of long frames, never below the floor', () => {
    expect(feed(LONG_FRAME_MS + 10, FRAME_WINDOW - 1, 2)).toBe(2)
    expect(feed(LONG_FRAME_MS + 10, FRAME_WINDOW, 2)).toBe(2 - DPR_STEP)
    expect(feed(LONG_FRAME_MS + 10, FRAME_WINDOW * 2, 2)).toBe(2 - 2 * DPR_STEP)
    expect(feed(LONG_FRAME_MS + 10, FRAME_WINDOW * 10, 2)).toBe(1.5)
  })

  it('judges by the median: a few hitches (a texture upload) do not count', () => {
    const pacing = createPacing()
    let value = 2
    for (let index = 0; index < FRAME_WINDOW; index++) value = paceFrame(pacing, index % 5 === 0 ? 60 : 16.7, value, 1.5)
    expect(value).toBe(2)
  })

  it('starts over after a pause: idle gaps are not slow frames', () => {
    const pacing = createPacing()
    let value = 2
    for (let index = 0; index < FRAME_WINDOW * 2; index++) {
      value = paceFrame(pacing, index % 20 === 19 ? 500 : 30, value, 1.5)
    }
    expect(value).toBe(2)
  })
})

describe('motionKey / looksKey', () => {
  function world() {
    const scene = new Scene()
    const material = new MeshStandardMaterial({ color: 0x888888 })
    const book = new Mesh(new BoxGeometry(1, 1, 1), material)
    const group = new Group()
    group.add(book)
    scene.add(group, new DirectionalLight(0xFFFFFF, 2))
    const camera = new PerspectiveCamera(34, 0.6, 0.05, 30)
    return { scene, camera, book, material, group, light: scene.children[1] as DirectionalLight }
  }
  const read = (w: ReturnType<typeof world>) => `${motionKey(w.scene, w.camera)}:${looksKey(w.scene)}`
  const frameChanged = (before: string, after: string) => before !== after

  it('sees nothing new in a scene nobody touched', () => {
    const w = world()
    expect(frameChanged(read(w), read(w))).toBe(false)
  })

  it('counts the canvas size too', () => {
    const w = world()
    expect(motionKey(w.scene, w.camera, 760, 1281)).not.toBe(motionKey(w.scene, w.camera, 570, 960))
  })

  it('sees an object move, turn or change size, past the tolerance only', () => {
    const w = world()
    const before = read(w)
    w.book.position.y += 1e-6
    expect(frameChanged(before, read(w))).toBe(false)
    w.book.position.y += 1e-3
    expect(frameChanged(before, read(w))).toBe(true)
    const still = read(w)
    w.book.rotation.y = 0.01
    expect(frameChanged(still, read(w))).toBe(true)
  })

  it('sees the camera move and its projection change', () => {
    const w = world()
    const before = read(w)
    w.camera.position.z = 2
    expect(frameChanged(before, read(w))).toBe(true)
    const next = read(w)
    w.camera.aspect = 1
    w.camera.updateProjectionMatrix()
    expect(frameChanged(next, read(w))).toBe(true)
  })

  it('keeps motion and looks apart: a material change leaves the motion alone', () => {
    const w = world()
    const motion = motionKey(w.scene, w.camera)
    const looks = looksKey(w.scene)
    w.material.opacity = 0.5
    expect(motionKey(w.scene, w.camera)).toBe(motion)
    expect(looksKey(w.scene)).not.toBe(looks)
  })

  it('sees material looks change: shine, opacity, colour, a texture arriving or redrawn', () => {
    const w = world()
    let before = read(w)
    w.material.opacity = 0.5
    expect(frameChanged(before, read(w))).toBe(true)
    before = read(w)
    w.material.color.setRGB(1, 0, 0)
    expect(frameChanged(before, read(w))).toBe(true)
    before = read(w)
    const texture = new CanvasTexture({ width: 4, height: 4 } as unknown as HTMLCanvasElement)
    w.material.map = texture
    expect(frameChanged(before, read(w))).toBe(true)
    before = read(w)
    texture.needsUpdate = true
    expect(frameChanged(before, read(w))).toBe(true)
    before = read(w)
    w.material.map = new Texture()
    expect(frameChanged(before, read(w))).toBe(true)
  })

  it('ignores three bumping a material version on its own (two-pass transparent materials)', () => {
    const w = world()
    const before = read(w)
    w.material.needsUpdate = true
    expect(frameChanged(before, read(w))).toBe(false)
  })

  it('sees objects appear, hide and lights change', () => {
    const w = world()
    let before = read(w)
    w.group.visible = false
    expect(frameChanged(before, read(w))).toBe(true)
    before = read(w)
    w.book.position.x = 3
    expect(frameChanged(before, read(w))).toBe(false)
    w.group.visible = true
    before = read(w)
    w.scene.add(new Mesh(new BoxGeometry(), w.material))
    expect(frameChanged(before, read(w))).toBe(true)
    before = read(w)
    w.light.intensity = 1
    expect(frameChanged(before, read(w))).toBe(true)
  })
})
