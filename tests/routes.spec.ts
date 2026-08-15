/**
 * Host route tests: GET/PUT semantics, path resolution, and error handling —
 * exercised through the real node:fs with a fake ctx.webServer registry and a
 * temp-dir settings document so no real ~/.dsh/AGENTS.md is touched.
 */

import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { registerCustomInstructionsRoutes } from '../src/index.ts'

interface CapturedRequest {
  status: number
  headers: Record<string, string>
  body: string
}

/** A minimal ctx fulfilling what registerCustomInstructionsRoutes touches. */
function fakeCtx(settingsDoc: string): {
  ctx: Record<string, unknown>
  handler: (method: string, body?: string) => Promise<CapturedRequest>
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

  const request = async (method: string, body?: string): Promise<CapturedRequest> => {
    let status = 0
    let headers: Record<string, string> = {}
    let out = ''
    const res = {
      writeHead: (code: number, head: Record<string, string> = {}) => { status = code; headers = head },
      end: (chunk?: unknown) => { if (chunk !== undefined && chunk !== null) out = String(chunk) },
    }
    const req: Record<string, unknown> = { method }
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
      expect(parsed).toEqual({ ok: true, path: join(dir, 'AGENTS.md'), text: '', maxBytes: 65536 })
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
      const res = await handler('PUT', JSON.stringify({ text: '写入了新指令\n' }))
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
      const res = await handler('PUT', JSON.stringify({ text: 42 }))
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
      const first = await handler('PUT', JSON.stringify({ text: '第一版内容\n' }))
      expect(envelope(first).ok).toBe(true)
      const second = await handler('PUT', JSON.stringify({ text: '第二版内容\n' }))
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
      await handler('PUT', JSON.stringify({ text: '原始内容\n' }))
      await handler('PUT', JSON.stringify({ text: '误改的内容\n' }))
      const res = await handler('POST', JSON.stringify({ action: 'restore' }))
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
      const res = await handler('POST', JSON.stringify({ action: 'restore' }))
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
      const res = await handler('POST', JSON.stringify({ action: 'explode' }))
      const parsed = envelope(res)
      expect(res.status).toBe(400)
      expect(parsed.ok).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
