/**
 * dsh-custom-instructions — host half.
 *
 * Serves the global-instructions editor backend: one route family under
 * /api/dsh-custom-instructions that reads and writes the user's global
 * instruction file (~/.dsh/AGENTS.md, resolved through the settings
 * document's directory so DSH_HOME overrides work). The browser half
 * (./client) renders the settings page (设置 → 自定义指令).
 *
 * The instructions file lives in $DSH_HOME (outside the session workspace),
 * so the file is mutated through node:fs directly — same precedent as the
 * dsh-web-ui family's host stores (dsh-ssh). The webServer service carries
 * the routes. No dsh source changes, hot-pluggable via a cordis.patch.yml row.
 */
import type { Context } from '@deepseek-ai/cordis';
/** Route prefix for this plugin's JSON operations. */
export declare const ROUTE_PREFIX = "/api/dsh-custom-instructions";
/** UTF-8 byte cap the DSH workspace-instruction loader accepts. */
export declare const MAX_INSTRUCTIONS_BYTES = 65536;
export declare const inject: string[];
/**
 * Register the route family:
 * - GET   — current instructions (empty only on ENOENT; other errors surface)
 * - PUT   — replace instructions; the previous content is rotated into
 *           `<path>.bak` first (one-generation rollback)
 * - POST  — restore the backup over the current content (undo last save)
 * @param ctx - context carrying webServer.
 * @returns the route disposers.
 */
export declare function registerCustomInstructionsRoutes(ctx: Context): Array<() => void>;
/**
 * Plugin entry. Registers the route family for the web GUI.
 * @param ctx - the plugin context (webServer injected).
 */
export declare function apply(ctx: Context): void;
