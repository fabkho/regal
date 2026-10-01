// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  // Test host apps (Regal as a layer) have their own pages.
  files: ['tests/fixtures/**/pages/**/*.vue'],
  rules: { 'vue/multi-word-component-names': 'off' },
})
