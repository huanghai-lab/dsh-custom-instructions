/**
 * dsh-custom-instructions — host half: the instruction center backend.
 *
 * One route family under /api/dsh-custom-instructions that manages the user's
 * global instruction file (~/.dsh/AGENTS.md), named instruction templates,
 * version history, backup/restore, import/export, plus read-only views of
 * project-level instructions and the active agent preset's persona. The
 * browser half (./client) renders the 设置 → 自定义指令 page.
 *
 * Files live in $DSH_HOME (outside the session workspace), so they are
 * mutated through node:fs directly — same precedent as the dsh-web-ui
 * family's host stores (dsh-ssh). The webServer service carries the routes.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { mkdir, readFile } from 'node:fs/promises'
import type {} from '@deepseek-ai/dsh-host-webserver'
import * as store from './host/store.ts'

/** Route prefix for this plugin's JSON operations. */
export const ROUTE_PREFIX = '/api/dsh-custom-instructions'

/** UTF-8 byte cap the DSH workspace-instruction loader accepts. */
export const MAX_INSTRUCTIONS_BYTES = 65536

export const inject = ['webServer']

/** One JSON envelope response. */
function json(res: ServerResponse, payload: unknown, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

/** Read the request body (bounded) as UTF-8 text. */
function readBody(req: IncomingMessage, maxBytes = 4 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        reject(new Error(`request body exceeds ${maxBytes} bytes`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Parse a JSON body or return undefined on failure. */
async function parseJsonBody<T>(req: IncomingMessage): Promise<T | undefined> {
  const body = await readBody(req)
  try {
    return JSON.parse(body) as T
  } catch {
    return undefined
  }
}

/**
 * Locate the user's global instruction file: the AGENTS.md beside the
 * settings document ($DSH_HOME/settings.yaml). Falls back to the conventional
 * home path when no settings document is available.
 */
async function instructionsPath(ctx: Context): Promise<string> {
  const settings = ctx.get('settings')
  if (settings !== undefined) {
    try {
      const doc = await settings.prepareDocument()
      if (typeof doc === 'string' && doc.length > 0) {
        return join(dirname(doc), 'AGENTS.md')
      }
    } catch {
      // Fall through to the conventional path below.
    }
  }
  return join(homedir(), '.dsh', 'AGENTS.md')
}

/** Split the URL into path segments under the route prefix ('' for root). */
function routePath(url: string | undefined): string[] {
  const raw = (url ?? '').split('?')[0]
  const prefix = ROUTE_PREFIX
  if (raw === prefix) return ['']
  if (!raw.startsWith(`${prefix}/`)) return ['']
  return raw.slice(prefix.length + 1).split('/').map((segment) => decodeURIComponent(segment))
}

/**
 * Project-level instruction view: every registered workspace plus whether it
 * carries its own AGENTS.md at the root.
 */
async function projectView(ctx: Context): Promise<Array<{ path: string; title: string; hasAgents: boolean }>> {
  const registry = ctx.get('workspaceRegistry')
  if (registry === undefined) return []
  const workspaces = registry.list() as Array<{ id: string; path: string; title: string }>
  const rows: Array<{ path: string; title: string; hasAgents: boolean }> = []
  for (const workspace of workspaces) {
    try {
      await readFile(join(workspace.path, 'AGENTS.md'), 'utf8')
      rows.push({ path: workspace.path, title: workspace.title, hasAgents: true })
    } catch {
      rows.push({ path: workspace.path, title: workspace.title, hasAgents: false })
    }
  }
  return rows
}

/**
 * Persona overview: the default preset's identity plus the first persona
 * section text found in its composition (read-only).
 */
async function personaView(ctx: Context): Promise<{ preset: string; persona: string } | null> {
  const presets = ctx.get('agentPresets')
  if (presets === undefined) return null
  try {
    const preset = await presets.resolve()
    const composition = await presets.read(preset.id)
    // Extract the persona row's text block (best effort YAML slice).
    const match = /- id:\s*persona[\s\S]*?text:\s*\|-?\s*\n([\s\S]*?)(?=\n- id:|\n---|\n\s{2,}\S+:|$)/.exec(composition)
    const persona = match !== null ? match[1].trim() : ''
    return { preset: preset.id, persona }
  } catch {
    return null
  }
}

/**
 * Register the instruction-center route family.
 * @param ctx - context carrying webServer.
 * @returns the route disposers.
 */
export function registerCustomInstructionsRoutes(ctx: Context): Array<() => void> {
  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = await instructionsPath(ctx)
    const segments = routePath(req.url)
    const sub = segments[0] ?? ''
    try {
      // ── global instructions ────────────────────────────────────────────
      if (sub === '' && req.method === 'GET') {
        let text = ''
        try {
          text = await store.readGlobal(path)
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
        }
        const [active, backup] = await Promise.all([store.readActive(path), store.hasBackup(path)])
        json(res, { ok: true, path, text, maxBytes: MAX_INSTRUCTIONS_BYTES, active, hasBackup: backup })
        return
      }
      if (sub === '' && req.method === 'PUT') {
        const body = await parseJsonBody<{ text?: unknown }>(req)
        if (body === undefined) { json(res, { ok: false, error: 'invalid JSON body' }, 400); return }
        if (typeof body.text !== 'string') { json(res, { ok: false, error: 'expected { text: string }' }, 400); return }
        await store.writeGlobal(path, body.text)
        json(res, { ok: true, path, maxBytes: MAX_INSTRUCTIONS_BYTES })
        return
      }
      if (sub === '' && req.method === 'POST') {
        const body = await parseJsonBody<{ action?: unknown }>(req)
        if (body === undefined) { json(res, { ok: false, error: 'invalid JSON body' }, 400); return }
        if (body.action !== 'restore') { json(res, { ok: false, error: 'expected { action: "restore" }' }, 400); return }
        try {
          const previous = await store.restoreBackup(path)
          json(res, { ok: true, path, text: previous })
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') { json(res, { ok: false, error: 'no backup available' }, 404); return }
          throw error
        }
        return
      }

      // ── templates (sub-paths first: activate / name-targeted routes) ───
      if (sub === 'templates' && req.method === 'POST' && segments[1] === 'activate') {
        const body = await parseJsonBody<{ name?: unknown }>(req)
        if (body === undefined) { json(res, { ok: false, error: 'invalid JSON body' }, 400); return }
        if (typeof body.name !== 'string') { json(res, { ok: false, error: 'expected { name: string }' }, 400); return }
        try {
          const text = await store.activateTemplate(path, body.name)
          json(res, { ok: true, text })
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') { json(res, { ok: false, error: 'template not found' }, 404); return }
          throw error
        }
        return
      }
      if (sub === 'templates' && req.method === 'GET' && segments.length >= 2) {
        try {
          const text = await store.readTemplate(path, segments[1])
          json(res, { ok: true, name: segments[1], text })
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') { json(res, { ok: false, error: 'template not found' }, 404); return }
          throw error
        }
        return
      }
      if (sub === 'templates' && req.method === 'PUT' && segments.length >= 2) {
        const name = segments[1]
        const body = await parseJsonBody<{ text?: unknown }>(req)
        if (body === undefined) { json(res, { ok: false, error: 'invalid JSON body' }, 400); return }
        if (typeof body.text !== 'string') { json(res, { ok: false, error: 'expected { text: string }' }, 400); return }
        await store.writeTemplate(path, name, body.text)
        json(res, { ok: true })
        return
      }
      if (sub === 'templates' && req.method === 'DELETE' && segments.length >= 2) {
        await store.deleteTemplate(path, segments[1])
        json(res, { ok: true })
        return
      }
      if (sub === 'templates' && req.method === 'GET') {
        const [templates, active] = await Promise.all([store.listTemplates(path), store.readActive(path)])
        json(res, { ok: true, templates, active })
        return
      }
      if (sub === 'templates' && req.method === 'POST') {
        // POST /templates {name, text} — create or update a template.
        const body = await parseJsonBody<{ name?: unknown; text?: unknown }>(req)
        if (body === undefined) { json(res, { ok: false, error: 'invalid JSON body' }, 400); return }
        if (typeof body.name !== 'string' || typeof body.text !== 'string') {
          json(res, { ok: false, error: 'expected { name: string, text: string }' }, 400)
          return
        }
        await store.writeTemplate(path, body.name, body.text)
        json(res, { ok: true })
        return
      }

      // ── history ────────────────────────────────────────────────────────
      if (sub === 'history' && req.method === 'GET') {
        const history = await store.listHistory(path)
        json(res, { ok: true, history })
        return
      }
      if (sub === 'history' && req.method === 'POST' && segments[1] === 'restore') {
        const body = await parseJsonBody<{ id?: unknown }>(req)
        if (body === undefined) { json(res, { ok: false, error: 'invalid JSON body' }, 400); return }
        if (typeof body.id !== 'string') { json(res, { ok: false, error: 'expected { id: string }' }, 400); return }
        try {
          const text = await store.restoreHistory(path, body.id)
          json(res, { ok: true, text })
        } catch (error) {
          if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') { json(res, { ok: false, error: 'history entry not found' }, 404); return }
          throw error
        }
        return
      }

      // ── import / export ────────────────────────────────────────────────
      if (sub === 'export' && req.method === 'POST') {
        const bundle = await store.exportBundle(path)
        json(res, { ok: true, bundle })
        return
      }
      if (sub === 'import' && req.method === 'POST') {
        const body = await parseJsonBody<{ bundle?: unknown }>(req)
        if (body === undefined) { json(res, { ok: false, error: 'invalid JSON body' }, 400); return }
        const count = await store.importBundle(path, body.bundle)
        json(res, { ok: true, imported: count })
        return
      }

      // ── views ──────────────────────────────────────────────────────────
      if (sub === 'project' && req.method === 'GET') {
        const projects = await projectView(ctx)
        json(res, { ok: true, projects })
        return
      }
      if (sub === 'preset' && req.method === 'GET') {
        const view = await personaView(ctx)
        json(res, { ok: true, view })
        return
      }

      res.writeHead(405)
      res.end()
    } catch (error: unknown) {
      ctx.logger.warn(`dsh-custom-instructions: ${String(error)}`)
      json(res, { ok: false, error: String((error as Error)?.message ?? error) }, 500)
    }
  }

  return [
    ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler }),
  ]
}

/**
 * Plugin entry. Registers the instruction-center route family.
 * @param ctx - the plugin context (webServer injected).
 */
export function apply(ctx: Context): void {
  const disposers = registerCustomInstructionsRoutes(ctx)
  ctx.effect(() => () => {
    for (const dispose of disposers) dispose()
  })
}
