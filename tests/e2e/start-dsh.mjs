import { spawn, spawnSync } from 'node:child_process'
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const EXPECTED_DSH_VERSION = '0.1.2-alpha.1'
const dshSourceRoot = process.env.DSH_E2E_SOURCE_ROOT
const PORT = '31847'
const repository = process.cwd()
const pnpmCli = process.env.npm_execpath
const runId = process.env.DSH_E2E_RUN_ID
const authFile = process.env.DSH_E2E_AUTH_FILE

if (!pnpmCli) throw new Error('run this fixture through pnpm e2e')
if (!/^[0-9a-f-]{36}$/i.test(runId ?? '')) throw new Error('DSH_E2E_RUN_ID is missing or invalid')
if (authFile === undefined || authFile.length === 0) throw new Error('DSH_E2E_AUTH_FILE is missing')
if (dshSourceRoot === undefined || dshSourceRoot.length === 0) throw new Error('DSH_E2E_SOURCE_ROOT is missing')

const fixture = await mkdtemp(join(tmpdir(), `dsh-custom-instructions-e2e-${runId}-`))
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
    mkdir(home, { recursive: true }),
    mkdir(workspace, { recursive: true }),
  ])
  await writeFile(join(workspace, 'AGENTS.md'), '# Isolated E2E workspace\n', 'utf8')

  const dshManifest = JSON.parse(await readFile(join(dshSourceRoot, 'package.json'), 'utf8'))
  if (dshManifest.version !== EXPECTED_DSH_VERSION) {
    throw new Error(`expected DSH ${EXPECTED_DSH_VERSION}, found ${String(dshManifest.version)}`)
  }

  runPnpm(['build'], repository)
  runPnpm(['pack', '--pack-destination', fixture], repository)

  const tarballs = (await readdir(fixture)).filter((name) => name.endsWith('.tgz'))
  if (tarballs.length !== 1) throw new Error(`expected one plugin tarball, found ${tarballs.length}`)

  const dshEntry = join(dshSourceRoot, 'apps', 'cli', 'lib', 'bin.js')
  await access(dshEntry)
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
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let readyOutput = ''
  let capturedAuthenticatedUrl = false
  const forwardOutput = (stream, destination) => {
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      destination.write(chunk)
      if (capturedAuthenticatedUrl) return
      readyOutput = `${readyOutput}${chunk}`.slice(-16_384)
      const match = /dsh web: (http:\/\/[^\s]+)/u.exec(readyOutput)
      if (match?.[1] === undefined) return
      capturedAuthenticatedUrl = true
      void writeFile(authFile, `${match[1]}\n`, 'utf8').catch((error) => {
        process.stderr.write(`failed to persist DSH authenticated URL: ${String(error)}\n`)
      })
    })
  }
  forwardOutput(server.stdout, process.stdout)
  forwardOutput(server.stderr, process.stderr)
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
