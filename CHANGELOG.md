# Changelog

本项目按 [Semantic Versioning](https://semver.org/) 记录公开版本。

## [Unreleased]

### Changed

- 适配 DSH `0.1.2-alpha.1`：客户端上下文改用 Cordis，移除已删除的 `dsh-client-runtime` 注入，并同步新的浏览器平台模块表。
- Markdown 预览同时提供新版 `labels` 与旧版 `codeLabels`，补齐代码复制和脚注的中英文文案。
- 自定义路由接入新版 Connection 的 Host/Origin 与浏览器 Cookie 鉴权，未登录请求不再能读取私有指令。

### Validation

- CI 从官方 `dsh-v0.1.2-alpha.1` 标签检出并构建源码，校验插件依赖接口和类型，再在隔离 `DSH_HOME` 中运行带一次性登录的真实浏览器 E2E。

## [0.4.0] - 2026-08-28

### Added

- 全局指令的草稿恢复、放弃、撤销和官方 Markdown 预览。
- Unicode 模板名称、独立模板编辑器、激活状态和安全文件名编码。
- 可预览、可恢复且最多保留 100 条的版本历史。
- 中英文界面、窄屏布局、键盘操作、焦点恢复和 ARIA。
- 隔离 DSH tarball E2E、Windows/Ubuntu Node 24 CI 和 npm provenance 发布流程。

### Changed

- 运行时兼容基线升级为 DSH `0.1.1-rc.2`。
- 导入改为严格预校验、安全合并和失败回滚，并迁移当前内容、模板、历史与激活状态。
- 模板上限为 50，单项上限为 65 KiB，导入请求体上限为 16 MiB。

### Security

- 所有修改均要求磁盘内容派生的 `expectedRevision`，冲突返回 `409`。
- 修改进入进程内串行队列，并通过同目录临时文件、回读校验和替换完成。
- 模板名不再直接作为物理路径，阻断路径穿越。

[Unreleased]: https://github.com/huanghai-lab/dsh-custom-instructions/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/huanghai-lab/dsh-custom-instructions/compare/v0.3.0...v0.4.0
