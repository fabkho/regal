// The scene's lighting variants (dev only, ?light=): three genuinely different
// treatments of the same rig so the owner can pick one by looking. 'today' is
// the shipped rig, imported from the scene constants so it cannot drift; the
// others are full explicit rigs per view, not deltas. Production always uses
// 'today' (composables/useSceneLight.ts). Pure, so it is unit-testable.
import {
  AMBIENT_LIGHT,
  BOUNCE_LIGHT,
  ENVIRONMENT_INTENSITY,
  FILL_LIGHT,
  KEY_LIGHT,
  TONE_MAPPING_EXPOSURE,
} from '../bookcase/scene'

/** The switch in the dev drawer (components/dev/Choices.vue) and the ?light= URL parameter. */
export type SceneLight = 'today' | 'brighter' | 'cleaner' | 'contrast'

export interface LightRig {
  key: { color: string, intensity: number }
  fill: { color: string, groundColor: string, intensity: number }
  bounce: { color: string, intensity: number }
  ambient: { color: string, intensity: number }
}

/** How much of its nominal colour a Book material reflects (Meshes.vue multiplies these in). */
export interface BookAlbedo {
  cloth: number
  cover: number
  face: number
}

/** A light that follows the picked Book while it is out (option C only). */
export interface PickLight {
  color: string
  intensity: number
  distance: number
}

export interface SceneLightSpec {
  /** One line for the dev drawer. */
  label: string
  /** What the owner will see differently, and what it costs. */
  hint: string
  bookcase: LightRig
  stack: LightRig
  environment: number
  exposure: number
  albedo: BookAlbedo
  pick: PickLight | null
}

const TODAY_RIG: LightRig = {
  key: { color: KEY_LIGHT.color, intensity: KEY_LIGHT.intensity },
  fill: { color: FILL_LIGHT.color, groundColor: FILL_LIGHT.groundColor, intensity: FILL_LIGHT.intensity },
  bounce: { color: BOUNCE_LIGHT.color, intensity: BOUNCE_LIGHT.intensity },
  ambient: { color: AMBIENT_LIGHT.color, intensity: AMBIENT_LIGHT.intensity },
}

/** The Stack's own rig (components/stack/Scene.vue, hardcoded there): same warm family, tuned to the pile. */
const TODAY_STACK: LightRig = {
  key: { color: '#FFE0B2', intensity: 2.2 },
  fill: { color: '#FBEFDC', groundColor: '#9A7550', intensity: 0.9 },
  bounce: { color: '#FFD9AE', intensity: 0.6 },
  ambient: { color: '#FFE9CE', intensity: 0.35 },
}

const TODAY_ALBEDO: BookAlbedo = { cloth: 0.3, cover: 0.55, face: 0.42 }

export const SCENE_LIGHTS: Readonly<Record<SceneLight, SceneLightSpec>> = Object.freeze({
  today: {
    label: 'Today (the shipped light)',
    hint: 'The baseline: warm, moody, covers at 30–55% of their colour.',
    bookcase: TODAY_RIG,
    stack: TODAY_STACK,
    environment: ENVIRONMENT_INTENSITY,
    exposure: TONE_MAPPING_EXPOSURE,
    albedo: TODAY_ALBEDO,
    pick: null,
  },
  brighter: {
    label: 'Brighter rig — more light everywhere',
    hint: 'Lifts exposure and every light; covers read brighter but the wood goes flatter and the back-panel ghosts may show.',
    bookcase: {
      key: { color: '#FFE0B2', intensity: 3 },
      fill: { color: '#FBEFDC', groundColor: '#9A7550', intensity: 0.95 },
      bounce: { color: '#FFD9AE', intensity: 1.05 },
      ambient: { color: '#FFE9CE', intensity: 0.5 },
    },
    stack: {
      key: { color: '#FFE0B2', intensity: 2.9 },
      fill: { color: '#FBEFDC', groundColor: '#9A7550', intensity: 1.15 },
      bounce: { color: '#FFD9AE', intensity: 0.9 },
      ambient: { color: '#FFE9CE', intensity: 0.55 },
    },
    environment: 0.95,
    exposure: 1.3,
    albedo: TODAY_ALBEDO,
    pick: null,
  },
  cleaner: {
    label: 'Cleaner colour — neutral light, livelier materials',
    hint: 'Same intensities, whiter light and higher albedo; covers read true instead of amber, with barely more ghost risk.',
    bookcase: {
      key: { color: '#FFF4E4', intensity: 2.3 },
      fill: { color: '#FFFFFF', groundColor: '#8A7A66', intensity: 0.7 },
      bounce: { color: '#FFF0DD', intensity: 0.7 },
      ambient: { color: '#FFF6EA', intensity: 0.3 },
    },
    stack: {
      key: { color: '#FFF4E4', intensity: 2.2 },
      fill: { color: '#FFFFFF', groundColor: '#8A7A66', intensity: 0.9 },
      bounce: { color: '#FFF0DD', intensity: 0.6 },
      ambient: { color: '#FFF6EA', intensity: 0.35 },
    },
    environment: 0.6,
    exposure: 1.15,
    albedo: { cloth: 0.55, cover: 0.85, face: 0.7 },
    pick: null,
  },
  contrast: {
    label: 'More contrast — moody stack, lit pick',
    hint: 'The pile stays as today (a touch darker); a soft light follows the Book you take out, so it pops against the stack.',
    bookcase: {
      key: { color: '#FFE0B2', intensity: 2.1 },
      fill: { color: '#FBEFDC', groundColor: '#9A7550', intensity: 0.6 },
      bounce: { color: '#FFD9AE', intensity: 0.6 },
      ambient: { color: '#FFE9CE', intensity: 0.22 },
    },
    stack: {
      key: { color: '#FFE0B2', intensity: 2 },
      fill: { color: '#FBEFDC', groundColor: '#9A7550', intensity: 0.8 },
      bounce: { color: '#FFD9AE', intensity: 0.5 },
      ambient: { color: '#FFE9CE', intensity: 0.28 },
    },
    environment: 0.5,
    exposure: 1.1,
    albedo: TODAY_ALBEDO,
    pick: { color: '#FFF6E8', intensity: 1.1, distance: 1.4 },
  },
})

export const SCENE_LIGHT_PARAM = 'light'

export const DEFAULT_SCENE_LIGHT: SceneLight = 'today'

/** A ?light= value, or the default when it names no variant (anything unlisted keeps today). */
export function parseSceneLight(value: unknown): SceneLight {
  return value === 'brighter' || value === 'cleaner' || value === 'contrast' ? value : DEFAULT_SCENE_LIGHT
}

/** The variant a route query asks for (dev server: useSceneLight; production: always today). */
export function sceneLightTuning(query: Readonly<Record<string, unknown>>): SceneLight {
  return parseSceneLight(query[SCENE_LIGHT_PARAM])
}
