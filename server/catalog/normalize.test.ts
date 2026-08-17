import { describe, expect, it } from 'vitest'
import { normalizeBuildCores } from './normalize.js'

const cpu = {
  opendb_id: 'ae9507b0-cdbc-489b-b39a-46b12687d53d',
  metadata: { name: 'Intel Core i5 6400', manufacturer: 'Intel', part_numbers: ['BX80662I56400'], series: 'Core i5 6000', variant: '6400', releaseYear: 2015 },
  socket: 'LGA 1151', cores: { total: 4, threads: 4 }, specifications: { tdp: 65 },
  general_product_information: { manufacturer_url: 'https://intel.example/product', amazon_sku: 'DO-NOT-IMPORT' },
}

describe('normalisation BuildCores', () => {
  it('produit le modèle canonique et assainit les identifiants marchands', () => {
    const result = normalizeBuildCores('CPU', cpu)
    expect(result.category).toBe('cpu')
    expect(result.mpn).toBe('BX80662I56400')
    expect(result.specifications.socket).toBe('LGA 1151')
    expect(result.rawData.general_product_information).toEqual({ manufacturer_url: 'https://intel.example/product' })
  })

  it('refuse une catégorie étrangère à la whitelist', () => {
    expect(() => normalizeBuildCores('Fridge', cpu)).toThrow(/non autorisée/)
  })
})
