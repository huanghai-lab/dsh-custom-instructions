// @vitest-environment jsdom

import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CustomInstructionsSection, DICTIONARIES } from '../src/client/InstructionsSection.tsx'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  MarkdownText: ({ text }: { text: string }) => <div data-markdown="true">{text}</div>,
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const REVISION = 'a'.repeat(64)
const PATH = 'C:/isolated/.dsh/AGENTS.md'
let root: Root | undefined

afterEach(async () => {
  if (root !== undefined) await act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
  sessionStorage.clear()
  vi.unstubAllGlobals()
})

function t(locale: 'zh' | 'en'): (key: string, params?: Record<string, unknown>) => string {
  return (key, params = {}) => {
    let text = (DICTIONARIES[locale] as Record<string, string>)[key] ?? key
    for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value))
    return text
  }
}

function installFetch(options: { putConflict?: boolean } = {}): void {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'PUT' && options.putConflict === true) {
      return Response.json({ code: 'REVISION_CONFLICT', message: 'changed elsewhere' }, { status: 409 })
    }
    if (url.endsWith('/templates')) return Response.json({ ok: true, templates: [], active: null, revision: REVISION })
    if (url.endsWith('/history')) return Response.json({ ok: true, history: [], revision: REVISION })
    if (url.endsWith('/project')) return Response.json({ ok: true, source: 'workspaceRegistry', projects: [] })
    if (url.endsWith('/preset')) return Response.json({ ok: true, source: 'agentPresets', available: true, view: { preset: 'default', persona: '' } })
    return Response.json({
      ok: true,
      path: PATH,
      text: '# Saved',
      revision: REVISION,
      maxBytes: 65_536,
      maxTemplates: 50,
      maxHistory: 100,
      maxImportBytes: 16 * 1024 * 1024,
      active: null,
      hasBackup: false,
    })
  }))
}

async function render(locale: 'zh' | 'en'): Promise<HTMLElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const TestSection = CustomInstructionsSection as unknown as (props: {
    t: ReturnType<typeof t>
    close: () => void
  }) => JSX.Element
  await act(async () => {
    root?.render(<TestSection t={t(locale)} close={vi.fn()} />)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return container
}

function button(container: HTMLElement, label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll('button')].find((item) => item.textContent === label)
  if (match === undefined) throw new Error(`button not found: ${label}`)
  return match
}

describe('settings page', () => {
  it('renders the English fallback in the specified order and uses MarkdownText for preview', async () => {
    installFetch()
    const container = await render('en')
    const text = container.textContent ?? ''
    expect(text.indexOf('Global instructions')).toBeLessThan(text.indexOf('Instruction templates'))
    expect(text.indexOf('Instruction templates')).toBeLessThan(text.indexOf('Version history'))
    expect(text.indexOf('Version history')).toBeLessThan(text.indexOf('Environment overview'))

    await act(async () => button(container, 'Preview').click())
    expect(container.querySelector('[data-markdown="true"]')?.textContent).toBe('# Saved')
  })

  it('restores a profile-scoped browser draft without changing saved content', async () => {
    installFetch()
    sessionStorage.setItem(`dsh-custom-instructions:draft:${PATH}`, JSON.stringify({ text: '# Browser draft', revision: REVISION }))
    const container = await render('zh')

    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('# Browser draft')
    expect(container.textContent).toContain('已恢复上次未保存的浏览器草稿')
  })

  it('keeps the draft and only offers copy or reload after a revision conflict', async () => {
    installFetch({ putConflict: true })
    const container = await render('zh')
    const area = container.querySelector('textarea') as HTMLTextAreaElement

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setValue?.call(area, '# Local draft')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      button(container, '保存更改').click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('检测到其他窗口或外部程序修改了数据')
    expect(button(container, '复制草稿')).toBeTruthy()
    expect(button(container, '加载最新内容')).toBeTruthy()
    expect(JSON.parse(sessionStorage.getItem(`dsh-custom-instructions:draft:${PATH}`) ?? '{}')).toEqual({ text: '# Local draft', revision: REVISION })
  })

  it('does not pair a stale browser draft with a newer revision', async () => {
    installFetch()
    sessionStorage.setItem(`dsh-custom-instructions:draft:${PATH}`, JSON.stringify({ text: '# Stale draft', revision: 'b'.repeat(64) }))
    const container = await render('zh')

    expect((container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('# Saved')
    expect(container.textContent).toContain('检测到其他窗口或外部程序修改了数据')
    expect(JSON.parse(sessionStorage.getItem(`dsh-custom-instructions:draft:${PATH}`) ?? '{}').text).toBe('# Stale draft')
  })

  it('keeps the template revision from when its editor was opened', async () => {
    const newerRevision = 'b'.repeat(64)
    let currentRevision = REVISION
    let rootReads = 0
    let submittedRevision = ''
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/templates/Template')) {
        if (init?.method === 'PUT') {
          submittedRevision = String((JSON.parse(String(init.body)) as { expectedRevision: string }).expectedRevision)
          return Response.json({ code: 'REVISION_CONFLICT', message: 'changed elsewhere' }, { status: 409 })
        }
        return Response.json({ ok: true, name: 'Template', text: '# Template', revision: REVISION })
      }
      if (url.endsWith('/templates')) {
        return Response.json({ ok: true, templates: [{ name: 'Template', size: 10, updatedAt: 1 }], active: null, revision: currentRevision })
      }
      if (url.endsWith('/history')) return Response.json({ ok: true, history: [], revision: currentRevision })
      if (url.endsWith('/project')) return Response.json({ ok: true, source: 'workspaceRegistry', projects: [] })
      if (url.endsWith('/preset')) return Response.json({ ok: true, source: 'agentPresets', available: true, view: { preset: 'default', persona: '' } })
      rootReads += 1
      currentRevision = rootReads === 1 ? REVISION : newerRevision
      return Response.json({
        ok: true,
        path: PATH,
        text: '# Saved',
        revision: currentRevision,
        maxBytes: 65_536,
        maxTemplates: 50,
        maxHistory: 100,
        maxImportBytes: 16 * 1024 * 1024,
        active: null,
        hasBackup: false,
      })
    }))
    const container = await render('zh')
    const editTemplate = [...container.querySelectorAll('.cinstr-item .cinstr-link-button')]
      .find((item) => item.textContent === '编辑') as HTMLButtonElement
    await act(async () => { editTemplate.click(); await new Promise((resolve) => setTimeout(resolve, 0)) })

    const area = [...container.querySelectorAll('textarea')].at(-1) as HTMLTextAreaElement
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setValue?.call(area, '# Local template draft')
      area.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { button(container, '刷新数据').click(); await new Promise((resolve) => setTimeout(resolve, 0)) })
    const save = container.querySelector('.cinstr-item-body .cinstr-button') as HTMLButtonElement
    await act(async () => { save.click(); await new Promise((resolve) => setTimeout(resolve, 0)) })

    expect(submittedRevision).toBe(REVISION)
    expect(container.textContent).toContain('检测到其他窗口或外部程序修改了数据')
  })
})
