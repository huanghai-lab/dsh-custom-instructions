/**
 * The instruction center settings page body (JSX component).
 *
 * Sections: global instructions editor, instruction templates (multi-set
 * switching), version history, project-level instructions view, and the
 * active preset persona overview. Styled after the official settings pages
 * (theme variables, card rows, section headings).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  activateTemplate,
  deleteTemplate,
  exportBundle,
  importBundle,
  listHistory,
  listTemplates,
  presetView,
  projectView,
  readInstructions,
  restoreHistory,
  restoreInstructions,
  saveTemplate,
  writeInstructions,
  type HistoryEntry,
  type PresetView,
  type ProjectEntry,
  type TemplateEntry,
} from './api.ts'

/** Plugin CSS, scoped by a package-unique class prefix. */
export const CSS = `
.cinstr-page { display: flex; flex-direction: column; gap: 16px; width: min(100%, 720px); color: var(--dsw-alias-label-primary); }
.cinstr-section { border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; background: var(--dsw-alias-bg-layer-1); }
.cinstr-section-head { margin: 0; font-size: 14px; font-weight: 600; }
.cinstr-desc { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.cinstr-area { box-sizing: border-box; width: 100%; min-height: 240px; resize: vertical; padding: 12px; font: inherit; line-height: 1.6; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); outline: none; transition: border-color 120ms ease, box-shadow 120ms ease; }
.cinstr-area:focus { border-color: var(--dsw-alias-brand-primary); }
.cinstr-area:disabled { opacity: 0.6; }
.cinstr-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.cinstr-btn { height: 32px; padding: 0 16px; border: none; border-radius: 16px; background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-foreground, #fff); cursor: pointer; font-size: 13px; }
.cinstr-btn:not(:disabled):hover { opacity: 0.9; }
.cinstr-btn:disabled { opacity: 0.5; cursor: default; }
.cinstr-btn-ghost { height: 32px; padding: 0 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 16px; background: transparent; color: var(--dsw-alias-label-primary); cursor: pointer; font-size: 13px; }
.cinstr-btn-ghost:not(:disabled):hover { background: var(--dsw-alias-bg-layer-2); }
.cinstr-btn-ghost:disabled { opacity: 0.5; cursor: default; }
.cinstr-ok { font-size: 12px; color: var(--dsw-alias-state-success-primary); }
.cinstr-err { font-size: 12px; color: var(--dsw-alias-state-error-primary); }
.cinstr-meta { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.cinstr-count { margin-left: auto; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.cinstr-count-over { color: var(--dsw-alias-state-error-primary); }
.cinstr-count-near { color: var(--dsw-alias-state-warn-primary); }
.cinstr-dirty { font-size: 12px; color: var(--dsw-alias-state-warn-primary); }
.cinstr-loading { font-size: 13px; color: var(--dsw-alias-label-secondary); }
.cinstr-list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.cinstr-item { display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 4px 8px; border-radius: 8px; }
.cinstr-item:hover { background: var(--dsw-alias-bg-layer-2); }
.cinstr-item-name { font-size: 13px; }
.cinstr-item-active { color: var(--dsw-alias-brand-primary); font-weight: 600; }
.cinstr-item-meta { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-left: auto; }
.cinstr-inline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cinstr-input { height: 30px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; outline: none; }
.cinstr-input:focus { border-color: var(--dsw-alias-brand-primary); }
.cinstr-mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; color: var(--dsw-alias-label-secondary); word-break: break-all; }
.cinstr-empty { font-size: 12px; color: var(--dsw-alias-label-secondary); margin: 0; }
`

/** UTF-8 byte length of a string (the DSH loader's actual budget unit). */
function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length
}

/** Format a byte size for humans. */
function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  return `${(value / 1024).toFixed(1)} KB`
}

/** Format an epoch timestamp as a local time string. */
function formatTime(value: number): string {
  return new Date(value).toLocaleString()
}

/** Download a JSON payload as a file. */
function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** Global instructions editor section. */
function GlobalSection(props: { onChanged: () => void; refreshToken: number }): JSX.Element {
  const [text, setText] = useState('')
  const [savedText, setSavedText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [path, setPath] = useState('')
  const [maxBytes, setMaxBytes] = useState(65536)
  const [hasBackup, setHasBackup] = useState(false)
  const noticeTimer = useRef<number | undefined>(undefined)

  const clearNoticeSoon = useCallback((): void => {
    if (noticeTimer.current !== undefined) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3000)
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    readInstructions()
      .then((res) => {
        if (cancelled) return
        setText(res.text ?? '')
        setSavedText(res.text ?? '')
        setPath(res.path ?? '')
        if (res.maxBytes !== undefined) setMaxBytes(res.maxBytes)
        setHasBackup(res.hasBackup === true)
        setLoaded(true)
      })
      .catch(() => {
        if (cancelled) return
        setError('读取失败，请刷新页面重试')
        setLoaded(true)
      })
    return () => {
      cancelled = true
      if (noticeTimer.current !== undefined) window.clearTimeout(noticeTimer.current)
    }
  }, [props.refreshToken])

  const dirty = loaded && text !== savedText
  const bytes = utf8Bytes(text)
  const overLimit = bytes > maxBytes
  const nearLimit = !overLimit && bytes > maxBytes * 0.9

  const save = useCallback((): void => {
    if (saving || !loaded || overLimit) return
    setSaving(true)
    setNotice(null)
    writeInstructions(text)
      .then(() => {
        setSaving(false)
        setSavedText(text)
        setError('')
        setHasBackup(true)
        setNotice({ kind: 'ok', text: '已保存，新会话自动生效' })
        clearNoticeSoon()
        props.onChanged()
      })
      .catch((e: unknown) => {
        setSaving(false)
        setNotice({ kind: 'err', text: `保存失败: ${String((e as Error)?.message ?? e)}` })
      })
  }, [saving, loaded, overLimit, text, clearNoticeSoon, props.onChanged])

  const restore = useCallback((): void => {
    if (restoring || !loaded) return
    setRestoring(true)
    setNotice(null)
    restoreInstructions()
      .then((res) => {
        setRestoring(false)
        setText(res.text ?? '')
        setSavedText(res.text ?? '')
        setNotice({ kind: 'ok', text: '已恢复上次保存前的内容' })
        clearNoticeSoon()
        props.onChanged()
      })
      .catch((e: unknown) => {
        setRestoring(false)
        setNotice({ kind: 'err', text: `撤销失败: ${String((e as Error)?.message ?? e)}` })
      })
  }, [restoring, loaded, clearNoticeSoon, props.onChanged])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save])

  const countClass = overLimit ? 'cinstr-count cinstr-count-over' : nearLimit ? 'cinstr-count cinstr-count-near' : 'cinstr-count'

  return (
    <section className="cinstr-section">
      <h3 className="cinstr-section-head">全局指令</h3>
      <p className="cinstr-desc">对当前主机上所有聊天生效的指令，保存后新会话自动加载。</p>
      {!loaded && <p className="cinstr-loading" aria-live="polite">正在读取指令…</p>}
      <textarea
        className="cinstr-area"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setNotice(null)
        }}
        placeholder="在此输入对所有聊天生效的指令……"
        disabled={!loaded}
        spellCheck={false}
        aria-label="自定义指令"
      />
      <div className="cinstr-row">
        <button className="cinstr-btn" onClick={save} disabled={saving || !loaded || error !== '' || overLimit}>
          {saving ? '保存中…' : '保存'}
        </button>
        <button className="cinstr-btn-ghost" onClick={restore} disabled={restoring || !loaded || !hasBackup}>
          {restoring ? '恢复中…' : '撤销上次保存'}
        </button>
        {dirty && <span className="cinstr-dirty" aria-live="polite">有未保存的更改</span>}
        <span className={countClass} aria-live="polite">
          {Array.from(text).length} 字符 / {formatBytes(bytes)} / {formatBytes(maxBytes)}{overLimit ? '（超出上限）' : nearLimit ? '（接近上限）' : ''}
        </span>
        {notice !== null && <span className={notice.kind === 'ok' ? 'cinstr-ok' : 'cinstr-err'} aria-live="polite">{notice.text}</span>}
      </div>
      {error !== '' && <p className="cinstr-err" role="alert">{error}</p>}
      {path !== '' && <p className="cinstr-meta">存储位置: {path}</p>}
    </section>
  )
}

/** Templates section: multi-set management, activation, import/export. */
function TemplatesSection(props: { refreshToken: number; onChanged: () => void }): JSX.Element {
  const [templates, setTemplates] = useState<TemplateEntry[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback((): void => {
    listTemplates()
      .then((res) => {
        setTemplates(res.templates)
        setActive(res.active)
        setLoaded(true)
      })
      .catch((e: unknown) => {
        setLoaded(true)
        setNotice({ kind: 'err', text: `模板列表加载失败: ${String((e as Error)?.message ?? e)}` })
      })
  }, [])

  useEffect(() => { reload() }, [reload, props.refreshToken])

  const create = (): void => {
    const name = newName.trim()
    if (name === '' || busy) return
    setBusy(true)
    saveTemplate(name, '')
      .then(() => {
        setNewName('')
        setBusy(false)
        setNotice({ kind: 'ok', text: `模板「${name}」已创建，点击激活即可切换到空指令集` })
        reload()
      })
      .catch((e: unknown) => {
        setBusy(false)
        setNotice({ kind: 'err', text: `创建失败: ${String((e as Error)?.message ?? e)}` })
      })
  }

  const activate = (name: string): void => {
    if (busy) return
    setBusy(true)
    setNotice(null)
    activateTemplate(name)
      .then(() => {
        setBusy(false)
        setActive(name)
        setNotice({ kind: 'ok', text: `已激活模板「${name}」，全局指令已切换` })
        props.onChanged()
        reload()
      })
      .catch((e: unknown) => {
        setBusy(false)
        setNotice({ kind: 'err', text: `激活失败: ${String((e as Error)?.message ?? e)}` })
      })
  }

  const remove = (name: string): void => {
    if (busy) return
    setBusy(true)
    deleteTemplate(name)
      .then(() => {
        setBusy(false)
        setNotice({ kind: 'ok', text: `模板「${name}」已删除` })
        reload()
      })
      .catch((e: unknown) => {
        setBusy(false)
        setNotice({ kind: 'err', text: `删除失败: ${String((e as Error)?.message ?? e)}` })
      })
  }

  const exportAll = (): void => {
    exportBundle()
      .then((res) => {
        downloadJson(`dsh-instructions-${new Date().toISOString().slice(0, 10)}.json`, res.bundle)
        setNotice({ kind: 'ok', text: '已导出（模板 + 历史 + 当前内容）' })
      })
      .catch((e: unknown) => setNotice({ kind: 'err', text: `导出失败: ${String((e as Error)?.message ?? e)}` }))
  }

  const importAll = (file: File): void => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const bundle = JSON.parse(String(reader.result))
        importBundle(bundle)
          .then((res) => {
            setNotice({ kind: 'ok', text: `已导入 ${res.imported} 项` })
            reload()
          })
          .catch((e: unknown) => setNotice({ kind: 'err', text: `导入失败: ${String((e as Error)?.message ?? e)}` }))
      } catch {
        setNotice({ kind: 'err', text: '导入失败: 文件不是有效的 JSON' })
      }
    }
    reader.readAsText(file)
  }

  return (
    <section className="cinstr-section">
      <h3 className="cinstr-section-head">指令模板</h3>
      <p className="cinstr-desc">保存多套指令集并按需切换；激活即替换全局指令（切换前自动入历史，可随时恢复）。</p>
      {!loaded ? <p className="cinstr-loading">正在加载模板…</p> : null}
      {templates.length === 0 && loaded ? <p className="cinstr-empty">还没有模板。新建一个模板，或把当前全局指令存为模板。</p> : null}
      <ul className="cinstr-list">
        {templates.map((template) => (
          <li className="cinstr-item" key={template.name}>
            <span className={template.name === active ? 'cinstr-item-name cinstr-item-active' : 'cinstr-item-name'}>
              {template.name}{template.name === active ? '（当前激活）' : ''}
            </span>
            <span className="cinstr-item-meta">{formatBytes(template.size)} · {formatTime(template.updatedAt)}</span>
            {template.name !== active && (
              <button className="cinstr-btn-ghost" onClick={() => activate(template.name)} disabled={busy}>激活</button>
            )}
            <button className="cinstr-btn-ghost" onClick={() => remove(template.name)} disabled={busy}>删除</button>
          </li>
        ))}
      </ul>
      <div className="cinstr-inline">
        <input
          className="cinstr-input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新模板名称（字母/数字/._-）"
          aria-label="新模板名称"
        />
        <button className="cinstr-btn" onClick={create} disabled={busy || newName.trim() === ''}>新建模板</button>
        <button className="cinstr-btn-ghost" onClick={exportAll} disabled={busy}>导出全部</button>
        <label className="cinstr-btn-ghost" style={{ cursor: 'pointer' }}>
          导入
          <input
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file !== undefined) importAll(file)
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {notice !== null && <span className={notice.kind === 'ok' ? 'cinstr-ok' : 'cinstr-err'} aria-live="polite">{notice.text}</span>}
    </section>
  )
}

/** Version history section. */
function HistorySection(props: { refreshToken: number }): JSX.Element {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const reload = useCallback((): void => {
    listHistory()
      .then((res) => {
        setHistory(res.history)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  useEffect(() => { reload() }, [reload, props.refreshToken])

  const restore = (id: string): void => {
    if (busy) return
    setBusy(true)
    setNotice(null)
    restoreHistory(id)
      .then(() => {
        setBusy(false)
        setNotice({ kind: 'ok', text: '已从历史版本恢复' })
        reload()
      })
      .catch((e: unknown) => {
        setBusy(false)
        setNotice({ kind: 'err', text: `恢复失败: ${String((e as Error)?.message ?? e)}` })
      })
  }

  return (
    <section className="cinstr-section">
      <h3 className="cinstr-section-head">版本历史</h3>
      <p className="cinstr-desc">每次保存（含模板激活）自动留档，可回退到任意历史版本。</p>
      {!loaded ? <p className="cinstr-loading">正在加载历史…</p> : null}
      {history.length === 0 && loaded ? <p className="cinstr-empty">还没有历史记录。保存一次后这里会留档。</p> : null}
      <ul className="cinstr-list">
        {history.slice(0, 20).map((entry) => (
          <li className="cinstr-item" key={entry.id}>
            <span className="cinstr-item-name">{formatTime(entry.savedAt)}</span>
            <span className="cinstr-item-meta">{formatBytes(entry.size)}</span>
            <button className="cinstr-btn-ghost" onClick={() => restore(entry.id)} disabled={busy}>恢复</button>
          </li>
        ))}
      </ul>
      {notice !== null && <span className={notice.kind === 'ok' ? 'cinstr-ok' : 'cinstr-err'} aria-live="polite">{notice.text}</span>}
    </section>
  )
}

/** Project-level + persona overview section (read-only views). */
function OverviewSection(): JSX.Element {
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [preset, setPreset] = useState<PresetView | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.allSettled([projectView(), presetView()]).then((results) => {
      if (results[0].status === 'fulfilled') setProjects(results[0].value.projects)
      if (results[1].status === 'fulfilled') setPreset(results[1].value.view)
      setLoaded(true)
    })
  }, [])

  return (
    <section className="cinstr-section">
      <h3 className="cinstr-section-head">生效范围与 Persona</h3>
      {!loaded ? <p className="cinstr-loading">正在加载概览…</p> : null}
      <p className="cinstr-desc">项目级指令（各工作区根目录的 AGENTS.md）：</p>
      {projects.length === 0 && loaded ? <p className="cinstr-empty">没有注册的工作区。</p> : null}
      <ul className="cinstr-list">
        {projects.map((project) => (
          <li className="cinstr-item" key={project.path}>
            <span className="cinstr-item-name">{project.title}</span>
            <span className="cinstr-mono">{project.path}</span>
            <span className="cinstr-item-meta">{project.hasAgents ? '有项目级 AGENTS.md' : '无项目级指令'}</span>
          </li>
        ))}
      </ul>
      <p className="cinstr-desc">当前默认 agent preset 的 persona 概览（只读；编辑 preset 请用「Agent presets」设置页）：</p>
      {preset !== null && loaded ? (
        <>
          <p className="cinstr-meta">preset: <span className="cinstr-mono">{preset.preset}</span></p>
          {preset.persona !== '' ? <pre className="cinstr-mono" style={{ margin: 0, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>{preset.persona.slice(0, 2000)}</pre> : <p className="cinstr-empty">该 preset 未声明 persona 段落。</p>}
        </>
      ) : null}
      {preset === null && loaded ? <p className="cinstr-empty">当前环境没有可读的 agent preset。</p> : null}
    </section>
  )
}

/** The instruction center page body. */
export function CustomInstructionsSection(): JSX.Element {
  // Bumped whenever a mutation elsewhere (save/activate/restore) should
  // refresh the template/history lists.
  const [refreshToken, setRefreshToken] = useState(0)
  const refresh = useCallback(() => setRefreshToken((value) => value + 1), [])

  return (
    <div className="cinstr-page">
      <GlobalSection onChanged={refresh} refreshToken={refreshToken} />
      <TemplatesSection refreshToken={refreshToken} onChanged={refresh} />
      <HistorySection refreshToken={refreshToken} />
      <OverviewSection />
      <p className="cinstr-meta" style={{ margin: 0 }}>
        快捷键 Ctrl+S 保存全局指令。所有数据存储于当前主机的 DSH 配置目录。
        <button className="cinstr-btn-ghost" style={{ marginLeft: 8 }} onClick={refresh}>
          刷新列表
        </button>
      </p>
    </div>
  )
}
