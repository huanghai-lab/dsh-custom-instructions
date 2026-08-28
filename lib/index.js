import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
//#region src/host/store.ts
/**
* File-backed instruction-center store.
*
* Every mutation is revision-checked, serialized per DSH home, and written
* through a same-directory temporary file. Reads remain compatible with the
* v0.3 layout while new template files use an encoded, path-safe filename.
*/
const MAX_CONTENT_BYTES = 65536;
const MAX_IMPORT_BYTES = 16 * 1024 * 1024;
const LEGACY_TEMPLATE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ENCODED_TEMPLATE_PREFIX = "b64~";
const LEGACY_HISTORY_ID = /^\d{1,20}$/;
const HISTORY_ID = /^(\d{13})-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const operationQueues = /* @__PURE__ */ new Map();
var StoreError = class extends Error {
	code;
	status;
	constructor(code, message, status) {
		super(message);
		this.code = code;
		this.status = status;
		this.name = "StoreError";
	}
};
function isNotFound(error) {
	return error?.code === "ENOENT";
}
async function readOptional(path) {
	try {
		return await readFile(path, "utf8");
	} catch (error) {
		if (isNotFound(error)) return void 0;
		throw error;
	}
}
async function readDirOrEmpty(path) {
	try {
		return await readdir(path);
	} catch (error) {
		if (isNotFound(error)) return [];
		throw error;
	}
}
function assertContent(text, label = "content") {
	if (Buffer.byteLength(text, "utf8") > 65536) throw new StoreError("CONTENT_TOO_LARGE", `${label} exceeds ${MAX_CONTENT_BYTES} UTF-8 bytes`, 413);
}
function assertTemplateName(name) {
	if (name !== name.trim()) throw new StoreError("BAD_REQUEST", "template name cannot start or end with whitespace", 400);
	const characters = Array.from(name).length;
	if (characters < 1 || characters > 64 || Buffer.byteLength(name, "utf8") > 160) throw new StoreError("BAD_REQUEST", "template name must be 1-64 characters and at most 160 UTF-8 bytes", 400);
	if (/[\u0000-\u001f\u007f]/.test(name)) throw new StoreError("BAD_REQUEST", "template name cannot contain control characters", 400);
}
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
function rollbackFile(globalPath) {
	return join(instructionsDir(globalPath), "import-rollback.json");
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
async function atomicWriteFile(path, text) {
	await mkdir(dirname(path), {
		recursive: true,
		mode: 448
	});
	const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
	try {
		await writeFile(temporary, text, {
			encoding: "utf8",
			flag: "wx",
			mode: 384
		});
		if (await readFile(temporary, "utf8") !== text) throw new StoreError("CORRUPT_DATA", `failed to verify temporary write for ${basename(path)}`, 500);
		await rename(temporary, path);
	} finally {
		await rm(temporary, { force: true }).catch(() => void 0);
	}
}
function encodedTemplateFilename(name) {
	assertTemplateName(name);
	return `${ENCODED_TEMPLATE_PREFIX}${Buffer.from(name, "utf8").toString("base64url")}.md`;
}
function decodeTemplateFilename(filename) {
	if (!filename.endsWith(".md")) return null;
	const stem = filename.slice(0, -3);
	if (stem.startsWith(ENCODED_TEMPLATE_PREFIX)) {
		const encoded = stem.slice(4);
		try {
			const name = Buffer.from(encoded, "base64url").toString("utf8");
			if (Buffer.from(name, "utf8").toString("base64url") !== encoded) throw new Error("non-canonical encoding");
			assertTemplateName(name);
			return {
				name,
				path: filename,
				encoded: true
			};
		} catch {
			throw new StoreError("CORRUPT_DATA", `invalid encoded template filename: ${filename}`, 500);
		}
	}
	if (!LEGACY_TEMPLATE_NAME.test(stem)) throw new StoreError("CORRUPT_DATA", `invalid legacy template filename: ${filename}`, 500);
	return {
		name: stem,
		path: filename,
		encoded: false
	};
}
async function scanTemplateFiles(globalPath) {
	const directory = templatesDir(globalPath);
	const filenames = (await readDirOrEmpty(directory)).sort((a, b) => a.localeCompare(b));
	const files = /* @__PURE__ */ new Map();
	for (const filename of filenames) {
		const decoded = decodeTemplateFilename(filename);
		if (decoded === null) continue;
		decoded.path = join(directory, decoded.path);
		const existing = files.get(decoded.name);
		if (existing === void 0) {
			files.set(decoded.name, decoded);
			continue;
		}
		const [left, right] = await Promise.all([readFile(existing.path, "utf8"), readFile(decoded.path, "utf8")]);
		if (left !== right) throw new StoreError("REVISION_CONFLICT", `legacy and encoded templates differ for "${decoded.name}"`, 409);
		if (decoded.encoded) files.set(decoded.name, {
			...decoded,
			legacyPath: existing.encoded ? existing.legacyPath : existing.path
		});
		else if (existing.encoded) existing.legacyPath = decoded.path;
	}
	return files;
}
function templatePath(globalPath, name) {
	return join(templatesDir(globalPath), encodedTemplateFilename(name));
}
/** Read the global instructions; absence is the empty instruction set. */
async function readGlobal(globalPath) {
	return await readOptional(globalPath) ?? "";
}
async function hasBackup(globalPath) {
	try {
		return (await stat(`${globalPath}.bak`)).isFile();
	} catch (error) {
		if (isNotFound(error)) return false;
		throw error;
	}
}
async function listTemplates(globalPath) {
	const files = await scanTemplateFiles(globalPath);
	const entries = [];
	for (const file of files.values()) try {
		const info = await stat(file.path);
		entries.push({
			name: file.name,
			size: info.size,
			updatedAt: info.mtimeMs
		});
	} catch (error) {
		if (!isNotFound(error)) throw error;
	}
	return entries.sort((a, b) => a.name.localeCompare(b.name));
}
async function readTemplate(globalPath, name) {
	assertTemplateName(name);
	const file = (await scanTemplateFiles(globalPath)).get(name);
	if (file !== void 0) return readFile(file.path, "utf8");
	throw new StoreError("NOT_FOUND", `template "${name}" not found`, 404);
}
async function writeTemplateRaw(globalPath, name, text) {
	assertTemplateName(name);
	assertContent(text, "template content");
	await ensureDirs(globalPath);
	const files = await scanTemplateFiles(globalPath);
	if (!files.has(name) && files.size >= 50) throw new StoreError("LIMIT_EXCEEDED", `template limit is 50`, 413);
	const encodedPath = templatePath(globalPath, name);
	const encodedName = basename(encodedPath);
	const caseConflict = [...files.values()].find((file) => file.name !== name && file.encoded && basename(file.path).toLowerCase() === encodedName.toLowerCase());
	if (caseConflict !== void 0) throw new StoreError("REVISION_CONFLICT", `template filename conflicts with "${caseConflict.name}" on a case-insensitive filesystem`, 409);
	const existing = files.get(name);
	const legacyPath = existing?.encoded === true ? existing.legacyPath : existing?.path;
	const previousEncoded = await readOptional(encodedPath);
	try {
		await atomicWriteFile(encodedPath, text);
		if (legacyPath !== void 0 && legacyPath !== encodedPath) await rm(legacyPath, { force: true });
	} catch (error) {
		try {
			if (previousEncoded === void 0) await rm(encodedPath, { force: true });
			else await atomicWriteFile(encodedPath, previousEncoded);
		} catch (rollbackError) {
			throw new StoreError("ROLLBACK_FAILED", `template write failed and rollback also failed: ${String(rollbackError.message ?? rollbackError)}`, 500);
		}
		throw error;
	}
}
async function deleteTemplateRaw(globalPath, name) {
	assertTemplateName(name);
	const file = (await scanTemplateFiles(globalPath)).get(name);
	if (file === void 0) throw new StoreError("NOT_FOUND", `template "${name}" not found`, 404);
	const text = await readFile(file.path, "utf8");
	const encodedPath = templatePath(globalPath, name);
	const active = await readActive(globalPath);
	try {
		await rm(file.path, { force: true });
		if (file.legacyPath !== void 0) await rm(file.legacyPath, { force: true });
		if (active === name) await writeActiveRaw(globalPath, null);
	} catch (error) {
		try {
			await atomicWriteFile(encodedPath, text);
			await writeActiveRaw(globalPath, active);
		} catch (rollbackError) {
			throw new StoreError("ROLLBACK_FAILED", `template deletion failed and rollback also failed: ${String(rollbackError.message ?? rollbackError)}`, 500);
		}
		throw error;
	}
	return active === name ? null : active;
}
async function readActive(globalPath) {
	const text = await readOptional(activeFile(globalPath));
	if (text === void 0) return null;
	try {
		const parsed = JSON.parse(text);
		if (parsed.active === null) return null;
		if (typeof parsed.active !== "string") throw new Error("active must be a string or null");
		assertTemplateName(parsed.active);
		return parsed.active;
	} catch (error) {
		if (error instanceof StoreError) throw error;
		throw new StoreError("CORRUPT_DATA", `invalid active template state: ${String(error.message ?? error)}`, 500);
	}
}
async function writeActiveRaw(globalPath, name) {
	if (name !== null) assertTemplateName(name);
	await atomicWriteFile(activeFile(globalPath), `${JSON.stringify({ active: name })}\n`);
}
function parseHistoryId(id) {
	const modern = HISTORY_ID.exec(id);
	if (modern !== null) return Number(modern[1]);
	if (LEGACY_HISTORY_ID.test(id)) return Number(id);
	throw new StoreError("BAD_REQUEST", `invalid history id "${id}"`, 400);
}
async function listHistory(globalPath) {
	const directory = historyDir(globalPath);
	const filenames = await readDirOrEmpty(directory);
	const entries = [];
	for (const filename of filenames) {
		if (!filename.endsWith(".md")) continue;
		const id = filename.slice(0, -3);
		let savedAt;
		try {
			savedAt = parseHistoryId(id);
		} catch {
			throw new StoreError("CORRUPT_DATA", `invalid history filename: ${filename}`, 500);
		}
		try {
			const info = await stat(join(directory, filename));
			entries.push({
				id,
				size: info.size,
				savedAt
			});
		} catch (error) {
			if (!isNotFound(error)) throw error;
		}
	}
	return entries.sort((a, b) => b.savedAt - a.savedAt || b.id.localeCompare(a.id));
}
async function readHistory(globalPath, id) {
	parseHistoryId(id);
	const text = await readOptional(join(historyDir(globalPath), `${id}.md`));
	if (text === void 0) throw new StoreError("NOT_FOUND", `history entry "${id}" not found`, 404);
	return text;
}
async function pruneHistory(globalPath) {
	const history = await listHistory(globalPath);
	await Promise.all(history.slice(100).map((entry) => rm(join(historyDir(globalPath), `${entry.id}.md`), { force: true })));
}
async function writeGlobalRaw(globalPath, text, nextActive) {
	assertContent(text, "global instructions");
	await ensureDirs(globalPath);
	const [previous, previousBackup, previousActive] = await Promise.all([
		readOptional(globalPath),
		readOptional(`${globalPath}.bak`),
		readActive(globalPath)
	]);
	const staleHistory = (await listHistory(globalPath)).slice(previous === void 0 ? 100 : 99);
	const staleSnapshots = await Promise.all(staleHistory.map(async ({ id }) => ({
		id,
		text: await readHistory(globalPath, id)
	})));
	let historyId = null;
	let currentWritten = false;
	try {
		if (previous !== void 0) {
			await atomicWriteFile(`${globalPath}.bak`, previous);
			historyId = `${Date.now()}-${randomUUID()}`;
			await atomicWriteFile(join(historyDir(globalPath), `${historyId}.md`), previous);
		}
		await atomicWriteFile(globalPath, text);
		currentWritten = true;
		await writeActiveRaw(globalPath, nextActive);
		for (const entry of staleSnapshots) await rm(join(historyDir(globalPath), `${entry.id}.md`), { force: true });
	} catch (error) {
		try {
			if (currentWritten) if (previous === void 0) await rm(globalPath, { force: true });
			else await atomicWriteFile(globalPath, previous);
			await writeActiveRaw(globalPath, previousActive);
			if (previousBackup === void 0) await rm(`${globalPath}.bak`, { force: true });
			else await atomicWriteFile(`${globalPath}.bak`, previousBackup);
			if (historyId !== null) await rm(join(historyDir(globalPath), `${historyId}.md`), { force: true });
			for (const entry of staleSnapshots) await atomicWriteFile(join(historyDir(globalPath), `${entry.id}.md`), entry.text);
		} catch (rollbackError) {
			throw new StoreError("ROLLBACK_FAILED", `write failed and rollback also failed: ${String(rollbackError.message ?? rollbackError)}`, 500);
		}
		throw error;
	}
}
async function logicalState(globalPath) {
	const [current, backup, active, templates, history] = await Promise.all([
		readOptional(globalPath),
		readOptional(`${globalPath}.bak`),
		readActive(globalPath),
		listTemplates(globalPath),
		listHistory(globalPath)
	]);
	const templateTexts = await Promise.all(templates.map(async ({ name }) => ({
		name,
		text: await readTemplate(globalPath, name)
	})));
	const historyTexts = await Promise.all(history.map(async ({ id }) => ({
		id,
		text: await readHistory(globalPath, id)
	})));
	return {
		format: "dsh-instructions-rollback-v1",
		savedAt: Date.now(),
		currentExists: current !== void 0,
		current: current ?? "",
		backupExists: backup !== void 0,
		backup: backup ?? "",
		active,
		templates: templateTexts,
		history: historyTexts
	};
}
async function getRevision(globalPath) {
	const state = await logicalState(globalPath);
	const canonical = {
		currentExists: state.currentExists,
		current: state.current,
		backupExists: state.backupExists,
		backup: state.backup,
		active: state.active,
		templates: state.templates,
		history: state.history
	};
	return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
async function serialized(globalPath, operation) {
	const run = (operationQueues.get(globalPath) ?? Promise.resolve()).catch(() => void 0).then(operation);
	const settled = run.then(() => void 0, () => void 0);
	operationQueues.set(globalPath, settled);
	settled.finally(() => {
		if (operationQueues.get(globalPath) === settled) operationQueues.delete(globalPath);
	});
	return run;
}
async function readConsistent(globalPath, read) {
	return serialized(globalPath, async () => {
		for (let attempt = 0; attempt < 3; attempt += 1) {
			const before = await getRevision(globalPath);
			const value = await read();
			const revision = await getRevision(globalPath);
			if (before === revision) return {
				value,
				revision
			};
		}
		throw new StoreError("REVISION_CONFLICT", "instructions changed while they were being read", 409);
	});
}
async function withMutation(globalPath, expectedRevision, operation) {
	return serialized(globalPath, async () => {
		if (await getRevision(globalPath) !== expectedRevision) throw new StoreError("REVISION_CONFLICT", "instructions changed since they were loaded", 409);
		return {
			value: await operation(),
			revision: await getRevision(globalPath)
		};
	});
}
async function writeGlobal(globalPath, text, expectedRevision) {
	assertContent(text, "global instructions");
	return {
		revision: (await withMutation(globalPath, expectedRevision, () => writeGlobalRaw(globalPath, text, null))).revision,
		hasBackup: await hasBackup(globalPath)
	};
}
async function restoreBackup(globalPath, expectedRevision) {
	const result = await withMutation(globalPath, expectedRevision, async () => {
		const previous = await readOptional(`${globalPath}.bak`);
		if (previous === void 0) throw new StoreError("NOT_FOUND", "no backup available", 404);
		await writeGlobalRaw(globalPath, previous, null);
		return previous;
	});
	return {
		text: result.value,
		revision: result.revision,
		hasBackup: await hasBackup(globalPath)
	};
}
async function writeTemplate(globalPath, name, text, expectedRevision) {
	assertTemplateName(name);
	assertContent(text, "template content");
	return { revision: (await withMutation(globalPath, expectedRevision, () => writeTemplateRaw(globalPath, name, text))).revision };
}
async function deleteTemplate(globalPath, name, expectedRevision) {
	const result = await withMutation(globalPath, expectedRevision, () => deleteTemplateRaw(globalPath, name));
	return {
		revision: result.revision,
		active: result.value
	};
}
async function activateTemplate(globalPath, name, expectedRevision) {
	const result = await withMutation(globalPath, expectedRevision, async () => {
		const text = await readTemplate(globalPath, name);
		await writeGlobalRaw(globalPath, text, name);
		return text;
	});
	return {
		text: result.value,
		revision: result.revision,
		hasBackup: await hasBackup(globalPath)
	};
}
async function restoreHistory(globalPath, id, expectedRevision) {
	const result = await withMutation(globalPath, expectedRevision, async () => {
		const text = await readHistory(globalPath, id);
		await writeGlobalRaw(globalPath, text, null);
		return text;
	});
	return {
		text: result.value,
		revision: result.revision,
		hasBackup: await hasBackup(globalPath)
	};
}
async function exportBundle(globalPath) {
	const snapshot = await logicalState(globalPath);
	return {
		format: "dsh-instructions-v2",
		exportedAt: Date.now(),
		active: snapshot.active,
		current: snapshot.current,
		templates: snapshot.templates,
		history: snapshot.history
	};
}
function validateBundle(bundle) {
	if (typeof bundle !== "object" || bundle === null || Array.isArray(bundle)) throw new StoreError("BAD_REQUEST", "import bundle must be an object", 400);
	const data = bundle;
	const format = data.format ?? "dsh-instructions-v1";
	if (format !== "dsh-instructions-v1" && format !== "dsh-instructions-v2") throw new StoreError("BAD_REQUEST", "unsupported import format", 400);
	if (!Number.isSafeInteger(data.exportedAt) || data.exportedAt < 0) throw new StoreError("BAD_REQUEST", "import exportedAt must be a non-negative integer", 400);
	if (typeof data.current !== "string") throw new StoreError("BAD_REQUEST", "import current must be a string", 400);
	assertContent(data.current, "import current");
	if (data.active !== null && typeof data.active !== "string") throw new StoreError("BAD_REQUEST", "import active must be a template name or null", 400);
	if (typeof data.active === "string") assertTemplateName(data.active);
	if (!Array.isArray(data.templates)) throw new StoreError("BAD_REQUEST", "import templates must be an array", 400);
	if (!Array.isArray(data.history)) throw new StoreError("BAD_REQUEST", "import history must be an array", 400);
	if (data.templates.length > 50) throw new StoreError("LIMIT_EXCEEDED", `import contains more than 50 templates`, 413);
	if (data.history.length > 100) throw new StoreError("LIMIT_EXCEEDED", `import contains more than 100 history entries`, 413);
	const templates = [];
	const templateNames = /* @__PURE__ */ new Set();
	for (const item of data.templates) {
		if (typeof item !== "object" || item === null) throw new StoreError("BAD_REQUEST", "invalid template entry", 400);
		const entry = item;
		if (typeof entry.name !== "string" || typeof entry.text !== "string") throw new StoreError("BAD_REQUEST", "template entries require string name and text", 400);
		assertTemplateName(entry.name);
		assertContent(entry.text, `template "${entry.name}"`);
		if (templateNames.has(entry.name)) throw new StoreError("BAD_REQUEST", `duplicate template "${entry.name}"`, 400);
		templateNames.add(entry.name);
		templates.push({
			name: entry.name,
			text: entry.text
		});
	}
	const history = [];
	const historyIds = /* @__PURE__ */ new Set();
	for (const item of data.history) {
		if (typeof item !== "object" || item === null) throw new StoreError("BAD_REQUEST", "invalid history entry", 400);
		const entry = item;
		if (typeof entry.id !== "string" || typeof entry.text !== "string") throw new StoreError("BAD_REQUEST", "history entries require string id and text", 400);
		parseHistoryId(entry.id);
		assertContent(entry.text, `history "${entry.id}"`);
		if (historyIds.has(entry.id)) throw new StoreError("BAD_REQUEST", `duplicate history "${entry.id}"`, 400);
		historyIds.add(entry.id);
		history.push({
			id: entry.id,
			text: entry.text
		});
	}
	return {
		format: "dsh-instructions-v2",
		exportedAt: data.exportedAt,
		active: data.active,
		current: data.current,
		templates,
		history
	};
}
async function clearMarkdownFiles(directory) {
	const filenames = await readDirOrEmpty(directory);
	await Promise.all(filenames.filter((name) => name.endsWith(".md")).map((name) => rm(join(directory, name), { force: true })));
}
async function restoreSnapshot(globalPath, snapshot) {
	await ensureDirs(globalPath);
	await Promise.all([clearMarkdownFiles(templatesDir(globalPath)), clearMarkdownFiles(historyDir(globalPath))]);
	for (const template of snapshot.templates) await atomicWriteFile(templatePath(globalPath, template.name), template.text);
	for (const entry of snapshot.history) await atomicWriteFile(join(historyDir(globalPath), `${entry.id}.md`), entry.text);
	if (snapshot.currentExists) await atomicWriteFile(globalPath, snapshot.current);
	else await rm(globalPath, { force: true });
	if (snapshot.backupExists) await atomicWriteFile(`${globalPath}.bak`, snapshot.backup);
	else await rm(`${globalPath}.bak`, { force: true });
	await writeActiveRaw(globalPath, snapshot.active);
}
async function importBundle(globalPath, bundle, expectedRevision) {
	const incoming = validateBundle(bundle);
	const result = await withMutation(globalPath, expectedRevision, async () => {
		const before = await logicalState(globalPath);
		const localNames = new Set(before.templates.map(({ name }) => name));
		for (const template of incoming.templates) localNames.add(template.name);
		if (localNames.size > 50) throw new StoreError("LIMIT_EXCEEDED", `merged template count exceeds 50`, 413);
		if (incoming.active !== null && !localNames.has(incoming.active)) throw new StoreError("BAD_REQUEST", `active template "${incoming.active}" is not present after merge`, 400);
		await atomicWriteFile(rollbackFile(globalPath), `${JSON.stringify(before, null, 2)}\n`);
		try {
			for (const template of incoming.templates) await writeTemplateRaw(globalPath, template.name, template.text);
			await writeGlobalRaw(globalPath, incoming.current, incoming.active);
			for (const entry of incoming.history) await atomicWriteFile(join(historyDir(globalPath), `${entry.id}.md`), entry.text);
			await pruneHistory(globalPath);
		} catch (error) {
			try {
				await restoreSnapshot(globalPath, before);
			} catch (rollbackError) {
				throw new StoreError("ROLLBACK_FAILED", `import failed and rollback also failed: ${String(rollbackError.message ?? rollbackError)}`, 500);
			}
			throw error;
		}
		return {
			templates: incoming.templates.length,
			history: incoming.history.length,
			currentChanged: before.current !== incoming.current || !before.currentExists,
			active: incoming.active,
			imported: incoming.templates.length + incoming.history.length + 1
		};
	});
	return {
		summary: result.value,
		revision: result.revision
	};
}
//#endregion
//#region src/index.ts
const ROUTE_PREFIX = "/api/dsh-custom-instructions";
const MAX_INSTRUCTIONS_BYTES = MAX_CONTENT_BYTES;
const SMALL_BODY_BYTES = 401408;
const inject = ["webServer"];
var RequestError = class extends Error {
	code;
	status;
	constructor(code, message, status) {
		super(message);
		this.code = code;
		this.status = status;
		this.name = "RequestError";
	}
};
function json(res, payload, status = 200) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(payload));
}
function fail(res, status, code, message) {
	json(res, {
		code,
		message
	}, status);
}
function readBody(req, maxBytes) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let total = 0;
		let tooLarge = false;
		req.on("data", (chunk) => {
			if (tooLarge) return;
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			total += buffer.length;
			if (total > maxBytes) {
				tooLarge = true;
				chunks.length = 0;
				return;
			}
			chunks.push(buffer);
		});
		req.on("end", () => {
			if (tooLarge) {
				reject(new RequestError("PAYLOAD_TOO_LARGE", `request body exceeds ${maxBytes} bytes`, 413));
				return;
			}
			resolve(Buffer.concat(chunks).toString("utf8"));
		});
		req.on("error", reject);
	});
}
async function parseJsonBody(req, maxBytes = SMALL_BODY_BYTES) {
	const text = await readBody(req, maxBytes);
	try {
		const parsed = JSON.parse(text);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("body must be an object");
		return parsed;
	} catch {
		throw new RequestError("INVALID_JSON", "request body must be a JSON object", 400);
	}
}
function expectedRevision(body) {
	if (typeof body.expectedRevision !== "string" || !/^[0-9a-f]{64}$/i.test(body.expectedRevision)) throw new RequestError("EXPECTED_REVISION_REQUIRED", "expectedRevision must be a SHA-256 revision", 400);
	return body.expectedRevision;
}
async function instructionsPath(ctx) {
	const settings = ctx.get("settings");
	if (settings !== void 0) {
		const document = await settings.prepareDocument();
		if (typeof document === "string" && document.length > 0) return join(dirname(document), "AGENTS.md");
	}
	return join(homedir(), ".dsh", "AGENTS.md");
}
function routePath(url) {
	const raw = (url ?? "").split("?")[0];
	if (raw === "/api/dsh-custom-instructions") return [""];
	if (!raw.startsWith(`/api/dsh-custom-instructions/`)) return null;
	try {
		return raw.slice(29).split("/").map((segment) => decodeURIComponent(segment));
	} catch {
		throw new RequestError("BAD_PATH", "request path contains invalid encoding", 400);
	}
}
async function projectView(ctx) {
	const registry = ctx.get("workspaceRegistry");
	if (registry === void 0) return [];
	const workspaces = registry.list();
	return Promise.all(workspaces.map(async (workspace) => {
		const agentsPath = join(workspace.path, "AGENTS.md");
		try {
			await readFile(agentsPath, "utf8");
			return {
				path: workspace.path,
				title: workspace.title,
				agentsPath,
				hasAgents: true,
				status: "present"
			};
		} catch (error) {
			if (error?.code === "ENOENT") return {
				path: workspace.path,
				title: workspace.title,
				agentsPath,
				hasAgents: false,
				status: "missing"
			};
			return {
				path: workspace.path,
				title: workspace.title,
				agentsPath,
				hasAgents: false,
				status: "unreadable",
				message: String(error.message ?? error)
			};
		}
	}));
}
async function personaView(ctx) {
	const presets = ctx.get("agentPresets");
	if (presets === void 0) return {
		view: null,
		available: false,
		reason: "agentPresets service is unavailable"
	};
	try {
		const preset = await presets.resolve();
		const composition = await presets.read(preset.id);
		const match = /- id:\s*persona[\s\S]*?text:\s*\|-?\s*\n([\s\S]*?)(?=\n- id:|\n---|\n\s{2,}\S+:|$)/.exec(composition);
		return {
			view: {
				preset: preset.id,
				persona: match?.[1].trim() ?? ""
			},
			available: true
		};
	} catch (error) {
		return {
			view: null,
			available: false,
			reason: String(error.message ?? error)
		};
	}
}
function handleError(ctx, res, error) {
	if (error instanceof StoreError || error instanceof RequestError) {
		fail(res, error.status, error.code, error.message);
		return;
	}
	ctx.logger.warn(`dsh-custom-instructions: ${String(error)}`);
	fail(res, 500, "INTERNAL_ERROR", "unexpected instruction storage error");
}
function registerCustomInstructionsRoutes(ctx) {
	const handler = async (req, res) => {
		try {
			const globalPath = await instructionsPath(ctx);
			const segments = routePath(req.url);
			if (segments === null) {
				fail(res, 404, "NOT_FOUND", "route was not found");
				return;
			}
			const sub = segments[0] ?? "";
			if (sub === "" && segments.length === 1 && req.method === "GET") {
				const { value: [text, active, backup], revision } = await readConsistent(globalPath, () => Promise.all([
					readGlobal(globalPath),
					readActive(globalPath),
					hasBackup(globalPath)
				]));
				json(res, {
					ok: true,
					path: globalPath,
					text,
					active,
					hasBackup: backup,
					revision,
					maxBytes: MAX_CONTENT_BYTES,
					maxTemplates: 50,
					maxHistory: 100,
					maxImportBytes: MAX_IMPORT_BYTES
				});
				return;
			}
			if (sub === "" && segments.length === 1 && req.method === "PUT") {
				const body = await parseJsonBody(req);
				if (typeof body.text !== "string") throw new RequestError("BAD_REQUEST", "text must be a string", 400);
				const result = await writeGlobal(globalPath, body.text, expectedRevision(body));
				json(res, {
					ok: true,
					path: globalPath,
					active: null,
					maxBytes: MAX_CONTENT_BYTES,
					...result
				});
				return;
			}
			if (sub === "" && segments.length === 1 && req.method === "POST") {
				const body = await parseJsonBody(req);
				if (body.action !== "restore") throw new RequestError("BAD_REQUEST", "action must be \"restore\"", 400);
				json(res, {
					ok: true,
					path: globalPath,
					active: null,
					...await restoreBackup(globalPath, expectedRevision(body))
				});
				return;
			}
			if (sub === "templates" && segments.length === 2 && req.method === "POST" && segments[1] === "activate") {
				const body = await parseJsonBody(req);
				if (typeof body.name !== "string") throw new RequestError("BAD_REQUEST", "name must be a string", 400);
				const result = await activateTemplate(globalPath, body.name, expectedRevision(body));
				json(res, {
					ok: true,
					active: body.name,
					...result
				});
				return;
			}
			if (sub === "templates" && segments.length === 2 && req.method === "GET") {
				const { value: text, revision } = await readConsistent(globalPath, () => readTemplate(globalPath, segments[1]));
				json(res, {
					ok: true,
					name: segments[1],
					text,
					revision
				});
				return;
			}
			if (sub === "templates" && segments.length === 2 && req.method === "PUT") {
				const body = await parseJsonBody(req);
				if (typeof body.text !== "string") throw new RequestError("BAD_REQUEST", "text must be a string", 400);
				json(res, {
					ok: true,
					...await writeTemplate(globalPath, segments[1], body.text, expectedRevision(body))
				});
				return;
			}
			if (sub === "templates" && segments.length === 2 && req.method === "DELETE") {
				const body = await parseJsonBody(req);
				json(res, {
					ok: true,
					...await deleteTemplate(globalPath, segments[1], expectedRevision(body))
				});
				return;
			}
			if (sub === "templates" && segments.length === 1 && req.method === "GET") {
				const { value: [templates, active], revision } = await readConsistent(globalPath, () => Promise.all([listTemplates(globalPath), readActive(globalPath)]));
				json(res, {
					ok: true,
					templates,
					active,
					revision
				});
				return;
			}
			if (sub === "templates" && segments.length === 1 && req.method === "POST") {
				const body = await parseJsonBody(req);
				if (typeof body.name !== "string" || typeof body.text !== "string") throw new RequestError("BAD_REQUEST", "name and text must be strings", 400);
				const result = await writeTemplate(globalPath, body.name, body.text, expectedRevision(body));
				json(res, {
					ok: true,
					name: body.name,
					...result
				});
				return;
			}
			if (sub === "history" && segments.length === 2 && req.method === "GET") {
				const { value: text, revision } = await readConsistent(globalPath, () => readHistory(globalPath, segments[1]));
				json(res, {
					ok: true,
					id: segments[1],
					text,
					revision
				});
				return;
			}
			if (sub === "history" && segments.length === 1 && req.method === "GET") {
				const { value: history, revision } = await readConsistent(globalPath, () => listHistory(globalPath));
				json(res, {
					ok: true,
					history,
					revision
				});
				return;
			}
			if (sub === "history" && segments.length === 2 && req.method === "POST" && segments[1] === "restore") {
				const body = await parseJsonBody(req);
				if (typeof body.id !== "string") throw new RequestError("BAD_REQUEST", "id must be a string", 400);
				json(res, {
					ok: true,
					active: null,
					...await restoreHistory(globalPath, body.id, expectedRevision(body))
				});
				return;
			}
			if (sub === "export" && segments.length === 1 && req.method === "POST") {
				const { value: bundle, revision } = await readConsistent(globalPath, () => exportBundle(globalPath));
				json(res, {
					ok: true,
					bundle,
					revision
				});
				return;
			}
			if (sub === "import" && segments.length === 1 && req.method === "POST") {
				const body = await parseJsonBody(req, MAX_IMPORT_BYTES);
				const result = await importBundle(globalPath, body.bundle, expectedRevision(body));
				json(res, {
					ok: true,
					revision: result.revision,
					...result.summary
				});
				return;
			}
			if (sub === "project" && segments.length === 1 && req.method === "GET") {
				json(res, {
					ok: true,
					source: "workspaceRegistry",
					projects: await projectView(ctx)
				});
				return;
			}
			if (sub === "preset" && segments.length === 1 && req.method === "GET") {
				json(res, {
					ok: true,
					source: "agentPresets",
					...await personaView(ctx)
				});
				return;
			}
			fail(res, 404, "NOT_FOUND", "route was not found");
		} catch (error) {
			handleError(ctx, res, error);
		}
	};
	return [ctx.webServer.register({
		kind: "prefix",
		path: ROUTE_PREFIX,
		handler
	})];
}
function apply(ctx) {
	const disposers = registerCustomInstructionsRoutes(ctx);
	ctx.effect(() => () => {
		for (const dispose of disposers) dispose();
	});
}
//#endregion
export { MAX_INSTRUCTIONS_BYTES, ROUTE_PREFIX, apply, inject, registerCustomInstructionsRoutes };
