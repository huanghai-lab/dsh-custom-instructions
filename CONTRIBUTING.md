# 参与贡献

感谢你愿意改进 dsh-custom-instructions。小修复可以直接提交 PR；涉及数据格式、兼容范围或界面流程的改动，请先开 Issue 或 Discussion 对齐行为。

## 本地验证

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

当前开发基线固定为 DSH `0.1.1-rc.2`。不要在同一 PR 中顺带升级 DSH 或加入新的 Markdown 解析依赖。

提交前请确认：

- 不读取或修改真实用户的 `AGENTS.md`；测试使用临时 `DSH_HOME`。
- 修改了 `src/` 时同步提交最新 `lib/`。
- 新增写入路径时覆盖容量、冲突、失败回滚和结构化错误。
- 中英文文案同时更新；键盘、焦点和窄屏行为没有退化。
- PR 只包含本次问题相关改动。

## 提交 PR

在说明中写清问题、实现边界、验证命令和界面截图（如适用）。所有 CI 检查通过后再合并。

## English

Small fixes may go straight to a PR. Discuss changes to storage formats, compatibility, or user flows first. Run the full command set above, keep `lib/` in sync with `src/`, use an isolated `DSH_HOME`, and update both locales.
