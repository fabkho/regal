#!/usr/bin/env node
// Fuzzes the Pick interaction in a real browser: random sequences of clicks on
// Books and on empty space (quick, slow, with a pixel of jitter, without
// moving after a scroll), drags, wheel scrolls, Escape, the flip button,
// re-sorts and filter changes mid-animation, rapid double clicks. After each
// checked step it compares the Pick state with what the click should have
// done to whatever was under the pointer at that moment.
//
// Needs a running Regal (dev or preview) and the ?debug=pick probe
// (components/books/PickProbe.vue):
//
//   node scripts/pick-fuzz.mjs --url http://localhost:3000 --seeds 1,2,3 --steps 200
//   options: --view stack|bookcase  --src <library file URL>  --headed  --stop-on-fail
//   (--src: any Regal library file through the viewer's ?src=; default: the
//   site's own librarySrc, the demo library)
import { chromium } from 'playwright-core'

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, all) => {
  if (!arg.startsWith('--')) return pairs
  const next = all[index + 1]
  pairs.push([arg.slice(2), next && !next.startsWith('--') ? next : true])
  return pairs
}, []))
const BASE = String(args.url ?? 'http://localhost:3000').replace(/\/$/, '')
const SEEDS = String(args.seeds ?? '1').split(',').map(Number)
const STEPS = Number(args.steps ?? 100)
const VIEW = args.view ?? 'stack'
const SRC = typeof args.src === 'string' ? args.src : null

/** Deterministic PRNG so a failing seed replays. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SHELVED = { bookId: null, face: 'front' }
/** What a click on `hit` (a Book id, or null for empty space) does, given the policy the probe reports. */
function expectedAfterClick(state, hit, policy) {
  if (!hit) return SHELVED
  if (state.bookId && state.bookId !== hit && policy === 'put-back') return SHELVED
  if (state.bookId !== hit) return { bookId: hit, face: 'front' }
  if (state.face === 'front') return { bookId: hit, face: 'back' }
  return SHELVED
}
const same = (a, b) => a.bookId === b.bookId && a.face === b.face
const show = state => (state.bookId ? `${state.bookId}/${state.face}` : 'shelved')

async function run(seed) {
  const random = mulberry32(seed)
  const pick = list => list[Math.floor(random() * list.length)]
  const browser = await chromium.launch({
    headless: !args.headed,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const errors = []
  let currentStep = 0
  page.on('pageerror', error => errors.push(error.message))
  if (args.trace) {
    page.on('framenavigated', frame => frame === page.mainFrame() && console.log(`seed ${seed} step ${currentStep}: navigated to ${frame.url()}`))
    page.on('load', () => console.log(`seed ${seed} step ${currentStep}: page load`))
    page.on('crash', () => console.log(`seed ${seed} step ${currentStep}: page crashed`))
    page.on('console', message => ['error', 'warning'].includes(message.type()) && console.log(`seed ${seed}: console ${message.type()}: ${message.text().slice(0, 300)}`))
  }
  const src = SRC ? `&src=${encodeURIComponent(SRC)}` : ''
  await page.goto(`${BASE}/?view=${VIEW}&debug=pick${src}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__regalPick?.clickableBooks().length > 0, null, { timeout: 30_000 })

  const probe = (name, ...rest) => page.evaluate(([fn, params]) => window.__regalPick[fn](...params), [name, rest])
  const state = () => probe('state')
  const policy = () => page.evaluate(() => window.__regalPick.policy?.() ?? 'swap')
  async function settle(timeout = 10_000) {
    await page.waitForFunction(() => window.__regalPick.idle(250), null, { timeout }).catch(() => {})
  }
  const pointer = { x: 640, y: 400 }
  async function moveTo(x, y, steps = 4) {
    await page.mouse.move(x, y, { steps })
    pointer.x = x
    pointer.y = y
  }
  /** One press: `hold` ms down, `jitter` px of wobble while down. */
  async function press({ hold = 40, jitter = 0 } = {}) {
    await page.mouse.down()
    if (jitter) await page.mouse.move(pointer.x + jitter, pointer.y + (jitter > 1 ? 1 : 0))
    await page.waitForTimeout(hold)
    await page.mouse.up()
    if (jitter) await page.mouse.move(pointer.x, pointer.y)
  }
  async function expectState(expected, label) {
    // Events reach the scene on its next frame; give a few.
    const deadline = Date.now() + 1500
    let current = await state()
    while (!same(current, expected) && Date.now() < deadline) {
      await page.waitForTimeout(50)
      current = await state()
    }
    return same(current, expected) ? null : `${label}: expected ${show(expected)}, got ${show(current)}`
  }

  const history = []
  let probeLost = false
  const failures = []

  /** A checked click at the pointer: settled scene, so what's under the pointer is unambiguous. */
  async function checkedClick(label, options) {
    await settle()
    const before = await state()
    const hit = await probe('hitAt', pointer.x, pointer.y)
    const onCanvas = await probe('canvasAt', pointer.x, pointer.y)
    if (!onCanvas) return `${label} skipped (pointer not on the canvas)`
    const shoot = Number(args.shot) === currentStep
    if (shoot) await page.screenshot({ path: `/tmp/pick-fuzz-${seed}-${currentStep}-before.png` })
    await press(options)
    if (shoot) await page.screenshot({ path: `/tmp/pick-fuzz-${seed}-${currentStep}-after.png` })
    const expected = expectedAfterClick(before, hit, await policy())
    const failure = await expectState(expected, `${label} on ${hit ?? 'empty space'} from ${show(before)}`)
    if (failure) return { failure: `${failure} (changes: ${(await probe('changes')).slice(-3).map(c => c.state).join(' → ')}; last click: ${JSON.stringify(await probe('lastClick'))}; pointers: ${JSON.stringify(await probe('pointers'))})` }
    return `${label} on ${hit ?? 'empty'} → ${show(expected)}`
  }

  const ACTIONS = [
    ['click-book', 6, async () => {
      await settle()
      const books = await probe('clickableBooks')
      if (!books.length) return 'no clickable book'
      const target = pick(books)
      await moveTo(target.x, target.y)
      return checkedClick('click book')
    }],
    ['click-empty', 4, async () => {
      await settle()
      const points = await probe('emptyPoints')
      if (!points.length) return 'no empty point'
      const target = pick(points)
      await moveTo(target.x, target.y)
      return checkedClick('click empty')
    }],
    ['jitter-click', 4, async () => {
      await settle()
      const books = random() < 0.6 ? await probe('clickableBooks') : await probe('emptyPoints')
      if (!books.length) return 'nothing to click'
      const target = pick(books)
      await moveTo(target.x, target.y)
      const jitter = 1 + Math.floor(random() * 3)
      return checkedClick(`click with ${jitter}px jitter`, { jitter })
    }],
    ['slow-click', 3, async () => {
      await settle()
      const books = random() < 0.6 ? await probe('clickableBooks') : await probe('emptyPoints')
      if (!books.length) return 'nothing to click'
      const target = pick(books)
      await moveTo(target.x, target.y)
      const hold = 350 + Math.floor(random() * 400)
      return checkedClick(`slow click (${hold} ms)`, { hold })
    }],
    ['click-same-spot', 3, async () => checkedClick('click without moving')],
    ['wheel-then-click', 3, async () => {
      // Scroll the Stack under a still pointer, then click right there.
      await page.mouse.wheel(0, (random() < 0.5 ? -1 : 1) * (80 + Math.floor(random() * 240)))
      return checkedClick('click after wheel')
    }],
    ['drag', 3, async () => {
      await settle()
      const before = await state()
      // Stay on the canvas: a pointer wandering off would click page controls.
      const box = await page.locator('canvas').first().boundingBox()
      const clamp = (value, low, high) => Math.min(Math.max(value, low + 10), high - 10)
      const dx = Math.round(clamp(pointer.x + (random() - 0.5) * 240, box.x, box.x + box.width) - pointer.x)
      const dy = Math.round(clamp(pointer.y + (random() - 0.5) * 200, box.y, box.y + box.height) - pointer.y)
      await page.mouse.down()
      await page.mouse.move(pointer.x + dx, pointer.y + dy, { steps: 6 })
      await page.mouse.up()
      pointer.x += dx
      pointer.y += dy
      const failure = await expectState(before, `drag ${dx},${dy} from ${show(before)}`)
      return failure ? { failure } : `drag ${dx},${dy}`
    }],
    ['escape', 2, async () => {
      await page.keyboard.press('Escape')
      const failure = await expectState(SHELVED, 'Escape')
      return failure ? { failure } : 'Escape'
    }],
    ['flip-button', 2, async () => {
      const button = page.getByRole('button', { name: /show (back|front)/i })
      const before = await state()
      // The card fades out after a put-back: its button shows but goes.
      if (!before.bookId || !(await button.isVisible().catch(() => false))) return 'no flip button'
      await button.click()
      // Playwright moved the mouse to the button; bring it back where we think it is.
      await page.mouse.move(pointer.x, pointer.y)
      // The card may still be fading out after a put-back: flipping then does nothing.
      const expected = before.bookId ? { ...before, face: before.face === 'front' ? 'back' : 'front' } : before
      const failure = await expectState(expected, 'flip button')
      return failure ? { failure } : 'flip button'
    }],
    // Noise: things that happen mid-animation, not checked themselves.
    ['re-sort', 2, async () => {
      const chips = page.getByRole('group', { name: random() < 0.6 ? 'Sort' : 'Minimum rating' }).getByRole('button')
      const count = await chips.count()
      if (!count) return 'no controls'
      const chip = chips.nth(Math.floor(random() * count))
      if (!(await chip.isVisible().catch(() => false))) return 'controls hidden'
      await chip.click()
      await page.mouse.move(pointer.x, pointer.y)
      return `re-sort/filter: ${(await chip.textContent())?.trim()}`
    }],
    ['click-mid-motion', 3, async () => {
      const books = await probe('clickableBooks')
      if (!books.length) return 'no clickable book'
      const target = pick(books)
      await moveTo(target.x, target.y, 1)
      await press()
      return 'click mid-motion'
    }],
    ['double-click', 2, async () => {
      if (!(await probe('canvasAt', pointer.x, pointer.y))) return 'double click off the canvas skipped'
      await page.mouse.dblclick(pointer.x, pointer.y)
      return 'double click'
    }],
    ['wheel', 2, async () => {
      await page.mouse.wheel(0, (random() < 0.5 ? -1 : 1) * (60 + Math.floor(random() * 300)))
      return 'wheel'
    }],
  ]
  const weighted = ACTIONS.flatMap(([name, weight, fn]) => Array.from({ length: weight }, () => [name, fn]))

  for (let step = 0; step < STEPS; step++) {
    currentStep = step
    const [name, fn] = pick(weighted)
    let result
    try {
      result = await fn()
    }
    catch (error) {
      if (args.trace && !probeLost && /reading '/.test(error.message)) {
        probeLost = true
        const file = `/tmp/pick-fuzz-lost-${seed}-${step}.png`
        await page.screenshot({ path: file }).catch(() => {})
        console.log(`seed ${seed} step ${step}: probe gone at ${page.url()}, canvases: ${await page.locator('canvas').count()}, screenshot ${file}`)
      }
      result = { failure: `${name} threw: ${error.message.split('\n').slice(0, args.verbose ? 12 : 1).join(' | ')}` }
    }
    const line = typeof result === 'string' ? result : `FAIL ${result.failure}`
    history.push(`${String(step).padStart(3)} ${line}`)
    if (typeof result !== 'string') {
      failures.push({ step, failure: result.failure, sequence: history.slice(-8) })
      console.log(`seed ${seed} step ${step}: ${result.failure}`)
      if (args['stop-on-fail']) break
    }
    if (args.verbose) console.log(`seed ${seed} ${history.at(-1)}`)
  }
  await browser.close()
  return { seed, failures, errors }
}

let failed = 0
for (const seed of SEEDS) {
  const started = Date.now()
  const { failures, errors } = await run(seed)
  failed += failures.length + errors.length
  console.log(`seed ${seed}: ${STEPS} steps, ${failures.length} failures, ${errors.length} page errors (${Math.round((Date.now() - started) / 1000)} s)`)
  for (const { failure, sequence } of failures) {
    console.log(`  ✗ ${failure}\n    ${sequence.join('\n    ')}`)
  }
  for (const error of errors) console.log(`  page error: ${error}`)
}
process.exit(failed ? 1 : 0)
