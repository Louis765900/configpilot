import { describe, expect, it } from 'vitest'
import { apiComponentToProduct } from './component-api'

describe('adaptateur API vers interface existante', () => {
  it('préserve la référence exacte et les caractéristiques', () => {
    const product = apiComponentToProduct({
      id: '00000000-0000-4000-8000-000000000001', category: 'storage', subcategory: null,
      brand: 'Samsung', name: 'Samsung 990 PRO 2TB', model: '990 PRO', series: '990 PRO',
      mpn: 'MZ-V9P2T0BW', manufacturer_part_numbers: ['MZ-V9P2T0BW'], release_date: '2022-10-01',
      description: null, short_description: null, specifications: { capacity: 2000 },
      primary_source: 'buildcores', completeness_score: 90, confidence_score: 85,
    })
    expect(product.reference).toBe('MZ-V9P2T0BW')
    expect(product.specs.capacity).toBe(2000)
    expect(product.category).toBe('storage')
  })
})
