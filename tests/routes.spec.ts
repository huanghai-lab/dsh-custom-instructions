/**
 * Host route tests: GET/PUT semantics, path resolution, and error handling —
 * exercised through the real node:fs with a fake ctx.webServer registry and a
 * temp-dir settings document so no real ~/.dsh/AGENTS.md is touched.
 */

import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { ROUTE_PREFIX, registerCustomInstructionsRoutes } from '../src/index.ts'

interface CapturedRequest {
  status: number
  headers: Record<string, string>
  body: string
}

/** A minimal ctx fulfilling what registerCustomInstructionsRoutes touches. */
function fakeCtx(settingsDoc: string): {
  ctx: Record<string, unknown>
  handler: (method: string, url?: string, body?: string) => Promise<CapturedRequest>
} {
  let handler: ((req: unknown, res: unknown) => Promise<void>) | undefined
  const ctx = {
    logger: { warn: () => {} },
    get: (name: string) => {
      if (name === 'settings') return { prepareDocument: async () => settingsDoc }
      return undefined
    },
    webServer: {
      register: (row: { kind: string; path: string; handler: (req: unknown, res: unknown) => Promise<void> }) => {
        handler = row.handler
        return () => {}
      },
    },
    effect: (fn: () => () => void) => { fn(); return () => {} },
  }
  const disposers = registerCustomInstructionsRoutes(ctx as never)
  if (handler === undefined) throw new Error('route handler was not registered')
  const captured = handler
  const disposer = () => { for (const dispose of disposers) dispose() }

  const request = async (method: string, url = '', body?: string): Promise<CapturedRequest> => {
    let status = 0
    let headers: Record<string, string> = {}
    let out = ''
    const res = {
      writeHead: (code: number, head: Record<string, string> = {}) => { status = code; headers = head },
      end: (chunk?: unknown) => { if (chunk !== undefined && chunk !== null) out = String(chunk) },
    }
    const req: Record<string, unknown> = { method, url: `${ROUTE_PREFIX}${url}` }
    const events: Record<string, Array<(chunk?: unknown) => void>> = { data: [], end: [], error: [] }
    req.on = (event: string, listener: (chunk?: unknown) => void) => {
      events[event]?.push(listener)
      return req
    }
    if ((method === 'PUT' || method === 'POST') && body !== undefined) {
      const call = (): void => {
        for (const listener of events.data) listener(Buffer.from(body, 'utf8'))
        for (const listener of events.end) listener()
      }
      // Macro-task deferral: the handler registers its 'data'/'end' listeners
      // only after its await chain settles, so firing on the microtask queue
      // would race ahead of registration. A macrotask runs after the handler
      // has reached `readBody` and installed the listeners.
      setTimeout(call, 0)
    } else if (method === 'PUT' || method === 'POST') {
      setTimeout(() => { for (const listener of events.end) listener() }, 0)
    }
    await captured(req as never, res as never)
    return { status, headers, body: out }
  }

  return { ctx, handler: request, ...{ dispose: disposer } } as unknown as { ctx: Record<string, unknown>; handler: typeof request }
}

/** Parse a JSON envelope body. */
function envelope(captured: CapturedRequest): Record<string, unknown> {
  return JSON.parse(captured.body) as Record<string, unknown>
}

describe('registerCustomInstructionsRoutes', () => {
  it('resolves AGENTS.md beside the settings document', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(dir, 'settings.yaml'))
      const res = await handler('GET')
      const parsed = envelope(res)
      expect(parsed.ok).toBe(true)
      expect(parsed.path).toBe(join(dir, 'AGENTS.md'))
      expect(parsed.text).toBe('')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('GET returns an empty instruction set when the file does not exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(dir, 'settings.yaml'))
      const res = await handler('GET')
      const parsed = envelope(res)
      expect(res.status).toBe(200)
      expect(parsed.ok).toBe(true)
      expect(parsed.path).toBe(join(dir, 'AGENTS.md'))
      expect(parsed.text).toBe('')
      expect(parsed.maxBytes).toBe(65536)
      expect(parsed.active).toBeNull()
      expect(parsed.hasBackup).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('GET returns the existing instructions', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const path = join(dir, 'AGENTS.md')
      await writeFile(path, 'line one\nline two\n', 'utf8')
      const { handler } = fakeCtx(join(dir, 'settings.yaml'))
      const res = await handler('GET')
      const parsed = envelope(res)
      expect(res.status).toBe(200)
      expect(parsed.text).toBe('line one\nline two\n')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('GET surfaces non-ENOENT read failures instead of returning empty text', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      // A directory in the file's place: reading it fails with EISDIR.
      const path = join(dir, 'AGENTS.md')
      await import('node:fs/promises').then(({ mkdir }) => mkdir(path))
      const { handler } = fakeCtx(join(dir, 'settings.yaml'))
      const res = await handler('GET')
      const parsed = envelope(res)
      expect(res.status).toBe(500)
      expect(parsed.ok).toBe(false)
      expect(typeof parsed.error).toBe('string')
      expect((parsed.error as string).length).toBeGreaterThan(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('PUT writes the instructions and creates parent directories', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(dir, 'nested', 'settings.yaml'))
      const res = await handler('PUT', '', JSON.stringify({ text: '写入了新指令\n' }))
      const parsed = envelope(res)
      expect(res.status).toBe(200)
      expect(parsed.ok).toBe(true)
      const stored = await readFile(join(dir, 'nested', 'AGENTS.md'), 'utf8')
      expect(stored).toBe('写入了新指令\n')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('PUT rejects an invalid JSON body with 400', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(dir, 'settings.yaml'))
      const res = await handler('PUT', 'not json')
      const parsed = envelope(res)
      expect(res.status).toBe(400)
      expect(parsed.ok).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('PUT rejects a non-string text field with 400', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(dir, 'settings.yaml'))
      const res = await handler('PUT', '', JSON.stringify({ text: 42 }))
      const parsed = envelope(res)
      expect(res.status).toBe(400)
      expect(parsed.ok).toBe(false)
      expect(parsed.error).toBe('expected { text: string }')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('answers unsupported methods with 405', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(dir, 'settings.yaml'))
      const res = await handler('DELETE')
      expect(res.status).toBe(405)
      expect(res.body).toBe('')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('GET reports the byte cap so the UI can surface the limit', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(dir, 'settings.yaml'))
      const res = await handler('GET')
      const parsed = envelope(res)
      expect(res.status).toBe(200)
      expect(typeof parsed.maxBytes).toBe('number')
      expect(parsed.maxBytes as number).toBeGreaterThan(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('PUT rotates the previous content into the .bak backup', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const path = join(dir, 'AGENTS.md')
      const { handler } = fakeCtx(join(dir, 'settings.yaml'))
      const first = await handler('PUT', '', JSON.stringify({ text: '第一版内容\n' }))
      expect(envelope(first).ok).toBe(true)
      const second = await handler('PUT', '', JSON.stringify({ text: '第二版内容\n' }))
      expect(envelope(second).ok).toBe(true)
      expect(await readFile(path, 'utf8')).toBe('第二版内容\n')
      expect(await readFile(`${path}.bak`, 'utf8')).toBe('第一版内容\n')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('POST restore recovers the backed-up content and returns it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const path = join(dir, 'AGENTS.md')
      const { handler } = fakeCtx(join(dir, 'settings.yaml'))
      await handler('PUT', '', JSON.stringify({ text: '原始内容\n' }))
      await handler('PUT', '', JSON.stringify({ text: '误改的内容\n' }))
      const res = await handler('POST', '', JSON.stringify({ action: 'restore' }))
      const parsed = envelope(res)
      expect(res.status).toBe(200)
      expect(parsed.ok).toBe(true)
      expect(parsed.text).toBe('原始内容\n')
      expect(await readFile(path, 'utf8')).toBe('原始内容\n')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('POST restore answers 404 when no backup exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(dir, 'settings.yaml'))
      const res = await handler('POST', '', JSON.stringify({ action: 'restore' }))
      const parsed = envelope(res)
      expect(res.status).toBe(404)
      expect(parsed.ok).toBe(false)
      expect(parsed.error).toBe('no backup available')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('POST rejects an unknown action with 400', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(dir, 'settings.yaml'))
      const res = await handler('POST', '', JSON.stringify({ action: 'explode' }))
      const parsed = envelope(res)
      expect(res.status).toBe(400)
      expect(parsed.ok).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('instruction center: templates, history, import/export', () => {
  it('creates, lists, reads, activates, and deletes a template', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(dir, 'settings.yaml'))

      const created = await handler('POST', '/templates', JSON.stringify({ name: 'writing', text: '写作规则模板\n' }))
      expect(envelope(created).ok).toBe(true)

      const list = await handler('GET', '/templates')
      const parsed = envelope(list)
      expect(parsed.ok).toBe(true)
      const templates = parsed.templates as Array<{ name: string }>
      expect(templates.map((entry) => entry.name)).toContain('writing')
      expect(parsed.active).toBeNull()

      const read = await handler('GET', '/templates/writing')
      const readParsed = envelope(read)
      expect(readParsed.text).toBe('写作规则模板\n')

      const activated = await handler('POST', '/templates/activate', JSON.stringify({ name: 'writing' }))
      const activatedParsed = envelope(activated)
      expect(activatedParsed.ok).toBe(true)
      expect(activatedParsed.text).toBe('写作规则模板\n')

      // Activation copied the template into the global file and marked it active.
      const globalGet = await handler('GET')
      const globalParsed = envelope(globalGet)
      expect(globalParsed.text).toBe('写作规则模板\n')
      expect(globalParsed.active).toBe('writing')

      const afterList = await handler('GET', '/templates')
      expect(envelope(afterList).active).toBe('writing')

      const deleted = await handler('DELETE', '/templates/writing')
      expect(envelope(deleted).ok).toBe(true)

      const finalList = await handler('GET', '/templates')
      const finalTemplates = envelope(finalList).templates as Array<{ name: string }>
      expect(finalTemplates).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('rejects invalid template names', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(dir, 'settings.yaml'))
      const res = await handler('POST', '/templates', JSON.stringify({ name: '../evil', text: 'x' }))
      const parsed = envelope(res)
      expect(res.status).toBe(500)
      expect(parsed.ok).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('records version history on every save and restores a snapshot', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(dir, 'settings.yaml'))
      await handler('PUT', '', JSON.stringify({ text: '第一版\n' }))
      await handler('PUT', '', JSON.stringify({ text: '第二版\n' }))
      await handler('PUT', '', JSON.stringify({ text: '第三版\n' }))

      const list = await handler('GET', '/history')
      const history = envelope(list).history as Array<{ id: string; savedAt: number }>
      // First save had nothing to rotate; the next two each left a snapshot.
      expect(history.length).toBe(2)

      // Restore the oldest snapshot (第一版).
      const oldest = history[history.length - 1]
      const restored = await handler('POST', '/history/restore', JSON.stringify({ id: oldest.id }))
      const restoredParsed = envelope(restored)
      expect(restoredParsed.ok).toBe(true)
      expect(restoredParsed.text).toBe('第一版\n')

      const current = await handler('GET')
      expect(envelope(current).text).toBe('第一版\n')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('answers 404 for a missing history entry', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(dir, 'settings.yaml'))
      const res = await handler('POST', '/history/restore', JSON.stringify({ id: '9999999999999' }))
      const parsed = envelope(res)
      expect(res.status).toBe(404)
      expect(parsed.ok).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('exports and imports the whole instruction center', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'custinstr-'))
    try {
      const { handler } = fakeCtx(join(dir, 'settings.yaml'))
      await handler('PUT', '', JSON.stringify({ text: '当前内容\n' }))
      await handler('POST', '/templates', JSON.stringify({ name: 'tpl', text: '模板内容\n' }))

      const exported = await handler('POST', '/export')
      const exportedParsed = envelope(exported)
      const bundle = exportedParsed.bundle as { format: string; templates: unknown[] }
      expect(exportedParsed.ok).toBe(true)
      expect(bundle.format).toBe('dsh-instructions-v1')
      expect(bundle.templates.length).toBe(1)

      // Wipe and re-import.
      await handler('DELETE', '/templates/tpl')
      const imported = await handler('POST', '/import', JSON.stringify({ bundle }))
      const importedParsed = envelope(imported)
      expect(importedParsed.ok).toBe(true)
      expect(importedParsed.imported).toBeGreaterThanOrEqual(1)

      const list = await handler('GET', '/templates')
      expect((envelope(list).templates as Array<{ name: string }>).map((entry) => entry.name)).toContain('tpl')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
