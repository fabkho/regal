import { createTickState, hapticsTuning, mayPulse, pickPulse, PULSES, scrollTick, vibrates } from '#layers/regal/app/utils/books/haptics'
import type { HapticsTuning, Pulse } from '#layers/regal/app/utils/books/haptics'

type HapticNavigator = Navigator & { userActivation?: { isActive: boolean, hasBeenActive: boolean } }

const UNTUNED: HapticsTuning = { enabled: null, patterns: PULSES }

/**
 * Short vibrations (utils/books/haptics.ts): a double pulse when a Book is
 * taken out, a pulse when it is put back, a tiny tick when a new Book
 * reaches the focus line while a finger scrolls the Stack. Off when the host
 * turned haptics off (runtimeConfig.public.regal.haptics). On the dev server
 * ?haptics=1|0, ?hapticOut=, ?hapticBack= and ?hapticTick= (patterns in ms,
 * `10,45,18`) tune them, read on every change; production builds drop that.
 * Call once per stage.
 */
export function useBookHaptics() {
  if (!import.meta.client) return
  const { haptics } = useRegalConfig()
  const route = import.meta.dev ? useRoute() : null
  const reducedMotion = usePreferredReducedMotion()
  const { pickedId } = useBookPick()
  const focusedBook = useFocusedBook()
  const touchScrolling = useTouchScrolling()
  const ticks = createTickState()

  function pulse(kind: Pulse, userActive: (host: HapticNavigator) => boolean) {
    const tuning = import.meta.dev ? hapticsTuning(route!.query) : UNTUNED
    const host = navigator as HapticNavigator
    const allowed = mayPulse({
      enabled: tuning.enabled ?? haptics,
      canVibrate: typeof host.vibrate === 'function',
      reducedMotion: reducedMotion.value === 'reduce',
      userActive: userActive(host),
    })
    const steps = tuning.patterns[kind]
    if (allowed && vibrates(steps)) host.vibrate([...steps])
  }

  watch(pickedId, (next, previous) => {
    const kind = pickPulse(previous ?? null, next ?? null)
    // Without the User Activation API there is no telling: no pulse.
    if (kind) pulse(kind, host => host.userActivation?.isActive === true)
  })

  watch(focusedBook, (bookId) => {
    if (scrollTick(ticks, bookId, touchScrolling.value, performance.now())) {
      pulse('tick', host => host.userActivation?.hasBeenActive === true)
    }
  })
}
