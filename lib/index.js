import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
//#region src/host/store.ts
/**
* Instruction-center storage layer — owns every file under
* $DSH_HOME/instructions/ and the global AGENTS.md it manages.
*
* Layout:
*   $DSH_HOME/AGENTS.md                  the active global instructions (what DSH loads)
*   $DSH_HOME/AGENTS.md.bak              one-generation rollback (existing mechanism)
*   $DSH_HOME/instructions/
*     templates/<name>.md                named instruction templates
*     active.json                        { active: name | null }
*     history/<epoch-ms>.md              save snapshots (version history)
*
* All mutations go through node:fs directly (the file lives outside the
* session workspace, so the sandboxed ctx.fs would refuse writes — same
* precedent as the dsh-web-ui family's host stores).
*/
/** A template name may only use these characters (path-safety). */
const TEMPLATE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function assertTemplateName(name) {
	if (!TEMPLATE_NAME.test(name)) throw new Error(`invalid template name "${name}"`);
}
/** The instructions/ directory beside the global instructions file. */
function instructionsDir(globalPath) {
	return join(dirname(globalPath), "instructions");
}
function templatesDir(globalPath) {
	return join(instructionsDir(globalPath), "templates");
}
function historyDir(globalPath) {
	return join(instructionsDir(globalPath), "history");
}
function activeFile(globalPath) {
	return join(instructionsDir(globalPath), "active.json");
}
async function ensureDirs(globalPath) {
	await mkdir(templatesDir(globalPath), {
		recursive: true,
		mode: 448
	});
	await mkdir(historyDir(globalPath), {
		recursive: true,
		mode: 448
	});
}
/** Read the global instructions; empty string when absent, throws on other errors. */
async function readGlobal(globalPath) {
	try {
		return await readFile(globalPath, "utf8");
	} catch (error) {
		if (error?.code === "ENOENT") return "";
		throw error;
	}
}
/**
* Replace the global instructions, rotating the previous content into .bak
* and appending it to the version history.
*/
async function writeGlobal(globalPath, text) {
	await ensureDirs(globalPath);
	try {
		const previous = await readFile(globalPath, "utf8");
		await copyFile(globalPath, `${globalPath}.bak`);
		try {
			await writeFile(join(historyDir(globalPath), `${Date.now()}.md`), previous, { encoding: "utf8" });
		} catch {}
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
	await mkdir(dirname(globalPath), {
		recursive: true,
		mode: 448
	});
	await writeFile(globalPath, text, { encoding: "utf8" });
}
/** Restore the .bak over the current content. */
async function restoreBackup(globalPath) {
	const previous = await readFile(`${globalPath}.bak`, "utf8");
	await writeFile(globalPath, previous, { encoding: "utf8" });
	return previous;
}
async function hasBackup(globalPath) {
	try {
		await stat(`${globalPath}.bak`);
		return true;
	} catch {
		return false;
	}
}
/** List templates (name-ordered). */
async function listTemplates(globalPath) {
	await ensureDirs(globalPath);
	const dir = templatesDir(globalPath);
	const names = await readdir(dir).catch(() => []);
	const entries = [];
	for (const name of names) {
		if (!name.endsWith(".md")) continue;
		const clean = name.slice(0, -3);
		if (!TEMPLATE_NAME.test(clean)) continue;
		try {
			const info = await stat(join(dir, name));
			entries.push({
				name: clean,
				size: info.size,
				updatedAt: info.mtimeMs
			});
		} catch {}
	}
	return entries.sort((a, b) => a.name.localeCompare(b.name));
}
async function readTemplate(globalPath, name) {
	assertTemplateName(name);
	return readFile(join(templatesDir(globalPath), `${name}.md`), "utf8");
}
async function writeTemplate(globalPath, name, text) {
	assertTemplateName(name);
	await ensureDirs(globalPath);
	await writeFile(join(templatesDir(globalPath), `${name}.md`), text, { encoding: "utf8" });
}
async function deleteTemplate(globalPath, name) {
	assertTemplateName(name);
	await rm(join(templatesDir(globalPath), `${name}.md`), { force: true });
}
/** The active template name, or null when the user edits freely. */
async function readActive(globalPath) {
	try {
		const raw = JSON.parse(await readFile(activeFile(globalPath), "utf8"));
		return typeof raw.active === "string" && TEMPLATE_NAME.test(raw.active) ? raw.active : null;
	} catch {
		return null;
	}
}
async function writeActive(globalPath, name) {
	await ensureDirs(globalPath);
	await writeFile(activeFile(globalPath), JSON.stringify({ active: name }), { encoding: "utf8" });
}
/**
* Activate a template: copy its content into the global file (with history
* rotation) and record it as active.
*/
async function activateTemplate(globalPath, name) {
	assertTemplateName(name);
	const text = await readTemplate(globalPath, name);
	await writeGlobal(globalPath, text);
	await writeActive(globalPath, name);
	return text;
}
/** List history entries (newest first). */
async function listHistory(globalPath) {
	await ensureDirs(globalPath);
	const dir = historyDir(globalPath);
	const names = await readdir(dir).catch(() => []);
	const entries = [];
	for (const name of names) {
		const match = /^(\d+)\.md$/.exec(name);
		if (match === null) continue;
		try {
			const info = await stat(join(dir, name));
			entries.push({
				id: match[1],
				size: info.size,
				savedAt: Number(match[1])
			});
		} catch {}
	}
	return entries.sort((a, b) => b.savedAt - a.savedAt);
}
async function readHistory(globalPath, id) {
	if (!/^\d{1,20}$/.test(id)) throw new Error("invalid history id");
	return readFile(join(historyDir(globalPath), `${id}.md`), "utf8");
}
/** Restore a history snapshot as the current content. */
async function restoreHistory(globalPath, id) {
	const text = await readHistory(globalPath, id);
	await writeGlobal(globalPath, text);
	return text;
}
/** Export the whole instruction center as one JSON bundle. */
async function exportBundle(globalPath) {
	const [active, current, templates, history] = await Promise.all([
		readActive(globalPath),
		readGlobal(globalPath),
		listTemplates(globalPath),
		listHistory(globalPath)
	]);
	const templateTexts = await Promise.all(templates.map(async (entry) => ({
		name: entry.name,
		text: await readTemplate(globalPath, entry.name)
	})));
	const historyTexts = await Promise.all(history.map(async (entry) => ({
		id: entry.id,
		text: await readHistory(globalPath, entry.id)
	})));
	return {
		format: "dsh-instructions-v1",
		exportedAt: Date.now(),
		active,
		current,
		templates: templateTexts,
		history: historyTexts
	};
}
/** Import a bundle: replaces templates and history, keeps current content if absent. */
async function importBundle(globalPath, bundle) {
	if (typeof bundle !== "object" || bundle === null) throw new Error("import payload must be an object");
	const data = bundle;
	if (data.format !== "dsh-instructions-v1") throw new Error("unsupported import format");
	if (!Array.isArray(data.templates)) throw new Error("import payload: templates must be an array");
	let count = 0;
	for (const entry of data.templates) {
		if (typeof entry?.name !== "string" || typeof entry?.text !== "string") continue;
		try {
			await writeTemplate(globalPath, entry.name, entry.text);
			count += 1;
		} catch {}
	}
	for (const entry of Array.isArray(data.history) ? data.history : []) {
		if (typeof entry?.id !== "string" || typeof entry?.text !== "string") continue;
		if (!/^\d{1,20}$/.test(entry.id)) continue;
		try {
			await writeFile(join(historyDir(globalPath), `${entry.id}.md`), entry.text, { encoding: "utf8" });
			count += 1;
		} catch {}
	}
	return count;
}
//#endregion
//#region src/index.ts
/** Route prefix for this plugin's JSON operations. */
const ROUTE_PREFIX = "/api/dsh-custom-instructions";
/** UTF-8 byte cap the DSH workspace-instruction loader accepts. */
const MAX_INSTRUCTIONS_BYTES = 65536;
const inject = ["webServer"];
/** One JSON envelope response. */
function json(res, payload, status = 200) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(payload));
}
/** Read the request body (bounded) as UTF-8 text. */
function readBody(req, maxBytes = 4 * 1024 * 1024) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let total = 0;
		req.on("data", (chunk) => {
			total += chunk.length;
			if (total > maxBytes) {
				reject(/* @__PURE__ */ new Error(`request body exceeds ${maxBytes} bytes`));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}
/** Parse a JSON body or return undefined on failure. */
async function parseJsonBody(req) {
	const body = await readBody(req);
	try {
		return JSON.parse(body);
	} catch {
		return;
	}
}
/**
* Locate the user's global instruction file: the AGENTS.md beside the
* settings document ($DSH_HOME/settings.yaml). Falls back to the conventional
* home path when no settings document is available.
*/
async function instructionsPath(ctx) {
	const settings = ctx.get("settings");
	if (settings !== void 0) try {
		const doc = await settings.prepareDocument();
		if (typeof doc === "string" && doc.length > 0) return join(dirname(doc), "AGENTS.md");
	} catch {}
	return join(homedir(), ".dsh", "AGENTS.md");
}
/** Split the URL into path segments under the route prefix ('' for root). */
function routePath(url) {
	const raw = (url ?? "").split("?")[0];
	const prefix = ROUTE_PREFIX;
	if (raw === prefix) return [""];
	if (!raw.startsWith(`${prefix}/`)) return [""];
	return raw.slice(29).split("/").map((segment) => decodeURIComponent(segment));
}
/**
* Project-level instruction view: every registered workspace plus whether it
* carries its own AGENTS.md at the root.
*/
async function projectView(ctx) {
	const registry = ctx.get("workspaceRegistry");
	if (registry === void 0) return [];
	const workspaces = registry.list();
	const rows = [];
	for (const workspace of workspaces) try {
		await readFile(join(workspace.path, "AGENTS.md"), "utf8");
		rows.push({
			path: workspace.path,
			title: workspace.title,
			hasAgents: true
		});
	} catch {
		rows.push({
			path: workspace.path,
			title: workspace.title,
			hasAgents: false
		});
	}
	return rows;
}
/**
* Persona overview: the default preset's identity plus the first persona
* section text found in its composition (read-only).
*/
async function personaView(ctx) {
	const presets = ctx.get("agentPresets");
	if (presets === void 0) return null;
	try {
		const preset = await presets.resolve();
		const composition = await presets.read(preset.id);
		const match = /- id:\s*persona[\s\S]*?text:\s*\|-?\s*\n([\s\S]*?)(?=\n- id:|\n---|\n\s{2,}\S+:|$)/.exec(composition);
		const persona = match !== null ? match[1].trim() : "";
		return {
			preset: preset.id,
			persona
		};
	} catch {
		return null;
	}
}
/**
* Register the instruction-center route family.
* @param ctx - context carrying webServer.
* @returns the route disposers.
*/
function registerCustomInstructionsRoutes(ctx) {
	const handler = async (req, res) => {
		const path = await instructionsPath(ctx);
		const segments = routePath(req.url);
		const sub = segments[0] ?? "";
		try {
			if (sub === "" && req.method === "GET") {
				let text = "";
				try {
					text = await readGlobal(path);
				} catch (error) {
					if (error?.code !== "ENOENT") throw error;
				}
				const [active, backup] = await Promise.all([readActive(path), hasBackup(path)]);
				json(res, {
					ok: true,
					path,
					text,
					maxBytes: MAX_INSTRUCTIONS_BYTES,
					active,
					hasBackup: backup
				});
				return;
			}
			if (sub === "" && req.method === "PUT") {
				const body = await parseJsonBody(req);
				if (body === void 0) {
					json(res, {
						ok: false,
						error: "invalid JSON body"
					}, 400);
					return;
				}
				if (typeof body.text !== "string") {
					json(res, {
						ok: false,
						error: "expected { text: string }"
					}, 400);
					return;
				}
				await writeGlobal(path, body.text);
				json(res, {
					ok: true,
					path,
					maxBytes: MAX_INSTRUCTIONS_BYTES
				});
				return;
			}
			if (sub === "" && req.method === "POST") {
				const body = await parseJsonBody(req);
				if (body === void 0) {
					json(res, {
						ok: false,
						error: "invalid JSON body"
					}, 400);
					return;
				}
				if (body.action !== "restore") {
					json(res, {
						ok: false,
						error: "expected { action: \"restore\" }"
					}, 400);
					return;
				}
				try {
					json(res, {
						ok: true,
						path,
						text: await restoreBackup(path)
					});
				} catch (error) {
					if (error?.code === "ENOENT") {
						json(res, {
							ok: false,
							error: "no backup available"
						}, 404);
						return;
					}
					throw error;
				}
				return;
			}
			if (sub === "templates" && req.method === "POST" && segments[1] === "activate") {
				const body = await parseJsonBody(req);
				if (body === void 0) {
					json(res, {
						ok: false,
						error: "invalid JSON body"
					}, 400);
					return;
				}
				if (typeof body.name !== "string") {
					json(res, {
						ok: false,
						error: "expected { name: string }"
					}, 400);
					return;
				}
				try {
					json(res, {
						ok: true,
						text: await activateTemplate(path, body.name)
					});
				} catch (error) {
					if (error?.code === "ENOENT") {
						json(res, {
							ok: false,
							error: "template not found"
						}, 404);
						return;
					}
					throw error;
				}
				return;
			}
			if (sub === "templates" && req.method === "GET" && segments.length >= 2) {
				try {
					const text = await readTemplate(path, segments[1]);
					json(res, {
						ok: true,
						name: segments[1],
						text
					});
				} catch (error) {
					if (error?.code === "ENOENT") {
						json(res, {
							ok: false,
							error: "template not found"
						}, 404);
						return;
					}
					throw error;
				}
				return;
			}
			if (sub === "templates" && req.method === "PUT" && segments.length >= 2) {
				const name = segments[1];
				const body = await parseJsonBody(req);
				if (body === void 0) {
					json(res, {
						ok: false,
						error: "invalid JSON body"
					}, 400);
					return;
				}
				if (typeof body.text !== "string") {
					json(res, {
						ok: false,
						error: "expected { text: string }"
					}, 400);
					return;
				}
				await writeTemplate(path, name, body.text);
				json(res, { ok: true });
				return;
			}
			if (sub === "templates" && req.method === "DELETE" && segments.length >= 2) {
				await deleteTemplate(path, segments[1]);
				json(res, { ok: true });
				return;
			}
			if (sub === "templates" && req.method === "GET") {
				const [templates, active] = await Promise.all([listTemplates(path), readActive(path)]);
				json(res, {
					ok: true,
					templates,
					active
				});
				return;
			}
			if (sub === "templates" && req.method === "POST") {
				const body = await parseJsonBody(req);
				if (body === void 0) {
					json(res, {
						ok: false,
						error: "invalid JSON body"
					}, 400);
					return;
				}
				if (typeof body.name !== "string" || typeof body.text !== "string") {
					json(res, {
						ok: false,
						error: "expected { name: string, text: string }"
					}, 400);
					return;
				}
				await writeTemplate(path, body.name, body.text);
				json(res, { ok: true });
				return;
			}
			if (sub === "history" && req.method === "GET") {
				json(res, {
					ok: true,
					history: await listHistory(path)
				});
				return;
			}
			if (sub === "history" && req.method === "POST" && segments[1] === "restore") {
				const body = await parseJsonBody(req);
				if (body === void 0) {
					json(res, {
						ok: false,
						error: "invalid JSON body"
					}, 400);
					return;
				}
				if (typeof body.id !== "string") {
					json(res, {
						ok: false,
						error: "expected { id: string }"
					}, 400);
					return;
				}
				try {
					json(res, {
						ok: true,
						text: await restoreHistory(path, body.id)
					});
				} catch (error) {
					if (error?.code === "ENOENT") {
						json(res, {
							ok: false,
							error: "history entry not found"
						}, 404);
						return;
					}
					throw error;
				}
				return;
			}
			if (sub === "export" && req.method === "POST") {
				json(res, {
					ok: true,
					bundle: await exportBundle(path)
				});
				return;
			}
			if (sub === "import" && req.method === "POST") {
				const body = await parseJsonBody(req);
				if (body === void 0) {
					json(res, {
						ok: false,
						error: "invalid JSON body"
					}, 400);
					return;
				}
				json(res, {
					ok: true,
					imported: await importBundle(path, body.bundle)
				});
				return;
			}
			if (sub === "project" && req.method === "GET") {
				json(res, {
					ok: true,
					projects: await projectView(ctx)
				});
				return;
			}
			if (sub === "preset" && req.method === "GET") {
				json(res, {
					ok: true,
					view: await personaView(ctx)
				});
				return;
			}
			res.writeHead(405);
			res.end();
		} catch (error) {
			ctx.logger.warn(`dsh-custom-instructions: ${String(error)}`);
			json(res, {
				ok: false,
				error: String(error?.message ?? error)
			}, 500);
		}
	};
	return [ctx.webServer.register({
		kind: "prefix",
		path: ROUTE_PREFIX,
		handler
	})];
}
/**
* Plugin entry. Registers the instruction-center route family.
* @param ctx - the plugin context (webServer injected).
*/
function apply(ctx) {
	const disposers = registerCustomInstructionsRoutes(ctx);
	ctx.effect(() => () => {
		for (const dispose of disposers) dispose();
	});
}
//#endregion
export { MAX_INSTRUCTIONS_BYTES, ROUTE_PREFIX, apply, inject, registerCustomInstructionsRoutes };
