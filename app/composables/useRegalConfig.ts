import type { RegalTheme } from '#layers/regal/app/utils/theme/tokens'
import { normalizeTheme } from '#layers/regal/app/utils/theme/tokens'

/** Regal's settings, from `runtimeConfig.public.regal` (see nuxt.config.ts and the README). */
export interface RegalConfig {
  /** URL of the Regal library file to show (docs/library-file.md); absolute or relative to the page. */
  librarySrc: string
  /** Short vibrations when a Book is taken out or put back and while a finger scrolls the Stack (where the phone can); false turns them off. */
  haptics: boolean
  /** The tooltip's and the Book detail panel's colour scheme where a component doesn't set `theme` (README: "Theming"). */
  theme: RegalTheme
}

/**
 * `mode` and `assetsBase` (before the Regal library file) are no longer read:
 * a host that still sets them gets no error, they have no effect.
 */
export function useRegalConfig(): RegalConfig {
  const config = (useRuntimeConfig().public.regal ?? {}) as Partial<RegalConfig>
  return {
    librarySrc: typeof config.librarySrc === 'string' ? config.librarySrc.trim() : '',
    // On unless the host says false (also NUXT_PUBLIC_REGAL_HAPTICS=false).
    haptics: config.haptics !== false,
    // Regal's own light look unless the host says 'dark' or 'auto'.
    theme: normalizeTheme(config.theme),
  }
}
