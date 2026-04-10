import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')
const tempTypesDir = resolve(rootDir, '.types-temp')

function run(command, args) {
  execFileSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
  })
}

rmSync(tempTypesDir, { recursive: true, force: true })

try {
  run('pnpm', ['exec', 'vue-tsc', '-p', 'tsconfig.types.json'])
  run('pnpm', ['exec', 'rollup', '--config', 'rollup.types.config.mjs'])
} finally {
  rmSync(tempTypesDir, { recursive: true, force: true })
}
