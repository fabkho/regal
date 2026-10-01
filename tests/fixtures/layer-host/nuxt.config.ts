// A minimal host app that uses Regal as a Nuxt layer, the way the portfolio
// does: Regal's components on its own /books page, a synthetic Library and
// asset set served from public/books/. Built by tests/e2e/layer-host.test.ts.
export default defineNuxtConfig({
  extends: ['../../../'],
  runtimeConfig: {
    public: {
      regal: {
        mode: 'embed',
        librarySrc: '/books/library.json',
        assetsBase: '/books/',
      },
    },
  },
  compatibilityDate: '2026-09-01',
})
