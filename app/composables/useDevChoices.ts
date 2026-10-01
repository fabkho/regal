// Dev-only: the owner's picks for open design decisions, shown live in the
// app. Saved in localStorage and, through a dev-only API, to
// .data/choices.json so they can be read back outside the browser.
//
// Decided (no longer choices): Regal becomes a Nuxt layer for a separate
// portfolio page; ratings show as a hover label (plus the details card);
// covers default to the best automatic image + Gemini back/spine, with
// photos for a few special editions.

import type { SeparatorStyle } from '~/utils/stack/separators'
import type { PickOutside } from '~/utils/books/pick'

export type PageLayout = 'sidebar-all' | 'sidebar-list' | 'sidebar-filters'
/** Fancy re-sort for big changes (more variants arrive from utils/stack/shuffle.ts). */
export type FancyShuffle = string
/** How Books new to the Stack appear and leaving ones vanish (see ENTRANCE_STYLES in utils/stack/shuffle.ts). */
export type Entrance = 'fade' | 'pop' | 'drop'

export interface DevChoices {
  /** Preview the portfolio page (/books): 3D in the body, text in the sidebar. */
  pagePreview: boolean
  pageLayout: PageLayout
  /** Where a picked Book's details go on that page. */
  details: 'overlay' | 'sidebar'
  /** Big re-sorts (more than `shuffleThreshold` Books move) use this; small ones 'hand'. */
  shuffleFancy: FancyShuffle
  /** Moved Books up to which 'hand' is used; null = always 'hand'. */
  shuffleThreshold: number | null
  /** How Books new to the Stack appear (open: previewed in the panel). */
  entrance: Entrance
  /** Back cover typography. */
  backStyle: 'classic' | 'clean'
  /** Hover label content. */
  label: 'stars-title' | 'stars'
  /** Date separators in the Stack (open: recommended 'numerals'). */
  separatorStyle: SeparatorStyle
  /** Clicking another Book while one is out: take that one out, or only put the picked one back. */
  pickOutside: PickOutside
  ai: 'standard' | 'batch' | null
  /** Optional cover overrides: asset key → chosen cover URL. */
  editionPicks: Record<string, string>
  notes: string
}

/** What the 3D looks like: the owner's decided picks, used everywhere outside the dev panel. */
export interface Look {
  shuffleFancy: FancyShuffle
  shuffleThreshold: number | null
  entrance: Entrance
  backStyle: 'classic' | 'clean'
  label: 'stars-title' | 'stars'
  separatorStyle: SeparatorStyle
  pickOutside: PickOutside
}

/**
 * Decided: 'hand' for re-sorts that move up to 3 Books, 'carousel' above; classic back; title + stars on hover.
 * Not decided yet, recommended defaults: 'numerals' date separators, the 'fade' entrance of new Books.
 */
export const DECIDED_LOOK: Readonly<Look> = Object.freeze({
  shuffleFancy: 'carousel',
  shuffleThreshold: 3,
  entrance: 'fade',
  backStyle: 'classic',
  label: 'stars-title',
  separatorStyle: 'numerals',
  // Open (dev choices), recommended: a click next to a picked Book puts it back, even on the pile.
  pickOutside: 'put-back',
})

export const DEFAULT_CHOICES: DevChoices = {
  pagePreview: false,
  pageLayout: 'sidebar-all',
  details: 'overlay',
  ...DECIDED_LOOK,
  ai: null,
  editionPicks: {},
  notes: '',
}

const STORAGE_KEY = 'regal:dev-choices:v2'

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
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
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
 * The look of the 3D: live dev choices in Regal's own dev server (the panel
 * previews them), the decided picks everywhere else, including any app that
 * extends Regal as a layer.
 */
export function useLook() {
  const { devPanel } = useRegalConfig()
  const { choices } = useDevChoices()
  return computed<Look>(() => {
    if (!devPanel) return DECIDED_LOOK
    const { shuffleFancy, shuffleThreshold, entrance, backStyle, label, separatorStyle, pickOutside } = choices.value
    return { shuffleFancy, shuffleThreshold, entrance, backStyle, label, separatorStyle, pickOutside }
  })
}
