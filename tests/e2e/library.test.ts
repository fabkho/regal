import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPage, setup } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtureCsv = join(__dirname, '..', 'fixtures', 'goodreads-export.csv')

describe('library upload', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    browser: true,
  })

  it('imports a fixture CSV and shows the list view and summary', async () => {
    const page = await createPage('/')

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(fixtureCsv)

    const list = page.getByRole('list', { name: 'Your books' })
    await list.locator('li').first().waitFor()

    const items = list.locator('li')
    expect(await items.count()).toBe(5)
    expect(await page.getByText('The Great Gatsby').isVisible()).toBe(true)
    expect(await page.getByText('Morning Star').isVisible()).toBe(true)
    expect(await page.getByRole('status').textContent()).toContain('5 books')

    await page.close()
  })

  it('loads the demo library on button click', async () => {
    const page = await createPage('/')

    await page.getByRole('button', { name: 'Try demo library' }).click()

    const list = page.getByRole('list', { name: 'Your books' })
    await list.locator('li').first().waitFor()

    const items = list.locator('li')
    const count = await items.count()
    expect(count).toBeGreaterThanOrEqual(35)
    expect(await page.getByRole('status').textContent()).toContain('books')

    await page.close()
  })

  it('restores the Library after a reload without hydration mismatches', async () => {
    const page = await createPage('/')

    const consoleMessages: string[] = []
    page.on('console', (msg) => {
      consoleMessages.push(msg.text())
    })

    await page.getByRole('button', { name: 'Try demo library' }).click()

    const list = page.getByRole('list', { name: 'Your books' })
    await list.locator('li').first().waitFor()
    expect(await list.locator('li').count()).toBe(43)

    await page.reload({ waitUntil: 'networkidle' })
    // Restore happens post-hydration (app:mounted); give it a tick.
    await list.locator('li').first().waitFor()

    expect(await list.locator('li').count()).toBe(43)
    expect(await page.getByRole('status').textContent()).toContain('43 books')

    const hydrationMessages = consoleMessages.filter(text => /hydration/i.test(text))
    expect(hydrationMessages).toEqual([])

    await page.close()
  })
})
