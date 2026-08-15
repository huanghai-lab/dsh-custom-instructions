# dsh-custom-instructions

> DSH Web GUI 的「自定义指令」编辑器 —— 在设置页直接编辑对**所有聊天**生效的全局指令文件，界面类似 ChatGPT 的 Custom Instructions。

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

## 这是什么

在 DSH（DeepSeek Harness）Web GUI 的侧边栏 **设置 → 自定义指令** 新增一个设置页面：

- 一个大文本框，内容就是 `~/.dsh/AGENTS.md`（用户全局指令文件，每次会话自动加载）
- 点「保存」立即写入，新会话自动生效
- 页面底部显示实际存储位置

和 ChatGPT 的 Custom Instructions 一样，你可以在这里写"每次聊天都该遵守的规则"——比如常驻的写作风格、回答偏好、工作流约定。所有未来的聊天都会自动带上这些指令。

## 功能

| 功能 | 说明 |
|---|---|
| 设置页入口 | 侧边栏 设置 → 自定义指令（独立设置页面） |
| 全量编辑 | 直接编辑 `~/.dsh/AGENTS.md` 全文 |
| 即时生效 | 保存即写入，新会话自动加载（settings 热重载） |
| 路径自适应 | 通过 `$DSH_HOME/settings.yaml` 定位 AGENTS.md，支持 DSH_HOME 覆盖 |
| 热插拔 | `dsh plugin add link:` 一键挂载，无需改动 DSH 源码 |

## 安装

```bash
# 1. 克隆并构建
git clone https://github.com/huanghai-lab/dsh-custom-instructions.git
cd dsh-custom-instructions
pnpm install
pnpm build

# 2. 挂载到 DSH 的 web profile（<profile> 通常是 web）
dsh plugin --profile <profile> add link:~/dsh-custom-instructions
```

卸载：`dsh plugin --profile <profile> remove custom-instructions`

### 兼容性与安全说明

- 当前版本按 DSH `0.1.0-rc.6` 客户端接口构建，Node.js 要求为 `22.19.0` 或 `24.x` 及更高版本。
- 目前需要从源码构建，仓库暂未提供预构建安装包。
- 编辑器会通过 DSH Web Server 写入当前用户的全局 `AGENTS.md`。请不要把 DSH Web GUI 暴露给不可信网络；接口的访问控制依赖 DSH Web Server 本身。
- 如果 DSH 的全局指令加载机制或设置文档路径发生变化，插件需要同步更新。

## 使用

1. 打开 DSH Web GUI，点侧边栏底部的设置（齿轮）
2. 左侧导航点「自定义指令」
3. 在文本框里写或改指令（比如把 humanizer-zh 的规则贴进去）
4. 点「保存」
5. 新开聊天会话，指令自动生效

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

- **Host 端** `src/index.ts`：注册 `/api/dsh-custom-instructions` 路由族（GET 读 / PUT 写），文件路径通过 settings 文档目录解析。
- **Client 端** `src/client/`：注册 `settings.section` 列表项（id `custom-instructions`，order 25），渲染编辑器页面。

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
├── shared/                      # tsdown client-bundle 构建 preset
├── cordis.patch.yml             # DSH 插件清单（bundle patch）
├── package.json                 # @huanghai-lab/dsh-custom-instructions
├── tsdown.config.ts             # 构建配置
└── README.md
```

## 开发

```bash
pnpm typecheck   # 类型检查
pnpm build       # tsc 声明 + tsdown 打包（lib/index.js + lib/client.js）
pnpm watch       # 增量构建
```

## 许可证

Apache-2.0
