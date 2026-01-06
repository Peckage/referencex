import * as vscode from 'vscode';

interface UnusedSymbol {
    symbol: vscode.DocumentSymbol;
    uri: vscode.Uri;
    line: number;
    type: string;
}

interface FileWithUnused {
    uri: vscode.Uri;
    unusedSymbols: UnusedSymbol[];
}

export class UnusedCodeScanner {
    private isTestFile(uri: vscode.Uri): boolean {
        const path = uri.fsPath.toLowerCase();
        return path.includes('.test.') ||
               path.includes('.spec.') ||
               path.includes('__tests__') ||
               path.includes('/tests/');
    }

    private getSymbolTypeName(kind: vscode.SymbolKind): string {
        switch (kind) {
            case vscode.SymbolKind.Function: return 'function';
            case vscode.SymbolKind.Method: return 'method';
            case vscode.SymbolKind.Class: return 'class';
            case vscode.SymbolKind.Interface: return 'interface';
            case vscode.SymbolKind.Variable: return 'variable';
            case vscode.SymbolKind.Constant: return 'constant';
            default: return 'symbol';
        }
    }

    private async getUnusedSymbolsInDocument(uri: vscode.Uri, config: any): Promise<UnusedSymbol[]> {
        const unusedSymbols: UnusedSymbol[] = [];

        try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                uri
            );

            if (!symbols || symbols.length === 0) {
                return [];
            }

            const checkSymbol = async (symbol: vscode.DocumentSymbol) => {
                // Only check relevant symbol types
                if (
                    symbol.kind === vscode.SymbolKind.Function ||
                    symbol.kind === vscode.SymbolKind.Method ||
                    symbol.kind === vscode.SymbolKind.Class ||
                    symbol.kind === vscode.SymbolKind.Interface ||
                    (config.showVariables && symbol.kind === vscode.SymbolKind.Variable)
                ) {
                    const locations = await vscode.commands.executeCommand<vscode.Location[]>(
                        'vscode.executeReferenceProvider',
                        uri,
                        symbol.selectionRange.start
                    );

                    const referenceCount = locations ? locations.length - 1 : 0;

                    if (referenceCount === 0) {
                        unusedSymbols.push({
                            symbol,
                            uri,
                            line: symbol.range.start.line,
                            type: this.getSymbolTypeName(symbol.kind)
                        });
                    }
                }

                // Check children recursively
                if (symbol.children && symbol.children.length > 0) {
                    for (const child of symbol.children) {
                        await checkSymbol(child);
                    }
                }
            };

            for (const symbol of symbols) {
                await checkSymbol(symbol);
            }
        } catch (error) {
            console.error(`Error scanning ${uri.fsPath}:`, error);
        }

        return unusedSymbols;
    }

    public async scanWorkspace(): Promise<FileWithUnused[]> {
        const config = vscode.workspace.getConfiguration('referencex');
        const excludeTests = config.get('excludeTests', false);
        const showVariables = config.get('showVariables', false);

        // Find all TypeScript/JavaScript files
        const files = await vscode.workspace.findFiles(
            '**/*.{ts,tsx,js,jsx}',
            '**/node_modules/**'
        );

        const filesWithUnused: FileWithUnused[] = [];

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Scanning for unused code...",
            cancellable: true
        }, async (progress, token) => {
            const totalFiles = files.length;
            let processedFiles = 0;

            for (const file of files) {
                if (token.isCancellationRequested) {
                    break;
                }

                // Skip test files if configured
                if (excludeTests && this.isTestFile(file)) {
                    processedFiles++;
                    continue;
                }

                progress.report({
                    message: `${processedFiles + 1}/${totalFiles} files`,
                    increment: (1 / totalFiles) * 100
                });

                const unusedSymbols = await this.getUnusedSymbolsInDocument(file, {
                    showVariables
                });

                if (unusedSymbols.length > 0) {
                    filesWithUnused.push({
                        uri: file,
                        unusedSymbols
                    });
                }

                processedFiles++;
            }
        });

        return filesWithUnused;
    }

    public async showUnusedCodeOverview() {
        const filesWithUnused = await this.scanWorkspace();

        if (filesWithUnused.length === 0) {
            vscode.window.showInformationMessage('🎉 No unused code found in workspace!');
            return;
        }

        // Create quick pick items
        interface UnusedCodeQuickPickItem extends vscode.QuickPickItem {
            uri?: vscode.Uri;
            line?: number;
        }

        const items: UnusedCodeQuickPickItem[] = [];

        // Add summary item
        const totalUnused = filesWithUnused.reduce((sum, file) => sum + file.unusedSymbols.length, 0);
        items.push({
            label: `$(info) Found ${totalUnused} unused symbol${totalUnused === 1 ? '' : 's'} in ${filesWithUnused.length} file${filesWithUnused.length === 1 ? '' : 's'}`,
            description: '',
            kind: vscode.QuickPickItemKind.Separator
        });

        // Group by file
        for (const file of filesWithUnused) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(file.uri);
            const relativePath = workspaceFolder
                ? vscode.workspace.asRelativePath(file.uri)
                : file.uri.fsPath;

            // File header
            items.push({
                label: `$(file) ${relativePath}`,
                description: `${file.unusedSymbols.length} unused`,
                kind: vscode.QuickPickItemKind.Separator
            });

            // Individual symbols
            for (const unused of file.unusedSymbols) {
                const icon = this.getIconForType(unused.type);
                items.push({
                    label: `  ${icon} ${unused.symbol.name}`,
                    description: `${unused.type} · line ${unused.line + 1}`,
                    detail: relativePath,
                    uri: file.uri,
                    line: unused.line
                });
            }
        }

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select an unused symbol to navigate to it',
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (selected && selected.uri && selected.line !== undefined) {
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
            case 'variable': return '$(symbol-variable)';
            case 'constant': return '$(symbol-constant)';
            default: return '$(symbol-misc)';
        }
    }
}
