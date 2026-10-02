import { describe, expect, it } from 'vitest'
import type { Book } from '../../shared/types/book'
import { layoutStack, SEPARATOR_THICKNESS as DEFAULT_THICKNESS } from '../../app/utils/stack/layout'
import { applyStackView, DEFAULT_STACK_VIEW, stackGroups } from '../../app/utils/stack/view'
import { labelEm, MONO_ADVANCE, MONO_CAP, SEPARATOR_THICKNESS, separatorRoom } from '../../app/utils/stack/separators'

const book = (id: string, overrides: Partial<Book>): Book => ({
  id, title: id, seriesTitle: null, author: null, additionalAuthors: [], isbn10: null, isbn13: null, pages: 300, binding: null,
  yearPublished: null, originalYear: null, rating: 0, status: 'read', tags: [], dateRead: null, dateAdded: null,
  review: null, reviewHasSpoiler: false, readCount: 1, ...overrides,
})

const books = applyStackView([
  book('a', { dateRead: '2026-05-01', pages: 400 }),
  book('b', { dateRead: '2026-02-01', pages: 120 }),
  book('c', { dateRead: '2025-11-01', pages: 800 }),
  book('d', { dateRead: '2025-03-01' }),
  book('e', { dateRead: '2024-07-01' }),
  book('f', { dateRead: null }),
], DEFAULT_STACK_VIEW)

describe('layoutStack with date separators', () => {
  const plain = layoutStack(books, { keepOrder: true })
  const groups = stackGroups(books, 'year')
  const grouped = layoutStack(books, { keepOrder: true, groups, separatorThickness: 0.014 })

  it('puts one separator under each group, bottom first', () => {
    expect(plain.separators).toEqual([])
    expect(grouped.separators.map(separator => separator.label)).toEqual(['UNDATED', '2024', '2025', '2026'])
    expect(grouped.separators.map(separator => separator.count)).toEqual([1, 1, 2, 2])
    // The bottom one lies on the floor.
    expect(grouped.separators[0]!.y - grouped.separators[0]!.thickness / 2).toBeCloseTo(0)
  })

  it('reserves room: nothing overlaps and the pile grows by the separators', () => {
    const items = [
      ...grouped.poses.map(pose => ({ y: pose.y, half: pose.thickness / 2 })),
      ...grouped.separators.map(separator => ({ y: separator.y, half: separator.thickness / 2 })),
    ].sort((a, b) => a.y - b.y)
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.y - items[i]!.half).toBeGreaterThanOrEqual(items[i - 1]!.y + items[i - 1]!.half - 1e-9)
    }
    expect(grouped.height).toBeGreaterThanOrEqual(plain.height + 4 * 0.014 - 1e-9)
    expect(grouped.height).toBeLessThan(plain.height + 4 * 0.016)
  })

  it('rests each group on its own separator', () => {
    const yOf = (id: string) => grouped.poses.find(pose => pose.bookId === id)!.y
    const separator = (label: string) => grouped.separators.find(item => item.label === label)!
    // 2025: c and d lie above the 2025 separator and below the 2026 one.
    for (const id of ['c', 'd']) {
      expect(yOf(id)).toBeGreaterThan(separator('2025').y)
      expect(yOf(id)).toBeLessThan(separator('2026').y)
    }
    // Same x/z/rotation as without separators: only the heights move.
    for (const pose of grouped.poses) {
      const other = plain.poses.find(item => item.bookId === pose.bookId)!
      expect([pose.x, pose.z, pose.rotation]).toEqual([other.x, other.z, other.rotation])
    }
  })

  it('uses a default thickness and a per-look one', () => {
    expect(layoutStack(books, { keepOrder: true, groups }).separators[0]!.thickness).toBe(DEFAULT_THICKNESS)
    expect(SEPARATOR_THICKNESS.numerals).toBeLessThan(SEPARATOR_THICKNESS.slab)
  })
})

describe('separator labels', () => {
  it('measures the free room above each separator', () => {
    const separators = [
      { key: 'a', y: 0.005, thickness: 0.01 },
      { key: 'b', y: 0.105, thickness: 0.01 },
    ]
    const room = separatorRoom(separators, 0.3)
    expect(room.get('a')).toBeCloseTo(0.09)
    expect(room.get('b')).toBeCloseTo(0.3 + 0.02 - 0.11)
  })

  it('sizes a date to the widest and tallest it may be', () => {
    const big = labelEm('2025', { maxCap: 0.03, maxWidth: 0.15, room: 1 })
    expect(big * MONO_CAP).toBeCloseTo(0.03)
    const long = labelEm('MAR 2026', { maxCap: 0.03, maxWidth: 0.15, room: 1 })
    expect(long * MONO_ADVANCE * 8).toBeCloseTo(0.15)
    const cramped = labelEm('2025', { maxCap: 0.03, maxWidth: 0.15, room: 0.01 })
    expect(cramped * MONO_CAP).toBeLessThan(0.01)
    expect(labelEm('2025', { maxCap: 0.03, maxWidth: 0.15, room: 0, minCap: 0.007 }) * MONO_CAP).toBeCloseTo(0.007)
  })
})
