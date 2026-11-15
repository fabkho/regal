// The scene's light POSITIONS (dev only, ?light=): the same rig from four
// places, so the owner can pick the resting-angle glare away by looking.
// 'today' is the shipped rig, imported from the scene constants (and the
// Stack's hardcoded values, cited below) so it cannot drift; the variants
// move POSITIONS only — colour, intensity, exposure and environment are
// shared by construction (see bookcaseRig/stackRig). Production always uses
// 'today' (composables/useSceneLight.ts). Pure, so it is unit-testable.
import {
  AMBIENT_LIGHT,
  BOUNCE_LIGHT,
  FILL_LIGHT,
  KEY_LIGHT,
} from '../bookcase/scene'

/** The switch in the dev drawer (components/dev/Choices.vue) and the ?light= URL parameter. */
export type SceneLight = 'today' | 'high' | 'side' | 'back'

/** A directional light: what it is never changes, only where it sits. */
export interface PlacedLight {
  color: string
  intensity: number
  position: [number, number, number]
}

export interface LightRig {
  key: PlacedLight
  fill: { color: string, groundColor: string, intensity: number }
  bounce: PlacedLight
  ambient: { color: string, intensity: number }
}

export interface SceneLightSpec {
  /** One line for the dev drawer. */
  label: string
  /** What the owner will see differently at the default resting angle. */
  hint: string
  bookcase: LightRig
  stack: LightRig
}

const TODAY_RIG: LightRig = {
  key: { color: KEY_LIGHT.color, intensity: KEY_LIGHT.intensity, position: [...KEY_LIGHT.position] },
  fill: { color: FILL_LIGHT.color, groundColor: FILL_LIGHT.groundColor, intensity: FILL_LIGHT.intensity },
  bounce: { color: BOUNCE_LIGHT.color, intensity: BOUNCE_LIGHT.intensity, position: [...BOUNCE_LIGHT.position] },
  ambient: { color: AMBIENT_LIGHT.color, intensity: AMBIENT_LIGHT.intensity },
}

/**
 * The Stack's own rig (components/stack/Scene.vue, hardcoded there): same warm
 * family, tuned to the pile. Key [-1.1, 1.4, 1.6] at 2.2, fill 0.9, bounce
 * [1.4, 0.3, 1.8] at 0.6, ambient 0.35.
 */
const TODAY_STACK: LightRig = {
  key: { color: '#FFE0B2', intensity: 2.2, position: [-1.1, 1.4, 1.6] },
  fill: { color: '#FBEFDC', groundColor: '#9A7550', intensity: 0.9 },
  bounce: { color: '#FFD9AE', intensity: 0.6, position: [1.4, 0.3, 1.8] },
  ambient: { color: '#FFE9CE', intensity: 0.35 },
}

/** A variant of the Bookcase rig: today's light, new places. */
function bookcaseRig(key: [number, number, number], bounce: [number, number, number]): LightRig {
  return {
    key: { ...TODAY_RIG.key, position: key },
    fill: { ...TODAY_RIG.fill },
    bounce: { ...TODAY_RIG.bounce, position: bounce },
    ambient: { ...TODAY_RIG.ambient },
  }
}

/** A variant of the Stack rig: today's light, new places. */
function stackRig(key: [number, number, number], bounce: [number, number, number]): LightRig {
  return {
    key: { ...TODAY_STACK.key, position: key },
    fill: { ...TODAY_STACK.fill },
    bounce: { ...TODAY_STACK.bounce, position: bounce },
    ambient: { ...TODAY_STACK.ambient },
  }
}

export const SCENE_LIGHTS: Readonly<Record<SceneLight, SceneLightSpec>> = Object.freeze({
  today: {
    label: 'Today (the shipped light)',
    hint: 'The current rig, unchanged: the baseline to judge the positions against.',
    bookcase: TODAY_RIG,
    stack: TODAY_STACK,
  },
  high: {
    label: 'High — key and bounce raised forward',
    hint: 'Both frontal lights come steeper from above, so their reflections dive to the floor instead of back at you. The covers keep their diffuse light.',
    bookcase: bookcaseRig([-1.4, 7, 4.8], [2.2, 3.4, 5.2]),
    stack: stackRig([-0.8, 2.6, 2.6], [1.2, 1.6, 2.4]),
  },
  side: {
    label: 'Side — key further left, bounce further right',
    hint: 'Both frontal lights rake across the covers instead of hitting them head-on, so the sheen should break up. The furniture gets more modeling.',
    bookcase: bookcaseRig([-4.4, 3.8, 3], [4.2, 1.6, 4.4]),
    stack: stackRig([-2.4, 1, 1.7], [2.4, 0.5, 1.9]),
  },
  back: {
    label: 'Back — key from behind and above',
    hint: 'The covers get fill and bounce only; the key rims the furniture and drops its shadow forward. The moodier pile, no key glare at all.',
    bookcase: bookcaseRig([-0.6, 5.4, -2.4], [...TODAY_RIG.bounce.position]),
    stack: stackRig([0.4, 2.4, -1.8], [...TODAY_STACK.bounce.position]),
  },
})

export const SCENE_LIGHT_PARAM = 'light'

export const DEFAULT_SCENE_LIGHT: SceneLight = 'today'

/** A ?light= value, or the default when it names no variant (anything unlisted keeps today). */
export function parseSceneLight(value: unknown): SceneLight {
  return value === 'high' || value === 'side' || value === 'back' ? value : DEFAULT_SCENE_LIGHT
}

/** The variant a route query asks for (dev server: useSceneLight; production: always today). */
export function sceneLightTuning(query: Readonly<Record<string, unknown>>): SceneLight {
  return parseSceneLight(query[SCENE_LIGHT_PARAM])
}
