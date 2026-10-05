import { fileURLToPath } from 'node:url'
import { $fetch, createPage, fetch, setup, url } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

// Regal as a Nuxt layer: tests/fixtures/layer-host extends the repo root and
// puts RegalBooksStage + RegalBooksSidebar on /books and two RegalBooksRow
// cards on /profile, fed a synthetic Regal library file (public/books/library.json).
/** Share of a card's middle band that is dark (the Spines), from a screenshot. */
async function inkShare(page: Awaited<ReturnType<typeof createPage>>, card: ReturnType<Awaited<ReturnType<typeof createPage>>['locator']>) {
  const png = await card.screenshot({ type: 'png' })
  return page.evaluate(async (data) => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const top = Math.round(image.height * 0.35)
    const pixels = context.getImageData(0, top, image.width, Math.round(image.height * 0.35)).data
    let dark = 0
    for (let index = 0; index < pixels.length; index += 4) {
      if (0.3 * pixels[index]! + 0.59 * pixels[index + 1]! + 0.11 * pixels[index + 2]! < 160) dark++
    }
    return dark / (pixels.length / 4)
  }, png.toString('base64'))
}

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

    // The focus label stays in one place: centred across the card, under the row.
    const second = rows.nth(1)
    await second.locator('.row-focus').waitFor({ state: 'attached', timeout: 10_000 })
    for (const row of [first, second]) {
      const card = (await row.boundingBox())!
      const label = (await row.locator('.row-focus__inner').boundingBox())!
      expect(Math.abs(label.x + label.width / 2 - (card.x + card.width / 2))).toBeLessThan(2)
      expect(label.y - card.y).toBeGreaterThan(card.height * 0.75)
    }

    // Breaking out: the canvas covers the viewport, the page is held, Escape lands it back.
    // Broken out, the dates go to <body> with the canvas box.
    const dates = async () => {
      const out = await page.locator('.row-card__view--out').count()
      return (out ? page.locator('.row-card__view--out .row-label') : second.locator('.row-label'))
        .evaluateAll(labels => labels.map(label => `${(label as HTMLElement).style.transform} ${(label as HTMLElement).style.getPropertyValue('--leader')}`))
    }
    const datesAtRest = await dates()
    expect(datesAtRest.length).toBeGreaterThan(0)
    await second.locator('.row-card__scroller').focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => second.getAttribute('data-picked'), { timeout: 5_000 }).not.toBe('')
    // The dates fade out while the Book is out, in place.
    expect(await page.locator('.row-card__labels--hidden').count()).toBeGreaterThan(0)
    expect(await dates()).toEqual(datesAtRest)
    expect(await page.locator('body > .row-card__view--out canvas').count()).toBe(1)
    expect(await page.locator('body > article.row-card__details').count()).toBe(1)
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden')
    await page.keyboard.press('Escape')
    await expect.poll(() => page.locator('.row-card__view--out').count(), { timeout: 5_000 }).toBe(0)
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('')
    expect(await second.locator('canvas').count()).toBe(1)
    // Landed back, the Spines are drawn (not only the HTML dates and label): the
    // canvas was resized on the way in, which clears it (utils/stage/frameGate.ts).
    await page.waitForTimeout(1200)
    expect(await inkShare(page, second)).toBeGreaterThan(0.05)
    // The dates never moved, and are back.
    expect(await dates()).toEqual(datesAtRest)
    expect(await second.locator('.row-card__labels--hidden').count()).toBe(0)

    expect(errors).toEqual([])
    await page.close()
  })

  it('rests with the card full of Books: the newest flush right, a year\'s first flush left', async () => {
    const errors: string[] = []
    const page = await createPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(url('/rest'), { waitUntil: 'networkidle' })
    const rows = page.locator('section.row-card')
    await rows.first().locator('canvas').waitFor({ state: 'attached', timeout: 15_000 })
    const newest = rows.nth(0)
    const year = rows.nth(1)
    await newest.locator('.row-focus').waitFor({ state: 'attached', timeout: 10_000 })
    await year.locator('.row-focus').waitFor({ state: 'attached', timeout: 10_000 })
    await page.waitForTimeout(1500)

    const scrollOf = (row: typeof newest) => row.locator('.row-card__scroller').evaluate(element => ({ left: element.scrollLeft, max: element.scrollWidth - element.clientWidth }))
    const atRest = { newest: await scrollOf(newest), year: await scrollOf(year) }
    // Inside the scroll, not at either end: scrolling on still centres the end Books (the bar's thumb isn't at its end).
    for (const [name, { left, max }] of Object.entries(atRest)) {
      expect(left, name).toBeGreaterThan(1)
      expect(left, name).toBeLessThan(max - 1)
    }
    // No jump after the first paint.
    await page.waitForTimeout(600)
    expect(await scrollOf(newest)).toEqual(atRest.newest)
    expect(await scrollOf(year)).toEqual(atRest.year)

    /** Share of a band of the card (x from..to of its width, its middle height) that isn't the paper. */
    async function filled(row: typeof newest, from: number, to: number) {
      const box = (await row.boundingBox())!
      const png = await page.screenshot({ type: 'png', clip: { x: box.x + box.width * from, y: box.y + box.height * 0.45, width: box.width * (to - from), height: box.height * 0.2 } })
      return page.evaluate(async (data) => {
        const image = new Image()
        image.src = `data:image/png;base64,${data}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, 0)
        const pixels = context.getImageData(0, 0, image.width, image.height).data
        let ink = 0
        for (let index = 0; index < pixels.length; index += 4) {
          if (Math.abs(pixels[index]! - 0xF5) + Math.abs(pixels[index + 1]! - 0xF2) + Math.abs(pixels[index + 2]! - 0xEB) > 60) ink++
        }
        return ink / (pixels.length / 4)
      }, png.toString('base64'))
    }
    // Spines right up to the right edge of the newest row, the left edge of the year row (inside the soft end fades).
    expect(await filled(newest, 0.8, 0.92)).toBeGreaterThan(0.5)
    expect(await filled(year, 0.08, 0.2)).toBeGreaterThan(0.5)

    // In focus at rest: the Book in the middle, not the newest; scrolled to the end, the newest is centred.
    const focusOf = (row: typeof newest) => row.locator('.row-focus .title-stars__title').textContent()
    const restFocus = await focusOf(newest)
    await newest.locator('.row-card__scroller').evaluate((element) => {
      element.scrollLeft = element.scrollWidth
    })
    await expect.poll(() => focusOf(newest), { timeout: 5_000 }).not.toBe(restFocus)
    // And the year row scrolled to its start centres its year's first Book.
    await year.locator('.row-card__scroller').evaluate((element) => {
      element.scrollLeft = 0
    })
    await expect.poll(() => focusOf(year), { timeout: 5_000 }).toBe('The Paper Lighthouse')

    expect(errors).toEqual([])
    await page.close()
  })

  it('never lets two dates overlap, at any scroll position or card width', async () => {
    const errors: string[] = []
    const page = await createPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(url('/labels'), { waitUntil: 'networkidle' })
    const rows = page.locator('section.row-card')
    for (let index = 0; index < 3; index++) await rows.nth(index).locator('.row-focus').waitFor({ state: 'attached', timeout: 15_000 })
    await page.waitForTimeout(1500)

    /** The dates showing in a card (not stepped back, inside it), left to right, with their boxes relative to the card. */
    const shownDates = (row: ReturnType<typeof rows.nth>) => row.evaluate((card) => {
      const edge = card.getBoundingClientRect()
      return [...card.querySelectorAll<HTMLElement>('.row-label')]
        .filter(label => label.style.visibility === 'visible' && label.style.getPropertyValue('--shown') === '1')
        .map((label) => {
          const box = label.querySelector('.row-label__inner')!.getBoundingClientRect()
          return { text: label.textContent!.trim(), from: box.left - edge.left, to: box.right - edge.left, top: box.top - edge.top, width: edge.width }
        })
        .filter(date => date.to > 0 && date.from < date.width)
        .sort((a, b) => a.from - b.from)
    })

    const seen = new Set<string>()
    let collapsed = 0
    for (const [index, name] of ['phone', 'narrow', 'year'].entries()) {
      const row = rows.nth(index)
      const scroller = row.locator('.row-card__scroller')
      const max = await scroller.evaluate(element => element.scrollWidth - element.clientWidth)
      expect(max, name).toBeGreaterThan(200)
      // The rest first, then every 14 px along the whole row.
      const positions = [null, ...Array.from({ length: Math.ceil(max / 14) + 1 }, (_, step) => Math.min(max, step * 14))]
      for (const at of positions) {
        if (at !== null) {
          await scroller.evaluate((element, left) => {
            element.scrollLeft = left
          }, at)
        }
        await page.waitForTimeout(40)
        const dates = await shownDates(row)
        for (const date of dates) seen.add(date.text)
        for (let pair = 1; pair < dates.length; pair++) {
          // The gap is 12 px; 1 px of slack for the box's sub-pixel size.
          expect(dates[pair]!.from - dates[pair - 1]!.to, `${name} at ${at ?? 'rest'}: ${dates[pair - 1]!.text} / ${dates[pair]!.text}`).toBeGreaterThanOrEqual(11)
        }
      }
      collapsed += await row.locator('.row-label[data-shown="false"]').count()
      // A crowded-out date keeps its leader line: the element is still there, with a length.
      const bare = row.locator('.row-label[data-shown="false"]').first()
      if (await bare.count()) expect(Number.parseFloat(await bare.evaluate(element => element.style.getPropertyValue('--leader')))).toBeGreaterThanOrEqual(0)
    }
    // Close months did get dates (not all collapsed), and some had to give way.
    expect(seen.size).toBeGreaterThan(6)
    expect(collapsed).toBeGreaterThan(0)

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
