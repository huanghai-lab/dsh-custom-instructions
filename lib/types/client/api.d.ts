/**
 * Browser-side API client for the /api/dsh-custom-instructions route family.
 * Plain fetch, same origin — the only data path the instruction center uses.
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
    /** Active template name, or null when editing freely. */
    active?: string | null;
    /** Whether a one-generation backup exists. */
    hasBackup?: boolean;
}
export interface TemplateEntry {
    name: string;
    size: number;
    updatedAt: number;
}
export interface HistoryEntry {
    id: string;
    size: number;
    savedAt: number;
}
export interface ProjectEntry {
    path: string;
    title: string;
    hasAgents: boolean;
}
export interface PresetView {
    preset: string;
    persona: string;
}
export interface ExportBundle {
    format: string;
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
/** Read the current global instructions (empty string when none exist). */
export declare function readInstructions(): Promise<InstructionsResult>;
/** Replace the global instructions. */
export declare function writeInstructions(text: string): Promise<InstructionsResult>;
/** Restore the one-generation backup (undo the last save). */
export declare function restoreInstructions(): Promise<InstructionsResult>;
/** List templates plus the active template name. */
export declare function listTemplates(): Promise<{
    templates: TemplateEntry[];
    active: string | null;
}>;
/** Create or update a named template. */
export declare function saveTemplate(name: string, text: string): Promise<void>;
/** Read one template. */
export declare function readTemplate(name: string): Promise<{
    name: string;
    text: string;
}>;
/** Delete a named template. */
export declare function deleteTemplate(name: string): Promise<void>;
/** Activate a template (copies it into the global instructions). */
export declare function activateTemplate(name: string): Promise<{
    text: string;
}>;
/** List version history (newest first). */
export declare function listHistory(): Promise<{
    history: HistoryEntry[];
}>;
/** Restore a history snapshot as the current content. */
export declare function restoreHistory(id: string): Promise<{
    text: string;
}>;
/** Project-level instruction overview. */
export declare function projectView(): Promise<{
    projects: ProjectEntry[];
}>;
/** Active preset persona overview. */
export declare function presetView(): Promise<{
    view: PresetView | null;
}>;
/** Export the whole instruction center as a JSON bundle. */
export declare function exportBundle(): Promise<{
    bundle: ExportBundle;
}>;
/** Import a bundle. */
export declare function importBundle(bundle: unknown): Promise<{
    imported: number;
}>;
