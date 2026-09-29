// Scene constants for the Bookcase stage. Everything is in world metres and
// derived from the measured Shelf data, so re-measuring the model moves the
// camera with it. Books (#4) can rely on the same numbers.
import { BOOKCASE_SIZE, SHELF_SLOTS } from './shelves'

/** Middle of the Bookcase front, roughly where the eye lands. */
export const BOOKCASE_FOCUS = {
  x: 0,
  y: BOOKCASE_SIZE.height * 0.48,
  z: BOOKCASE_SIZE.depth * 0.5,
} as const

/**
 * Front-on starting view. The distance frames the full height with a margin at
 * a 38° vertical field of view: (height / 2 + margin) / tan(fov / 2).
 */
export const CAMERA = {
  fov: 38,
  near: 0.1,
  far: 50,
  position: [0, BOOKCASE_SIZE.height * 0.52, 4.05] as [number, number, number],
  target: [BOOKCASE_FOCUS.x, BOOKCASE_FOCUS.y, BOOKCASE_FOCUS.z] as [number, number, number],
}

const DEG = Math.PI / 180

/**
 * Orbit limits. The Bookcase has no back panel behind the bays and the model is
 * only detailed from the front, so the camera stays in a front-facing cone,
 * never below the horizon and never close enough to clip into the furniture.
 */
export const CONTROLS = {
  /** ±50° around the front — far short of seeing the open back. */
  minAzimuthAngle: -50 * DEG,
  maxAzimuthAngle: 50 * DEG,
  /** 55°: a raised three-quarter look down. 89°: level with the Shelf, never below. */
  minPolarAngle: 55 * DEG,
  maxPolarAngle: 89 * DEG,
  /** Closer than this the near plane cuts into the case front. */
  minDistance: 1.4,
  maxDistance: 6,
  dampingFactor: 0.08,
}

/**
 * Pan limits for the orbit target, so panning can't walk the view off the
 * Bookcase or push the camera through it.
 */
export const TARGET_BOUNDS = {
  x: [-BOOKCASE_SIZE.width * 0.35, BOOKCASE_SIZE.width * 0.35] as [number, number],
  y: [0.25, BOOKCASE_SIZE.height - 0.25] as [number, number],
  z: [0, BOOKCASE_SIZE.depth] as [number, number],
}

/**
 * Warm key light, sun-through-a-window from high on the front left. It sits in
 * front of the Bookcase so its shadow falls away from the camera and grounds
 * the furniture, instead of striping the page through the empty bays.
 */
export const KEY_LIGHT = {
  color: '#FFE0B2',
  intensity: 2.3,
  position: [-1.9, 4.6, 3.4] as [number, number, number],
  /** Orthographic shadow frustum, sized to the Bookcase plus a margin. */
  shadowRadius: Math.max(BOOKCASE_SIZE.width, BOOKCASE_SIZE.height) * 0.75,
}

/** Sky/ground fill: warm paper light above, warm floor bounce below. */
export const FILL_LIGHT = {
  color: '#FBEFDC',
  groundColor: '#9A7550',
  intensity: 0.7,
}

/**
 * Broad frontal fill from the right. The bays are deep and get no light through
 * the open back, so without this the Shelves read as black holes. Directional
 * rather than a point light: a point light this close burns a hot spot into
 * whichever bay it sits in front of.
 */
export const BOUNCE_LIGHT = {
  color: '#FFD9AE',
  intensity: 0.7,
  position: [2.6, 1.4, 5] as [number, number, number],
}

/** Last resort against pitch-black bay interiors, which shadows can't reach. */
export const AMBIENT_LIGHT = {
  color: '#FFE9CE',
  intensity: 0.3,
}

/**
 * Environment (image-based) lighting strength on the wood. Kept moderate: the
 * base colour texture has the removed books' shading baked into the back
 * panels, and flooding the bays with light makes those ghosts legible.
 */
export const ENVIRONMENT_INTENSITY = 0.6

/** Exposure of the whole scene, on top of ACES tone mapping. */
export const TONE_MAPPING_EXPOSURE = 1.15

/** How dark the Bookcase's shadow prints on the paper floor. */
export const FLOOR_SHADOW = {
  color: '#4A3520',
  opacity: 0.2,
}

/**
 * Wood response. The GLB ships an ORM texture, so `roughness` and `metalness`
 * here are multipliers on it, not absolute values — keep roughness near 1 or
 * the polished wood mirrors the environment and the whole case goes milky.
 */
export const WOOD_MATERIAL = {
  /** 1 = keep the baked roughness (~0.45); lower values turn the case milky. */
  roughness: 1,
  /** The ORM's blue channel is 1 everywhere; the glTF zeroes it and so do we. */
  metalness: 0,
  /** Low: at the baked roughness, a strong env reflection greys out the wood. */
  envMapIntensity: 0.3,
  /** The baked ambient occlusion is strong; ease it off a little. */
  aoMapIntensity: 0.8,
}

/** Debug boxes fill this fraction of a slot's clearance. */
export const DEBUG_SLOT_FILL = 0.94

/** Widest and tallest usable slot, handy for framing and for Layout. */
export const SLOT_EXTENT = {
  maxWidth: Math.max(...SHELF_SLOTS.map(slot => slot.xEnd - slot.xStart)),
  maxClearance: Math.max(...SHELF_SLOTS.map(slot => slot.clearance)),
}
