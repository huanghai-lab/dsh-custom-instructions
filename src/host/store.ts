/**
 * Instruction-center storage layer — owns every file under
 * $DSH_HOME/instructions/ and the global AGENTS.md it manages.
 *
 * Layout:
 *   $DSH_HOME/AGENTS.md                  the active global instructions (what DSH loads)
 *   $DSH_HOME/AGENTS.md.bak              one-generation rollback (existing mechanism)
 *   $DSH_HOME/instructions/
 *     templates/<name>.md                named instruction templates
 *     active.json                        { active: name | null }
 *     history/<epoch-ms>.md              save snapshots (version history)
 *
 * All mutations go through node:fs directly (the file lives outside the
 * session workspace, so the sandboxed ctx.fs would refuse writes — same
 * precedent as the dsh-web-ui family's host stores).
 */

import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** A template name may only use these characters (path-safety). */
const TEMPLATE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

/** One template entry in a listing. */
export interface TemplateEntry {
  name: string
  size: number
  updatedAt: number
}

/** One history entry in a listing. */
export interface HistoryEntry {
  id: string
  size: number
  savedAt: number
}

/** Full export bundle (templates + history + the live content). */
export interface ExportBundle {
  format: 'dsh-instructions-v1'
  exportedAt: number
  active: string | null
  current: string
  templates: Array<{ name: string; text: string }>
  history: Array<{ id: string; text: string }>
}

export function assertTemplateName(name: string): void {
  if (!TEMPLATE_NAME.test(name)) throw new Error(`invalid template name "${name}"`)
}

/** The instructions/ directory beside the global instructions file. */
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

async function ensureDirs(globalPath: string): Promise<void> {
  await mkdir(templatesDir(globalPath), { recursive: true, mode: 0o700 })
  await mkdir(historyDir(globalPath), { recursive: true, mode: 0o700 })
}

/** Read the global instructions; empty string when absent, throws on other errors. */
export async function readGlobal(globalPath: string): Promise<string> {
  try {
    return await readFile(globalPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') return ''
    throw error
  }
}

/**
 * Replace the global instructions, rotating the previous content into .bak
 * and appending it to the version history.
 */
export async function writeGlobal(globalPath: string, text: string): Promise<void> {
  await ensureDirs(globalPath)
  try {
    const previous = await readFile(globalPath, 'utf8')
    // One-generation rollback slot (copy overwrites an older backup).
    await copyFile(globalPath, `${globalPath}.bak`)
    // Append to version history (best effort — history must never block a save).
    try {
      await writeFile(join(historyDir(globalPath), `${Date.now()}.md`), previous, { encoding: 'utf8' })
    } catch {
      // History is auxiliary; a failed snapshot does not fail the save.
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
    // First save ever: nothing to rotate.
  }
  await mkdir(dirname(globalPath), { recursive: true, mode: 0o700 })
  await writeFile(globalPath, text, { encoding: 'utf8' })
}

/** Restore the .bak over the current content. */
export async function restoreBackup(globalPath: string): Promise<string> {
  const previous = await readFile(`${globalPath}.bak`, 'utf8')
  await writeFile(globalPath, previous, { encoding: 'utf8' })
  return previous
}

export async function hasBackup(globalPath: string): Promise<boolean> {
  try {
    await stat(`${globalPath}.bak`)
    return true
  } catch {
    return false
  }
}

/** List templates (name-ordered). */
export async function listTemplates(globalPath: string): Promise<TemplateEntry[]> {
  await ensureDirs(globalPath)
  const dir = templatesDir(globalPath)
  const names = await readdir(dir).catch(() => [] as string[])
  const entries: TemplateEntry[] = []
  for (const name of names) {
    if (!name.endsWith('.md')) continue
    const clean = name.slice(0, -3)
    if (!TEMPLATE_NAME.test(clean)) continue
    try {
      const info = await stat(join(dir, name))
      entries.push({ name: clean, size: info.size, updatedAt: info.mtimeMs })
    } catch {
      // Racing deletion — skip.
    }
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name))
}

export async function readTemplate(globalPath: string, name: string): Promise<string> {
  assertTemplateName(name)
  return readFile(join(templatesDir(globalPath), `${name}.md`), 'utf8')
}

export async function writeTemplate(globalPath: string, name: string, text: string): Promise<void> {
  assertTemplateName(name)
  await ensureDirs(globalPath)
  await writeFile(join(templatesDir(globalPath), `${name}.md`), text, { encoding: 'utf8' })
}

export async function deleteTemplate(globalPath: string, name: string): Promise<void> {
  assertTemplateName(name)
  await rm(join(templatesDir(globalPath), `${name}.md`), { force: true })
}

/** The active template name, or null when the user edits freely. */
export async function readActive(globalPath: string): Promise<string | null> {
  try {
    const raw = JSON.parse(await readFile(activeFile(globalPath), 'utf8')) as { active?: unknown }
    return typeof raw.active === 'string' && TEMPLATE_NAME.test(raw.active) ? raw.active : null
  } catch {
    return null
  }
}

async function writeActive(globalPath: string, name: string | null): Promise<void> {
  await ensureDirs(globalPath)
  await writeFile(activeFile(globalPath), JSON.stringify({ active: name }), { encoding: 'utf8' })
}

/**
 * Activate a template: copy its content into the global file (with history
 * rotation) and record it as active.
 */
export async function activateTemplate(globalPath: string, name: string): Promise<string> {
  assertTemplateName(name)
  const text = await readTemplate(globalPath, name)
  await writeGlobal(globalPath, text)
  await writeActive(globalPath, name)
  return text
}

/** List history entries (newest first). */
export async function listHistory(globalPath: string): Promise<HistoryEntry[]> {
  await ensureDirs(globalPath)
  const dir = historyDir(globalPath)
  const names = await readdir(dir).catch(() => [] as string[])
  const entries: HistoryEntry[] = []
  for (const name of names) {
    const match = /^(\d+)\.md$/.exec(name)
    if (match === null) continue
    try {
      const info = await stat(join(dir, name))
      entries.push({ id: match[1], size: info.size, savedAt: Number(match[1]) })
    } catch {
      // Racing deletion — skip.
    }
  }
  return entries.sort((a, b) => b.savedAt - a.savedAt)
}

export async function readHistory(globalPath: string, id: string): Promise<string> {
  if (!/^\d{1,20}$/.test(id)) throw new Error('invalid history id')
  return readFile(join(historyDir(globalPath), `${id}.md`), 'utf8')
}

/** Restore a history snapshot as the current content. */
export async function restoreHistory(globalPath: string, id: string): Promise<string> {
  const text = await readHistory(globalPath, id)
  await writeGlobal(globalPath, text)
  return text
}

/** Export the whole instruction center as one JSON bundle. */
export async function exportBundle(globalPath: string): Promise<ExportBundle> {
  const [active, current, templates, history] = await Promise.all([
    readActive(globalPath),
    readGlobal(globalPath),
    listTemplates(globalPath),
    listHistory(globalPath),
  ])
  const templateTexts = await Promise.all(templates.map(async (entry) => ({
    name: entry.name,
    text: await readTemplate(globalPath, entry.name),
  })))
  const historyTexts = await Promise.all(history.map(async (entry) => ({
    id: entry.id,
    text: await readHistory(globalPath, entry.id),
  })))
  return {
    format: 'dsh-instructions-v1',
    exportedAt: Date.now(),
    active,
    current,
    templates: templateTexts,
    history: historyTexts,
  }
}

/** Import a bundle: replaces templates and history, keeps current content if absent. */
export async function importBundle(globalPath: string, bundle: unknown): Promise<number> {
  if (typeof bundle !== 'object' || bundle === null) throw new Error('import payload must be an object')
  const data = bundle as Partial<ExportBundle>
  if (data.format !== 'dsh-instructions-v1') throw new Error('unsupported import format')
  if (!Array.isArray(data.templates)) throw new Error('import payload: templates must be an array')
  let count = 0
  for (const entry of data.templates) {
    if (typeof entry?.name !== 'string' || typeof entry?.text !== 'string') continue
    try {
      await writeTemplate(globalPath, entry.name, entry.text)
      count += 1
    } catch {
      // Skip invalid names.
    }
  }
  for (const entry of Array.isArray(data.history) ? data.history : []) {
    if (typeof entry?.id !== 'string' || typeof entry?.text !== 'string') continue
    if (!/^\d{1,20}$/.test(entry.id)) continue
    try {
      await writeFile(join(historyDir(globalPath), `${entry.id}.md`), entry.text, { encoding: 'utf8' })
      count += 1
    } catch {
      // Skip.
    }
  }
  return count
}
