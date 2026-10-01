// Dev only: the owner's saved design picks (.data/choices.json), so the panel
// and the file stay in step even when picks are recorded outside the browser.
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default defineEventHandler(async () => {
  if (!import.meta.dev) throw createError({ statusCode: 404 })
  try {
    return JSON.parse(await readFile(join(process.cwd(), '.data', 'choices.json'), 'utf8'))
  }
  catch {
    return null
  }
})
