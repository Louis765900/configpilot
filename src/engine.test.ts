import { describe, expect, it } from 'vitest'
import { products } from './data'
import discoveryFeed from './catalog/discovery.generated.json'
import hardwareFeed from './catalog/hardware-identifiers.generated.json'
import rejectedFeed from './catalog/rejected.generated.json'
import promotedFeed from './catalog/promoted.generated.json'
import verificationFeed from './catalog/candidate-verification.generated.json'
import sourceRegistry from './catalog/source-registry.json'
import { analyzeListing, checkCompatibility, searchProducts } from './engine'

describe('catalogue', () => {
  it('intègre plus de mille références documentaires sans inventer de prix', () => {
    const documentary = products.filter(product => product.id.startsWith('doc-'))
    expect(products.length).toBeGreaterThan(1100)
    expect(documentary.length).toBeGreaterThan(1000)
    expect(documentary.every(product => product.newPrice === null && product.usedPrice === null)).toBe(true)
  })
  it('maintient une quarantaine automatique issue uniquement de sources enregistrées', () => {
    const registered = new Set(sourceRegistry.sources.filter(source => source.enabled).map(source => source.id))
    const quarantined = [...discoveryFeed.candidates, ...hardwareFeed.identifiers, ...rejectedFeed.candidates]
    expect(quarantined.length + promotedFeed.length).toBeGreaterThanOrEqual(340)
    expect(quarantined.every(candidate => candidate.status === 'À vérifier')).toBe(true)
    expect(quarantined.every(candidate => registered.has(candidate.sourceId))).toBe(true)
  })
  it('sépare les références commerciales des identifiants et faux positifs', () => {
    expect(discoveryFeed.candidates.length).toBeGreaterThan(30)
    expect(discoveryFeed.candidates.some(candidate => candidate.triage === 'retail-product' && candidate.promotable)).toBe(true)
    expect(discoveryFeed.candidates.filter(candidate => candidate.triage !== 'retail-product').every(candidate => !candidate.promotable)).toBe(true)
    expect(hardwareFeed.identifiers.length).toBeGreaterThanOrEqual(290)
    expect(hardwareFeed.identifiers.every(candidate => candidate.triage === 'hardware-identifier' && !candidate.promotable)).toBe(true)
    expect(rejectedFeed.candidates.length).toBeGreaterThanOrEqual(1)
    expect(rejectedFeed.candidates).toContainEqual(expect.objectContaining({label:'GeForce Now',triage:'false-positive',promotable:false}))
  })
  it('intègre uniquement les modèles reliés à une preuve constructeur', () => {
    expect(promotedFeed).toHaveLength(16)
    expect(promotedFeed.every(product => product.candidateId && product.source.startsWith('https://'))).toBe(true)
    expect(promotedFeed.every(product => product.newPrice === null && product.usedPrice === null)).toBe(true)
    expect(verificationFeed.candidates.filter(item => item.status === 'verified')).toHaveLength(16)
    expect(verificationFeed.candidates).toContainEqual(expect.objectContaining({candidateId:'candidate-1ae6b737a3d09a6d',status:'variant-required'}))
    expect(searchProducts('Intel Arc B580')[0]?.source).toContain('intel.com')
  })
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
