#!/usr/bin/env node
// Synthetic fronts for the showcase shelf (demo/showcase-library.json): one
// typeset cover per Book, drawn from its own title, author and palette in a
// headless browser. No publisher art: the shelf is public-domain titles with
// invented data (scripts/showcase/shelf.mjs), and these covers are ours.
//
//   node scripts/showcase/covers.mjs   # writes demo/covers/<id>.jpg and sets assets.front
//
// Needs Playwright's Chromium (the e2e tests install it).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const FILE = new URL('../../demo/showcase-library.json', import.meta.url)
const OUT = new URL('../../demo/covers/', import.meta.url)
const library = JSON.parse(readFileSync(FILE, 'utf8'))
mkdirSync(OUT, { recursive: true })

const escape = text => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** Four layouts, by Book, so the shelf doesn't look stamped out. */
function cover(book, index) {
  const { background, text, accent } = book.assets.palette
  const title = escape(book.title)
  const author = escape(book.authors[0] ?? 'Anonymous')
  const series = book.seriesTitle ? `<p class="series">${escape(book.seriesTitle)}</p>` : ''
  const long = book.title.length > 28 ? ' long' : ''
  const layouts = [
    `<div class="frame"><p class="kicker">${escape(book.genre ?? '')}</p><h1 class="title${long}">${title}</h1>${series}<span class="rule"></span><p class="author">${author}</p></div>`,
    `<div class="band"><p class="author">${author}</p></div><h1 class="title big${long}">${title}</h1>${series}<p class="foot">Example Classics</p>`,
    `<div class="initial">${escape(book.title.replace(/^(The|A|An) /, '')[0])}</div><h1 class="title${long}">${title}</h1><p class="author">${author}</p>`,
    `<p class="author top">${author}</p><div class="circle"></div><h1 class="title${long}">${title}</h1>${series}`,
  ]
  return `<!doctype html><html><head><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 600px; height: 900px; background: ${background}; color: ${text}; font-family: Georgia, 'Times New Roman', serif;
    display: flex; flex-direction: column; justify-content: center; padding: 64px 56px; position: relative; overflow: hidden; }
  .title { font-size: 66px; line-height: 1.05; font-weight: 400; font-style: italic; letter-spacing: -0.01em; }
  .title.long { font-size: 52px; }
  .title.big { font-size: 78px; font-style: normal; }
  .title.big.long { font-size: 58px; }
  .author { font-family: 'Courier New', monospace; font-size: 22px; letter-spacing: 0.18em; text-transform: uppercase; }
  .series, .kicker, .foot { font-family: 'Courier New', monospace; font-size: 17px; letter-spacing: 0.16em; text-transform: uppercase; color: ${accent}; margin-top: 18px; }
  .kicker { margin: 0 0 28px; }
  .frame { position: absolute; inset: 28px; border: 3px solid ${accent}; padding: 56px 40px; display: flex; flex-direction: column; justify-content: center; }
  .rule { display: block; width: 96px; height: 3px; background: ${accent}; margin: 36px 0 24px; }
  .band { position: absolute; left: 0; right: 0; top: 0; padding: 44px 56px; background: ${accent}; color: ${background}; }
  .foot { position: absolute; bottom: 52px; left: 56px; }
  .initial { position: absolute; right: -40px; top: -90px; font-size: 640px; line-height: 1; color: ${accent}; opacity: 0.32; font-style: italic; }
  .initial ~ .author { position: absolute; bottom: 60px; left: 56px; }
  .top { position: absolute; top: 60px; left: 56px; }
  .circle { position: absolute; width: 380px; height: 380px; border-radius: 50%; background: ${accent}; opacity: 0.85; right: -90px; top: 150px; }
  .circle ~ .title { position: relative; margin-top: 360px; }
  </style></head><body>${layouts[index % layouts.length]}</body></html>`
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 600, height: 900 } })
for (const [index, book] of library.books.entries()) {
  await page.setContent(cover(book, index))
  const name = `${book.id}.jpg`
  writeFileSync(new URL(name, OUT), await page.screenshot({ type: 'jpeg', quality: 78 }))
  book.assets.front = `covers/${name}`
}
await browser.close()
writeFileSync(FILE, `${JSON.stringify(library, null, 2)}\n`)
console.log(`${library.books.length} covers in demo/covers/`)
