// Render quality per device. Measured on the Stack at a phone viewport
// (412×915 @2.625, real GPU, timer queries): the key light's VSM shadow, a
// 2048² map blurred twice with 16 taps every frame, is ~85 % of the GPU time
// of a frame; the scene itself at the capped pixel ratio of 2 is the rest.
// Phones and tablets get a 1024² map with the same softness (the radius is in
// map texels, so it halves), render only frames in which something changed,
// and step their pixel ratio down when frames run long. Desktops keep what
// was approved.
// Pure, so it's unit-testable; components/stage/Frames.vue and the scenes apply it.

export type QualityTier = 'desktop' | 'mobile'

export interface RenderQuality {
  tier: QualityTier
  /** Pixel ratio the canvas starts at (clamped to the device's own). */
  maxDpr: number
  /** Lowest pixel ratio a struggling device steps down to. */
  minDpr: number
  /** Shadow map size relative to the desktop's (the scenes ask for 2048²). */
  shadowScale: number
  /** Render only frames in which something changed (components/stage/Frames.vue). */
  onDemand: boolean
}

export const DESKTOP_QUALITY: Readonly<RenderQuality> = Object.freeze({
  tier: 'desktop',
  maxDpr: 2,
  minDpr: 2,
  shadowScale: 1,
  onDemand: false,
})

export const MOBILE_QUALITY: Readonly<RenderQuality> = Object.freeze({
  tier: 'mobile',
  maxDpr: 2,
  minDpr: 1.5,
  shadowScale: 0.5,
  onDemand: true,
})

export interface DeviceHints {
  /** The primary pointer is coarse (a finger): `(pointer: coarse)`. */
  coarsePointer: boolean
  /** ?quality=mobile|desktop, to try either tier anywhere. */
  override?: string | null
}

/** The quality for a device: touch-first devices are the mobile tier. */
export function renderQuality(device: DeviceHints): Readonly<RenderQuality> {
  if (device.override === 'mobile') return MOBILE_QUALITY
  if (device.override === 'desktop') return DESKTOP_QUALITY
  return device.coarsePointer ? MOBILE_QUALITY : DESKTOP_QUALITY
}

/**
 * A light's shadow at this quality: the map scaled, and the blur radius (in
 * map texels) scaled with it so the shadow stays as soft.
 */
export function shadowFor(quality: Pick<RenderQuality, 'shadowScale'>, mapSize: number, radius: number): { mapSize: number, radius: number } {
  return { mapSize: Math.round(mapSize * quality.shadowScale), radius: radius * quality.shadowScale }
}

// --- Pixel ratio steps ---------------------------------------------------------

/** Steps (in pixel ratio) a struggling device goes down by. */
export const DPR_STEP = 0.25
/** A frame slower than this (ms) counts as long: below ~45 fps. */
export const LONG_FRAME_MS = 22
/** Consecutive rendered frames judged together. */
export const FRAME_WINDOW = 45
/** Frames further apart than this (ms) weren't rendered one after another (idle, hidden tab). */
export const FRAME_GAP_MS = 100

export interface FramePacing {
  /** Intervals (ms) of the frames in the current window. */
  intervals: number[]
}

export function createPacing(): FramePacing {
  return { intervals: [] }
}

/**
 * Feeds the interval (ms) between two rendered frames; returns the pixel ratio
 * to use. A full window whose median frame is long steps `dpr` down by
 * DPR_STEP (not below `min`) and starts a new window, so each step is judged
 * on its own; a gap (nothing rendered for a while) starts a new window too.
 * Never steps back up: a device that struggled once would just struggle again.
 */
export function paceFrame(pacing: FramePacing, interval: number, dpr: number, min: number): number {
  if (interval > FRAME_GAP_MS || interval <= 0) {
    pacing.intervals.length = 0
    return dpr
  }
  pacing.intervals.push(interval)
  if (pacing.intervals.length < FRAME_WINDOW) return dpr
  const sorted = [...pacing.intervals].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]!
  pacing.intervals.length = 0
  if (median <= LONG_FRAME_MS || dpr <= min) return dpr
  return Math.max(min, Math.round((dpr - DPR_STEP) * 100) / 100)
}
