/** Host routes for the DSH custom-instructions center. */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type {} from '@deepseek-ai/dsh-host-webserver'
import * as store from './host/store.ts'

export const ROUTE_PREFIX = '/api/dsh-custom-instructions'
export const MAX_INSTRUCTIONS_BYTES = store.MAX_CONTENT_BYTES
// JSON control-character escapes can expand one content byte to six bytes.
const SMALL_BODY_BYTES = store.MAX_CONTENT_BYTES * 6 + 8 * 1024

export const inject = ['webServer', 'connection']

interface ProtectedConnection {
  requestRejection(request: Pick<IncomingMessage, 'headers'>): 401 | 403 | undefined
}

function connectionOf(ctx: Context): ProtectedConnection {
  const connection = Reflect.get(ctx, 'connection') as Partial<ProtectedConnection> | undefined
  if (typeof connection?.requestRejection !== 'function') {
    throw new Error('dsh-custom-instructions requires an authenticated DSH connection service')
  }
  return connection as ProtectedConnection
}

class RequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: 400 | 413,
  ) {
    super(message)
    this.name = 'RequestError'
  }
}

function json(res: ServerResponse, payload: unknown, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

function fail(res: ServerResponse, status: number, code: string, message: string): void {
  json(res, { code, message }, status)
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let tooLarge = false
    req.on('data', (chunk: Buffer | string) => {
      if (tooLarge) return
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += buffer.length
      if (total > maxBytes) {
        tooLarge = true
        chunks.length = 0
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => {
      if (tooLarge) {
        reject(new RequestError('PAYLOAD_TOO_LARGE', `request body exceeds ${maxBytes} bytes`, 413))
        return
      }
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })
}

async function parseJsonBody(req: IncomingMessage, maxBytes = SMALL_BODY_BYTES): Promise<Record<string, unknown>> {
  const text = await readBody(req, maxBytes)
  try {
    const parsed = JSON.parse(text) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('body must be an object')
    return parsed as Record<string, unknown>
  } catch {
    throw new RequestError('INVALID_JSON', 'request body must be a JSON object', 400)
  }
}

function expectedRevision(body: Record<string, unknown>): string {
  if (typeof body.expectedRevision !== 'string' || !/^[0-9a-f]{64}$/i.test(body.expectedRevision)) {
    throw new RequestError('EXPECTED_REVISION_REQUIRED', 'expectedRevision must be a SHA-256 revision', 400)
  }
  return body.expectedRevision
}

async function instructionsPath(ctx: Context): Promise<string> {
  const settings = ctx.get('settings')
  if (settings !== undefined) {
    const document = await settings.prepareDocument()
    if (typeof document === 'string' && document.length > 0) return join(dirname(document), 'AGENTS.md')
  }
  return join(homedir(), '.dsh', 'AGENTS.md')
}

function routePath(url: string | undefined): string[] | null {
  const raw = (url ?? '').split('?')[0]
  if (raw === ROUTE_PREFIX) return ['']
  if (!raw.startsWith(`${ROUTE_PREFIX}/`)) return null
  try {
    return raw.slice(ROUTE_PREFIX.length + 1).split('/').map((segment) => decodeURIComponent(segment))
  } catch {
    throw new RequestError('BAD_PATH', 'request path contains invalid encoding', 400)
  }
}

interface ProjectEntry {
  path: string
  title: string
  agentsPath: string
  hasAgents: boolean
  status: 'present' | 'missing' | 'unreadable'
  message?: string
}

async function projectView(ctx: Context): Promise<ProjectEntry[]> {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return []
  const workspaces = registry.list() as Array<{ id: string; path: string; title: string }>
  return Promise.all(workspaces.map(async (workspace) => {
    const agentsPath = join(workspace.path, 'AGENTS.md')
    try {
      await readFile(agentsPath, 'utf8')
      return { path: workspace.path, title: workspace.title, agentsPath, hasAgents: true, status: 'present' as const }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
        return { path: workspace.path, title: workspace.title, agentsPath, hasAgents: false, status: 'missing' as const }
      }
      return {
        path: workspace.path,
        title: workspace.title,
        agentsPath,
        hasAgents: false,
        status: 'unreadable' as const,
        message: String((error as Error).message ?? error),
      }
    }
  }))
}

function handleError(ctx: Context, res: ServerResponse, error: unknown): void {
  if (error instanceof store.StoreError || error instanceof RequestError) {
    fail(res, error.status, error.code, error.message)
    return
  }
  ctx.logger.warn(`dsh-custom-instructions: ${String(error)}`)
  fail(res, 500, 'INTERNAL_ERROR', 'unexpected instruction storage error')
}

export function registerCustomInstructionsRoutes(ctx: Context): Array<() => void> {
  const connection = connectionOf(ctx)
  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const rejection = connection.requestRejection(req)
    if (rejection !== undefined) {
      fail(
        res,
        rejection,
        rejection === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN',
        rejection === 401 ? 'browser authentication is required' : 'request origin is not allowed',
      )
      return
    }
    try {
      const globalPath = await instructionsPath(ctx)
      const segments = routePath(req.url)
      if (segments === null) {
        fail(res, 404, 'NOT_FOUND', 'route was not found')
        return
      }
      const sub = segments[0] ?? ''

      if (sub === '' && segments.length === 1 && req.method === 'GET') {
        const { value: [text, active, backup, templates, history], revision } = await store.readConsistent(globalPath, () => Promise.all([
          store.readGlobal(globalPath),
          store.readActive(globalPath),
          store.hasBackup(globalPath),
          store.listTemplates(globalPath),
          store.listHistory(globalPath),
        ]))
        json(res, {
          ok: true,
          path: globalPath,
          text,
          active,
          hasBackup: backup,
          templates,
          history,
          revision,
          maxBytes: store.MAX_CONTENT_BYTES,
          maxTemplates: store.MAX_TEMPLATES,
          maxHistory: store.MAX_HISTORY,
          maxImportBytes: store.MAX_IMPORT_BYTES,
        })
        return
      }

      if (sub === '' && segments.length === 1 && req.method === 'PUT') {
        const body = await parseJsonBody(req)
        if (typeof body.text !== 'string') throw new RequestError('BAD_REQUEST', 'text must be a string', 400)
        const result = await store.writeGlobal(globalPath, body.text, expectedRevision(body))
        json(res, { ok: true, path: globalPath, active: null, maxBytes: store.MAX_CONTENT_BYTES, ...result })
        return
      }

      if (sub === '' && segments.length === 1 && req.method === 'POST') {
        const body = await parseJsonBody(req)
        if (body.action !== 'restore') throw new RequestError('BAD_REQUEST', 'action must be "restore"', 400)
        const result = await store.restoreBackup(globalPath, expectedRevision(body))
        json(res, { ok: true, path: globalPath, active: null, ...result })
        return
      }

      if (sub === 'templates' && segments.length === 2 && req.method === 'POST' && segments[1] === 'activate') {
        const body = await parseJsonBody(req)
        if (typeof body.name !== 'string') throw new RequestError('BAD_REQUEST', 'name must be a string', 400)
        const result = await store.activateTemplate(globalPath, body.name, expectedRevision(body))
        json(res, { ok: true, active: body.name, ...result })
        return
      }

      if (sub === 'templates' && segments.length === 2 && req.method === 'GET') {
        const { value: text, revision } = await store.readConsistent(
          globalPath,
          () => store.readTemplate(globalPath, segments[1]),
        )
        json(res, { ok: true, name: segments[1], text, revision })
        return
      }

      if (sub === 'templates' && segments.length === 2 && req.method === 'PUT') {
        const body = await parseJsonBody(req)
        if (typeof body.text !== 'string') throw new RequestError('BAD_REQUEST', 'text must be a string', 400)
        const result = await store.writeTemplate(globalPath, segments[1], body.text, expectedRevision(body))
        json(res, { ok: true, ...result })
        return
      }

      if (sub === 'templates' && segments.length === 2 && req.method === 'DELETE') {
        const body = await parseJsonBody(req)
        const result = await store.deleteTemplate(globalPath, segments[1], expectedRevision(body))
        json(res, { ok: true, ...result })
        return
      }

      if (sub === 'templates' && segments.length === 1 && req.method === 'GET') {
        const { value: [templates, active], revision } = await store.readConsistent(globalPath, () => Promise.all([
          store.listTemplates(globalPath), store.readActive(globalPath),
        ]))
        json(res, { ok: true, templates, active, revision })
        return
      }

      if (sub === 'templates' && segments.length === 1 && req.method === 'POST') {
        const body = await parseJsonBody(req)
        if (typeof body.name !== 'string' || typeof body.text !== 'string') {
          throw new RequestError('BAD_REQUEST', 'name and text must be strings', 400)
        }
        const result = await store.writeTemplate(globalPath, body.name, body.text, expectedRevision(body))
        json(res, { ok: true, name: body.name, ...result })
        return
      }

      if (sub === 'history' && segments.length === 2 && req.method === 'GET') {
        const { value: text, revision } = await store.readConsistent(
          globalPath,
          () => store.readHistory(globalPath, segments[1]),
        )
        json(res, { ok: true, id: segments[1], text, revision })
        return
      }

      if (sub === 'history' && segments.length === 1 && req.method === 'GET') {
        const { value: history, revision } = await store.readConsistent(globalPath, () => store.listHistory(globalPath))
        json(res, { ok: true, history, revision })
        return
      }

      if (sub === 'history' && segments.length === 2 && req.method === 'POST' && segments[1] === 'restore') {
        const body = await parseJsonBody(req)
        if (typeof body.id !== 'string') throw new RequestError('BAD_REQUEST', 'id must be a string', 400)
        const result = await store.restoreHistory(globalPath, body.id, expectedRevision(body))
        json(res, { ok: true, active: null, ...result })
        return
      }

      if (sub === 'export' && segments.length === 1 && req.method === 'POST') {
        const { value: bundle, revision } = await store.readConsistent(globalPath, () => store.exportBundle(globalPath))
        json(res, { ok: true, bundle, revision })
        return
      }

      if (sub === 'import' && segments.length === 1 && req.method === 'POST') {
        const body = await parseJsonBody(req, store.MAX_IMPORT_BYTES)
        const result = await store.importBundle(globalPath, body.bundle, expectedRevision(body))
        json(res, { ok: true, revision: result.revision, ...result.summary })
        return
      }

      if (sub === 'project' && segments.length === 1 && req.method === 'GET') {
        json(res, { ok: true, source: 'workspaceRegistry', projects: await projectView(ctx) })
        return
      }

      fail(res, 404, 'NOT_FOUND', 'route was not found')
    } catch (error) {
      handleError(ctx, res, error)
    }
  }

  return [ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler })]
}

export function apply(ctx: Context): void {
  const disposers = registerCustomInstructionsRoutes(ctx)
  ctx.effect(() => () => {
    for (const dispose of disposers) dispose()
  })
}
