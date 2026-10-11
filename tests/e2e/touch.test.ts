import { fileURLToPath } from 'node:url'
import { setup, url } from '@nuxt/test-utils/e2e'
import { chromium, devices, webkit } from 'playwright-core'
import type { Browser, BrowserType, Page } from 'playwright-core'
import { afterAll, describe, expect, it } from 'vitest'

// Who scrolls the row and the Stack under a finger (fabkho/libellus backlog
// #26: on iOS neither moved). Playwright's WebKit is the macOS build with an
// iPhone's viewport and touch: it shows what Regal decides there (no
// Vibration API → the row scrolls natively; the Stack keeps its touchmove)
// and replays the pointer sequences, but it has none of iOS's gesture
// recognisers, so whether iOS still cancels the pointer is for a real
// iPhone to show. Chromium (Pixel 7) runs a real touch swipe through
// Blink's gesture pipeline (CDP), on both paths of the row.
const showcase = '/showcase-library.json'
const browsers: Browser[] = []

async function phone(type: BrowserType, device: string, init?: () => void): Promise<Page> {
  const browser = await type.launch(type === chromium ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {})
  browsers.push(browser)
  const context = await browser.newContext({ ...devices[device] })
  if (init) await context.addInitScript(init)
  return context.newPage()
}

async function openRow(page: Page) {
  await page.goto(url(`/row?src=${showcase}`), { waitUntil: 'networkidle' })
  await page.locator('.row-card__scroller canvas').first().waitFor({ state: 'attached', timeout: 20_000 })
  // Mounted: the decision is made on the client.
  await expect.poll(() => page.locator('.row-card__scroller').first().getAttribute('data-touch'), { timeout: 10_000 }).not.toBeNull()
}

function rowTouch(page: Page) {
  return page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('.row-card__scroller')!
    const canvas = scroller.querySelector('canvas')!
    return { mode: scroller.dataset.touch, scroller: getComputedStyle(scroller).touchAction, canvas: getComputedStyle(canvas).touchAction }
  })
}

/** A real touch swipe leftwards across the first card (Chromium only: CDP); how far the row scrolled. */
async function swipeRow(page: Page) {
  const box = (await page.locator('.row-card__scroller').first().boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  const y = box.y + box.height * 0.45
  const x = box.x + box.width * 0.8
  const before = await page.evaluate(() => document.querySelector('.row-card__scroller')!.scrollLeft)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  for (let step = 1; step <= 15; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * 12, y }] })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(800)
  return await page.evaluate(() => document.querySelector('.row-card__scroller')!.scrollLeft) - before
}

async function openStack(page: Page) {
  await page.goto(url(`/?view=stack&debug=pick&src=${showcase}`), { waitUntil: 'networkidle' })
  await page.waitForFunction(() => (window as { __regalPick?: { clickableBooks: () => unknown[] } }).__regalPick?.clickableBooks().length, null, { timeout: 60_000, polling: 500 })
  await page.waitForFunction(() => (window as { __regalPick?: { idle: () => boolean } }).__regalPick?.idle(), null, { timeout: 30_000, polling: 200 })
}

/**
 * A finger dragged up the Stack's canvas, as synthetic pointer events (`buttons`
 * on its moves as given), then a cancelable touchmove; whether the pile moved
 * (the Books under the finger before are not where they were) and whether the
 * touchmove was cancelled.
 */
function dragStack(page: Page, buttons: number) {
  return page.evaluate(async (buttons) => {
    type Probe = { clickableBooks: () => { id: string, x: number, y: number }[], idle: () => boolean }
    const probe = (window as unknown as { __regalPick: Probe }).__regalPick
    const canvas = document.querySelector<HTMLCanvasElement>('section.stage canvas')!
    const rect = canvas.getBoundingClientRect()
    const before = new Map(probe.clickableBooks().map(book => [book.id, book.y]))
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height * 0.8
    const event = (type: string, at: number, held: number) => new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: at, buttons: held, bubbles: true, cancelable: true, composed: true })
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
    canvas.dispatchEvent(event('pointerdown', y, 1))
    for (let step = 1; step <= 20; step++) {
      canvas.dispatchEvent(event('pointermove', y - step * 10, buttons))
      await frame()
    }
    canvas.dispatchEvent(event('pointerup', y - 200, 0))
    await new Promise(resolve => setTimeout(resolve, 1500))
    const after = probe.clickableBooks()
    const stayed = after.filter(book => before.has(book.id) && Math.abs(before.get(book.id)! - book.y) < 2).length
    // WebKit's macOS build can't construct a Touch; a plain event of the type reaches the same listener.
    const move = new Event('touchmove', { bubbles: true, cancelable: true })
    canvas.dispatchEvent(move)
    return { moved: before.size > 0 && stayed === 0, touchmoveCancelled: move.defaultPrevented }
  }, buttons)
}

describe('touch on a phone: the row and the Stack', async () => {
  await setup({ rootDir: fileURLToPath(new URL('../..', import.meta.url)) })

  afterAll(async () => {
    await Promise.all(browsers.map(browser => browser.close()))
  })

  it('WebKit (iPhone): the row scrolls natively, the Stack keeps the finger', async () => {
    const page = await phone(webkit, 'iPhone 15')
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))

    await openRow(page)
    expect(await page.evaluate(() => typeof navigator.vibrate)).toBe('undefined')
    expect(await rowTouch(page)).toEqual({ mode: 'native', scroller: 'pan-x pan-y', canvas: 'pan-x pan-y' })

    await openStack(page)
    expect(await page.locator('section.stage canvas').evaluate(canvas => getComputedStyle(canvas).touchAction)).toBe('none')
    // A touch pointermove reporting no button (buttons 0) keeps the drag: it ends with pointerup or pointercancel.
    expect(await dragStack(page, 0)).toEqual({ moved: true, touchmoveCancelled: true })
    expect(errors).toEqual([])
  })

  it('Chromium (Android): the row drags itself, a real swipe scrolls it; without vibrate it scrolls natively', async () => {
    const android = await phone(chromium, 'Pixel 7')
    await openRow(android)
    expect(await rowTouch(android)).toEqual({ mode: 'drag', scroller: 'pan-y', canvas: 'pan-y' })
    expect(await swipeRow(android)).toBeGreaterThan(80)

    const noVibrate = await phone(chromium, 'Pixel 7', () => {
      delete (Navigator.prototype as { vibrate?: unknown }).vibrate
    })
    await openRow(noVibrate)
    expect(await rowTouch(noVibrate)).toEqual({ mode: 'native', scroller: 'pan-x pan-y', canvas: 'pan-x pan-y' })
    expect(await swipeRow(noVibrate)).toBeGreaterThan(80)

    await openStack(android)
    expect(await dragStack(android, 1)).toEqual({ moved: true, touchmoveCancelled: true })
  })
})
