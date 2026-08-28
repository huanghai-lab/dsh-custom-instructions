/**
 * File-backed instruction-center store.
 *
 * Every mutation is revision-checked, serialized per DSH home, and written
 * through a same-directory temporary file. Reads remain compatible with the
 * v0.3 layout while new template files use an encoded, path-safe filename.
 */
export declare const MAX_CONTENT_BYTES = 65536;
export declare const MAX_TEMPLATES = 50;
export declare const MAX_HISTORY = 100;
export declare const MAX_IMPORT_BYTES: number;
export type StoreErrorCode = 'BAD_REQUEST' | 'CONTENT_TOO_LARGE' | 'CORRUPT_DATA' | 'LIMIT_EXCEEDED' | 'NOT_FOUND' | 'REVISION_CONFLICT' | 'ROLLBACK_FAILED';
export declare class StoreError extends Error {
    readonly code: StoreErrorCode;
    readonly status: 400 | 404 | 409 | 413 | 500;
    constructor(code: StoreErrorCode, message: string, status: 400 | 404 | 409 | 413 | 500);
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
export interface ExportBundle {
    format: 'dsh-instructions-v2';
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
export interface ImportSummary {
    templates: number;
    history: number;
    currentChanged: boolean;
    active: string | null;
    imported: number;
}
export declare function assertTemplateName(name: string): void;
/** Read the global instructions; absence is the empty instruction set. */
export declare function readGlobal(globalPath: string): Promise<string>;
export declare function hasBackup(globalPath: string): Promise<boolean>;
export declare function listTemplates(globalPath: string): Promise<TemplateEntry[]>;
export declare function readTemplate(globalPath: string, name: string): Promise<string>;
export declare function readActive(globalPath: string): Promise<string | null>;
export declare function listHistory(globalPath: string): Promise<HistoryEntry[]>;
export declare function readHistory(globalPath: string, id: string): Promise<string>;
export declare function getRevision(globalPath: string): Promise<string>;
export declare function readConsistent<T>(globalPath: string, read: () => Promise<T>): Promise<{
    value: T;
    revision: string;
}>;
export declare function writeGlobal(globalPath: string, text: string, expectedRevision: string): Promise<{
    revision: string;
    hasBackup: boolean;
}>;
export declare function restoreBackup(globalPath: string, expectedRevision: string): Promise<{
    text: string;
    revision: string;
    hasBackup: boolean;
}>;
export declare function writeTemplate(globalPath: string, name: string, text: string, expectedRevision: string): Promise<{
    revision: string;
}>;
export declare function deleteTemplate(globalPath: string, name: string, expectedRevision: string): Promise<{
    revision: string;
    active: string | null;
}>;
export declare function activateTemplate(globalPath: string, name: string, expectedRevision: string): Promise<{
    text: string;
    revision: string;
    hasBackup: boolean;
}>;
export declare function restoreHistory(globalPath: string, id: string, expectedRevision: string): Promise<{
    text: string;
    revision: string;
    hasBackup: boolean;
}>;
export declare function exportBundle(globalPath: string): Promise<ExportBundle>;
export declare function importBundle(globalPath: string, bundle: unknown, expectedRevision: string): Promise<{
    summary: ImportSummary;
    revision: string;
}>;
