#!/usr/bin/env node
// README screenshots, from the playground (synthetic showcase shelf, drawn
// covers: no publisher art). Run against Regal's own site:
//
//   pnpm dev   (or a static build: NUXT_APP_BASE_URL=/regal/ pnpm generate, served under /regal/)
//   node scripts/showcase/shots.mjs http://localhost:3000/
//
// Writes docs/assets/{stack,phone-sheet,row,row-inspect,playground}.jpg at 2× (Playwright's Chromium;
// JPEG: the paper grain makes PNGs of several MB).
import { chromium } from 'playwright-core'

const site = (process.argv[2] ?? 'http://localhost:3000/').replace(/\/*$/, '/')
const out = name => new URL(`../../docs/assets/${name}.jpg`, import.meta.url).pathname

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })

async function shoot(name, path, { width, height, pick, clip, wait = 4500 }) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  await page.goto(`${site}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(wait)
  if (pick) {
    const [x, y] = typeof pick === 'function' ? pick(width, height) : pick
    await page.mouse.click(x, y)
    await page.waitForTimeout(3000)
  }
  const box = clip ? await page.locator(clip).first().boundingBox() : null
  const pad = 24
  await page.screenshot({
    path: out(name),
    type: 'jpeg',
    quality: 82,
    ...(box ? { clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: Math.min(width, box.width + pad * 2), height: box.height + pad * 2 } } : {}),
  })
  await page.close()
  console.log(`docs/assets/${name}.jpg`)
}

// The Stage with the sidebar, a Book taken out (the host page of the portfolio's /books).
await shoot('stack', 'playground?frame=1', { width: 1400, height: 860, pick: (w, h) => [(w - 336) / 2, h * 0.62] })
// A phone: the filter bar, a Book out, its details as the bottom sheet.
await shoot('phone-sheet', 'playground?frame=1&sidebar=0&bar=1', { width: 390, height: 800, pick: (w, h) => [w / 2, h * 0.55] })
// The row in a card, at rest and with a Book taken out in the card.
await shoot('row', 'playground?frame=1&c=row', { width: 1000, height: 560, clip: '.preview__row' })
await shoot('row-inspect', 'playground?frame=1&c=row', { width: 1000, height: 560, clip: '.preview__row', pick: (w, h) => [w * 0.45, h * 0.52] })
// The playground itself, Night tokens.
await shoot('playground', 'playground?theme=dark&tokens=night', { width: 1440, height: 900, pick: (w, h) => [(w - 384 - 336) / 2, h * 0.62] })

await browser.close()
