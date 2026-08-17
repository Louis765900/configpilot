import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiComponentToProduct, getRemoteCatalogSize } from './component-api'

afterEach(() => vi.unstubAllGlobals())

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

  it('lit le total réel exposé par PostgreSQL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], pagination: { page: 1, limit: 1, total: 34_500, pages: 34_500 } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(getRemoteCatalogSize()).resolves.toBe(34_500)
    expect(fetchMock).toHaveBeenCalledWith('/api/components?limit=1', expect.objectContaining({
      headers: { Accept: 'application/json' },
    }))
  })
})
