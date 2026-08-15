/**
 * The custom-instructions settings page body (JSX component).
 */

import { useEffect, useState } from 'react'

/** Plugin CSS, scoped by a package-unique class prefix. */
export const CSS = `
.custinstr-page { display: flex; flex-direction: column; gap: 12px; max-width: 720px; color: var(--dsw-alias-label-primary); }
.custinstr-title { margin: 0; font-size: 16px; font-weight: 500; }
.custinstr-desc { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.custinstr-area { min-height: 340px; resize: vertical; padding: 12px; font: inherit; line-height: 1.6; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); outline: none; }
.custinstr-area:focus { border-color: var(--dsw-alias-brand-primary); }
.custinstr-area:disabled { opacity: 0.6; }
.custinstr-row { display: flex; align-items: center; gap: 10px; }
.custinstr-save { height: 32px; padding: 0 18px; border: none; border-radius: 16px; background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-foreground, #fff); cursor: pointer; font-size: 13px; }
.custinstr-save:disabled { opacity: 0.5; cursor: default; }
.custinstr-ok { font-size: 12px; color: var(--dsw-alias-state-success-primary); }
.custinstr-err { font-size: 12px; color: var(--dsw-alias-state-error-primary); }
.custinstr-meta { font-size: 12px; color: var(--dsw-alias-label-secondary); }
`

/** Read the current instructions via the host route. */
async function readInstructions(): Promise<{ ok: boolean; path?: string; text?: string; error?: string }> {
  const response = await fetch('/api/dsh-custom-instructions', { method: 'GET' })
  return (await response.json()) as { ok: boolean; path?: string; text?: string; error?: string }
}

/** Replace the instructions via the host route. */
async function writeInstructions(text: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  const response = await fetch('/api/dsh-custom-instructions', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  return (await response.json()) as { ok: boolean; path?: string; error?: string }
}

/** The settings page body. */
export function CustomInstructionsSection(): JSX.Element {
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [path, setPath] = useState('')

  useEffect(() => {
    readInstructions()
      .then((res) => {
        if (res.ok) {
          setText(res.text ?? '')
          setPath(res.path ?? '')
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const save = (): void => {
    setSaving(true)
    setNotice(null)
    writeInstructions(text)
      .then((res) => {
        setSaving(false)
        setNotice(res.ok
          ? { kind: 'ok', text: '已保存，新会话自动生效' }
          : { kind: 'err', text: `保存失败: ${res.error ?? '未知错误'}` })
      })
      .catch(() => {
        setSaving(false)
        setNotice({ kind: 'err', text: '保存失败' })
      })
  }

  return (
    <div className="custinstr-page">
      <h2 className="custinstr-title">自定义指令</h2>
      <p className="custinstr-desc">向此主机上所有聊天提供额外说明和上下文，保存后新会话自动生效。</p>
      <textarea
        className="custinstr-area"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="在此输入对所有聊天生效的指令……"
        disabled={!loaded}
        spellCheck={false}
      />
      <div className="custinstr-row">
        <button className="custinstr-save" onClick={save} disabled={saving || !loaded}>
          {saving ? '保存中…' : '保存'}
        </button>
        {notice !== null && <span className={notice.kind === 'ok' ? 'custinstr-ok' : 'custinstr-err'}>{notice.text}</span>}
      </div>
      {path !== '' && <p className="custinstr-meta">存储位置: {path}</p>}
    </div>
  )
}