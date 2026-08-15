/**
 * Real-GUI end-to-end smoke test for the custom-instructions settings page.
 *
 * Requires a running DSH Web GUI with this plugin mounted in its web profile
 * (see README 安装). Point E2E_BASE_URL at the GUI, e.g.
 *   E2E_BASE_URL=http://127.0.0.1:60508 pnpm e2e
 * Without the variable the whole suite is skipped — unit tests stay the
 * default verification path.
 *
 * Data safety: the page edits the user's REAL instructions file. The test
 * snapshots the original content up front and always restores it through the
 * HTTP API in a finally block, so a failing assertion can never leave test
 * text in the user's AGENTS.md.
 */

import { expect, test } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL

test.describe('custom-instructions settings page', () => {
  test.skip(baseURL === undefined || baseURL === '', 'E2E_BASE_URL not set — set it to a running DSH Web GUI')

  test('opens the page, edits, saves, and restores', async ({ page }) => {
    const api = `${baseURL}/api/dsh-custom-instructions`

    // Snapshot the user's real content so the finally block can always put it back.
    const snapshot = await (await page.request.get(api)).json() as { ok: boolean; text?: string }
    expect(snapshot.ok).toBe(true)
    const original = snapshot.text ?? ''

    try {
      await page.goto(baseURL as string)

      // Open the settings panel via the sidebar-foot Settings button. The shell
      // exposes it with the accessible name "Settings" (snapshot-verified).
      await page.getByRole('button', { name: 'Settings' }).click()

      // The custom-instructions section sits in the settings nav.
      await page.getByText('自定义指令', { exact: true }).click()

      const textarea = page.locator('textarea[aria-label="自定义指令"]')
      await expect(textarea).toBeVisible({ timeout: 10_000 })

      // The editor loads the current instructions (empty or not) — the save
      // button must become enabled once loaded. Exact name match: "撤销上次保存"
      // also contains "保存" and would violate strict mode otherwise.
      const save = page.getByRole('button', { name: '保存', exact: true })
      await expect(save).toBeEnabled({ timeout: 10_000 })

      // The editor should show the same content the API just snapshotted.
      await expect(textarea).toHaveValue(original)

      // Edit and save.
      await textarea.fill('e2e 写入测试内容\n')
      await save.click()
      await expect(page.getByText('已保存，新会话自动生效')).toBeVisible({ timeout: 10_000 })

      // Restore the previous content through the backup slot.
      await page.getByRole('button', { name: '撤销上次保存' }).click()
      await expect(page.getByText('已恢复上次保存前的内容')).toBeVisible({ timeout: 10_000 })
      await expect(textarea).toHaveValue(original)
    } finally {
      // Unconditional restoration through the HTTP API: whatever the test did,
      // the user's real instructions come back.
      const restored = await (await page.request.put(api, {
        data: { text: original },
        headers: { 'content-type': 'application/json' },
      })).json() as { ok: boolean }
      expect(restored.ok).toBe(true)
    }
  })
})
