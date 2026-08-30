/**
 * Shared tsdown preset for UI plugin client bundles — the single source of
 * truth for every dsh-web-ui plugin's build (previously copied per-package
 * from the DSH checkout's `packages/client/tsdown.client.ts`). Emits a
 * closure-factory artifact: the bundle calls window.__ModuleLoader__.load
 * ({id, factory}) and resolves externals through the injected require
 * (loader module table — cordis DI entities, no globals, no import map).
 * The platform module list mirrors the shell's seed table in
 * `./web-platform.ts`.
 */
import { existsSync } from 'node:fs'
import { dirname, relative, resolve as resolvePath, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UserConfig } from 'tsdown'
import { PLATFORM_MODULES } from './web-platform.ts'

/**
 * Wire/type layers a client bundle may inline: browser-safe contract surfaces
 * with no runtime identity to share (no Symbol/instanceof/singleton state).
 * Everything else under @deepseek-ai/* is either a module-table entry
 * (external) or a leak the purity gate rejects.
 */
export const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/

/** Generated descriptor/codec contribution with no shared runtime identity. */
const GENERATED_REMOTE = /^@deepseek-ai\/dsh-[a-z0-9]+(?:-[a-z0-9]+)*\/remote$/

/**
 * Workspace mode replaces an empty config array with the root defaults. A
 * falsey entry instead removes this package before entry resolution.
 */
const SKIP_WORKSPACE_BUILD: UserConfig = { entry: '' }

/** Externals resolved from the loader module table. */
export const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES]

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Rebase a physical lib-relative source onto a browser URL that mirrors the repository directories. */
function browserSourcePath(source: string, sourcemapPath: string): string {
  if (!source.startsWith('.')) return source
  const physicalSource = resolvePath(dirname(sourcemapPath), source)
  const repositoryPath = relative(REPOSITORY_ROOT, physicalSource).split(sep).join('/')
  return repositoryPath.startsWith('packages/') ? `../../../${repositoryPath}` : source
}

/**
 * Build the tsdown config for one UI plugin package: the node-half lib build
 * plus the browser client bundle. Client packages emit both halves during the
 * Client pass by default; packages needed for Host reflection may opt into the
 * earlier Host pass. A package-level tsdown.config.ts REPLACES the root
 * workspace layout, so the lib half must be restated here — dropping it leaves
 * the package without lib/index.js and the host Loader cannot import its node
 * half.
 * @param id - plugin id (package name), stamped into the __ModuleLoader__.load
 * handoff and onto the injected style tags.
 * @param libEntry - node-half entries, spelled at the call site so the
 * package-invariants gate can see `src/invariant.ts` (or the tsc emit path) in
 * each package's own tsdown.config.ts.
 * @param options - phase placement, lib overrides, companion Node configs.
 * @returns ENV-selected tsdown config for the current build face.
 */
export function clientBundle(
  id: string,
  libEntry: readonly string[],
  options: ClientBundleOptions = {},
): BuildFaceConfig {
  const lib = clientLibraryConfig(id, libEntry, options.lib, options.libExternal)
  return ({ env }) => {
    const face = buildFace(env?.DSH_BUILD_FACE)
    // Host-only plugins (no src/client entry) skip the browser face entirely.
    const hasClient = existsSync(resolvePath(process.cwd(), 'src/client/index.ts'))
    const client = hasClient ? clientConfig(id, face === undefined
      ? 'src/client/index.ts'
      : 'lib/types/client/index.js') : undefined
    const node = [lib, ...(options.companions ?? [])]
    if (face === 'host') return options.hostPhase === true ? node : [SKIP_WORKSPACE_BUILD]
    if (face === 'client') return options.hostPhase === true ? (client ? [client] : []) : (client ? [...node, client] : node)
    return client ? [...node, client] : node
  }
}

interface ClientBundleOptions {
  /** Emit the Node-side artifacts during the Host pass instead of the Client pass. */
  readonly hostPhase?: boolean
  /** Additional Node-side configs emitted alongside the package library. */
  readonly companions?: readonly UserConfig[]
  /** Overrides for the package's primary Node-side library config. */
  readonly lib?: UserConfig
  /** Extra Node-side externals (in addition to the default cordis entry). */
  readonly libExternal?: readonly (string | RegExp)[]
}

type BuildFace = 'host' | 'client' | undefined

type BuildFaceConfig = (inlineConfig: Pick<UserConfig, 'env'>) => UserConfig[]

function buildFace(value: unknown): BuildFace {
  if (value === undefined || value === 'host' || value === 'client') return value
  throw new Error(`tsdown: --env.DSH_BUILD_FACE must be host or client, received ${String(value)}`)
}

function clientLibraryConfig(
  id: string,
  libEntry: readonly string[],
  overrides: UserConfig = {},
  extraExternal: readonly (string | RegExp)[] = [],
): UserConfig {
  return {
    name: id,
    entry: [...libEntry],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    // The cordis framework resolves at runtime from the dsh profile tree, never
    // from this repo's install; its built declarations carry .ts-suffixed
    // relative imports rolldown cannot follow, so the import must stay
    // external (the same stance as the peer APIs above).
    deps: {
      neverBundle: ['@deepseek-ai/cordis', ...extraExternal],
    },
    ...overrides,
  }
}

function clientConfig(id: string, entry: string): UserConfig {
  return {
    name: `${id}/client`,
    entry: { client: entry },
    // Browser bundle lands next to the node half (single lib/ artifact dir;
    // the entryFileNames pin keeps it exactly lib/client.js). clean must stay
    // off — a default clean would wipe the node-half output emitted above.
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    // CJS is the protocol, not a choice: the GUI's __ModuleLoader__ expects a
    // closure-factory artifact (window.__ModuleLoader__.load({ id, factory }))
    // and a CJS-shaped `module.exports`. Silence tsdown's generic ESM nudge.
    checks: { legacyCjs: false },
    // Types ship from lib/types (tsc); dts here would wrap the banner/footer into .d.cts and break parsing.
    dts: false,
    // Plugin code is fetched outside Vite's module graph, so its own bundle
    // must carry the TS/TSX mapping consumed by browser profiling tools.
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: [...CLIENT_EXTERNALS],
      // Browser bundles inline node-idiom deps (zustand/immer read
      // process.env.NODE_ENV; zustand's esm build also probes
      // import.meta.env.MODE, which a CJS output cannot carry — rolldown flags
      // EMPTY_IMPORT_META). vite defined both on the seed path; tsdown inlining
      // needs the substitutions here or the factory throws ReferenceError at
      // boot / the build gate reds. Both keys honor the build's NODE_ENV so a
      // dev build keeps the dev-branch semantics; artifacts default to production.
      // The bare `import.meta.env` key is required alongside the precise MODE
      // key: zustand probes `import.meta.env ? import.meta.env.MODE : ...`, and
      // the truthiness probe would otherwise survive as an empty import.meta.
      // tsdown auto-externalizes package dependencies; anything NOT in the
      // loader module table must inline instead (wire/type layers, zod, clsx —
      // every non-shared dep). A require() the table cannot answer is a
      // guaranteed runtime throw, so the rule is the table list itself: no
      // opinion for table entries (neverBundle above wins), bundle everything else.
      alwaysBundle: (id: string) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    plugins: [{
      // Bundle purity gate (build-time mirror of the module-edge rules):
      // platform seed entries stay external, inline-safe wire layers inline,
      // and every other @deepseek-ai value import is a build error — a
      // cross-plugin value import either inlines a duplicate runtime instance
      // or requires a specifier the frozen module table cannot answer.
      // Cross-plugin collaboration goes through cordis services instead.
      name: 'dsh-client-bundle-purity',
      resolveId(source: string) {
        if (!source.startsWith('@deepseek-ai/')) return null
        if (CLIENT_EXTERNALS.includes(source)) return null // platform module: external wins
        if (INLINE_SAFE.test(source) || GENERATED_REMOTE.test(source)) return null // wire contribution: inline is the point
        throw new Error(
          `client bundle purity: "${source}" is not a platform module (CLIENT_EXTERNALS), an inline-safe wire layer, or a generated /remote contribution — `
          + 'cross-plugin value imports are forbidden; collaborate through cordis services (type-only imports are erased and never reach this gate)',
        )
      },
    }],
    outputOptions: {
      entryFileNames: 'client.js',
      // The map is served from /plugins/<scoped-package>/client.js.map. The
      // browser resolves its local sources back into URLs that mirror the
      // /packages/<group>/<package>/src directories; sourcesContent keeps them usable
      // without exposing that tree as an HTTP route.
      sourcemapPathTransform: browserSourcePath,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  }
}
