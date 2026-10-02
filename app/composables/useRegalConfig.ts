/** Regal's settings, from `runtimeConfig.public.regal` (see nuxt.config.ts and the README). */
export interface RegalConfig {
  /** 'app': the standalone site (upload, demo, localStorage). 'embed': a host page shows `librarySrc`. */
  mode: 'app' | 'embed'
  /** 'embed': URL of a reading-tracker export (`reading list --json`). */
  librarySrc: string
  /** Where the Book asset set lives (manifest.json and the images it lists), with a trailing slash. */
  assetsBase: string
  /** The dev choices panel is on: Regal's own dev server only. */
  devPanel: boolean
}

export const DEFAULT_ASSETS_BASE = '/book-assets/'

export function useRegalConfig(): RegalConfig {
  const config = (useRuntimeConfig().public.regal ?? {}) as Partial<RegalConfig>
  const base = config.assetsBase || DEFAULT_ASSETS_BASE
  return {
    mode: config.mode === 'embed' ? 'embed' : 'app',
    librarySrc: config.librarySrc ?? '',
    assetsBase: base.endsWith('/') ? base : `${base}/`,
    devPanel: Boolean(import.meta.dev && config.devPanel),
  }
}
