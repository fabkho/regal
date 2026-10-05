<script setup lang="ts">
// Mobile tier only (utils/stage/quality.ts): the canvas draws a frame only
// when something on screen changed (utils/stage/frameState.ts), so a resting
// pile costs the phone nothing, and a device whose frames run long steps its
// pixel ratio down. It swaps Tres's render function, which runs once per
// animation frame after every scene's onBeforeRender has moved its objects.
// Renders nothing.
import { useLoop, useTres } from '@tresjs/core'
import { looksKey, motionKey } from '#layers/regal/app/utils/stage/frameState'
import { createPacing, paceFrame } from '#layers/regal/app/utils/stage/quality'

/** The first moments (ms) are busy loading the pile: frame pacing starts after them. */
const PACING_DELAY = 4000

const quality = useRenderQuality()
const dpr = useStageDpr()
const { scene, camera, renderer } = useTres()
const { render } = useLoop()

/**
 * What the last rendered frame showed (utils/stage/frameState.ts): where
 * things were, and how they looked (null: not read since; while things move
 * every frame is drawn, so the looks are only read once they rest).
 */
let drawnMotion: number | null = null
let drawnLooks: number | null = null
const pacing = createPacing()
let lastRender = 0
const startedAt = performance.now()
// The device's own ratio, capped (the canvas clamps to the same).
if (!dpr.value) dpr.value = Math.min(window.devicePixelRatio || 1, quality.value.maxDpr)

render((notify) => {
  const cam = camera.value
  if (!cam) return
  const canvas = renderer.domElement as HTMLCanvasElement
  // A resized drawing buffer is blank: it needs a frame even when nothing moved.
  const motion = motionKey(scene.value, cam, canvas.width, canvas.height)
  const looks = motion === drawnMotion ? looksKey(scene.value) : null
  if (quality.value.onDemand && motion === drawnMotion && looks === drawnLooks) return
  renderer.render(scene.value, cam)
  notify()
  drawnMotion = motion
  drawnLooks = looks

  const now = performance.now()
  const { minDpr } = quality.value
  if (dpr.value > minDpr && now - startedAt > PACING_DELAY) {
    const next = paceFrame(pacing, now - lastRender, dpr.value, minDpr)
    if (next !== dpr.value) dpr.value = next
  }
  lastRender = now
})
</script>

<template>
  <TresGroup name="stage-frames" />
</template>
