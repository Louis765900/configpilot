import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { normalizeBuildCores } from './normalize.js'

const record = {
  opendb_id: 'ae9507b0-cdbc-489b-b39a-46b12687d53d',
  metadata: { name: 'Intel Core i5 6400', manufacturer: 'Intel', part_numbers: ['BX80662I56400'] },
  socket: 'LGA 1151', specifications: { tdp: 65 },
}

describe('idempotence des imports', () => {
  it('normalise deux passages vers la même identité stable', () => {
    const first = normalizeBuildCores('CPU', record)
    const second = normalizeBuildCores('CPU', structuredClone(record))
    expect(second.sourceRecordId).toBe(first.sourceRecordId)
    expect(second.identityHash).toBe(first.identityHash)
    expect(second.slug).toBe(first.slug)
  })

  it('la migration impose l’unicité de chaque enregistrement source', () => {
    const migration = readFileSync('migrations/001_component_catalog.sql', 'utf8')
    expect(migration).toContain('UNIQUE (source_key, source_record_id)')
    expect(migration).toContain('ON components (identity_hash)')
  })
})
