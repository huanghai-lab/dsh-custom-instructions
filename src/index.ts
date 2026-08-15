/**
 * dsh-custom-instructions — host half.
 *
 * Serves the global-instructions editor backend: one route family under
 * /api/dsh-custom-instructions that reads and writes the user's global
 * instruction file (~/.dsh/AGENTS.md, resolved through the settings
 * document's directory so DSH_HOME overrides work). The browser half
 * (./client) renders the settings page (设置 → 自定义指令).
 *
 * Everything rides official DSH services (webServer + fs) — no dsh source
 * changes, hot-pluggable via a cordis.patch.yml row.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from '@deepseek-ai/dsh-host-webserver'

/** Route prefix for this plugin's JSON operations. */
export const ROUTE_PREFIX = '/api/dsh-custom-instructions'

export const inject = ['webServer']

/** One JSON envelope response. */
function json(res: ServerResponse, payload: unknown, status = 200): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

/** Read the request body (bounded) as UTF-8 text. */
function readBody(req: IncomingMessage, maxBytes = 256 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > maxBytes) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
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
        return doc.replace(/[\\/]settings\.ya?ml$/, '') + '/AGENTS.md'
      }
    } catch {
      // Fall through to the conventional path below.
    }
  }
  return 'C:/Users/25434/.dsh/AGENTS.md'
}

/**
 * Register the route family. GET returns the current instructions (empty
 * string when the file does not exist yet), PUT replaces them.
 * @param ctx - context carrying webServer.
 * @returns the route disposers.
 */
export function registerCustomInstructionsRoutes(ctx: Context): Array<() => void> {
  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = await instructionsPath(ctx)
    try {
      const fs = ctx.get('fs')
      if (fs === undefined) {
        json(res, { ok: false, error: 'filesystem unavailable' }, 503)
        return
      }
      const target = await fs.resolve(path)
      if (req.method === 'GET') {
        let text = ''
        try {
          text = await fs.readText(target)
        } catch {
          // Absent file reads as an empty instruction set.
        }
        json(res, { ok: true, path, text })
        return
      }
      if (req.method === 'PUT') {
        const body = await readBody(req)
        let text = ''
        try {
          text = JSON.parse(body).text
        } catch {
          json(res, { ok: false, error: 'invalid JSON body' }, 400)
          return
        }
        if (typeof text !== 'string') {
          json(res, { ok: false, error: 'expected { text: string }' }, 400)
          return
        }
        await fs.writeText(target, text)
        json(res, { ok: true, path })
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
 * Plugin entry. Registers the route family for the web GUI.
 * @param ctx - the plugin context (webServer injected).
 */
export function apply(ctx: Context): void {
  const disposers = registerCustomInstructionsRoutes(ctx)
  ctx.effect(() => () => {
    for (const dispose of disposers) dispose()
  })
}
