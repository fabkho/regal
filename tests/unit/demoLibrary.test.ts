import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { importLibrary } from '../../shared/library/importLibrary'

const __dirname = dirname(fileURLToPath(import.meta.url))
const demoPath = join(__dirname, '..', '..', 'app', 'assets', 'data', 'demo-library.csv')

describe('demo library', () => {
  it('imports with zero warnings and a healthy mix of statuses', () => {
    const csv = readFileSync(demoPath, 'utf-8')
    const { books, warnings } = importLibrary(csv)

    expect(warnings).toHaveLength(0)
    expect(books.length).toBeGreaterThanOrEqual(35)

    const statuses = new Set(books.map(b => b.status))
    expect(statuses.has('read')).toBe(true)
    expect(statuses.has('currently-reading')).toBe(true)
    expect(statuses.has('to-read')).toBe(true)
    // at least one custom exclusive shelf
    expect([...statuses].some(s => !['read', 'currently-reading', 'to-read'].includes(s))).toBe(true)

    // no real personal data leaked: nothing that looks like private notes content
    expect(books.every(b => b.review === null || b.review.length < 500)).toBe(true)
  })
})
