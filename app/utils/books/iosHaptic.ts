// iOS haptics. iOS Safari has no navigator.vibrate, but since iOS 18 it plays
// a light system haptic when an `<input type="checkbox" switch>` is toggled
// through its <label> by a user gesture. So where the Vibration API is
// missing, a hidden label + switch, kept once in the document, is clicked
// (label.click(), synchronously inside the gesture) for each pulse. The same
// trick works in a home-screen app (same WebKit). It is a side effect of the
// switch control, not an API: Apple may change or remove it, and then the
// taps are simply not felt (nothing throws, nothing else changes).
//
// A tap is one fixed light haptic: no length, no strength, so every pulse is
// one tap and the Pixel patterns (PULSES) only decide whether a pulse is on
// at all. A second tap for the "da-dum" of taking a Book out would have to
// fire after a timeout, outside the gesture, which iOS ignores; it is left out.
//
// Pure apart from the document handed in, so it is unit-testable with a fake
// DOM; composables/useBookHaptics.ts applies it next to navigator.vibrate.

import type { Pulse } from '#layers/regal/app/utils/books/haptics'

/** Scroll ticks come at least this far apart (ms) on iOS, a little sparser than TICK_GAP_MS: one tap per Book would blur. */
export const IOS_TICK_GAP_MS = 80

/** The first iOS with the switch haptic. */
export const IOS_MIN_VERSION = 18

/** What detection reads from the browser. */
export interface SwitchEnv {
  userAgent: string
  platform: string
  maxTouchPoints: number
  /** `'switch' in HTMLInputElement.prototype`: WebKit reflects the attribute (since 17.4, without a haptic). */
  hasSwitch: boolean
}

/** The browser's own values; an unknown environment (server, no DOM) reads as nothing. */
export function readSwitchEnv(): SwitchEnv {
  if (typeof navigator === 'undefined') return { userAgent: '', platform: '', maxTouchPoints: 0, hasSwitch: false }
  return {
    userAgent: navigator.userAgent ?? '',
    platform: navigator.platform ?? '',
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    hasSwitch: typeof HTMLInputElement !== 'undefined' && 'switch' in HTMLInputElement.prototype,
  }
}

/** iPhone and iPad; an iPad in desktop mode calls itself a Mac, but a Mac has no touch screen. */
export function isIos(env: Pick<SwitchEnv, 'userAgent' | 'platform' | 'maxTouchPoints'>): boolean {
  return /\b(iPhone|iPad|iPod)\b/.test(env.userAgent) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1)
}

/**
 * The iOS major version from the user agent (`iPhone OS 18_2`), or null (an
 * iPad in desktop mode hides it; Safari also freezes the number, 18_6 on
 * iOS 26, which still reads as 18 or later).
 */
export function iosVersion(userAgent: string): number | null {
  const match = /\bOS (\d+)[_.]\d+/.exec(userAgent)
  return match ? Number(match[1]) : null
}

/**
 * Whether the switch haptic can work: iOS, the `switch` attribute known to
 * the browser (the feature check), and, where the user agent says so, iOS 18
 * or later. An unknown version doesn't veto: the feature check decides.
 */
export function supportsSwitchHaptic(env: SwitchEnv): boolean {
  if (!env.hasSwitch || !isIos(env)) return false
  const version = iosVersion(env.userAgent)
  return version === null || version >= IOS_MIN_VERSION
}

/** Marks the one hidden label in the document. */
export const HAPTIC_ATTR = 'data-regal-haptic'

/** The label with its switch: out of sight, out of the tab order, out of the accessibility tree, out of the way of the pointer and of the layout. */
export function createSwitchLabel(doc: Document): HTMLLabelElement {
  const label = doc.createElement('label')
  label.setAttribute(HAPTIC_ATTR, '')
  label.setAttribute('aria-hidden', 'true')
  label.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;contain:strict;'
  const input = doc.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  input.tabIndex = -1
  input.setAttribute('aria-hidden', 'true')
  input.setAttribute('autocomplete', 'off')
  label.append(input)
  // The label's click and the one it forwards to the switch stay here: no
  // "click outside" handler of the host hears them.
  label.addEventListener('click', event => event.stopPropagation())
  return label
}

export interface IosHaptic {
  /** The switch haptic can work here (detection). */
  readonly available: boolean
  /**
   * One tap for a pulse; true if it was asked for. Call inside the user's
   * gesture (a click, a pointer or touch handler, and what runs synchronously
   * or in a microtask after it). Ticks are rate-limited (IOS_TICK_GAP_MS since
   * the last tap), taps for a Book out or back never are.
   */
  tap: (kind: Pulse, now: number) => boolean
}

/** The haptic for one document; `env` is the detection input, read once. */
export function createIosHaptic(doc: Document | null, env: SwitchEnv): IosHaptic {
  const available = doc !== null && supportsSwitchHaptic(env)
  let label: HTMLLabelElement | null = null
  let lastAt = Number.NEGATIVE_INFINITY

  function mount(target: Document): HTMLLabelElement {
    // One label per document, also across HMR reloads and a second copy of the layer.
    const existing = target.querySelector<HTMLLabelElement>(`[${HAPTIC_ATTR}]`)
    if (existing) return existing
    const created = createSwitchLabel(target)
    target.body.append(created)
    return created
  }

  return {
    available,
    tap(kind, now) {
      if (!available || !doc) return false
      if (kind === 'tick' && now - lastAt < IOS_TICK_GAP_MS) return false
      if (!label?.isConnected) label = mount(doc)
      lastAt = now
      try {
        label.click()
      }
      catch {
        return false
      }
      return true
    },
  }
}

let shared: IosHaptic | null = null

/** The page's haptic (one hidden switch for all Stacks, Rows and Reels). */
export function getIosHaptic(): IosHaptic {
  shared ??= createIosHaptic(typeof document === 'undefined' ? null : document, readSwitchEnv())
  return shared
}
