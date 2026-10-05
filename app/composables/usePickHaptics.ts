import { hapticsTuning, mayPulse, pickPulse, PULSE_MS } from '#layers/regal/app/utils/books/haptics'
import type { HapticsTuning } from '#layers/regal/app/utils/books/haptics'

type HapticNavigator = Navigator & { userActivation?: { isActive: boolean } }

const UNTUNED: HapticsTuning = { enabled: null, durations: PULSE_MS }

/**
 * A short pulse when a Book is taken out or put back (utils/books/haptics.ts),
 * unless the host turned haptics off (runtimeConfig.public.regal.haptics). On
 * the dev server ?haptics=1|0, ?hapticOut= and ?hapticBack= (ms) tune them,
 * read on every change; production builds drop that. Call once per stage.
 */
export function usePickHaptics() {
  if (!import.meta.client) return
  const { haptics } = useRegalConfig()
  const route = import.meta.dev ? useRoute() : null
  const reducedMotion = usePreferredReducedMotion()
  const { pickedId } = useBookPick()
  watch(pickedId, (next, previous) => {
    const pulse = pickPulse(previous ?? null, next ?? null)
    if (!pulse) return
    const tuning = import.meta.dev ? hapticsTuning(route!.query) : UNTUNED
    const host = navigator as HapticNavigator
    const allowed = mayPulse({
      enabled: tuning.enabled ?? haptics,
      canVibrate: typeof host.vibrate === 'function',
      reducedMotion: reducedMotion.value === 'reduce',
      // Without the User Activation API there is no telling: no pulse.
      userActive: host.userActivation?.isActive === true,
    })
    if (allowed && tuning.durations[pulse] > 0) host.vibrate(tuning.durations[pulse])
  })
}
