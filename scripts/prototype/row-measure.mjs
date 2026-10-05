// Design round (horizontal Stack), dev only: frame time and memory of the
// prototype rows (/prototype/row/a|b|c) on a mid phone profile: 412 × 915 at
// DPR 2.625, touch, Chrome CPU throttled 4×, the mobile render tier. The GPU
// is the machine's own (headless Chrome on ANGLE/Metal), so GPU-bound numbers
// are optimistic for a phone; CPU-bound ones (JS, layout, draw calls) are not.
//
//   node scripts/prototype/row-measure.mjs --url http://localhost:3130 [--n 100] [--variants a,b,c] [--size small] [--throttle 4]
//
// Per variant: a 6 s scroll from one end of the row to the other (scrollLeft
// driven in rAF, as a fling would), then a Book taken out and put back. Prints
// JSON: frame time p50/p95/max, share of frames over 16.7/33 ms, long tasks,
// JS heap, draw calls, textures and their estimated GPU memory.
import { chromium } from 'playwright-core'

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, list) => (value.startsWith('--') ? [...pairs, [value.slice(2), list[index + 1]?.startsWith('--') ? 'true' : list[index + 1]]] : pairs), []))
const BASE = args.url ?? 'http://localhost:3130'
const N = Number(args.n ?? 100)
const VARIANTS = (args.variants ?? 'a,b,c').split(',')
const SIZE = args.size ?? 'small'
const THROTTLE = Number(args.throttle ?? 4)
const SRC = args.src ? `&src=${args.src}` : ''

const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'],
})

function stats(deltas) {
  const sorted = [...deltas].sort((a, b) => a - b)
  const at = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
  const round = v => Math.round(v * 10) / 10
  return {
    frames: deltas.length,
    p50: round(at(0.5)),
    p95: round(at(0.95)),
    max: round(sorted.at(-1) ?? 0),
    over16: round(100 * deltas.filter(d => d > 17.5).length / Math.max(1, deltas.length)),
    over33: round(100 * deltas.filter(d => d > 34).length / Math.max(1, deltas.length)),
  }
}

const results = []
for (const variant of VARIANTS) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${BASE}/prototype/row/${variant}?only=${SIZE}&n=${N}&quality=mobile${SRC}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__rowCards?.length > 0, null, { timeout: 30_000 })
  await page.waitForTimeout(4000)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  await page.evaluate(() => {
    window.__longTasks = []
    new PerformanceObserver(list => window.__longTasks.push(...list.getEntries().map(entry => entry.duration))).observe({ type: 'longtask', buffered: false })
  })

  // Scroll from one end to the other over 6 s, recording every frame.
  await page.evaluate(() => {
    window.__rowCards.at(-1).stats.loopMs.length = 0
  })
  const scroll = await page.evaluate(() => new Promise((resolve) => {
    const scroller = document.querySelector('.row-card__scroller')
    const max = scroller.scrollWidth - scroller.clientWidth
    const deltas = []
    const start = performance.now()
    let last = start
    window.__longTasks.length = 0
    function frame(now) {
      deltas.push(now - last)
      last = now
      const t = Math.min(1, (now - start) / 6000)
      scroller.scrollLeft = max * (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
      if (t < 1) requestAnimationFrame(frame)
      else resolve({ deltas: deltas.slice(1), max, longTasks: [...window.__longTasks] })
    }
    requestAnimationFrame(frame)
  }))

  const scrollLoop = await page.evaluate(() => [...window.__rowCards.at(-1).stats.loopMs])

  // Take the Book in the middle out, then put it back: record the frames of both.
  const recorder = () => page.evaluate(ms => new Promise((resolve) => {
    const deltas = []
    let last = performance.now()
    const end = last + ms
    function frame(now) {
      deltas.push(now - last)
      last = now
      if (now < end) requestAnimationFrame(frame)
      else resolve(deltas.slice(1))
    }
    requestAnimationFrame(frame)
  }), 1800)
  // Enter takes out the Book in focus (a click could land between two piles).
  await page.locator('.row-card__scroller').focus()
  const pickRecording = recorder()
  await page.keyboard.press('Enter')
  const pickDeltas = await pickRecording
  const picked = await page.locator('.row-card').getAttribute('data-picked')
  const awayRecording = recorder()
  await page.keyboard.press('Escape')
  const awayDeltas = await awayRecording

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  await page.waitForTimeout(500)
  const memory = await page.evaluate(() => {
    const entry = window.__rowScenes.at(-1)
    const textures = new Map()
    // Book meshes carry [cover, back, head, tail, spine, fore-edge].
    const slots = ['front', 'back', 'edges', 'edges', 'spine', 'edges']
    entry.scene.traverse((object) => {
      const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : []
      materials.forEach((material, index) => {
        for (const key of ['map', 'bumpMap']) {
          const texture = material[key]
          const image = texture?.image
          if (!texture || !image) continue
          // Clones share one GPU upload per source.
          const id = texture.source?.uuid ?? texture.uuid
          const w = image.width ?? image.videoWidth ?? 0
          const h = image.height ?? image.videoHeight ?? 0
          textures.set(id, { slot: materials.length === 6 ? slots[index] : 'other', bytes: w * h * 4 * (texture.generateMipmaps === false ? 1 : 4 / 3) })
        }
      })
    })
    const bySlot = {}
    for (const { slot, bytes } of textures.values()) bySlot[slot] = Math.round(((bySlot[slot] ?? 0) + bytes / 1048576) * 10) / 10
    const info = entry.renderer.info
    const card = window.__rowCards.at(-1)
    return {
      books: card.books(),
      drawCalls: card.stats.calls,
      triangles: card.stats.triangles,
      gpuTextures: info.memory.textures,
      textureMB: Math.round([...textures.values()].reduce((sum, { bytes }) => sum + bytes, 0) / 1048576),
      textureMBBySlot: bySlot,
      heapMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
      renderedFrames: card.stats.frames,
    }
  })
  results.push({
    variant,
    size: SIZE,
    n: N,
    throttle: THROTTLE,
    scrollPx: Math.round(scroll.max),
    scroll: stats(scroll.deltas),
    // Main-thread work per frame (the Books' pass and the render calls), under the throttle.
    scrollWork: stats(scrollLoop),
    longTasksDuringScroll: scroll.longTasks.length,
    longestTask: Math.round(Math.max(0, ...scroll.longTasks)),
    pick: { picked: !!picked, ...stats(pickDeltas) },
    putBack: stats(awayDeltas),
    ...memory,
    errors: errors.slice(0, 3),
  })
  await context.close()
}
await browser.close()
console.log(JSON.stringify(results, null, 2))
