/**
 * dsh-custom-instructions — host half: the instruction center backend.
 *
 * One route family under /api/dsh-custom-instructions that manages the user's
 * global instruction file (~/.dsh/AGENTS.md), named instruction templates,
 * version history, backup/restore, import/export, plus read-only views of
 * project-level instructions and the active agent preset's persona. The
 * browser half (./client) renders the 设置 → 自定义指令 page.
 *
 * Files live in $DSH_HOME (outside the session workspace), so they are
 * mutated through node:fs directly — same precedent as the dsh-web-ui
 * family's host stores (dsh-ssh). The webServer service carries the routes.
 */
import type { Context } from '@deepseek-ai/cordis';
/** Route prefix for this plugin's JSON operations. */
export declare const ROUTE_PREFIX = "/api/dsh-custom-instructions";
/** UTF-8 byte cap the DSH workspace-instruction loader accepts. */
export declare const MAX_INSTRUCTIONS_BYTES = 65536;
export declare const inject: string[];
/**
 * Register the instruction-center route family.
 * @param ctx - context carrying webServer.
 * @returns the route disposers.
 */
export declare function registerCustomInstructionsRoutes(ctx: Context): Array<() => void>;
/**
 * Plugin entry. Registers the instruction-center route family.
 * @param ctx - the plugin context (webServer injected).
 */
export declare function apply(ctx: Context): void;
