// A failed library load is never kept as the answer (useRegalLibrary): the next
// mount, or retry(), asks again; a library that loaded is kept for the page.
// `fetch` is stubbed; the file is the synthetic fixture.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h, nextTick } from 'vue'
import { clearLibraryFiles } from '#layers/regal/app/utils/library/libraryCache'
import { LibraryFileError } from '#components'
import { useLibrary, useRegalLibrary, useState } from '#imports'

const DEMO = readFileSync(join(import.meta.dirname, '../../tests/fixtures/library-file/demo.json'), 'utf8')
/** A file of its own per test: the app keeps what loaded, for the page. */
let SRC = ''
let count = 0

let api: ReturnType<typeof useRegalLibrary>
const Host = defineComponent({
  setup() {
    api = useRegalLibrary(SRC)
    return () => h('div', { class: 'host' }, api.error.value ? 'error' : `${api.books.value.length} books`)
  },
})

/** The mount's own load has been asked for and answered. */
const settle = async (fetch: { mock: { calls: unknown[] } }, calls = 1) => {
  await vi.waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(calls))
  await vi.waitFor(() => expect(api.loading.value).toBe(false))
  await nextTick()
}

/** Answers in turn: 'ok' = the file, a number = that status, 'throw' = a network error, 'bad' = not JSON. */
function serve(...answers: (('ok' | 'bad' | 'throw') | number)[]) {
  const calls = vi.fn(async () => {
    const answer = answers.length > 1 ? answers.shift()! : answers[0]!
    if (answer === 'throw') throw new TypeError('Failed to fetch')
    if (answer === 'ok') return new Response(DEMO, { status: 200 })
    if (answer === 'bad') return new Response('<html>', { status: 200 })
    return new Response('', { status: answer, statusText: 'Nope' })
  })
  vi.stubGlobal('fetch', calls)
  return calls
}

beforeEach(() => {
  SRC = `https://books.example/v2/library-${++count}.json`
  clearLibraryFiles()
  useState('regal:library-loaded').value = null
  useState('regal:library-loading').value = false
  useLibrary().fail({ message: 'reset', details: [], more: 0 }, null)
  useLibrary().error.value = null
})
afterEach(() => vi.unstubAllGlobals())

describe('useRegalLibrary: a failed load', () => {
  it.each([[503], ['throw'], ['bad']] as const)('is asked for again by the next mount (%s)', async (failure) => {
    const fetch = serve(failure, 'ok')
    const first = await mountSuspended(Host)
    await settle(fetch)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(api.error.value).not.toBeNull()
    expect(first.text()).toBe('error')
    first.unmount()

    const second = await mountSuspended(Host)
    await settle(fetch, 2)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(api.error.value).toBeNull()
    expect(api.books.value.length).toBeGreaterThan(0)
    expect(second.text()).toContain('books')
  })

  it('retry() fetches again and shows the Library', async () => {
    const fetch = serve(500, 'ok')
    await mountSuspended(Host)
    await settle(fetch)
    expect(api.error.value).not.toBeNull()

    const done = api.retry()
    expect(api.loading.value).toBe(true)
    await done
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(api.error.value).toBeNull()
    expect(api.books.value.length).toBeGreaterThan(0)
    expect(api.loading.value).toBe(false)
  })

  it('can fail again and be retried once more', async () => {
    const fetch = serve(500, 500, 'ok')
    await mountSuspended(Host)
    await settle(fetch)
    await api.retry()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(api.error.value).not.toBeNull()
    await api.retry()
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(api.error.value).toBeNull()
  })

  it('shares one request between concurrent retries and mounts', async () => {
    const fetch = serve(500, 'ok')
    await mountSuspended(Host)
    await settle(fetch)
    expect(fetch).toHaveBeenCalledTimes(1)

    const retries = [api.retry(), api.retry()]
    // Another row mounting while the retry is on its way joins it.
    const other = mountSuspended(Host)
    await Promise.all([...retries, other])
    await settle(fetch, 2)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(api.error.value).toBeNull()
  })
})

describe('useRegalLibrary: a loaded Library', () => {
  it('is kept: a remount makes no request', async () => {
    const fetch = serve('ok')
    const first = await mountSuspended(Host)
    await settle(fetch)
    expect(api.books.value.length).toBeGreaterThan(0)
    first.unmount()
    await mountSuspended(Host)
    await settle(fetch)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(api.books.value.length).toBeGreaterThan(0)
  })

  it('is not fetched again by retry(): nothing failed', async () => {
    const fetch = serve('ok')
    await mountSuspended(Host)
    await settle(fetch)
    await api.retry()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(api.books.value.length).toBeGreaterThan(0)
  })
})

describe('the error card', () => {
  it('offers Try again under a component that loads the file, and it retries', async () => {
    const fetch = serve(500, 'ok')
    const Wrapper = defineComponent({
      setup() {
        api = useRegalLibrary(SRC)
        return () => api.error.value
          ? h(LibraryFileError, { error: api.error.value, src: SRC })
          : h('div', { class: 'shown' }, 'shown')
      },
    })
    const wrapper = await mountSuspended(Wrapper)
    await settle(fetch)
    const button = wrapper.find('button.file-error__retry')
    expect(button.text()).toBe('Try again')
    await button.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.shown').exists()).toBe(true))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('has no button where nothing can retry', async () => {
    const wrapper = await mountSuspended(LibraryFileError, { props: { error: { message: 'x', details: [], more: 0 }, src: SRC } })
    expect(wrapper.find('button').exists()).toBe(false)
  })
})
