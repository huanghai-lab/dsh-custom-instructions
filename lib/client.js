window.__ModuleLoader__.load({
	id: "@huanghai-lab/dsh-custom-instructions",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/api.ts
		/** Browser API client for /api/dsh-custom-instructions. */
		const ROUTE_PREFIX = "/api/dsh-custom-instructions";
		var ApiError = class extends Error {
			code;
			status;
			constructor(code, message, status) {
				super(message);
				this.code = code;
				this.status = status;
				this.name = "ApiError";
			}
		};
		async function request(method, path, body) {
			let response;
			try {
				response = await fetch(`${ROUTE_PREFIX}${path}`, {
					method,
					headers: body === void 0 ? void 0 : { "content-type": "application/json" },
					body: body === void 0 ? void 0 : JSON.stringify(body)
				});
			} catch (error) {
				throw new ApiError("NETWORK_ERROR", String(error.message ?? error), 0);
			}
			const text = await response.text();
			if (text.trim() === "") throw new ApiError(response.ok ? "EMPTY_RESPONSE" : `HTTP_${response.status}`, response.ok ? "server returned an empty response" : `HTTP ${response.status}`, response.status);
			let result;
			try {
				const parsed = JSON.parse(text);
				if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
				result = parsed;
			} catch {
				if (!response.ok) throw new ApiError(`HTTP_${response.status}`, `HTTP ${response.status}: ${text.slice(0, 200)}`, response.status);
				throw new ApiError("INVALID_RESPONSE", "server returned a non-JSON response", response.status);
			}
			if (!response.ok) throw new ApiError(typeof result.code === "string" ? result.code : `HTTP_${response.status}`, typeof result.message === "string" ? result.message : `HTTP ${response.status}`, response.status);
			return result;
		}
		async function readInstructions() {
			return await request("GET", "");
		}
		async function writeInstructions(text, expectedRevision) {
			return await request("PUT", "", {
				text,
				expectedRevision
			});
		}
		async function restoreInstructions(expectedRevision) {
			return await request("POST", "", {
				action: "restore",
				expectedRevision
			});
		}
		async function listTemplates() {
			return await request("GET", "/templates");
		}
		async function saveTemplate(name, text, expectedRevision) {
			return await request("POST", "/templates", {
				name,
				text,
				expectedRevision
			});
		}
		async function updateTemplate(name, text, expectedRevision) {
			return await request("PUT", `/templates/${encodeURIComponent(name)}`, {
				text,
				expectedRevision
			});
		}
		async function readTemplate(name) {
			return await request("GET", `/templates/${encodeURIComponent(name)}`);
		}
		async function deleteTemplate(name, expectedRevision) {
			return await request("DELETE", `/templates/${encodeURIComponent(name)}`, { expectedRevision });
		}
		async function activateTemplate(name, expectedRevision) {
			return await request("POST", "/templates/activate", {
				name,
				expectedRevision
			});
		}
		async function listHistory() {
			return await request("GET", "/history");
		}
		async function readHistory(id) {
			return await request("GET", `/history/${encodeURIComponent(id)}`);
		}
		async function restoreHistory(id, expectedRevision) {
			return await request("POST", "/history/restore", {
				id,
				expectedRevision
			});
		}
		async function projectView() {
			return await request("GET", "/project");
		}
		async function exportBundle() {
			return await request("POST", "/export");
		}
		async function importBundle(bundle, expectedRevision) {
			return await request("POST", "/import", {
				bundle,
				expectedRevision
			});
		}
		//#endregion
		//#region src/client/InstructionsSection.tsx
		/** DSH settings page for global instructions, templates, history, and scope. */
		const LOCALE_NS = "custom-instructions";
		const DICTIONARIES = {
			zh: {
				sectionLabel: "自定义指令",
				globalEyebrow: "全局",
				globalTitle: "全局指令",
				globalDesc: "保存在当前 DSH 配置目录中，对这台主机上的新会话生效。",
				loading: "正在加载…",
				loadFailed: "加载失败：{message}",
				retry: "重试",
				edit: "编辑",
				preview: "预览",
				emptyPreview: "暂无可预览内容。",
				markdownCopy: "复制代码",
				markdownCopied: "已复制",
				markdownFootnotes: "脚注",
				globalAria: "全局自定义指令",
				globalPlaceholder: "输入对所有新会话生效的指令…",
				save: "保存更改",
				saving: "正在保存…",
				discard: "放弃草稿",
				undo: "撤销上次保存",
				undoing: "正在恢复…",
				unsaved: "有未保存的更改",
				bytesCount: "{characters} 个字符 · {bytes} / {limit}",
				overLimit: "已超出上限",
				nearLimit: "接近上限",
				savedNotice: "已保存。新会话会自动加载这份指令。",
				discardedNotice: "草稿已放弃。",
				undoNotice: "已恢复到上次保存前的内容。",
				storagePath: "存储位置：{path}",
				activeTemplate: "当前模板：{name}",
				manualMode: "当前为手动编辑模式",
				confirmUndo: "用上次保存前的内容替换当前全局指令？",
				templatesEyebrow: "复用",
				templatesTitle: "指令模板",
				templatesDesc: "从当前编辑器创建模板，之后可以独立修改并激活。",
				noTemplates: "还没有模板。先把当前内容保存为一份模板。",
				templateName: "模板名称",
				templateNamePlaceholder: "例如：论文写作",
				createFromCurrent: "从当前内容创建",
				creating: "正在创建…",
				openTemplate: "编辑",
				closeTemplate: "收起",
				activate: "激活",
				delete: "删除",
				currentActive: "已激活",
				templateEditorTitle: "编辑模板「{name}」",
				templateAria: "模板 {name} 的内容",
				templateSaved: "模板「{name}」已保存。",
				templateCreated: "已从当前内容创建模板「{name}」。",
				templateActivated: "已激活模板「{name}」。",
				templateDeleted: "模板「{name}」已删除。",
				confirmActivate: "激活模板「{name}」并替换当前全局指令？",
				confirmDelete: "永久删除模板「{name}」？全局指令不会被删除。",
				discardWarning: "继续会放弃页面上尚未保存的草稿。",
				exportAll: "导出全部",
				exported: "已导出当前保存的数据。",
				exportSavedOnly: "导出只包含已经保存的数据，页面草稿未包含。",
				importAll: "导入",
				importTooLarge: "文件超过 {limit} 的导入上限。",
				invalidJson: "导入文件不是有效的 JSON。",
				confirmImport: "导入 {templates} 个模板、{history} 条历史；当前指令会{currentChange}。",
				currentWillChange: "被替换",
				currentWillStay: "保持不变",
				imported: "已导入 {items} 项并刷新全部数据。",
				historyEyebrow: "恢复",
				historyTitle: "版本历史",
				historyDesc: "每次覆盖前自动保存一份快照，最多保留最近 100 条。",
				noHistory: "还没有历史记录。第二次保存时会出现第一条快照。",
				view: "查看",
				close: "收起",
				restore: "恢复此版本",
				confirmRestore: "用 {time} 的历史内容替换当前全局指令？",
				historyRestored: "已恢复所选历史版本。",
				overviewEyebrow: "只读",
				overviewTitle: "项目级 AGENTS.md",
				overviewDesc: "只读显示 DSH 已注册工作区的项目指令状态；请直接编辑对应项目根目录中的文件。",
				present: "已存在",
				missing: "未创建",
				unreadable: "无法读取",
				noProjects: "当前没有已注册的工作区。",
				footer: "Ctrl/Cmd+S 会保存当前正在编辑的全局指令或模板。",
				refresh: "刷新数据",
				refreshing: "正在刷新…",
				conflictTitle: "检测到其他窗口或外部程序修改了数据",
				conflictBody: "服务器没有覆盖你的草稿。请先复制草稿，再加载最新内容并手动合并。",
				copyDraft: "复制草稿",
				reloadLatest: "加载最新内容",
				draftCopied: "草稿已复制。",
				copyFailed: "无法访问剪贴板，请先在编辑器中手动复制。",
				latestLoaded: "已加载最新内容；冲突前的草稿仍可复制。",
				draftRecovered: "已恢复上次未保存的浏览器草稿。",
				failed: "操作失败：{message}",
				nameInvalid: "名称需为 1–64 个字符，UTF-8 不超过 160 字节，且首尾不能有空白。",
				itemMeta: "{size} · {time}",
				previewFailed: "内容预览失败：{message}"
			},
			en: {
				sectionLabel: "Custom instructions",
				globalEyebrow: "Global",
				globalTitle: "Global instructions",
				globalDesc: "Stored in the current DSH configuration and applied to new chats on this host.",
				loading: "Loading…",
				loadFailed: "Could not load: {message}",
				retry: "Retry",
				edit: "Edit",
				preview: "Preview",
				emptyPreview: "Nothing to preview yet.",
				markdownCopy: "Copy code",
				markdownCopied: "Copied",
				markdownFootnotes: "Footnotes",
				globalAria: "Global custom instructions",
				globalPlaceholder: "Enter instructions for every new chat…",
				save: "Save changes",
				saving: "Saving…",
				discard: "Discard draft",
				undo: "Undo last save",
				undoing: "Restoring…",
				unsaved: "Unsaved changes",
				bytesCount: "{characters} characters · {bytes} / {limit}",
				overLimit: "Over the limit",
				nearLimit: "Near the limit",
				savedNotice: "Saved. New chats will load these instructions.",
				discardedNotice: "Draft discarded.",
				undoNotice: "Restored the content from before the last save.",
				storagePath: "Storage: {path}",
				activeTemplate: "Active template: {name}",
				manualMode: "Manual editing mode",
				confirmUndo: "Replace the global instructions with the content from before the last save?",
				templatesEyebrow: "Reuse",
				templatesTitle: "Instruction templates",
				templatesDesc: "Create a template from the current editor, then edit and activate it independently.",
				noTemplates: "No templates yet. Save the current content as your first template.",
				templateName: "Template name",
				templateNamePlaceholder: "For example: Paper writing",
				createFromCurrent: "Create from current",
				creating: "Creating…",
				openTemplate: "Edit",
				closeTemplate: "Collapse",
				activate: "Activate",
				delete: "Delete",
				currentActive: "Active",
				templateEditorTitle: "Edit template “{name}”",
				templateAria: "Content of template {name}",
				templateSaved: "Template “{name}” saved.",
				templateCreated: "Created template “{name}” from the current content.",
				templateActivated: "Activated template “{name}”.",
				templateDeleted: "Template “{name}” deleted.",
				confirmActivate: "Activate “{name}” and replace the global instructions?",
				confirmDelete: "Permanently delete “{name}”? The global instructions will remain.",
				discardWarning: "Continuing will discard unsaved drafts on this page.",
				exportAll: "Export all",
				exported: "Exported the currently saved data.",
				exportSavedOnly: "The export contains saved data only; page drafts were not included.",
				importAll: "Import",
				importTooLarge: "The file exceeds the {limit} import limit.",
				invalidJson: "The import file is not valid JSON.",
				confirmImport: "Import {templates} templates and {history} history entries; current instructions will {currentChange}.",
				currentWillChange: "be replaced",
				currentWillStay: "stay unchanged",
				imported: "Imported {items} items and refreshed all data.",
				historyEyebrow: "Recover",
				historyTitle: "Version history",
				historyDesc: "A snapshot is saved before each replacement; the newest 100 are retained.",
				noHistory: "No history yet. The first snapshot appears on the second save.",
				view: "View",
				close: "Collapse",
				restore: "Restore this version",
				confirmRestore: "Replace the global instructions with the version from {time}?",
				historyRestored: "Restored the selected history version.",
				overviewEyebrow: "Read only",
				overviewTitle: "Project AGENTS.md",
				overviewDesc: "Read-only status for project instructions in registered DSH workspaces. Edit each file in its project root.",
				present: "Present",
				missing: "Not created",
				unreadable: "Unreadable",
				noProjects: "No workspaces are currently registered.",
				footer: "Ctrl/Cmd+S saves the global instructions or template currently being edited.",
				refresh: "Refresh data",
				refreshing: "Refreshing…",
				conflictTitle: "Another window or external program changed the data",
				conflictBody: "The server kept your draft. Copy it, load the latest content, and merge manually.",
				copyDraft: "Copy draft",
				reloadLatest: "Load latest",
				draftCopied: "Draft copied.",
				copyFailed: "Clipboard access failed. Copy the text directly from the editor.",
				latestLoaded: "Latest content loaded. The pre-conflict draft is still available to copy.",
				draftRecovered: "Recovered an unsaved browser draft.",
				failed: "Operation failed: {message}",
				nameInvalid: "Use 1–64 characters and at most 160 UTF-8 bytes, with no leading or trailing whitespace.",
				itemMeta: "{size} · {time}",
				previewFailed: "Could not load the preview: {message}"
			}
		};
		const CSS = `
.cinstr-page { display: flex; flex-direction: column; gap: 18px; width: min(100%, 820px); padding: 2px 0 24px; color: var(--dsw-alias-label-primary); }
.cinstr-section { position: relative; display: flex; flex-direction: column; gap: 12px; padding: 18px; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); }
.cinstr-section::before { position: absolute; inset: 0 auto 0 0; width: 3px; content: ''; background: var(--dsw-alias-brand-primary); opacity: .72; }
.cinstr-section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.cinstr-heading { margin: 2px 0 0; font-size: 16px; font-weight: 650; line-height: 1.35; }
.cinstr-eyebrow { margin: 0; color: var(--dsw-alias-brand-primary); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.cinstr-desc, .cinstr-meta, .cinstr-empty { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; }
.cinstr-editor { overflow: hidden; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-base); }
.cinstr-tabs { display: flex; gap: 2px; width: fit-content; padding: 3px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); }
.cinstr-tab { min-height: 28px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font: inherit; font-size: 12px; }
.cinstr-tab[aria-pressed='true'] { background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: 0 1px 3px rgb(0 0 0 / 10%); }
.cinstr-area { box-sizing: border-box; width: 100%; min-height: 260px; padding: 14px; resize: vertical; border: 0; background: transparent; color: var(--dsw-alias-label-primary); outline: 0; font: 13px/1.65 ui-monospace, SFMono-Regular, Consolas, monospace; }
.cinstr-area-small { min-height: 210px; }
.cinstr-preview { box-sizing: border-box; min-height: 260px; padding: 14px 16px; overflow: auto; color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 1.65; }
.cinstr-preview-small { min-height: 160px; max-height: 360px; }
.cinstr-toolbar, .cinstr-actions, .cinstr-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cinstr-toolbar { justify-content: space-between; }
.cinstr-button { min-height: 32px; padding: 0 14px; border: 1px solid transparent; border-radius: 16px; background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-foreground, #fff); cursor: pointer; font: inherit; font-size: 12px; }
.cinstr-button-secondary { border-color: var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); }
.cinstr-button-danger { border-color: var(--dsw-alias-state-error-primary); background: transparent; color: var(--dsw-alias-state-error-primary); }
.cinstr-button:not(:disabled):hover { filter: brightness(.96); }
.cinstr-button-secondary:not(:disabled):hover { background: var(--dsw-alias-bg-layer-2); }
.cinstr-button:disabled { cursor: default; opacity: .45; }
.cinstr-button:focus-visible, .cinstr-tab:focus-visible, .cinstr-input:focus-visible, .cinstr-area:focus-visible, .cinstr-link-button:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.cinstr-input { box-sizing: border-box; min-width: min(100%, 240px); min-height: 34px; padding: 0 11px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); outline: 0; font: inherit; font-size: 13px; }
.cinstr-budget { height: 3px; overflow: hidden; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); }
.cinstr-budget-fill { height: 100%; transform-origin: left; background: var(--dsw-alias-brand-primary); transition: width 140ms ease; }
.cinstr-budget-fill[data-state='near'] { background: var(--dsw-alias-state-warn-primary); }
.cinstr-budget-fill[data-state='over'] { background: var(--dsw-alias-state-error-primary); }
.cinstr-count { margin-left: auto; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.cinstr-warning { color: var(--dsw-alias-state-warn-primary); font-size: 12px; }
.cinstr-notice { margin: 0; padding: 10px 12px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); font-size: 12px; line-height: 1.5; }
.cinstr-notice[data-kind='ok'] { color: var(--dsw-alias-state-success-primary); }
.cinstr-notice[data-kind='error'] { color: var(--dsw-alias-state-error-primary); }
.cinstr-conflict { display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid var(--dsw-alias-state-warn-primary); border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent); }
.cinstr-conflict h3, .cinstr-subheading { margin: 0; font-size: 13px; font-weight: 650; }
.cinstr-list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
.cinstr-item { border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-base); }
.cinstr-item-top { display: flex; align-items: center; gap: 8px; min-height: 42px; padding: 7px 10px; }
.cinstr-item-body { display: flex; flex-direction: column; gap: 10px; padding: 0 10px 12px; border-top: 1px solid var(--dsw-alias-border-l2); }
.cinstr-item-name { min-width: 0; overflow: hidden; color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
.cinstr-active { padding: 2px 7px; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); color: var(--dsw-alias-brand-primary); font-size: 10px; font-weight: 650; }
.cinstr-item-meta { margin-left: auto; color: var(--dsw-alias-label-secondary); font-size: 11px; white-space: nowrap; }
.cinstr-link-button { padding: 3px 5px; border: 0; background: transparent; color: var(--dsw-alias-brand-primary); cursor: pointer; font: inherit; font-size: 12px; }
.cinstr-mono { color: var(--dsw-alias-label-secondary); font: 11px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
.cinstr-status { margin-left: auto; font-size: 11px; }
.cinstr-status[data-status='present'] { color: var(--dsw-alias-state-success-primary); }
.cinstr-status[data-status='unreadable'] { color: var(--dsw-alias-state-error-primary); }
.cinstr-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.cinstr-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 640px) {
  .cinstr-section { padding: 15px 13px; }
  .cinstr-item-top { align-items: flex-start; flex-wrap: wrap; }
  .cinstr-item-meta { width: 100%; margin-left: 0; }
  .cinstr-count { width: 100%; margin-left: 0; }
  .cinstr-button { min-height: 36px; }
  .cinstr-footer { align-items: flex-start; flex-direction: column; }
}
@media (prefers-reduced-motion: reduce) { .cinstr-budget-fill { transition: none; } }
`;
		function utf8Bytes(value) {
			return new TextEncoder().encode(value).length;
		}
		function formatBytes(value) {
			if (value < 1024) return `${value} B`;
			if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
			return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
		}
		function formatTime(value) {
			return new Date(value).toLocaleString(document.documentElement.lang || void 0);
		}
		function draftKey(path) {
			return `dsh-custom-instructions:draft:${path}`;
		}
		function parseStoredDraft(value) {
			try {
				const parsed = JSON.parse(value);
				if (typeof parsed.text === "string" && typeof parsed.revision === "string") return {
					text: parsed.text,
					revision: parsed.revision
				};
			} catch {}
			return {
				text: value,
				revision: null
			};
		}
		function validTemplateName(name) {
			return name === name.trim() && Array.from(name).length >= 1 && Array.from(name).length <= 64 && utf8Bytes(name) <= 160 && !/[\u0000-\u001f\u007f]/.test(name);
		}
		function message(error) {
			return String(error.message ?? error);
		}
		function downloadJson(filename, payload) {
			const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = filename;
			anchor.click();
			URL.revokeObjectURL(url);
		}
		async function readEditableState() {
			const instructions = await readInstructions();
			return {
				instructions,
				templates: instructions.templates,
				history: instructions.history
			};
		}
		function ModeTabs(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cinstr-tabs",
				role: "group",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "cinstr-tab",
					type: "button",
					"aria-pressed": props.mode === "edit",
					onClick: () => props.setMode("edit"),
					children: props.t("edit")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "cinstr-tab",
					type: "button",
					"aria-pressed": props.mode === "preview",
					onClick: () => props.setMode("preview"),
					children: props.t("preview")
				})]
			});
		}
		/**
		* DSH 0.1.1-rc.2 accepts `codeLabels`; 0.1.2-alpha.1 replaces it with the
		* required `labels` object. Supplying both keeps previews working across the
		* upstream transition.
		*/
		const CompatibleMarkdownText = _deepseek_ai_dsh_client_ui_primitives.MarkdownText;
		function MarkdownPreview(props) {
			const codeLabels = {
				copyLabel: props.t("markdownCopy"),
				copiedLabel: props.t("markdownCopied")
			};
			const labels = {
				code: codeLabels,
				footnotes: props.t("markdownFootnotes")
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: props.compact === true ? "cinstr-preview cinstr-preview-small" : "cinstr-preview",
				children: props.text.trim() === "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "cinstr-empty",
					children: props.t("emptyPreview")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CompatibleMarkdownText, {
					text: props.text,
					codeLabels,
					labels
				})
			});
		}
		function CustomInstructionsSection({ t }) {
			const [instructions, setInstructions] = (0, react.useState)(null);
			const [globalDraft, setGlobalDraft] = (0, react.useState)("");
			const [globalMode, setGlobalMode] = (0, react.useState)("edit");
			const [templates, setTemplates] = (0, react.useState)([]);
			const [history, setHistory] = (0, react.useState)([]);
			const [loading, setLoading] = (0, react.useState)(true);
			const [loadError, setLoadError] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(null);
			const [notice, setNotice] = (0, react.useState)(null);
			const [conflictDraft, setConflictDraft] = (0, react.useState)(null);
			const [newTemplateName, setNewTemplateName] = (0, react.useState)("");
			const [selectedTemplate, setSelectedTemplate] = (0, react.useState)(null);
			const [templateDraft, setTemplateDraft] = (0, react.useState)("");
			const [templateSaved, setTemplateSaved] = (0, react.useState)("");
			const [templateRevision, setTemplateRevision] = (0, react.useState)(null);
			const [templateMode, setTemplateMode] = (0, react.useState)("edit");
			const [selectedHistory, setSelectedHistory] = (0, react.useState)(null);
			const [historyPreview, setHistoryPreview] = (0, react.useState)("");
			const [projects, setProjects] = (0, react.useState)([]);
			const [overviewError, setOverviewError] = (0, react.useState)("");
			const [overviewLoading, setOverviewLoading] = (0, react.useState)(true);
			const fileInput = (0, react.useRef)(null);
			const templateNameInput = (0, react.useRef)(null);
			const globalSection = (0, react.useRef)(null);
			const templatePanel = (0, react.useRef)(null);
			const templateArea = (0, react.useRef)(null);
			const globalDirty = instructions !== null && globalDraft !== instructions.text;
			const templateDirty = selectedTemplate !== null && templateDraft !== templateSaved;
			const anyDirty = globalDirty || templateDirty;
			const globalBytes = utf8Bytes(globalDraft);
			const maxBytes = instructions?.maxBytes ?? 65536;
			const overLimit = globalBytes > maxBytes;
			const nearLimit = !overLimit && globalBytes > maxBytes * .9;
			const templateOverLimit = utf8Bytes(templateDraft) > maxBytes;
			const nameValid = validTemplateName(newTemplateName);
			const loadEditable = (0, react.useCallback)(async (restoreSessionDraft) => {
				setLoading(true);
				try {
					const state = await readEditableState();
					setInstructions(state.instructions);
					setTemplates(state.templates);
					setHistory(state.history);
					let draft = state.instructions.text;
					if (restoreSessionDraft) try {
						const stored = sessionStorage.getItem(draftKey(state.instructions.path));
						if (stored !== null && stored !== state.instructions.text) {
							const savedDraft = parseStoredDraft(stored);
							if (savedDraft.text !== state.instructions.text && savedDraft.revision === state.instructions.revision) {
								draft = savedDraft.text;
								setNotice({
									kind: "ok",
									text: t("draftRecovered")
								});
							} else if (savedDraft.text !== state.instructions.text) {
								setConflictDraft(savedDraft.text);
								setNotice(null);
							}
						}
					} catch {}
					setGlobalDraft(draft);
					setLoadError("");
					return true;
				} catch (error) {
					setLoadError(message(error));
					return false;
				} finally {
					setLoading(false);
				}
			}, [t]);
			const loadOverview = (0, react.useCallback)(async () => {
				setOverviewLoading(true);
				try {
					const result = await projectView();
					setProjects(result.projects);
					setOverviewError("");
				} catch (error) {
					setOverviewError(message(error));
				} finally {
					setOverviewLoading(false);
				}
			}, []);
			(0, react.useEffect)(() => {
				loadEditable(true);
				loadOverview();
			}, [loadEditable, loadOverview]);
			(0, react.useEffect)(() => {
				if (instructions === null) return;
				try {
					if (globalDirty) sessionStorage.setItem(draftKey(instructions.path), JSON.stringify({
						text: globalDraft,
						revision: instructions.revision
					}));
					else if (conflictDraft === null) sessionStorage.removeItem(draftKey(instructions.path));
				} catch {}
			}, [
				conflictDraft,
				globalDirty,
				globalDraft,
				instructions
			]);
			(0, react.useEffect)(() => {
				if (!anyDirty) return;
				const warn = (event) => {
					event.preventDefault();
				};
				window.addEventListener("beforeunload", warn);
				return () => window.removeEventListener("beforeunload", warn);
			}, [anyDirty]);
			const handleFailure = (0, react.useCallback)((error, draft) => {
				if (error instanceof ApiError && error.code === "REVISION_CONFLICT") {
					setConflictDraft(draft);
					setNotice(null);
					return;
				}
				setNotice({
					kind: "error",
					text: t("failed", { message: message(error) })
				});
			}, [t]);
			const refreshLists = (0, react.useCallback)(async (expected) => {
				try {
					const [templateResult, historyResult] = await Promise.all([listTemplates(), listHistory()]);
					if (templateResult.revision !== expected || historyResult.revision !== expected) {
						await loadEditable(true);
						return;
					}
					setTemplates(templateResult.templates);
					setHistory(historyResult.history);
				} catch {
					await loadEditable(true);
				}
			}, [loadEditable]);
			const clearStoredDraft = (0, react.useCallback)(() => {
				if (instructions === null) return;
				try {
					sessionStorage.removeItem(draftKey(instructions.path));
				} catch {}
			}, [instructions]);
			const confirmReplacement = (0, react.useCallback)((base) => {
				return window.confirm(anyDirty ? `${base}\n\n${t("discardWarning")}` : base);
			}, [anyDirty, t]);
			const saveGlobal = (0, react.useCallback)(async () => {
				if (instructions === null || !globalDirty || overLimit || busy !== null) return;
				setBusy("save-global");
				setNotice(null);
				try {
					const result = await writeInstructions(globalDraft, instructions.revision);
					clearStoredDraft();
					setInstructions({
						...instructions,
						text: globalDraft,
						revision: result.revision,
						hasBackup: result.hasBackup,
						active: null
					});
					if (selectedTemplate !== null) setTemplateRevision(result.revision);
					setConflictDraft(null);
					setNotice({
						kind: "ok",
						text: t("savedNotice")
					});
					await refreshLists(result.revision);
				} catch (error) {
					handleFailure(error, globalDraft);
				} finally {
					setBusy(null);
				}
			}, [
				busy,
				clearStoredDraft,
				globalDirty,
				globalDraft,
				handleFailure,
				instructions,
				overLimit,
				refreshLists,
				selectedTemplate,
				t
			]);
			const saveSelectedTemplate = (0, react.useCallback)(async () => {
				if (instructions === null || selectedTemplate === null || templateRevision === null || !templateDirty || templateOverLimit || busy !== null) return;
				setBusy("save-template");
				setNotice(null);
				try {
					const result = await updateTemplate(selectedTemplate, templateDraft, templateRevision);
					setInstructions({
						...instructions,
						revision: result.revision
					});
					setTemplateSaved(templateDraft);
					setTemplateRevision(result.revision);
					setConflictDraft(null);
					setNotice({
						kind: "ok",
						text: t("templateSaved", { name: selectedTemplate })
					});
					await refreshLists(result.revision);
				} catch (error) {
					handleFailure(error, templateDraft);
				} finally {
					setBusy(null);
				}
			}, [
				busy,
				handleFailure,
				instructions,
				refreshLists,
				selectedTemplate,
				t,
				templateDirty,
				templateDraft,
				templateOverLimit,
				templateRevision
			]);
			(0, react.useEffect)(() => {
				const onKeyDown = (event) => {
					if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
					event.preventDefault();
					if (templatePanel.current?.contains(document.activeElement)) saveSelectedTemplate();
					else saveGlobal();
				};
				window.addEventListener("keydown", onKeyDown);
				return () => window.removeEventListener("keydown", onKeyDown);
			}, [saveGlobal, saveSelectedTemplate]);
			const focusGlobalEditor = () => {
				requestAnimationFrame(() => {
					(globalSection.current?.querySelector("textarea, [tabindex=\"-1\"]"))?.focus();
				});
			};
			const discardGlobal = () => {
				if (instructions === null) return;
				clearStoredDraft();
				setGlobalDraft(instructions.text);
				setConflictDraft(null);
				setNotice({
					kind: "ok",
					text: t("discardedNotice")
				});
			};
			const undoGlobal = async () => {
				if (instructions === null || busy !== null || !instructions.hasBackup || !confirmReplacement(t("confirmUndo"))) return;
				setBusy("undo");
				try {
					await restoreInstructions(instructions.revision);
					clearStoredDraft();
					setSelectedTemplate(null);
					setConflictDraft(null);
					if (await loadEditable(false)) {
						focusGlobalEditor();
						setNotice({
							kind: "ok",
							text: t("undoNotice")
						});
					}
				} catch (error) {
					handleFailure(error, globalDraft);
				} finally {
					setBusy(null);
				}
			};
			const createTemplate = async () => {
				const name = newTemplateName.trim();
				if (instructions === null || !nameValid || overLimit || busy !== null) return;
				if (templateDirty && !window.confirm(t("discardWarning"))) return;
				setBusy("create-template");
				try {
					const result = await saveTemplate(name, globalDraft, instructions.revision);
					setInstructions({
						...instructions,
						revision: result.revision
					});
					setNewTemplateName("");
					setSelectedTemplate(name);
					setTemplateDraft(globalDraft);
					setTemplateSaved(globalDraft);
					setTemplateRevision(result.revision);
					setTemplateMode("edit");
					setNotice({
						kind: "ok",
						text: t("templateCreated", { name })
					});
					await refreshLists(result.revision);
					requestAnimationFrame(() => templateArea.current?.focus());
				} catch (error) {
					handleFailure(error, globalDraft);
				} finally {
					setBusy(null);
				}
			};
			const openTemplate = async (name) => {
				if (busy !== null) return;
				if (selectedTemplate === name) {
					if (templateDirty && !window.confirm(t("discardWarning"))) return;
					setSelectedTemplate(null);
					return;
				}
				if (templateDirty && !window.confirm(t("discardWarning"))) return;
				setBusy(`read-template:${name}`);
				try {
					const result = await readTemplate(name);
					if (instructions !== null && result.revision !== instructions.revision) {
						handleFailure(new ApiError("REVISION_CONFLICT", "template changed while loading", 409), templateDraft);
						return;
					}
					setSelectedTemplate(name);
					setTemplateDraft(result.text);
					setTemplateSaved(result.text);
					setTemplateRevision(result.revision);
					setTemplateMode("edit");
				} catch (error) {
					setNotice({
						kind: "error",
						text: t("previewFailed", { message: message(error) })
					});
				} finally {
					setBusy(null);
				}
			};
			const activate = async (name) => {
				if (instructions === null || busy !== null || !confirmReplacement(t("confirmActivate", { name }))) return;
				setBusy(`activate:${name}`);
				try {
					await activateTemplate(name, instructions.revision);
					clearStoredDraft();
					setSelectedTemplate(null);
					setConflictDraft(null);
					if (await loadEditable(false)) {
						focusGlobalEditor();
						setNotice({
							kind: "ok",
							text: t("templateActivated", { name })
						});
					}
				} catch (error) {
					handleFailure(error, globalDraft);
				} finally {
					setBusy(null);
				}
			};
			const removeTemplate = async (name) => {
				if (instructions === null || busy !== null) return;
				const warning = selectedTemplate === name && templateDirty ? `\n\n${t("discardWarning")}` : "";
				if (!window.confirm(`${t("confirmDelete", { name })}${warning}`)) return;
				setBusy(`delete:${name}`);
				try {
					const result = await deleteTemplate(name, instructions.revision);
					setInstructions({
						...instructions,
						revision: result.revision,
						active: result.active
					});
					if (selectedTemplate === name) setSelectedTemplate(null);
					else if (selectedTemplate !== null) setTemplateRevision(result.revision);
					setNotice({
						kind: "ok",
						text: t("templateDeleted", { name })
					});
					await refreshLists(result.revision);
					requestAnimationFrame(() => templateNameInput.current?.focus());
				} catch (error) {
					handleFailure(error, templateDraft);
				} finally {
					setBusy(null);
				}
			};
			const openHistory = async (entry) => {
				if (busy !== null) return;
				if (selectedHistory === entry.id) {
					setSelectedHistory(null);
					setHistoryPreview("");
					return;
				}
				setBusy(`history-preview:${entry.id}`);
				try {
					const result = await readHistory(entry.id);
					if (instructions !== null && result.revision !== instructions.revision) {
						handleFailure(new ApiError("REVISION_CONFLICT", "history changed while loading", 409), globalDraft);
						return;
					}
					setSelectedHistory(entry.id);
					setHistoryPreview(result.text);
				} catch (error) {
					setNotice({
						kind: "error",
						text: t("previewFailed", { message: message(error) })
					});
				} finally {
					setBusy(null);
				}
			};
			const restoreHistoryEntry = async (entry) => {
				if (instructions === null || busy !== null || !confirmReplacement(t("confirmRestore", { time: formatTime(entry.savedAt) }))) return;
				setBusy(`history-restore:${entry.id}`);
				try {
					await restoreHistory(entry.id, instructions.revision);
					clearStoredDraft();
					setSelectedTemplate(null);
					setSelectedHistory(null);
					setConflictDraft(null);
					if (await loadEditable(false)) {
						focusGlobalEditor();
						setNotice({
							kind: "ok",
							text: t("historyRestored")
						});
					}
				} catch (error) {
					handleFailure(error, globalDraft);
				} finally {
					setBusy(null);
				}
			};
			const exportAll = async () => {
				if (busy !== null) return;
				setBusy("export");
				try {
					const result = await exportBundle();
					downloadJson(`dsh-instructions-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`, result.bundle);
					setNotice({
						kind: "ok",
						text: anyDirty ? t("exportSavedOnly") : t("exported")
					});
				} catch (error) {
					setNotice({
						kind: "error",
						text: t("failed", { message: message(error) })
					});
				} finally {
					setBusy(null);
				}
			};
			const handleImportFile = async (file) => {
				if (instructions === null || busy !== null) return;
				if (file.size > instructions.maxImportBytes) {
					setNotice({
						kind: "error",
						text: t("importTooLarge", { limit: formatBytes(instructions.maxImportBytes) })
					});
					return;
				}
				let bundle;
				try {
					bundle = JSON.parse(await file.text());
				} catch {
					setNotice({
						kind: "error",
						text: t("invalidJson")
					});
					return;
				}
				const candidate = typeof bundle === "object" && bundle !== null ? bundle : {};
				const confirmText = t("confirmImport", {
					templates: Array.isArray(candidate.templates) ? candidate.templates.length : 0,
					history: Array.isArray(candidate.history) ? candidate.history.length : 0,
					currentChange: typeof candidate.current !== "string" || candidate.current !== instructions.text ? t("currentWillChange") : t("currentWillStay")
				});
				if (!confirmReplacement(confirmText)) return;
				setBusy("import");
				try {
					const result = await importBundle(bundle, instructions.revision);
					clearStoredDraft();
					setSelectedTemplate(null);
					setSelectedHistory(null);
					setConflictDraft(null);
					if (await loadEditable(false)) {
						focusGlobalEditor();
						setNotice({
							kind: "ok",
							text: t("imported", { items: result.imported })
						});
					}
				} catch (error) {
					handleFailure(error, globalDraft);
				} finally {
					setBusy(null);
				}
			};
			const copyConflictDraft = async () => {
				if (conflictDraft === null) return;
				try {
					await navigator.clipboard.writeText(conflictDraft);
					setNotice({
						kind: "ok",
						text: t("draftCopied")
					});
				} catch {
					setNotice({
						kind: "error",
						text: t("copyFailed")
					});
				}
			};
			const reloadLatest = async () => {
				setBusy("reload");
				setSelectedTemplate(null);
				setSelectedHistory(null);
				try {
					if (await loadEditable(false)) setNotice({
						kind: "ok",
						text: t("latestLoaded")
					});
				} finally {
					setBusy(null);
				}
			};
			const budgetPercent = Math.min(100, globalBytes / maxBytes * 100);
			const templateBudgetPercent = Math.min(100, utf8Bytes(templateDraft) / maxBytes * 100);
			const budgetState = overLimit ? "over" : nearLimit ? "near" : "ok";
			const statusText = overLimit ? t("overLimit") : nearLimit ? t("nearLimit") : null;
			const globalCount = t("bytesCount", {
				characters: Array.from(globalDraft).length,
				bytes: formatBytes(globalBytes),
				limit: formatBytes(maxBytes)
			});
			const templateCount = t("bytesCount", {
				characters: Array.from(templateDraft).length,
				bytes: formatBytes(utf8Bytes(templateDraft)),
				limit: formatBytes(maxBytes)
			});
			const activeLabel = instructions?.active === null ? t("manualMode") : t("activeTemplate", { name: instructions?.active ?? "" });
			const sortedProjects = (0, react.useMemo)(() => [...projects].sort((a, b) => a.title.localeCompare(b.title)), [projects]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cinstr-page",
				children: [
					notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cinstr-notice",
						"data-kind": notice.kind,
						role: notice.kind === "error" ? "alert" : "status",
						children: notice.text
					}),
					conflictDraft !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cinstr-conflict",
						role: "alert",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("conflictTitle") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cinstr-desc",
								children: t("conflictBody")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cinstr-actions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "cinstr-button cinstr-button-secondary",
									type: "button",
									onClick: () => void copyConflictDraft(),
									children: t("copyDraft")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "cinstr-button",
									type: "button",
									disabled: busy !== null,
									onClick: () => void reloadLatest(),
									children: t("reloadLatest")
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "cinstr-section",
						"aria-labelledby": "cinstr-global-title",
						ref: globalSection,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cinstr-section-head",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "cinstr-eyebrow",
									children: t("globalEyebrow")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
									className: "cinstr-heading",
									id: "cinstr-global-title",
									tabIndex: -1,
									children: t("globalTitle")
								})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModeTabs, {
									mode: globalMode,
									setMode: setGlobalMode,
									t
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cinstr-desc",
								children: t("globalDesc")
							}),
							loading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cinstr-meta",
								"aria-live": "polite",
								children: t("loading")
							}),
							loadError !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cinstr-row",
								role: "alert",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cinstr-notice",
									"data-kind": "error",
									children: t("loadFailed", { message: loadError })
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "cinstr-button cinstr-button-secondary",
									type: "button",
									onClick: () => void loadEditable(true),
									children: t("retry")
								})]
							}),
							instructions !== null && globalMode === "edit" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "cinstr-editor",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									className: "cinstr-area",
									value: globalDraft,
									onChange: (event) => {
										setGlobalDraft(event.target.value);
										setNotice(null);
									},
									placeholder: t("globalPlaceholder"),
									spellCheck: false,
									"aria-label": t("globalAria")
								})
							}),
							instructions !== null && globalMode === "preview" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "cinstr-editor",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MarkdownPreview, {
									text: globalDraft,
									t
								})
							}),
							instructions !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "cinstr-budget",
									"aria-hidden": "true",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "cinstr-budget-fill",
										"data-state": budgetState,
										style: { width: `${budgetPercent}%` }
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "cinstr-actions",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "cinstr-button",
											type: "button",
											disabled: !globalDirty || overLimit || busy !== null,
											onClick: () => void saveGlobal(),
											children: busy === "save-global" ? t("saving") : t("save")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "cinstr-button cinstr-button-secondary",
											type: "button",
											disabled: !globalDirty || busy !== null,
											onClick: discardGlobal,
											children: t("discard")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "cinstr-button cinstr-button-secondary",
											type: "button",
											disabled: !instructions.hasBackup || busy !== null,
											onClick: () => void undoGlobal(),
											children: busy === "undo" ? t("undoing") : t("undo")
										}),
										globalDirty && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cinstr-warning",
											children: t("unsaved")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "cinstr-count",
											children: [globalCount, statusText === null ? "" : ` · ${statusText}`]
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "cinstr-meta",
									children: activeLabel
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "cinstr-mono",
									children: t("storagePath", { path: instructions.path })
								})
							] })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "cinstr-section",
						"aria-labelledby": "cinstr-templates-title",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cinstr-section-head",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "cinstr-eyebrow",
									children: t("templatesEyebrow")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
									className: "cinstr-heading",
									id: "cinstr-templates-title",
									children: t("templatesTitle")
								})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "cinstr-actions",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "cinstr-button cinstr-button-secondary",
											type: "button",
											disabled: busy !== null,
											onClick: () => void exportAll(),
											children: t("exportAll")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											className: "cinstr-button cinstr-button-secondary",
											type: "button",
											disabled: busy !== null,
											onClick: () => fileInput.current?.click(),
											children: t("importAll")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: "cinstr-sr-only",
											ref: fileInput,
											type: "file",
											accept: "application/json,.json",
											"aria-label": t("importAll"),
											tabIndex: -1,
											onChange: (event) => {
												const file = event.target.files?.[0];
												if (file !== void 0) handleImportFile(file);
												event.target.value = "";
											}
										})
									]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cinstr-desc",
								children: t("templatesDesc")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cinstr-row",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
										className: "cinstr-sr-only",
										htmlFor: "cinstr-template-name",
										children: t("templateName")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: "cinstr-input",
										id: "cinstr-template-name",
										ref: templateNameInput,
										value: newTemplateName,
										onChange: (event) => setNewTemplateName(event.target.value),
										placeholder: t("templateNamePlaceholder"),
										"aria-describedby": newTemplateName !== "" && !nameValid ? "cinstr-name-error" : void 0
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										className: "cinstr-button",
										type: "button",
										disabled: !nameValid || overLimit || instructions === null || busy !== null,
										onClick: () => void createTemplate(),
										children: busy === "create-template" ? t("creating") : t("createFromCurrent")
									})
								]
							}),
							newTemplateName !== "" && !nameValid && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cinstr-notice",
								"data-kind": "error",
								id: "cinstr-name-error",
								children: t("nameInvalid")
							}),
							templates.length === 0 && !loading && loadError === "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cinstr-empty",
								children: t("noTemplates")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: "cinstr-list",
								children: templates.map((template) => {
									const expanded = selectedTemplate === template.name;
									const active = instructions?.active === template.name;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
										className: "cinstr-item",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "cinstr-item-top",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "cinstr-item-name",
													children: template.name
												}),
												active && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "cinstr-active",
													children: t("currentActive")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "cinstr-item-meta",
													children: t("itemMeta", {
														size: formatBytes(template.size),
														time: formatTime(template.updatedAt)
													})
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: "cinstr-link-button",
													type: "button",
													"aria-expanded": expanded,
													onClick: () => void openTemplate(template.name),
													children: expanded ? t("closeTemplate") : t("openTemplate")
												}),
												!active && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: "cinstr-link-button",
													type: "button",
													disabled: busy !== null,
													onClick: () => void activate(template.name),
													children: t("activate")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: "cinstr-link-button",
													type: "button",
													disabled: busy !== null,
													onClick: () => void removeTemplate(template.name),
													children: t("delete")
												})
											]
										}), expanded && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "cinstr-item-body",
											ref: templatePanel,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "cinstr-toolbar",
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
														className: "cinstr-subheading",
														children: t("templateEditorTitle", { name: template.name })
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModeTabs, {
														mode: templateMode,
														setMode: setTemplateMode,
														t
													})]
												}),
												templateMode === "edit" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: "cinstr-editor",
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
														className: "cinstr-area cinstr-area-small",
														ref: templateArea,
														value: templateDraft,
														onChange: (event) => setTemplateDraft(event.target.value),
														spellCheck: false,
														"aria-label": t("templateAria", { name: template.name })
													})
												}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: "cinstr-editor",
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MarkdownPreview, {
														text: templateDraft,
														compact: true,
														t
													})
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: "cinstr-budget",
													"aria-hidden": "true",
													children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
														className: "cinstr-budget-fill",
														"data-state": templateOverLimit ? "over" : "ok",
														style: { width: `${templateBudgetPercent}%` }
													})
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "cinstr-actions",
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															className: "cinstr-button",
															type: "button",
															disabled: !templateDirty || templateOverLimit || busy !== null,
															onClick: () => void saveSelectedTemplate(),
															children: busy === "save-template" ? t("saving") : t("save")
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															className: "cinstr-button cinstr-button-secondary",
															type: "button",
															disabled: !templateDirty || busy !== null,
															onClick: () => setTemplateDraft(templateSaved),
															children: t("discard")
														}),
														templateDirty && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: "cinstr-warning",
															children: t("unsaved")
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
															className: "cinstr-count",
															children: [templateCount, templateOverLimit ? ` · ${t("overLimit")}` : ""]
														})
													]
												})
											]
										})]
									}, template.name);
								})
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "cinstr-section",
						"aria-labelledby": "cinstr-history-title",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "cinstr-section-head",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "cinstr-eyebrow",
									children: t("historyEyebrow")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
									className: "cinstr-heading",
									id: "cinstr-history-title",
									children: t("historyTitle")
								})] })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cinstr-desc",
								children: t("historyDesc")
							}),
							history.length === 0 && !loading && loadError === "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cinstr-empty",
								children: t("noHistory")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: "cinstr-list",
								children: history.map((entry) => {
									const expanded = selectedHistory === entry.id;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
										className: "cinstr-item",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "cinstr-item-top",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "cinstr-item-name",
													children: formatTime(entry.savedAt)
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "cinstr-item-meta",
													children: formatBytes(entry.size)
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: "cinstr-link-button",
													type: "button",
													"aria-expanded": expanded,
													onClick: () => void openHistory(entry),
													children: expanded ? t("close") : t("view")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: "cinstr-link-button",
													type: "button",
													disabled: busy !== null,
													onClick: () => void restoreHistoryEntry(entry),
													children: t("restore")
												})
											]
										}), expanded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "cinstr-item-body",
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MarkdownPreview, {
												text: historyPreview,
												compact: true,
												t
											})
										})]
									}, entry.id);
								})
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "cinstr-section",
						"aria-labelledby": "cinstr-overview-title",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "cinstr-section-head",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "cinstr-eyebrow",
									children: t("overviewEyebrow")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
									className: "cinstr-heading",
									id: "cinstr-overview-title",
									children: t("overviewTitle")
								})] })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cinstr-desc",
								children: t("overviewDesc")
							}),
							overviewLoading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cinstr-meta",
								children: t("loading")
							}),
							overviewError !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cinstr-notice",
								"data-kind": "error",
								role: "alert",
								children: t("loadFailed", { message: overviewError })
							}),
							sortedProjects.length === 0 && !overviewLoading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "cinstr-empty",
								children: t("noProjects")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
								className: "cinstr-list",
								children: sortedProjects.map((project) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
									className: "cinstr-item-top",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cinstr-item-name",
											children: project.title
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cinstr-status",
											"data-status": project.status,
											children: t(project.status)
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cinstr-mono",
											style: { width: "100%" },
											children: project.agentsPath
										})
									]
								}, project.path))
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cinstr-footer",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "cinstr-meta",
							children: t("footer")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "cinstr-button cinstr-button-secondary",
							type: "button",
							disabled: busy !== null,
							onClick: () => {
								loadEditable(true);
								loadOverview();
							},
							children: loading ? t("refreshing") : t("refresh")
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** Required services. */
		const inject = ["slots", "locale"];
		/**
		* Register the custom-instructions settings page.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(LOCALE_NS, DICTIONARIES), "custom-instructions: locale");
			ctx.effect(() => {
				const style = document.createElement("style");
				style.dataset.plugin = "@huanghai-lab/dsh-custom-instructions";
				style.textContent = CSS;
				document.head.appendChild(style);
				return () => style.remove();
			}, "custom-instructions: styles");
			const t = ctx.locale.bind(LOCALE_NS);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "custom-instructions",
				order: 25,
				label: () => t("sectionLabel"),
				locale: LOCALE_NS
			}, CustomInstructionsSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map