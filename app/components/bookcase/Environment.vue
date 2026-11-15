<script setup lang="ts">
// Image-based lighting from three's RoomEnvironment, prefiltered with PMREM.
// It ships with three, so the scene needs no HDRI download and works offline.
// Its strength is dev-only (utils/stage/lighting.ts: ?env=): the environment
// is what a Book's clearcoat reflects, so it has to be judged together with
// ?gloss=. Production always reads the shipped strength (ENVIRONMENT_LEVELS
// .today is ENVIRONMENT_INTENSITY, bookcase/scene.ts), and the watch below
// then never fires.
import { PMREMGenerator, type Scene, type Texture, type WebGLRenderer } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { isWebGLRenderer, useTresContext } from '@tresjs/core'
import { ENVIRONMENT_LEVELS } from '#layers/regal/app/utils/stage/lighting'

const { scene, renderer } = useTresContext()
const grid = useLightingGrid()
const strength = computed(() => ENVIRONMENT_LEVELS[grid.value.env].intensity)

let generated: Texture | null = null

function applyEnvironment() {
  const target = scene.value as Scene | undefined
  const gl = renderer.instance
  // PMREMGenerator needs a WebGL renderer; skip on WebGPU rather than throw.
  if (!target || !gl || !isWebGLRenderer(gl) || generated) return

  const pmrem = new PMREMGenerator(gl as WebGLRenderer)
  generated = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()

  target.environment = generated
  target.environmentIntensity = strength.value
}

onMounted(applyEnvironment)
renderer.onReady(applyEnvironment)

/** A new ?env= reaches the scene as it sits, without regenerating the PMREM. */
watch(strength, (value) => {
  const target = scene.value as Scene | undefined
  if (target?.environment === generated && generated) target.environmentIntensity = value
})

onBeforeUnmount(() => {
  const target = scene.value as Scene | undefined
  if (target && target.environment === generated) target.environment = null
  generated?.dispose()
  generated = null
})
</script>

<template>
  <slot />
</template>
