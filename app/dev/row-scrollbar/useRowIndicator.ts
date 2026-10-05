// Design round (RegalBooksRow scroll indicator), dev only: the row's scroll
// state for the prototype indicators, read from outside the row (its
// scroller's scrollLeft/scrollWidth/clientWidth and the Library's Books and
// months; nothing in the row's own files is touched).
//
// What a host's `#indicator` slot would be handed, built the same way:
//   progress   0..1 along the scroll
//   visible    the share of the track the card shows (0..1)
//   months     each month's start along the track (0..1), count, year change
//   books      each Book's span along the track and its Spine colour
//   current    the Book/month in the middle of the card ("reading point")
//   scrollTo*  jump (instant while scrubbing, smooth otherwise, never smooth under Reduce Motion)
import type { Ref } from 'vue'
import { layoutRow, rowBooks } from '#layers/regal/app/utils/row/layout'

/** Card px between the row's ends and the card's edges (row/Card.vue MARGIN). */
const MARGIN = 14
const SCROLLING_MS = 900

export interface IndicatorMonth {
  index: number
  key: string
  /** 'MAY', or 'READING' for what is being read. */
  text: string
  year: number | null
  /** 'MAY 2025'. */
  label: string
  count: number
  /** First month of a year (taller tick, year label). */
  newYear: boolean
  /** Where the month's sheet stands along the track, 0..1. */
  at: number
  /** Where the month ends along the track, 0..1. */
  to: number
  /** First Book index (oldest first) of the month. */
  first: number
}

export interface IndicatorBook {
  index: number
  id: string
  /** The Spine's average colour (library file), else the cover cloth. */
  color: string
  /** Span along the track, 0..1. */
  from: number
  to: number
  /** Height share of the tallest Book, 0..1: a silhouette. */
  height: number
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

export function useRowIndicator(host: Ref<HTMLElement | null>, options: { reduced: Ref<boolean> }) {
  const { books, assets } = useLibrary()
  const scroller = shallowRef<HTMLElement | null>(null)
  const scrollLeft = ref(0)
  const scrollWidth = ref(0)
  const clientWidth = ref(0)
  /** True while the row moves, and a moment after. */
  const scrolling = ref(false)
  /** True while a finger/pointer is on the indicator (it stays up). */
  const interacting = ref(false)

  // --- The row's layout, as the card computes it ---------------------------------------
  const shown = computed(() => rowBooks(books.value))
  const layout = computed(() => layoutRow([...shown.value].reverse()))
  const extentWidth = computed(() => layout.value.extent[1] - layout.value.extent[0])
  const maxScroll = computed(() => Math.max(0, scrollWidth.value - clientWidth.value))
  const scrolls = computed(() => maxScroll.value > 1)
  /** Px per world metre, from the track's own width (the card sets it from its height). */
  const pxPerMetre = computed(() => (extentWidth.value > 0 ? Math.max(0, scrollWidth.value - 2 * MARGIN) / extentWidth.value : 0))
  /** Content px (in the scrolled track's coordinates) of a world x. */
  const contentPx = (x: number) => (x - layout.value.extent[0]) * pxPerMetre.value + MARGIN
  const track = computed(() => Math.max(1, scrollWidth.value))

  const bookList = computed<IndicatorBook[]>(() => {
    const tallest = Math.max(0.0001, ...layout.value.poses.map(pose => pose.height))
    return layout.value.poses.map((pose, index) => {
      const entry = assets.value[pose.bookId]
      return {
        index,
        id: pose.bookId,
        color: entry?.spineColor ?? entry?.palette?.background ?? pose.color,
        from: contentPx(pose.x - pose.thickness / 2) / track.value,
        to: contentPx(pose.x + pose.thickness / 2) / track.value,
        height: pose.height / tallest,
      }
    })
  })

  const monthList = computed<IndicatorMonth[]>(() => {
    const markers = layout.value.markers
    const poses = layout.value.poses
    let seen = 0
    let lastYear: number | null = null
    return markers.map((marker, index) => {
      const match = /^(\d{4})-(\d{2})/.exec(marker.key)
      const year = match ? Number(match[1]) : null
      const text = match ? MONTHS[Number(match[2]) - 1] ?? marker.label : marker.label
      const first = seen
      seen += marker.count
      const end = markers[index + 1]?.x ?? layout.value.extent[1]
      const newYear = year !== null && year !== lastYear
      if (year !== null) lastYear = year
      return {
        index,
        key: marker.key,
        text,
        year,
        label: year ? `${text} ${year}` : text,
        count: marker.count,
        newYear,
        at: contentPx(marker.x - 0.004) / track.value,
        to: contentPx(end - 0.004) / track.value,
        first: Math.min(first, Math.max(0, poses.length - 1)),
      }
    })
  })

  /** The years along the row: a run of months, its extent along the track. */
  const yearList = computed(() => {
    const years: { year: number | null, label: string, at: number, to: number, count: number }[] = []
    for (const month of monthList.value) {
      const last = years.at(-1)
      if (last && last.year === month.year) {
        last.to = month.to
        last.count += month.count
      }
      else years.push({ year: month.year, label: month.year ? String(month.year) : 'NOW', at: month.at, to: month.to, count: month.count })
    }
    return years
  })

  // --- Scroll state ---------------------------------------------------------------------
  const progress = computed(() => (maxScroll.value > 0 ? Math.min(1, Math.max(0, scrollLeft.value / maxScroll.value)) : 0))
  /** The share of the track the card shows. */
  const visible = computed(() => (scrollWidth.value > 0 ? Math.min(1, clientWidth.value / scrollWidth.value) : 1))
  /** The thumb/window's left edge and right edge along the track, 0..1. */
  const windowFrom = computed(() => scrollLeft.value / track.value)
  const windowTo = computed(() => (scrollLeft.value + clientWidth.value) / track.value)

  /**
   * The reading point: the Book the card is about. Its content px runs from the
   * first Book's centre (scroll start) to the last Book's (scroll end), so the
   * first and the last Book are reached whatever the row's end padding, and it
   * is the true centre of the card when the ends are centred.
   */
  const firstPx = computed(() => {
    const first = bookList.value[0]
    return first ? (first.from + first.to) / 2 * track.value : 0
  })
  const lastPx = computed(() => {
    const last = bookList.value.at(-1)
    return last ? (last.from + last.to) / 2 * track.value : 0
  })
  const readingPx = computed(() => firstPx.value + progress.value * (lastPx.value - firstPx.value))
  /** Index (oldest first) of the Book at the reading point. */
  const bookIndex = computed(() => {
    const list = bookList.value
    if (!list.length) return 0
    let best = 0
    let distance = Infinity
    for (const book of list) {
      const d = Math.abs((book.from + book.to) / 2 * track.value - readingPx.value)
      if (d < distance) {
        distance = d
        best = book.index
      }
    }
    return best
  })
  const monthIndex = computed(() => {
    let found = 0
    for (const month of monthList.value) {
      if (month.at * track.value <= readingPx.value + 1) found = month.index
    }
    return found
  })
  const month = computed(() => monthList.value[monthIndex.value] ?? null)
  /** "Book 12 of 77, MAY 2025": the value text for assistive technology. */
  const valueText = computed(() => {
    const total = bookList.value.length
    if (!total) return ''
    return `Book ${bookIndex.value + 1} of ${total}${month.value ? `, ${month.value.label}` : ''}`
  })

  // --- Moving the row -------------------------------------------------------------------
  const behavior = (smooth: boolean): ScrollBehavior => (smooth && !options.reduced.value ? 'smooth' : 'auto')
  function scrollToLeft(left: number, smooth = true) {
    scroller.value?.scrollTo({ left: Math.min(maxScroll.value, Math.max(0, left)), behavior: behavior(smooth) })
  }
  function scrollToProgress(value: number, smooth = true) {
    scrollToLeft(value * maxScroll.value, smooth)
  }
  /** Brings the track position `at` (0..1) to the reading point. */
  function scrollToTrack(at: number, smooth = true) {
    const span = lastPx.value - firstPx.value
    scrollToProgress(span > 0 ? (at * track.value - firstPx.value) / span : 0, smooth)
  }
  function scrollToBook(index: number, smooth = true) {
    const book = bookList.value[index]
    if (book) scrollToTrack((book.from + book.to) / 2, smooth)
  }
  function scrollToMonth(index: number, smooth = true) {
    const target = monthList.value[index]
    if (!target) return
    // The month's first Book comes to the reading point.
    scrollToBook(target.first, smooth)
  }
  /** Which month a track position (0..1) is in. */
  function monthAt(at: number) {
    let found = 0
    for (const m of monthList.value) if (m.at <= at + 1e-6) found = m.index
    return found
  }

  // --- Reading the row's scroller -------------------------------------------------------
  let timer: ReturnType<typeof setTimeout> | undefined
  function read() {
    const el = scroller.value
    if (!el) return
    scrollLeft.value = el.scrollLeft
    scrollWidth.value = el.scrollWidth
    clientWidth.value = el.clientWidth
  }
  function onScroll() {
    read()
    scrolling.value = true
    clearTimeout(timer)
    timer = setTimeout(() => (scrolling.value = false), SCROLLING_MS)
  }
  let resizer: ResizeObserver | null = null
  function attach() {
    const el = host.value?.querySelector<HTMLElement>('.row-card__scroller') ?? null
    if (el === scroller.value) return
    scroller.value?.removeEventListener('scroll', onScroll)
    resizer?.disconnect()
    scroller.value = el
    if (!el) return
    if (!el.id) el.id = `row-scroller-${Math.random().toString(36).slice(2, 8)}`
    el.addEventListener('scroll', onScroll, { passive: true })
    resizer = new ResizeObserver(read)
    resizer.observe(el)
    if (el.firstElementChild) resizer.observe(el.firstElementChild)
    read()
  }
  let mutations: MutationObserver | null = null
  onMounted(() => {
    if (!host.value) return
    attach()
    mutations = new MutationObserver(attach)
    mutations.observe(host.value, { childList: true, subtree: true })
  })
  onBeforeUnmount(() => {
    mutations?.disconnect()
    resizer?.disconnect()
    scroller.value?.removeEventListener('scroll', onScroll)
    clearTimeout(timer)
  })

  // Reactive: refs unwrapped, so the indicators read `state.progress`.
  return reactive({
    scroller,
    scrollLeft,
    scrollWidth,
    clientWidth,
    maxScroll,
    scrolls,
    scrolling,
    interacting,
    reduced: options.reduced,
    progress,
    visible,
    windowFrom,
    windowTo,
    /** The reading point along the track, 0..1. */
    reading: computed(() => readingPx.value / track.value),
    books: bookList,
    months: monthList,
    years: yearList,
    bookIndex,
    monthIndex,
    month,
    total: computed(() => bookList.value.length),
    valueText,
    /** A pointer holds the indicator (it stays awake). */
    hold: (value: boolean) => { interacting.value = value },
    scrollToLeft,
    scrollToProgress,
    scrollToTrack,
    scrollToBook,
    scrollToMonth,
    monthAt,
  })
}

export type RowIndicatorState = ReturnType<typeof useRowIndicator>
