const isTest = process.env.NODE_ENV === 'test'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  modules: [
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@tresjs/nuxt',
    '@vueuse/nuxt',
    ...(isTest ? ['@nuxt/test-utils/module'] : []),
  ],

  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Regal — your Goodreads library as a bookcase',
      meta: [
        { name: 'description', content: 'Upload your Goodreads library export and browse it as a 3D bookcase.' },
      ],
    },
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    /** Optional: enables the Google Books Cover source (NUXT_GOOGLE_BOOKS_API_KEY). */
    googleBooksApiKey: '',
  },
  compatibilityDate: '2026-09-01',

  eslint: {
    config: { stylistic: true },
  },

  fonts: {
    families: [
      { name: 'IBM Plex Mono', weights: [400, 500, 600, 700] },
      // Spine typography (drawn on canvas, so it must be registered globally).
      { name: 'Patua One', weights: [400], global: true },
      { name: 'Antonio', weights: [400, 700], global: true },
    ],
  },
})
