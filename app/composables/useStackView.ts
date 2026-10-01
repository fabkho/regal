import type { StackGrouping, StackSort, StackView } from '#layers/regal/app/utils/stack/view'
import { DEFAULT_STACK_VIEW } from '#layers/regal/app/utils/stack/view'

const SORTS: StackSort[] = ['date', 'rating', 'author', 'title']
const GROUPINGS: StackGrouping[] = ['auto', 'off', 'year', 'month']

/**
 * Stack view settings (sort, year, minimum rating, date separators), shared
 * and kept in the URL so a view can be linked: ?sort=rating&year=2026&min=4&group=month.
 */
export function useStackView() {
  const route = useRoute()
  const router = useRouter()
  const view = useState<StackView>('stack-view', () => {
    const query = route.query
    const sort = SORTS.includes(query.sort as StackSort) ? query.sort as StackSort : DEFAULT_STACK_VIEW.sort
    const year = Number(query.year) || null
    const minRating = Number(query.min) || 0
    const group = GROUPINGS.includes(query.group as StackGrouping) ? query.group as StackGrouping : DEFAULT_STACK_VIEW.group
    return { sort, year, minRating, group }
  })

  function set(patch: Partial<StackView>) {
    view.value = { ...view.value, ...patch }
    const { sort, year, minRating, group } = view.value
    router.replace({
      query: {
        ...route.query,
        sort: sort === DEFAULT_STACK_VIEW.sort ? undefined : sort,
        year: year ? String(year) : undefined,
        min: minRating ? String(minRating) : undefined,
        group: group === DEFAULT_STACK_VIEW.group ? undefined : group,
      },
    })
  }

  return { view: readonly(view), set }
}
