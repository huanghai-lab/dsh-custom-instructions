/**
 * Browser-side API client for the /api/dsh-custom-instructions route family.
 * Plain fetch, same origin — the only data path the settings page uses.
 */

/** Route prefix the host half serves. */
export const ROUTE_PREFIX = '/api/dsh-custom-instructions'

/** One instructions read/write response. */
export interface InstructionsResult {
  ok: boolean
  path?: string
  text?: string
  error?: string
  /** UTF-8 byte cap the DSH workspace-instruction loader accepts. */
  maxBytes?: number
}

/** Parse a JSON response, throwing on non-2xx statuses. */
async function request(method: string, body?: unknown): Promise<InstructionsResult> {
  const response = await fetch(ROUTE_PREFIX, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const result = (await response.json()) as InstructionsResult
  if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`)
  return result
}

/** Read the current global instructions (empty string when none exist). */
export async function readInstructions(): Promise<InstructionsResult> {
  return request('GET')
}

/** Replace the global instructions. */
export async function writeInstructions(text: string): Promise<InstructionsResult> {
  return request('PUT', { text })
}

/** Restore the one-generation backup (undo the last save). */
export async function restoreInstructions(): Promise<InstructionsResult> {
  return request('POST', { action: 'restore' })
}
