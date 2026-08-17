import type { Sql } from 'postgres'
import { normalizedCodes } from './normalize.js'
import type { ImportReport, JsonValue, NormalizedComponent } from './types.js'

type CanonicalRow = {
  id: string
  category: string
  subcategory: string | null
  brand: string
  manufacturer: string | null
  model: string | null
  series: string | null
  name: string
  slug: string
  mpn: string | null
  manufacturer_part_numbers: string[]
  gtin: string | null
  ean: string | null
  upc: string | null
  description: string | null
  short_description: string | null
  release_date: string | null
  discontinued: boolean
  specifications: Record<string, JsonValue>
  media: { main: string | null; gallery: string[] }
  primary_source: string
  field_provenance: Record<string, { source: string; priority: number; confidence: number }>
  identity_hash: string
}

const canonicalKeys = [
  'subcategory', 'brand', 'manufacturer', 'model', 'series', 'name', 'mpn', 'gtin', 'ean', 'upc',
  'description', 'shortDescription', 'releaseDate', 'discontinued', 'media',
] as const

function provenance(component: NormalizedComponent) {
  const value = { source: component.primarySource, priority: component.sourcePriority, confidence: component.sourceConfidence }
  return Object.fromEntries([
    ...canonicalKeys.map(key => [key, value]),
    ...Object.keys(component.specifications).map(key => [`specifications.${key}`, value]),
  ])
}

const rowValue = (row: CanonicalRow, key: typeof canonicalKeys[number]): unknown => {
  const map: Partial<Record<typeof key, keyof CanonicalRow>> = {
    shortDescription: 'short_description', releaseDate: 'release_date',
  }
  return row[map[key] ?? key as keyof CanonicalRow]
}

function mergeCanonical(row: CanonicalRow, incoming: NormalizedComponent) {
  const current = row.field_provenance ?? {}
  const merged: Record<string, unknown> = {}
  const nextProvenance = { ...current }
  for (const key of canonicalKeys) {
    const candidate = incoming[key]
    const existing = rowValue(row, key)
    const oldPriority = current[key]?.priority ?? 0
    const usable = candidate !== null && candidate !== '' && !(Array.isArray(candidate) && candidate.length === 0)
    if (usable && (existing == null || existing === '' || incoming.sourcePriority >= oldPriority)) {
      merged[key] = candidate
      nextProvenance[key] = { source: incoming.primarySource, priority: incoming.sourcePriority, confidence: incoming.sourceConfidence }
    } else merged[key] = existing
  }
  const specifications = { ...(row.specifications ?? {}) }
  for (const [key, value] of Object.entries(incoming.specifications)) {
    const path = `specifications.${key}`
    if (specifications[key] == null || incoming.sourcePriority >= (current[path]?.priority ?? 0)) {
      specifications[key] = value
      nextProvenance[path] = { source: incoming.primarySource, priority: incoming.sourcePriority, confidence: incoming.sourceConfidence }
    }
  }
  return { merged, specifications, fieldProvenance: nextProvenance }
}

async function findComponent(sql: Sql, component: NormalizedComponent): Promise<CanonicalRow | null> {
  const source = await sql<CanonicalRow[]>`
    SELECT c.* FROM component_sources s JOIN components c ON c.id = s.component_id
    WHERE s.source_key = ${component.primarySource} AND s.source_record_id = ${component.sourceRecordId}
    LIMIT 1`
  if (source[0]) return source[0]

  for (const code of normalizedCodes(component)) {
    const rows = await sql<CanonicalRow[]>`
      SELECT c.* FROM component_identifiers i JOIN components c ON c.id = i.component_id
      WHERE i.identifier_type = ${code.type} AND i.normalized_value = ${code.value}
        AND i.brand_scope = ${code.brandScope}
      ORDER BY c.confidence_score DESC LIMIT 2`
    if (rows.length === 1) return rows[0]
  }

  const strict = await sql<CanonicalRow[]>`
    SELECT * FROM components WHERE identity_hash = ${component.identityHash} AND category = ${component.category}
    ORDER BY confidence_score DESC LIMIT 2`
  return strict.length === 1 ? strict[0] : null
}

async function attachSource(sql: Sql, componentId: string, component: NormalizedComponent) {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO component_sources (
      component_id, source_key, source_record_id, source_url, source_license, source_priority,
      source_confidence, raw_data, last_seen_at
    ) VALUES (
      ${componentId}, ${component.primarySource}, ${component.sourceRecordId}, ${component.sourceUrl},
      ${component.sourceLicense}, ${component.sourcePriority}, ${component.sourceConfidence},
      ${sql.json(component.rawData)}, now()
    )
    ON CONFLICT (source_key, source_record_id) DO UPDATE SET
      component_id = EXCLUDED.component_id, source_url = EXCLUDED.source_url,
      source_license = EXCLUDED.source_license, source_priority = EXCLUDED.source_priority,
      source_confidence = EXCLUDED.source_confidence, raw_data = EXCLUDED.raw_data, last_seen_at = now()
    RETURNING id`
  const sourceId = rows[0].id
  for (const code of normalizedCodes(component)) {
    await sql`
      INSERT INTO component_identifiers (component_id, identifier_type, normalized_value, brand_scope, source_id)
      VALUES (${componentId}, ${code.type}, ${code.value}, ${code.brandScope}, ${sourceId})
      ON CONFLICT (component_id, identifier_type, normalized_value, brand_scope)
      DO UPDATE SET source_id = EXCLUDED.source_id`
  }
}

export async function upsertComponent(sql: Sql, component: NormalizedComponent): Promise<'created' | 'updated'> {
  return sql.begin(async transaction => {
    const transactionSql = transaction as unknown as Sql
    const existing = await findComponent(transactionSql, component)
    if (!existing) {
      const created = await transaction<{ id: string }[]>`
        INSERT INTO components (
          category, subcategory, brand, manufacturer, model, series, name, slug, mpn,
          manufacturer_part_numbers, gtin, ean, upc, description, short_description, release_date,
          discontinued, specifications, media, primary_source, field_provenance, identity_hash,
          completeness_score, confidence_score, missing_image, missing_mpn, missing_specs,
          needs_review, search_document, last_synced_at
        ) VALUES (
          ${component.category}, ${component.subcategory}, ${component.brand}, ${component.manufacturer},
          ${component.model}, ${component.series}, ${component.name}, ${component.slug}, ${component.mpn},
          ${component.manufacturerPartNumbers}, ${component.gtin}, ${component.ean}, ${component.upc},
          ${component.description}, ${component.shortDescription}, ${component.releaseDate},
          ${component.discontinued}, ${transaction.json(component.specifications)}, ${transaction.json(component.media)},
          ${component.primarySource}, ${transaction.json(provenance(component))}, ${component.identityHash},
          ${component.completenessScore}, ${component.confidenceScore}, ${component.missingImage},
          ${component.missingMpn}, ${component.missingSpecs}, ${component.needsReview},
          ${component.searchDocument}, now()
        ) RETURNING id`
      await attachSource(transactionSql, created[0].id, component)
      return 'created'
    }

    const { merged, specifications, fieldProvenance } = mergeCanonical(existing, component)
    const partNumbers = [...new Set([...existing.manufacturer_part_numbers, ...component.manufacturerPartNumbers])]
    const media = merged.media as NormalizedComponent['media']
    const searchDocument = [component.searchDocument, existing.name, existing.brand, ...partNumbers].join(' ')
    await transaction`
      UPDATE components SET
        subcategory = ${merged.subcategory as string | null}, brand = ${merged.brand as string},
        manufacturer = ${merged.manufacturer as string | null}, model = ${merged.model as string | null},
        series = ${merged.series as string | null}, name = ${merged.name as string},
        mpn = ${merged.mpn as string | null}, manufacturer_part_numbers = ${partNumbers},
        gtin = ${merged.gtin as string | null}, ean = ${merged.ean as string | null}, upc = ${merged.upc as string | null},
        description = ${merged.description as string | null}, short_description = ${merged.shortDescription as string | null},
        release_date = ${merged.releaseDate as string | null}, discontinued = ${merged.discontinued as boolean},
        specifications = ${transaction.json(specifications)}, media = ${transaction.json(media)},
        field_provenance = ${transaction.json(fieldProvenance)},
        completeness_score = greatest(completeness_score, ${component.completenessScore}),
        confidence_score = greatest(confidence_score, ${component.confidenceScore}),
        missing_image = ${(media?.main ?? null) == null}, missing_mpn = ${partNumbers.length === 0},
        missing_specs = ${Object.keys(specifications).length === 0},
        needs_review = ${partNumbers.length === 0 || Object.keys(specifications).length < 2},
        search_document = ${searchDocument}, updated_at = now(), last_synced_at = now()
      WHERE id = ${existing.id}`
    await attachSource(transactionSql, existing.id, component)
    return 'updated'
  })
}

export async function createImportRun(sql: Sql, source: string, revision?: string) {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO component_import_runs (source_key, status, source_revision)
    VALUES (${source}, 'running', ${revision ?? null}) RETURNING id`
  return rows[0].id
}

export async function finishImportRun(sql: Sql, runId: string, report: ImportReport, status: 'completed' | 'failed') {
  await sql`
    UPDATE component_import_runs SET status = ${status}, completed_at = now(), read_count = ${report.read},
      created_count = ${report.created}, updated_count = ${report.updated}, skipped_count = ${report.skipped},
      error_count = ${report.errors}, report = ${sql.json(report)} WHERE id = ${runId}`
}

export async function recordImportError(sql: Sql, runId: string, source: string, recordId: string | undefined, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  await sql`
    INSERT INTO component_import_errors (run_id, source_key, source_record_id, error_code, message)
    VALUES (${runId}, ${source}, ${recordId ?? null}, ${error instanceof Error ? error.name : 'UNKNOWN'}, ${message})`
}

export async function saveCheckpoint(sql: Sql, source: string, revision: string | undefined, cursor: string, count: number) {
  await sql`
    INSERT INTO component_import_checkpoints (source_key, source_revision, cursor, processed_count)
    VALUES (${source}, ${revision ?? null}, ${cursor}, ${count})
    ON CONFLICT (source_key) DO UPDATE SET source_revision = EXCLUDED.source_revision,
      cursor = EXCLUDED.cursor, processed_count = EXCLUDED.processed_count, updated_at = now()`
}
