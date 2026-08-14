import { describe, expect, it } from 'vitest'
import { analyzeListing, checkCompatibility, searchProducts } from './engine'

describe('catalogue', () => {
  it('retrouve le i9-9900KF sans tenir compte de la casse', () => expect(searchProducts('I9-9900kf')[0]?.id).toBe('cpu-9900kf'))
  it('filtre le socket LGA1151 v2', () => expect(searchProducts('', 'cpu', 'LGA1151 v2').map(p => p.id)).toEqual(expect.arrayContaining(['cpu-8600k','cpu-9700k','cpu-9900kf'])))
  it('retourne une liste vide pour une recherche absente', () => expect(searchProducts('processeur introuvable xyz')).toHaveLength(0))
})

describe('compatibilité', () => {
  it('signale le BIOS et le refroidissement pour la configuration Louis', () => {
    const checks = checkCompatibility({ cpu:'cpu-9900kf', motherboard:'mb-msi-z370', gpu:'gpu-1660s', psu:'psu-evga-w1' })
    expect(checks.find(c => c.id === 'bios')?.status).toBe('warning')
    expect(checks.find(c => c.id === 'cooling')?.status).toBe('unknown')
  })
  it('refuse un mauvais socket', () => expect(checkCompatibility({cpu:'cpu-7600',motherboard:'mb-z390-a-pro'}).find(c => c.id === 'socket')?.status).toBe('error'))
  it('refuse le mauvais type de RAM', () => expect(checkCompatibility({ram:'ram-32-ddr5',motherboard:'mb-z390-a-pro'}).find(c => c.id === 'ram-type')?.status).toBe('error'))
  it('refuse une alimentation insuffisante', () => expect(checkCompatibility({gpu:'gpu-7800xt',psu:'psu-evga-w1'}).find(c => c.id === 'psu-power')?.status).toBe('error'))
})

describe('estimateur', () => {
  const base = { productId:'cpu-9900kf', price:200, shipping:0, protection:0, condition:'good' as const, box:false, invoice:false, warranty:false, tested:true, benchmarks:false, professional:false }
  it('inclut les frais dans le prix total', () => {
    expect(analyzeListing({...base, shipping:15, protection:5}, 2026)?.total).toBe(220)
  })
  it('fait varier la cible selon l’état', () => {
    expect(analyzeListing({...base, condition:'excellent'}, 2026)!.target).toBeGreaterThan(analyzeListing({...base, condition:'worn'}, 2026)!.target!)
  })
})
