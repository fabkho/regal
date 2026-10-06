import { fileURLToPath } from 'node:url'
import AxeBuilder from '@axe-core/playwright'
import { $fetch, createPage, fetch, getBrowser, setup, url } from '@nuxt/test-utils/e2e'
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

type Page = Awaited<ReturnType<typeof createPage>>

/** A page in a context of its own: axe opens its own pages in the page's context, which `createPage`'s (made by `browser.newPage()`) doesn't allow. */
async function createAxePage() {
  const context = await (await getBrowser()).newContext()
  return context.newPage()
}

/** The serious and critical axe violations of the page as it is now (WCAG 2.x A/AA and best practices), one line each. */
async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    // The page's language is the host's (Regal sets none, see "leaves the host's global styles alone").
    .disableRules(['html-has-lang'])
    .analyze()
  return results.violations
    .filter(violation => violation.impact === 'serious' || violation.impact === 'critical')
    .map(violation => `${violation.id} (${violation.impact}): ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`)
}

/** What has focus: its tag, role, data-book-id and class, for the keyboard flows. */
const focused = (page: Page) => page.evaluate(() => {
  const element = document.activeElement
  return {
    tag: element?.tagName.toLowerCase() ?? '',
    role: element?.getAttribute('role') ?? '',
    bookId: element?.getAttribute('data-book-id') ?? '',
    list: !!element?.classList.contains('regal-book-list__button'),
    // Inside the dialog or the row's Back, the ends of a modal's Tab trap.
    inDialog: !!element?.closest('[role="dialog"], .row-card__back, .row-card__back-slot'),
  }
})

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
    // Nor the playground, its showcase shelf or its covers.
    expect((await fetch('/playground')).status).toBe(404)
    expect((await fetch('/showcase-library.json')).status).toBe(404)
    expect((await fetch('/covers/shelf-01.jpg')).status).toBe(404)
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
    const details = page.getByRole('dialog', { name: 'A Grammar of Small Moons' })
    await details.waitFor({ state: 'visible', timeout: 10_000 })
    expect(await stage.getAttribute('data-picked')).toBe('fx-003')
    expect(await page.locator('.regal-books-stage').locator('.details[role="dialog"]').count()).toBe(1)

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
    expect(await first.locator('.row-card__details').count()).toBe(1)
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
    expect(await page.locator('body > .row-card__details').count()).toBe(1)
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

  it('shows every date whole and never lets two overlap, at any scroll position or card width', async () => {
    const errors: string[] = []
    const page = await createPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(url('/labels'), { waitUntil: 'networkidle' })
    const rows = page.locator('section.row-card')
    // A row's intro waits until it is on screen: bring each in turn.
    for (let index = 0; index < 3; index++) {
      await rows.nth(index).scrollIntoViewIfNeeded()
      await rows.nth(index).locator('.row-focus').waitFor({ state: 'attached', timeout: 15_000 })
    }
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
        for (const date of dates) {
          seen.add(date.text)
          // Whole: the month, year and count inside the card, never cut by its edge (the inset is 6 px; 2 px of slack for the frame).
          expect(date.from, `${name} at ${at ?? 'rest'}: ${date.text} (left)`).toBeGreaterThanOrEqual(4)
          expect(date.to, `${name} at ${at ?? 'rest'}: ${date.text} (right)`).toBeLessThanOrEqual(date.width - 4)
        }
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

  it('plays the row\'s intro once its Spines in view are drawn', async () => {
    const errors: string[] = []
    const page = await createPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(url('/shelf'), { waitUntil: 'networkidle' })
    const row = page.locator('section.row-card')
    await row.waitFor({ state: 'attached', timeout: 15_000 })
    await expect.poll(() => row.evaluate(element => element.className), { timeout: 15_000 }).toContain('row-card--intro-done')
    const marks = await page.evaluate(() => Object.fromEntries(['spines-ready', 'intro-start', 'intro-end']
      .map(name => [name, performance.getEntriesByName(`regal:row:${name}`).map(mark => mark.startTime)])))
    // Once, after the Spines in view are drawn, at most 0.7 s (and a frame or two).
    expect(marks['intro-start']).toHaveLength(1)
    expect(marks['intro-end']).toHaveLength(1)
    expect(marks['intro-start']![0]!).toBeGreaterThanOrEqual(marks['spines-ready']![0]!)
    expect(marks['intro-end']![0]! - marks['intro-start']![0]!).toBeLessThan(1000)
    // Then the Books stand in the card.
    expect(await inkShare(page, row)).toBeGreaterThan(0.1)
    expect(errors).toEqual([])
    await page.close()
  })

  /** Samples the row card every frame from the page's start: its intro state and how visible its labels and scroll bar are. */
  const SAMPLE_ROW = () => {
    const samples: { state: string, hold: boolean, labels: number, bar: number }[] = []
    ;(window as unknown as { __rowSamples: typeof samples }).__rowSamples = samples
    const tick = () => {
      const row = document.querySelector('section.row-card')
      if (row) {
        const state = /row-card--intro-(waiting|playing|done)/.exec(row.className)?.[1] ?? ''
        const opacity = (selector: string) => {
          const element = row.querySelector(selector) ?? document.querySelector(selector)
          return element ? Number.parseFloat(getComputedStyle(element).opacity) : -1
        }
        samples.push({ state, hold: row.classList.contains('row-card--intro-hold'), labels: opacity('.row-card__labels'), bar: opacity('.row-bar') })
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  it('fades the dates, leader lines and scroll bar in once the Books\' intro is done', async () => {
    const errors: string[] = []
    const page = await createPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(SAMPLE_ROW)
    await page.goto(url('/shelf'), { waitUntil: 'networkidle' })
    const row = page.locator('section.row-card')
    await row.waitFor({ state: 'attached', timeout: 15_000 })
    await expect.poll(() => row.evaluate(element => element.className), { timeout: 15_000 }).toContain('row-card--intro-done')
    // Fully in a moment after the intro.
    await expect.poll(() => page.locator('.row-card__labels').first().evaluate(element => Number.parseFloat(getComputedStyle(element).opacity)), { timeout: 5_000 }).toBe(1)
    await expect.poll(() => page.locator('.row-bar').first().evaluate(element => Number.parseFloat(getComputedStyle(element).opacity)), { timeout: 5_000 }).toBe(1)
    expect(await page.locator('.row-card__labels .row-label').count()).toBeGreaterThan(0)

    const samples = await page.evaluate(() => (window as unknown as { __rowSamples: { state: string, hold: boolean, labels: number, bar: number }[] }).__rowSamples)
    const early = samples.filter(sample => sample.hold)
    // Held while it waits and while the Books settle: nothing of the labels shows.
    expect(early.some(sample => sample.state === 'playing')).toBe(true)
    for (const sample of early) {
      expect(sample.labels, `labels while ${sample.state}`).toBeLessThanOrEqual(0.001)
      expect(sample.bar, `scroll bar while ${sample.state}`).toBeLessThanOrEqual(0.001)
    }
    // Never released before the intro plays, and released by the time it is done.
    expect(samples.filter(sample => sample.state === 'waiting').every(sample => sample.hold)).toBe(true)
    expect(samples.filter(sample => sample.state === 'done').every(sample => !sample.hold)).toBe(true)
    // They come in through a short fade (frames are too sparse under software GL to catch it half way).
    for (const selector of ['.row-card__labels', '.row-bar']) {
      const timing = await page.locator(selector).first().evaluate((element) => {
        const style = getComputedStyle(element)
        return { property: style.transitionProperty, seconds: style.transitionDuration.split(',').map(value => Number.parseFloat(value)) }
      })
      expect(timing.property, selector).toContain('opacity')
      expect(Math.max(...timing.seconds), selector).toBeGreaterThanOrEqual(0.15)
      expect(Math.max(...timing.seconds), selector).toBeLessThanOrEqual(0.3)
    }
    expect(errors).toEqual([])
    await page.close()
  })

  it('shows the labels at once under Reduce Motion: no intro, no hold', async () => {
    const errors: string[] = []
    const page = await createPage(undefined, { reducedMotion: 'reduce' })
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(SAMPLE_ROW)
    await page.goto(url('/shelf'), { waitUntil: 'networkidle' })
    const row = page.locator('section.row-card')
    await row.waitFor({ state: 'attached', timeout: 15_000 })
    await expect.poll(() => row.evaluate(element => element.className), { timeout: 15_000 }).toContain('row-card--intro-done')
    const samples = await page.evaluate(() => (window as unknown as { __rowSamples: { state: string, hold: boolean, labels: number, bar: number }[] }).__rowSamples)
    expect(samples.some(sample => sample.state === 'playing')).toBe(false)
    // No fade: as soon as the row is shown, the labels are whole.
    expect(samples.filter(sample => !sample.hold).every(sample => sample.labels === 1 && sample.bar === 1)).toBe(true)
    expect(errors).toEqual([])
    await page.close()
  })

  /** The row's intro state and what the marks say, from a page that loaded `route`. */
  const introMarks = (page: Page) => page.evaluate(() => Object.fromEntries(['spines-ready', 'intro-start', 'intro-end']
    .map(name => [name, performance.getEntriesByName(`regal:row:${name}`).map(mark => mark.startTime)])))

  it('holds a row mounted below the fold at its intro\'s first frame and plays the intro when it scrolls in', async () => {
    const errors: string[] = []
    const page = await createPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(SAMPLE_ROW)
    await page.goto(url('/below'), { waitUntil: 'networkidle' })
    const row = page.locator('section.row-card')
    await row.locator('canvas').waitFor({ state: 'attached', timeout: 15_000 })
    // Mounted off screen: its Spines are drawn meanwhile, nothing plays, nothing shows.
    await expect.poll(async () => (await introMarks(page))['spines-ready']!.length, { timeout: 15_000 }).toBe(1)
    await page.waitForTimeout(3000)
    expect(await row.evaluate(element => element.className)).toContain('row-card--intro-waiting')
    expect((await introMarks(page))['intro-start']).toEqual([])
    expect(await row.evaluate(element => element.classList.contains('row-card--intro-hold'))).toBe(true)

    // Scrolled in, it plays once and the labels follow.
    await row.scrollIntoViewIfNeeded()
    await expect.poll(() => row.evaluate(element => element.className), { timeout: 15_000 }).toContain('row-card--intro-done')
    const marks = await introMarks(page)
    expect(marks['intro-start']).toHaveLength(1)
    expect(marks['intro-end']).toHaveLength(1)
    expect(marks['intro-end']![0]! - marks['intro-start']![0]!).toBeLessThan(1000)
    await expect.poll(() => page.locator('.row-card__labels').first().evaluate(element => Number.parseFloat(getComputedStyle(element).opacity)), { timeout: 5_000 }).toBe(1)
    await page.waitForTimeout(400)
    expect(await inkShare(page, row)).toBeGreaterThan(0.1)
    // Never a frame of Books out of place before: the labels stayed held until it played.
    const samples = await page.evaluate(() => (window as unknown as { __rowSamples: { state: string, hold: boolean, labels: number }[] }).__rowSamples)
    expect(samples.filter(sample => sample.state === 'waiting').every(sample => sample.hold && sample.labels <= 0.001)).toBe(true)
    // Once: scrolling away and back doesn't play it again.
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    await row.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
    expect((await introMarks(page))['intro-start']).toHaveLength(1)
    expect(errors).toEqual([])
    await page.close()
  })

  it('plays a below-the-fold row\'s intro on mount with intro="mount" and has none with intro="none"', async () => {
    for (const mode of ['mount', 'none']) {
      const errors: string[] = []
      const page = await createPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(url(`/below?intro=${mode}`), { waitUntil: 'networkidle' })
      const row = page.locator('section.row-card')
      await row.locator('canvas').waitFor({ state: 'attached', timeout: 15_000 })
      await expect.poll(() => row.evaluate(element => element.className), { timeout: 15_000, message: mode }).toContain('row-card--intro-done')
      const marks = await introMarks(page)
      expect(marks['intro-start'], mode).toHaveLength(mode === 'mount' ? 1 : 0)
      expect(errors).toEqual([])
      await page.close()
    }
  })

  it('has no intro under Reduce Motion even below the fold: the Books and labels just show', async () => {
    const page = await createPage(undefined, { reducedMotion: 'reduce' })
    await page.goto(url('/below'), { waitUntil: 'networkidle' })
    const row = page.locator('section.row-card')
    await row.locator('canvas').waitFor({ state: 'attached', timeout: 15_000 })
    await expect.poll(() => row.evaluate(element => element.className), { timeout: 15_000 }).toContain('row-card--intro-done')
    expect((await introMarks(page))['intro-start']).toEqual([])
    expect(await row.evaluate(element => element.classList.contains('row-card--intro-hold'))).toBe(false)
    await page.close()
  })

  it('shows a preloaded row with its Spines on its first frame', async () => {
    const errors: string[] = []
    const page = await createPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(url('/warm'), { waitUntil: 'networkidle' })
    await page.locator('main[data-warmed]').waitFor({ state: 'attached', timeout: 15_000 })
    const before = await page.evaluate(() => {
      performance.mark('host:to-shelf')
      return { fetches: performance.getEntriesByName('regal:library:fetch').length, warmed: performance.getEntriesByName('regal:preload:done').length }
    })
    expect(before).toEqual({ fetches: 1, warmed: 1 })

    await page.locator('a.warm__shelf').click()
    const row = page.locator('section.row-card')
    await expect.poll(() => row.evaluate(element => element.className).catch(() => ''), { timeout: 15_000 }).toContain('row-card--intro-done')
    const after = await page.evaluate(() => {
      const since = performance.getEntriesByName('host:to-shelf')[0]!.startTime
      const at = (name: string) => performance.getEntriesByName(`regal:${name}`).filter(mark => mark.startTime >= since).map(mark => mark.startTime)
      return { fetches: performance.getEntriesByName('regal:library:fetch').length, spines: at('row:spines-ready'), frame: at('row:first-frame') }
    })
    // The library file isn't fetched again, and the first frame drawn already wears every Spine in view.
    expect(after.fetches).toBe(1)
    expect(after.spines).toHaveLength(1)
    expect(after.spines[0]!).toBeLessThanOrEqual(after.frame[0]!)
    expect(errors).toEqual([])
    await page.close()
  })

  it('asks for the library file again after a failure: the built-in Try again, the host\'s retry(), the row mounted again', async () => {
    /** /retry with the browser's own request for the file failing `failures` times (the server-side one isn't the page's). */
    async function open(failures: number) {
      const page = await createPage()
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      const seen = { requests: 0 }
      await page.route('**/books/library.json', async (route) => {
        if (seen.requests++ < failures) return route.fulfill({ status: 503, body: 'Unavailable' })
        return route.continue()
      })
      await page.goto(url('/retry'), { waitUntil: 'networkidle' })
      await page.locator('.file-error').waitFor({ state: 'visible', timeout: 10_000 })
      expect(await page.locator('.retry__state').getAttribute('data-error')).toBe('yes')
      expect(seen.requests).toBe(1)
      return { page, errors, seen }
    }
    const shown = async (page: Awaited<ReturnType<typeof createPage>>) => {
      const row = page.locator('section.row-card')
      await row.locator('canvas').waitFor({ state: 'attached', timeout: 15_000 })
      expect(await row.getAttribute('data-book-count')).toBe('5')
      expect(await page.locator('.retry__state').getAttribute('data-error')).toBe('no')
      expect(await page.locator('.file-error').count()).toBe(0)
    }

    // The error card's own Try again.
    const built = await open(1)
    await built.page.getByRole('button', { name: 'Try again', exact: true }).click()
    await shown(built.page)
    expect(built.seen.requests).toBe(2)
    // A loaded library stays: the row mounted again makes no request.
    await built.page.getByRole('button', { name: 'Remount the row' }).click()
    await built.page.waitForTimeout(500)
    await shown(built.page)
    expect(built.seen.requests).toBe(2)
    expect(built.errors).toEqual([])
    await built.page.close()

    // The host's own button, through useRegalLibrary().retry(): no state keys to know.
    const own = await open(1)
    await own.page.getByRole('button', { name: 'Host\'s Try again' }).click()
    await shown(own.page)
    expect(own.seen.requests).toBe(2)
    expect(own.errors).toEqual([])
    await own.page.close()

    // The row mounted again (Libellus' Try again) asks anew, and a second failure is asked for once more.
    const remounted = await open(2)
    await remounted.page.getByRole('button', { name: 'Remount the row' }).click()
    await expect.poll(() => remounted.seen.requests, { timeout: 10_000 }).toBe(2)
    await remounted.page.locator('.file-error').waitFor({ state: 'visible', timeout: 10_000 })
    await remounted.page.getByRole('button', { name: 'Remount the row' }).click()
    await shown(remounted.page)
    expect(remounted.seen.requests).toBe(3)
    expect(remounted.errors).toEqual([])
    await remounted.page.close()
  })

  it('lists the Books beside the row and the Stack, for assistive tech, and respects what they show', async () => {
    const page = await createPage()
    await page.goto(url('/profile'), { waitUntil: 'networkidle' })
    const rows = page.locator('section.row-card')
    await rows.first().locator('canvas').waitFor({ state: 'attached', timeout: 15_000 })
    // The row's scroller has a role for its name; the list follows `year`.
    expect(await rows.first().locator('.row-card__scroller').getAttribute('role')).toBe('region')
    expect(await rows.nth(0).locator('.regal-book-list button').count()).toBe(5)
    expect(await rows.nth(1).locator('.regal-book-list button').count()).toBe(2)
    const names = await rows.nth(0).locator('.regal-book-list button').allTextContents()
    expect(names.some(name => /^The Paper Lighthouse, .+, finished [A-Z][a-z]+ \d{4}(, [\d.]+ of 5 stars)?$/.test(name.trim()))).toBe(true)
    // The focus label's stars are drawn only; the rating is a hidden text.
    await rows.first().locator('.row-focus').waitFor({ state: 'attached', timeout: 10_000 })
    expect(await rows.first().locator('.row-focus .title-stars__stars').getAttribute('aria-hidden')).toBe('true')
    expect(await rows.first().locator('.row-focus .regal-visually-hidden').textContent()).toMatch(/^[\d.]+ of 5 stars$/)
    await page.close()

    const stack = await createPage()
    await stack.goto(url('/books'), { waitUntil: 'networkidle' })
    await stack.locator('section[aria-label="Book stack"]').locator('canvas').waitFor({ state: 'attached', timeout: 15_000 })
    expect(await stack.locator('.regal-books-stage .regal-book-list button').count()).toBe(5)
    // The Stack's filters reach the list.
    await stack.locator('.regal-books-sidebar').getByRole('button', { name: '2025', exact: true }).click()
    await expect.poll(() => stack.locator('.regal-books-stage .regal-book-list button').count(), { timeout: 5_000 }).toBe(2)
    await stack.close()

    // Off for a host with its own list.
    const own = await createPage()
    await own.goto(url('/nolist'), { waitUntil: 'networkidle' })
    await own.locator('section.row-card canvas').waitFor({ state: 'attached', timeout: 15_000 })
    expect(await own.locator('.regal-book-list').count()).toBe(0)
    await own.close()
  })

  it('has no serious or critical axe violations on the Row and Stage pages, at rest or with a Book out', async () => {
    const page = await createAxePage()
    await page.goto(url('/profile'), { waitUntil: 'networkidle' })
    const rows = page.locator('section.row-card')
    await rows.first().locator('canvas').waitFor({ state: 'attached', timeout: 15_000 })
    await rows.first().locator('.row-focus').waitFor({ state: 'attached', timeout: 10_000 })
    expect(await seriousViolations(page), 'the row page at rest').toEqual([])

    // Kept in the card.
    await rows.first().locator('.regal-book-list button').first().focus()
    await page.keyboard.press('Enter')
    await rows.first().getByRole('dialog').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(1200)
    expect(await seriousViolations(page), 'the row page with a Book out in the card').toEqual([])
    await page.keyboard.press('Escape')
    await expect.poll(() => rows.first().getAttribute('data-picked'), { timeout: 5_000 }).toBe('')
    await expect.poll(() => rows.first().getByRole('dialog').count(), { timeout: 5_000 }).toBe(0)

    // Broken out: the canvas box is out of the accessibility tree, the dialog is all there is.
    await rows.nth(1).locator('.regal-book-list button').first().focus()
    await page.keyboard.press('Enter')
    await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(1200)
    expect(await seriousViolations(page), 'the row page broken out').toEqual([])
    await page.context().close()

    const stack = await createAxePage()
    await stack.goto(url('/books'), { waitUntil: 'networkidle' })
    const stage = stack.locator('section[aria-label="Book stack"]')
    await stage.locator('canvas').waitFor({ state: 'attached', timeout: 15_000 })
    await expect.poll(() => stage.getAttribute('data-book-count'), { timeout: 10_000 }).toBe('5')
    expect(await seriousViolations(stack), 'the stage page at rest').toEqual([])
    await stage.locator('.regal-book-list button').first().focus()
    await stack.keyboard.press('Enter')
    await stack.getByRole('dialog').waitFor({ state: 'visible', timeout: 10_000 })
    await stack.waitForTimeout(1200)
    expect(await seriousViolations(stack), 'the stage page with a Book out').toEqual([])
    await stack.context().close()
  })

  it('takes a Book out from the list with the keyboard, puts focus in the dialog and gives it back', async () => {
    const errors: string[] = []
    const page = await createPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(url('/profile'), { waitUntil: 'networkidle' })
    const rows = page.locator('section.row-card')
    await rows.first().locator('canvas').waitFor({ state: 'attached', timeout: 15_000 })
    await rows.first().locator('.row-focus').waitFor({ state: 'attached', timeout: 10_000 })

    // Kept in the card: Tab from the scroller to the list, Enter, focus in the dialog, Escape back to that button.
    const first = rows.nth(0)
    await first.locator('.row-card__scroller').focus()
    await page.keyboard.press('Tab')
    const button = await focused(page)
    expect(button.list).toBe(true)
    await page.keyboard.press('ArrowDown')
    const next = await focused(page)
    expect(next.list).toBe(true)
    expect(next.bookId).not.toBe(button.bookId)
    await page.keyboard.press('Enter')
    await expect.poll(() => first.getAttribute('data-picked'), { timeout: 5_000 }).toBe(next.bookId)
    const dialog = first.getByRole('dialog')
    await dialog.waitFor({ state: 'visible', timeout: 10_000 })
    expect(await dialog.getAttribute('aria-modal')).toBeNull()
    await expect.poll(async () => (await focused(page)).role, { timeout: 5_000 }).toBe('dialog')
    await page.keyboard.press('Escape')
    await expect.poll(() => first.getAttribute('data-picked'), { timeout: 5_000 }).toBe('')
    await expect.poll(() => focused(page), { timeout: 5_000 }).toMatchObject({ list: true, bookId: next.bookId })

    // Broken out: a modal. Its canvas is out of the tree, Tab stays in the dialog and Back, Escape gives focus back.
    const second = rows.nth(1)
    await second.locator('.row-card__scroller').focus()
    await page.keyboard.press('Tab')
    const start = await focused(page)
    expect(start.list).toBe(true)
    await page.keyboard.press('Enter')
    await expect.poll(() => second.getAttribute('data-picked'), { timeout: 5_000 }).toBe(start.bookId)
    const modal = page.locator('body > .row-card__details')
    await modal.waitFor({ state: 'visible', timeout: 10_000 })
    expect(await modal.getAttribute('role')).toBe('dialog')
    expect(await modal.getAttribute('aria-modal')).toBe('true')
    expect(await modal.getAttribute('aria-labelledby')).toBeTruthy()
    expect(await page.locator('.row-card__view--out').getAttribute('aria-hidden')).toBe('true')
    await expect.poll(async () => (await focused(page)).role, { timeout: 5_000 }).toBe('dialog')
    for (let step = 0; step < 6; step++) {
      await page.keyboard.press('Tab')
      expect((await focused(page)).inDialog, `Tab ${step + 1}`).toBe(true)
    }
    for (let step = 0; step < 6; step++) {
      await page.keyboard.press('Shift+Tab')
      expect((await focused(page)).inDialog, `Shift+Tab ${step + 1}`).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect.poll(() => page.locator('.row-card__view--out').count(), { timeout: 5_000 }).toBe(0)
    await expect.poll(() => focused(page), { timeout: 5_000 }).toMatchObject({ list: true, bookId: start.bookId })

    expect(errors).toEqual([])
    await page.close()
  })

  it('does the same on the Stage: a list button takes the Book out, focus goes into the card and back', async () => {
    const errors: string[] = []
    const page = await createPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(url('/books'), { waitUntil: 'networkidle' })
    const stage = page.locator('section[aria-label="Book stack"]')
    await stage.locator('canvas').waitFor({ state: 'attached', timeout: 15_000 })
    await expect.poll(() => stage.getAttribute('data-book-count'), { timeout: 10_000 }).toBe('5')

    const buttons = stage.locator('.regal-book-list button')
    await buttons.nth(1).focus()
    expect((await focused(page)).list).toBe(true)
    const bookId = (await focused(page)).bookId
    await page.keyboard.press('Enter')
    await expect.poll(() => stage.getAttribute('data-picked'), { timeout: 5_000 }).toBe(bookId)
    const dialog = page.getByRole('dialog')
    await dialog.waitFor({ state: 'visible', timeout: 10_000 })
    await expect.poll(async () => (await focused(page)).role, { timeout: 10_000 }).toBe('dialog')
    await page.keyboard.press('Escape')
    await expect.poll(() => stage.getAttribute('data-picked'), { timeout: 5_000 }).toBe('')
    await expect.poll(() => focused(page), { timeout: 5_000 }).toMatchObject({ list: true, bookId })

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
