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

    const stage = page.locator('section.stage')
    await page.getByRole('button', { name: /^Frankenstein/ }).click()
    const details = page.getByRole('dialog', { name: 'Frankenstein' })
    await details.waitFor({ state: 'visible', timeout: 10_000 })
    expect(await stage.getAttribute('data-picked')).toBe('demo-02')
    expect(await details.textContent()).toContain('Mary Shelley')
    // The blurb comes from the library file.
    expect(await details.textContent()).toContain('A young scientist builds a living being')

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

    await page.getByRole('button', { name: 'Stack', exact: true }).click()
    const stage = page.locator('section[aria-label="Book stack"]')
    await expect.poll(async () => stage.getAttribute('data-view'), { timeout: 10_000 }).toBe('stack')
    expect(await stage.getAttribute('data-book-count')).toBe('8')
    await expect.poll(() => page.url(), { timeout: 5_000 }).toContain('view=stack')

    await page.getByRole('button', { name: /^Good Omens/ }).click()
    await page.getByRole('dialog', { name: 'Good Omens' }).waitFor({ state: 'visible', timeout: 10_000 })
    await page.getByRole('button', { name: /put back/i }).click()
    await page.getByRole('dialog', { name: 'Good Omens' }).waitFor({ state: 'detached', timeout: 10_000 })
    await page.close()
  })

  it('clicks in the 3D after re-sorts: picks with a wobbly press, puts back beside the Book', async () => {
    type Probe = {
      state: () => { bookId: string | null, face: string }
      policy: () => string
      hitAt: (x: number, y: number) => string | null
      clickableBooks: () => { id: string, x: number, y: number }[]
      emptyPoints: () => { x: number, y: number }[]
      idle: (ms?: number) => boolean
    }
    type ProbeWindow = { __regalPick: Probe }
    const errors: string[] = []
    const page = await createPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(url('/?view=stack&debug=pick'), { waitUntil: 'networkidle' })
    await page.waitForFunction(() => (window as unknown as ProbeWindow).__regalPick?.clickableBooks().length > 0, null, { timeout: 30_000 })
    const settle = () => page.waitForFunction(() => (window as unknown as ProbeWindow).__regalPick.idle(250), null, { timeout: 20_000 })
    const state = () => page.evaluate(() => (window as unknown as ProbeWindow).__regalPick.state())

    // Every re-sort re-renders the Book meshes; that used to add another click
    // handler per Book, so a click ran twice (opened on the back) or three times.
    const sort = page.getByRole('group', { name: 'Sort' }).getByRole('button')
    await sort.nth(1).click()
    await settle()
    await sort.nth(2).click()
    await settle()

    const [book] = await page.evaluate(() => (window as unknown as ProbeWindow).__regalPick.clickableBooks())
    expect(book).toBeTruthy()
    await page.mouse.move(book!.x, book!.y, { steps: 4 })
    await settle()
    const target = await page.evaluate(([x, y]) => (window as unknown as ProbeWindow).__regalPick.hitAt(x!, y!), [book!.x, book!.y])
    // A press with two pixels of wobble is still a click.
    await page.mouse.down()
    await page.mouse.move(book!.x + 2, book!.y + 1)
    await page.mouse.up()
    await expect.poll(state, { timeout: 5_000 }).toEqual({ bookId: target, face: 'front' })

    // The Book flies off; clicking where it was, without moving, hits what is there now.
    await settle()
    const there = await page.evaluate(([x, y]) => (window as unknown as ProbeWindow).__regalPick.hitAt(x!, y!), [book!.x + 2, book!.y + 1])
    const policy = await page.evaluate(() => (window as unknown as ProbeWindow).__regalPick.policy())
    await page.mouse.down()
    await page.mouse.up()
    const expected = there === target
      ? { bookId: target, face: 'back' }
      : there && policy === 'swap' ? { bookId: there, face: 'front' } : { bookId: null, face: 'front' }
    await expect.poll(state, { timeout: 5_000 }).toEqual(expected)
    if (expected.bookId) {
      await page.keyboard.press('Escape')
      await expect.poll(state, { timeout: 5_000 }).toEqual({ bookId: null, face: 'front' })
    }

    // Take it out again and put it back with a slow click on empty space.
    await page.mouse.move(book!.x, book!.y, { steps: 2 })
    await settle()
    const again = await page.evaluate(([x, y]) => (window as unknown as ProbeWindow).__regalPick.hitAt(x!, y!), [book!.x, book!.y])
    await page.mouse.down()
    await page.mouse.up()
    await expect.poll(state, { timeout: 5_000 }).toEqual({ bookId: again, face: 'front' })
    await settle()
    const empty = await page.evaluate(() => (window as unknown as ProbeWindow).__regalPick.emptyPoints())
    expect(empty.length).toBeGreaterThan(0)
    await page.mouse.move(empty[0]!.x, empty[0]!.y, { steps: 2 })
    await page.mouse.down()
    await page.waitForTimeout(500)
    await page.mouse.up()
    await expect.poll(state, { timeout: 5_000 }).toEqual({ bookId: null, face: 'front' })
    expect(errors).toEqual([])
    await page.close()
  })
})
