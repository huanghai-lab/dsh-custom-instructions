import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const upstream = resolve(process.argv[2] ?? '')
const repository = process.cwd()

if (process.argv[2] === undefined) {
  throw new Error('usage: node scripts/typecheck-dsh-source.mjs <built-deepseek-harness-source>')
}

const posix = (path) => path.replaceAll('\\', '/')
const declarations = {
  '@deepseek-ai/cordis': 'vendor/cordis/lib/types/index.d.ts',
  '@deepseek-ai/dsh-client-locale/client': 'packages/client/locale/lib/types/client/index.d.ts',
  '@deepseek-ai/dsh-client-ui-primitives': 'packages/client/ui-primitives/lib/types/index.d.ts',
  '@deepseek-ai/dsh-client-ui-renderer/client': 'packages/client/ui-renderer/lib/types/client/index.d.ts',
  '@deepseek-ai/dsh-client-ui-settings/client': 'packages/client/ui-settings/lib/types/client/index.d.ts',
  '@deepseek-ai/dsh-client-ui-slots': 'packages/client/ui-slots/lib/types/index.d.ts',
  '@deepseek-ai/dsh-host-webserver': 'packages/host/webserver/lib/types/index.d.ts',
}

const temporary = await mkdtemp(join(tmpdir(), 'dsh-custom-instructions-alpha-types-'))
try {
  const paths = Object.fromEntries(Object.entries(declarations).map(([specifier, path]) => [
    specifier,
    [posix(resolve(upstream, path))],
  ]))
  const config = {
    extends: posix(resolve(repository, 'tsconfig.json')),
    compilerOptions: {
      baseUrl: posix(repository),
      ignoreDeprecations: '6.0',
      paths,
      typeRoots: [posix(resolve(repository, 'node_modules/@types'))],
    },
    include: [
      posix(resolve(repository, 'src/**/*.ts')),
      posix(resolve(repository, 'src/**/*.tsx')),
    ],
  }
  const configPath = join(temporary, 'tsconfig.json')
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  execFileSync(process.execPath, [
    resolve(repository, 'node_modules/typescript/bin/tsc'),
    '--project',
    configPath,
    '--pretty',
    'false',
  ], { cwd: repository, stdio: 'inherit' })
  process.stdout.write('Plugin source typechecked against the built DSH source declarations.\n')
} finally {
  await rm(temporary, { recursive: true, force: true })
}
