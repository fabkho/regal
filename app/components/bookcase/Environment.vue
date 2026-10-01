<script setup lang="ts">
// Image-based lighting from three's RoomEnvironment, prefiltered with PMREM.
// It ships with three, so the scene needs no HDRI download and works offline.
import { PMREMGenerator, type Scene, type Texture, type WebGLRenderer } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { isWebGLRenderer, useTresContext } from '@tresjs/core'
import { ENVIRONMENT_INTENSITY } from '#layers/regal/app/utils/bookcase/scene'

const { scene, renderer } = useTresContext()

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
  target.environmentIntensity = ENVIRONMENT_INTENSITY
}

onMounted(applyEnvironment)
renderer.onReady(applyEnvironment)

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
