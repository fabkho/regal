// Small helpers shared by Regal assets' steps.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')

/** Drops null, undefined and empty objects/arrays: the library file leaves out what's unknown. */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item != null
    && !(Array.isArray(item) && !item.length)
    && !(typeof item === 'object' && !Array.isArray(item) && !Object.keys(item).length))) as T
}

/** JSON with sorted object keys, so equal data hashes equally. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => (item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item))
}

let writes = 0

/** Writes a file only when its content differs (keeps mtimes, so derived copies stay fresh); returns whether it wrote. */
export function writeIfChanged(path: string, content: Buffer | string): boolean {
  const bytes = typeof content === 'string' ? Buffer.from(content) : content
  if (existsSync(path) && readFileSync(path).equals(bytes)) return false
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${process.pid}-${++writes}`
  writeFileSync(tmp, bytes)
  renameSync(tmp, path)
  return true
}

/** Runs `task` over `items` with at most `limit` at a time, results in input order. */
export async function pool<T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length })
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await task(items[index]!, index)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return results
}

export const isHttpUrl = (value: string) => /^https?:\/\//i.test(value)
