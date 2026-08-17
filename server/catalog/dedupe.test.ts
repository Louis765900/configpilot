import { describe, expect, it } from 'vitest'
import { exactMatchReason } from './dedupe.js'
import { componentIdentityHash } from './normalize.js'

const component = (overrides: Record<string, unknown> = {}) => {
  const value = {
    brand: 'Samsung', name: 'Samsung 990 PRO 2TB', manufacturerPartNumbers: ['MZ-V9P2T0BW'],
    gtin: null, ean: null, upc: null, specifications: { capacity: 2000 }, ...overrides,
  }
  return { ...value, identityHash: componentIdentityHash({ ...value, category: 'storage' }) }
}

describe('déduplication conservatrice', () => {
  it('fusionne un MPN identique de la même marque', () => {
    expect(exactMatchReason(component(), component({ name: '990 Pro NVMe 2 To' }))).toBe('exact_mpn')
  })

  it('fusionne un EAN identique', () => {
    expect(exactMatchReason(component({ manufacturerPartNumbers: [], ean: '8806094215038' }), component({ manufacturerPartNumbers: [], ean: '8806094215038' }))).toBe('exact_ean')
  })

  it('ne fusionne pas deux capacités différentes', () => {
    expect(exactMatchReason(component(), component({ name: 'Samsung 990 PRO 4TB', manufacturerPartNumbers: ['MZ-V9P4T0BW'], specifications: { capacity: 4000 } }))).toBeNull()
  })

  it('ne fusionne pas deux variantes GPU avec des MPN distincts', () => {
    const tuf = component({ brand: 'ASUS', name: 'RTX 4070 Super TUF', manufacturerPartNumbers: ['TUF-RTX4070S-O12G'], specifications: { memory: 12 } })
    const dual = component({ brand: 'ASUS', name: 'RTX 4070 Super Dual', manufacturerPartNumbers: ['DUAL-RTX4070S-O12G'], specifications: { memory: 12 } })
    expect(exactMatchReason(tuf, dual)).toBeNull()
  })
})
