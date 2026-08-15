window.__ModuleLoader__.load({
	id: "@huanghai-lab/dsh-custom-instructions",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/api.ts
		/**
		* Browser-side API client for the /api/dsh-custom-instructions route family.
		* Plain fetch, same origin — the only data path the settings page uses.
		*/
		/** Route prefix the host half serves. */
		const ROUTE_PREFIX = "/api/dsh-custom-instructions";
		/** Parse a JSON response, throwing on non-2xx statuses. */
		async function request(method, body) {
			const response = await fetch(ROUTE_PREFIX, {
				method,
				headers: body === void 0 ? void 0 : { "content-type": "application/json" },
				body: body === void 0 ? void 0 : JSON.stringify(body)
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
			return result;
		}
		/** Read the current global instructions (empty string when none exist). */
		async function readInstructions() {
			return request("GET");
		}
		/** Replace the global instructions. */
		async function writeInstructions(text) {
			return request("PUT", { text });
		}
		/** Restore the one-generation backup (undo the last save). */
		async function restoreInstructions() {
			return request("POST", { action: "restore" });
		}
		//#endregion
		//#region src/client/InstructionsSection.tsx
		/**
		* The custom-instructions settings page body (JSX component).
		*/
		/** Plugin CSS, scoped by a package-unique class prefix. */
		const CSS = `
.custinstr-page { display: flex; flex-direction: column; gap: 12px; width: min(100%, 720px); color: var(--dsw-alias-label-primary); }
.custinstr-title { margin: 0; font-size: 18px; font-weight: 600; }
.custinstr-desc { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.custinstr-area { box-sizing: border-box; width: 100%; min-height: 340px; resize: vertical; padding: 14px; font: inherit; line-height: 1.6; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); outline: none; transition: border-color 120ms ease, box-shadow 120ms ease; }
.custinstr-area:focus { border-color: var(--dsw-alias-brand-primary); }
.custinstr-area:focus-visible { box-shadow: 0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
.custinstr-area:disabled { opacity: 0.6; }
.custinstr-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.custinstr-save { min-width: 72px; height: 34px; padding: 0 18px; border: none; border-radius: 17px; background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-foreground, #fff); cursor: pointer; font-size: 13px; transition: opacity 120ms ease, transform 120ms ease; }
.custinstr-save:not(:disabled):hover { opacity: 0.9; }
.custinstr-save:not(:disabled):active { transform: translateY(1px); }
.custinstr-save:disabled { opacity: 0.5; cursor: default; }
.custinstr-restore { height: 34px; padding: 0 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 17px; background: transparent; color: var(--dsw-alias-label-primary); cursor: pointer; font-size: 13px; }
.custinstr-restore:not(:disabled):hover { background: var(--dsw-alias-bg-layer-2); }
.custinstr-restore:disabled { opacity: 0.5; cursor: default; }
.custinstr-ok { font-size: 12px; color: var(--dsw-alias-state-success-primary); }
.custinstr-err { font-size: 12px; color: var(--dsw-alias-state-error-primary); }
.custinstr-meta { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.custinstr-count { margin-left: auto; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.custinstr-count-over { color: var(--dsw-alias-state-error-primary); }
.custinstr-count-near { color: var(--dsw-alias-state-warn-primary); }
.custinstr-dirty { font-size: 12px; color: var(--dsw-alias-state-warn-primary); }
.custinstr-loading { font-size: 13px; color: var(--dsw-alias-label-secondary); }
`;
		/** UTF-8 byte length of a string (the DSH loader's actual budget unit). */
		function utf8Bytes(value) {
			return new TextEncoder().encode(value).length;
		}
		/** The settings page body. */
		function CustomInstructionsSection() {
			const [text, setText] = (0, react.useState)("");
			const [savedText, setSavedText] = (0, react.useState)("");
			const [loaded, setLoaded] = (0, react.useState)(false);
			const [saving, setSaving] = (0, react.useState)(false);
			const [restoring, setRestoring] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)(null);
			const [path, setPath] = (0, react.useState)("");
			const [maxBytes, setMaxBytes] = (0, react.useState)(65536);
			const noticeTimer = (0, react.useRef)(void 0);
			/** Drop any transient notice (success text auto-clears after a while). */
			const clearNoticeSoon = (0, react.useCallback)(() => {
				if (noticeTimer.current !== void 0) window.clearTimeout(noticeTimer.current);
				noticeTimer.current = window.setTimeout(() => setNotice(null), 3e3);
			}, []);
			(0, react.useEffect)(() => {
				let cancelled = false;
				readInstructions().then((res) => {
					if (cancelled) return;
					if (res.ok) {
						setText(res.text ?? "");
						setSavedText(res.text ?? "");
						setPath(res.path ?? "");
						if (res.maxBytes !== void 0) setMaxBytes(res.maxBytes);
					} else setError(res.error ?? "读取失败，请刷新页面重试");
					setLoaded(true);
				}).catch(() => {
					if (cancelled) return;
					setError("读取失败，请刷新页面重试");
					setLoaded(true);
				});
				return () => {
					cancelled = true;
					if (noticeTimer.current !== void 0) window.clearTimeout(noticeTimer.current);
				};
			}, []);
			const dirty = loaded && text !== savedText;
			const bytes = utf8Bytes(text);
			const overLimit = bytes > maxBytes;
			const nearLimit = !overLimit && bytes > maxBytes * .9;
			const save = (0, react.useCallback)(() => {
				if (saving || !loaded || overLimit) return;
				setSaving(true);
				setNotice(null);
				writeInstructions(text).then((res) => {
					setSaving(false);
					if (res.ok) {
						setSavedText(text);
						setError("");
						setNotice({
							kind: "ok",
							text: "已保存，新会话自动生效"
						});
						clearNoticeSoon();
					} else setNotice({
						kind: "err",
						text: `保存失败: ${res.error ?? "未知错误"}`
					});
				}).catch(() => {
					setSaving(false);
					setNotice({
						kind: "err",
						text: "保存失败，请检查连接后重试"
					});
				});
			}, [
				saving,
				loaded,
				overLimit,
				text,
				clearNoticeSoon
			]);
			/** Undo the last save by restoring the one-generation backup. */
			const restore = (0, react.useCallback)(() => {
				if (restoring || !loaded) return;
				setRestoring(true);
				setNotice(null);
				restoreInstructions().then((res) => {
					setRestoring(false);
					if (res.ok) {
						setText(res.text ?? "");
						setSavedText(res.text ?? "");
						setNotice({
							kind: "ok",
							text: "已恢复上次保存前的内容"
						});
						clearNoticeSoon();
					} else setNotice({
						kind: "err",
						text: `撤销失败: ${res.error ?? "未知错误"}`
					});
				}).catch(() => {
					setRestoring(false);
					setNotice({
						kind: "err",
						text: "撤销失败，请检查连接后重试"
					});
				});
			}, [
				restoring,
				loaded,
				clearNoticeSoon
			]);
			(0, react.useEffect)(() => {
				const onKeyDown = (event) => {
					if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
						event.preventDefault();
						save();
					}
				};
				window.addEventListener("keydown", onKeyDown);
				return () => window.removeEventListener("keydown", onKeyDown);
			}, [save]);
			const countClass = overLimit ? "custinstr-count custinstr-count-over" : nearLimit ? "custinstr-count custinstr-count-near" : "custinstr-count";
			const limitNote = overLimit ? `超出上限，保存已禁用` : nearLimit ? "接近上限" : "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "custinstr-page",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: "custinstr-title",
						children: "自定义指令"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "custinstr-desc",
						children: "向此主机上所有聊天提供额外说明和上下文，保存后新会话自动生效。"
					}),
					!loaded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "custinstr-loading",
						"aria-live": "polite",
						children: "正在读取指令…"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						className: "custinstr-area",
						value: text,
						onChange: (e) => {
							setText(e.target.value);
							setNotice(null);
						},
						placeholder: "在此输入对所有聊天生效的指令……",
						disabled: !loaded,
						spellCheck: false,
						"aria-label": "自定义指令",
						"aria-describedby": "custinstr-help"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						id: "custinstr-help",
						className: "custinstr-desc",
						children: "内容会写入当前主机的 AGENTS.md，仅对新会话生效。快捷键 Ctrl+S 保存；每次保存会把上一版内容备份为 AGENTS.md.bak，可用「撤销上次保存」恢复。"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "custinstr-row",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "custinstr-save",
								onClick: save,
								disabled: saving || !loaded || error !== "" || overLimit,
								children: saving ? "保存中…" : "保存"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "custinstr-restore",
								onClick: restore,
								disabled: restoring || !loaded,
								children: restoring ? "恢复中…" : "撤销上次保存"
							}),
							dirty && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "custinstr-dirty",
								"aria-live": "polite",
								children: "有未保存的更改"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: countClass,
								"aria-live": "polite",
								children: [
									Array.from(text).length,
									" 字符 / ",
									bytes,
									" / ",
									maxBytes,
									" 字节",
									limitNote !== "" && `（${limitNote}）`
								]
							}),
							notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: notice.kind === "ok" ? "custinstr-ok" : "custinstr-err",
								"aria-live": "polite",
								children: notice.text
							})
						]
					}),
					error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "custinstr-err",
						role: "alert",
						children: error
					}),
					path !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "custinstr-meta",
						children: ["存储位置: ", path]
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** Required services. */
		const inject = ["slots"];
		/**
		* Register the custom-instructions settings page.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => {
				const style = document.createElement("style");
				style.dataset.plugin = "@huanghai-lab/dsh-custom-instructions";
				style.textContent = CSS;
				document.head.appendChild(style);
				return () => style.remove();
			}, "custom-instructions: styles");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "custom-instructions",
				order: 25,
				label: "自定义指令"
			}, CustomInstructionsSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map