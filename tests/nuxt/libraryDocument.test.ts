// An in-memory library (useRegalLibrary's `library`, RegalBooksStage's and
// RegalBooksRow's `library` prop): shown at once, nothing fetched; a new
// document shows again; a component given nothing shows what is shown.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, nextTick, shallowRef } from 'vue'
import { clearLibraryFiles } from '#layers/regal/app/utils/library/libraryCache'
import { useLibrary, useRegalLibrary, useState } from '#imports'

const DEMO = JSON.parse(readFileSync(join(import.meta.dirname, '../../tests/fixtures/library-file/demo.json'), 'utf8'))

const document = shallowRef<Record<string, unknown> | null>(null)

const WithDocument = defineComponent({
  setup() {
    const api = useRegalLibrary(undefined, { library: () => document.value })
    return () => h('div', api.error.value ? 'error' : `${api.books.value.length} books`)
  },
})
const Plain = defineComponent({
  setup() {
    const api = useRegalLibrary()
    return () => h('div', `${api.books.value.length} books`)
  },
})

beforeEach(() => {
  clearLibraryFiles()
  useState('regal:library-loaded').value = null
  useLibrary().fail({ message: 'reset', details: [], more: 0 }, null)
  useLibrary().error.value = null
})
afterEach(() => vi.unstubAllGlobals())

describe('useRegalLibrary with a library document', () => {
  it('shows it in its first render and fetches nothing', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    document.value = { ...DEMO }
    const host = await mountSuspended(WithDocument)
    expect(host.text()).toBe(`${DEMO.books.length} books`)
    expect(useLibrary().source.value?.src).toMatch(/^regal-memory:/)
    await nextTick()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('shows a new document when the host gives one', async () => {
    vi.stubGlobal('fetch', vi.fn())
    document.value = { ...DEMO }
    const host = await mountSuspended(WithDocument)
    document.value = { ...DEMO, books: DEMO.books.slice(0, 2) }
    await vi.waitFor(() => expect(host.text()).toBe('2 books'))
  })

  it('says why an invalid document cannot be shown', async () => {
    vi.stubGlobal('fetch', vi.fn())
    document.value = { version: 2, books: 'none' }
    const host = await mountSuspended(WithDocument)
    expect(host.text()).toBe('error')
  })

  it('shows once however many components are given the same document', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    document.value = { ...DEMO }
    const first = await mountSuspended(WithDocument)
    const shown = useLibrary().books.value
    const second = await mountSuspended(WithDocument)
    await nextTick()
    expect(second.text()).toBe(first.text())
    // Not read again: the very same Books.
    expect(useLibrary().books.value).toBe(shown)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('leaves a component given nothing to the configured file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(DEMO), { status: 200 })))
    document.value = { ...DEMO, books: DEMO.books.slice(0, 1) }
    await mountSuspended(WithDocument)
    const plain = await mountSuspended(Plain)
    // The layer's own config names a file: that one (the demo's), not the document's single Book.
    await vi.waitFor(() => expect(plain.text()).toBe(`${DEMO.books.length} books`))
  })
})
