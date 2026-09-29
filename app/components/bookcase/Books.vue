<script setup lang="ts">
// The Books on the Shelves. One mesh per Book, all sharing a unit box scaled
// per Placement. Each Book gets its own cover / spine / back materials so the
// real Cover can be applied as soon as it loads; until then it wears the
// deterministic cloth colour from the Layout.
import { BoxGeometry, CanvasTexture, Color, MeshPhysicalMaterial, MeshStandardMaterial, SRGBColorSpace } from 'three'
import type { Material } from 'three'
import type { Book } from '#shared/types/book'
import { hashString } from '~/utils/bookcase/layout'
import type { Placement } from '~/utils/bookcase/layout'
import { drawBack, drawSpine, spineFontsReady } from '~/utils/covers/bookFaces'
import type { FaceInput } from '~/utils/covers/bookFaces'
import { loadCover } from '~/utils/covers/coverTextures'
import type { LoadedCover } from '~/utils/covers/coverTextures'
import { fromHex, readableOn } from '~/utils/covers/palette'

const props = defineProps<{ placements: Placement[], books: Book[] }>()

/**
 * The scene lighting is tuned for the dark wood, so full-strength colours read
 * as pastels at the front of the Shelf. Real book cloth and printed covers
 * reflect much less light than their nominal colour suggests.
 */
const CLOTH_ALBEDO = 0.3
const COVER_ALBEDO = 0.55
/** Generated Spine/back textures carry their colour in the texture. */
const FACE_ALBEDO = 0.42

const geometry = new BoxGeometry(1, 1, 1)
const pages = new MeshStandardMaterial({ color: '#CFC3A8', roughness: 0.92, metalness: 0, envMapIntensity: 0.35 })

interface BookMaterials {
  /** BoxGeometry face order: +x (front cover), -x (back), +y, -y, +z (spine, facing the room), -z (fore-edge). */
  faces: Material[]
  cover: MeshPhysicalMaterial
  back: MeshPhysicalMaterial
  spine: MeshPhysicalMaterial
  spineTexture: CanvasTexture
  backTexture: CanvasTexture
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

const booksById = computed(() => new Map(props.books.map(book => [book.id, book])))

function faceInput(placement: Placement, loaded: LoadedCover | null): FaceInput | null {
  const book = booksById.value.get(placement.bookId)
  if (!book) return null
  const background = fromHex(placement.color)
  const text = readableOn(background)
  return {
    book,
    thickness: placement.thickness,
    height: placement.height,
    depth: placement.depth,
    palette: loaded?.palette ?? { background, text, accent: text },
    cover: loaded?.image,
    seed: hashString(book.id),
  }
}

function faceTexture(canvas: HTMLCanvasElement) {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function printed(texture: CanvasTexture): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    map: texture,
    color: new Color(1, 1, 1).multiplyScalar(FACE_ALBEDO),
    roughness: 0.68,
    metalness: 0,
    clearcoat: 0.15,
    clearcoatRoughness: 0.55,
    envMapIntensity: 0.35,
  })
}

function materialsFor(placement: Placement): Material[] {
  let entry = materialsByBook.get(placement.bookId)
  if (!entry) {
    const input = faceInput(placement, null)
    const cover = cloth(placement.color)
    const spineTexture = faceTexture(input ? drawSpine(input) : document.createElement('canvas'))
    const backTexture = faceTexture(input ? drawBack(input) : document.createElement('canvas'))
    const spine = printed(spineTexture)
    const back = printed(backTexture)
    entry = { cover, back, spine, spineTexture, backTexture, faces: [cover, back, pages, pages, spine, pages] }
    materialsByBook.set(placement.bookId, entry)
  }
  return entry.faces
}

/**
 * Puts the real Cover on a Book once it has loaded, and redraws Spine and back
 * (from the Cover when there is one) once the Spine fonts are available.
 */
async function applyCover(placement: Placement) {
  const book = booksById.value.get(placement.bookId)
  if (!book) return
  const [loaded] = await Promise.all([loadCover(book), spineFontsReady()])
  const entry = materialsByBook.get(placement.bookId)
  if (!entry) return

  if (loaded) {
    entry.cover.map = loaded.texture
    entry.cover.color = new Color(1, 1, 1).multiplyScalar(COVER_ALBEDO)
    // Printed covers are smoother and glossier than cloth.
    entry.cover.roughness = 0.5
    entry.cover.clearcoat = 0.35
    entry.cover.clearcoatRoughness = 0.35
    entry.cover.needsUpdate = true
  }

  const input = faceInput(placement, loaded)
  if (!input) return
  entry.spineTexture.image = drawSpine(input)
  entry.spineTexture.needsUpdate = true
  entry.backTexture.image = drawBack(input)
  entry.backTexture.needsUpdate = true
}

function disposeEntry(entry: BookMaterials) {
  // Cover textures stay cached in loadCover; everything per-Book goes.
  entry.cover.dispose()
  entry.back.dispose()
  entry.spine.dispose()
  entry.spineTexture.dispose()
  entry.backTexture.dispose()
}

watch(() => props.placements, (placements) => {
  const current = new Set(placements.map(p => p.bookId))
  for (const [bookId, entry] of materialsByBook) {
    if (current.has(bookId)) continue
    disposeEntry(entry)
    materialsByBook.delete(bookId)
  }
  for (const placement of placements) {
    if (!materialsByBook.has(placement.bookId)) {
      materialsFor(placement)
      applyCover(placement)
    }
  }
}, { immediate: true })

onBeforeUnmount(() => {
  geometry.dispose()
  pages.dispose()
  for (const entry of materialsByBook.values()) disposeEntry(entry)
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
