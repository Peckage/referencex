import * as vscode from 'vscode';
import { ReferenceService, mapWithConcurrency } from './referenceService';

interface UnusedSymbol {
    name: string;
    kind: vscode.SymbolKind;
    line: number;
    type: string;
}

interface FileWithUnused {
    uri: vscode.Uri;
    unusedSymbols: UnusedSymbol[];
}

/** Concurrent files scanned at once. */
const FILE_CONCURRENCY = 6;
/** Concurrent reference lookups per file. */
const SYMBOL_CONCURRENCY = 12;

export class UnusedCodeScanner {
    constructor(private readonly service: ReferenceService) {}

    private isTestFile(uri: vscode.Uri): boolean {
        const path = uri.fsPath.toLowerCase().replace(/\\/g, '/');
        return path.includes('.test.') ||
               path.includes('.spec.') ||
               path.includes('__tests__') ||
               path.includes('/tests/') ||
               path.includes('/__mocks__/');
    }

    private getSymbolTypeName(kind: vscode.SymbolKind): string {
        switch (kind) {
            case vscode.SymbolKind.Function: return 'function';
            case vscode.SymbolKind.Method: return 'method';
            case vscode.SymbolKind.Class: return 'class';
            case vscode.SymbolKind.Interface: return 'interface';
            case vscode.SymbolKind.Constructor: return 'constructor';
            case vscode.SymbolKind.Variable: return 'variable';
            case vscode.SymbolKind.Constant: return 'constant';
            default: return 'symbol';
        }
    }

    private async getUnusedSymbolsInDocument(
        uri: vscode.Uri,
        opts: { showVariables: boolean },
        token: vscode.CancellationToken
    ): Promise<UnusedSymbol[]> {
        try {
            const document = await vscode.workspace.openTextDocument(uri);
            const symbols = this.service.collectSymbols(await this.service.getSymbols(document), opts);

            const results = await mapWithConcurrency(symbols, SYMBOL_CONCURRENCY, async symbol => {
                const { count } = await this.service.getReferences(document, symbol);
                if (count > 0) {
                    return undefined;
                }
                return {
                    name: symbol.name,
                    kind: symbol.kind,
                    line: symbol.range.start.line,
                    type: this.getSymbolTypeName(symbol.kind)
                } satisfies UnusedSymbol;
            }, token);

            return results.filter((s): s is UnusedSymbol => s !== undefined);
        } catch (error) {
            console.error(`ReferenceX: error scanning ${uri.fsPath}:`, error);
            return [];
        }
    }

    public async scanWorkspace(): Promise<FileWithUnused[]> {
        const config = vscode.workspace.getConfiguration('referencex');
        const excludeTests = config.get('excludeTests', false);
        const opts = { showVariables: config.get('showVariables', false) };

        const allFiles = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx}', '**/node_modules/**');
        const files = excludeTests ? allFiles.filter(f => !this.isTestFile(f)) : allFiles;

        const filesWithUnused: FileWithUnused[] = [];

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'ReferenceX: scanning for unused code…',
            cancellable: true
        }, async (progress, token) => {
            let processed = 0;
            const total = files.length;

            await mapWithConcurrency(files, FILE_CONCURRENCY, async file => {
                if (token.isCancellationRequested) {
                    return;
                }
                const unusedSymbols = await this.getUnusedSymbolsInDocument(file, opts, token);
                if (unusedSymbols.length > 0) {
                    filesWithUnused.push({ uri: file, unusedSymbols });
                }
                processed++;
                progress.report({
                    message: `${processed}/${total} files`,
                    increment: total > 0 ? (1 / total) * 100 : 0
                });
            }, token);
        });

        // Stable ordering for a predictable list.
        filesWithUnused.sort((a, b) =>
            vscode.workspace.asRelativePath(a.uri).localeCompare(vscode.workspace.asRelativePath(b.uri)));
        return filesWithUnused;
    }

    public async showUnusedCodeOverview(): Promise<void> {
        const filesWithUnused = await this.scanWorkspace();

        if (filesWithUnused.length === 0) {
            vscode.window.showInformationMessage('🎉 No unused code found in workspace!');
            return;
        }

        interface UnusedCodeQuickPickItem extends vscode.QuickPickItem {
            uri?: vscode.Uri;
            line?: number;
        }

        const items: UnusedCodeQuickPickItem[] = [];
        const totalUnused = filesWithUnused.reduce((sum, file) => sum + file.unusedSymbols.length, 0);

        for (const file of filesWithUnused) {
            const relativePath = vscode.workspace.asRelativePath(file.uri);
            items.push({
                label: relativePath,
                description: `${file.unusedSymbols.length} unused`,
                kind: vscode.QuickPickItemKind.Separator
            });

            for (const unused of file.unusedSymbols) {
                items.push({
                    label: `${this.getIconForType(unused.type)} ${unused.name}`,
                    description: `${unused.type} · line ${unused.line + 1}`,
                    detail: relativePath,
                    uri: file.uri,
                    line: unused.line
                });
            }
        }

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Found ${totalUnused} unused symbol${totalUnused === 1 ? '' : 's'} in ${filesWithUnused.length} file${filesWithUnused.length === 1 ? '' : 's'} — select one to navigate`,
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (selected?.uri && selected.line !== undefined) {
            const document = await vscode.workspace.openTextDocument(selected.uri);
            const editor = await vscode.window.showTextDocument(document);
            const position = new vscode.Position(selected.line, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
        }
    }

    private getIconForType(type: string): string {
        switch (type) {
            case 'function': return '$(symbol-function)';
            case 'method': return '$(symbol-method)';
            case 'class': return '$(symbol-class)';
            case 'interface': return '$(symbol-interface)';
            case 'constructor': return '$(symbol-constructor)';
            case 'variable': return '$(symbol-variable)';
            case 'constant': return '$(symbol-constant)';
            default: return '$(symbol-misc)';
        }
    }
}
