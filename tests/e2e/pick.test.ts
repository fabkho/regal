import { fileURLToPath } from 'node:url'
import { createPage, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

describe('picking Books and switching views', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    browser: true,
    browserOptions: {
      type: 'chromium',
      launch: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    },
  })

  it('takes a Book out from the list, flips it and puts it back', async () => {
    const errors: string[] = []
    const page = await createPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(url('/'), { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /try demo/i }).click()

    const stage = page.locator('section.stage')
    await page.getByRole('button', { name: /^Dune/ }).click()
    const details = page.getByRole('article', { name: 'Dune details' })
    await details.waitFor({ state: 'visible', timeout: 10_000 })
    expect(await stage.getAttribute('data-picked')).not.toBe('')
    expect(await details.textContent()).toContain('Frank Herbert')

    await details.getByRole('button', { name: /show back/i }).click()
    await details.getByRole('button', { name: /show front/i }).waitFor()

    await page.keyboard.press('Escape')
    await details.waitFor({ state: 'detached', timeout: 10_000 })
    expect(await stage.getAttribute('data-picked')).toBe('')
    expect(errors).toEqual([])
    await page.close()
  })

  it('switches to the Stack view and picks there too', async () => {
    const page = await createPage()
    await page.goto(url('/'), { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /try demo/i }).click()

    await page.getByRole('button', { name: 'Stack', exact: true }).click()
    const stage = page.locator('section[aria-label="Book stack"]')
    await expect.poll(async () => stage.getAttribute('data-view'), { timeout: 10_000 }).toBe('stack')
    expect(await stage.getAttribute('data-book-count')).toBe('43')
    await expect.poll(() => page.url(), { timeout: 5_000 }).toContain('view=stack')

    await page.getByRole('button', { name: /^Dune/ }).click()
    await page.getByRole('article', { name: 'Dune details' }).waitFor({ state: 'visible', timeout: 10_000 })
    await page.getByRole('button', { name: /put back/i }).click()
    await page.getByRole('article', { name: 'Dune details' }).waitFor({ state: 'detached', timeout: 10_000 })
    await page.close()
  })
})
