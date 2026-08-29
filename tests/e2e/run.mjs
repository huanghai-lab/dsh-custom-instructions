import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const pnpmCli = process.env.npm_execpath
if (!pnpmCli) throw new Error('run this fixture through pnpm e2e')

const sourceArgument = process.argv[2] === '--' ? process.argv[3] : process.argv[2]
const sourceInput = sourceArgument ?? process.env.DSH_E2E_SOURCE_ROOT
if (sourceInput === undefined || sourceInput.length === 0) {
  throw new Error('usage: pnpm e2e -- <built-deepseek-harness-source>')
}
const dshSourceRoot = resolve(sourceInput)

const runId = randomUUID()
const prefix = `dsh-custom-instructions-e2e-${runId}-`
const authFile = join(tmpdir(), `${prefix}auth-url.txt`)
const result = spawnSync(process.execPath, [pnpmCli, 'exec', 'playwright', 'test'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DSH_E2E_RUN_ID: runId,
    DSH_E2E_AUTH_FILE: authFile,
    DSH_E2E_SOURCE_ROOT: dshSourceRoot,
  },
  stdio: 'inherit',
})

for (const name of await readdir(tmpdir())) {
  if (name.startsWith(prefix)) await rm(join(tmpdir(), name), { recursive: true, force: true })
}

process.exitCode = result.status ?? 1
