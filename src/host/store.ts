/**
 * File-backed instruction-center store.
 *
 * Every mutation is revision-checked, serialized per DSH home, and written
 * through a same-directory temporary file. Reads remain compatible with the
 * v0.3 layout while new template files use an encoded, path-safe filename.
 */

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export const MAX_CONTENT_BYTES = 65_536
export const MAX_TEMPLATES = 50
export const MAX_HISTORY = 100
export const MAX_IMPORT_BYTES = 16 * 1024 * 1024

const LEGACY_TEMPLATE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const ENCODED_TEMPLATE_PREFIX = 'b64~'
const LEGACY_HISTORY_ID = /^\d{1,20}$/
const HISTORY_ID = /^(\d{13})-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const operationQueues = new Map<string, Promise<void>>()

export type StoreErrorCode =
  | 'BAD_REQUEST'
  | 'CONTENT_TOO_LARGE'
  | 'CORRUPT_DATA'
  | 'LIMIT_EXCEEDED'
  | 'NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'ROLLBACK_FAILED'

export class StoreError extends Error {
  constructor(
    public readonly code: StoreErrorCode,
    message: string,
    public readonly status: 400 | 404 | 409 | 413 | 500,
  ) {
    super(message)
    this.name = 'StoreError'
  }
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

export interface ExportBundle {
  format: 'dsh-instructions-v2'
  exportedAt: number
  active: string | null
  current: string
  templates: Array<{ name: string; text: string }>
  history: Array<{ id: string; text: string }>
}

export interface ImportSummary {
  templates: number
  history: number
  currentChanged: boolean
  active: string | null
  imported: number
}

interface LogicalSnapshot {
  format: 'dsh-instructions-rollback-v1'
  savedAt: number
  currentExists: boolean
  current: string
  backupExists: boolean
  backup: string
  active: string | null
  templates: Array<{ name: string; text: string }>
  history: Array<{ id: string; text: string }>
}

interface TemplateFile {
  name: string
  path: string
  encoded: boolean
  legacyPath?: string
}

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT'
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
}

async function readDirOrEmpty(path: string): Promise<string[]> {
  try {
    return await readdir(path)
  } catch (error) {
    if (isNotFound(error)) return []
    throw error
  }
}

function assertContent(text: string, label = 'content'): void {
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > MAX_CONTENT_BYTES) {
    throw new StoreError('CONTENT_TOO_LARGE', `${label} exceeds ${MAX_CONTENT_BYTES} UTF-8 bytes`, 413)
  }
}

export function assertTemplateName(name: string): void {
  if (name !== name.trim()) {
    throw new StoreError('BAD_REQUEST', 'template name cannot start or end with whitespace', 400)
  }
  const characters = Array.from(name).length
  if (characters < 1 || characters > 64 || Buffer.byteLength(name, 'utf8') > 160) {
    throw new StoreError('BAD_REQUEST', 'template name must be 1-64 characters and at most 160 UTF-8 bytes', 400)
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw new StoreError('BAD_REQUEST', 'template name cannot contain control characters', 400)
  }
}

function instructionsDir(globalPath: string): string {
  return join(dirname(globalPath), 'instructions')
}

function templatesDir(globalPath: string): string {
  return join(instructionsDir(globalPath), 'templates')
}

function historyDir(globalPath: string): string {
  return join(instructionsDir(globalPath), 'history')
}

function activeFile(globalPath: string): string {
  return join(instructionsDir(globalPath), 'active.json')
}

function rollbackFile(globalPath: string): string {
  return join(instructionsDir(globalPath), 'import-rollback.json')
}

async function ensureDirs(globalPath: string): Promise<void> {
  await mkdir(templatesDir(globalPath), { recursive: true, mode: 0o700 })
  await mkdir(historyDir(globalPath), { recursive: true, mode: 0o700 })
}

async function atomicWriteFile(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    const verified = await readFile(temporary, 'utf8')
    if (verified !== text) throw new StoreError('CORRUPT_DATA', `failed to verify temporary write for ${basename(path)}`, 500)
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined)
  }
}

function encodedTemplateFilename(name: string): string {
  assertTemplateName(name)
  return `${ENCODED_TEMPLATE_PREFIX}${Buffer.from(name, 'utf8').toString('base64url')}.md`
}

function decodeTemplateFilename(filename: string): TemplateFile | null {
  if (!filename.endsWith('.md')) return null
  const stem = filename.slice(0, -3)
  if (stem.startsWith(ENCODED_TEMPLATE_PREFIX)) {
    const encoded = stem.slice(ENCODED_TEMPLATE_PREFIX.length)
    try {
      const name = Buffer.from(encoded, 'base64url').toString('utf8')
      if (Buffer.from(name, 'utf8').toString('base64url') !== encoded) throw new Error('non-canonical encoding')
      assertTemplateName(name)
      return { name, path: filename, encoded: true }
    } catch {
      throw new StoreError('CORRUPT_DATA', `invalid encoded template filename: ${filename}`, 500)
    }
  }
  if (!LEGACY_TEMPLATE_NAME.test(stem)) {
    throw new StoreError('CORRUPT_DATA', `invalid legacy template filename: ${filename}`, 500)
  }
  return { name: stem, path: filename, encoded: false }
}

async function scanTemplateFiles(globalPath: string): Promise<Map<string, TemplateFile>> {
  const directory = templatesDir(globalPath)
  const filenames = (await readDirOrEmpty(directory)).sort((a, b) => a.localeCompare(b))
  const files = new Map<string, TemplateFile>()
  for (const filename of filenames) {
    const decoded = decodeTemplateFilename(filename)
    if (decoded === null) continue
    decoded.path = join(directory, decoded.path)
    const existing = files.get(decoded.name)
    if (existing === undefined) {
      files.set(decoded.name, decoded)
      continue
    }
    const [left, right] = await Promise.all([readFile(existing.path, 'utf8'), readFile(decoded.path, 'utf8')])
    if (left !== right) {
      throw new StoreError('REVISION_CONFLICT', `legacy and encoded templates differ for "${decoded.name}"`, 409)
    }
    if (decoded.encoded) files.set(decoded.name, {
      ...decoded,
      legacyPath: existing.encoded ? existing.legacyPath : existing.path,
    })
    else if (existing.encoded) existing.legacyPath = decoded.path
  }
  return files
}

function templatePath(globalPath: string, name: string): string {
  return join(templatesDir(globalPath), encodedTemplateFilename(name))
}

function legacyTemplatePath(globalPath: string, name: string): string | null {
  return LEGACY_TEMPLATE_NAME.test(name) ? join(templatesDir(globalPath), `${name}.md`) : null
}

/** Read the global instructions; absence is the empty instruction set. */
export async function readGlobal(globalPath: string): Promise<string> {
  return (await readOptional(globalPath)) ?? ''
}

export async function hasBackup(globalPath: string): Promise<boolean> {
  try {
    return (await stat(`${globalPath}.bak`)).isFile()
  } catch (error) {
    if (isNotFound(error)) return false
    throw error
  }
}

export async function listTemplates(globalPath: string): Promise<TemplateEntry[]> {
  const files = await scanTemplateFiles(globalPath)
  const entries: TemplateEntry[] = []
  for (const file of files.values()) {
    try {
      const info = await stat(file.path)
      entries.push({ name: file.name, size: info.size, updatedAt: info.mtimeMs })
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

export async function readTemplate(globalPath: string, name: string): Promise<string> {
  assertTemplateName(name)
  const file = (await scanTemplateFiles(globalPath)).get(name)
  if (file !== undefined) return readFile(file.path, 'utf8')
  throw new StoreError('NOT_FOUND', `template "${name}" not found`, 404)
}

async function writeTemplateRaw(globalPath: string, name: string, text: string): Promise<void> {
  assertTemplateName(name)
  assertContent(text, 'template content')
  await ensureDirs(globalPath)
  const files = await scanTemplateFiles(globalPath)
  if (!files.has(name) && files.size >= MAX_TEMPLATES) {
    throw new StoreError('LIMIT_EXCEEDED', `template limit is ${MAX_TEMPLATES}`, 413)
  }
  const encodedPath = templatePath(globalPath, name)
  const encodedName = basename(encodedPath)
  const caseConflict = [...files.values()].find((file) => file.name !== name
    && file.encoded
    && basename(file.path).toLowerCase() === encodedName.toLowerCase())
  if (caseConflict !== undefined) {
    throw new StoreError('REVISION_CONFLICT', `template filename conflicts with "${caseConflict.name}" on a case-insensitive filesystem`, 409)
  }
  const existing = files.get(name)
  const legacyPath = existing?.encoded === true ? existing.legacyPath : existing?.path
  const previousEncoded = await readOptional(encodedPath)
  try {
    await atomicWriteFile(encodedPath, text)
    if (legacyPath !== undefined && legacyPath !== encodedPath) await rm(legacyPath, { force: true })
  } catch (error) {
    try {
      if (previousEncoded === undefined) await rm(encodedPath, { force: true })
      else await atomicWriteFile(encodedPath, previousEncoded)
    } catch (rollbackError) {
      throw new StoreError(
        'ROLLBACK_FAILED',
        `template write failed and rollback also failed: ${String((rollbackError as Error).message ?? rollbackError)}`,
        500,
      )
    }
    throw error
  }
}

async function deleteTemplateRaw(globalPath: string, name: string): Promise<string | null> {
  assertTemplateName(name)
  const file = (await scanTemplateFiles(globalPath)).get(name)
  if (file === undefined) throw new StoreError('NOT_FOUND', `template "${name}" not found`, 404)
  const text = await readFile(file.path, 'utf8')
  const encodedPath = templatePath(globalPath, name)
  const active = await readActive(globalPath)
  try {
    await rm(file.path, { force: true })
    if (file.legacyPath !== undefined) await rm(file.legacyPath, { force: true })
    if (active === name) await writeActiveRaw(globalPath, null)
  } catch (error) {
    try {
      await atomicWriteFile(encodedPath, text)
      await writeActiveRaw(globalPath, active)
    } catch (rollbackError) {
      throw new StoreError(
        'ROLLBACK_FAILED',
        `template deletion failed and rollback also failed: ${String((rollbackError as Error).message ?? rollbackError)}`,
        500,
      )
    }
    throw error
  }
  return active === name ? null : active
}

export async function readActive(globalPath: string): Promise<string | null> {
  const text = await readOptional(activeFile(globalPath))
  if (text === undefined) return null
  try {
    const parsed = JSON.parse(text) as { active?: unknown }
    if (parsed.active === null) return null
    if (typeof parsed.active !== 'string') throw new Error('active must be a string or null')
    assertTemplateName(parsed.active)
    return parsed.active
  } catch (error) {
    if (error instanceof StoreError) throw error
    throw new StoreError('CORRUPT_DATA', `invalid active template state: ${String((error as Error).message ?? error)}`, 500)
  }
}

async function writeActiveRaw(globalPath: string, name: string | null): Promise<void> {
  if (name !== null) assertTemplateName(name)
  await atomicWriteFile(activeFile(globalPath), `${JSON.stringify({ active: name })}\n`)
}

function parseHistoryId(id: string): number {
  const modern = HISTORY_ID.exec(id)
  if (modern !== null) return Number(modern[1])
  if (LEGACY_HISTORY_ID.test(id)) return Number(id)
  throw new StoreError('BAD_REQUEST', `invalid history id "${id}"`, 400)
}

export async function listHistory(globalPath: string): Promise<HistoryEntry[]> {
  const directory = historyDir(globalPath)
  const filenames = await readDirOrEmpty(directory)
  const entries: HistoryEntry[] = []
  for (const filename of filenames) {
    if (!filename.endsWith('.md')) continue
    const id = filename.slice(0, -3)
    let savedAt: number
    try {
      savedAt = parseHistoryId(id)
    } catch {
      throw new StoreError('CORRUPT_DATA', `invalid history filename: ${filename}`, 500)
    }
    try {
      const info = await stat(join(directory, filename))
      entries.push({ id, size: info.size, savedAt })
    } catch (error) {
      if (!isNotFound(error)) throw error
    }
  }
  return entries.sort((a, b) => b.savedAt - a.savedAt || b.id.localeCompare(a.id))
}

export async function readHistory(globalPath: string, id: string): Promise<string> {
  parseHistoryId(id)
  const text = await readOptional(join(historyDir(globalPath), `${id}.md`))
  if (text === undefined) throw new StoreError('NOT_FOUND', `history entry "${id}" not found`, 404)
  return text
}

async function pruneHistory(globalPath: string): Promise<void> {
  const history = await listHistory(globalPath)
  await Promise.all(history.slice(MAX_HISTORY).map((entry) => rm(join(historyDir(globalPath), `${entry.id}.md`), { force: true })))
}

async function writeGlobalRaw(globalPath: string, text: string, nextActive: string | null): Promise<void> {
  assertContent(text, 'global instructions')
  await ensureDirs(globalPath)
  const [previous, previousBackup, previousActive] = await Promise.all([
    readOptional(globalPath),
    readOptional(`${globalPath}.bak`),
    readActive(globalPath),
  ])
  const historyBefore = await listHistory(globalPath)
  const staleHistory = historyBefore.slice(previous === undefined ? MAX_HISTORY : MAX_HISTORY - 1)
  const staleSnapshots = await Promise.all(staleHistory.map(async ({ id }) => ({
    id,
    text: await readHistory(globalPath, id),
  })))
  let historyId: string | null = null
  let currentWritten = false
  try {
    if (previous !== undefined) {
      await atomicWriteFile(`${globalPath}.bak`, previous)
      historyId = `${Date.now()}-${randomUUID()}`
      await atomicWriteFile(join(historyDir(globalPath), `${historyId}.md`), previous)
    }
    await atomicWriteFile(globalPath, text)
    currentWritten = true
    await writeActiveRaw(globalPath, nextActive)
    for (const entry of staleSnapshots) {
      await rm(join(historyDir(globalPath), `${entry.id}.md`), { force: true })
    }
  } catch (error) {
    try {
      if (currentWritten) {
        if (previous === undefined) await rm(globalPath, { force: true })
        else await atomicWriteFile(globalPath, previous)
      }
      await writeActiveRaw(globalPath, previousActive)
      if (previousBackup === undefined) await rm(`${globalPath}.bak`, { force: true })
      else await atomicWriteFile(`${globalPath}.bak`, previousBackup)
      if (historyId !== null) await rm(join(historyDir(globalPath), `${historyId}.md`), { force: true })
      for (const entry of staleSnapshots) {
        await atomicWriteFile(join(historyDir(globalPath), `${entry.id}.md`), entry.text)
      }
    } catch (rollbackError) {
      throw new StoreError(
        'ROLLBACK_FAILED',
        `write failed and rollback also failed: ${String((rollbackError as Error).message ?? rollbackError)}`,
        500,
      )
    }
    throw error
  }
}

async function logicalState(globalPath: string): Promise<LogicalSnapshot> {
  const [current, backup, active, templates, history] = await Promise.all([
    readOptional(globalPath),
    readOptional(`${globalPath}.bak`),
    readActive(globalPath),
    listTemplates(globalPath),
    listHistory(globalPath),
  ])
  const templateTexts = await Promise.all(templates.map(async ({ name }) => ({ name, text: await readTemplate(globalPath, name) })))
  const historyTexts = await Promise.all(history.map(async ({ id }) => ({ id, text: await readHistory(globalPath, id) })))
  return {
    format: 'dsh-instructions-rollback-v1',
    savedAt: Date.now(),
    currentExists: current !== undefined,
    current: current ?? '',
    backupExists: backup !== undefined,
    backup: backup ?? '',
    active,
    templates: templateTexts,
    history: historyTexts,
  }
}

export async function getRevision(globalPath: string): Promise<string> {
  const state = await logicalState(globalPath)
  const canonical = {
    currentExists: state.currentExists,
    current: state.current,
    backupExists: state.backupExists,
    backup: state.backup,
    active: state.active,
    templates: state.templates,
    history: state.history,
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

async function serialized<T>(globalPath: string, operation: () => Promise<T>): Promise<T> {
  const previous = operationQueues.get(globalPath) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(operation)
  const settled = run.then(() => undefined, () => undefined)
  operationQueues.set(globalPath, settled)
  void settled.finally(() => {
    if (operationQueues.get(globalPath) === settled) operationQueues.delete(globalPath)
  })
  return run
}

export async function readConsistent<T>(
  globalPath: string,
  read: () => Promise<T>,
): Promise<{ value: T; revision: string }> {
  return serialized(globalPath, async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = await getRevision(globalPath)
      const value = await read()
      const revision = await getRevision(globalPath)
      if (before === revision) return { value, revision }
    }
    throw new StoreError('REVISION_CONFLICT', 'instructions changed while they were being read', 409)
  })
}

async function withMutation<T>(
  globalPath: string,
  expectedRevision: string,
  operation: () => Promise<T>,
): Promise<{ value: T; revision: string }> {
  return serialized(globalPath, async () => {
    const actual = await getRevision(globalPath)
    if (actual !== expectedRevision) {
      throw new StoreError('REVISION_CONFLICT', 'instructions changed since they were loaded', 409)
    }
    const value = await operation()
    return { value, revision: await getRevision(globalPath) }
  })
}

export async function writeGlobal(
  globalPath: string,
  text: string,
  expectedRevision: string,
): Promise<{ revision: string; hasBackup: boolean }> {
  assertContent(text, 'global instructions')
  const result = await withMutation(globalPath, expectedRevision, () => writeGlobalRaw(globalPath, text, null))
  return { revision: result.revision, hasBackup: await hasBackup(globalPath) }
}

export async function restoreBackup(
  globalPath: string,
  expectedRevision: string,
): Promise<{ text: string; revision: string; hasBackup: boolean }> {
  const result = await withMutation(globalPath, expectedRevision, async () => {
    const previous = await readOptional(`${globalPath}.bak`)
    if (previous === undefined) throw new StoreError('NOT_FOUND', 'no backup available', 404)
    await writeGlobalRaw(globalPath, previous, null)
    return previous
  })
  return { text: result.value, revision: result.revision, hasBackup: await hasBackup(globalPath) }
}

export async function writeTemplate(
  globalPath: string,
  name: string,
  text: string,
  expectedRevision: string,
): Promise<{ revision: string }> {
  assertTemplateName(name)
  assertContent(text, 'template content')
  const result = await withMutation(globalPath, expectedRevision, () => writeTemplateRaw(globalPath, name, text))
  return { revision: result.revision }
}

export async function deleteTemplate(
  globalPath: string,
  name: string,
  expectedRevision: string,
): Promise<{ revision: string; active: string | null }> {
  const result = await withMutation(globalPath, expectedRevision, () => deleteTemplateRaw(globalPath, name))
  return { revision: result.revision, active: result.value }
}

export async function activateTemplate(
  globalPath: string,
  name: string,
  expectedRevision: string,
): Promise<{ text: string; revision: string; hasBackup: boolean }> {
  const result = await withMutation(globalPath, expectedRevision, async () => {
    const text = await readTemplate(globalPath, name)
    await writeGlobalRaw(globalPath, text, name)
    return text
  })
  return { text: result.value, revision: result.revision, hasBackup: await hasBackup(globalPath) }
}

export async function restoreHistory(
  globalPath: string,
  id: string,
  expectedRevision: string,
): Promise<{ text: string; revision: string; hasBackup: boolean }> {
  const result = await withMutation(globalPath, expectedRevision, async () => {
    const text = await readHistory(globalPath, id)
    await writeGlobalRaw(globalPath, text, null)
    return text
  })
  return { text: result.value, revision: result.revision, hasBackup: await hasBackup(globalPath) }
}

export async function exportBundle(globalPath: string): Promise<ExportBundle> {
  const snapshot = await logicalState(globalPath)
  return {
    format: 'dsh-instructions-v2',
    exportedAt: Date.now(),
    active: snapshot.active,
    current: snapshot.current,
    templates: snapshot.templates,
    history: snapshot.history,
  }
}

function validateBundle(bundle: unknown): ExportBundle {
  if (typeof bundle !== 'object' || bundle === null || Array.isArray(bundle)) {
    throw new StoreError('BAD_REQUEST', 'import bundle must be an object', 400)
  }
  const data = bundle as Record<string, unknown>
  const format = data.format ?? 'dsh-instructions-v1'
  if (format !== 'dsh-instructions-v1' && format !== 'dsh-instructions-v2') {
    throw new StoreError('BAD_REQUEST', 'unsupported import format', 400)
  }
  if (!Number.isSafeInteger(data.exportedAt) || (data.exportedAt as number) < 0) {
    throw new StoreError('BAD_REQUEST', 'import exportedAt must be a non-negative integer', 400)
  }
  if (typeof data.current !== 'string') throw new StoreError('BAD_REQUEST', 'import current must be a string', 400)
  assertContent(data.current, 'import current')
  if (data.active !== null && typeof data.active !== 'string') {
    throw new StoreError('BAD_REQUEST', 'import active must be a template name or null', 400)
  }
  if (typeof data.active === 'string') assertTemplateName(data.active)
  if (!Array.isArray(data.templates)) throw new StoreError('BAD_REQUEST', 'import templates must be an array', 400)
  if (!Array.isArray(data.history)) throw new StoreError('BAD_REQUEST', 'import history must be an array', 400)
  if (data.templates.length > MAX_TEMPLATES) {
    throw new StoreError('LIMIT_EXCEEDED', `import contains more than ${MAX_TEMPLATES} templates`, 413)
  }
  if (data.history.length > MAX_HISTORY) {
    throw new StoreError('LIMIT_EXCEEDED', `import contains more than ${MAX_HISTORY} history entries`, 413)
  }

  const templates: ExportBundle['templates'] = []
  const templateNames = new Set<string>()
  for (const item of data.templates) {
    if (typeof item !== 'object' || item === null) throw new StoreError('BAD_REQUEST', 'invalid template entry', 400)
    const entry = item as Record<string, unknown>
    if (typeof entry.name !== 'string' || typeof entry.text !== 'string') {
      throw new StoreError('BAD_REQUEST', 'template entries require string name and text', 400)
    }
    assertTemplateName(entry.name)
    assertContent(entry.text, `template "${entry.name}"`)
    if (templateNames.has(entry.name)) throw new StoreError('BAD_REQUEST', `duplicate template "${entry.name}"`, 400)
    templateNames.add(entry.name)
    templates.push({ name: entry.name, text: entry.text })
  }

  const history: ExportBundle['history'] = []
  const historyIds = new Set<string>()
  for (const item of data.history) {
    if (typeof item !== 'object' || item === null) throw new StoreError('BAD_REQUEST', 'invalid history entry', 400)
    const entry = item as Record<string, unknown>
    if (typeof entry.id !== 'string' || typeof entry.text !== 'string') {
      throw new StoreError('BAD_REQUEST', 'history entries require string id and text', 400)
    }
    parseHistoryId(entry.id)
    assertContent(entry.text, `history "${entry.id}"`)
    if (historyIds.has(entry.id)) throw new StoreError('BAD_REQUEST', `duplicate history "${entry.id}"`, 400)
    historyIds.add(entry.id)
    history.push({ id: entry.id, text: entry.text })
  }

  return {
    format: 'dsh-instructions-v2',
    exportedAt: data.exportedAt as number,
    active: data.active as string | null,
    current: data.current,
    templates,
    history,
  }
}

async function clearMarkdownFiles(directory: string): Promise<void> {
  const filenames = await readDirOrEmpty(directory)
  await Promise.all(filenames.filter((name) => name.endsWith('.md')).map((name) => rm(join(directory, name), { force: true })))
}

async function restoreSnapshot(globalPath: string, snapshot: LogicalSnapshot): Promise<void> {
  await ensureDirs(globalPath)
  await Promise.all([clearMarkdownFiles(templatesDir(globalPath)), clearMarkdownFiles(historyDir(globalPath))])
  for (const template of snapshot.templates) await atomicWriteFile(templatePath(globalPath, template.name), template.text)
  for (const entry of snapshot.history) await atomicWriteFile(join(historyDir(globalPath), `${entry.id}.md`), entry.text)
  if (snapshot.currentExists) await atomicWriteFile(globalPath, snapshot.current)
  else await rm(globalPath, { force: true })
  if (snapshot.backupExists) await atomicWriteFile(`${globalPath}.bak`, snapshot.backup)
  else await rm(`${globalPath}.bak`, { force: true })
  await writeActiveRaw(globalPath, snapshot.active)
}

export async function importBundle(
  globalPath: string,
  bundle: unknown,
  expectedRevision: string,
): Promise<{ summary: ImportSummary; revision: string }> {
  const incoming = validateBundle(bundle)
  const result = await withMutation(globalPath, expectedRevision, async () => {
    const before = await logicalState(globalPath)
    const localNames = new Set(before.templates.map(({ name }) => name))
    for (const template of incoming.templates) localNames.add(template.name)
    if (localNames.size > MAX_TEMPLATES) {
      throw new StoreError('LIMIT_EXCEEDED', `merged template count exceeds ${MAX_TEMPLATES}`, 413)
    }
    if (incoming.active !== null && !localNames.has(incoming.active)) {
      throw new StoreError('BAD_REQUEST', `active template "${incoming.active}" is not present after merge`, 400)
    }

    await atomicWriteFile(rollbackFile(globalPath), `${JSON.stringify(before, null, 2)}\n`)
    try {
      for (const template of incoming.templates) await writeTemplateRaw(globalPath, template.name, template.text)
      await writeGlobalRaw(globalPath, incoming.current, incoming.active)
      for (const entry of incoming.history) {
        await atomicWriteFile(join(historyDir(globalPath), `${entry.id}.md`), entry.text)
      }
      await pruneHistory(globalPath)
    } catch (error) {
      try {
        await restoreSnapshot(globalPath, before)
      } catch (rollbackError) {
        throw new StoreError(
          'ROLLBACK_FAILED',
          `import failed and rollback also failed: ${String((rollbackError as Error).message ?? rollbackError)}`,
          500,
        )
      }
      throw error
    }

    return {
      templates: incoming.templates.length,
      history: incoming.history.length,
      currentChanged: before.current !== incoming.current || !before.currentExists,
      active: incoming.active,
      imported: incoming.templates.length + incoming.history.length + 1,
    } satisfies ImportSummary
  })
  return { summary: result.value, revision: result.revision }
}
