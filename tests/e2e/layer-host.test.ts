import { fileURLToPath } from 'node:url'
import { $fetch, createPage, fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

// Regal as a Nuxt layer: tests/fixtures/layer-host extends the repo root and
// puts RegalBooksStage + RegalBooksSidebar on /books and two RegalBooksRow
// cards on /profile, fed a synthetic Regal library file (public/books/library.json).
describe('Regal as a Nuxt layer', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/layer-host', import.meta.url)),
    browser: true,
    browserOptions: {
      type: 'chromium',
      launch: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    },
  })

  it('server-renders the sidebar from the host\'s librarySrc', async () => {
    const html = await $fetch<string>('/books')
    expect(html).toContain('Reading')
    expect(html).toContain('books read')
    expect(html).toContain('The Paper Lighthouse')
    expect(html).toContain('A Grammar of Small Moons')
    // None of Regal's standalone page: no head title, demo or global CSS.
    expect(html).not.toContain('Regal — a reading library')
    expect(html).not.toContain('Demo Reader')
  })

  it('ships no Regal page, no demo and no server routes into the host', async () => {
    expect((await fetch('/')).status).toBe(404)
    expect((await fetch('/demo-library.json')).status).toBe(404)
    for (const route of ['/api/cover?isbn13=9780547928227', '/api/description?title=Dune', '/api/dev/choices', '/api/dev/editions?title=Dune']) {
      expect((await fetch(route)).status, route).toBe(404)
    }
  })

  it('renders the 3D Stack and the records side by side, linked', async () => {
    const errors: string[] = []
    const requests: string[] = []
    const page = await createPage()
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => requests.push(new URL(request.url()).pathname))
    await page.goto(url('/books'), { waitUntil: 'networkidle' })

    const stage = page.locator('section[aria-label="Book stack"]')
    await stage.locator('canvas').waitFor({ state: 'attached', timeout: 15_000 })
    expect(await stage.getAttribute('data-view')).toBe('stack')
    await expect.poll(() => stage.getAttribute('data-book-count'), { timeout: 10_000 }).toBe('5')
    // Stack only: no Bookcase/Stack switch and no filter chips over the 3D.
    expect(await page.getByRole('group', { name: 'View' }).count()).toBe(0)
    expect(await page.locator('.regal-books-sidebar').getByRole('group', { name: 'Sort' }).count()).toBe(1)
    expect(await page.getByRole('group', { name: 'Sort' }).count()).toBe(1)
    // A Stack-only page keeps the host's URL clean.
    expect(page.url()).not.toContain('view=')

    // The images resolve against the library file's URL (/books/library.json);
    // the file itself came with the server-rendered page. Nothing else is asked.
    await expect.poll(() => requests.some(path => /^\/books\/fx-\d+\/spine\.webp$/.test(path)), { timeout: 10_000 }).toBe(true)
    expect(requests.filter(path => /^\/(book-assets|api)\/|manifest\.json$/.test(path))).toEqual([])
    expect(requests.filter(path => path.includes('fx-005'))).toEqual([])

    // Records pick Books in the 3D; the details card shows over it.
    const sidebar = page.locator('.regal-books-sidebar')
    expect(await sidebar.locator('.records__item').count()).toBe(5)
    await sidebar.getByRole('button', { name: /^A Grammar of Small Moons/ }).click()
    const details = page.getByRole('article', { name: 'A Grammar of Small Moons details' })
    await details.waitFor({ state: 'visible', timeout: 10_000 })
    expect(await stage.getAttribute('data-picked')).toBe('fx-003')
    expect(await page.locator('.regal-books-stage').locator('article.details').count()).toBe(1)

    // The host's own sorting reaches the 3D.
    await sidebar.getByRole('button', { name: 'Rating', exact: true }).click()
    await expect.poll(() => page.url(), { timeout: 5_000 }).toContain('sort=rating')

    expect(errors).toEqual([])
    await page.close()
  })

  it('shows the Library as a row in a card, with its own Pick, kept in the card or breaking out', async () => {
    const errors: string[] = []
    const page = await createPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(url('/profile'), { waitUntil: 'networkidle' })

    const rows = page.locator('section.row-card')
    await rows.first().locator('canvas').waitFor({ state: 'attached', timeout: 15_000 })
    expect(await rows.count()).toBe(2)
    expect(await rows.nth(0).getAttribute('data-book-count')).toBe('5')
    expect(await rows.nth(0).getAttribute('aria-label')).toBe('Read lately')
    // A year: only its reads.
    expect(await rows.nth(1).getAttribute('data-book-count')).toBe('2')
    expect(await rows.nth(1).getAttribute('aria-label')).toBe('Books read in 2025')

    // Kept in the card: Enter takes out the Book in focus, its details stay in the row.
    const first = rows.nth(0)
    await first.locator('.row-focus').waitFor({ state: 'attached', timeout: 10_000 })
    await first.locator('.row-card__scroller').focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => first.getAttribute('data-picked'), { timeout: 5_000 }).not.toBe('')
    expect(await first.locator('article.row-card__details').count()).toBe(1)
    expect(await page.locator('.row-card__view--out').count()).toBe(0)
    await page.keyboard.press('Escape')
    await expect.poll(() => first.getAttribute('data-picked'), { timeout: 5_000 }).toBe('')

    // Breaking out: the canvas covers the viewport, the page is held, Escape lands it back.
    const second = rows.nth(1)
    await second.locator('.row-focus').waitFor({ state: 'attached', timeout: 10_000 })
    await second.locator('.row-card__scroller').focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => second.getAttribute('data-picked'), { timeout: 5_000 }).not.toBe('')
    expect(await page.locator('body > .row-card__view--out canvas').count()).toBe(1)
    expect(await page.locator('body > article.row-card__details').count()).toBe(1)
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden')
    await page.keyboard.press('Escape')
    await expect.poll(() => page.locator('.row-card__view--out').count(), { timeout: 5_000 }).toBe(0)
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('')
    expect(await second.locator('canvas').count()).toBe(1)

    expect(errors).toEqual([])
    await page.close()
  })

  it('leaves the host\'s global styles alone', async () => {
    const page = await createPage()
    await page.goto(url('/books'), { waitUntil: 'networkidle' })
    const body = await page.evaluate(() => {
      const style = getComputedStyle(document.body)
      const before = getComputedStyle(document.body, '::before')
      return {
        background: style.backgroundColor,
        font: style.fontFamily,
        margin: style.margin,
        noise: before.content,
        title: document.title,
        lang: document.documentElement.lang,
      }
    })
    expect(body.background).toBe('rgba(0, 0, 0, 0)')
    expect(body.font).not.toContain('IBM Plex Mono')
    expect(body.margin).toBe('8px')
    expect(body.noise).toBe('none')
    expect(body.title).toBe('Books — host')
    expect(body.lang).not.toBe('en')
    // Regal's own components still get the paper-ink look from their fallbacks.
    const sidebarFont = await page.locator('.regal-books-sidebar').evaluate(element => getComputedStyle(element).fontFamily)
    expect(sidebarFont).toContain('IBM Plex Mono')
    await page.close()
  })
})
