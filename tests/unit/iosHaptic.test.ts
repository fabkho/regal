import { describe, expect, it, vi } from 'vitest'
import { createIosHaptic, createSwitchLabel, HAPTIC_ATTR, IOS_TICK_GAP_MS, iosVersion, isIos, supportsSwitchHaptic } from '../../app/utils/books/iosHaptic'
import type { SwitchEnv } from '../../app/utils/books/iosHaptic'
import { mayPulse } from '../../app/utils/books/haptics'

const IPHONE_18 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1'
const IPHONE_26 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
const IPHONE_17 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15'

const env = (over: Partial<SwitchEnv> = {}): SwitchEnv => ({ userAgent: IPHONE_18, platform: 'iPhone', maxTouchPoints: 5, hasSwitch: true, ...over })

describe('detection', () => {
  it('reads iPhone, iPad and a touch "Mac" (iPad in desktop mode) as iOS, a Mac and Android not', () => {
    expect(isIos(env())).toBe(true)
    expect(isIos(env({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 5 }))).toBe(true)
    expect(isIos(env({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0 }))).toBe(false)
    expect(isIos(env({ userAgent: ANDROID, platform: 'Linux armv81', maxTouchPoints: 5 }))).toBe(false)
  })

  it('reads the iOS major version, also the frozen one of iOS 26', () => {
    expect(iosVersion(IPHONE_18)).toBe(18)
    expect(iosVersion(IPHONE_26)).toBe(18)
    expect(iosVersion(IPHONE_17)).toBe(17)
    expect(iosVersion(MAC)).toBeNull()
  })

  it('supports the switch haptic on iOS 18+ with the switch attribute known', () => {
    expect(supportsSwitchHaptic(env())).toBe(true)
    expect(supportsSwitchHaptic(env({ userAgent: IPHONE_26 }))).toBe(true)
  })

  it('does not on iOS 17 (the switch exists since 17.4, the haptic does not), without the attribute, or off iOS', () => {
    expect(supportsSwitchHaptic(env({ userAgent: IPHONE_17 }))).toBe(false)
    expect(supportsSwitchHaptic(env({ hasSwitch: false }))).toBe(false)
    expect(supportsSwitchHaptic(env({ userAgent: ANDROID, platform: 'Linux armv81' }))).toBe(false)
    expect(supportsSwitchHaptic(env({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0 }))).toBe(false)
  })

  it('lets the feature check decide when the version is hidden (iPad in desktop mode)', () => {
    expect(supportsSwitchHaptic(env({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 5 }))).toBe(true)
  })
})

/** A minimal DOM: elements with attributes, a body, querySelector for the marker, click(). */
function fakeDoc() {
  const clicks = vi.fn()
  const listeners: Array<(event: { stopPropagation: () => void }) => void> = []
  const attrs = new Map<string, string>()
  const input = {
    type: '',
    tabIndex: 0,
    attrs: new Map<string, string>(),
    setAttribute(k: string, v: string) {
      this.attrs.set(k, v)
    },
  }
  const label = {
    style: { cssText: '' },
    isConnected: false,
    attrs,
    children: [] as unknown[],
    setAttribute(k: string, v: string) {
      attrs.set(k, v)
    },
    append(child: unknown) {
      this.children.push(child)
    },
    addEventListener(_: string, fn: (event: { stopPropagation: () => void }) => void) {
      listeners.push(fn)
    },
    click: clicks,
  }
  const body = {
    append: vi.fn((el: typeof label) => {
      el.isConnected = true
    }),
  }
  let mounted: typeof label | null = null
  const createElement = vi.fn((tag: string) => (tag === 'label' ? label : input))
  const doc = {
    createElement,
    body: {
      append: (el: typeof label) => {
        body.append(el)
        mounted = el
      },
    },
    querySelector: vi.fn(() => mounted),
  }
  return { doc: doc as unknown as Document, label, input, clicks, listeners, body, createElement }
}

describe('the hidden switch', () => {
  it('is a label with a checkbox switch, hidden from the accessibility tree and the tab order', () => {
    const { doc, label, input } = fakeDoc()
    createSwitchLabel(doc)
    expect(label.attrs.get('aria-hidden')).toBe('true')
    expect(label.attrs.has(HAPTIC_ATTR)).toBe(true)
    expect(input.type).toBe('checkbox')
    expect(input.attrs.has('switch')).toBe(true)
    expect(input.tabIndex).toBe(-1)
    expect(input.attrs.get('aria-hidden')).toBe('true')
    expect(label.style.cssText).toContain('pointer-events:none')
    expect(label.style.cssText).toContain('position:fixed')
    expect(label.children).toContain(input)
  })

  it('keeps its clicks from bubbling to the page', () => {
    const { doc, listeners } = fakeDoc()
    createSwitchLabel(doc)
    const stop = vi.fn()
    listeners[0]!({ stopPropagation: stop })
    expect(stop).toHaveBeenCalled()
  })
})

describe('createIosHaptic', () => {
  it('is unavailable, and never touches the DOM, where detection says no', () => {
    const { doc, createElement, clicks } = fakeDoc()
    const haptic = createIosHaptic(doc, env({ hasSwitch: false }))
    expect(haptic.available).toBe(false)
    expect(haptic.tap('out', 0)).toBe(false)
    expect(createElement).not.toHaveBeenCalled()
    expect(clicks).not.toHaveBeenCalled()
    expect(createIosHaptic(null, env()).available).toBe(false)
  })

  it('mounts the label once, on the first tap, and clicks it for out and back', () => {
    const { doc, clicks, body } = fakeDoc()
    const haptic = createIosHaptic(doc, env())
    expect(haptic.available).toBe(true)
    expect(body.append).not.toHaveBeenCalled()
    expect(haptic.tap('out', 0)).toBe(true)
    expect(haptic.tap('back', 1)).toBe(true)
    expect(haptic.tap('out', 2)).toBe(true)
    expect(body.append).toHaveBeenCalledTimes(1)
    expect(clicks).toHaveBeenCalledTimes(3)
  })

  it('reuses a label already in the document', () => {
    const { doc, label, body } = fakeDoc()
    label.isConnected = true
    ;(doc.querySelector as ReturnType<typeof vi.fn>).mockReturnValue(label)
    createIosHaptic(doc, env()).tap('back', 0)
    expect(body.append).not.toHaveBeenCalled()
    expect(label.click).toHaveBeenCalledTimes(1)
  })

  it('rate-limits ticks, but not a Book out or back', () => {
    const { doc, clicks } = fakeDoc()
    const haptic = createIosHaptic(doc, env())
    expect(haptic.tap('tick', 1000)).toBe(true)
    expect(haptic.tap('tick', 1000 + IOS_TICK_GAP_MS - 1)).toBe(false)
    expect(haptic.tap('out', 1000 + IOS_TICK_GAP_MS - 1)).toBe(true)
    expect(haptic.tap('tick', 1000 + IOS_TICK_GAP_MS)).toBe(false) // the out tap restarted the gap
    expect(haptic.tap('tick', 1000 + 2 * IOS_TICK_GAP_MS)).toBe(true)
    expect(clicks).toHaveBeenCalledTimes(3)
  })

  it('swallows a failing click', () => {
    const { doc, clicks } = fakeDoc()
    clicks.mockImplementation(() => {
      throw new Error('nope')
    })
    expect(createIosHaptic(doc, env()).tap('out', 0)).toBe(false)
  })
})

describe('gating (shared with the vibration path)', () => {
  const gate = { enabled: true, canVibrate: true, reducedMotion: false, userActive: true }

  it('pulses on iOS only with the host switch on, Reduce Motion off and a user gesture', () => {
    expect(mayPulse(gate)).toBe(true)
    expect(mayPulse({ ...gate, enabled: false })).toBe(false)
    expect(mayPulse({ ...gate, reducedMotion: true })).toBe(false)
    expect(mayPulse({ ...gate, userActive: false })).toBe(false)
    expect(mayPulse({ ...gate, canVibrate: false })).toBe(false)
  })
})
