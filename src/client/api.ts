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
}

/** Read the current global instructions (empty string when none exist). */
export async function readInstructions(): Promise<InstructionsResult> {
  const response = await fetch(ROUTE_PREFIX, { method: 'GET' })
  const result = (await response.json()) as InstructionsResult
  if (!response.ok) throw new Error(result.error ?? '请求失败')
  return result
}

/** Replace the global instructions. */
export async function writeInstructions(text: string): Promise<InstructionsResult> {
  const response = await fetch(ROUTE_PREFIX, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  const result = (await response.json()) as InstructionsResult
  if (!response.ok) throw new Error(result.error ?? '请求失败')
  return result
}
