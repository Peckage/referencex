import * as vscode from 'vscode';

/**
 * Result of resolving the references for a single symbol.
 */
export interface ReferenceData {
    /**
     * Reference locations with import/re-export statements removed. Still
     * includes the symbol's own definition occurrence so it can be passed
     * straight to `editor.action.showReferences`.
     */
    locations: vscode.Location[];
    /** Number of real references (excludes the definition itself). */
    count: number;
}

export interface SymbolFilterOptions {
    showVariables: boolean;
}

/** Symbol kinds we always track. */
const RELEVANT_KINDS = new Set<vscode.SymbolKind>([
    vscode.SymbolKind.Function,
    vscode.SymbolKind.Method,
    vscode.SymbolKind.Class,
    vscode.SymbolKind.Interface,
    vscode.SymbolKind.Constructor
]);

/** Additional kinds tracked when `showVariables` is enabled. */
const VARIABLE_KINDS = new Set<vscode.SymbolKind>([
    vscode.SymbolKind.Variable,
    vscode.SymbolKind.Constant
]);

export function isRelevantSymbol(kind: vscode.SymbolKind, opts: SymbolFilterOptions): boolean {
    if (RELEVANT_KINDS.has(kind)) {
        return true;
    }
    return opts.showVariables && VARIABLE_KINDS.has(kind);
}

/**
 * Run an async mapper over `items` with a bounded number of in-flight tasks.
 * Used to parallelise the (expensive) language-server reference lookups while
 * avoiding flooding it with hundreds of simultaneous requests.
 */
export async function mapWithConcurrency<T, R>(
    items: readonly T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
    token?: vscode.CancellationToken
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const workerCount = Math.max(1, Math.min(limit, items.length));

    const worker = async () => {
        let index = next++;
        while (index < items.length && !token?.isCancellationRequested) {
            results[index] = await fn(items[index], index);
            index = next++;
        }
    };

    await Promise.all(Array.from({ length: workerCount }, worker));
    return results;
}

/**
 * Centralised, cached access to document symbols and reference counts.
 *
 * A single instance is shared by the CodeLens/inline provider, the hover
 * provider, the unused-code scanner and the dependency tree, so that a render
 * pass that touches the same symbol from several angles only queries the
 * language server once. The cache is keyed by document version and cleared
 * whenever any document changes, keeping results fresh without re-querying on
 * every read.
 */
export class ReferenceService {
    private symbolCache = new Map<string, { version: number; symbols: vscode.DocumentSymbol[] }>();
    private refCache = new Map<string, ReferenceData>();

    /** Drop everything. Call when an edit could have affected any file. */
    public clear(): void {
        this.symbolCache.clear();
        this.refCache.clear();
    }

    public async getSymbols(document: vscode.TextDocument): Promise<vscode.DocumentSymbol[]> {
        const key = document.uri.toString();
        const cached = this.symbolCache.get(key);
        if (cached && cached.version === document.version) {
            return cached.symbols;
        }

        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        ) ?? [];

        this.symbolCache.set(key, { version: document.version, symbols });
        return symbols;
    }

    /**
     * Walk the symbol tree and collect every symbol relevant to the given
     * options, in document order.
     */
    public collectSymbols(
        symbols: vscode.DocumentSymbol[],
        opts: SymbolFilterOptions,
        out: vscode.DocumentSymbol[] = []
    ): vscode.DocumentSymbol[] {
        for (const symbol of symbols) {
            if (isRelevantSymbol(symbol.kind, opts)) {
                out.push(symbol);
            }
            if (symbol.children.length > 0) {
                this.collectSymbols(symbol.children, opts, out);
            }
        }
        return out;
    }

    /**
     * Find the innermost relevant symbol whose name range contains `position`.
     */
    public findSymbolAtPosition(
        symbols: vscode.DocumentSymbol[],
        position: vscode.Position,
        opts: SymbolFilterOptions
    ): vscode.DocumentSymbol | undefined {
        for (const symbol of symbols) {
            if (symbol.children.length > 0) {
                const child = this.findSymbolAtPosition(symbol.children, position, opts);
                if (child) {
                    return child;
                }
            }
            if (symbol.selectionRange.contains(position) && isRelevantSymbol(symbol.kind, opts)) {
                return symbol;
            }
        }
        return undefined;
    }

    /**
     * Resolve the import-filtered references for a symbol, cached by the
     * document version it was defined in.
     */
    public async getReferences(
        document: vscode.TextDocument,
        symbol: vscode.DocumentSymbol
    ): Promise<ReferenceData> {
        const pos = symbol.selectionRange.start;
        const key = `${document.uri.toString()}::${document.version}::${pos.line}:${pos.character}`;
        const cached = this.refCache.get(key);
        if (cached) {
            return cached;
        }

        const all = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            document.uri,
            pos
        ) ?? [];

        const locations = await this.filterImportReferences(all, document.uri, symbol);
        // The definition occurrence is kept in `locations`; subtract it from the count.
        const count = Math.max(0, locations.length - 1);
        const result: ReferenceData = { locations, count };
        this.refCache.set(key, result);
        return result;
    }

    /**
     * Remove import / re-export occurrences from a reference list. The symbol's
     * own definition is always preserved.
     */
    private async filterImportReferences(
        locations: vscode.Location[],
        definitionUri: vscode.Uri,
        symbol: vscode.DocumentSymbol
    ): Promise<vscode.Location[]> {
        if (locations.length === 0) {
            return [];
        }

        // Open each referenced document only once.
        const docsByUri = new Map<string, vscode.TextDocument | null>();
        const getDoc = async (uri: vscode.Uri): Promise<vscode.TextDocument | null> => {
            const k = uri.toString();
            if (docsByUri.has(k)) {
                return docsByUri.get(k)!;
            }
            let doc: vscode.TextDocument | null = null;
            try {
                doc = await vscode.workspace.openTextDocument(uri);
            } catch {
                doc = null;
            }
            docsByUri.set(k, doc);
            return doc;
        };

        const defKey = definitionUri.toString();
        const filtered: vscode.Location[] = [];

        for (const location of locations) {
            // Always keep the definition itself.
            if (location.uri.toString() === defKey &&
                !!location.range.intersection(symbol.selectionRange)) {
                filtered.push(location);
                continue;
            }

            const doc = await getDoc(location.uri);
            if (!doc) {
                filtered.push(location);
                continue;
            }

            const line = doc.lineAt(location.range.start.line).text.trim();
            if (this.isImportLine(line)) {
                continue;
            }
            filtered.push(location);
        }

        return filtered;
    }

    private isImportLine(line: string): boolean {
        // `import ... ` / `import {`  |  `export ... from ...` (re-export)  |  dynamic `import(...)`
        return /^import\b/.test(line) ||
               (/^export\b/.test(line) && /\bfrom\b/.test(line)) ||
               /\bimport\s*\(/.test(line);
    }
}
