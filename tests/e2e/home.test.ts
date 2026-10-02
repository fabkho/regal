import { fileURLToPath } from 'node:url'
import { $fetch, fetch, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('home page', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
  })

  it('renders the shell with model credit and the demo library file, server-side', async () => {
    const html = await $fetch<string>('/')
    expect(html).toContain('Regal')
    expect(html).toContain('Lorenzo Drago')
    // The demo library file (demo/demo-library.json), its records in the HTML.
    expect(html).toContain('Demo Reader')
    expect(html).toContain('The Two Towers')
    // No upload any more.
    expect(html).not.toContain('Try demo library')
    expect(html).not.toContain('type="file"')
  })

  it('serves the demo library file and no API routes', async () => {
    const demo = await $fetch<{ version: number, books: unknown[] }>('/demo-library.json')
    expect(demo.version).toBe(2)
    expect(demo.books).toHaveLength(8)
    for (const route of ['/api/cover?isbn13=9780547928227', '/api/description?title=Dune', '/api/dev/choices', '/api/dev/editions?title=Dune']) {
      expect((await fetch(route)).status, route).toBe(404)
    }
  })
})
