import { createHash } from 'node:crypto'
import { z } from 'zod'
import { componentCategories, type ComponentCategory, type JsonValue, type NormalizedComponent, type SourceKey } from './types.js'

const metadataSchema = z.object({
  name: z.string().min(1),
  manufacturer: z.string().min(1),
  part_numbers: z.array(z.union([z.string(), z.number()])).optional().default([]),
  series: z.string().nullable().optional(),
  variant: z.string().nullable().optional(),
  releaseYear: z.union([z.number(), z.string()]).nullable().optional(),
}).passthrough()

const buildCoresSchema = z.object({
  opendb_id: z.string().uuid(),
  metadata: metadataSchema,
  general_product_information: z.record(z.string(), z.unknown()).optional(),
}).passthrough()

const buildCoresCategories: Record<string, { category: ComponentCategory; subcategory: string | null }> = {
  CPU: { category: 'cpu', subcategory: null },
  GPU: { category: 'gpu', subcategory: null },
  Motherboard: { category: 'motherboard', subcategory: null },
  RAM: { category: 'ram', subcategory: null },
  Storage: { category: 'storage', subcategory: null },
  PSU: { category: 'psu', subcategory: null },
  PCCase: { category: 'case', subcategory: null },
  CPUCooler: { category: 'cooling', subcategory: 'cpu_cooler' },
  CaseFan: { category: 'fan', subcategory: 'case_fan' },
  NetworkCard: { category: 'network', subcategory: null },
  SoundCard: { category: 'sound_card', subcategory: null },
  CaptureCard: { category: 'capture_card', subcategory: null },
  Monitor: { category: 'monitor', subcategory: null },
  ThermalCompound: { category: 'thermal_compound', subcategory: null },
}

export const relevantBuildCoresDirectories = Object.keys(buildCoresCategories)

export function normalizeText(value: unknown) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function normalizeIdentifier(value: unknown) {
  return String(value ?? '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function slugify(value: string) {
  return normalizeText(value).replace(/\s+/g, '-').slice(0, 160) || 'composant'
}

const asJson = (value: unknown): JsonValue => JSON.parse(JSON.stringify(value ?? null)) as JsonValue

function categorySpecs(directory: string, data: Record<string, unknown>): Record<string, JsonValue> {
  const pick = (keys: string[]) => Object.fromEntries(keys.filter(key => data[key] !== undefined).map(key => [key, asJson(data[key])]))
  switch (directory) {
    case 'CPU': return pick(['socket', 'microarchitecture', 'coreFamily', 'cores', 'clocks', 'cache', 'specifications'])
    case 'GPU': return pick(['chipset_manufacturer', 'chipset', 'memory', 'memory_type', 'memory_bus', 'core_base_clock', 'core_boost_clock', 'interface', 'length', 'height', 'width', 'tdp', 'total_slot_width', 'power_connectors', 'video_outputs', 'cooling'])
    case 'Motherboard': return pick(['socket', 'chipset', 'form_factor', 'memory', 'storage_devices', 'pcie_slots', 'm2_slots', 'onboard_ethernet', 'wireless_networking', 'bios_features', 'back_panel_ports', 'ecc_support', 'raid_support'])
    case 'RAM': return pick(['ram_type', 'capacity', 'modules', 'speed', 'cas_latency', 'timings', 'voltage', 'ecc', 'registered', 'form_factor', 'profile_support'])
    case 'Storage': return pick(['type', 'storage_type', 'capacity', 'interface', 'nvme', 'form_factor', 'read_speed', 'write_speed', 'endurance', 'cache', 'rpm'])
    case 'PSU': return pick(['wattage', 'efficiency_rating', 'modular', 'form_factor', 'length', 'connectors', 'atx_version', 'fanless'])
    case 'PCCase': return pick(['form_factor', 'supported_motherboard_form_factors', 'supported_power_supply_form_factors', 'max_video_card_length', 'max_cpu_cooler_height', 'radiator_support', 'fan_support', 'dimensions', 'volume', 'weight', 'expansion_slots'])
    case 'CPUCooler': return pick(['water_cooled', 'cpu_sockets', 'height', 'radiator_size', 'fan_size', 'fan_quantity', 'min_fan_rpm', 'max_fan_rpm', 'min_noise_level', 'max_noise_level', 'fanless'])
    case 'CaseFan': return pick(['size', 'quantity', 'min_airflow', 'max_airflow', 'min_noise_level', 'max_noise_level', 'pwm', 'connector', 'static_pressure', 'flow_direction'])
    case 'Monitor': return pick(['screen_size', 'resolution', 'refresh_rate', 'panel_type', 'response_time', 'aspect_ratio', 'connectors', 'max_brightness', 'hdr', 'adaptive_sync'])
    default: return pick(Object.keys(data).filter(key => !['opendb_id', 'metadata', 'general_product_information'].includes(key)))
  }
}

export function componentIdentityHash(input: Pick<NormalizedComponent, 'brand' | 'name' | 'category' | 'specifications'>) {
  const discriminators = ['capacity', 'memory', 'modules', 'wattage', 'socket', 'chipset', 'form_factor', 'screen_size']
    .map(key => `${key}:${JSON.stringify(input.specifications[key] ?? null)}`).join('|')
  return createHash('sha256').update(`${normalizeText(input.brand)}|${normalizeText(input.name)}|${input.category}|${discriminators}`).digest('hex')
}

function quality(input: Pick<NormalizedComponent, 'name' | 'brand' | 'manufacturerPartNumbers' | 'specifications' | 'media' | 'description'>, sourceConfidence: number) {
  const specCount = Object.keys(input.specifications).length
  const completeness = Math.min(100, 25 + (input.brand ? 15 : 0) + (input.manufacturerPartNumbers.length ? 25 : 0) + Math.min(25, specCount * 3) + (input.media.main ? 5 : 0) + (input.description ? 5 : 0))
  return { completeness, confidence: Math.min(100, Math.round(sourceConfidence * .75 + completeness * .25)) }
}

function searchDocument(input: Pick<NormalizedComponent, 'name' | 'brand' | 'manufacturerPartNumbers' | 'series' | 'model' | 'specifications'>) {
  return normalizeText([input.name, input.brand, input.model, input.series, ...input.manufacturerPartNumbers, ...Object.values(input.specifications).map(String)].join(' '))
}

export function normalizeBuildCores(directory: string, raw: unknown): NormalizedComponent {
  const mapping = buildCoresCategories[directory]
  if (!mapping) throw new Error(`Catégorie BuildCores non autorisée: ${directory}`)
  const parsed = buildCoresSchema.parse(raw)
  const data = parsed as unknown as Record<string, unknown>
  const partNumbers = [...new Set(parsed.metadata.part_numbers.map(String).map(value => value.trim()).filter(Boolean))]
  const gpi = parsed.general_product_information ?? {}
  const manufacturerUrl = typeof gpi.manufacturer_url === 'string' && /^https:\/\//.test(gpi.manufacturer_url) ? gpi.manufacturer_url : null
  const specs = categorySpecs(directory, data)
  const yearValue = Number(parsed.metadata.releaseYear)
  const year = Number.isInteger(yearValue) && yearValue >= 1970 && yearValue <= 2100 ? yearValue : null
  const base = {
    category: mapping.category,
    subcategory: mapping.subcategory,
    brand: parsed.metadata.manufacturer.trim(),
    manufacturer: parsed.metadata.manufacturer.trim(),
    model: parsed.metadata.variant?.trim() || parsed.metadata.name.trim(),
    series: parsed.metadata.series?.trim() || null,
    name: parsed.metadata.name.trim(),
    slug: '',
    mpn: partNumbers[0] ?? null,
    manufacturerPartNumbers: partNumbers,
    gtin: null, ean: null, upc: null,
    description: null, shortDescription: null,
    releaseDate: year ? `${year}-01-01` : null,
    discontinued: false,
    specifications: specs,
    media: { main: null, gallery: [] },
    primarySource: 'buildcores' as SourceKey,
    sourceRecordId: parsed.opendb_id,
    sourceUrl: manufacturerUrl,
    sourceLicense: 'ODC-By-1.0',
    sourcePriority: 70,
    sourceConfidence: 78,
    rawData: sanitizeBuildCoresRaw(data),
  }
  const identityHash = componentIdentityHash(base)
  const slug = `${slugify(base.name)}-${parsed.opendb_id.slice(0, 8)}`
  const scores = quality(base, base.sourceConfidence)
  return {
    ...base, slug, identityHash,
    completenessScore: scores.completeness,
    confidenceScore: scores.confidence,
    missingImage: true,
    missingMpn: partNumbers.length === 0,
    missingSpecs: Object.keys(specs).length === 0,
    needsReview: partNumbers.length === 0 || Object.keys(specs).length < 2,
    searchDocument: searchDocument(base),
  }
}

export function sanitizeBuildCoresRaw(data: Record<string, unknown>) {
  const cleaned = structuredClone(data)
  const gpi = cleaned.general_product_information
  if (gpi && typeof gpi === 'object' && !Array.isArray(gpi)) {
    cleaned.general_product_information = Object.fromEntries(Object.entries(gpi).filter(([key]) => key === 'manufacturer_url'))
  }
  return asJson(cleaned) as Record<string, JsonValue>
}

export function assertCategory(value: string): ComponentCategory {
  if (!(componentCategories as readonly string[]).includes(value)) throw new Error(`Catégorie ConfigPilot invalide: ${value}`)
  return value as ComponentCategory
}

export function normalizedCodes(component: NormalizedComponent) {
  const codes: { type: 'mpn' | 'gtin' | 'ean' | 'upc'; value: string; brandScope: string }[] =
    component.manufacturerPartNumbers.map(value => ({ type: 'mpn', value: normalizeIdentifier(value), brandScope: normalizeText(component.brand) }))
  if (component.gtin) codes.push({ type: 'gtin', value: normalizeIdentifier(component.gtin), brandScope: '' })
  if (component.ean) codes.push({ type: 'ean', value: normalizeIdentifier(component.ean), brandScope: '' })
  if (component.upc) codes.push({ type: 'upc', value: normalizeIdentifier(component.upc), brandScope: '' })
  return codes.filter(code => code.value.length >= 4)
}
