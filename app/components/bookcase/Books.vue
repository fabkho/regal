<script setup lang="ts">
// The Books on the Shelves. One mesh per Book, all sharing a unit box that is
// scaled per Placement, and a small set of shared materials (one per cloth
// colour + one for the page block).
import { BoxGeometry, MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
import type { Material } from 'three'
import type { Placement } from '~/utils/bookcase/layout'

const props = defineProps<{ placements: Placement[] }>()

/** Brightness multiplier on cloth colours, see cloth(). */
const CLOTH_ALBEDO = 0.3

const geometry = new BoxGeometry(1, 1, 1)
const pages = new MeshStandardMaterial({ color: '#CFC3A8', roughness: 0.92, metalness: 0, envMapIntensity: 0.35 })
const clothByColor = new Map<string, MeshPhysicalMaterial>()

function cloth(color: string): MeshPhysicalMaterial {
  let material = clothByColor.get(color)
  if (!material) {
    // Book cloth: mostly matte with a faint varnish. Kept dark in the
    // environment reflection; a white sheen or strong env light washes the
    // deep cloth colours out to pastels.
    material = new MeshPhysicalMaterial({
      color,
      roughness: 0.72,
      metalness: 0,
      clearcoat: 0.12,
      clearcoatRoughness: 0.6,
      envMapIntensity: 0.35,
    })
    // The scene lighting is tuned for the dark wood, so full-strength cloth
    // colours read as pastels at the front of the Shelf. Real book cloth
    // reflects much less light than its nominal colour suggests.
    material.color.multiplyScalar(CLOTH_ALBEDO)
    clothByColor.set(color, material)
  }
  return material
}

// BoxGeometry face order: +x, -x, +y (top), -y (bottom), +z (spine, facing the
// room), -z (fore-edge, against the back of the Shelf).
const materialsByColor = new Map<string, Material[]>()
function materialsFor(color: string): Material[] {
  let materials = materialsByColor.get(color)
  if (!materials) {
    const cover = cloth(color)
    materials = [cover, cover, pages, pages, cover, pages]
    materialsByColor.set(color, materials)
  }
  return materials
}

onBeforeUnmount(() => {
  geometry.dispose()
  pages.dispose()
  for (const material of clothByColor.values()) material.dispose()
  clothByColor.clear()
  materialsByColor.clear()
})
</script>

<template>
  <TresGroup name="books">
    <TresMesh
      v-for="placement in props.placements"
      :key="placement.bookId"
      :name="`book:${placement.bookId}`"
      :user-data="{ bookId: placement.bookId }"
      :geometry="geometry"
      :material="materialsFor(placement.color)"
      :position="[placement.x, placement.y, placement.z]"
      :rotation="[0, placement.yaw, 0]"
      :scale="[placement.thickness, placement.height, placement.depth]"
      cast-shadow
      receive-shadow
    />
  </TresGroup>
</template>
