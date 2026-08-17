import { describe, expect, it } from 'vitest'
import { parseLookupTarget } from './components-handler.js'

describe('cibles de consultation des composants', () => {
  it('lit les paramètres issus des réécritures Vercel', () => {
    expect(parseLookupTarget({ kind: 'id', value: 'c07c67cd-842e-4ce5-904f-c9243dccec73' })).toEqual({
      kind: 'id', value: 'c07c67cd-842e-4ce5-904f-c9243dccec73',
    })
    expect(parseLookupTarget({ kind: 'slug', value: 'samsung-990-pro' })).toEqual({
      kind: 'slug', value: 'samsung-990-pro',
    })
    expect(parseLookupTarget({ kind: 'mpn', value: 'MZ-V9P2T0B%2FAM' })).toEqual({
      kind: 'mpn', value: 'MZ-V9P2T0B/AM',
    })
  })

  it('conserve la compatibilité avec les anciens segments dynamiques', () => {
    expect(parseLookupTarget({ path: 'c07c67cd-842e-4ce5-904f-c9243dccec73' })).toEqual({
      kind: 'id', value: 'c07c67cd-842e-4ce5-904f-c9243dccec73',
    })
    expect(parseLookupTarget({ path: ['slug', 'samsung-990-pro'] })).toEqual({
      kind: 'slug', value: 'samsung-990-pro',
    })
  })

  it('rejette les cibles absentes ou mal encodées', () => {
    expect(parseLookupTarget({})).toBeNull()
    expect(parseLookupTarget({ kind: 'id', value: '%' })).toBeNull()
  })
})
