import { execFileSync } from 'node:child_process'
import { loadLocalEnv } from './common.js'

loadLocalEnv()
const run = (script: string, args: string[] = []) => execFileSync(process.execPath, ['--import', 'tsx', script, ...args], { stdio: 'inherit', env: process.env })

run('scripts/components/migrate.ts')
run('scripts/components/import-local.ts')
run('scripts/components/import-buildcores.ts')
if (process.env.ICECAT_ENABLED === 'true') run('scripts/components/import-icecat.ts')
else console.log('ICECAT NOT CONFIGURED')
run('scripts/components/stats.ts')
