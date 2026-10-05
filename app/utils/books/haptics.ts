// Haptics: one short pulse when a Book is taken out (or another swapped in),
// a shorter one when it is put back (the Put back button, Escape, the sheet
// swiped shut). Nothing while scrolling, nothing per Book passing the focus
// line, nothing during a glide: a pulse per Book flying past would buzz like
// a pager and drain the battery. Only where the Vibration API exists (Android
// Chrome; iOS Safari has none), only during a user gesture (Chrome ignores
// it otherwise anyway), never with reduced motion, and a host page can turn
// it off (runtimeConfig.public.regal.haptics, README). Pure, so it's
// unit-testable; composables/usePickHaptics.ts applies it.

export type PickPulse = 'out' | 'back'

/**
 * Pulse lengths (ms): ticks, not buzzes. Some phone motors round very short
 * pulses up or skip them; the pulse then just isn't felt (no error, nothing
 * else changes). If they are too faint, 15 and 10 are the next step.
 */
export const PULSE_MS: Readonly<Record<PickPulse, number>> = Object.freeze({ out: 12, back: 8 })

/** What the dev-only ?hapticOut= / ?hapticBack= may be set to (ms). */
export const PULSE_LIMITS = [0, 50] as const

/** The pulse a change of the picked Book makes: taking one out (or swapping to another), putting it back. */
export function pickPulse(previous: string | null, next: string | null): PickPulse | null {
  if (next && next !== previous) return 'out'
  if (!next && previous) return 'back'
  return null
}

export interface PulseGate {
  /** The host allows haptics (runtimeConfig.public.regal.haptics). */
  enabled: boolean
  /** navigator.vibrate exists. */
  canVibrate: boolean
  /** prefers-reduced-motion: reduce. */
  reducedMotion: boolean
  /** The page is handling a user gesture right now (navigator.userActivation.isActive). */
  userActive: boolean
}

export function mayPulse(gate: PulseGate): boolean {
  return gate.enabled && gate.canVibrate && !gate.reducedMotion && gate.userActive
}

export interface HapticsTuning {
  /** On or off regardless of the host (?haptics=1|0), or null to follow it. */
  enabled: boolean | null
  durations: Readonly<Record<PickPulse, number>>
}

function duration(value: unknown, fallback: number): number {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? Math.round(Math.min(PULSE_LIMITS[1], Math.max(PULSE_LIMITS[0], parsed))) : fallback
}

/**
 * Haptics tuned from a route query on the dev server, to feel them on a
 * phone without a rebuild: `haptics=1|0` turns them on or off,
 * `hapticOut=` / `hapticBack=` set the pulse lengths (ms, clamped).
 */
export function hapticsTuning(query: Readonly<Record<string, unknown>>): HapticsTuning {
  return {
    enabled: query.haptics === '1' ? true : query.haptics === '0' ? false : null,
    durations: { out: duration(query.hapticOut, PULSE_MS.out), back: duration(query.hapticBack, PULSE_MS.back) },
  }
}
