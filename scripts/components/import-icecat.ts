import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import { assertCategory, componentIdentityHash, normalizeText, slugify } from '../../server/catalog/normalize.js'
import type { JsonValue, NormalizedComponent } from '../../server/catalog/types.js'
import { flag, importComponents, loadLocalEnv } from './common.js'

loadLocalEnv()
if (process.env.ICECAT_ENABLED !== 'true') {
  console.log('ICECAT NOT CONFIGURED')
  process.exit(0)
}
if (!process.env.ICECAT_USERNAME || !process.env.ICECAT_API_TOKEN) throw new Error('ICECAT_USERNAME et ICECAT_API_TOKEN sont requis.')
const exportPath = process.env.ICECAT_EXPORT_PATH
if (!exportPath || !existsSync(resolve(exportPath))) {
  throw new Error('ICECAT_EXPORT_PATH doit pointer vers un export JSON/JSONL autorisé par votre abonnement. Aucun endpoint non vérifié ne sera inventé.')
}

const schema = z.object({
  icecat_id: z.union([z.string(), z.number()]).transform(String),
  category: z.string(), brand: z.string().min(1), mpn: z.string().min(1),
  name: z.string().min(1), gtin: z.string().optional(), ean: z.string().optional(), upc: z.string().optional(),
  description: z.string().optional(), short_description: z.string().optional(),
  specifications: z.record(z.string(), z.unknown()).optional().default({}),
  images: z.object({ main: z.string().url().nullable().optional(), gallery: z.array(z.string().url()).optional() }).optional(),
  source_url: z.string().url().optional(), license: z.string().min(1),
})

const text = readFileSync(resolve(exportPath), 'utf8')
const rawRecords = text.trim().startsWith('[') ? JSON.parse(text) : text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))

async function* records() {
  for (const raw of rawRecords) {
    const item = schema.parse(raw)
    const category = assertCategory(item.category)
    const specs = item.specifications as Record<string, JsonValue>
    const media = { main: item.images?.main ?? null, gallery: item.images?.gallery ?? [] }
    const base = {
      category, subcategory: null, brand: item.brand, manufacturer: item.brand, model: item.name, series: null,
      name: item.name, slug: `${slugify(item.name)}-${createHash('sha1').update(`icecat:${item.icecat_id}`).digest('hex').slice(0, 8)}`,
      mpn: item.mpn, manufacturerPartNumbers: [item.mpn], gtin: item.gtin ?? null, ean: item.ean ?? null, upc: item.upc ?? null,
      description: item.description ?? null, shortDescription: item.short_description ?? null, releaseDate: null,
      discontinued: false, specifications: specs, media, primarySource: 'icecat' as const,
      sourceRecordId: item.icecat_id, sourceUrl: item.source_url ?? null, sourceLicense: item.license,
      sourcePriority: 60, sourceConfidence: 82, rawData: raw as Record<string, JsonValue>,
    }
    const completeness = Math.min(100, 40 + 25 + Math.min(20, Object.keys(specs).length * 2) + (media.main ? 10 : 0) + (item.description ? 5 : 0))
    yield {
      ...base, identityHash: componentIdentityHash(base), completenessScore: completeness,
      confidenceScore: Math.round((82 * 3 + completeness) / 4), missingImage: !media.main,
      missingMpn: false, missingSpecs: Object.keys(specs).length === 0, needsReview: false,
      searchDocument: normalizeText([item.name, item.brand, item.mpn, item.gtin, item.ean, item.upc].join(' ')),
    } satisfies NormalizedComponent
  }
}

await importComponents('icecat', undefined, records(), { dryRun: flag('dry-run') })
