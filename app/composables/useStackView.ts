import type { StackSort, StackView } from '~/utils/stack/view'
import { DEFAULT_STACK_VIEW } from '~/utils/stack/view'

const SORTS: StackSort[] = ['date', 'rating', 'author', 'title']

/**
 * Stack view settings (sort, year, minimum rating), shared and kept in the
 * URL so a view can be linked: ?sort=rating&year=2026&min=4.
 */
export function useStackView() {
  const route = useRoute()
  const router = useRouter()
  const view = useState<StackView>('stack-view', () => {
    const query = route.query
    const sort = SORTS.includes(query.sort as StackSort) ? query.sort as StackSort : DEFAULT_STACK_VIEW.sort
    const year = Number(query.year) || null
    const minRating = Number(query.min) || 0
    return { sort, year, minRating }
  })

  function set(patch: Partial<StackView>) {
    view.value = { ...view.value, ...patch }
    const { sort, year, minRating } = view.value
    router.replace({
      query: {
        ...route.query,
        sort: sort === DEFAULT_STACK_VIEW.sort ? undefined : sort,
        year: year ? String(year) : undefined,
        min: minRating ? String(minRating) : undefined,
      },
    })
  }

  return { view: readonly(view), set }
}
