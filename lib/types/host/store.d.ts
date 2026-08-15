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
/** One template entry in a listing. */
export interface TemplateEntry {
    name: string;
    size: number;
    updatedAt: number;
}
/** One history entry in a listing. */
export interface HistoryEntry {
    id: string;
    size: number;
    savedAt: number;
}
/** Full export bundle (templates + history + the live content). */
export interface ExportBundle {
    format: 'dsh-instructions-v1';
    exportedAt: number;
    active: string | null;
    current: string;
    templates: Array<{
        name: string;
        text: string;
    }>;
    history: Array<{
        id: string;
        text: string;
    }>;
}
export declare function assertTemplateName(name: string): void;
/** Read the global instructions; empty string when absent, throws on other errors. */
export declare function readGlobal(globalPath: string): Promise<string>;
/**
 * Replace the global instructions, rotating the previous content into .bak
 * and appending it to the version history.
 */
export declare function writeGlobal(globalPath: string, text: string): Promise<void>;
/** Restore the .bak over the current content. */
export declare function restoreBackup(globalPath: string): Promise<string>;
export declare function hasBackup(globalPath: string): Promise<boolean>;
/** List templates (name-ordered). */
export declare function listTemplates(globalPath: string): Promise<TemplateEntry[]>;
export declare function readTemplate(globalPath: string, name: string): Promise<string>;
export declare function writeTemplate(globalPath: string, name: string, text: string): Promise<void>;
export declare function deleteTemplate(globalPath: string, name: string): Promise<void>;
/** The active template name, or null when the user edits freely. */
export declare function readActive(globalPath: string): Promise<string | null>;
/**
 * Activate a template: copy its content into the global file (with history
 * rotation) and record it as active.
 */
export declare function activateTemplate(globalPath: string, name: string): Promise<string>;
/** List history entries (newest first). */
export declare function listHistory(globalPath: string): Promise<HistoryEntry[]>;
export declare function readHistory(globalPath: string, id: string): Promise<string>;
/** Restore a history snapshot as the current content. */
export declare function restoreHistory(globalPath: string, id: string): Promise<string>;
/** Export the whole instruction center as one JSON bundle. */
export declare function exportBundle(globalPath: string): Promise<ExportBundle>;
/** Import a bundle: replaces templates and history, keeps current content if absent. */
export declare function importBundle(globalPath: string, bundle: unknown): Promise<number>;
