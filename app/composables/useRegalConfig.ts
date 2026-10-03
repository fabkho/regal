/** Regal's settings, from `runtimeConfig.public.regal` (see nuxt.config.ts and the README). */
export interface RegalConfig {
  /** URL of the Regal library file to show (docs/library-file.md); absolute or relative to the page. */
  librarySrc: string
}

/**
 * `mode` and `assetsBase` (before the Regal library file) are no longer read:
 * a host that still sets them gets no error, they have no effect.
 */
export function useRegalConfig(): RegalConfig {
  const config = (useRuntimeConfig().public.regal ?? {}) as Partial<RegalConfig>
  return {
    librarySrc: typeof config.librarySrc === 'string' ? config.librarySrc.trim() : '',
  }
}
