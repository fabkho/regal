<script setup lang="ts">
// The Books of RegalBooksDeal: one Mesh each on a shared unit box scaled to the
// Book's size (the Stack's materials and face order: front, back, head, tail,
// Spine, fore-edge). `prepare()` loads and draws everything and builds the
// meshes; `apply()` then only moves them (transform, opacity, visibility).
// Nothing is allocated or uploaded per frame.
import { BoxGeometry, Mesh } from 'three'
import type { Group, Material } from 'three'
import { prepareDealAssets } from '#layers/regal/app/utils/deal/assets'
import type { DealAssets } from '#layers/regal/app/utils/deal/assets'
import type { DealBook } from '#layers/regal/app/utils/deal/book'
import type { DealPose } from '#layers/regal/app/utils/deal/tracks'
import type { DealDims, DealVariantName } from '#layers/regal/app/utils/deal/types'

const props = defineProps<{
  books: DealBook[]
  dims: DealDims[]
  variant: DealVariantName
  winner: number
}>()

const group = shallowRef<Group | null>(null)
const geometry = new BoxGeometry(1, 1, 1)
const meshes: Mesh[] = []
const materials: Material[][] = []
const opacity: number[] = []
let assets: DealAssets | null = null
let gone = false

/** Loads the covers (within the deadline), draws the rest, builds the meshes. Every texture comes back to upload. */
async function prepare(): Promise<DealAssets | null> {
  const made = await prepareDealAssets(props.books, props.dims, { variant: props.variant, winner: props.winner })
  if (gone || !group.value) {
    made.dispose()
    return null
  }
  assets = made
  made.books.forEach((faces, index) => {
    const mesh = new Mesh(geometry, faces.materials)
    mesh.name = `deal:${props.books[index]!.id}`
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.matrixAutoUpdate = true
    group.value!.add(mesh)
    meshes.push(mesh)
    materials.push(faces.materials)
    opacity.push(1)
  })
  return made
}

/** Puts Book `index` where `pose` says. */
function apply(index: number, pose: DealPose) {
  const mesh = meshes[index]
  if (!mesh) return
  const dims = props.dims[index]!
  const visible = pose.opacity > 0.004
  mesh.visible = visible
  if (!visible) return
  // A fading Book's shadow goes first (a shadow map has no opacity).
  mesh.castShadow = pose.opacity > 0.5
  mesh.position.set(pose.position[0], pose.position[1], pose.position[2])
  mesh.quaternion.set(pose.quaternion[0], pose.quaternion[1], pose.quaternion[2], pose.quaternion[3])
  mesh.scale.set(dims.thickness * pose.thickness * pose.scale, dims.height * pose.scale, dims.depth * pose.scale)
  if (Math.abs(opacity[index]! - pose.opacity) > 1e-4) {
    opacity[index] = pose.opacity
    for (const material of materials[index]!) material.opacity = pose.opacity
  }
}

/** Every mesh shows (what compiling the materials needs). */
function showAll() {
  for (const mesh of meshes) mesh.visible = true
}

onBeforeUnmount(() => {
  gone = true
  for (const mesh of meshes) mesh.removeFromParent()
  meshes.length = 0
  geometry.dispose()
  assets?.dispose()
  assets = null
})

defineExpose({ prepare, apply, showAll })
</script>

<template>
  <TresGroup
    ref="group"
    name="deal-books"
  />
</template>
