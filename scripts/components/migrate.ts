import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { withDatabase } from './common.js'

await withDatabase(async sql => {
  await sql.unsafe(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
  )`)
  for (const file of readdirSync(resolve('migrations')).filter(name => name.endsWith('.sql')).sort()) {
    const body = readFileSync(resolve('migrations', file), 'utf8')
    const checksum = createHash('sha256').update(body).digest('hex')
    const rows = await sql<{ checksum: string }[]>`SELECT checksum FROM schema_migrations WHERE version = ${file}`
    if (rows[0]?.checksum === checksum) { console.log(`[migrate] ${file} déjà appliquée`); continue }
    if (rows[0]) throw new Error(`La migration ${file} a changé après application. Créez une nouvelle migration.`)
    console.log(`[migrate] application de ${file}`)
    await sql.begin(async transaction => {
      await transaction.unsafe(body)
      await transaction`INSERT INTO schema_migrations (version, checksum) VALUES (${file}, ${checksum})`
    })
  }
})
