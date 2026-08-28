/** Browser API client for /api/dsh-custom-instructions. */

export const ROUTE_PREFIX = '/api/dsh-custom-instructions'

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface InstructionsResult {
  ok: true
  path: string
  text: string
  revision: string
  maxBytes: number
  maxTemplates: number
  maxHistory: number
  maxImportBytes: number
  active: string | null
  hasBackup: boolean
}

export interface MutationResult {
  ok: true
  revision: string
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
  agentsPath: string
  hasAgents: boolean
  status: 'present' | 'missing' | 'unreadable'
  message?: string
}

export interface PresetView {
  preset: string
  persona: string
}

export interface ExportBundle {
  format?: 'dsh-instructions-v1' | 'dsh-instructions-v2'
  exportedAt: number
  active: string | null
  current: string
  templates: Array<{ name: string; text: string }>
  history: Array<{ id: string; text: string }>
}

export interface ImportResult extends MutationResult {
  templates: number
  history: number
  currentChanged: boolean
  active: string | null
  imported: number
}

async function request(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(`${ROUTE_PREFIX}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    throw new ApiError('NETWORK_ERROR', String((error as Error).message ?? error), 0)
  }

  const text = await response.text()
  if (text.trim() === '') {
    const code = response.ok ? 'EMPTY_RESPONSE' : `HTTP_${response.status}`
    throw new ApiError(code, response.ok ? 'server returned an empty response' : `HTTP ${response.status}`, response.status)
  }

  let result: Record<string, unknown>
  try {
    const parsed = JSON.parse(text) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object')
    result = parsed as Record<string, unknown>
  } catch {
    if (!response.ok) throw new ApiError(`HTTP_${response.status}`, `HTTP ${response.status}: ${text.slice(0, 200)}`, response.status)
    throw new ApiError('INVALID_RESPONSE', 'server returned a non-JSON response', response.status)
  }

  if (!response.ok) {
    const code = typeof result.code === 'string' ? result.code : `HTTP_${response.status}`
    const message = typeof result.message === 'string' ? result.message : `HTTP ${response.status}`
    throw new ApiError(code, message, response.status)
  }
  return result
}

export async function readInstructions(): Promise<InstructionsResult> {
  return (await request('GET', '')) as unknown as InstructionsResult
}

export async function writeInstructions(text: string, expectedRevision: string): Promise<MutationResult & {
  hasBackup: boolean
  active: null
}> {
  return (await request('PUT', '', { text, expectedRevision })) as unknown as MutationResult & { hasBackup: boolean; active: null }
}

export async function restoreInstructions(expectedRevision: string): Promise<MutationResult & {
  text: string
  hasBackup: boolean
  active: null
}> {
  return (await request('POST', '', { action: 'restore', expectedRevision })) as unknown as MutationResult & {
    text: string
    hasBackup: boolean
    active: null
  }
}

export async function listTemplates(): Promise<{
  templates: TemplateEntry[]
  active: string | null
  revision: string
}> {
  return (await request('GET', '/templates')) as unknown as {
    templates: TemplateEntry[]
    active: string | null
    revision: string
  }
}

export async function saveTemplate(
  name: string,
  text: string,
  expectedRevision: string,
): Promise<MutationResult> {
  return (await request('POST', '/templates', { name, text, expectedRevision })) as unknown as MutationResult
}

export async function updateTemplate(
  name: string,
  text: string,
  expectedRevision: string,
): Promise<MutationResult> {
  return (await request('PUT', `/templates/${encodeURIComponent(name)}`, { text, expectedRevision })) as unknown as MutationResult
}

export async function readTemplate(name: string): Promise<{
  name: string
  text: string
  revision: string
}> {
  return (await request('GET', `/templates/${encodeURIComponent(name)}`)) as unknown as {
    name: string
    text: string
    revision: string
  }
}

export async function deleteTemplate(name: string, expectedRevision: string): Promise<MutationResult & {
  active: string | null
}> {
  return (await request('DELETE', `/templates/${encodeURIComponent(name)}`, { expectedRevision })) as unknown as MutationResult & {
    active: string | null
  }
}

export async function activateTemplate(name: string, expectedRevision: string): Promise<MutationResult & {
  text: string
  active: string
  hasBackup: boolean
}> {
  return (await request('POST', '/templates/activate', { name, expectedRevision })) as unknown as MutationResult & {
    text: string
    active: string
    hasBackup: boolean
  }
}

export async function listHistory(): Promise<{ history: HistoryEntry[]; revision: string }> {
  return (await request('GET', '/history')) as unknown as { history: HistoryEntry[]; revision: string }
}

export async function readHistory(id: string): Promise<{ id: string; text: string; revision: string }> {
  return (await request('GET', `/history/${encodeURIComponent(id)}`)) as unknown as {
    id: string
    text: string
    revision: string
  }
}

export async function restoreHistory(id: string, expectedRevision: string): Promise<MutationResult & {
  text: string
  active: null
  hasBackup: boolean
}> {
  return (await request('POST', '/history/restore', { id, expectedRevision })) as unknown as MutationResult & {
    text: string
    active: null
    hasBackup: boolean
  }
}

export async function projectView(): Promise<{ projects: ProjectEntry[]; source: string }> {
  return (await request('GET', '/project')) as unknown as { projects: ProjectEntry[]; source: string }
}

export async function presetView(): Promise<{
  view: PresetView | null
  available: boolean
  reason?: string
  source: string
}> {
  return (await request('GET', '/preset')) as unknown as {
    view: PresetView | null
    available: boolean
    reason?: string
    source: string
  }
}

export async function exportBundle(): Promise<{ bundle: ExportBundle; revision: string }> {
  return (await request('POST', '/export')) as unknown as { bundle: ExportBundle; revision: string }
}

export async function importBundle(bundle: unknown, expectedRevision: string): Promise<ImportResult> {
  return (await request('POST', '/import', { bundle, expectedRevision })) as unknown as ImportResult
}
