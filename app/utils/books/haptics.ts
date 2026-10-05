// Haptics: one short pulse when a Book is taken out (or another swapped in),
// a shorter one when it is put back (the Put back button, Escape, the sheet
// swiped shut), and a tiny tick each time a new Book reaches the focus line
// while a finger scrolls the pile or its flick glides on, like the detents of
// a dial. The ticks are rate-limited (TICK_GAP_MS), so a fast flick ticks
// sparsely instead of buzzing. Only where the Vibration API exists (Android
// Chrome; iOS Safari has none), only with the user's gesture (Chrome ignores
// it otherwise anyway), never with reduced motion, and a host page can turn
// it off (runtimeConfig.public.regal.haptics, README). Pure, so it's
// unit-testable; composables/useBookHaptics.ts applies it.

export type Pulse = 'out' | 'back' | 'tick'

/**
 * Pulse lengths (ms): ticks, not buzzes, the scroll tick the faintest. Some
 * phone motors round very short pulses up or skip them; the pulse then just
 * isn't felt (no error, nothing else changes). If they are too faint, 15, 10
 * and 8 are the next step.
 */
export const PULSE_MS: Readonly<Record<Pulse, number>> = Object.freeze({ out: 12, back: 8, tick: 5 })

/** Scroll ticks come at most this often (ms): about 16 a second, sparse on a fast flick. */
export const TICK_GAP_MS = 60

/** What the dev-only ?hapticOut= / ?hapticBack= / ?hapticTick= may be set to (ms). */
export const PULSE_LIMITS = [0, 50] as const

/** The pulse a change of the picked Book makes: taking one out (or swapping to another), putting it back. */
export function pickPulse(previous: string | null, next: string | null): 'out' | 'back' | null {
  if (next && next !== previous) return 'out'
  if (!next && previous) return 'back'
  return null
}

export interface TickState {
  /** The Book on the focus line when last seen. */
  focusId: string | null
  /** When the last tick went (ms, performance.now()). */
  lastAt: number
}

export function createTickState(): TickState {
  return { focusId: null, lastAt: Number.NEGATIVE_INFINITY }
}

/**
 * Whether the focus line reaching `focusId` ticks now (`now` in ms): a new
 * Book, while a finger scrolls the pile or its flick glides on
 * (`touchScrolling`), no sooner than TICK_GAP_MS after the last tick. A Book
 * skipped for the gap is not ticked later. Updates `state` in place.
 */
export function scrollTick(state: TickState, focusId: string | null, touchScrolling: boolean, now: number): boolean {
  const changed = focusId !== state.focusId
  state.focusId = focusId
  if (!changed || !focusId || !touchScrolling || now - state.lastAt < TICK_GAP_MS) return false
  state.lastAt = now
  return true
}

export interface PulseGate {
  /** The host allows haptics (runtimeConfig.public.regal.haptics). */
  enabled: boolean
  /** navigator.vibrate exists. */
  canVibrate: boolean
  /** prefers-reduced-motion: reduce. */
  reducedMotion: boolean
  /**
   * The user's gesture allows it: for a pick, one is being handled right now
   * (navigator.userActivation.isActive); for a scroll tick, the finger on the
   * screen is the gesture, and Chrome wants the page to have been touched
   * (hasBeenActive; a moving finger alone doesn't count until it lifts once).
   */
  userActive: boolean
}

export function mayPulse(gate: PulseGate): boolean {
  return gate.enabled && gate.canVibrate && !gate.reducedMotion && gate.userActive
}

export interface HapticsTuning {
  /** On or off regardless of the host (?haptics=1|0), or null to follow it. */
  enabled: boolean | null
  durations: Readonly<Record<Pulse, number>>
}

function duration(value: unknown, fallback: number): number {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? Math.round(Math.min(PULSE_LIMITS[1], Math.max(PULSE_LIMITS[0], parsed))) : fallback
}

/**
 * Haptics tuned from a route query on the dev server, to feel them on a
 * phone without a rebuild: `haptics=1|0` turns them on or off,
 * `hapticOut=` / `hapticBack=` / `hapticTick=` set the pulse lengths (ms,
 * clamped; 0 turns that one off).
 */
export function hapticsTuning(query: Readonly<Record<string, unknown>>): HapticsTuning {
  return {
    enabled: query.haptics === '1' ? true : query.haptics === '0' ? false : null,
    durations: {
      out: duration(query.hapticOut, PULSE_MS.out),
      back: duration(query.hapticBack, PULSE_MS.back),
      tick: duration(query.hapticTick, PULSE_MS.tick),
    },
  }
}
