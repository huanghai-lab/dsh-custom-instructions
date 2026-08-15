# dsh-custom-instructions

> DSH Web GUI 的「指令管理中心」 —— 在设置页可视化管理对所有聊天生效的全局指令、多套指令模板、版本历史，并一览项目级指令与当前 persona。

[![CI](https://github.com/huanghai-lab/dsh-custom-instructions/actions/workflows/ci.yml/badge.svg)](https://github.com/huanghai-lab/dsh-custom-instructions/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

## 这是什么

在 DSH（DeepSeek Harness）Web GUI 的侧边栏 **设置 → 自定义指令** 提供完整的指令管理界面：

- **全局指令**：一个大文本框，内容就是 `~/.dsh/AGENTS.md`（用户全局指令文件，每次会话自动加载），保存即生效
- **指令模板**：保存多套指令集（写作规范、代码规范、研究规范……），一键激活切换，支持导入导出
- **版本历史**：每次保存自动留档，可回退任意历史版本
- **生效范围与 Persona**：一览各工作区的项目级 AGENTS.md 与当前默认 agent preset 的 persona 概览

和 ChatGPT 的 Custom Instructions 一样，你可以在这里写"每次聊天都该遵守的规则"——现在还能按场景切换多套规则。

## 功能

| 功能 | 说明 |
|---|---|
| 全局指令编辑 | 直接编辑 `~/.dsh/AGENTS.md` 全文，Ctrl+S 保存 |
| 撤销保存 | 每次保存把上一版轮转成 `AGENTS.md.bak`，「撤销上次保存」一键恢复 |
| 指令模板 | 多套指令集的创建、激活切换、删除；激活即替换全局指令（自动入历史） |
| 版本历史 | 每次保存（含模板激活）自动留档，可恢复到任意版本 |
| 导入导出 | 模板 + 历史 + 当前内容打包为一个 JSON 文件，跨机器迁移 |
| 项目级指令视图 | 列出各工作区及其根目录 AGENTS.md 存在性（只读） |
| Persona 概览 | 展示默认 agent preset 及 persona 段落（只读，打通 prompt 管理入口） |
| 长度提示 | 实时字符数 / 字节数 / 上限（65 KB），接近变色、超限禁用保存 |
| 路径自适应 | 通过 `$DSH_HOME/settings.yaml` 定位 AGENTS.md，支持 DSH_HOME 覆盖 |
| 热插拔 | `dsh plugin add link:` 一键挂载，无需改动 DSH 源码 |

## 安装

**预构建版（推荐）**：仓库直接带 `lib/` 构建产物，clone 后无需本地构建：

```bash
# 1. 克隆
git clone https://github.com/huanghai-lab/dsh-custom-instructions.git
cd dsh-custom-instructions

# 2. 挂载到 DSH 的 web profile（<profile> 通常是 web）
dsh plugin --profile <profile> add link:~/dsh-custom-instructions
```

源码构建版（开发/定制）：

```bash
pnpm install
pnpm build
# 然后同上挂载
```

卸载：`dsh plugin --profile <profile> remove custom-instructions`

### 兼容性

- 按 DSH `0.1.0-rc.6` 客户端接口构建（类型层面，devDependencies 精确锁定）；运行时只依赖 DSH 提供的 `webServer` 服务与 `react` peer，不内联任何 `@deepseek-ai/*` 运行时代码。DSH 升级后若接口变化，用 `pnpm build` 重新构建即可适配。
- Node.js 要求：`^22.19.0 || >=24.0.0`。
- 编辑器通过 DSH Web Server 写当前用户的全局 `AGENTS.md`；不要把 Web GUI 暴露给不可信网络（访问控制由 DSH Web Server 负责）。

## 使用

1. 打开 DSH Web GUI，点侧边栏底部的设置（齿轮）
2. 左侧导航点「自定义指令」
3. 在文本框里写或改指令（比如把 humanizer-zh 的规则贴进去）
4. 点「保存」或按 Ctrl+S
5. 新开聊天会话，指令自动生效；改错了点「撤销上次保存」恢复上一版

## 开发

```bash
pnpm install --frozen-lockfile  # 安装
pnpm typecheck                  # 类型检查
pnpm test                       # 单元测试（13 个路由用例）
pnpm build                      # 构建 lib/
pnpm e2e                        # 真实 GUI e2e（需 E2E_BASE_URL 指向运行中的 DSH）
```

CI：`.github/workflows/ci.yml` 在 push/PR 时跑 install + typecheck + test + build。

## 工作原理

```
浏览器设置页 (src/client)
   │  GET/PUT /api/dsh-custom-instructions
   ▼
Host 路由 (src/index.ts)
   │  读写
   ▼
~/.dsh/AGENTS.md  ← 每次会话由 dsh-agent-instructions 自动加载
```

- **Host 端** `src/index.ts`：注册 `/api/dsh-custom-instructions` 路由族（GET 读 / PUT 写 / POST 恢复备份），文件路径通过 settings 文档目录解析，直接走 node:fs（绕开沙箱 workspace-write 限制）。
- **Client 端** `src/client/`：注册 `settings.section` 列表项（id `custom-instructions`，order 25），渲染编辑器页面（字节统计、撤销、快捷键）。

## 常驻指令示例

把以下内容保存进去，所有聊天都会自动带上"去除 AI 写作痕迹"规则（配合 [humanizer-zh](https://github.com/op7418/Humanizer-zh) 效果最佳）：

```markdown
在回复前检查一遍文字渲染是否正常。
默认将 humanizer-zh 用于中文写作、润色、改写以及普通中文回复，
使表达自然、具体、简洁，避免公式化的 AI 写作痕迹。
不得因此改动事实、数据、公式、代码、逐字引用或用户指定的格式。
回答简洁明了并且逻辑清晰，每次回答都要审视，确保不存在逻辑漏洞。
```

## 目录结构

```
├── src/
│   ├── index.ts                 # Host 端：/api/dsh-custom-instructions 路由
│   ├── invariant.ts             # 无断言 invariant（占位）
│   └── client/
│       ├── index.ts             # Client 端：注册 settings.section
│       ├── InstructionsSection.tsx  # 编辑器页面组件
│       └── api.ts               # fetch 客户端
├── tests/
│   ├── routes.spec.ts           # 单元测试（13 用例：GET/PUT/POST/错误/备份）
│   └── e2e/instructions.spec.ts # 真实 GUI e2e（E2E_BASE_URL 驱动）
├── shared/                      # tsdown client-bundle 构建 preset
├── .github/workflows/ci.yml     # CI：install + typecheck + test + build
├── cordis.patch.yml             # DSH 插件清单（bundle patch）
├── lib/                         # 预构建产物（入库，clone 即用）
├── package.json                 # @huanghai-lab/dsh-custom-instructions
├── tsdown.config.ts             # 构建配置
└── README.md
```

## 许可证

Apache-2.0
