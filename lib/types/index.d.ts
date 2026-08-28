/** Host routes for the DSH custom-instructions center. */
import type { Context } from '@deepseek-ai/cordis';
export declare const ROUTE_PREFIX = "/api/dsh-custom-instructions";
export declare const MAX_INSTRUCTIONS_BYTES = 65536;
export declare const inject: string[];
export declare function registerCustomInstructionsRoutes(ctx: Context): Array<() => void>;
export declare function apply(ctx: Context): void;
