import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/** The Regal layer (this repo's root): its own files import each other as `#layers/regal/…`. */
const regalLayer = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: { alias: { '#layers/regal/': regalLayer } },
})
