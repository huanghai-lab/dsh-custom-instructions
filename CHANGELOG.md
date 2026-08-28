# Changelog

本项目按 [Semantic Versioning](https://semver.org/) 记录公开版本。

## [Unreleased]

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
