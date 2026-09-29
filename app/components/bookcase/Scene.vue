<script setup lang="ts">
// Contents of the Bookcase stage: camera, constrained controls, warm lighting,
// the furniture, a shadow-catching floor and the group Books live in (#4).
import type { DirectionalLight } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { BOOKCASE_SIZE } from '~/utils/bookcase/shelves'
import {
  AMBIENT_LIGHT,
  BOUNCE_LIGHT,
  CAMERA,
  CONTROLS,
  FILL_LIGHT,
  FLOOR_SHADOW,
  KEY_LIGHT,
  TARGET_BOUNDS,
} from '~/utils/bookcase/scene'

const props = defineProps<{ debugSlots?: boolean }>()

const emit = defineEmits<{ loaded: [] }>()

const reducedMotion = usePreferredReducedMotion()
const damping = computed(() => reducedMotion.value !== 'reduce')

const keyLight = shallowRef<DirectionalLight | null>(null)

watch(keyLight, (light) => {
  if (!light) return
  const { shadow } = light
  shadow.mapSize.set(2048, 2048)
  shadow.camera.near = 0.5
  shadow.camera.far = 16
  shadow.camera.left = -KEY_LIGHT.shadowRadius
  shadow.camera.right = KEY_LIGHT.shadowRadius
  shadow.camera.top = KEY_LIGHT.shadowRadius * 1.6
  shadow.camera.bottom = -KEY_LIGHT.shadowRadius * 0.4
  // VSM: a wide blur keeps the shadow soft, like light through a window.
  shadow.bias = -0.0005
  shadow.normalBias = 0.02
  shadow.radius = 7
  shadow.blurSamples = 16
  shadow.camera.updateProjectionMatrix()
}, { immediate: true })

const clamp = (value: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, value))

/** Keep panning on the Bookcase: the target may never leave its bounding box. */
function clampTarget(controls: OrbitControlsImpl) {
  const { target } = controls
  target.set(
    clamp(target.x, TARGET_BOUNDS.x),
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
    :intensity="AMBIENT_LIGHT.intensity"
  />
  <TresHemisphereLight
    :args="[FILL_LIGHT.color, FILL_LIGHT.groundColor, FILL_LIGHT.intensity]"
  />
  <TresDirectionalLight
    ref="keyLight"
    :color="KEY_LIGHT.color"
    :intensity="KEY_LIGHT.intensity"
    :position="KEY_LIGHT.position"
    cast-shadow
  />
  <TresDirectionalLight
    :color="BOUNCE_LIGHT.color"
    :intensity="BOUNCE_LIGHT.intensity"
    :position="BOUNCE_LIGHT.position"
  />

  <BookcaseModel @loaded="emit('loaded')" />

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
      :opacity="FLOOR_SHADOW.opacity"
      :transparent="true"
    />
  </TresMesh>
</template>
