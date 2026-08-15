/**
 * Browser-side API client for the /api/dsh-custom-instructions route family.
 * Plain fetch, same origin — the only data path the settings page uses.
 */
/** Route prefix the host half serves. */
export declare const ROUTE_PREFIX = "/api/dsh-custom-instructions";
/** One instructions read/write response. */
export interface InstructionsResult {
    ok: boolean;
    path?: string;
    text?: string;
    error?: string;
    /** UTF-8 byte cap the DSH workspace-instruction loader accepts. */
    maxBytes?: number;
}
/** Read the current global instructions (empty string when none exist). */
export declare function readInstructions(): Promise<InstructionsResult>;
/** Replace the global instructions. */
export declare function writeInstructions(text: string): Promise<InstructionsResult>;
/** Restore the one-generation backup (undo the last save). */
export declare function restoreInstructions(): Promise<InstructionsResult>;
