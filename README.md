# dsh-custom-instructions

DSH Web GUI 的「自定义指令」编辑器插件 —— 在设置页新增 **自定义指令** 页面（侧边栏底部 设置 → 自定义指令），直接编辑对**所有聊天**生效的全局指令文件 `~/.dsh/AGENTS.md`，界面类似 ChatGPT 的 Custom Instructions。

## 功能

- 设置页新增「自定义指令」入口（一个独立设置页面）
- 大文本框编辑全局指令（当前内容即 `~/.dsh/AGENTS.md`）
- 保存按钮写入文件，新会话自动生效（settings 支持热重载）
- 页面底部显示实际存储位置
- 与 [humanizer-zh](https://github.com/op7418/Humanizer-zh) 等常驻规则天然配合：把规则写进全局指令后，每个聊天都会自动带上

## 安装

```bash
# 1. 克隆并构建
git clone https://github.com/huanghai-lab/dsh-custom-instructions.git
cd dsh-custom-instructions
pnpm install
pnpm build

# 2. 挂载到 DSH 的 web profile（替换 <profile> 为你的 profile 名，通常是 web）
dsh plugin --profile <profile> add link:~/dsh-custom-instructions
```

> 热插拔，无需改动 dsh 源码；卸载同理 `dsh plugin --profile <profile> remove custom-instructions`。

## 工作原理

- **Host 端**（`src/index.ts`）：注册 `/api/dsh-custom-instructions` 路由族 —— GET 读取、PUT 写入全局指令文件。文件路径通过 settings 文档目录解析（`$DSH_HOME/settings.yaml` 同目录的 `AGENTS.md`），支持 `DSH_HOME` 覆盖。
- **Client 端**（`src/client/index.ts`）：注册 `settings.section` 列表项（id `custom-instructions`，order 25，label `自定义指令`），渲染编辑器页面。

## 开发

```bash
pnpm typecheck   # 类型检查
pnpm build       # tsc 声明 + tsdown 打包（lib/index.js + lib/client.js）
pnpm watch       # 增量构建
```

## 许可证

Apache-2.0
