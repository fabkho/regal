import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { addServerHandler, installModule, tryResolveModule } from 'nuxt/kit'
import type { NuxtModule } from 'nuxt/schema'

const isTest = process.env.NODE_ENV === 'test'

/** This repo. Also its location when another app `extends` it as a Nuxt layer. */
const regalDir = dirname(fileURLToPath(import.meta.url))

/**
 * Regal is a standalone app and a Nuxt layer at once. Everything that belongs
 * to the standalone site only (global CSS, page title, the dev choices panel
 * and its API, lint/test tooling) is set up here, and only when Regal is the
 * app being built. An app that extends Regal gets the components, composables,
 * the Cover/description API and nothing that styles or changes its own pages.
 */
const regalApp: NuxtModule = async (_options, nuxt) => {
  const isRegal = resolve(nuxt.options.rootDir) === regalDir

  if (!isRegal) {
    const own = (path: string | undefined, dir: string) => Boolean(path?.startsWith(join(regalDir, dir)))
    // Regal's own page and the dev choices panel stay out of the host.
    nuxt.hook('pages:extend', (pages) => {
      for (let index = pages.length - 1; index >= 0; index--) {
        if (own(pages[index]!.file, 'app/pages')) pages.splice(index, 1)
      }
    })
    nuxt.hook('components:extend', (components) => {
      for (let index = components.length - 1; index >= 0; index--) {
        if (own(components[index]!.filePath, 'app/components/dev')) components.splice(index, 1)
      }
    })
    return
  }

  // Tooling (devDependencies): absent when the repo is installed without them.
  const from = pathToFileURL(`${regalDir}/`).href
  if (await tryResolveModule('@nuxt/eslint', from)) await installModule('@nuxt/eslint', { config: { stylistic: true } })
  if (isTest) await installModule('@nuxt/test-utils/module')

  nuxt.options.css.unshift(join(regalDir, 'app/assets/css/main.css'))
  nuxt.options.app.head.htmlAttrs = { lang: 'en', ...nuxt.options.app.head.htmlAttrs }
  nuxt.options.app.head.title ??= 'Regal — your Goodreads library as a bookcase'
  nuxt.options.app.head.meta = [
    ...(nuxt.options.app.head.meta ?? []),
    { name: 'description', content: 'Upload your Goodreads library export and browse it as a 3D bookcase.' },
  ]

  if (nuxt.options.dev) {
    // The dev choices panel (components/dev/Choices.vue) reads and writes the owner's picks here.
    nuxt.options.runtimeConfig.public.regal.devPanel = true
    for (const [route, method, file] of [
      ['/api/dev/choices', 'get', 'choices.get.ts'],
      ['/api/dev/choices', 'post', 'choices.post.ts'],
      ['/api/dev/editions', 'get', 'editions.get.ts'],
    ] as const) addServerHandler({ route, method, handler: join(regalDir, 'server/dev', file) })
  }
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/fonts',
    '@tresjs/nuxt',
    '@vueuse/nuxt',
    regalApp,
  ],
  // Named layer: Nuxt aliases `#layers/regal` to this folder, here and in hosts.
  // Regal's own imports use it instead of `~`/`~~`, which point at the host app
  // when Regal is extended (and break the host's typecheck).
  $meta: { name: 'regal' },

  devtools: { enabled: true },

  runtimeConfig: {
    /** Optional: enables the Google Books Cover source (NUXT_GOOGLE_BOOKS_API_KEY). */
    googleBooksApiKey: '',
    public: {
      /**
       * Regal's settings (README: "Use Regal as a Nuxt layer"); env overrides
       * like NUXT_PUBLIC_REGAL_MODE=embed work too.
       */
      regal: {
        /** 'app': the standalone site (upload, demo, localStorage). 'embed': a host page shows `librarySrc`. */
        mode: 'app' as 'app' | 'embed',
        /** 'embed': URL of a reading-tracker export (`reading list --json`) to show. */
        librarySrc: '',
        /** Where the Book asset set lives: manifest.json plus the images it lists. */
        assetsBase: '/book-assets/',
        /** Internal: the dev choices panel is on (Regal's own dev server only). */
        devPanel: false,
      },
    },
  },
  compatibilityDate: '2026-09-01',

  fonts: {
    families: [
      // Global: Regal's components use it through var(--font-mono, 'IBM Plex Mono', …),
      // which a host app's CSS scan wouldn't find. Only @font-face, no styles.
      { name: 'IBM Plex Mono', weights: [400, 500, 600, 700], global: true },
      // Spine typography (drawn on canvas, so it must be registered globally).
      { name: 'Patua One', weights: [400], global: true },
      { name: 'Antonio', weights: [400, 700], global: true },
    ],
  },
})
