// Dev only: stores the owner's design picks (see useDevChoices) in
// .data/choices.json, readable outside the browser.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404 })
  const body = await readBody<Record<string, unknown>>(event)
  const dir = join(process.cwd(), '.data')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'choices.json'), `${JSON.stringify(body, null, 2)}\n`)
  return { ok: true }
})
