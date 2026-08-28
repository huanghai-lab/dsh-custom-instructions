import { describe, expect, it, vi } from 'vitest'

const fault = vi.hoisted(() => ({ armed: false, target: '' }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    rename: async (oldPath: Parameters<typeof actual.rename>[0], newPath: Parameters<typeof actual.rename>[1]) => {
      if (fault.armed && String(newPath) === fault.target) {
        fault.armed = false
        throw Object.assign(new Error('injected one-shot rename failure'), { code: 'EIO' })
      }
      return actual.rename(oldPath, newPath)
    },
  }
})

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as store from '../src/host/store.ts'

describe('import rollback', () => {
  it('restores current content, active state, templates, and history after a mid-write failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'custinstr-rollback-'))
    const globalPath = join(directory, 'AGENTS.md')
    try {
      let revision = await store.getRevision(globalPath)
      revision = (await store.writeGlobal(globalPath, '# Before\n', revision)).revision
      revision = (await store.writeTemplate(globalPath, '本地模板', '# Local template\n', revision)).revision
      revision = (await store.activateTemplate(globalPath, '本地模板', revision)).revision

      const before = await store.exportBundle(globalPath)
      const beforeRevision = await store.getRevision(globalPath)
      fault.target = globalPath
      fault.armed = true

      await expect(store.importBundle(globalPath, {
        format: 'dsh-instructions-v2',
        exportedAt: Date.now(),
        active: '导入模板',
        current: '# Imported\n',
        templates: [{ name: '导入模板', text: '# Incoming template\n' }],
        history: [{ id: '1700000000000', text: '# Incoming history\n' }],
      }, beforeRevision)).rejects.toThrow('injected one-shot rename failure')

      const after = await store.exportBundle(globalPath)
      expect({ ...after, exportedAt: 0 }).toEqual({ ...before, exportedAt: 0 })
      expect(await store.getRevision(globalPath)).toBe(beforeRevision)

      const rollback = JSON.parse(await readFile(join(directory, 'instructions', 'import-rollback.json'), 'utf8')) as {
        current: string
        active: string | null
      }
      expect(rollback).toMatchObject({ current: '# Local template\n', active: '本地模板' })
    } finally {
      fault.armed = false
      await rm(directory, { recursive: true, force: true })
    }
  })
})
