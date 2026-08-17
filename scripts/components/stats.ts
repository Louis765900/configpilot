import { withDatabase } from './common.js'

await withDatabase(async sql => {
  const [totals, categories, brands, sources, lastRuns, duplicateCount] = await Promise.all([
    sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE missing_image)::int AS missing_image,
      count(*) FILTER (WHERE missing_mpn)::int AS missing_mpn,
      count(*) FILTER (WHERE missing_specs)::int AS missing_specs,
      count(*) FILTER (WHERE needs_review)::int AS needs_review FROM components`,
    sql`SELECT category, count(*)::int AS count FROM components GROUP BY category ORDER BY count DESC`,
    sql`SELECT brand, count(*)::int AS count FROM components GROUP BY brand ORDER BY count DESC LIMIT 30`,
    sql`SELECT source_key, count(DISTINCT component_id)::int AS components FROM component_sources GROUP BY source_key ORDER BY components DESC`,
    sql`SELECT DISTINCT ON (source_key) source_key, status, started_at, completed_at, read_count, created_count,
      updated_count, skipped_count, error_count FROM component_import_runs ORDER BY source_key, started_at DESC`,
    sql`SELECT count(*)::int AS count FROM component_duplicate_candidates WHERE status = 'pending'`,
  ])
  console.log(JSON.stringify({ totals: totals[0], categories, topBrands: brands, sources, lastRuns, potentialDuplicates: duplicateCount[0].count }, null, 2))
})
