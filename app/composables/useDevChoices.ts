// Dev-only: the owner's picks for open design decisions (#26–#28 and more),
// shown live in the app. Saved in localStorage and, through a dev-only API,
// to .data/choices.json so they can be read back outside the browser.

export type RatingStyle = 'card' | 'bookmark' | 'proud' | 'label'

export interface DevChoices {
  /** #26, combinable; 'card' is always on. */
  rating: RatingStyle[]
  /** #27 */
  sortUi: 'chips' | 'menu' | 'url'
  sortMotion: 'animate' | 'instant'
  /** #28 */
  portfolio: 'static' | 'blob' | 'layer' | null
  /** Preview the Stack at portfolio-sidebar width. */
  sidebarPreview: boolean
  editions: 'photo' | 'auto' | 'manual' | null
  /** Manual edition picks: asset key → chosen cover URL. */
  editionPicks: Record<string, string>
  ai: 'standard' | 'batch' | null
  notes: string
}

export const DEFAULT_CHOICES: DevChoices = {
  rating: ['card'],
  sortUi: 'chips',
  sortMotion: 'animate',
  portfolio: null,
  sidebarPreview: false,
  editions: null,
  editionPicks: {},
  ai: null,
  notes: '',
}

const STORAGE_KEY = 'regal:dev-choices'

export function useDevChoices() {
  const choices = useState<DevChoices>('dev-choices', () => ({ ...DEFAULT_CHOICES }))
  const saved = useState<'idle' | 'saving' | 'saved' | 'error'>('dev-choices:saved', () => 'idle')

  async function save() {
    if (import.meta.server) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choices.value))
    if (!import.meta.dev) return
    saved.value = 'saving'
    try {
      await $fetch('/api/dev/choices', { method: 'POST', body: { ...choices.value, savedAt: new Date().toISOString() } })
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

  function toggleRating(style: RatingStyle) {
    if (style === 'card') return
    const list = choices.value.rating
    set('rating', list.includes(style) ? list.filter(item => item !== style) : [...list, style])
  }

  function restore() {
    if (import.meta.server) return
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<DevChoices> | null
      if (stored) choices.value = { ...DEFAULT_CHOICES, ...stored }
    }
    catch {
      // Ignore a broken entry.
    }
  }

  return { choices: readonly(choices), saved: readonly(saved), set, toggleRating, restore }
}
