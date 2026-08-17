import { describe, expect, it } from 'vitest'
import { buildComponentListQuery, buildLookupQuery, parseListQuery } from './component-query.js'

describe('API composants', () => {
  it('valide pagination, filtres et limites', () => {
    const params = parseListQuery({ q: '990 pro', category: 'storage', brand: 'Samsung', page: '2', limit: '25' })
    const query = buildComponentListQuery(params)
    expect(params.page).toBe(2)
    expect(query.text).toContain('category =')
    expect(query.text).toContain('LIMIT')
    expect(query.values).toContain('storage')
  })

  it('refuse une limite déraisonnable', () => {
    expect(() => parseListQuery({ limit: '1000' })).toThrow()
  })

  it('normalise la recherche MPN', () => {
    const query = buildLookupQuery('mpn', 'CMK32GX4M2E3200C16')
    expect(query.values[0]).toBe('CMK32GX4M2E3200C16')
  })
})
