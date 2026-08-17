import { createHash } from 'node:crypto'
import { products } from '../../src/data.js'
import type { Product } from '../../src/types.js'
import { componentIdentityHash, normalizeText, slugify } from '../../server/catalog/normalize.js'
import type { ComponentCategory, JsonValue, NormalizedComponent } from '../../server/catalog/types.js'
import { flag, importComponents, loadLocalEnv } from './common.js'

loadLocalEnv()
const categoryMap: Record<Product['category'], ComponentCategory> = {
  cpu: 'cpu', gpu: 'gpu', motherboard: 'motherboard', ram: 'ram', psu: 'psu', case: 'case',
  storage: 'storage', cooling: 'cooling', expansion: 'network',
}

function normalizeLocal(product: Product): NormalizedComponent {
  const specs = product.specs as Record<string, JsonValue>
  const mpn = product.reference && product.reference !== 'À vérifier' ? product.reference : null
  const base = {
    category: categoryMap[product.category], subcategory: product.category === 'expansion' ? 'expansion' : null,
    brand: product.brand, manufacturer: product.brand, model: product.name, series: product.series || null,
    name: product.name, slug: `${slugify(product.name)}-${createHash('sha1').update(product.id).digest('hex').slice(0, 8)}`,
    mpn, manufacturerPartNumbers: mpn ? [mpn] : [], gtin: null, ean: null, upc: null,
    description: product.notes || null, shortDescription: product.usage || null,
    releaseDate: product.year ? `${product.year}-01-01` : null, discontinued: false,
    specifications: specs, media: { main: null, gallery: [] as string[] },
    primarySource: 'configpilot_local' as const, sourceRecordId: product.id, sourceUrl: product.source ?? null,
    sourceLicense: 'ConfigPilot proprietary catalog', sourcePriority: 90, sourceConfidence: product.confidence === 'Bonne' ? 92 : product.confidence === 'Moyenne' ? 72 : 50,
    rawData: { id: product.id, category: product.category, reference: product.reference },
  }
  const completeness = Math.min(100, 35 + (mpn ? 25 : 0) + Math.min(35, Object.keys(specs).length * 3))
  return {
    ...base, identityHash: componentIdentityHash(base), completenessScore: completeness,
    confidenceScore: Math.round((base.sourceConfidence * 3 + completeness) / 4), missingImage: true,
    missingMpn: !mpn, missingSpecs: Object.keys(specs).length === 0,
    needsReview: !mpn || Object.keys(specs).length < 2,
    searchDocument: normalizeText([product.name, product.brand, product.reference, product.series, ...Object.values(specs).map(String)].join(' ')),
  }
}

async function* records() { for (const product of products) yield normalizeLocal(product) }
await importComponents('configpilot_local', '2.1.0', records(), { dryRun: flag('dry-run') })
