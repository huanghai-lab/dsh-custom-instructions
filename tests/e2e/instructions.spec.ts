/**
 * Real-GUI end-to-end smoke test for the custom-instructions settings page.
 *
 * Requires a running DSH Web GUI with this plugin mounted in its web profile
 * (see README 安装). Point E2E_BASE_URL at the GUI, e.g.
 *   E2E_BASE_URL=http://127.0.0.1:60508 pnpm e2e
 * Without the variable the whole suite is skipped — unit tests stay the
 * default verification path.
 */

import { expect, test } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL

test.describe('custom-instructions settings page', () => {
  test.skip(baseURL === undefined || baseURL === '', 'E2E_BASE_URL not set — set it to a running DSH Web GUI')

  test('opens the page, edits, saves, and restores', async ({ page }) => {
    await page.goto(baseURL as string)

    // Open the settings panel (sidebar foot gear). The shipped shell exposes
    // the trigger row with an accessible name; fall back to the gear button.
    const settingsTrigger = page.locator('[aria-label*="设置"], [aria-label*="Settings"]').first()
    await settingsTrigger.click()

    // The custom-instructions section sits in the settings nav.
    await page.getByText('自定义指令', { exact: true }).click()

    const textarea = page.locator('textarea[aria-label="自定义指令"]')
    await expect(textarea).toBeVisible({ timeout: 10_000 })

    // The editor loads the current instructions (empty or not) — the save
    // button must become enabled once loaded.
    const save = page.getByRole('button', { name: '保存' })
    await expect(save).toBeEnabled({ timeout: 10_000 })

    // Read the current value so the test can restore it afterwards.
    const original = await textarea.inputValue()

    // Edit and save.
    await textarea.fill('e2e 写入测试内容\n')
    await save.click()
    await expect(page.getByText('已保存，新会话自动生效')).toBeVisible({ timeout: 10_000 })

    // Restore the previous content through the backup slot.
    await page.getByRole('button', { name: '撤销上次保存' }).click()
    await expect(page.getByText('已恢复上次保存前的内容')).toBeVisible({ timeout: 10_000 })
    await expect(textarea).toHaveValue(original)
  })
})
