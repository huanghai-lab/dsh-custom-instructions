/**
 * Custom instructions editor client plugin — registers the settings page
 * (设置 → 自定义指令) into `settings.section`. The page edits the global
 * instruction file (~/.dsh/AGENTS.md) served by the host route family.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
/** Required services. */
export declare const inject: string[];
/**
 * Register the custom-instructions settings page.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
