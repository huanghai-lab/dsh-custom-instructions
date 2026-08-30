/** Route-level tests use a temporary DSH home and never touch the real user. */

import { describe, expect, it } from 'vitest'
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAX_INSTRUCTIONS_BYTES, ROUTE_PREFIX, registerCustomInstructionsRoutes } from '../src/index.ts'

interface CapturedResponse {
  status: number
  headers: Record<string, string>
  body: string
}

type Handler = (method: string, url?: string, body?: string) => Promise<CapturedResponse>

function fakeCtx(settingsDoc: string, services: Record<string, unknown> = {}): {
  handler: Handler
  warnings: string[]
} {
  let routeHandler: ((req: unknown, res: unknown) => Promise<void>) | undefined
  const warnings: string[] = []
  const ctx = {
    logger: { warn: (message: string) => warnings.push(message) },
    connection: services.connection ?? { requestRejection: () => undefined },
    get: (name: string) => {
      if (name === 'settings') return { prepareDocument: async () => settingsDoc }
      return services[name]
    },
    webServer: {
      register: (row: { handler: (req: unknown, res: unknown) => Promise<void> }) => {
        routeHandler = row.handler
        return () => undefined
      },
    },
    effect: (fn: () => () => void) => { fn(); return () => undefined },
  }
  registerCustomInstructionsRoutes(ctx as never)
  if (routeHandler === undefined) throw new Error('route handler was not registered')
  const captured = routeHandler

  const handler: Handler = async (method, url = '', body) => {
    let status = 0
    let headers: Record<string, string> = {}
    let output = ''
    const res = {
      writeHead: (code: number, head: Record<string, string> = {}) => { status = code; headers = head },
      end: (chunk?: unknown) => { if (chunk !== undefined && chunk !== null) output = String(chunk) },
    }
    const events: Record<string, Array<(chunk?: unknown) => void>> = { data: [], end: [], error: [] }
    const req: Record<string, unknown> = {
      method,
      url: `${ROUTE_PREFIX}${url}`,
      on: (event: string, listener: (chunk?: unknown) => void) => {
        events[event]?.push(listener)
        return req
      },
    }
    if (method === 'PUT' || method === 'POST' || method === 'DELETE') {
      setTimeout(() => {
        if (body !== undefined) for (const listener of events.data) listener(Buffer.from(body, 'utf8'))
        for (const listener of events.end) listener()
      }, 0)
    }
    await captured(req as never, res as never)
    return { status, headers, body: output }
  }
  return { handler, warnings }
}

function envelope(response: CapturedResponse): Record<string, unknown> {
  return JSON.parse(response.body) as Record<string, unknown>
}

async function revision(handler: Handler): Promise<string> {
  const value = envelope(await handler('GET')).revision
  if (typeof value !== 'string') throw new Error('GET did not return a revision')
  return value
}

async function mutate(
  handler: Handler,
  method: 'PUT' | 'POST' | 'DELETE',
  url: string,
  payload: Record<string, unknown>,
): Promise<CapturedResponse> {
  return handler(method, url, JSON.stringify({ ...payload, expectedRevision: await revision(handler) }))
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

describe('global instructions and concurrency', () => {
  it('rejects unauthenticated and untrusted requests before reading private instructions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      await writeFile(join(directory, 'AGENTS.md'), 'private instructions\n', 'utf8')
      for (const [rejection, code] of [[401, 'AUTH_REQUIRED'], [403, 'FORBIDDEN']] as const) {
        const { handler } = fakeCtx(join(directory, 'settings.yaml'), {
          connection: { requestRejection: () => rejection },
        })
        const response = await handler('GET')
        expect(response.status).toBe(rejection)
        expect(envelope(response).code).toBe(code)
        expect(response.body).not.toContain('private instructions')
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects unknown routes and extra path segments', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))
      for (const url of ['/unknown', '/templates/name/extra', '/history/id/extra']) {
        const response = await handler('GET', url)
        expect(response.status).toBe(404)
        expect(envelope(response).code).toBe('NOT_FOUND')
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('reads an absent file as empty and reports truthful limits and revision', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))
      const response = await handler('GET')
      const body = envelope(response)
      expect(response.status).toBe(200)
      expect(body).toMatchObject({
        ok: true,
        path: join(directory, 'AGENTS.md'),
        text: '',
        active: null,
        hasBackup: false,
        maxBytes: MAX_INSTRUCTIONS_BYTES,
        maxTemplates: 50,
        maxHistory: 100,
        maxImportBytes: 16 * 1024 * 1024,
        templates: [],
        history: [],
      })
      expect(body.revision).toMatch(/^[0-9a-f]{64}$/)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('creates no imaginary backup on first save and rotates one on the second', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))
      const first = envelope(await mutate(handler, 'PUT', '', { text: '第一版\n' }))
      expect(first.hasBackup).toBe(false)
      expect(await exists(join(directory, 'AGENTS.md.bak'))).toBe(false)

      const second = envelope(await mutate(handler, 'PUT', '', { text: '第二版\n' }))
      expect(second.hasBackup).toBe(true)
      expect(await readFile(join(directory, 'AGENTS.md.bak'), 'utf8')).toBe('第一版\n')
      expect(await readFile(join(directory, 'AGENTS.md'), 'utf8')).toBe('第二版\n')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('requires a revision, rejects oversized content, and preserves disk state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))
      const missing = await handler('PUT', '', JSON.stringify({ text: 'x' }))
      expect(missing.status).toBe(400)
      expect(envelope(missing)).toEqual({
        code: 'EXPECTED_REVISION_REQUIRED',
        message: 'expectedRevision must be a SHA-256 revision',
      })

      const escapedAtLimit = '\0'.repeat(MAX_INSTRUCTIONS_BYTES)
      const accepted = await mutate(handler, 'PUT', '', { text: escapedAtLimit })
      expect(accepted.status).toBe(200)

      const oversized = await mutate(handler, 'PUT', '', { text: 'x'.repeat(MAX_INSTRUCTIONS_BYTES + 1) })
      expect(oversized.status).toBe(413)
      expect(envelope(oversized).code).toBe('CONTENT_TOO_LARGE')
      expect(await readFile(join(directory, 'AGENTS.md'), 'utf8')).toBe(escapedAtLimit)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('returns 409 instead of overwriting an external edit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))
      const stale = await revision(handler)
      await writeFile(join(directory, 'AGENTS.md'), '外部修改\n', 'utf8')
      const response = await handler('PUT', '', JSON.stringify({ text: '浏览器旧草稿\n', expectedRevision: stale }))
      expect(response.status).toBe(409)
      expect(envelope(response).code).toBe('REVISION_CONFLICT')
      expect(await readFile(join(directory, 'AGENTS.md'), 'utf8')).toBe('外部修改\n')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('restores the backup through the same protected write path', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))
      await mutate(handler, 'PUT', '', { text: '原始内容\n' })
      await mutate(handler, 'PUT', '', { text: '误改内容\n' })
      const response = await mutate(handler, 'POST', '', { action: 'restore' })
      const body = envelope(response)
      expect(response.status).toBe(200)
      expect(body.text).toBe('原始内容\n')
      expect(body.revision).toMatch(/^[0-9a-f]{64}$/)
      expect(await readFile(join(directory, 'AGENTS.md'), 'utf8')).toBe('原始内容\n')
      expect(await readFile(join(directory, 'AGENTS.md.bak'), 'utf8')).toBe('误改内容\n')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('uses structured errors for malformed JSON, unsupported methods, and read failures', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))
      const invalid = await handler('PUT', '', 'not-json')
      expect(invalid.status).toBe(400)
      expect(envelope(invalid).code).toBe('INVALID_JSON')

      const method = await handler('PATCH')
      expect(method.status).toBe(404)
      expect(envelope(method).code).toBe('NOT_FOUND')

      await mkdir(join(directory, 'AGENTS.md'))
      const failedRead = await handler('GET')
      expect(failedRead.status).toBe(500)
      expect(envelope(failedRead)).toEqual({ code: 'INTERNAL_ERROR', message: 'unexpected instruction storage error' })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('templates', () => {
  it('supports Unicode names, encoded filenames, editing, activation, and active deletion', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))
      await mutate(handler, 'PUT', '', { text: '当前全局\n' })
      await mutate(handler, 'POST', '/templates', { name: '论文 写作', text: '模板一\n' })

      const files = await readdir(join(directory, 'instructions', 'templates'))
      expect(files).toHaveLength(1)
      expect(files[0]).toMatch(/^b64~[A-Za-z0-9_-]+\.md$/)

      const read = envelope(await handler('GET', `/templates/${encodeURIComponent('论文 写作')}`))
      expect(read.text).toBe('模板一\n')
      await mutate(handler, 'PUT', `/templates/${encodeURIComponent('论文 写作')}`, { text: '模板二\n' })

      const activated = envelope(await mutate(handler, 'POST', '/templates/activate', { name: '论文 写作' }))
      expect(activated).toMatchObject({ active: '论文 写作', text: '模板二\n' })

      await mutate(handler, 'DELETE', `/templates/${encodeURIComponent('论文 写作')}`, {})
      const current = envelope(await handler('GET'))
      expect(current.active).toBeNull()
      expect(current.text).toBe('模板二\n')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('reads a v0.3 ASCII template and migrates it on the first edit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const templateDirectory = join(directory, 'instructions', 'templates')
      await mkdir(templateDirectory, { recursive: true })
      await writeFile(join(templateDirectory, 'legacy.md'), '旧内容\n', 'utf8')
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))

      expect((envelope(await handler('GET', '/templates')).templates as Array<{ name: string }>)[0]?.name).toBe('legacy')
      await mutate(handler, 'PUT', '/templates/legacy', { text: '新内容\n' })
      expect(await exists(join(templateDirectory, 'legacy.md'))).toBe(false)
      expect((await readdir(templateDirectory))[0]).toMatch(/^b64~/)
      expect(envelope(await handler('GET', '/templates/legacy')).text).toBe('新内容\n')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not confuse differently cased legacy names on Windows', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const templateDirectory = join(directory, 'instructions', 'templates')
      await mkdir(templateDirectory, { recursive: true })
      await writeFile(join(templateDirectory, 'Legacy.md'), 'upper-case legacy\n', 'utf8')
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))

      expect((await handler('GET', '/templates/legacy')).status).toBe(404)
      await mutate(handler, 'POST', '/templates', { name: 'legacy', text: 'lower-case encoded\n' })
      expect(envelope(await handler('GET', '/templates/Legacy')).text).toBe('upper-case legacy\n')
      expect(envelope(await handler('GET', '/templates/legacy')).text).toBe('lower-case encoded\n')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects invalid names and enforces the 50-template limit without partial writes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))
      const invalid = await mutate(handler, 'POST', '/templates', { name: ' bad\nname ', text: 'x' })
      expect(invalid.status).toBe(400)
      expect(envelope(invalid).code).toBe('BAD_REQUEST')

      for (let index = 0; index < 50; index += 1) {
        const response = await mutate(handler, 'POST', '/templates', { name: `template-${index}`, text: `${index}` })
        expect(response.status).toBe(200)
      }
      const overflow = await mutate(handler, 'POST', '/templates', { name: 'template-overflow', text: 'x' })
      expect(overflow.status).toBe(413)
      expect(envelope(overflow).code).toBe('LIMIT_EXCEEDED')
      const templates = envelope(await handler('GET', '/templates')).templates as unknown[]
      expect(templates).toHaveLength(50)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 30_000)
})

describe('history', () => {
  it('creates collision-proof IDs, previews content, and restores through a fresh revision', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))
      await mutate(handler, 'PUT', '', { text: '第一版\n' })
      await mutate(handler, 'PUT', '', { text: '第二版\n' })
      await mutate(handler, 'PUT', '', { text: '第三版\n' })

      const history = envelope(await handler('GET', '/history')).history as Array<{ id: string; savedAt: number }>
      expect(history).toHaveLength(2)
      expect(new Set(history.map(({ id }) => id)).size).toBe(2)
      expect(history.every(({ id }) => /^\d{13}-[0-9a-f-]{36}$/i.test(id))).toBe(true)

      const oldest = history.at(-1)
      if (oldest === undefined) throw new Error('missing history')
      const preview = envelope(await handler('GET', `/history/${oldest.id}`))
      expect(preview.text).toBe('第一版\n')
      const restored = envelope(await mutate(handler, 'POST', '/history/restore', { id: oldest.id }))
      expect(restored.text).toBe('第一版\n')
      expect(envelope(await handler('GET')).active).toBeNull()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('keeps only the newest 100 entries', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      await writeFile(join(directory, 'AGENTS.md'), 'current\n', 'utf8')
      const historyDirectory = join(directory, 'instructions', 'history')
      await mkdir(historyDirectory, { recursive: true })
      for (let index = 0; index < 105; index += 1) {
        await writeFile(join(historyDirectory, `${1_700_000_000_000 + index}.md`), `${index}`, 'utf8')
      }
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))
      await mutate(handler, 'PUT', '', { text: 'next\n' })
      const history = envelope(await handler('GET', '/history')).history as unknown[]
      expect(history).toHaveLength(100)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})

describe('import and export', () => {
  it('merges a v0.3 bundle, imports current and active state, and leaves a rollback bundle', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))
      await mutate(handler, 'PUT', '', { text: '本地当前\n' })
      await mutate(handler, 'POST', '/templates', { name: '本地模板', text: '保留我\n' })
      const bundle = {
        exportedAt: Date.now(),
        active: '导入模板',
        current: '导入当前\n',
        templates: [{ name: '导入模板', text: '导入模板内容\n' }],
        history: [{ id: '1700000000000', text: '导入历史\n' }],
      }
      const imported = envelope(await mutate(handler, 'POST', '/import', { bundle }))
      expect(imported).toMatchObject({ templates: 1, history: 1, currentChanged: true, active: '导入模板', imported: 3 })

      const current = envelope(await handler('GET'))
      expect(current).toMatchObject({ text: '导入当前\n', active: '导入模板', hasBackup: true })
      expect(await readFile(join(directory, 'AGENTS.md.bak'), 'utf8')).toBe('本地当前\n')
      const names = (envelope(await handler('GET', '/templates')).templates as Array<{ name: string }>).map(({ name }) => name)
      expect(names).toEqual(expect.arrayContaining(['本地模板', '导入模板']))
      expect(await exists(join(directory, 'instructions', 'import-rollback.json'))).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('validates the complete bundle before writing anything', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))
      const bundle = {
        format: 'dsh-instructions-v1',
        exportedAt: Date.now(),
        active: null,
        current: 'new current',
        templates: [
          { name: 'valid', text: 'would be written first' },
          { name: ' invalid ', text: 'bad' },
        ],
        history: [],
      }
      const response = await mutate(handler, 'POST', '/import', { bundle })
      expect(response.status).toBe(400)
      expect(envelope(response).code).toBe('BAD_REQUEST')
      expect(envelope(await handler('GET')).text).toBe('')
      expect(envelope(await handler('GET', '/templates')).templates).toEqual([])

      const invalidTimestamp = await mutate(handler, 'POST', '/import', {
        bundle: { ...bundle, exportedAt: 'today', templates: [] },
      })
      expect(invalidTimestamp.status).toBe(400)
      expect(envelope(invalidTimestamp).code).toBe('BAD_REQUEST')
      expect(envelope(await handler('GET')).text).toBe('')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects a missing active template and bundle limits', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))
      const missingActive = {
        format: 'dsh-instructions-v2',
        exportedAt: Date.now(),
        active: 'missing',
        current: '',
        templates: [],
        history: [],
      }
      const missing = await mutate(handler, 'POST', '/import', { bundle: missingActive })
      expect(missing.status).toBe(400)

      const tooMany = {
        ...missingActive,
        active: null,
        templates: Array.from({ length: 51 }, (_, index) => ({ name: `t-${index}`, text: '' })),
      }
      const limited = await mutate(handler, 'POST', '/import', { bundle: tooMany })
      expect(limited.status).toBe(413)
      expect(envelope(limited).code).toBe('LIMIT_EXCEEDED')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('exports the compatible v2 field layout with a revision', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))
      await mutate(handler, 'PUT', '', { text: '当前\n' })
      const response = envelope(await handler('POST', '/export'))
      expect(response.revision).toMatch(/^[0-9a-f]{64}$/)
      expect(response.bundle).toMatchObject({
        format: 'dsh-instructions-v2',
        active: null,
        current: '当前\n',
        templates: [],
        history: [],
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects request bodies larger than 16 MiB', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(directory, 'settings.yaml'))
      const body = JSON.stringify({
        expectedRevision: await revision(handler),
        padding: 'x'.repeat(16 * 1024 * 1024),
      })
      const response = await handler('POST', '/import', body)
      expect(response.status).toBe(413)
      expect(envelope(response).code).toBe('PAYLOAD_TOO_LARGE')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 30_000)
})

describe('read-only project overview', () => {
  it('distinguishes present, missing, and unreadable project instructions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const present = join(directory, 'present')
      const missing = join(directory, 'missing')
      const unreadable = join(directory, 'unreadable')
      await mkdir(present)
      await mkdir(missing)
      await mkdir(join(unreadable, 'AGENTS.md'), { recursive: true })
      await writeFile(join(present, 'AGENTS.md'), '# Rules\n', 'utf8')
      const workspaces = [present, missing, unreadable].map((path) => ({ id: path, path, title: path.split(/[\\/]/).at(-1) ?? path }))
      const { handler } = fakeCtx(join(directory, 'settings.yaml'), {
        workspaceRegistry: { list: () => workspaces },
      })
      const projects = envelope(await handler('GET', '/project')).projects as Array<{ status: string }>
      expect(projects.map(({ status }) => status)).toEqual(['present', 'missing', 'unreadable'])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
