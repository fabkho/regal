import { setAssetsBase } from '#layers/regal/app/utils/covers/bookAssets'

/** Points the Book asset set at `runtimeConfig.public.regal.assetsBase` (a host app's own folder in 'embed' mode). */
export default defineNuxtPlugin(() => {
  setAssetsBase(useRegalConfig().assetsBase)
})
