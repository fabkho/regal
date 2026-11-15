// The lighting grid (dev only): four independent axes the owner can walk in
// the dev drawer and combine in the URL, so one combination can be chosen as
// the shipped look.
//
//   ?bright=  today | brighter | brighter2   — how much light, on today's rig
//   ?light=   today | high     | side | back — where the key and bounce sit
//   ?gloss=   today | half     | none | soft — the clearcoat a face wears
//   ?env=     today | dim      | dimmer      — the image-based light
//
// Every axis returns the shipped value outside the dev server
// (composables/useSceneLighting.ts), so a shared link never changes a
// visitor's view. 'today' everywhere is the shipped rig, byte for byte: the
// numbers below are the scene constants themselves (bookcase/scene.ts, the
// Stack's inlined rig cited in STACK_SHIPPED_POSITIONS) and every scale is a
// no-op at 1/0, so nothing can drift. Pure, so it is unit-testable.

import {
  BOUNCE_LIGHT,
  ENVIRONMENT_INTENSITY,
  KEY_LIGHT,
  TONE_MAPPING_EXPOSURE,
} from '../bookcase/scene'

// --- Axis 1: brightness ------------------------------------------------------

/** How much light, as a scale on the shipped rig (never a new rig, never a new colour). */
export type Brightness = 'today' | 'brighter' | 'brighter2'

export interface BrightnessStep {
  label: string
  hint: string
  /** Multiplier on the key light's intensity. */
  key: number
  /** Multiplier on the scene's tone mapping exposure. */
  exposure: number
  /** Added to the ambient light's intensity (absolute, not a multiplier). */
  ambient: number
}

export const BRIGHTNESS_STEPS: Readonly<Record<Brightness, BrightnessStep>> = Object.freeze({
  today: {
    label: 'Today',
    hint: 'The shipped rig, unchanged: the baseline every other step is judged against.',
    key: 1,
    exposure: 1,
    ambient: 0,
  },
  brighter: {
    label: 'Brighter',
    hint: 'Key +25 %, exposure +10 %: the whole scene lifts, the highlights a little faster than the shadows.',
    key: 1.25,
    exposure: 1.1,
    ambient: 0,
  },
  brighter2: {
    label: 'Brighter 2',
    hint: 'Key +50 %, exposure +20 %, ambient +0.1: the bays light up as well, so the ghost shading baked into the back panels may start to show.',
    key: 1.5,
    exposure: 1.2,
    ambient: 0.1,
  },
})

/** The key light's intensity for a step: the shipped number, scaled. */
export function keyIntensity(shipped: number, step: BrightnessStep): number {
  return shipped * step.key
}

/** The ambient light's intensity for a step: the shipped number, plus the step's lift. */
export function ambientIntensity(shipped: number, step: BrightnessStep): number {
  return shipped + step.ambient
}

/** The scene's exposure for a step: the shipped number (TONE_MAPPING_EXPOSURE), scaled. */
export function exposureIntensity(shipped: number = TONE_MAPPING_EXPOSURE, step: BrightnessStep = BRIGHTNESS_STEPS.today): number {
  return shipped * step.exposure
}

// --- Axis 2: where the key sits ---------------------------------------------

// The Stack and the Bookcase keep separate rigs: the Bookcase's is in
// bookcase/scene.ts (key [-1.9, 4.6, 3.4] at 2.3, bounce [2.6, 1.4, 5] at 0.7),
// the Stack inlines its own in components/stack/Scene.vue (key
// [-1.1, 1.4, 1.6] at 2.2, bounce [1.4, 0.3, 1.8] at 0.6). They are not the
// same lights at the same scale — the Bookcase is 2.4 m tall and watched from
// 4 m, the pile a few centimetres deep and watched from 1.15 m — so a position
// is given per scene, not scaled by the ratio of the shipped pair: a single
// ratio cannot turn 'back' (which needs a negative z in both scenes) out of
// two different fronts, and raising one rig by a quarter and the other by the
// same amount means nothing in metres. Each row is therefore tuned for the
// scene it is used in, and 'today' is copied from the shipped numbers above.
export type LightPosition = 'today' | 'high' | 'side' | 'back'

export interface LightPlacement {
  key: [number, number, number]
  bounce: [number, number, number]
}

export interface LightPositionSpec {
  label: string
  hint: string
  /** components/bookcase/Scene.vue, metres. */
  bookcase: LightPlacement
  /** components/stack/Scene.vue, metres; the rig group rides the pile as it scrolls. */
  stack: LightPlacement
}

/** The Stack's shipped positions, cited from components/stack/Scene.vue (it inlines them). */
export const STACK_SHIPPED_POSITIONS: LightPlacement = {
  key: [-1.1, 1.4, 1.6],
  bounce: [1.4, 0.3, 1.8],
}

export const LIGHT_POSITIONS: Readonly<Record<LightPosition, LightPositionSpec>> = Object.freeze({
  today: {
    label: 'Today',
    hint: 'The shipped positions, unchanged: warm key high on the front left, broad bounce on the right.',
    bookcase: {
      key: [...KEY_LIGHT.position] as [number, number, number],
      bounce: [...BOUNCE_LIGHT.position] as [number, number, number],
    },
    stack: {
      key: [...STACK_SHIPPED_POSITIONS.key],
      bounce: [...STACK_SHIPPED_POSITIONS.bounce],
    },
  },
  high: {
    label: 'High',
    hint: 'Key raised and pulled forward, so it comes steeper from above and its reflection dives at the floor instead of back at your eye. The bounce comes up with it.',
    bookcase: { key: [-1.4, 7, 4.8], bounce: [2.2, 3.4, 5.2] },
    stack: { key: [-0.8, 2.6, 2.6], bounce: [1.2, 1.6, 2.4] },
  },
  side: {
    label: 'Side',
    hint: 'Key further left and slightly lower, bounce further right: both raking across the covers instead of hitting them head-on, so the sheen should break up.',
    bookcase: { key: [-4.4, 3.8, 3], bounce: [4.2, 1.6, 4.4] },
    stack: { key: [-2.4, 1, 1.7], bounce: [2.4, 0.5, 1.9] },
  },
  back: {
    label: 'Back',
    hint: 'Key behind and above the furniture: the covers get fill and bounce only, the furniture is rimmed and its shadow drops forward. The moodiest option, no key glare on a cover at all.',
    bookcase: { key: [-0.6, 5.4, -2.4], bounce: [...BOUNCE_LIGHT.position] as [number, number, number] },
    stack: { key: [0.4, 2.4, -1.8], bounce: [...STACK_SHIPPED_POSITIONS.bounce] },
  },
})

// --- Axis 3: gloss ----------------------------------------------------------

// The two properties that turn image-based light into a hard patch on a cover:
// clearcoat (a second, mirror-like specular layer) and its roughness. The
// base numbers are the ones components/books/Meshes.vue shipped with; a Book's
// front is COVER while its image is in, cloth until/without one, and its Spine
// and back are printed.
export type GlossSetting = 'today' | 'half' | 'none' | 'soft'

/** A face's clearcoat, from utils/stage/lighting + books/Meshes.vue. */
export type GlossedFace = 'cloth' | 'printed' | 'cover'

export interface MaterialGloss {
  clearcoat: number
  clearcoatRoughness: number
  envMapIntensity: number
}

/** The shipped values (books/Meshes.vue, CLOTH_GLOSS / PRINTED_GLOSS / COVER_GLOSS). */
export const SHIPPED_GLOSS: Readonly<Record<GlossedFace, MaterialGloss>> = Object.freeze({
  cloth: { clearcoat: 0.12, clearcoatRoughness: 0.6, envMapIntensity: 0.35 },
  printed: { clearcoat: 0.15, clearcoatRoughness: 0.55, envMapIntensity: 0.35 },
  cover: { clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 0.35 },
})

export interface GlossStep {
  label: string
  hint: string
  /** Multiplier on envMapIntensity. */
  envMap: number
  /** Multiplier on clearcoat. */
  clearcoat: number
  /** Fixed clearcoatRoughness, or null to keep the face's shipped one. */
  roughness: number | null
}

export const GLOSS_STEPS: Readonly<Record<GlossSetting, GlossStep>> = Object.freeze({
  today: {
    label: 'Today',
    hint: 'The shipped gloss: cloth 0.12 / printed 0.15 / cover 0.35 clearcoat at 0.6 / 0.55 / 0.35 roughness, envMapIntensity 0.35.',
    envMap: 1,
    clearcoat: 1,
    roughness: null,
  },
  half: {
    label: 'Half',
    hint: 'Clearcoat and envMapIntensity halved (cloth 0.06 / printed 0.075 / cover 0.175, env 0.175), roughness as shipped: the varnish thins out.',
    envMap: 0.5,
    clearcoat: 0.5,
    roughness: null,
  },
  none: {
    label: 'None',
    hint: 'No clearcoat and no environment reflection at all, roughness as shipped: only the diffuse light and the lights\' own specular remain, so no image-based patch can form.',
    envMap: 0,
    clearcoat: 0,
    roughness: null,
  },
  soft: {
    label: 'Soft',
    hint: 'Clearcoat and envMapIntensity kept, clearcoatRoughness raised to 0.85 on every face: the highlight spreads out instead of sharpening.',
    envMap: 1,
    clearcoat: 1,
    roughness: 0.85,
  },
})

/** A face's gloss for a setting: the shipped numbers, scaled (today is a no-op at 1). */
export function glossFor(face: GlossedFace, setting: GlossSetting): MaterialGloss {
  const base = SHIPPED_GLOSS[face]
  const step = GLOSS_STEPS[setting]
  return {
    clearcoat: base.clearcoat * step.clearcoat,
    clearcoatRoughness: step.roughness ?? base.clearcoatRoughness,
    envMapIntensity: base.envMapIntensity * step.envMap,
  }
}

// --- Axis 4: the environment -------------------------------------------------

// What the gloss reflects. The Bookcase stage sets three's scene.environment
// from RoomEnvironment (components/bookcase/Environment.vue); the Stack keeps
// none, so this axis and envMapIntensity do nothing on the pile — see the
// component's note.
export type EnvironmentLevel = 'today' | 'dim' | 'dimmer'

export interface EnvironmentSpec {
  label: string
  hint: string
  intensity: number
}

export const ENVIRONMENT_LEVELS: Readonly<Record<EnvironmentLevel, EnvironmentSpec>> = Object.freeze({
  today: {
    label: 'Today',
    hint: `RoomEnvironment at ${ENVIRONMENT_INTENSITY}, the shipped strength.`,
    intensity: ENVIRONMENT_INTENSITY,
  },
  dim: {
    label: 'Dim',
    hint: 'RoomEnvironment at 0.25: less light bouncing in from the room, so the sheen loses most of its source.',
    intensity: 0.25,
  },
  dimmer: {
    label: 'Dimmer',
    hint: 'RoomEnvironment at 0.15: the bays go quieter still. The wood flattens with it, and the ghost shading in the back panels gets easier to see.',
    intensity: 0.15,
  },
})

// --- The grid ---------------------------------------------------------------

export interface LightingGrid {
  bright: Brightness
  light: LightPosition
  gloss: GlossSetting
  env: EnvironmentLevel
}

/** The four URL parameters, in the order the dev drawer lists them. */
export const GRID_PARAMS = Object.freeze({
  bright: 'bright',
  light: 'light',
  gloss: 'gloss',
  env: 'env',
})

/** What a URL without any of the parameters means: the shipped look. */
export const SHIPPED_GRID: LightingGrid = Object.freeze({
  bright: 'today',
  light: 'today',
  gloss: 'today',
  env: 'today',
})

/** One axis: its key, its title for the drawer, and its options in order. */
export interface GridAxis<K extends keyof LightingGrid> {
  axis: K
  param: string
  title: string
  hint: string
  options: { value: LightingGrid[K], label: string, hint: string }[]
}

const values = <T extends string>(record: Readonly<Record<T, { label: string, hint: string }>>) =>
  (Object.keys(record) as T[]).map(value => ({ value, label: record[value].label, hint: record[value].hint }))

/** The grid, ready for the dev drawer: four axes, each with its options. */
export const GRID_AXES: readonly GridAxis<keyof LightingGrid>[] = Object.freeze([
  {
    axis: 'bright',
    param: GRID_PARAMS.bright,
    title: 'Brightness',
    hint: 'Scales on today\'s rig: the key light, the scene exposure, and (last step only) the ambient.',
    options: values(BRIGHTNESS_STEPS),
  } as GridAxis<'bright'>,
  {
    axis: 'light',
    param: GRID_PARAMS.light,
    title: 'Light position',
    hint: 'Where the key and bounce sit, per scene (the Bookcase and the Stack keep different rigs).',
    options: values(LIGHT_POSITIONS),
  } as GridAxis<'light'>,
  {
    axis: 'gloss',
    param: GRID_PARAMS.gloss,
    title: 'Gloss',
    hint: 'The clearcoat and environment reflection on a Book\'s faces: what turns image-based light into a hard patch on a cover.',
    options: values(GLOSS_STEPS),
  } as GridAxis<'gloss'>,
  {
    axis: 'env',
    param: GRID_PARAMS.env,
    title: 'Environment',
    hint: 'The RoomEnvironment strength on the Bookcase stage. The Stack has no environment, so this axis does nothing there.',
    options: values(ENVIRONMENT_LEVELS),
  } as GridAxis<'env'>,
])

/** A ?bright= value; anything unlisted (or absent) keeps today. */
export function parseBrightness(value: unknown): Brightness {
  return value === 'brighter' || value === 'brighter2' ? value : 'today'
}

/** A ?light= value; anything unlisted (or absent) keeps today. */
export function parseLightPosition(value: unknown): LightPosition {
  return value === 'high' || value === 'side' || value === 'back' ? value : 'today'
}

/** A ?gloss= value; anything unlisted (or absent) keeps today. */
export function parseGloss(value: unknown): GlossSetting {
  return value === 'half' || value === 'none' || value === 'soft' ? value : 'today'
}

/** An ?env= value; anything unlisted (or absent) keeps today. */
export function parseEnvironment(value: unknown): EnvironmentLevel {
  return value === 'dim' || value === 'dimmer' ? value : 'today'
}

/** The grid a route query asks for; the four axes combine freely. */
export function lightingGrid(query: Readonly<Record<string, unknown>>): LightingGrid {
  return {
    bright: parseBrightness(query[GRID_PARAMS.bright]),
    light: parseLightPosition(query[GRID_PARAMS.light]),
    gloss: parseGloss(query[GRID_PARAMS.gloss]),
    env: parseEnvironment(query[GRID_PARAMS.env]),
  }
}

/** True when nothing is varied: the shipped look, and a URL with no lighting parameters. */
export function isShippedGrid(grid: LightingGrid): boolean {
  return grid.bright === 'today' && grid.light === 'today' && grid.gloss === 'today' && grid.env === 'today'
}

/** The query a grid writes: 'today' needs no parameter, so the plain URL is the baseline. */
export function gridQuery(grid: LightingGrid): Record<string, string | undefined> {
  return {
    [GRID_PARAMS.bright]: grid.bright === 'today' ? undefined : grid.bright,
    [GRID_PARAMS.light]: grid.light === 'today' ? undefined : grid.light,
    [GRID_PARAMS.gloss]: grid.gloss === 'today' ? undefined : grid.gloss,
    [GRID_PARAMS.env]: grid.env === 'today' ? undefined : grid.env,
  }
}
