import { z } from 'zod'
import { componentCategories, type ComponentListParams } from '../catalog/types.js'
import { normalizeIdentifier, normalizeText } from '../catalog/normalize.js'

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value

export const listQuerySchema = z.object({
  q: z.string().trim().max(160).optional(),
  category: z.enum(componentCategories).optional(),
  brand: z.string().trim().min(1).max(80).optional(),
  socket: z.string().trim().min(1).max(80).optional(),
  capacity: z.coerce.number().int().positive().max(1000000).optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  sort: z.enum(['relevance', 'name', 'newest', 'completeness']).default('relevance'),
})

export function parseListQuery(query: Record<string, string | string[] | undefined>): ComponentListParams {
  return listQuerySchema.parse(Object.fromEntries(Object.entries(query).map(([key, value]) => [key, first(value)])))
}

export function buildComponentListQuery(params: ComponentListParams) {
  const conditions: string[] = []
  const values: unknown[] = []
  const parameter = (value: unknown) => { values.push(value); return `$${values.length}` }
  const add = (clause: string, value: unknown) => conditions.push(clause.replace('?', parameter(value)))
  const q = normalizeText(params.q)
  if (q) {
    const fts = parameter(q), contains = parameter(q), exactMpn = parameter(normalizeIdentifier(params.q))
    conditions.push(`(to_tsvector('simple', search_document) @@ websearch_to_tsquery('simple', ${fts})
      OR search_document ILIKE '%' || ${contains} || '%'
      OR upper(regexp_replace(coalesce(mpn, ''), '[^A-Za-z0-9]', '', 'g')) = ${exactMpn})`)
  }
  if (params.category) add('category = ?', params.category)
  if (params.brand) add('lower(brand) = lower(?)', params.brand)
  if (params.socket) add(`lower(coalesce(specifications->>'socket', '')) = lower(?)`, params.socket)
  if (params.capacity) add(`NULLIF(specifications->>'capacity', '')::numeric = ?`, params.capacity)
  const order = {
    relevance: q ? `ts_rank(to_tsvector('simple', search_document), websearch_to_tsquery('simple', $1)) DESC, completeness_score DESC` : 'completeness_score DESC, name ASC',
    name: 'name ASC', newest: 'release_date DESC NULLS LAST, name ASC', completeness: 'completeness_score DESC, name ASC',
  }[params.sort]
  values.push(params.limit, (params.page - 1) * params.limit)
  return {
    text: `SELECT id, category, subcategory, brand, manufacturer, model, series, name, slug, mpn,
      manufacturer_part_numbers, gtin, ean, upc, description, short_description, release_date,
      discontinued, specifications, media, primary_source, completeness_score, confidence_score,
      missing_image, missing_mpn, missing_specs, needs_review, updated_at, count(*) OVER()::int AS total_count
      FROM components ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY ${order} LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  }
}

export function buildLookupQuery(kind: 'id' | 'slug' | 'mpn', value: string) {
  if (kind === 'id') return { text: 'SELECT * FROM components WHERE id = $1 LIMIT 1', values: [value] }
  if (kind === 'slug') return { text: 'SELECT * FROM components WHERE slug = $1 LIMIT 1', values: [value] }
  return {
    text: `SELECT DISTINCT c.* FROM components c LEFT JOIN component_identifiers i ON i.component_id = c.id
      WHERE upper(coalesce(c.mpn, '')) = $1 OR (i.identifier_type = 'mpn' AND i.normalized_value = $1)
      ORDER BY c.confidence_score DESC LIMIT 2`,
    values: [normalizeIdentifier(value)],
  }
}
