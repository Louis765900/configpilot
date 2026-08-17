import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Sql } from 'postgres'
import { closeDatabase, getDatabase } from '../../server/db.js'
import { createImportRun, finishImportRun, recordImportError, saveCheckpoint, upsertComponent } from '../../server/catalog/repository.js'
import type { ImportReport, NormalizedComponent, SourceKey } from '../../server/catalog/types.js'

export function loadLocalEnv() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (!match || process.env[match[1]] !== undefined) continue
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
    }
  }
}

export function flag(name: string) { return process.argv.includes(`--${name}`) }
export function option(name: string) {
  const equals = process.argv.find(value => value.startsWith(`--${name}=`))
  if (equals) return equals.slice(name.length + 3)
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

export function ensureBuildCoresCheckout() {
  const configured = process.env.BUILDCORES_PATH
  if (configured) return resolve(configured)
  const target = resolve('.cache/components/buildcores')
  const repo = process.env.BUILDCORES_REPO_URL ?? 'https://github.com/buildcores/buildcores-open-db.git'
  const ref = process.env.BUILDCORES_REF ?? 'main'
  mkdirSync(resolve('.cache/components'), { recursive: true })
  if (!existsSync(resolve(target, '.git'))) {
    execFileSync('git', ['clone', '--depth', '1', '--branch', ref, repo, target], { stdio: 'inherit' })
  } else {
    execFileSync('git', ['-C', target, 'fetch', '--depth', '1', 'origin', ref], { stdio: 'inherit' })
    execFileSync('git', ['-C', target, 'reset', '--hard', 'FETCH_HEAD'], { stdio: 'inherit' })
  }
  return target
}

export function sourceRevision(path: string) {
  try { return execFileSync('git', ['-C', path, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() }
  catch { return undefined }
}

export function emptyReport(source: SourceKey, revision?: string): ImportReport {
  return { source, revision, read: 0, created: 0, updated: 0, skipped: 0, errors: 0, categories: {}, errorSamples: [] }
}

export type ImportFailure = { importError: true; sourceRecordId?: string; category?: string; error: unknown }

export async function importComponents(source: SourceKey, revision: string | undefined, records: AsyncIterable<NormalizedComponent | ImportFailure>, options: {
  dryRun?: boolean; batchSize?: number
}) {
  const report = emptyReport(source, revision)
  const sql = options.dryRun ? null : getDatabase()
  const runId = sql ? await createImportRun(sql, source, revision) : null
  const batchSize = options.batchSize ?? Number(process.env.COMPONENT_IMPORT_BATCH_SIZE ?? 500)
  let lastRecord = ''
  try {
    for await (const item of records) {
      report.read++
      if ('importError' in item) {
        report.errors++
        const message = item.error instanceof Error ? item.error.message : String(item.error)
        if (item.category) report.categories[item.category] = (report.categories[item.category] ?? 0) + 1
        if (report.errorSamples.length < 20) report.errorSamples.push({ recordId: item.sourceRecordId, message })
        if (sql && runId) await recordImportError(sql, runId, source, item.sourceRecordId, item.error)
        continue
      }
      const component = item
      lastRecord = component.sourceRecordId
      report.categories[component.category] = (report.categories[component.category] ?? 0) + 1
      try {
        if (sql) {
          const result = await upsertComponent(sql, component)
          report[result]++
        } else report.created++
      } catch (error) {
        report.errors++
        const message = error instanceof Error ? error.message : String(error)
        if (report.errorSamples.length < 20) report.errorSamples.push({ recordId: component.sourceRecordId, message })
        if (sql && runId) await recordImportError(sql, runId, source, component.sourceRecordId, error)
      }
      if (report.read % batchSize === 0) {
        console.log(`[${source}] ${report.read} lus · ${report.created} créés · ${report.updated} mis à jour · ${report.errors} erreurs`)
        if (sql) await saveCheckpoint(sql, source, revision, lastRecord, report.read)
      }
    }
    if (sql && runId) {
      await saveCheckpoint(sql, source, revision, lastRecord, report.read)
      await finishImportRun(sql, runId, report, 'completed')
    }
    console.log(JSON.stringify(report, null, 2))
    return report
  } catch (error) {
    report.errors++
    if (sql && runId) await finishImportRun(sql, runId, report, 'failed')
    throw error
  } finally {
    if (sql) await closeDatabase()
  }
}

export async function withDatabase<T>(callback: (sql: Sql) => Promise<T>) {
  loadLocalEnv()
  try { return await callback(getDatabase()) } finally { await closeDatabase() }
}
