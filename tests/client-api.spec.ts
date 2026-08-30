import { afterEach, describe, expect, it, vi } from 'vitest'
import { readInstructions } from '../src/client/api.ts'

afterEach(() => vi.unstubAllGlobals())

function respond(body: string | null, status = 200, contentType = 'application/json'): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(body, {
    status,
    headers: { 'content-type': contentType },
  })))
}

describe('browser API client', () => {
  it('returns a JSON object from a successful response', async () => {
    const payload = {
      ok: true,
      path: 'C:/temp/AGENTS.md',
      text: '',
      revision: 'a'.repeat(64),
      maxBytes: 65_536,
      maxTemplates: 50,
      maxHistory: 100,
      maxImportBytes: 16 * 1024 * 1024,
      active: null,
      hasBackup: false,
      templates: [],
      history: [],
    }
    respond(JSON.stringify(payload))

    await expect(readInstructions()).resolves.toEqual(payload)
  })

  it.each([
    [null, 204, 'EMPTY_RESPONSE'],
    ['not json', 200, 'INVALID_RESPONSE'],
    ['gateway error', 502, 'HTTP_502'],
  ])('reports empty and non-JSON responses (%s, %s)', async (body, status, code) => {
    respond(body, status, 'text/plain')
    await expect(readInstructions()).rejects.toMatchObject({ name: 'ApiError', code, status })
  })

  it('preserves structured server errors', async () => {
    respond(JSON.stringify({ code: 'REVISION_CONFLICT', message: 'changed elsewhere' }), 409)
    await expect(readInstructions()).rejects.toEqual(
      expect.objectContaining({ code: 'REVISION_CONFLICT', message: 'changed elsewhere', status: 409 }),
    )
  })

  it('turns fetch failures into a stable network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await expect(readInstructions()).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 })
  })
})
