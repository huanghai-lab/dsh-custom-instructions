import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const pnpmCli = process.env.npm_execpath
if (!pnpmCli) throw new Error('run this fixture through pnpm e2e')

const runId = randomUUID()
const prefix = `dsh-custom-instructions-e2e-${runId}-`
const result = spawnSync(process.execPath, [pnpmCli, 'exec', 'playwright', 'test'], {
  cwd: process.cwd(),
  env: { ...process.env, DSH_E2E_RUN_ID: runId },
  stdio: 'inherit',
})

for (const name of await readdir(tmpdir())) {
  if (name.startsWith(prefix)) await rm(join(tmpdir(), name), { recursive: true, force: true })
}

process.exitCode = result.status ?? 1
