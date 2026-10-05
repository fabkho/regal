// Did anything on screen change since the last rendered frame? On phones the
// canvas renders on demand (utils/stage/quality.ts); rather than every
// animation (scroll, riffle, Pick, re-sort, label fades, textures arriving)
// having to ask for a frame, each frame reads what the renderer would draw:
// every visible object's transform, its materials' looks and textures, the
// lights and the camera, folded into one number. Values are rounded to
// FRAME_QUANTUM first, so easing that has settled below it reads the same
// and the canvas goes quiet; a slow creep still shows once it crosses a step.
import type { Camera, Light, Material, Mesh, MeshPhysicalMaterial, Object3D, Texture } from 'three'

/** Changes below this don't show (0.01 mm, 1e-5 rad, colour channels). */
export const FRAME_QUANTUM = 1e-5

let hash = 0

/** Folds one value, rounded to the quantum, into the hash (murmur3's mixing). */
function mix(value: number) {
  let k = Math.round(value / FRAME_QUANTUM) | 0
  k = Math.imul(k, 0xCC9E2D51)
  k = (k << 15) | (k >>> 17)
  hash ^= Math.imul(k, 0x1B873593)
  hash = (hash << 13) | (hash >>> 19)
  hash = (Math.imul(hash, 5) + 0xE6546B64) | 0
}

/** Ids and versions count as whole numbers, not quanta. */
function mixWhole(value: number) {
  mix(value * FRAME_QUANTUM)
}

function mixTexture(texture: Texture | null | undefined) {
  if (!texture) return mixWhole(-1)
  mixWhole(texture.id)
  mixWhole(texture.version)
}

/**
 * What the scenes change on a material: opacity, gloss, colour, textures
 * (arriving, redrawn) and blending. Plain property reads; a keyed walk over
 * every field cost more than the render it saved.
 */
function mixMaterial(material: Material) {
  const look = material as MeshPhysicalMaterial
  // Not material.version: three bumps it on every render of a transparent
  // double-sided material (two passes); what a recompile changes is read here.
  // Every material has an id at runtime; @types/three leaves it out.
  mixWhole((material as Material & { id: number }).id)
  mixWhole((material.visible ? 1 : 0) + (material.transparent ? 2 : 0) + material.side * 4)
  mix(material.opacity)
  if (look.color) {
    mix(look.color.r)
    mix(look.color.g)
    mix(look.color.b)
  }
  if (look.roughness !== undefined) mix(look.roughness)
  if (look.clearcoat !== undefined) {
    mix(look.clearcoat)
    mix(look.clearcoatRoughness)
  }
  if (look.envMapIntensity !== undefined) mix(look.envMapIntensity)
  if (look.map !== undefined) mixTexture(look.map)
  if (look.bumpMap !== undefined) mixTexture(look.bumpMap)
}

function mixObject(object: Object3D) {
  mixWhole(object.id)
  const { position, quaternion, scale } = object
  mix(position.x)
  mix(position.y)
  mix(position.z)
  mix(quaternion.x)
  mix(quaternion.y)
  mix(quaternion.z)
  mix(quaternion.w)
  mix(scale.x)
  mix(scale.y)
  mix(scale.z)
  mixWhole(object.castShadow ? 1 : 0)
  const light = object as Light
  if (light.isLight) {
    mix(light.intensity)
    mix(light.color.r)
    mix(light.color.g)
    mix(light.color.b)
  }
}

function mixLooks(object: Object3D) {
  const material = (object as Mesh).material
  if (!material) return
  if (Array.isArray(material)) for (const entry of material) mixMaterial(entry)
  else mixMaterial(material)
}

function visit(object: Object3D, read: (object: Object3D) => void) {
  if (!object.visible) {
    // A hidden subtree counts once, as hidden.
    mixWhole(object.id)
    mixWhole(-2)
    return
  }
  read(object)
  for (const child of object.children) visit(child, read)
}

/**
 * One number for where everything in `scene` is and what `camera` sees:
 * equal for two frames in which nothing moved, different (but for a 2⁻³²
 * chance) once anything moved, turned, scaled, showed, hid or a light
 * changed by more than the quantum. `extra`: more values that matter (the
 * canvas size).
 */
export function motionKey(scene: Object3D, camera: Camera, ...extra: number[]): number {
  hash = 0x2C2C2A
  visit(scene, mixObject)
  mixObject(camera)
  const projection = (camera as Camera & { projectionMatrix?: { elements: ArrayLike<number> } }).projectionMatrix
  if (projection) for (let index = 0; index < 16; index++) mix(projection.elements[index]!)
  for (const value of extra) mixWhole(value)
  return hash
}

/**
 * One number for how everything visible in `scene` looks: its materials'
 * opacity, gloss, colours, textures and blending. Read apart from the motion
 * (several times the work): while things move a frame is drawn anyway.
 */
export function looksKey(scene: Object3D): number {
  hash = 0xF5F2EB
  visit(scene, mixLooks)
  return hash
}
