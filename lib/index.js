import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
function readBody(req, maxBytes = MAX_INSTRUCTIONS_BYTES) {
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
/** The backup file beside the instructions file (one-generation rollback). */
function backupPath(path) {
	return `${path}.bak`;
}
/**
* Register the route family:
* - GET   — current instructions (empty only on ENOENT; other errors surface)
* - PUT   — replace instructions; the previous content is rotated into
*           `<path>.bak` first (one-generation rollback)
* - POST  — restore the backup over the current content (undo last save)
* @param ctx - context carrying webServer.
* @returns the route disposers.
*/
function registerCustomInstructionsRoutes(ctx) {
	const handler = async (req, res) => {
		const path = await instructionsPath(ctx);
		try {
			if (req.method === "GET") {
				let text;
				try {
					text = await readFile(path, "utf8");
				} catch (error) {
					if (error?.code === "ENOENT") {
						json(res, {
							ok: true,
							path,
							text: "",
							maxBytes: MAX_INSTRUCTIONS_BYTES
						});
						return;
					}
					throw error;
				}
				json(res, {
					ok: true,
					path,
					text,
					maxBytes: MAX_INSTRUCTIONS_BYTES
				});
				return;
			}
			if (req.method === "PUT") {
				const body = await readBody(req);
				let text;
				try {
					text = JSON.parse(body).text;
				} catch {
					json(res, {
						ok: false,
						error: "invalid JSON body"
					}, 400);
					return;
				}
				if (typeof text !== "string") {
					json(res, {
						ok: false,
						error: "expected { text: string }"
					}, 400);
					return;
				}
				await mkdir(dirname(path), {
					recursive: true,
					mode: 448
				});
				try {
					await copyFile(path, `${path}.tmp-bak`);
					await rename(`${path}.tmp-bak`, backupPath(path));
				} catch (error) {
					if (error?.code !== "ENOENT") throw error;
				}
				await writeFile(path, text, { encoding: "utf8" });
				json(res, {
					ok: true,
					path,
					maxBytes: MAX_INSTRUCTIONS_BYTES
				});
				return;
			}
			if (req.method === "POST") {
				const body = await readBody(req);
				let action = "";
				try {
					action = JSON.parse(body).action;
				} catch {
					json(res, {
						ok: false,
						error: "invalid JSON body"
					}, 400);
					return;
				}
				if (action !== "restore") {
					json(res, {
						ok: false,
						error: "expected { action: \"restore\" }"
					}, 400);
					return;
				}
				let previous;
				try {
					previous = await readFile(backupPath(path), "utf8");
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
				await writeFile(path, previous, { encoding: "utf8" });
				json(res, {
					ok: true,
					path,
					text: previous
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
* Plugin entry. Registers the route family for the web GUI.
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
