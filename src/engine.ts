import { products } from './data'
import { getCachedRemoteProduct } from './component-api'
import type { Build, Category, ListingInput, Product } from './types'

export const getProduct = (id?: string) => products.find((item) => item.id === id) ?? getCachedRemoteProduct(id)
export const money = (value: number | null | undefined) => value == null ? 'À vérifier' : `${Math.round(value).toLocaleString('fr-FR')} €`
export const valueScore = (product: Product) => product.performance && (product.usedPrice ?? product.newPrice)
  ? Math.round(product.performance / (product.usedPrice ?? product.newPrice)! * 100) : null

const normalized = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
export function searchProducts(query: string, category?: Category | 'all', socket?: string) {
  const needle = normalized(query).trim()
  return products.filter((product) => {
    if (category && category !== 'all' && product.category !== category) return false
    if (socket && normalized(product.specs.Socket) !== normalized(socket)) return false
    if (!needle) return true
    return normalized([product.name, product.reference, product.brand, product.series, ...Object.values(product.specs)].flat().join(' ')).includes(needle)
  })
}

const n = (product: Product | undefined, key: string) => {
  const value = product?.specs[key]
  return typeof value === 'number' ? value : null
}

export function buildSummary(build: Build) {
  const selected = Object.values(build).map(getProduct).filter(Boolean) as Product[]
  const total = selected.reduce((sum, item) => sum + (item.newPrice ?? item.usedPrice ?? 0), 0)
  const priced = selected.filter(item => item.newPrice != null || item.usedPrice != null).length
  const gpuPower = n(getProduct(build.gpu),'Consommation (W)') ?? 0
  const cpuTdp = n(getProduct(build.cpu),'TDP') ?? 0
  const estimated = gpuPower + cpuTdp * 1.35 + 85
  const recommended = Math.ceil((estimated * 1.35) / 50) * 50
  const cpuPerf = getProduct(build.cpu)?.performance ?? null, gpuPerf = getProduct(build.gpu)?.performance ?? null
  return {
    total, priced, parts: selected.length, estimated: Math.round(estimated), recommended,
    gaming: cpuPerf && gpuPerf ? Math.round(cpuPerf * .35 + gpuPerf * .65) : null,
    application: cpuPerf ? Math.round(cpuPerf * .9) : null,
    balance: cpuPerf && gpuPerf ? Math.abs(cpuPerf - gpuPerf) <= 15 ? 'Équilibré' : cpuPerf > gpuPerf ? 'GPU limitant probable' : 'CPU limitant possible' : 'À vérifier',
  }
}

const conditionFactor: Record<ListingInput['condition'], number> = { sealed: 1.08, 'like-new': 1, excellent: .96, good: .9, worn: .78, untested: .55, repair: .3 }
const categoryRisk: Record<Category, number> = { cpu: 1, gpu: .94, motherboard: .9, ram: 1, psu: .82, case: .96, storage: .83, cooling: .88, expansion: .9 }

export function analyzeListing(input: ListingInput, nowYear = new Date().getFullYear()) {
  const product = getProduct(input.productId)
  if (!product) return null
  const total = Math.max(0,input.price) + Math.max(0,input.shipping) + Math.max(0,input.protection)
  const age = product.year == null ? null : Math.max(0, nowYear - product.year)
  const base = product.usedPrice ?? (product.newPrice ? product.newPrice * Math.max(.25, .84 - (age ?? 0) * .055) : null)
  if (base == null) return { product, total, age, confidence: 'Données insuffisantes', target: null, maximum: null, verdict: 'Données insuffisantes', score: 0, delta: null }
  const evidence = (input.warranty ? .04 : 0) + (input.invoice ? .025 : 0) + (input.box ? .02 : 0) + (input.tested ? .04 : -.05) + (input.benchmarks ? .025 : 0) + (input.professional ? .025 : 0)
  const target = Math.round(base * conditionFactor[input.condition] * categoryRisk[product.category] * (1 + evidence))
  const maximum = Math.round(target * 1.1)
  const delta = Math.round((total - target) / target * 100)
  let verdict = delta <= -18 ? 'Excellente affaire' : delta <= -7 ? 'Bon prix' : delta <= 6 ? 'Prix correct' : delta <= 18 ? 'Prix à négocier' : 'Trop cher'
  if (input.condition === 'untested' || input.condition === 'repair') verdict = total > target ? 'Risque élevé' : 'Prix à négocier'
  const score = Math.max(0, Math.min(100, Math.round(75 - delta + evidence * 100)))
  const evidenceCount = [input.invoice,input.warranty,input.tested,input.benchmarks].filter(Boolean).length
  const confidence = input.condition === 'repair' ? 'Faible' : evidenceCount >= 3 ? 'Bonne' : evidenceCount >= 1 ? 'Moyenne' : 'Faible'
  return { product, total, age, confidence, target, maximum, verdict, score, delta }
}

export const categoryOrder: Category[] = ['cpu','gpu','motherboard','ram','psu','case','storage','cooling','expansion']

/** Regroupement des caractéristiques par thème, pour une lecture ordonnée des fiches. */
const SPEC_GROUPS: Record<Category, [string, string[]][]> = {
  cpu: [
    ['Plateforme', ['Socket', 'Architecture', 'Mémoire', 'iGPU']],
    ['Calcul', ['Cœurs', 'Threads', 'Base (GHz)', 'Boost (GHz)', 'Cache (Mo)']],
    ['Énergie', ['TDP']],
    ['Indices', ['Indice monocœur', 'Indice multicœur', 'Indice gaming']],
  ],
  gpu: [
    ['Puce et mémoire', ['Architecture', 'VRAM', 'Type VRAM']],
    ['Intégration', ['Longueur (mm)', 'Slots', 'Connecteurs', 'Consommation (W)', 'PSU recommandé (W)']],
    ['Rendu', ['1080p', '1440p', '4K', 'Ray tracing', 'Upscaling', 'Encodeur']],
  ],
  motherboard: [
    ['Plateforme', ['Socket', 'Chipset', 'Format', 'Compatibilité CPU', 'BIOS Flashback']],
    ['Mémoire', ['RAM', 'Slots RAM', 'RAM max (Go)', 'RAM max (MHz)']],
    ['Connectique', ['PCIe', 'Ports M.2', 'Ports SATA', 'WiFi', 'Bluetooth']],
    ['Alimentation', ['VRM']],
  ],
  ram: [
    ['Module', ['Type', 'Capacité', 'Barrettes', 'Format']],
    ['Réglages', ['Fréquence', 'Latence', 'Tension', 'Profil', 'ECC']],
  ],
  psu: [
    ['Sortie', ['Puissance', 'Certification', 'Norme ATX', 'ATX 3.x']],
    ['Intégration', ['Format', 'Modularité', 'PCIe', '12V-2x6']],
    ['Fiabilité', ['Tier', 'Protections', 'Garantie']],
  ],
  case: [
    ['Format', ['Format', 'Cartes mères', 'Formats alimentation']],
    ['Dégagements', ['GPU max (mm)', 'Ventirad max (mm)', 'Radiateurs']],
    ['Ventilation et stockage', ['Ventilateurs', 'Ventilateurs inclus', 'Airflow', 'Stockage']],
  ],
  storage: [
    ['Interface', ['Type', 'Interface', 'Format']],
    ['Capacité et débit', ['Capacité', 'Lecture', 'Écriture']],
    ['Endurance', ['NAND', 'DRAM', 'Endurance']],
  ],
  cooling: [
    ['Type', ['Type', 'Capacité thermique', 'Sockets compatibles']],
    ['Dimensions', ['Hauteur (mm)', 'Radiateur (mm)']],
    ['Ventilation', ['Ventilateurs', 'Bruit (dBA)']],
  ],
  expansion: [
    ['Carte', ['Type', 'Interface', 'Profil']],
    ['Fonctions', ['Fonctions', 'Antenne']],
  ],
}

/** Caractéristiques d'une fiche, ordonnées par thème puis complétées par les champs restants. */
export function groupedSpecs(product: Product): [string, [string, Product['specs'][string]][]][] {
  const groups = SPEC_GROUPS[product.category] ?? []
  const used = new Set(groups.flatMap(([, keys]) => keys))
  const sections = groups
    .map(([title, keys]) => [title, keys.filter(key => key in product.specs).map(key => [key, product.specs[key]] as [string, Product['specs'][string]])] as [string, [string, Product['specs'][string]][]])
    .filter(([, entries]) => entries.length > 0)
  const rest = Object.entries(product.specs).filter(([key]) => !used.has(key))
  return rest.length ? [...sections, ['Autres caractéristiques', rest]] : sections
}

/** Rendu lisible d'une valeur de caractéristique, sans jamais masquer une donnée absente. */
export const formatSpec = (value: Product['specs'][string]) =>
  value == null ? 'À vérifier' : Array.isArray(value) ? value.join(', ') : String(value)
