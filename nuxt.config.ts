import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { installModule, tryResolveModule } from 'nuxt/kit'
import type { NuxtModule } from 'nuxt/schema'

const isTest = process.env.NODE_ENV === 'test'

/** This repo. Also its location when another app `extends` it as a Nuxt layer. */
const regalDir = dirname(fileURLToPath(import.meta.url))

/** Where Regal's own site serves the demo library file (from demo/). */
const DEMO_LIBRARY_SRC = '/demo-library.json'

/**
 * Regal is a standalone app and a Nuxt layer at once. Everything that belongs
 * to the standalone site only (global CSS, page title, the dev choices panel,
 * the demo library file, lint/test tooling) is set up here, and only when
 * Regal is the app being built. An app that extends Regal gets the components
 * and composables, no server routes and nothing that styles or changes its
 * own pages.
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
        // Dev panel and the design-round prototypes (app/pages/prototype) stay Regal's own.
        const file = components[index]!.filePath
        if (own(file, 'app/components/dev') || own(file, 'app/components/prototype')) components.splice(index, 1)
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
  nuxt.options.app.head.title ??= 'Regal — a reading library as a bookcase'
  nuxt.options.app.head.meta = [
    ...(nuxt.options.app.head.meta ?? []),
    { name: 'description', content: 'A reading library as a 3D bookcase: pull a book off the shelf, turn it around.' },
  ]

  // The site is a viewer: it shows the demo library file (synthetic, a copy of
  // tests/fixtures/library-file/demo.json) unless librarySrc says otherwise.
  // Served from demo/, not public/, which hosts would serve too.
  nuxt.options.nitro.publicAssets ??= []
  nuxt.options.nitro.publicAssets.push({ dir: join(regalDir, 'demo'), baseURL: '/', maxAge: 0 })
  const regalConfig = nuxt.options.runtimeConfig.public.regal as { librarySrc: string }
  regalConfig.librarySrc ||= DEMO_LIBRARY_SRC

  // Dev only (the prototypes, /prototype/row): the published shelf through this
  // origin, as books.fabkho.dev allows CORS for a few origins only. Nothing is
  // copied into the repo; never part of a build.
  if (nuxt.options.dev) {
    nuxt.options.nitro.devProxy ??= {}
    nuxt.options.nitro.devProxy['/_published/v2'] = { target: 'https://books.fabkho.dev/v2', changeOrigin: true }
  }
  else {
    // The prototypes are a dev server thing: no build ships them.
    nuxt.hook('pages:extend', (pages) => {
      for (let index = pages.length - 1; index >= 0; index--) {
        if (pages[index]!.file?.startsWith(join(regalDir, 'app/pages/prototype'))) pages.splice(index, 1)
      }
    })
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
    public: {
      /**
       * Regal's settings (README: "Use Regal as a Nuxt layer"); env overrides
       * like NUXT_PUBLIC_REGAL_LIBRARY_SRC work too.
       */
      regal: {
        /** URL of the Regal library file to show (docs/library-file.md). Regal's own site: the demo. */
        librarySrc: '',
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
