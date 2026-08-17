import { describe, expect, it } from 'vitest'
import { products } from './data'
import discoveryFeed from './catalog/discovery.generated.json'
import hardwareFeed from './catalog/hardware-identifiers.generated.json'
import rejectedFeed from './catalog/rejected.generated.json'
import promotedFeed from './catalog/promoted.generated.json'
import verificationFeed from './catalog/candidate-verification.generated.json'
import discoveryReport from './catalog/discovery-report.generated.json'
import sourceRegistry from './catalog/source-registry.json'
import manufacturerEvidence from './catalog/manufacturer-evidence.generated.json'
import manufacturerSpecs from './catalog/manufacturer-specs.generated.json'
import { analyzeListing, getProduct, searchProducts } from './engine'
import { buildVerdict, checkCompatibility, estimateSystemDraw } from './compatibility'
import { categoryValueMedian, priceInsight, priceTrack } from './pricing'

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
  it('mesure une recherche gratuite sur toutes les catégories', () => {
    const officialSources = sourceRegistry.sources.filter(source => source.enabled && source.type === 'manufacturer-index')
    const officialSourceIds = new Set(officialSources.map(source => source.id))
    const officialCandidates = discoveryFeed.candidates.filter(candidate => officialSourceIds.has(candidate.sourceId))
    expect(discoveryReport.totals.registeredQueries).toBe(89)
    expect(discoveryReport.totals.registeredBrands).toBeGreaterThanOrEqual(50)
    expect(discoveryReport.totals.registeredCategories).toBe(9)
    expect(discoveryReport.coverage).toHaveLength(9)
    expect(discoveryReport.coverage.every(item => item.registeredBrands.length >= 2)).toBe(true)
    expect(discoveryReport.totals.categoriesWithCandidates).toBe(9)
    expect(discoveryReport.totals.officialCandidates).toBe(222)
    expect(officialSources).toHaveLength(5)
    expect(officialCandidates).toHaveLength(222)
    expect(officialCandidates.every(candidate => candidate.status === 'À vérifier')).toBe(true)
    expect(officialCandidates.some(candidate => candidate.sourceId.includes('gskill'))).toBe(false)
    expect(sourceRegistry.policy.publishAutomatically).toBe(false)
    expect(sourceRegistry.policy.requestBudget).toBeGreaterThanOrEqual(sourceRegistry.queries.length * sourceRegistry.policy.wikidataMaxPagesPerQuery)
  })
  it('conserve les preuves automatiques en attente de relecture humaine', () => {
    const officialCandidateIds = new Set(discoveryFeed.candidates.filter(candidate => candidate.sourceId.endsWith('-official-index')).map(candidate => candidate.id))
    expect(manufacturerEvidence.summary.officialCandidates).toBe(222)
    expect(manufacturerEvidence.summary.collected).toBe(20)
    expect(manufacturerEvidence.evidence).toHaveLength(20)
    expect(manufacturerEvidence.evidence.every(item => officialCandidateIds.has(item.candidateId))).toBe(true)
    expect(manufacturerEvidence.evidence.every(item => item.review.status === 'pending')).toBe(true)
    expect(manufacturerEvidence.evidence.some(item => item.status === 'structured-product')).toBe(true)
  })
  it('normalise les caractéristiques constructeur sans les publier', () => {
    const evidenceIds = new Set(manufacturerEvidence.evidence.map(item => item.candidateId))
    const specs = manufacturerSpecs.records.flatMap(record => record.specs)
    expect(manufacturerSpecs.policy.publishAutomatically).toBe(false)
    expect(manufacturerSpecs.policy.pageBudget).toBe(sourceRegistry.policy.manufacturerSpecPageBudget)
    expect(manufacturerSpecs.records.length).toBeGreaterThanOrEqual(20)
    expect(manufacturerSpecs.records.every(record => evidenceIds.has(record.candidateId))).toBe(true)
    expect(manufacturerSpecs.records.every(record => record.review.status === 'pending')).toBe(true)
    expect(specs.length).toBe(manufacturerSpecs.summary.normalizedValues)
    expect(specs.length).toBeGreaterThan(40)
    expect(specs.every(spec => spec.rawField && spec.rawValue && spec.sourceUrl.startsWith('https://'))).toBe(true)
    expect(specs.every(spec => ['high','medium','low'].includes(spec.confidence))).toBe(true)
    expect(specs.every(spec => spec.method !== 'meta' || spec.confidence === 'low')).toBe(true)
    expect(new Set(specs.map(spec => spec.method))).toContain('spec-table')
  })
  it('laisse inconnue une caractéristique que le constructeur ne publie pas', () => {
    const withGaps = manufacturerSpecs.records.filter(record => record.missingFields.length > 0)
    expect(withGaps.length).toBeGreaterThan(0)
    expect(withGaps.every(record => record.missingFields.every(field => !record.specs.some(spec => spec.field === field)))).toBe(true)
    expect(verificationFeed.candidates.filter(item => item.status === 'verified')).toHaveLength(16)
  })
  it('retrouve le i9-9900KF sans tenir compte de la casse', () => expect(searchProducts('I9-9900kf')[0]?.id).toBe('cpu-9900kf'))
  it('filtre le socket LGA1151 v2', () => expect(searchProducts('', 'cpu', 'LGA1151 v2').map(p => p.id)).toEqual(expect.arrayContaining(['cpu-8600k','cpu-9700k','cpu-9900kf'])))
  it('retourne une liste vide pour une recherche absente', () => expect(searchProducts('processeur introuvable xyz')).toHaveLength(0))
})

const check = (build: Parameters<typeof checkCompatibility>[0], id: string) =>
  checkCompatibility(build).find(item => item.id === id)

describe('compatibilité — conflits physiques', () => {
  it('refuse un socket qui ne correspond pas', () => {
    const socket = check({ cpu: 'cpu-7600', motherboard: 'mb-z390-a-pro' }, 'socket')
    expect(socket?.status).toBe('error')
    expect(socket?.detail).toContain('AM5')
    expect(socket?.basis).toBe('Processeur.Socket · Carte mère.Socket')
  })
  it('refuse un type de mémoire incompatible', () =>
    expect(check({ ram: 'ram-32-ddr5', motherboard: 'mb-z390-a-pro' }, 'ram-type')?.status).toBe('error'))
  it('refuse plus de barrettes que d’emplacements', () => {
    const slots = check({ ram: 'ram-32-ddr4', motherboard: 'mb-b550' }, 'ram-slots')
    expect(slots?.status).toBe('ok')
  })
  it('refuse une alimentation sous la recommandation du fabricant du GPU', () =>
    expect(check({ gpu: 'gpu-7800xt', psu: 'psu-evga-w1' }, 'psu-power')?.status).toBe('error'))
  it('refuse une alimentation ATX dans un boîtier qui n’accepte que le SFX', () => {
    const format = check({ psu: 'psu-rm750e', case: 'case-nr200' }, 'psu-format')
    expect(format?.status).toBe('error')
    expect(format?.detail).toContain('SFX')
  })
  it('refuse une carte mère ATX dans un boîtier Mini-ITX', () =>
    expect(check({ motherboard: 'mb-b650', case: 'case-nr200' }, 'case-format')?.status).toBe('error'))
  it('signale l’absence de sortie vidéo quand le processeur n’a pas d’iGPU', () => {
    const output = check({ cpu: 'cpu-5600' }, 'display-output')
    expect(output?.status).toBe('error')
    expect(output?.detail).toContain('n’affichera rien')
  })
})

describe('compatibilité — nuances et données manquantes', () => {
  it('valide une génération native sans exiger de mise à jour', () => {
    const chipset = check({ cpu: 'cpu-9900kf', motherboard: 'mb-z390-a-pro' }, 'chipset')
    expect(chipset?.status).toBe('ok')
    expect(chipset?.detail).toContain('Z390')
  })
  it('avertit quand la génération demande une mise à jour du BIOS', () => {
    const chipset = check({ cpu: 'cpu-5600', motherboard: 'mb-b550' }, 'chipset')
    expect(chipset?.status).toBe('warning')
    expect(chipset?.detail).toContain('flash BIOS sans processeur')
  })
  it('ne conclut pas quand une dimension n’est pas publiée', () => {
    const height = check({ cooling: 'cool-lf3-240', case: 'case-pop-air' }, 'cooler-height')
    expect(height?.status).toBe('unknown')
    expect(height?.detail).toContain('non renseignés')
  })
  it('vérifie qu’un radiateur a bien un emplacement listé', () =>
    expect(check({ cooling: 'cool-lf3-240', case: 'case-pop-air' }, 'radiator-mount')?.status).toBe('ok'))
  it('avertit sur un profil mémoire propre à l’autre fondeur', () => {
    const profile = check({ ram: 'ram-32-ddr5', cpu: 'cpu-13600k' }, 'ram-profile')
    expect(profile?.status).toBe('warning')
    expect(profile?.detail).toContain('EXPO')
  })
  it('avertit sur un connecteur 12VHPWR absent de l’alimentation', () =>
    expect(check({ gpu: 'gpu-4070s', psu: 'psu-cx650' }, 'psu-connectors')?.status).toBe('warning'))
  it('accepte des connecteurs PCIe en nombre suffisant', () =>
    expect(check({ gpu: 'gpu-3060', psu: 'psu-rm750e' }, 'psu-connectors')?.status).toBe('ok'))
  it('n’émet jamais de verdict favorable sans champ lu', () => {
    const checks = checkCompatibility({ cpu: 'cpu-7800x3d', motherboard: 'mb-b650', ram: 'ram-32-ddr5' })
    expect(checks.every(item => item.basis.length > 0)).toBe(true)
    expect(checks.filter(item => item.status === 'ok').every(item => !item.detail.includes('non renseigné'))).toBe(true)
  })
  it('estime la consommation à partir du TDP et du GPU', () =>
    expect(estimateSystemDraw({ cpu: 'cpu-7800x3d', gpu: 'gpu-7800xt' })).toBe(Math.round(120 * 1.35) + 263 + 85))
})

describe('compatibilité — synthèse', () => {
  it('classe un conflit avant un avertissement', () => {
    const verdict = buildVerdict(checkCompatibility({ cpu: 'cpu-7600', motherboard: 'mb-z390-a-pro' }))
    expect(verdict.status).toBe('error')
    expect(verdict.counts.error).toBeGreaterThan(0)
  })
  it('valide une configuration cohérente de bout en bout', () => {
    const verdict = buildVerdict(checkCompatibility({
      cpu: 'cpu-7600', gpu: 'gpu-7800xt', motherboard: 'mb-b650', ram: 'ram-32-ddr5',
      psu: 'psu-rm750e', case: 'case-pop-air', storage: 'ssd-sn770', cooling: 'cool-lf3-240',
    }))
    expect(verdict.counts.error).toBe(0)
  })
  it('annonce une configuration vide plutôt qu’une configuration valide', () =>
    expect(buildVerdict(checkCompatibility({})).status).toBe('unknown'))
})

describe('trajectoire de prix', () => {
  it('ancre la courbe sur le tarif de lancement et le prix actuel', () => {
    const track = priceTrack(getProduct('cpu-5600')!, 2026)
    expect(track.launch).toBe(199)
    expect(track.points[0]).toMatchObject({ year: 2022, value: 199, kind: 'launch' })
    expect(track.points.at(-1)).toMatchObject({ year: 2026, value: 105, kind: 'current' })
    expect(track.dropPercent).toBe(47)
    expect(track.method).toContain('Interpolation')
  })
  it('ne fabrique aucune trajectoire sans tarif de lancement documenté', () => {
    const orphan = products.find(product => product.launchPrice == null)!
    const track = priceTrack(orphan, 2026)
    expect(track.launch).toBeNull()
    expect(track.dropPercent).toBeNull()
    expect(track.points.filter(point => point.kind !== 'observed')).toHaveLength(0)
  })
  it('laisse la liste des relevés manuels vide tant que personne n’en saisit', () =>
    expect(products.every(product => (product.observations?.length ?? 0) === 0)).toBe(true))
  it('situe une référence face à la médiane de sa catégorie', () =>
    expect(categoryValueMedian('cpu')).toBeGreaterThan(0))
})

describe('verdict d’achat', () => {
  it('argumente chaque facteur retenu', () => {
    const insight = priceInsight(getProduct('cpu-5600')!, 2026)
    expect(insight.score).not.toBeNull()
    expect(insight.reasons.length).toBeGreaterThanOrEqual(3)
    expect(insight.reasons.some(reason => reason.text.includes('décote'))).toBe(true)
  })
  it('pénalise une plateforme fermée', () => {
    const closed = priceInsight(getProduct('cpu-9900kf')!, 2026)
    expect(closed.reasons.some(reason => reason.status === 'warning' && reason.text.includes('Socket'))).toBe(true)
  })
  it('valorise un socket encore alimenté en processeurs', () => {
    const open = priceInsight(getProduct('cpu-7600')!, 2026)
    expect(open.reasons.some(reason => reason.status === 'ok' && reason.text.includes('AM5'))).toBe(true)
  })
  it('refuse de conclure sans aucune donnée exploitable', () => {
    const bare = priceInsight({ ...getProduct('cpu-5600')!, launchPrice: null, newPrice: null, usedPrice: null, performance: null, year: null, specs: {} }, 2026)
    expect(bare.verdict).toBe('Données insuffisantes')
    expect(bare.score).toBeNull()
  })
})

describe('catalogue public', () => {
  it('ne contient plus de fiche personnelle ni de configuration privée', () => {
    const serialized = JSON.stringify(products.map(product => [product.name, product.usage, product.notes]))
    expect(serialized).not.toContain('Louis')
    expect(serialized).not.toContain('modèle à confirmer')
  })
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
