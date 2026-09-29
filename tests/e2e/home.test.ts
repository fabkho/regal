import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('home page', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  })

  it('renders the shell with model credit', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('Bookshelf')
    expect(html).toContain('Lorenzo Drago')
  })
})
