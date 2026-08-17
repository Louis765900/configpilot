export const componentCategories = [
  'cpu', 'gpu', 'motherboard', 'ram', 'storage', 'psu', 'case', 'cooling',
  'fan', 'network', 'sound_card', 'capture_card', 'monitor', 'thermal_compound',
] as const

export type ComponentCategory = typeof componentCategories[number]
export type JsonScalar = string | number | boolean | null
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue }

export type ComponentMedia = { main: string | null; gallery: string[] }
export type SourceKey = 'configpilot_local' | 'buildcores' | 'icecat' | 'pcpart_dataset'

export type NormalizedComponent = {
  category: ComponentCategory
  subcategory: string | null
  brand: string
  manufacturer: string | null
  model: string | null
  series: string | null
  name: string
  slug: string
  mpn: string | null
  manufacturerPartNumbers: string[]
  gtin: string | null
  ean: string | null
  upc: string | null
  description: string | null
  shortDescription: string | null
  releaseDate: string | null
  discontinued: boolean
  specifications: Record<string, JsonValue>
  media: ComponentMedia
  primarySource: SourceKey
  sourceRecordId: string
  sourceUrl: string | null
  sourceLicense: string
  sourcePriority: number
  sourceConfidence: number
  rawData: Record<string, JsonValue>
  identityHash: string
  completenessScore: number
  confidenceScore: number
  missingImage: boolean
  missingMpn: boolean
  missingSpecs: boolean
  needsReview: boolean
  searchDocument: string
}

export type ImportReport = {
  source: SourceKey
  revision?: string
  read: number
  created: number
  updated: number
  skipped: number
  errors: number
  categories: Record<string, number>
  errorSamples: { recordId?: string; message: string }[]
}

export type ComponentListParams = {
  q?: string
  category?: ComponentCategory
  brand?: string
  socket?: string
  capacity?: number
  page: number
  limit: number
  sort: 'relevance' | 'name' | 'newest' | 'completeness'
}
