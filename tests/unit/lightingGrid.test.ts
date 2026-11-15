import { describe, expect, it } from 'vitest'
import {
  AMBIENT_LIGHT,
  BOUNCE_LIGHT,
  ENVIRONMENT_INTENSITY,
  KEY_LIGHT,
  TONE_MAPPING_EXPOSURE,
} from '../../app/utils/bookcase/scene'
import {
  ambientIntensity,
  BRIGHTNESS_STEPS,
  ENVIRONMENT_LEVELS,
  glossFor,
  GRID_AXES,
  GRID_PARAMS,
  gridQuery,
  isShippedGrid,
  keyIntensity,
  LIGHT_POSITIONS,
  lightingGrid,
  parseBrightness,
  parseEnvironment,
  parseGloss,
  parseLightPosition,
  SHIPPED_GLOSS,
  SHIPPED_GRID,
  STACK_SHIPPED_POSITIONS,
} from '../../app/utils/stage/lighting'

describe('brightness', () => {
  it('scales the shipped numbers, never replaces them', () => {
    expect(BRIGHTNESS_STEPS.today).toMatchObject({ key: 1, exposure: 1, ambient: 0 })
    expect(BRIGHTNESS_STEPS.brighter).toMatchObject({ key: 1.25, exposure: 1.1, ambient: 0 })
    expect(BRIGHTNESS_STEPS.brighter2).toMatchObject({ key: 1.5, exposure: 1.2, ambient: 0.1 })
    expect(KEY_LIGHT.intensity * BRIGHTNESS_STEPS.brighter.key).toBeCloseTo(2.875)
    expect(TONE_MAPPING_EXPOSURE * BRIGHTNESS_STEPS.brighter2.exposure).toBeCloseTo(1.38)
    expect(AMBIENT_LIGHT.intensity + BRIGHTNESS_STEPS.brighter2.ambient).toBeCloseTo(0.4)
    expect(keyIntensity(2.2, BRIGHTNESS_STEPS.brighter2)).toBeCloseTo(3.3)
    expect(ambientIntensity(0.35, BRIGHTNESS_STEPS.brighter2)).toBeCloseTo(0.45)
  })

  it('keeps today byte-identical', () => {
    expect(KEY_LIGHT.intensity * BRIGHTNESS_STEPS.today.key).toBe(KEY_LIGHT.intensity)
    expect(TONE_MAPPING_EXPOSURE * BRIGHTNESS_STEPS.today.exposure).toBe(TONE_MAPPING_EXPOSURE)
    expect(AMBIENT_LIGHT.intensity + BRIGHTNESS_STEPS.today.ambient).toBe(AMBIENT_LIGHT.intensity)
  })
})

describe('light positions', () => {
  it('today is the shipped rig, per scene', () => {
    expect(LIGHT_POSITIONS.today.bookcase.key).toEqual([...KEY_LIGHT.position])
    expect(LIGHT_POSITIONS.today.bookcase.bounce).toEqual([...BOUNCE_LIGHT.position])
    expect(LIGHT_POSITIONS.today.stack.key).toEqual([...STACK_SHIPPED_POSITIONS.key])
    expect(LIGHT_POSITIONS.today.stack.bounce).toEqual([...STACK_SHIPPED_POSITIONS.bounce])
  })

  it('gives every scene its own position for every option', () => {
    for (const spec of Object.values(LIGHT_POSITIONS)) {
      expect(spec.bookcase.key).toHaveLength(3)
      expect(spec.bookcase.bounce).toHaveLength(3)
      expect(spec.stack.key).toHaveLength(3)
      expect(spec.stack.bounce).toHaveLength(3)
    }
    // The two rigs are not the same lights at the same scale: no variant copies one to the other.
    for (const key of ['high', 'side', 'back'] as const) {
      expect(LIGHT_POSITIONS[key].stack.key).not.toEqual(LIGHT_POSITIONS[key].bookcase.key)
    }
  })

  it('puts the key behind the scenes for back, in front for the rest', () => {
    expect(LIGHT_POSITIONS.back.bookcase.key[2]).toBeLessThan(0)
    expect(LIGHT_POSITIONS.back.stack.key[2]).toBeLessThan(0)
    expect(LIGHT_POSITIONS.today.bookcase.key[2]).toBeGreaterThan(0)
    expect(LIGHT_POSITIONS.high.bookcase.key[1]).toBeGreaterThan(KEY_LIGHT.position[1])
    expect(LIGHT_POSITIONS.side.bookcase.key[0]).toBeLessThan(KEY_LIGHT.position[0])
  })
})

describe('gloss', () => {
  it('today is the shipped values on every face', () => {
    for (const face of ['cloth', 'printed', 'cover'] as const) {
      expect(glossFor(face, 'today')).toEqual({ ...SHIPPED_GLOSS[face] })
    }
  })

  it('the shipped table matches books/Meshes.vue', () => {
    expect(SHIPPED_GLOSS.cloth).toEqual({ clearcoat: 0.12, clearcoatRoughness: 0.6, envMapIntensity: 0.35 })
    expect(SHIPPED_GLOSS.printed).toEqual({ clearcoat: 0.15, clearcoatRoughness: 0.55, envMapIntensity: 0.35 })
    expect(SHIPPED_GLOSS.cover).toEqual({ clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 0.35 })
  })

  it('half halves clearcoat and envMap, none zeroes both, soft only spreads the highlight', () => {
    expect(glossFor('cover', 'half')).toEqual({ clearcoat: 0.175, clearcoatRoughness: 0.35, envMapIntensity: 0.175 })
    expect(glossFor('cloth', 'half')).toEqual({ clearcoat: 0.06, clearcoatRoughness: 0.6, envMapIntensity: 0.175 })
    expect(glossFor('printed', 'none')).toEqual({ clearcoat: 0, clearcoatRoughness: 0.55, envMapIntensity: 0 })
    expect(glossFor('cover', 'soft')).toEqual({ clearcoat: 0.35, clearcoatRoughness: 0.85, envMapIntensity: 0.35 })
    expect(glossFor('cloth', 'soft').clearcoatRoughness).toBe(0.85)
  })
})

describe('environment', () => {
  it('today is the shipped strength', () => {
    expect(ENVIRONMENT_LEVELS.today.intensity).toBe(ENVIRONMENT_INTENSITY)
    expect(ENVIRONMENT_LEVELS.dim.intensity).toBe(0.25)
    expect(ENVIRONMENT_LEVELS.dimmer.intensity).toBe(0.15)
  })
})

describe('the grid', () => {
  it('reads each parameter and combines all four', () => {
    expect(lightingGrid({})).toEqual(SHIPPED_GRID)
    expect(lightingGrid({ bright: 'brighter', light: 'side', gloss: 'half', env: 'dim' })).toEqual({
      bright: 'brighter',
      light: 'side',
      gloss: 'half',
      env: 'dim',
    })
  })

  it('ignores an unknown value on every axis', () => {
    expect(lightingGrid({ bright: 'max', light: 'under', gloss: 'wet', env: 'off' })).toEqual(SHIPPED_GRID)
    expect(parseBrightness(undefined)).toBe('today')
    expect(parseLightPosition(['high'])).toBe('today')
    expect(parseGloss(0)).toBe('today')
    expect(parseEnvironment(null)).toBe('today')
  })

  it('leaves today out of the query, so the plain URL is the baseline', () => {
    expect(gridQuery(SHIPPED_GRID)).toEqual({
      bright: undefined,
      light: undefined,
      gloss: undefined,
      env: undefined,
    })
    expect(gridQuery({ bright: 'brighter2', light: 'today', gloss: 'none', env: 'dimmer' })).toEqual({
      bright: 'brighter2',
      light: undefined,
      gloss: 'none',
      env: 'dimmer',
    })
    expect(isShippedGrid(SHIPPED_GRID)).toBe(true)
    expect(isShippedGrid({ ...SHIPPED_GRID, gloss: 'soft' })).toBe(false)
  })

  it('lists the four axes with every option, the shipped one first', () => {
    expect(GRID_AXES.map(axis => axis.axis)).toEqual(['bright', 'light', 'gloss', 'env'])
    for (const axis of GRID_AXES) {
      expect(axis.param).toBe(GRID_PARAMS[axis.axis])
      expect(axis.options[0]!.value).toBe('today')
      expect(axis.options.length).toBeGreaterThan(1)
    }
    expect(GRID_AXES.find(axis => axis.axis === 'gloss')!.options.map(option => option.value)).toEqual([
      'today',
      'half',
      'none',
      'soft',
    ])
  })
})
