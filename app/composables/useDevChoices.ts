// Dev-only: the owner's picks for open design decisions, shown live in the
// app. Saved in localStorage and, through a dev-only API, to
// .data/choices.json so they can be read back outside the browser.
//
// Saved choices of earlier panel versions load too: keys that are no longer
// choices (settled decisions) are ignored.
//
// Decided (no longer choices): Regal is a Nuxt layer for a separate portfolio
// page; ratings show as a hover label (plus the details card); covers default
// to the best automatic image + Gemini back/spine (Batch API), with photos for
// a few special editions; new Books pop in scattered around the pile, and a
// replaced pile (a new year) sweeps out while the new one settles in.

import type { SeparatorStyle } from '#layers/regal/app/utils/stack/separators'
import type { PickOutside } from '#layers/regal/app/utils/books/pick'
import type { ScrollHighlight } from '#layers/regal/app/utils/stack/scrollHighlight'

/** The open decisions plus the tools; settled ones live in DECIDED_LOOK, not here. */
export interface DevChoices {
  /** Date separators in the Stack (open: recommended 'numerals'). */
  separatorStyle: SeparatorStyle
  /** Clicking another Book while one is out: take that one out, or only put the picked one back. */
  pickOutside: PickOutside
  /** What scrolling the Stack highlights, without a cursor (open: recommended 'focus'). */
  scrollHighlight: ScrollHighlight
  /** Optional cover overrides: asset key → chosen cover URL. */
  editionPicks: Record<string, string>
  notes: string
}

/** What the 3D looks like: the decided picks plus the open ones (the dev panel previews those). */
export interface Look {
  separatorStyle: SeparatorStyle
  pickOutside: PickOutside
  scrollHighlight: ScrollHighlight
}

/**
 * Not decided yet, recommended default: the 'focus' line highlight while scrolling.
 * Decided and hard-wired (no longer choices): a click on another Book while
 * one is out swaps them ('swap'), the 'label' date separators, the re-sort animation (utils/stack/moves.ts),
 * new Books popping in scattered around the pile, the swap of a whole pile
 * (utils/stack/shuffle.ts), the classic back cover and the title + stars hover label.
 */
export const DECIDED_LOOK: Readonly<Look> = Object.freeze({
  // Decided (owner, dev panel): the flat label with a leader line beside the pile.
  separatorStyle: 'label',
  // Decided (owner): clicking another Book while one is out swaps them.
  pickOutside: 'swap',
  scrollHighlight: 'focus',
})

export const DEFAULT_CHOICES: DevChoices = {
  ...DECIDED_LOOK,
  editionPicks: {},
  notes: '',
}

// v3: the settled choices (re-sort, back style, hover label, page preview, AI mode) are gone;
// entrance went later (a stored one is ignored like any unknown key).
const STORAGE_KEY = 'regal:dev-choices:v3'
const LEGACY_STORAGE_KEY = 'regal:dev-choices:v2'

export function useDevChoices() {
  const choices = useState<DevChoices>('dev-choices', () => ({ ...DEFAULT_CHOICES }))
  const saved = useState<'idle' | 'saving' | 'saved' | 'error'>('dev-choices:saved', () => 'idle')

  async function save() {
    if (import.meta.server) return
    // Only the current keys (old panel versions left extra ones in the state).
    const clean = Object.fromEntries(Object.keys(DEFAULT_CHOICES).map(key => [key, choices.value[key as keyof DevChoices]]))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean))
    // Automated browsers (screenshots, tests) must not overwrite the owner's picks.
    if (!import.meta.dev || navigator.webdriver) return
    saved.value = 'saving'
    try {
      await $fetch('/api/dev/choices', { method: 'POST', body: { ...clean, savedAt: new Date().toISOString() } })
      saved.value = 'saved'
    }
    catch {
      saved.value = 'error'
    }
  }

  function set<K extends keyof DevChoices>(key: K, value: DevChoices[K]) {
    choices.value = { ...choices.value, [key]: value }
    save()
  }

  /** Loads the picks: the saved file wins (it is the record), localStorage is the fallback. */
  async function restore() {
    if (import.meta.server) return
    let stored: Partial<DevChoices> | null = null
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY) ?? 'null')
    }
    catch {
      // Ignore a broken entry.
    }
    // Automated browsers (screenshots, tests) keep their own settings.
    if (import.meta.dev && !navigator.webdriver) {
      const file = await $fetch<Partial<DevChoices> | null>('/api/dev/choices').catch(() => null)
      if (file) stored = file
    }
    if (stored) {
      const known = Object.fromEntries(Object.entries(stored).filter(([key]) => key in DEFAULT_CHOICES))
      choices.value = { ...DEFAULT_CHOICES, ...known }
    }
  }

  return { choices: readonly(choices), saved: readonly(saved), set, restore }
}

/**
 * The look of the 3D: the decided picks (DECIDED_LOOK) everywhere, including
 * any app that extends Regal as a layer; in Regal's own dev server the panel
 * previews the still-open scroll highlight.
 */
export function useLook() {
  const { devPanel } = useRegalConfig()
  const { choices } = useDevChoices()
  return computed<Look>(() => {
    if (!devPanel) return DECIDED_LOOK
    // Only the scroll highlight is still open; the rest is decided.
    return { ...DECIDED_LOOK, scrollHighlight: choices.value.scrollHighlight }
  })
}
