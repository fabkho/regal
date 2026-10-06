// User Timing marks of a row's first look (`regal:*` in the browser's
// performance timeline): the library file in, the 3D up, the Spines in view
// drawn, the intro. Read by a profile (COMPARE.md) or a host; no-ops elsewhere.

export function markRegal(name: string) {
  if (typeof performance !== 'undefined' && typeof performance.mark === 'function') performance.mark(`regal:${name}`)
}
