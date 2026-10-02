// A minimal host app that uses Regal as a Nuxt layer, the way the portfolio
// does: Regal's components on its own /books page, a synthetic Regal library
// file served from public/books/. Built by tests/e2e/layer-host.test.ts.
export default defineNuxtConfig({
  extends: ['../../../'],
  runtimeConfig: {
    public: {
      regal: {
        librarySrc: '/books/library.json',
      },
    },
  },
  compatibilityDate: '2026-09-01',
})
