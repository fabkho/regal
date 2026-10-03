import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createPage, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const fixture = (name: string) => readFileSync(new URL(`../fixtures/library-file/${name}`, import.meta.url), 'utf8')
/** A library file as a URL the viewer's ?src= takes (data: needs no server). */
const asSrc = (text: string) => encodeURIComponent(`data:application/json,${encodeURIComponent(text)}`)

describe('the viewer', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../..', import.meta.url)),
    browser: true,
  })

  it('shows the demo library file with list and summary, without hydration mismatches', async () => {
    const page = await createPage()
    const consoleMessages: string[] = []
    page.on('console', message => consoleMessages.push(message.text()))
    await page.goto(url('/'), { waitUntil: 'networkidle' })
    const list = page.getByRole('list', { name: 'Your books' })
    await list.locator('li').first().waitFor()

    expect(await list.locator('li').count()).toBe(8)
    expect(await page.getByText('Frankenstein').first().isVisible()).toBe(true)
    expect(await page.getByRole('status').textContent()).toContain('8 books')
    expect(await page.getByText('Demo Reader\'s library').isVisible()).toBe(true)

    // Nothing is kept in the browser any more: a reload shows the file again.
    await page.reload({ waitUntil: 'load' })
    await list.locator('li').first().waitFor()
    expect(await list.locator('li').count()).toBe(8)
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('regal:library')))).toEqual([])
    expect(consoleMessages.filter(text => /hydration/i.test(text))).toEqual([])
    await page.close()
  })

  it('views any library file with ?src=', async () => {
    const page = await createPage(`/?src=${asSrc(fixture('minimal.json'))}`)
    const list = page.getByRole('list', { name: 'Your books' })
    await list.locator('li').first().waitFor()
    const minimal = JSON.parse(fixture('minimal.json')) as { books: { title: string }[] }
    expect(await list.locator('li').count()).toBe(minimal.books.length)
    expect(await list.textContent()).toContain(minimal.books[0]!.title)
    await page.close()
  })

  it('follows ?src= on client navigation, and back again', async () => {
    const page = await createPage('/')
    const list = page.getByRole('list', { name: 'Your books' })
    await list.locator('li').first().waitFor()
    expect(await list.locator('li').count()).toBe(8)
    const minimal = JSON.parse(fixture('minimal.json')) as { books: unknown[] }
    await page.evaluate((src) => {
      const app = (document.querySelector('#__nuxt') as unknown as { __vue_app__: { config: { globalProperties: { $router: { push: (to: unknown) => Promise<unknown> } } } } }).__vue_app__
      return app.config.globalProperties.$router.push({ query: { src } })
    }, decodeURIComponent(asSrc(fixture('minimal.json'))))
    await expect.poll(() => list.locator('li').count(), { timeout: 10_000 }).toBe(minimal.books.length)
    await page.goBack()
    await expect.poll(() => list.locator('li').count(), { timeout: 10_000 }).toBe(8)
    expect(await page.getByText('Demo Reader\'s library').isVisible()).toBe(true)
    await page.close()
  })

  it('shows why an invalid file can\'t be shown, never an empty shelf', async () => {
    const page = await createPage(`/?src=${asSrc(fixture('invalid/bad-books.json'))}`)
    const stage = page.locator('section.stage')
    const card = stage.getByRole('alert')
    await card.waitFor({ state: 'visible', timeout: 10_000 })
    expect(await card.textContent()).toContain('This is not a valid Regal library file.')
    expect(await card.locator('li').first().textContent()).toMatch(/^books\[\d+\]/)
    // No 3D behind it.
    expect(await stage.locator('canvas').count()).toBe(0)
    expect(await page.getByRole('list', { name: 'Your books' }).count()).toBe(0)
    await page.close()
  })

  it('says when the file doesn\'t load', async () => {
    const page = await createPage('/?src=/nowhere/library.json')
    const card = page.locator('section.stage').getByRole('alert')
    await card.waitFor({ state: 'visible', timeout: 10_000 })
    expect(await card.textContent()).toContain('Could not load the library file.')
    expect(await card.textContent()).toContain('/nowhere/library.json')
    await page.close()
  })
})
