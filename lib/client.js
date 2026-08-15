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
		* Plain fetch, same origin — the only data path the instruction center uses.
		*/
		/** Route prefix the host half serves. */
		const ROUTE_PREFIX = "/api/dsh-custom-instructions";
		/** Parse a JSON response, throwing on non-2xx statuses. */
		async function request(method, path, body) {
			const response = await fetch(`${ROUTE_PREFIX}${path}`, {
				method,
				headers: body === void 0 ? void 0 : { "content-type": "application/json" },
				body: body === void 0 ? void 0 : JSON.stringify(body)
			});
			const result = await response.json();
			if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : `HTTP ${response.status}`);
			return result;
		}
		/** Read the current global instructions (empty string when none exist). */
		async function readInstructions() {
			return await request("GET", "");
		}
		/** Replace the global instructions. */
		async function writeInstructions(text) {
			return await request("PUT", "", { text });
		}
		/** Restore the one-generation backup (undo the last save). */
		async function restoreInstructions() {
			return await request("POST", "", { action: "restore" });
		}
		/** List templates plus the active template name. */
		async function listTemplates() {
			return await request("GET", "/templates");
		}
		/** Create or update a named template. */
		async function saveTemplate(name, text) {
			await request("POST", "/templates", {
				name,
				text
			});
		}
		/** Delete a named template. */
		async function deleteTemplate(name) {
			await request("DELETE", `/templates/${encodeURIComponent(name)}`);
		}
		/** Activate a template (copies it into the global instructions). */
		async function activateTemplate(name) {
			return await request("POST", "/templates/activate", { name });
		}
		/** List version history (newest first). */
		async function listHistory() {
			return await request("GET", "/history");
		}
		/** Restore a history snapshot as the current content. */
		async function restoreHistory(id) {
			return await request("POST", "/history/restore", { id });
		}
		/** Project-level instruction overview. */
		async function projectView() {
			return await request("GET", "/project");
		}
		/** Active preset persona overview. */
		async function presetView() {
			return await request("GET", "/preset");
		}
		/** Export the whole instruction center as a JSON bundle. */
		async function exportBundle() {
			return await request("POST", "/export", {});
		}
		/** Import a bundle. */
		async function importBundle(bundle) {
			return await request("POST", "/import", { bundle });
		}
		//#endregion
		//#region src/client/InstructionsSection.tsx
		/**
		* The instruction center settings page body (JSX component).
		*
		* Sections: global instructions editor, instruction templates (multi-set
		* switching), version history, project-level instructions view, and the
		* active preset persona overview. Styled after the official settings pages
		* (theme variables, card rows, section headings).
		*/
		/** Plugin CSS, scoped by a package-unique class prefix. */
		const CSS = `
.cinstr-page { display: flex; flex-direction: column; gap: 16px; width: min(100%, 720px); color: var(--dsw-alias-label-primary); }
.cinstr-section { border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; background: var(--dsw-alias-bg-layer-1); }
.cinstr-section-head { margin: 0; font-size: 14px; font-weight: 600; }
.cinstr-desc { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.cinstr-area { box-sizing: border-box; width: 100%; min-height: 240px; resize: vertical; padding: 12px; font: inherit; line-height: 1.6; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); outline: none; transition: border-color 120ms ease, box-shadow 120ms ease; }
.cinstr-area:focus { border-color: var(--dsw-alias-brand-primary); }
.cinstr-area:disabled { opacity: 0.6; }
.cinstr-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.cinstr-btn { height: 32px; padding: 0 16px; border: none; border-radius: 16px; background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-foreground, #fff); cursor: pointer; font-size: 13px; }
.cinstr-btn:not(:disabled):hover { opacity: 0.9; }
.cinstr-btn:disabled { opacity: 0.5; cursor: default; }
.cinstr-btn-ghost { height: 32px; padding: 0 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 16px; background: transparent; color: var(--dsw-alias-label-primary); cursor: pointer; font-size: 13px; }
.cinstr-btn-ghost:not(:disabled):hover { background: var(--dsw-alias-bg-layer-2); }
.cinstr-btn-ghost:disabled { opacity: 0.5; cursor: default; }
.cinstr-ok { font-size: 12px; color: var(--dsw-alias-state-success-primary); }
.cinstr-err { font-size: 12px; color: var(--dsw-alias-state-error-primary); }
.cinstr-meta { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.cinstr-count { margin-left: auto; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.cinstr-count-over { color: var(--dsw-alias-state-error-primary); }
.cinstr-count-near { color: var(--dsw-alias-state-warn-primary); }
.cinstr-dirty { font-size: 12px; color: var(--dsw-alias-state-warn-primary); }
.cinstr-loading { font-size: 13px; color: var(--dsw-alias-label-secondary); }
.cinstr-list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; list-style: none; }
.cinstr-item { display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 4px 8px; border-radius: 8px; }
.cinstr-item:hover { background: var(--dsw-alias-bg-layer-2); }
.cinstr-item-name { font-size: 13px; }
.cinstr-item-active { color: var(--dsw-alias-brand-primary); font-weight: 600; }
.cinstr-item-meta { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-left: auto; }
.cinstr-inline { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cinstr-input { height: 30px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; outline: none; }
.cinstr-input:focus { border-color: var(--dsw-alias-brand-primary); }
.cinstr-mono { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; color: var(--dsw-alias-label-secondary); word-break: break-all; }
.cinstr-empty { font-size: 12px; color: var(--dsw-alias-label-secondary); margin: 0; }
`;
		/** UTF-8 byte length of a string (the DSH loader's actual budget unit). */
		function utf8Bytes(value) {
			return new TextEncoder().encode(value).length;
		}
		/** Format a byte size for humans. */
		function formatBytes(value) {
			if (value < 1024) return `${value} B`;
			return `${(value / 1024).toFixed(1)} KB`;
		}
		/** Format an epoch timestamp as a local time string. */
		function formatTime(value) {
			return new Date(value).toLocaleString();
		}
		/** Download a JSON payload as a file. */
		function downloadJson(filename, payload) {
			const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = filename;
			anchor.click();
			URL.revokeObjectURL(url);
		}
		/** Global instructions editor section. */
		function GlobalSection(props) {
			const [text, setText] = (0, react.useState)("");
			const [savedText, setSavedText] = (0, react.useState)("");
			const [loaded, setLoaded] = (0, react.useState)(false);
			const [saving, setSaving] = (0, react.useState)(false);
			const [restoring, setRestoring] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)(null);
			const [path, setPath] = (0, react.useState)("");
			const [maxBytes, setMaxBytes] = (0, react.useState)(65536);
			const [hasBackup, setHasBackup] = (0, react.useState)(false);
			const noticeTimer = (0, react.useRef)(void 0);
			const clearNoticeSoon = (0, react.useCallback)(() => {
				if (noticeTimer.current !== void 0) window.clearTimeout(noticeTimer.current);
				noticeTimer.current = window.setTimeout(() => setNotice(null), 3e3);
			}, []);
			(0, react.useEffect)(() => {
				let cancelled = false;
				setLoaded(false);
				readInstructions().then((res) => {
					if (cancelled) return;
					setText(res.text ?? "");
					setSavedText(res.text ?? "");
					setPath(res.path ?? "");
					if (res.maxBytes !== void 0) setMaxBytes(res.maxBytes);
					setHasBackup(res.hasBackup === true);
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
			}, [props.refreshToken]);
			const dirty = loaded && text !== savedText;
			const bytes = utf8Bytes(text);
			const overLimit = bytes > maxBytes;
			const nearLimit = !overLimit && bytes > maxBytes * .9;
			const save = (0, react.useCallback)(() => {
				if (saving || !loaded || overLimit) return;
				setSaving(true);
				setNotice(null);
				writeInstructions(text).then(() => {
					setSaving(false);
					setSavedText(text);
					setError("");
					setHasBackup(true);
					setNotice({
						kind: "ok",
						text: "已保存，新会话自动生效"
					});
					clearNoticeSoon();
					props.onChanged();
				}).catch((e) => {
					setSaving(false);
					setNotice({
						kind: "err",
						text: `保存失败: ${String(e?.message ?? e)}`
					});
				});
			}, [
				saving,
				loaded,
				overLimit,
				text,
				clearNoticeSoon,
				props.onChanged
			]);
			const restore = (0, react.useCallback)(() => {
				if (restoring || !loaded) return;
				setRestoring(true);
				setNotice(null);
				restoreInstructions().then((res) => {
					setRestoring(false);
					setText(res.text ?? "");
					setSavedText(res.text ?? "");
					setNotice({
						kind: "ok",
						text: "已恢复上次保存前的内容"
					});
					clearNoticeSoon();
					props.onChanged();
				}).catch((e) => {
					setRestoring(false);
					setNotice({
						kind: "err",
						text: `撤销失败: ${String(e?.message ?? e)}`
					});
				});
			}, [
				restoring,
				loaded,
				clearNoticeSoon,
				props.onChanged
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "cinstr-section",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: "cinstr-section-head",
						children: "全局指令"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cinstr-desc",
						children: "对当前主机上所有聊天生效的指令，保存后新会话自动加载。"
					}),
					!loaded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cinstr-loading",
						"aria-live": "polite",
						children: "正在读取指令…"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
						className: "cinstr-area",
						value: text,
						onChange: (e) => {
							setText(e.target.value);
							setNotice(null);
						},
						placeholder: "在此输入对所有聊天生效的指令……",
						disabled: !loaded,
						spellCheck: false,
						"aria-label": "自定义指令"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cinstr-row",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "cinstr-btn",
								onClick: save,
								disabled: saving || !loaded || error !== "" || overLimit,
								children: saving ? "保存中…" : "保存"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "cinstr-btn-ghost",
								onClick: restore,
								disabled: restoring || !loaded || !hasBackup,
								children: restoring ? "恢复中…" : "撤销上次保存"
							}),
							dirty && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cinstr-dirty",
								"aria-live": "polite",
								children: "有未保存的更改"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: overLimit ? "cinstr-count cinstr-count-over" : nearLimit ? "cinstr-count cinstr-count-near" : "cinstr-count",
								"aria-live": "polite",
								children: [
									Array.from(text).length,
									" 字符 / ",
									formatBytes(bytes),
									" / ",
									formatBytes(maxBytes),
									overLimit ? "（超出上限）" : nearLimit ? "（接近上限）" : ""
								]
							}),
							notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: notice.kind === "ok" ? "cinstr-ok" : "cinstr-err",
								"aria-live": "polite",
								children: notice.text
							})
						]
					}),
					error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cinstr-err",
						role: "alert",
						children: error
					}),
					path !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "cinstr-meta",
						children: ["存储位置: ", path]
					})
				]
			});
		}
		/** Templates section: multi-set management, activation, import/export. */
		function TemplatesSection(props) {
			const [templates, setTemplates] = (0, react.useState)([]);
			const [active, setActive] = (0, react.useState)(null);
			const [loaded, setLoaded] = (0, react.useState)(false);
			const [notice, setNotice] = (0, react.useState)(null);
			const [newName, setNewName] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const reload = (0, react.useCallback)(() => {
				listTemplates().then((res) => {
					setTemplates(res.templates);
					setActive(res.active);
					setLoaded(true);
				}).catch((e) => {
					setLoaded(true);
					setNotice({
						kind: "err",
						text: `模板列表加载失败: ${String(e?.message ?? e)}`
					});
				});
			}, []);
			(0, react.useEffect)(() => {
				reload();
			}, [reload, props.refreshToken]);
			const create = () => {
				const name = newName.trim();
				if (name === "" || busy) return;
				setBusy(true);
				saveTemplate(name, "").then(() => {
					setNewName("");
					setBusy(false);
					setNotice({
						kind: "ok",
						text: `模板「${name}」已创建，点击激活即可切换到空指令集`
					});
					reload();
				}).catch((e) => {
					setBusy(false);
					setNotice({
						kind: "err",
						text: `创建失败: ${String(e?.message ?? e)}`
					});
				});
			};
			const activate = (name) => {
				if (busy) return;
				setBusy(true);
				setNotice(null);
				activateTemplate(name).then(() => {
					setBusy(false);
					setActive(name);
					setNotice({
						kind: "ok",
						text: `已激活模板「${name}」，全局指令已切换`
					});
					props.onChanged();
					reload();
				}).catch((e) => {
					setBusy(false);
					setNotice({
						kind: "err",
						text: `激活失败: ${String(e?.message ?? e)}`
					});
				});
			};
			const remove = (name) => {
				if (busy) return;
				setBusy(true);
				deleteTemplate(name).then(() => {
					setBusy(false);
					setNotice({
						kind: "ok",
						text: `模板「${name}」已删除`
					});
					reload();
				}).catch((e) => {
					setBusy(false);
					setNotice({
						kind: "err",
						text: `删除失败: ${String(e?.message ?? e)}`
					});
				});
			};
			const exportAll = () => {
				exportBundle().then((res) => {
					downloadJson(`dsh-instructions-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`, res.bundle);
					setNotice({
						kind: "ok",
						text: "已导出（模板 + 历史 + 当前内容）"
					});
				}).catch((e) => setNotice({
					kind: "err",
					text: `导出失败: ${String(e?.message ?? e)}`
				}));
			};
			const importAll = (file) => {
				const reader = new FileReader();
				reader.onload = () => {
					try {
						importBundle(JSON.parse(String(reader.result))).then((res) => {
							setNotice({
								kind: "ok",
								text: `已导入 ${res.imported} 项`
							});
							reload();
						}).catch((e) => setNotice({
							kind: "err",
							text: `导入失败: ${String(e?.message ?? e)}`
						}));
					} catch {
						setNotice({
							kind: "err",
							text: "导入失败: 文件不是有效的 JSON"
						});
					}
				};
				reader.readAsText(file);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "cinstr-section",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: "cinstr-section-head",
						children: "指令模板"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cinstr-desc",
						children: "保存多套指令集并按需切换；激活即替换全局指令（切换前自动入历史，可随时恢复）。"
					}),
					!loaded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cinstr-loading",
						children: "正在加载模板…"
					}) : null,
					templates.length === 0 && loaded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cinstr-empty",
						children: "还没有模板。新建一个模板，或把当前全局指令存为模板。"
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: "cinstr-list",
						children: templates.map((template) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							className: "cinstr-item",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: template.name === active ? "cinstr-item-name cinstr-item-active" : "cinstr-item-name",
									children: [template.name, template.name === active ? "（当前激活）" : ""]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "cinstr-item-meta",
									children: [
										formatBytes(template.size),
										" · ",
										formatTime(template.updatedAt)
									]
								}),
								template.name !== active && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "cinstr-btn-ghost",
									onClick: () => activate(template.name),
									disabled: busy,
									children: "激活"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: "cinstr-btn-ghost",
									onClick: () => remove(template.name),
									disabled: busy,
									children: "删除"
								})
							]
						}, template.name))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cinstr-inline",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: "cinstr-input",
								value: newName,
								onChange: (e) => setNewName(e.target.value),
								placeholder: "新模板名称（字母/数字/._-）",
								"aria-label": "新模板名称"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "cinstr-btn",
								onClick: create,
								disabled: busy || newName.trim() === "",
								children: "新建模板"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "cinstr-btn-ghost",
								onClick: exportAll,
								disabled: busy,
								children: "导出全部"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "cinstr-btn-ghost",
								style: { cursor: "pointer" },
								children: ["导入", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "file",
									accept: "application/json",
									style: { display: "none" },
									onChange: (e) => {
										const file = e.target.files?.[0];
										if (file !== void 0) importAll(file);
										e.target.value = "";
									}
								})]
							})
						]
					}),
					notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: notice.kind === "ok" ? "cinstr-ok" : "cinstr-err",
						"aria-live": "polite",
						children: notice.text
					})
				]
			});
		}
		/** Version history section. */
		function HistorySection(props) {
			const [history, setHistory] = (0, react.useState)([]);
			const [loaded, setLoaded] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [notice, setNotice] = (0, react.useState)(null);
			const reload = (0, react.useCallback)(() => {
				listHistory().then((res) => {
					setHistory(res.history);
					setLoaded(true);
				}).catch(() => setLoaded(true));
			}, []);
			(0, react.useEffect)(() => {
				reload();
			}, [reload, props.refreshToken]);
			const restore = (id) => {
				if (busy) return;
				setBusy(true);
				setNotice(null);
				restoreHistory(id).then(() => {
					setBusy(false);
					setNotice({
						kind: "ok",
						text: "已从历史版本恢复"
					});
					reload();
				}).catch((e) => {
					setBusy(false);
					setNotice({
						kind: "err",
						text: `恢复失败: ${String(e?.message ?? e)}`
					});
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "cinstr-section",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: "cinstr-section-head",
						children: "版本历史"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cinstr-desc",
						children: "每次保存（含模板激活）自动留档，可回退到任意历史版本。"
					}),
					!loaded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cinstr-loading",
						children: "正在加载历史…"
					}) : null,
					history.length === 0 && loaded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cinstr-empty",
						children: "还没有历史记录。保存一次后这里会留档。"
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: "cinstr-list",
						children: history.slice(0, 20).map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							className: "cinstr-item",
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
									className: "cinstr-btn-ghost",
									onClick: () => restore(entry.id),
									disabled: busy,
									children: "恢复"
								})
							]
						}, entry.id))
					}),
					notice !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: notice.kind === "ok" ? "cinstr-ok" : "cinstr-err",
						"aria-live": "polite",
						children: notice.text
					})
				]
			});
		}
		/** Project-level + persona overview section (read-only views). */
		function OverviewSection() {
			const [projects, setProjects] = (0, react.useState)([]);
			const [preset, setPreset] = (0, react.useState)(null);
			const [loaded, setLoaded] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				Promise.allSettled([projectView(), presetView()]).then((results) => {
					if (results[0].status === "fulfilled") setProjects(results[0].value.projects);
					if (results[1].status === "fulfilled") setPreset(results[1].value.view);
					setLoaded(true);
				});
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "cinstr-section",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: "cinstr-section-head",
						children: "生效范围与 Persona"
					}),
					!loaded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cinstr-loading",
						children: "正在加载概览…"
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cinstr-desc",
						children: "项目级指令（各工作区根目录的 AGENTS.md）："
					}),
					projects.length === 0 && loaded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cinstr-empty",
						children: "没有注册的工作区。"
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: "cinstr-list",
						children: projects.map((project) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							className: "cinstr-item",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cinstr-item-name",
									children: project.title
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cinstr-mono",
									children: project.path
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cinstr-item-meta",
									children: project.hasAgents ? "有项目级 AGENTS.md" : "无项目级指令"
								})
							]
						}, project.path))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cinstr-desc",
						children: "当前默认 agent preset 的 persona 概览（只读；编辑 preset 请用「Agent presets」设置页）："
					}),
					preset !== null && loaded ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "cinstr-meta",
						children: ["preset: ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "cinstr-mono",
							children: preset.preset
						})]
					}), preset.persona !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: "cinstr-mono",
						style: {
							margin: 0,
							whiteSpace: "pre-wrap",
							maxHeight: 200,
							overflow: "auto"
						},
						children: preset.persona.slice(0, 2e3)
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cinstr-empty",
						children: "该 preset 未声明 persona 段落。"
					})] }) : null,
					preset === null && loaded ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cinstr-empty",
						children: "当前环境没有可读的 agent preset。"
					}) : null
				]
			});
		}
		/** The instruction center page body. */
		function CustomInstructionsSection() {
			const [refreshToken, setRefreshToken] = (0, react.useState)(0);
			const refresh = (0, react.useCallback)(() => setRefreshToken((value) => value + 1), []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cinstr-page",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(GlobalSection, {
						onChanged: refresh,
						refreshToken
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TemplatesSection, {
						refreshToken,
						onChanged: refresh
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(HistorySection, { refreshToken }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OverviewSection, {}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "cinstr-meta",
						style: { margin: 0 },
						children: ["快捷键 Ctrl+S 保存全局指令。所有数据存储于当前主机的 DSH 配置目录。", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "cinstr-btn-ghost",
							style: { marginLeft: 8 },
							onClick: refresh,
							children: "刷新列表"
						})]
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