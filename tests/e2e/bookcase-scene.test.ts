import { fileURLToPath } from 'node:url'
import { createPage, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('bookcase scene', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    browser: true,
    browserOptions: {
      type: 'chromium',
      launch: {
        // Headless Chromium has no GPU here: SwiftShader gives it a software
        // WebGL implementation so the scene really renders.
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      },
    },
  })

  it('renders a canvas in the Bookcase section without page errors', async () => {
    const errors: string[] = []
    const page = await createPage()
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`)
    })

    await page.goto(url('/'), { waitUntil: 'networkidle' })

    const canvas = page.locator('section[aria-label="Bookcase"] canvas')
    await canvas.waitFor({ state: 'attached', timeout: 30_000 })
    expect(await canvas.count()).toBe(1)

    // The canvas is laid out, not a zero-sized placeholder.
    const box = await canvas.boundingBox()
    expect(box!.width).toBeGreaterThan(100)
    expect(box!.height).toBeGreaterThan(100)

    expect(errors).toEqual([])

    await page.close()
  })

  it('puts every Book of the demo library on the Shelves', async () => {
    const page = await createPage()
    await page.goto(url('/'), { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /demo/i }).click()

    const stage = page.locator('section[aria-label="Bookcase"]')
    await expect.poll(async () => Number(await stage.getAttribute('data-book-count')), { timeout: 20_000 }).toBe(43)
    expect(await stage.getAttribute('data-bookcase-count')).toBe('1')

    await page.close()
  })
})
