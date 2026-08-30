/** Browser API client for /api/dsh-custom-instructions. */
export declare const ROUTE_PREFIX = "/api/dsh-custom-instructions";
export declare class ApiError extends Error {
    readonly code: string;
    readonly status: number;
    constructor(code: string, message: string, status: number);
}
export interface InstructionsResult {
    ok: true;
    path: string;
    text: string;
    revision: string;
    maxBytes: number;
    maxTemplates: number;
    maxHistory: number;
    maxImportBytes: number;
    active: string | null;
    hasBackup: boolean;
    templates: TemplateEntry[];
    history: HistoryEntry[];
}
export interface MutationResult {
    ok: true;
    revision: string;
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
    agentsPath: string;
    hasAgents: boolean;
    status: 'present' | 'missing' | 'unreadable';
    message?: string;
}
export interface ExportBundle {
    format?: 'dsh-instructions-v1' | 'dsh-instructions-v2';
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
export interface ImportResult extends MutationResult {
    templates: number;
    history: number;
    currentChanged: boolean;
    active: string | null;
    imported: number;
}
export declare function readInstructions(): Promise<InstructionsResult>;
export declare function writeInstructions(text: string, expectedRevision: string): Promise<MutationResult & {
    hasBackup: boolean;
    active: null;
}>;
export declare function restoreInstructions(expectedRevision: string): Promise<MutationResult & {
    text: string;
    hasBackup: boolean;
    active: null;
}>;
export declare function listTemplates(): Promise<{
    templates: TemplateEntry[];
    active: string | null;
    revision: string;
}>;
export declare function saveTemplate(name: string, text: string, expectedRevision: string): Promise<MutationResult>;
export declare function updateTemplate(name: string, text: string, expectedRevision: string): Promise<MutationResult>;
export declare function readTemplate(name: string): Promise<{
    name: string;
    text: string;
    revision: string;
}>;
export declare function deleteTemplate(name: string, expectedRevision: string): Promise<MutationResult & {
    active: string | null;
}>;
export declare function activateTemplate(name: string, expectedRevision: string): Promise<MutationResult & {
    text: string;
    active: string;
    hasBackup: boolean;
}>;
export declare function listHistory(): Promise<{
    history: HistoryEntry[];
    revision: string;
}>;
export declare function readHistory(id: string): Promise<{
    id: string;
    text: string;
    revision: string;
}>;
export declare function restoreHistory(id: string, expectedRevision: string): Promise<MutationResult & {
    text: string;
    active: null;
    hasBackup: boolean;
}>;
export declare function projectView(): Promise<{
    projects: ProjectEntry[];
    source: string;
}>;
export declare function exportBundle(): Promise<{
    bundle: ExportBundle;
    revision: string;
}>;
export declare function importBundle(bundle: unknown, expectedRevision: string): Promise<ImportResult>;
