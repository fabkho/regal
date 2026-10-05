// Design round (horizontal Stack): loads the Library a prototype page shows,
// from the URL: ?src=published|demo, ?n=<count> (default: all), ?year=<yyyy>, ?order=newest|chrono.
// Fills the shared Library (faces resolve against the file's URL) and returns
// the Books the rows show.
import type { Book } from '#layers/regal/shared/types/book'
import { readLibraryFile } from '#layers/regal/app/utils/library/libraryFile'
import { ROW_SOURCES, rowBooks } from './data'
import type { RowOrder, RowSource } from './data'

export function useRowLibrary() {
  const route = useRoute()
  const library = useLibrary()
  const source = computed<RowSource>(() => (route.query.src === 'demo' ? 'demo' : 'published'))
  const count = computed(() => {
    const value = Number(route.query.n)
    return Number.isFinite(value) && value > 0 ? Math.round(value) : null
  })
  const year = computed(() => {
    const value = Number(route.query.year)
    return Number.isFinite(value) && value > 1900 ? value : null
  })
  const order = computed<RowOrder>(() => (route.query.order === 'chrono' ? 'chrono' : 'newest'))
  const books = shallowRef<Book[]>([])
  const error = ref<string | null>(null)
  const loading = ref(true)

  async function load() {
    loading.value = true
    error.value = null
    const src = ROW_SOURCES[source.value]
    try {
      const text = await $fetch<string>(src, { responseType: 'text' })
      const result = readLibraryFile(text)
      if (!result.ok) throw new Error(result.error.message)
      const picked = rowBooks(result.library.books, result.library.assets, { count: count.value, year: year.value })
      library.show({ books: picked.books, assets: picked.assets, owner: result.library.owner }, src)
      books.value = picked.books
    }
    catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      books.value = []
    }
    finally {
      loading.value = false
    }
  }

  if (import.meta.client) {
    watch([source, count, year], load, { immediate: true })
  }

  return { books, error, loading, source, count, year, order }
}
