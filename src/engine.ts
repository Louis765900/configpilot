import { products } from './data'
import type { Build, Category, CompatibilityCheck, ListingInput, Product } from './types'

export const getProduct = (id?: string) => products.find((item) => item.id === id)
export const money = (value: number | null | undefined) => value == null ? 'À vérifier' : `${Math.round(value).toLocaleString('fr-FR')} €`
export const valueScore = (product: Product) => product.performance && (product.usedPrice ?? product.newPrice)
  ? Math.round(product.performance / (product.usedPrice ?? product.newPrice)! * 100) : null

const normalized = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
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
const s = (product: Product | undefined, key: string) => typeof product?.specs[key] === 'string' ? String(product.specs[key]) : null
const a = (product: Product | undefined, key: string) => Array.isArray(product?.specs[key]) ? product!.specs[key] as string[] : null

export function checkCompatibility(build: Build): CompatibilityCheck[] {
  const cpu = getProduct(build.cpu), gpu = getProduct(build.gpu), mb = getProduct(build.motherboard)
  const ram = getProduct(build.ram), psu = getProduct(build.psu), pcCase = getProduct(build.case)
  const cooling = getProduct(build.cooling), storage = getProduct(build.storage)
  const checks: CompatibilityCheck[] = []
  const add = (id: string, label: string, status: CompatibilityCheck['status'], detail: string) => checks.push({ id, label, status, detail })

  if (cpu && mb) {
    const cs = s(cpu,'Socket'), ms = s(mb,'Socket')
    add('socket','Socket processeur / carte mère', !cs || !ms ? 'unknown' : cs === ms ? 'ok' : 'error',
      !cs || !ms ? 'Socket à vérifier.' : cs === ms ? `${cs} correspond.` : `${cs} n’est pas compatible avec ${ms}.`)
    const chipset = s(mb,'Chipset')
    if (cpu.id === 'cpu-9900kf' && chipset === 'Z370') add('bios','BIOS et génération','warning','Le 9900KF exige un BIOS prenant en charge la 9e génération. Mettre à jour avant de retirer l’ancien CPU et confirmer le modèle MSI exact.')
    else add('bios','BIOS et génération',chipset ? 'ok' : 'unknown',chipset ? 'Aucun conflit de génération connu dans le catalogue local.' : 'Chipset ou version BIOS inconnue.')
    if (cpu.id === 'cpu-9900kf' && mb.id === 'mb-msi-z370') add('vrm','Charge des VRM','warning','Le 9900KF peut fortement solliciter les VRM, surtout avec limites de puissance relevées. Prévoir airflow et réglages raisonnables.')
  }

  if (ram && mb) {
    const rt = s(ram,'Type'), mt = s(mb,'RAM')
    add('ram-type','Type de mémoire',!rt || !mt ? 'unknown' : mt.includes(rt) ? 'ok' : 'error',!rt || !mt ? 'Type de mémoire à vérifier.' : mt.includes(rt) ? `${rt} accepté.` : `${rt} ne correspond pas à ${mt}.`)
    const capacity = n(ram,'Capacité'), maximum = n(mb,'RAM max (Go)')
    add('ram-capacity','Capacité mémoire',capacity == null || maximum == null ? 'unknown' : capacity <= maximum ? 'ok' : 'error',capacity == null || maximum == null ? 'Capacité maximale à vérifier.' : `${capacity} Go sur ${maximum} Go maximum.`)
    const sticks = n(ram,'Barrettes'), slots = n(mb,'Slots RAM')
    add('ram-slots','Emplacements mémoire',sticks == null || slots == null ? 'unknown' : sticks <= slots ? 'ok' : 'error',sticks == null || slots == null ? 'Nombre de barrettes ou de slots inconnu.' : `${sticks} barrettes pour ${slots} slots.`)
  }

  if (mb && pcCase) {
    const format = s(mb,'Format'), accepted = a(pcCase,'Cartes mères')
    add('case-format','Format carte mère / boîtier',!format || !accepted ? 'unknown' : accepted.includes(format) ? 'ok' : 'error',!format || !accepted ? 'Format à vérifier.' : accepted.includes(format) ? `${format} accepté.` : `${format} non accepté par ce boîtier.`)
  }
  if (gpu && pcCase) {
    const length = n(gpu,'Longueur (mm)'), max = n(pcCase,'GPU max (mm)')
    add('gpu-length','Longueur de la carte graphique',length == null || max == null ? 'unknown' : length <= max ? 'ok' : 'error',length == null || max == null ? 'Mesurer la place disponible dans le boîtier.' : `${length} mm pour ${max} mm disponibles.`)
  }
  if (cooling && pcCase) {
    const height = n(cooling,'Hauteur (mm)'), max = n(pcCase,'Ventirad max (mm)'), radiator = n(cooling,'Radiateur (mm)')
    if (height != null) add('cooler-size','Encombrement du refroidissement',max == null ? 'unknown' : height <= max ? 'ok' : 'error',max == null ? `Ventirad de ${height} mm ; limite du boîtier inconnue.` : `${height} mm pour ${max} mm disponibles.`)
    else if (radiator != null) add('cooler-size','Emplacement du radiateur','warning',`Radiateur ${radiator} mm : contrôler l’emplacement exact et l’épaisseur totale.`)
    else add('cooler-size','Encombrement du refroidissement','unknown','Dimensions inconnues.')
  }
  if (cooling && cpu) {
    const sockets = a(cooling,'Sockets compatibles'), socket = s(cpu,'Socket')
    add('cooler-socket','Fixation du refroidissement',!sockets || !socket ? 'unknown' : sockets.includes(socket) ? 'ok' : 'error',!sockets || !socket ? 'Kit de fixation à vérifier.' : sockets.includes(socket) ? `Kit ${socket} listé.` : `Kit ${socket} non listé.`)
  } else if (cpu) add('cooling','Refroidissement processeur','unknown','Aucun refroidissement sélectionné : compatibilité et capacité thermique à confirmer.')

  if (gpu && psu) {
    const need = n(gpu,'PSU recommandé (W)'), watts = n(psu,'Puissance')
    add('psu-power','Puissance de l’alimentation',need == null || watts == null ? 'unknown' : watts >= need ? 'ok' : 'error',need == null || watts == null ? 'Puissance à vérifier.' : `${watts} W disponibles ; ${need} W recommandés par la fiche GPU.`)
    const connector = s(gpu,'Connecteurs'), psuPcie = s(psu,'PCIe'), hasModern = s(psu,'12V-2x6')
    const connectorOk = connector?.includes('12VHPWR') ? hasModern !== 'Non' : Boolean(psuPcie)
    add('psu-connectors','Connecteurs GPU',!connector ? 'unknown' : connectorOk ? 'ok' : 'warning',!connector ? 'Connecteurs à vérifier.' : connectorOk ? `${connector} : alimentation adaptée selon les données disponibles.` : `Contrôler la disponibilité de ${connector}.`)
    if (psu.id === 'psu-evga-w1') add('psu-quality','Qualité de l’alimentation','warning','La puissance nominale est suffisante ici, mais cette plateforme d’entrée de gamme est déconseillée pour un futur GPU exigeant.')
  }
  if (storage && mb && s(storage,'Type') === 'NVMe') {
    const ports = n(mb,'Ports M.2')
    add('m2','Port M.2',ports == null ? 'unknown' : ports > 0 ? 'ok' : 'error',ports == null ? 'Nombre de ports M.2 inconnu.' : `${ports} port(s) M.2 indiqué(s).`)
  }
  if (!checks.length) add('empty','Sélection incomplète','unknown','Ajoute des composants pour lancer les contrôles croisés.')
  return checks
}

export function buildSummary(build: Build) {
  const selected = Object.values(build).map(getProduct).filter(Boolean) as Product[]
  const total = selected.reduce((sum, item) => sum + (item.newPrice ?? item.usedPrice ?? 0), 0)
  const gpuPower = n(getProduct(build.gpu),'Consommation (W)') ?? 0
  const cpuTdp = n(getProduct(build.cpu),'TDP') ?? 0
  const estimated = gpuPower + cpuTdp * 1.35 + 85
  const recommended = Math.ceil((estimated * 1.35) / 50) * 50
  const cpuPerf = getProduct(build.cpu)?.performance ?? null, gpuPerf = getProduct(build.gpu)?.performance ?? null
  return {
    total, estimated: Math.round(estimated), recommended,
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
