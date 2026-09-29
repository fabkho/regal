<script setup lang="ts">
// The Bookcase furniture: the stripped antique bookcase GLB, scaled so one
// world unit is one metre.
import type { Mesh, MeshStandardMaterial, Object3D } from 'three'
import { useGLTF } from '@tresjs/cientos'
import { BOOKCASE_SCALE } from '~/utils/bookcase/shelves'
import { WOOD_MATERIAL } from '~/utils/bookcase/scene'

const props = withDefaults(defineProps<{ x?: number }>(), { x: 0 })
const emit = defineEmits<{ loaded: [] }>()

const { state: gltf } = useGLTF('/models/bookcase.glb')

const isMesh = (object: Object3D): object is Mesh => (object as Mesh).isMesh === true

watch(gltf, (loaded) => {
  if (!loaded) return
  loaded.scene.traverse((object) => {
    if (!isMesh(object)) return
    object.castShadow = true
    object.receiveShadow = true
    const material = object.material as MeshStandardMaterial
    if (!material) return
    // These are multipliers on the ORM texture the GLB ships with.
    material.roughness = WOOD_MATERIAL.roughness
    material.metalness = WOOD_MATERIAL.metalness
    material.envMapIntensity = WOOD_MATERIAL.envMapIntensity
    material.aoMapIntensity = WOOD_MATERIAL.aoMapIntensity
    material.needsUpdate = true
  })
  emit('loaded')
}, { immediate: true })

// The first Bookcase uses the loaded scene; extra ones share its geometry and
// materials through a clone.
const object = computed(() => {
  if (!gltf.value) return null
  return props.x === 0 ? gltf.value.scene : gltf.value.scene.clone(true)
})
</script>

<template>
  <TresGroup
    :position="[props.x, 0, 0]"
    :scale="BOOKCASE_SCALE"
  >
    <primitive
      v-if="object"
      :object="object"
    />
  </TresGroup>
</template>
