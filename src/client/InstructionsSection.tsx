/**
 * The custom-instructions settings page body (JSX component).
 */

import { useEffect, useRef, useState } from 'react'
import { readInstructions, writeInstructions } from './api.ts'

/** Plugin CSS, scoped by a package-unique class prefix. */
export const CSS = `
.custinstr-page { display: flex; flex-direction: column; gap: 12px; width: min(100%, 720px); color: var(--dsw-alias-label-primary); }
.custinstr-title { margin: 0; font-size: 18px; font-weight: 600; }
.custinstr-desc { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.custinstr-area { box-sizing: border-box; width: 100%; min-height: 340px; resize: vertical; padding: 14px; font: inherit; line-height: 1.6; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); outline: none; transition: border-color 120ms ease, box-shadow 120ms ease; }
.custinstr-area:focus { border-color: var(--dsw-alias-brand-primary); }
.custinstr-area:focus-visible { box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
.custinstr-area:disabled { opacity: 0.6; }
.custinstr-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.custinstr-save { min-width: 72px; height: 34px; padding: 0 18px; border: none; border-radius: 17px; background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-foreground, #fff); cursor: pointer; font-size: 13px; transition: opacity 120ms ease, transform 120ms ease; }
.custinstr-save:not(:disabled):hover { opacity: 0.9; }
.custinstr-save:not(:disabled):active { transform: translateY(1px); }
.custinstr-save:disabled { opacity: 0.5; cursor: default; }
.custinstr-ok { font-size: 12px; color: var(--dsw-alias-state-success-primary); }
.custinstr-err { font-size: 12px; color: var(--dsw-alias-state-error-primary); }
.custinstr-meta { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.custinstr-count { margin-left: auto; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.custinstr-dirty { font-size: 12px; color: var(--dsw-alias-state-warn-primary); }
.custinstr-loading { font-size: 13px; color: var(--dsw-alias-label-secondary); }
`

/** The settings page body. */
export function CustomInstructionsSection(): JSX.Element {
  const [text, setText] = useState('')
  const [savedText, setSavedText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [path, setPath] = useState('')
  const noticeTimer = useRef<number | undefined>(undefined)

  /** Drop any transient notice (success text auto-clears after a while). */
  const clearNoticeSoon = (): void => {
    if (noticeTimer.current !== undefined) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3000)
  }

  useEffect(() => {
    let cancelled = false
    readInstructions()
      .then((res) => {
        if (cancelled) return
        if (res.ok) {
          setText(res.text ?? '')
          setSavedText(res.text ?? '')
          setPath(res.path ?? '')
        } else {
          setError(res.error ?? '读取失败，请刷新页面重试')
        }
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
  }, [])

  const dirty = loaded && text !== savedText

  const save = (): void => {
    if (saving || !loaded) return
    setSaving(true)
    setNotice(null)
    writeInstructions(text)
      .then((res) => {
        setSaving(false)
        if (res.ok) {
          setSavedText(text)
          setError('')
          setNotice({ kind: 'ok', text: '已保存，新会话自动生效' })
          clearNoticeSoon()
        } else {
          setNotice({ kind: 'err', text: `保存失败: ${res.error ?? '未知错误'}` })
        }
      })
      .catch(() => {
        setSaving(false)
        setNotice({ kind: 'err', text: '保存失败，请检查连接后重试' })
      })
  }

  // Ctrl/Cmd+S saves the instructions without leaving the page.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div className="custinstr-page">
      <h2 className="custinstr-title">自定义指令</h2>
      <p className="custinstr-desc">向此主机上所有聊天提供额外说明和上下文，保存后新会话自动生效。</p>
      {!loaded && <p className="custinstr-loading" aria-live="polite">正在读取指令…</p>}
      <textarea
        className="custinstr-area"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setNotice(null)
        }}
        placeholder="在此输入对所有聊天生效的指令……"
        disabled={!loaded}
        spellCheck={false}
        aria-label="自定义指令"
        aria-describedby="custinstr-help"
      />
      <p id="custinstr-help" className="custinstr-desc">内容会写入当前主机的 AGENTS.md，仅对新会话生效。快捷键 Ctrl+S 保存。</p>
      <div className="custinstr-row">
        <button className="custinstr-save" onClick={save} disabled={saving || !loaded || error !== ''}>
          {saving ? '保存中…' : '保存'}
        </button>
        {dirty && <span className="custinstr-dirty" aria-live="polite">有未保存的更改</span>}
        <span className="custinstr-count">{Array.from(text).length} 字符</span>
        {notice !== null && <span className={notice.kind === 'ok' ? 'custinstr-ok' : 'custinstr-err'} aria-live="polite">{notice.text}</span>}
      </div>
      {error !== '' && <p className="custinstr-err" role="alert">{error}</p>}
      {path !== '' && <p className="custinstr-meta">存储位置: {path}</p>}
    </div>
  )
}
