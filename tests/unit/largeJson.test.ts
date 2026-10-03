import { describe, expect, it } from 'vitest'
import { parseLargeJson } from '../../scripts/assets/largeJson'

describe('parseLargeJson', () => {
  it('parses ordinary JSON unchanged', () => {
    const json = { a: 'x', b: [1, 2, { c: 'he said \\"hi\\"' }], d: null }
    const { value } = parseLargeJson(Buffer.from(JSON.stringify(json)), 4)
    expect(value).toEqual(json)
  })

  it('cuts long strings out and gives their bytes back', () => {
    const image = Buffer.alloc(3000, 7).toString('base64')
    const json = { items: [{ data: image, key: 'one' }, { data: 'short', key: 'two' }] }
    const large = parseLargeJson(Buffer.from(JSON.stringify(json)), 100)
    const items = (large.value as typeof json).items
    expect(items[0]!.data).not.toBe(image)
    expect(items[0]!.key).toBe('one')
    expect(large.bytes(items[0]!.data)!.toString('latin1')).toBe(image)
    expect(large.text(items[0]!.data)).toBe(image)
    expect(large.bytes(items[1]!.data)).toBeNull()
    expect(large.text(items[1]!.data)).toBe('short')
  })

  it('keeps escaped quotes and backslashes inside strings', () => {
    const json = { path: 'C:\\dir\\', quote: '"', long: 'a'.repeat(200) }
    const large = parseLargeJson(Buffer.from(JSON.stringify(json)), 100)
    const value = large.value as typeof json
    expect(value.path).toBe('C:\\dir\\')
    expect(value.quote).toBe('"')
    expect(large.text(value.long)).toBe(json.long)
  })
})
