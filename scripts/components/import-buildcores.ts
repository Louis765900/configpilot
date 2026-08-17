import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ensureBuildCoresCheckout, flag, importComponents, loadLocalEnv, option, sourceRevision } from './common.js'
import { normalizeBuildCores, relevantBuildCoresDirectories } from '../../server/catalog/normalize.js'

loadLocalEnv()
const sourceRoot = option('source-dir') ? resolve(option('source-dir')!) : ensureBuildCoresCheckout()
const revision = sourceRevision(sourceRoot)
const openDb = resolve(sourceRoot, 'open-db')

async function* records() {
  for (const directory of relevantBuildCoresDirectories) {
    const folder = join(openDb, directory)
    for (const file of readdirSync(folder).filter(name => name.endsWith('.json')).sort()) {
      try {
        const raw = JSON.parse(readFileSync(join(folder, file), 'utf8'))
        yield normalizeBuildCores(directory, raw)
      } catch (error) {
        yield { importError: true as const, sourceRecordId: file.replace(/\.json$/, ''), category: directory, error }
      }
    }
  }
}

await importComponents('buildcores', revision, records(), { dryRun: flag('dry-run') })
