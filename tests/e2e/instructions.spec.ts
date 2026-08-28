import { expect, test } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const API = '/api/dsh-custom-instructions'

test('runs the complete instruction workflow in an isolated DSH profile', async ({ page }) => {
  test.setTimeout(120_000)
  const initial = await (await page.request.get(API)).json() as {
    ok: boolean
    path: string
    text: string
    revision: string
  }
  expect(initial.ok).toBe(true)
  expect(initial.path).toContain('dsh-custom-instructions-e2e-')
  expect(initial.text).toBe('')

  await page.goto('/')
  await page.getByRole('button', { name: /继续|Continue/ }).click()
  await page.getByRole('button', { name: '稍后配置' }).click()
  await page.getByRole('button', { name: /设置|Settings/ }).click()
  await page.getByRole('button', { name: '自定义指令', exact: true }).click()

  const globalEditor = page.getByRole('textbox', { name: '全局自定义指令' })
  await expect(globalEditor).toBeVisible()
  await globalEditor.fill('# E2E 全局\n\n隔离保存。')
  await page.getByRole('button', { name: '保存更改' }).click()
  await expect(page.getByText('已保存。新会话会自动加载这份指令。')).toBeVisible()

  await page.getByRole('button', { name: '预览', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'E2E 全局' })).toBeVisible()
  await page.getByRole('button', { name: '编辑', exact: true }).first().click()

  await page.getByRole('textbox', { name: '模板名称' }).fill('E2E 模板')
  await page.getByRole('button', { name: '从当前内容创建' }).click()
  const templateEditor = page.getByRole('textbox', { name: '模板 E2E 模板 的内容' })
  await expect(templateEditor).toBeVisible()
  await templateEditor.fill('# E2E 模板内容\n\n独立编辑。')
  await page.getByRole('button', { name: '保存更改' }).last().click()
  await expect(page.getByText('模板「E2E 模板」已保存。')).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '激活', exact: true }).click()
  await expect(page.getByText('已激活模板「E2E 模板」。')).toBeVisible()
  await expect(globalEditor).toHaveValue('# E2E 模板内容\n\n独立编辑。')

  const firstHistory = page.locator('.cinstr-section').filter({ hasText: '版本历史' }).locator('.cinstr-item').first()
  await firstHistory.getByRole('button', { name: '查看' }).click()
  await expect(firstHistory.getByText('E2E 全局')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出全部' }).click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const exported = JSON.parse(await readFile(downloadPath as string, 'utf8')) as {
    format: string
    active: string | null
    templates: Array<{ name: string }>
    history: unknown[]
  }
  expect(exported.format).toBe('dsh-instructions-v2')
  expect(exported.active).toBe('E2E 模板')
  expect(exported.templates.some(({ name }) => name === 'E2E 模板')).toBe(true)
  expect(exported.history.length).toBeGreaterThan(0)

  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('input[type="file"]').setInputFiles({
    name: 'instructions.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      format: 'dsh-instructions-v2',
      exportedAt: Date.now(),
      active: '导入模板',
      current: '# 导入后的全局内容',
      templates: [{ name: '导入模板', text: '# 导入模板内容' }],
      history: [],
    })),
  })
  await expect(page.getByText(/已导入 \d+ 项并刷新全部数据。/)).toBeVisible()
  await expect(globalEditor).toHaveValue('# 导入后的全局内容')
  await expect(page.getByText('导入模板', { exact: true })).toBeVisible()

  const captureAssets = process.env.DSH_CAPTURE_README_ASSETS === '1'
  if (captureAssets) {
    await mkdir(join(process.cwd(), 'docs', 'assets'), { recursive: true })
    await page.getByRole('heading', { name: '全局指令' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(process.cwd(), 'docs', 'assets', 'settings-zh.png'), animations: 'disabled' })
  }

  await page.getByRole('button', { name: '通用设置', exact: true }).click()
  await page.getByRole('button', { name: '中文' }).click()
  await page.getByRole('menuitem', { name: 'English' }).click()
  await expect(page.getByText('Custom instructions', { exact: true })).toBeVisible()
  await page.getByText('Custom instructions', { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Global instructions' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Instruction templates' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Global custom instructions' })).toBeVisible()
  if (captureAssets) {
    await page.getByRole('heading', { name: 'Global instructions' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: join(process.cwd(), 'docs', 'assets', 'settings-en.png'), animations: 'disabled' })
  }
})
