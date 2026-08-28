import { spawn, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const DSH_VERSION = '0.1.1-rc.2'
const PORT = '31847'
const repository = process.cwd()
const pnpmCli = process.env.npm_execpath
const runId = process.env.DSH_E2E_RUN_ID

if (!pnpmCli) throw new Error('run this fixture through pnpm e2e')
if (!/^[0-9a-f-]{36}$/i.test(runId ?? '')) throw new Error('DSH_E2E_RUN_ID is missing or invalid')

const fixture = await mkdtemp(join(tmpdir(), `dsh-custom-instructions-e2e-${runId}-`))
const runtime = join(fixture, 'runtime')
const home = join(fixture, 'home')
const workspace = join(fixture, 'workspace')

function runPnpm(args, cwd) {
  const result = spawnSync(process.execPath, [pnpmCli, ...args], { cwd, encoding: 'utf8' })
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '')
    process.stderr.write(result.stderr ?? '')
    throw new Error(`pnpm ${args[0]} failed with exit code ${result.status ?? 'unknown'}`)
  }
}

try {
  await Promise.all([
    mkdir(runtime, { recursive: true }),
    mkdir(home, { recursive: true }),
    mkdir(workspace, { recursive: true }),
  ])
  await writeFile(join(runtime, 'package.json'), '{"private":true}\n', 'utf8')
  await writeFile(join(runtime, 'pnpm-workspace.yaml'), `allowBuilds:
  '@deepseek-ai/dsh-subprocess-local': true
  '@google/genai': false
  koffi: true
  node-addon-require-builtin: false
  node-pty: true
  protobufjs: false
`, 'utf8')
  await writeFile(join(workspace, 'AGENTS.md'), '# Isolated E2E workspace\n', 'utf8')

  runPnpm(['build'], repository)
  runPnpm(['pack', '--pack-destination', fixture], repository)
  runPnpm(['add', '--save-exact', `@deepseek-ai/dsh@${DSH_VERSION}`], runtime)

  const tarballs = (await readdir(fixture)).filter((name) => name.endsWith('.tgz'))
  if (tarballs.length !== 1) throw new Error(`expected one plugin tarball, found ${tarballs.length}`)

  const dshEntry = join(runtime, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  const isolatedEnv = {
    ...process.env,
    DSH_HOME: home,
    DSH_TELEMETRY_DISABLED: '1',
    DSH_TELEMETRY_MODE: 'DISABLED',
  }
  const install = spawnSync(process.execPath, [
    dshEntry,
    'plugin',
    '--profile',
    'web',
    'add',
    join(fixture, tarballs[0]),
  ], { cwd: workspace, env: isolatedEnv, stdio: 'inherit' })
  if (install.status !== 0) throw new Error(`isolated plugin installation failed with exit code ${install.status ?? 'unknown'}`)

  const server = spawn(process.execPath, [dshEntry, 'web', '--no-open', '--port', PORT], {
    cwd: workspace,
    env: isolatedEnv,
    stdio: 'inherit',
  })
  let stopping = false
  const stop = (signal) => {
    if (stopping) return
    stopping = true
    server.kill(signal)
    setTimeout(() => server.kill('SIGKILL'), 5_000).unref()
  }
  process.on('SIGINT', () => stop('SIGINT'))
  process.on('SIGTERM', () => stop('SIGTERM'))
  server.on('exit', async (code, signal) => {
    await rm(fixture, { recursive: true, force: true }).catch(() => undefined)
    process.exitCode = signal === null ? (code ?? 1) : 0
  })
} catch (error) {
  await rm(fixture, { recursive: true, force: true }).catch(() => undefined)
  throw error
}
