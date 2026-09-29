<script setup lang="ts">
// The Books on the Shelves. One mesh per Book, all sharing a unit box scaled
// per Placement. Each Book gets its own cover / spine / back materials so the
// real Cover can be applied as soon as it loads; until then it wears the
// deterministic cloth colour from the Layout.
import { BoxGeometry, Color, MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
import type { Material } from 'three'
import type { Book } from '#shared/types/book'
import type { Placement } from '~/utils/bookcase/layout'
import { loadCover } from '~/utils/covers/coverTextures'

const props = defineProps<{ placements: Placement[], books: Book[] }>()

/**
 * The scene lighting is tuned for the dark wood, so full-strength colours read
 * as pastels at the front of the Shelf. Real book cloth and printed covers
 * reflect much less light than their nominal colour suggests.
 */
const CLOTH_ALBEDO = 0.3
const COVER_ALBEDO = 0.55

const geometry = new BoxGeometry(1, 1, 1)
const pages = new MeshStandardMaterial({ color: '#CFC3A8', roughness: 0.92, metalness: 0, envMapIntensity: 0.35 })

interface BookMaterials {
  /** BoxGeometry face order: +x (front cover), -x (back), +y, -y, +z (spine, facing the room), -z (fore-edge). */
  faces: Material[]
  cover: MeshPhysicalMaterial
  back: MeshPhysicalMaterial
  spine: MeshPhysicalMaterial
}

const materialsByBook = new Map<string, BookMaterials>()

function cloth(color: string): MeshPhysicalMaterial {
  // Mostly matte with a faint varnish, dark in the environment reflection.
  const material = new MeshPhysicalMaterial({
    roughness: 0.72,
    metalness: 0,
    clearcoat: 0.12,
    clearcoatRoughness: 0.6,
    envMapIntensity: 0.35,
  })
  setCloth(material, color)
  return material
}

function setCloth(material: MeshPhysicalMaterial, color: string) {
  material.color.set(color).multiplyScalar(CLOTH_ALBEDO)
}

function materialsFor(placement: Placement): Material[] {
  let entry = materialsByBook.get(placement.bookId)
  if (!entry) {
    const cover = cloth(placement.color)
    const back = cloth(placement.color)
    const spine = cloth(placement.color)
    entry = { cover, back, spine, faces: [cover, back, pages, pages, spine, pages] }
    materialsByBook.set(placement.bookId, entry)
  }
  return entry.faces
}

const booksById = computed(() => new Map(props.books.map(book => [book.id, book])))

/** Puts the real Cover on a Book once it has loaded. */
async function applyCover(bookId: string) {
  const book = booksById.value.get(bookId)
  if (!book) return
  const loaded = await loadCover(book)
  const entry = materialsByBook.get(bookId)
  if (!loaded || !entry) return

  entry.cover.map = loaded.texture
  entry.cover.color = new Color(1, 1, 1).multiplyScalar(COVER_ALBEDO)
  // Printed covers are smoother and glossier than cloth.
  entry.cover.roughness = 0.5
  entry.cover.clearcoat = 0.35
  entry.cover.clearcoatRoughness = 0.35
  entry.cover.needsUpdate = true

  setCloth(entry.spine, loaded.color)
  setCloth(entry.back, loaded.color)
}

watch(() => props.placements, (placements) => {
  const current = new Set(placements.map(p => p.bookId))
  for (const [bookId, entry] of materialsByBook) {
    if (current.has(bookId)) continue
    // Textures stay cached in loadCover; only the per-Book materials go.
    entry.cover.dispose()
    entry.back.dispose()
    entry.spine.dispose()
    materialsByBook.delete(bookId)
  }
  for (const placement of placements) {
    if (!materialsByBook.has(placement.bookId)) {
      materialsFor(placement)
      applyCover(placement.bookId)
    }
  }
}, { immediate: true })

onBeforeUnmount(() => {
  geometry.dispose()
  pages.dispose()
  for (const entry of materialsByBook.values()) {
    entry.cover.dispose()
    entry.back.dispose()
    entry.spine.dispose()
  }
  materialsByBook.clear()
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
      :material="materialsFor(placement)"
      :position="[placement.x, placement.y, placement.z]"
      :rotation="[0, placement.yaw, 0]"
      :scale="[placement.thickness, placement.height, placement.depth]"
      cast-shadow
      receive-shadow
    />
  </TresGroup>
</template>
