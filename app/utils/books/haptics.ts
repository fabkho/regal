// Haptics: a soft double pulse when a Book is taken out (or another swapped
// in), one short pulse when it is put back (the Put back button, Escape, the
// sheet swiped shut), and a tiny tick each time a new Book reaches the focus line
// while a finger scrolls the pile or its flick glides on, like the detents of
// a dial. The ticks are rate-limited (TICK_GAP_MS), so a fast flick ticks
// sparsely instead of buzzing. Only where the Vibration API exists (Android
// Chrome; iOS Safari has none), only with the user's gesture (Chrome ignores
// it otherwise anyway), never with reduced motion, and a host page can turn
// it off (runtimeConfig.public.regal.haptics, README). Pure, so it's
// unit-testable; composables/useBookHaptics.ts applies it.

export type Pulse = 'out' | 'back' | 'tick'

/**
 * The pulses, as navigator.vibrate patterns (ms: vibrate, pause, vibrate…).
 * The web can't set how strong a vibration is, only how long, so the
 * difference is in length and rhythm. A scroll tick is the shortest pulse a
 * motor still makes: on the owner's Pixel 8 Pro 5 and 8 ms already felt
 * heavy while scrolling. Taking a Book out is an event: a soft "da-dum", two
 * pulses, the second firmer. Putting it back is one short pulse. Some phone
 * motors skip pulses this short; then the tick just isn't felt (no error,
 * nothing else changes); 4 ms is the next step up for it.
 */
export const PULSES: Readonly<Record<Pulse, readonly number[]>> = Object.freeze({
  out: Object.freeze([10, 45, 18]),
  back: Object.freeze([8]),
  tick: Object.freeze([2]),
})

/** Scroll ticks come at most this often (ms): about 16 a second, sparse on a fast flick. */
export const TICK_GAP_MS = 60

/** What each step of a dev-only ?hapticOut= / ?hapticBack= / ?hapticTick= pattern may be (ms), and how many steps. */
export const PULSE_LIMITS = [0, 100] as const
export const PATTERN_STEPS = 5

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
  patterns: Readonly<Record<Pulse, readonly number[]>>
}

/** A pattern from `10,45,18` (ms, rounded and clamped, at most PATTERN_STEPS); anything else keeps `fallback`. */
function pattern(value: unknown, fallback: readonly number[]): readonly number[] {
  if (typeof value !== 'string' || value.trim() === '') return fallback
  const steps = value.split(',').map(step => (step.trim() === '' ? Number.NaN : Number(step)))
  if (steps.length > PATTERN_STEPS || !steps.every(Number.isFinite)) return fallback
  return steps.map(step => Math.round(Math.min(PULSE_LIMITS[1], Math.max(PULSE_LIMITS[0], step))))
}

/** A pattern that vibrates at all (its vibrating steps are the even ones): `0` turns a pulse off. */
export function vibrates(steps: readonly number[]): boolean {
  return steps.some((step, index) => index % 2 === 0 && step > 0)
}

/**
 * Haptics tuned from a route query on the dev server, to feel them on a
 * phone without a rebuild: `haptics=1|0` turns them on or off,
 * `hapticOut=` / `hapticBack=` / `hapticTick=` set the pulses as patterns
 * (ms, `10,45,18`: vibrate, pause, vibrate; clamped; `0` turns one off).
 */
export function hapticsTuning(query: Readonly<Record<string, unknown>>): HapticsTuning {
  return {
    enabled: query.haptics === '1' ? true : query.haptics === '0' ? false : null,
    patterns: {
      out: pattern(query.hapticOut, PULSES.out),
      back: pattern(query.hapticBack, PULSES.back),
      tick: pattern(query.hapticTick, PULSES.tick),
    },
  }
}

// --- Dev choices (components/dev/Choices.vue) --------------------------------------

export interface PulseChoice {
  label: string
  steps: readonly number[]
}

/** The pulses to compare on a phone in the dev choices drawer; each kind includes its PULSES default. */
export const PULSE_CHOICES: Readonly<Record<Pulse, readonly PulseChoice[]>> = Object.freeze({
  tick: [
    { label: 'off', steps: [0] },
    { label: '1 ms', steps: [1] },
    { label: '2 ms', steps: [2] },
    { label: '3 ms', steps: [3] },
    { label: '4 ms', steps: [4] },
  ],
  out: [
    { label: 'single 12', steps: [12] },
    { label: 'gentle 8·40·14', steps: [8, 40, 14] },
    { label: 'da-dum 10·45·18', steps: [10, 45, 18] },
    { label: 'firm 12·40·24', steps: [12, 40, 24] },
  ],
  back: [
    { label: 'off', steps: [0] },
    { label: '5 ms', steps: [5] },
    { label: '6 ms', steps: [6] },
    { label: '8 ms', steps: [8] },
    { label: '10 ms', steps: [10] },
  ],
})

/** A pattern as its URL parameter (`10,45,18`). */
export function patternParam(steps: readonly number[]): string {
  return steps.join(',')
}

/** What a scroll tick is like, to feel it once: a few in a row, as a scroll at TICK_GAP_MS makes them. */
export function tickRun(steps: readonly number[], count = 6): number[] {
  const tick = steps[0] ?? 0
  const run: number[] = []
  for (let index = 0; index < count; index++) {
    if (index > 0) run.push(Math.max(0, TICK_GAP_MS + 10 - tick))
    run.push(tick)
  }
  return run
}
