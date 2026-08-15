/**
 * Browser-side API client for the /api/dsh-custom-instructions route family.
 * Plain fetch, same origin — the only data path the instruction center uses.
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
  /** Active template name, or null when editing freely. */
  active?: string | null
  /** Whether a one-generation backup exists. */
  hasBackup?: boolean
}

export interface TemplateEntry {
  name: string
  size: number
  updatedAt: number
}

export interface HistoryEntry {
  id: string
  size: number
  savedAt: number
}

export interface ProjectEntry {
  path: string
  title: string
  hasAgents: boolean
}

export interface PresetView {
  preset: string
  persona: string
}

export interface ExportBundle {
  format: string
  exportedAt: number
  active: string | null
  current: string
  templates: Array<{ name: string; text: string }>
  history: Array<{ id: string; text: string }>
}

/** Parse a JSON response, throwing on non-2xx statuses. */
async function request(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`${ROUTE_PREFIX}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const result = (await response.json()) as Record<string, unknown>
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : `HTTP ${response.status}`)
  return result
}

/** Read the current global instructions (empty string when none exist). */
export async function readInstructions(): Promise<InstructionsResult> {
  return (await request('GET', '')) as unknown as InstructionsResult
}

/** Replace the global instructions. */
export async function writeInstructions(text: string): Promise<InstructionsResult> {
  return (await request('PUT', '', { text })) as unknown as InstructionsResult
}

/** Restore the one-generation backup (undo the last save). */
export async function restoreInstructions(): Promise<InstructionsResult> {
  return (await request('POST', '', { action: 'restore' })) as unknown as InstructionsResult
}

/** List templates plus the active template name. */
export async function listTemplates(): Promise<{ templates: TemplateEntry[]; active: string | null }> {
  return (await request('GET', '/templates')) as unknown as { templates: TemplateEntry[]; active: string | null }
}

/** Create or update a named template. */
export async function saveTemplate(name: string, text: string): Promise<void> {
  await request('POST', '/templates', { name, text })
}

/** Read one template. */
export async function readTemplate(name: string): Promise<{ name: string; text: string }> {
  return (await request('GET', `/templates/${encodeURIComponent(name)}`)) as unknown as { name: string; text: string }
}

/** Delete a named template. */
export async function deleteTemplate(name: string): Promise<void> {
  await request('DELETE', `/templates/${encodeURIComponent(name)}`)
}

/** Activate a template (copies it into the global instructions). */
export async function activateTemplate(name: string): Promise<{ text: string }> {
  return (await request('POST', '/templates/activate', { name })) as unknown as { text: string }
}

/** List version history (newest first). */
export async function listHistory(): Promise<{ history: HistoryEntry[] }> {
  return (await request('GET', '/history')) as unknown as { history: HistoryEntry[] }
}

/** Restore a history snapshot as the current content. */
export async function restoreHistory(id: string): Promise<{ text: string }> {
  return (await request('POST', '/history/restore', { id })) as unknown as { text: string }
}

/** Project-level instruction overview. */
export async function projectView(): Promise<{ projects: ProjectEntry[] }> {
  return (await request('GET', '/project')) as unknown as { projects: ProjectEntry[] }
}

/** Active preset persona overview. */
export async function presetView(): Promise<{ view: PresetView | null }> {
  return (await request('GET', '/preset')) as unknown as { view: PresetView | null }
}

/** Export the whole instruction center as a JSON bundle. */
export async function exportBundle(): Promise<{ bundle: ExportBundle }> {
  return (await request('POST', '/export', {})) as unknown as { bundle: ExportBundle }
}

/** Import a bundle. */
export async function importBundle(bundle: unknown): Promise<{ imported: number }> {
  return (await request('POST', '/import', { bundle })) as unknown as { imported: number }
}
