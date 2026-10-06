import type { InjectionKey, Ref, Slot, Slots } from 'vue'
import type { RegalScheme, RegalTheme } from '#layers/regal/app/utils/theme/tokens'
import { nearestHostTheme, normalizeTheme, REGAL_TOKENS, resolveScheme } from '#layers/regal/app/utils/theme/tokens'

// The host's say over Regal's DOM UI around the 3D: theme, `unstyled` and the
// slots for the tooltip and the Book detail panel (docs/nuxt-layer.md: "Theming").
// RegalBooksStage / RegalBooksSidebar / RegalBooksRow provide it from their
// props and slots; the surfaces (BooksHoverLabel, BooksFocusLabel,
// BooksLabelMorph, BooksDetails, RowCard's focus label and details) read it,
// however deep they sit, so any stage variant that renders them is themed the
// same way. Without a provider (Regal's own page)
// they get the runtime config's theme and no slots.
//
// Some surfaces live in <body> (the hover label, the morph box, the phone's
// sheet, a broken-out row), out of reach of the tokens a host sets on its wrapper. The provider
// reads the resolved tokens off its root and hands them to those surfaces as
// inline custom properties, so a teleported surface looks like one inside.

export interface RegalUi {
  /** The scheme the surfaces show (`auto` resolved; `light` until mounted). */
  scheme: Readonly<Ref<RegalScheme>>
  /** Structure and layout CSS only. */
  unstyled: Readonly<Ref<boolean>>
  /** Resolved `--_regal-*` values of the root, for surfaces outside it (empty without a provider). */
  tokens: Readonly<Ref<Record<string, string>>>
  /** Whether the host passed this slot. */
  hasSlot: (name: string) => boolean
  /** The host's slot, if passed. */
  slot: (name: string) => Slot | undefined
}

const REGAL_UI: InjectionKey<RegalUi> = Symbol('regal-ui')

export interface RegalUiOptions {
  /** The theme asked for (a prop); undefined: `runtimeConfig.public.regal.theme`. */
  theme: () => RegalTheme | string | undefined
  unstyled: () => boolean
  /** The `.regal` root: where `auto` looks for the host's hooks, and where the tokens are read. */
  root: Readonly<Ref<HTMLElement | null>>
  /** The provider's own slots: the host's tooltip/detail slots. */
  slots?: Slots
}

const HOOK_ATTRIBUTES = ['class', 'style', 'data-theme', 'data-color-scheme']

/**
 * Calls `changed` (at most once a frame) when a hook attribute changes on
 * `start` or any of its ancestors: where a host flips its theme or tokens.
 * Returns the disconnect.
 */
function watchAncestors(start: Element, changed: () => void): () => void {
  let frame = 0
  const observer = new MutationObserver(() => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      changed()
    })
  })
  for (let element: Element | null = start; element; element = element.parentElement) {
    observer.observe(element, { attributes: true, attributeFilter: HOOK_ATTRIBUTES })
  }
  return () => {
    observer.disconnect()
    if (frame) cancelAnimationFrame(frame)
  }
}

/** The theme a component asks for, or the runtime config's. */
function useRequestedTheme(theme: () => RegalTheme | string | undefined) {
  const config = useRegalConfig()
  return computed(() => normalizeTheme(theme(), config.theme))
}

/**
 * `auto` resolved in the browser: the host's `data-theme`/`dark`/`light` hook
 * nearest to `root` (or on <html>), a single-scheme `color-scheme` there, the
 * OS preference. Watches all three.
 */
function useResolvedScheme(theme: Readonly<Ref<RegalTheme>>, root: Readonly<Ref<HTMLElement | null>>) {
  const scheme = ref<RegalScheme>(theme.value === 'dark' ? 'dark' : 'light')
  const prefersDark = usePreferredDark()

  function resolve() {
    if (theme.value !== 'auto' || !import.meta.client) {
      scheme.value = theme.value === 'dark' ? 'dark' : 'light'
      return
    }
    const start = root.value?.parentElement ?? document.documentElement
    scheme.value = resolveScheme({
      theme: 'auto',
      hostTheme: nearestHostTheme(start),
      colorScheme: getComputedStyle(start).colorScheme,
      prefersDark: prefersDark.value,
    })
  }

  // The host flips its hook on an ancestor (class, data-theme, a style with color-scheme).
  let stop: (() => void) | null = null
  function observe() {
    stop?.()
    stop = null
    if (!import.meta.client || theme.value !== 'auto') return
    stop = watchAncestors(root.value?.parentElement ?? document.documentElement, resolve)
  }

  onMounted(() => {
    observe()
    resolve()
  })
  watch([theme, root], () => {
    observe()
    resolve()
  })
  watch(prefersDark, resolve)
  onBeforeUnmount(() => stop?.())
  return scheme
}

/**
 * Called by the public components (RegalBooksStage, RegalBooksSidebar, RegalBooksRow): theme,
 * `unstyled` and the host's slots for every surface below. Returns the root's
 * attributes (`.regal` scope, resolved theme).
 */
export function provideRegalUi(options: RegalUiOptions) {
  const theme = useRequestedTheme(options.theme)
  const scheme = useResolvedScheme(theme, options.root)
  const unstyled = computed(() => options.unstyled())

  // Slot names, refreshed when the host re-renders with other slots (the slots
  // object itself isn't reactive).
  const slots = options.slots
  const slotNames = shallowRef<string[]>(slots ? Object.keys(slots) : [])
  onBeforeUpdate(() => {
    const next = slots ? Object.keys(slots) : []
    if (next.join() !== slotNames.value.join()) slotNames.value = next
  })

  // The resolved tokens, read off the root once it shows the scheme.
  const tokens = shallowRef<Record<string, string>>({})
  function readTokens() {
    const root = options.root.value
    if (!root || !import.meta.client) return
    const style = getComputedStyle(root)
    const next: Record<string, string> = {}
    for (const name of REGAL_TOKENS) {
      const value = style.getPropertyValue(`--_regal-${name}`).trim()
      if (value) next[`--_regal-${name}`] = value
    }
    if (JSON.stringify(next) !== JSON.stringify(tokens.value)) tokens.value = next
  }
  onMounted(readTokens)
  watch([scheme, unstyled, options.root], readTokens, { flush: 'post' })
  // The host may change its tokens with a class or attribute anywhere above.
  let stop: (() => void) | null = null
  onMounted(() => {
    const parent = options.root.value?.parentElement
    if (parent) stop = watchAncestors(parent, readTokens)
  })
  onBeforeUnmount(() => stop?.())

  const ui: RegalUi = {
    scheme,
    unstyled,
    tokens,
    hasSlot: name => slotNames.value.includes(name),
    slot: name => (slotNames.value.includes(name) ? slots?.[name] : undefined),
  }
  provide(REGAL_UI, ui)

  return {
    ui,
    rootAttrs: computed(() => ({
      'class': ['regal', { 'regal--unstyled': unstyled.value }],
      'data-regal-theme': scheme.value,
    })),
    /** Re-reads the tokens (a host that changed them by other means). */
    refresh: readTokens,
  }
}

/** The context the surfaces read (the nearest provider's, or the runtime config's theme). */
export function useRegalUi(): RegalUi {
  const provided = inject(REGAL_UI, null)
  if (provided) return provided
  const theme = useRequestedTheme(() => undefined)
  const root = ref<HTMLElement | null>(null)
  return {
    scheme: useResolvedScheme(theme, root),
    unstyled: computed(() => false),
    tokens: computed(() => ({})),
    hasSlot: () => false,
    slot: () => undefined,
  }
}

/**
 * Attributes for one surface (a label, the card): the `.regal` scope and
 * theme, and for one outside the root (`teleported`) the root's tokens.
 */
export function useRegalSurface(teleported: () => boolean = () => false) {
  const ui = useRegalUi()
  return computed(() => ({
    'class': ['regal', { 'regal--unstyled': ui.unstyled.value }],
    'data-regal-theme': ui.scheme.value,
    'style': teleported() ? ui.tokens.value : undefined,
  }))
}
