# dsh-custom-instructions

> A "Custom Instructions" editor for the DSH Web GUI — edit the global instruction file that applies to **every chat** on the machine, from a settings page that looks like ChatGPT's Custom Instructions panel.

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

## What it is

Adds a **设置 → 自定义指令** (Settings → Custom Instructions) page to the DSH (DeepSeek Harness) Web GUI:

- A large textarea whose content **is** `~/.dsh/AGENTS.md` — the user-global instruction file loaded automatically into every session.
- Click **保存** (Save) to write it immediately; new sessions pick it up automatically.
- The page shows the actual storage path at the bottom.

Just like ChatGPT's Custom Instructions, write the rules you want every conversation to follow — writing style, answer preferences, workflow conventions. All future chats get them automatically.

## Features

| Feature | Description |
|---|---|
| Settings page entry | Side bar → Settings → Custom Instructions |
| Full edit | Edit the whole `~/.dsh/AGENTS.md` file |
| Instant apply | Save writes the file; new sessions load it (settings hot-reload) |
| Path aware | Locates AGENTS.md via `$DSH_HOME/settings.yaml`, honors DSH_HOME overrides |
| Hot-pluggable | `dsh plugin add link:` — no DSH source changes |

## Install

```bash
# 1. Clone and build
git clone https://github.com/huanghai-lab/dsh-custom-instructions.git
cd dsh-custom-instructions
pnpm install
pnpm build

# 2. Mount into the DSH web profile (<profile> is usually web)
dsh plugin --profile <profile> add link:~/dsh-custom-instructions
```

Uninstall: `dsh plugin --profile <profile> remove custom-instructions`

### Compatibility and security

- This version is built against the DSH `0.1.0-rc.6` client APIs and requires Node.js `22.19.0` or `24.x` and newer.
- Installation currently requires building from source; no prebuilt package is provided yet.
- The editor writes the current user's global `AGENTS.md` through the DSH Web Server. Do not expose the DSH Web GUI to an untrusted network; access control for this route is provided by the DSH Web Server.
- The plugin may need updates if DSH changes its global-instruction loading or settings-document path behavior.

## Usage

1. Open the DSH Web GUI, click the settings gear at the bottom of the side bar.
2. Click **自定义指令** in the left nav.
3. Write or edit instructions in the textarea (e.g. paste in the humanizer-zh rules).
4. Click **保存** (Save).
5. Start a new chat — the instructions apply automatically.

## How it works

```
Browser settings page (src/client)
   │  GET/PUT /api/dsh-custom-instructions
   ▼
Host routes (src/index.ts)
   │  read/write
   ▼
~/.dsh/AGENTS.md  ← auto-loaded into every session by dsh-agent-instructions
```

- **Host** `src/index.ts`: registers the `/api/dsh-custom-instructions` route family (GET read / PUT write); the file path resolves from the settings document directory.
- **Client** `src/client/`: registers a `settings.section` entry (id `custom-instructions`, order 25) rendering the editor page.

## Example persistent instructions

Save this and every chat will carry the "remove AI writing artifacts" rule (works great together with [humanizer-zh](https://github.com/op7418/Humanizer-zh)):

```markdown
在回复前检查一遍文字渲染是否正常。
默认将 humanizer-zh 用于中文写作、润色、改写以及普通中文回复，
使表达自然、具体、简洁，避免公式化的 AI 写作痕迹。
不得因此改动事实、数据、公式、代码、逐字引用或用户指定的格式。
回答简洁明了并且逻辑清晰，每次回答都要审视，确保不存在逻辑漏洞。
```

## Layout

```
├── src/
│   ├── index.ts                 # Host: /api/dsh-custom-instructions routes
│   ├── invariant.ts             # no-op invariant (placeholder)
│   └── client/
│       ├── index.ts             # Client: registers settings.section
│       ├── InstructionsSection.tsx  # editor page component
│       └── api.ts               # fetch client
├── shared/                      # tsdown client-bundle build preset
├── cordis.patch.yml             # DSH plugin manifest (bundle patch)
├── package.json                 # @huanghai-lab/dsh-custom-instructions
├── tsdown.config.ts             # build config
└── README.md
```

## Development

```bash
pnpm typecheck   # type check
pnpm build       # tsc declarations + tsdown bundle (lib/index.js + lib/client.js)
pnpm watch       # incremental build
```

## License

Apache-2.0
