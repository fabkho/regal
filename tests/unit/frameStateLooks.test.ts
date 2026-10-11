import { BoxGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { looksKey } from '../../app/utils/stage/frameState'

// looksKey with a camera reads only the meshes in its view: a look that changes off screen draws nothing.
function setup() {
  const scene = new Scene()
  const camera = new PerspectiveCamera(40, 1, 0.1, 100)
  camera.position.set(0, 0, 5)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const near = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: '#336699' }))
  const far = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: '#336699' }))
  far.position.set(0, 40, 0)
  scene.add(near, far)
  scene.updateMatrixWorld()
  return { scene, camera, near, far }
}

describe('looksKey with a camera', () => {
  it('changes when a mesh in view changes its look', () => {
    const { scene, camera, near } = setup()
    const before = looksKey(scene, camera)
    ;(near.material as MeshStandardMaterial).color.set('#ff0000')
    expect(looksKey(scene, camera)).not.toBe(before)
  })

  it('does not read a mesh out of view', () => {
    const { scene, camera, far } = setup()
    const before = looksKey(scene, camera)
    ;(far.material as MeshStandardMaterial).color.set('#ff0000')
    expect(looksKey(scene, camera)).toBe(before)
    // Without a camera, as before: every mesh.
    const whole = looksKey(scene)
    ;(far.material as MeshStandardMaterial).color.set('#00ff00')
    expect(looksKey(scene)).not.toBe(whole)
  })
})
