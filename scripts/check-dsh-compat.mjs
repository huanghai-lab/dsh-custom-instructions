import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve } from 'node:path'

const EXPECTED_DSH_VERSION = '0.1.2-alpha.1'
const sourceRoot = resolve(process.argv[2] ?? '')

if (process.argv[2] === undefined) {
  throw new Error('usage: node scripts/check-dsh-compat.mjs <deepseek-harness-source>')
}

async function text(path) {
  return await readFile(resolve(sourceRoot, path), 'utf8')
}

function requireMatch(content, pattern, label) {
  if (!pattern.test(content)) throw new Error(`DSH compatibility check failed: ${label}`)
}

const manifest = JSON.parse(await text('package.json'))
if (manifest.version !== EXPECTED_DSH_VERSION) {
  throw new Error(`expected DSH ${EXPECTED_DSH_VERSION}, found ${String(manifest.version)}`)
}

try {
  await access(resolve(sourceRoot, 'packages/client/runtime/package.json'), constants.F_OK)
  throw new Error('DSH compatibility check failed: removed client runtime package is present')
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}

const locale = await text('packages/client/locale/src/client/index.ts')
requireMatch(locale, /import type \{ Context as ClientContext \} from '@deepseek-ai\/cordis'/, 'locale no longer uses Cordis Context directly')
if (locale.includes('@deepseek-ai/dsh-client-runtime')) {
  throw new Error('DSH compatibility check failed: locale still depends on the removed client runtime')
}

const markdown = await text('packages/client/ui-primitives/src/markdown/MarkdownText.tsx')
const markdownRender = await text('packages/client/ui-primitives/src/markdown/render.tsx')
requireMatch(markdown, /labels:\s*MarkdownLabels/, 'MarkdownText no longer accepts MarkdownLabels')
requireMatch(markdownRender, /interface MarkdownLabels[\s\S]*code:\s*MarkdownCodeLabels[\s\S]*footnotes:\s*string/, 'MarkdownLabels fields changed')

const renderer = await text('packages/client/ui-renderer/src/client/index.ts')
requireMatch(renderer, /slots:\s*SlotRegistry/, 'ui-renderer no longer provides ctx.slots')

const settingsSlots = await text('packages/client/ui-settings/src/client/contract/slots.ts')
requireMatch(settingsSlots, /'settings\.section':\s*\{\s*kind:\s*'list';\s*scope:\s*'root'/, 'settings.section slot changed')

const webServer = await text('packages/host/webserver/src/index.ts')
requireMatch(webServer, /register\(route:\s*WebRoute\):\s*\(\)\s*=>\s*void/, 'web route registration changed')

const connectionRpc = await text('packages/client/connection/src/rpc.ts')
requireMatch(
  connectionRpc,
  /requestRejection\(request:\s*ConnectionTrustRequest\):\s*ConnectionRequestRejection/,
  'connection no longer exposes authenticated custom-route protection',
)

const settings = await text('packages/settings/settings/src/index.ts')
requireMatch(settings, /prepareDocument\(\):\s*Promise<string \| undefined>/, 'settings document path API changed')

const workspaces = await text('packages/workspace/workspace/src/types.ts')
requireMatch(workspaces, /readonly path:\s*string/, 'workspace path projection changed')
requireMatch(workspaces, /readonly title:\s*string/, 'workspace title projection changed')

process.stdout.write(`DSH ${EXPECTED_DSH_VERSION} compatibility surface verified.\n`)
