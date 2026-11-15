<script setup lang="ts">
// Contents of the Bookcase stage: camera, constrained controls, warm lighting,
// the furniture, a shadow-catching floor and the group Books live in (#4).
import type { DirectionalLight } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { BOOKCASE_SIZE } from '#layers/regal/app/utils/bookcase/shelves'
import { BOOKCASE_SPACING } from '#layers/regal/app/utils/bookcase/layout'
import {
  AMBIENT_LIGHT,
  BOUNCE_LIGHT,
  CAMERA,
  CONTROLS,
  FILL_LIGHT,
  FLOOR_SHADOW,
  KEY_LIGHT,
  TARGET_BOUNDS,
} from '#layers/regal/app/utils/bookcase/scene'
import { ambientIntensity, BRIGHTNESS_STEPS, keyIntensity, LIGHT_POSITIONS } from '#layers/regal/app/utils/stage/lighting'
import { shadowFor } from '#layers/regal/app/utils/stage/quality'

const props = withDefaults(defineProps<{
  debugSlots?: boolean
  bookcaseCount?: number
  /** The floor shadow's strength: 1 Regal's, 0 none (the dark theme; utils/theme/tokens.ts). */
  floorShadow?: number
}>(), {
  debugSlots: false,
  bookcaseCount: 1,
  floorShadow: 1,
})

/** Extra Bookcases stand to the right of the first one. */
const bookcaseOffsets = computed(() =>
  Array.from({ length: Math.max(1, props.bookcaseCount) }, (_, index) => index * BOOKCASE_SPACING),
)

const emit = defineEmits<{ loaded: [] }>()

/**
 * Dev only (utils/stage/lighting.ts): ?light= moves the key and bounce to a
 * tested position, ?bright= scales the key, the exposure and the ambient.
 * Outside the dev server both read 'today', which gives back the numbers
 * imported above unchanged (a scale of 1, an offset of 0, the shipped
 * positions), so a production build draws exactly what it drew before.
 */
const grid = useLightingGrid()
const bright = computed(() => BRIGHTNESS_STEPS[grid.value.bright])
const lightPlace = computed(() => LIGHT_POSITIONS[grid.value.light].bookcase)
const keyStrength = computed(() => keyIntensity(KEY_LIGHT.intensity, bright.value))
const ambientStrength = computed(() => ambientIntensity(AMBIENT_LIGHT.intensity, bright.value))

const reducedMotion = usePreferredReducedMotion()
const damping = computed(() => reducedMotion.value !== 'reduce')

const keyLight = shallowRef<DirectionalLight | null>(null)
const quality = useRenderQuality()

watch(keyLight, (light) => {
  if (!light) return
  const { shadow } = light
  // Phones get a smaller map, as soft (utils/stage/quality.ts).
  const { mapSize, radius } = shadowFor(quality.value, 2048, 7)
  shadow.mapSize.set(mapSize, mapSize)
  shadow.camera.near = 0.5
  shadow.camera.far = 16
  shadow.camera.left = -KEY_LIGHT.shadowRadius
  shadow.camera.right = KEY_LIGHT.shadowRadius
  shadow.camera.top = KEY_LIGHT.shadowRadius * 1.6
  shadow.camera.bottom = -KEY_LIGHT.shadowRadius * 0.4
  // VSM: a wide blur keeps the shadow soft, like light through a window.
  shadow.bias = -0.0005
  shadow.normalBias = 0.02
  shadow.radius = radius
  shadow.blurSamples = 16
  shadow.camera.updateProjectionMatrix()
}, { immediate: true })

const clamp = (value: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, value))

/** Keep panning on the Bookcase: the target may never leave its bounding box. */
function clampTarget(controls: OrbitControlsImpl) {
  const { target } = controls
  const extraWidth = (Math.max(1, props.bookcaseCount) - 1) * BOOKCASE_SPACING
  target.set(
    clamp(target.x, [TARGET_BOUNDS.x[0], TARGET_BOUNDS.x[1] + extraWidth]),
    clamp(target.y, TARGET_BOUNDS.y),
    clamp(target.z, TARGET_BOUNDS.z),
  )
}
</script>

<template>
  <TresPerspectiveCamera
    :position="CAMERA.position"
    :fov="CAMERA.fov"
    :near="CAMERA.near"
    :far="CAMERA.far"
    :look-at="CAMERA.target"
  />
  <OrbitControls
    make-default
    :target="CAMERA.target"
    :enable-damping="damping"
    :damping-factor="CONTROLS.dampingFactor"
    :enable-pan="true"
    :screen-space-panning="true"
    :min-azimuth-angle="CONTROLS.minAzimuthAngle"
    :max-azimuth-angle="CONTROLS.maxAzimuthAngle"
    :min-polar-angle="CONTROLS.minPolarAngle"
    :max-polar-angle="CONTROLS.maxPolarAngle"
    :min-distance="CONTROLS.minDistance"
    :max-distance="CONTROLS.maxDistance"
    @change="clampTarget"
  />

  <BookcaseEnvironment />

  <TresAmbientLight
    :color="AMBIENT_LIGHT.color"
    :intensity="ambientStrength"
  />
  <TresHemisphereLight
    :args="[FILL_LIGHT.color, FILL_LIGHT.groundColor, FILL_LIGHT.intensity]"
  />
  <TresDirectionalLight
    ref="keyLight"
    :color="KEY_LIGHT.color"
    :intensity="keyStrength"
    :position="lightPlace.key"
    cast-shadow
  />
  <TresDirectionalLight
    :color="BOUNCE_LIGHT.color"
    :intensity="BOUNCE_LIGHT.intensity"
    :position="lightPlace.bounce"
  />

  <BookcaseModel
    v-for="(offset, index) in bookcaseOffsets"
    :key="index"
    :x="offset"
    @loaded="index === 0 && emit('loaded')"
  />

  <!-- Books are added here by #4; the stage passes them through as children. -->
  <TresGroup name="books">
    <slot />
  </TresGroup>

  <BookcaseSlotDebug v-if="props.debugSlots" />

  <!-- Invisible floor, visible only through the shadow the Bookcase drops on
       it, so the furniture sits on the paper page instead of floating. -->
  <TresMesh
    name="floor"
    :rotation="[-Math.PI / 2, 0, 0]"
    :position="[0, 0, BOOKCASE_SIZE.depth / 2]"
    receive-shadow
  >
    <TresPlaneGeometry :args="[16, 16]" />
    <TresShadowMaterial
      :color="FLOOR_SHADOW.color"
      :opacity="FLOOR_SHADOW.opacity * props.floorShadow"
      :visible="props.floorShadow > 0"
      :transparent="true"
    />
  </TresMesh>
</template>
