import * as vscode from 'vscode';

interface CodeLensConfig {
    enabled: boolean;
    showZeroReferences: boolean;
    onlyShowZeroReferences: boolean;
    excludeTests: boolean;
    showVariables: boolean;
    decorateWithColor: boolean;
    displayMode: 'codelens' | 'inline';
    colors: {
        zero: string;
        one: string;
        few: string;
        many: string;
        lots: string;
    };
}

export class ReferenceLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
    private documentUri: vscode.Uri | undefined;
    private decorationType: vscode.TextEditorDecorationType;
    private disposables: vscode.Disposable[] = [];

    constructor(private context: vscode.ExtensionContext) {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            after: {
                margin: '0 0 0 1em',
                fontStyle: 'italic',
            }
        });

        // Update decorations when active editor changes
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                this.updateInlineDecorations(editor);
            }
        }, null, this.disposables);

        // Update decorations when document changes
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (editor && event.document === editor.document) {
                // Debounce updates
                setTimeout(() => {
                    if (vscode.window.activeTextEditor === editor) {
                        this.updateInlineDecorations(editor);
                    }
                }, 500);
            }
        }, null, this.disposables);

        // Update decorations when configuration changes
        vscode.workspace.onDidChangeConfiguration(() => {
            this._onDidChangeCodeLenses.fire();
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                this.updateInlineDecorations(editor);
            }
        }, null, this.disposables);

        // Initial update
        if (vscode.window.activeTextEditor) {
            this.updateInlineDecorations(vscode.window.activeTextEditor);
        }
    }

    private getConfig(): CodeLensConfig {
        const config = vscode.workspace.getConfiguration('referencex');
        return {
            enabled: config.get('enabled', true),
            showZeroReferences: config.get('showZeroReferences', true),
            onlyShowZeroReferences: config.get('onlyShowZeroReferences', false),
            excludeTests: config.get('excludeTests', false),
            showVariables: config.get('showVariables', false),
            decorateWithColor: config.get('decorateWithColor', true),
            displayMode: config.get('displayMode', 'inline') as 'codelens' | 'inline',
            colors: {
                zero: config.get('colors.zero', '#858585'),
                one: config.get('colors.one', '#4EC9B0'),
                few: config.get('colors.few', '#4EC9B0'),
                many: config.get('colors.many', '#DCDCAA'),
                lots: config.get('colors.lots', '#CE9178')
            }
        };
    }

    private isTestFile(uri: vscode.Uri): boolean {
        const path = uri.fsPath.toLowerCase();
        return path.includes('.test.') ||
               path.includes('.spec.') ||
               path.includes('__tests__') ||
               path.includes('/tests/');
    }

    private async filterImportReferences(locations: vscode.Location[], definitionUri: vscode.Uri): Promise<vscode.Location[]> {
        const filteredLocations: vscode.Location[] = [];

        for (const location of locations) {
            // Always include the definition itself
            if (location.uri.toString() === definitionUri.toString() &&
                location.range.start.line === locations[0]?.range.start.line) {
                filteredLocations.push(location);
                continue;
            }

            try {
                const doc = await vscode.workspace.openTextDocument(location.uri);
                const line = doc.lineAt(location.range.start.line).text.trim();

                // Skip if the line is an import statement
                if (line.startsWith('import ') || line.startsWith('import{') ||
                    line.startsWith('export ') && line.includes(' from ') ||
                    line.match(/^(import|export)\s*\(/)) {
                    continue;
                }

                filteredLocations.push(location);
            } catch {
                // If we can't read the document, include the location
                filteredLocations.push(location);
            }
        }

        return filteredLocations;
    }

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        this.documentUri = document.uri;
        const config = this.getConfig();

        // Only provide CodeLens if in CodeLens mode
        if (!config.enabled || config.displayMode !== 'codelens') {
            return [];
        }

        if (config.excludeTests && this.isTestFile(document.uri)) {
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        const patterns = [
            { regex: /^\s*(export\s+)?(abstract\s+)?class\s+(\w+)(<[^>]*>)?/, type: 'class' },
            { regex: /^\s*(export\s+)?interface\s+(\w+)(<[^>]*>)?/, type: 'interface' },
            { regex: /^\s*(export\s+)?type\s+(\w+)(<[^>]*>)?\s*=/, type: 'type' },
            { regex: /^\s*(export\s+)?(async\s+)?function\s+(\w+)(<[^>]*>)?/, type: 'function' },
            { regex: /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*:\s*[^=]*=\s*(async\s+)?\([^)]*\)\s*=>/, type: 'function' },
            { regex: /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*=>/, type: 'function' },
            // Multi-line arrow functions with type annotation (params on multiple lines)
            { regex: /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*:\s*[^=]*=\s*(async\s+)?\(\s*$/, type: 'function' },
            { regex: /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*:\s*[^=]*=\s*(async\s+)?\(\{\s*$/, type: 'function' },
            // Multi-line arrow functions without type annotation (params on multiple lines)
            { regex: /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(\s*$/, type: 'function' },
            { regex: /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(\{\s*$/, type: 'function' },
            { regex: /^\s*(public|private|protected)?\s*(static\s+)?(async\s+)?(get\s+|set\s+)?(\w+)\s*(<[^>]*>)?\s*\([^)]*\)\s*[:{]/, type: 'method' },
        ];

        // Add variable patterns if showVariables is enabled
        if (config.showVariables) {
            // Match const/let/var but exclude arrow functions (already matched above)
            patterns.push(
                { regex: /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(?![^{]*=>)/, type: 'variable' }
            );
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            for (const pattern of patterns) {
                const match = line.match(pattern.regex);
                if (match) {
                    const range = new vscode.Range(i, 0, i, 0);
                    const codeLens = new vscode.CodeLens(range);
                    codeLenses.push(codeLens);
                    break;
                }
            }
        }

        return codeLenses;
    }

    public async resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): Promise<vscode.CodeLens> {
        if (!this.documentUri) {
            return codeLens;
        }

        const config = this.getConfig();

        try {
            const document = await vscode.workspace.openTextDocument(this.documentUri);

            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                this.documentUri
            );

            if (!symbols || symbols.length === 0) {
                codeLens.command = {
                    title: '$(info) No symbols found',
                    command: ''
                };
                return codeLens;
            }

            const symbol = this.findSymbolAtPosition(symbols, codeLens.range.start);
            if (!symbol) {
                return codeLens;
            }

            const allLocations = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeReferenceProvider',
                this.documentUri,
                symbol.selectionRange.start
            );

            // Filter out import statements from references
            const locations = allLocations ? await this.filterImportReferences(allLocations, this.documentUri) : [];
            const referenceCount = locations.length - 1;
            const displayCount = Math.max(0, referenceCount);

            if (displayCount === 0 && !config.showZeroReferences) {
                return codeLens;
            }

            if (displayCount > 0 && config.onlyShowZeroReferences) {
                return codeLens;
            }

            const { title } = this.formatReferenceText(displayCount, symbol.kind, config);

            codeLens.command = {
                title: title,
                command: displayCount > 0 ? 'editor.action.showReferences' : '',
                arguments: displayCount > 0 ? [
                    this.documentUri,
                    symbol.selectionRange.start,
                    locations
                ] : []
            };

            return codeLens;
        } catch (error) {
            console.error('ReferenceX error:', error);
            codeLens.command = {
                title: '$(error) Error loading references',
                command: ''
            };
            return codeLens;
        }
    }

    private async updateInlineDecorations(editor: vscode.TextEditor) {
        const config = this.getConfig();

        // Only show inline decorations if in inline mode
        if (!config.enabled || config.displayMode !== 'inline') {
            editor.setDecorations(this.decorationType, []);
            return;
        }

        if (config.excludeTests && this.isTestFile(editor.document.uri)) {
            editor.setDecorations(this.decorationType, []);
            return;
        }

        const decorations: vscode.DecorationOptions[] = [];
        const text = editor.document.getText();
        const lines = text.split('\n');

        const patterns = [
            { regex: /^\s*(export\s+)?(abstract\s+)?class\s+(\w+)(<[^>]*>)?/, type: 'class' },

            { regex: /^\s*(export\s+)?interface\s+(\w+)(<[^>]*>)?/, type: 'interface' },

            { regex: /^\s*(export\s+)?type\s+(\w+)(<[^>]*>)?\s*=/, type: 'type' },

            { regex: /^\s*(export\s+)?(async\s+)?function\s+(\w+)(<[^>]*>)?/, type: 'function' },

            { regex: /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*:\s*[^=]*=\s*(async\s+)?\([^)]*\)\s*=>/, type: 'function' },

            { regex: /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*=>/, type: 'function' },

            // Multi-line arrow functions with type annotation (params on multiple lines)
            { regex: /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*:\s*[^=]*=\s*(async\s+)?\(\s*$/, type: 'function' },
            { regex: /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*:\s*[^=]*=\s*(async\s+)?\(\{\s*$/, type: 'function' },

            // Multi-line arrow functions without type annotation (params on multiple lines)
            { regex: /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(\s*$/, type: 'function' },
            { regex: /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\(\{\s*$/, type: 'function' },

            { regex: /^\s*(public|private|protected)?\s*(static\s+)?(async\s+)?(get\s+|set\s+)?(\w+)\s*(<[^>]*>)?\s*\(/, type: 'method' },
        ];

        // Add variable patterns if showVariables is enabled
        if (config.showVariables) {
            // Match const/let/var but exclude arrow functions (already matched above)
            patterns.push(
                { regex: /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(?![^{]*=>)/, type: 'variable' }
            );
        }

        try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                editor.document.uri
            );

            if (!symbols || symbols.length === 0) {
                editor.setDecorations(this.decorationType, []);
                return;
            }

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                for (const pattern of patterns) {
                    const match = line.match(pattern.regex);
                    if (match) {
                        const position = new vscode.Position(i, 0);
                        const symbol = this.findSymbolAtPosition(symbols, position);

                        if (symbol) {
                            const allLocations = await vscode.commands.executeCommand<vscode.Location[]>(
                                'vscode.executeReferenceProvider',
                                editor.document.uri,
                                symbol.selectionRange.start
                            );

                            // Filter out import statements from references
                            const locations = allLocations ? await this.filterImportReferences(allLocations, editor.document.uri) : [];
                            const referenceCount = locations.length - 1;
                            const displayCount = Math.max(0, referenceCount);

                            if (displayCount === 0 && !config.showZeroReferences) {
                                break;
                            }

                            if (displayCount > 0 && config.onlyShowZeroReferences) {
                                break;
                            }

                            const { title, color } = this.formatReferenceText(displayCount, symbol.kind, config);

                            const decoration: vscode.DecorationOptions = {
                                range: new vscode.Range(i, line.length, i, line.length),
                                renderOptions: {
                                    after: {
                                        contentText: ` ${title}`,
                                        color: color,
                                        fontStyle: 'italic'
                                    }
                                }
                            };

                            decorations.push(decoration);
                        }
                        break;
                    }
                }
            }

            editor.setDecorations(this.decorationType, decorations);
        } catch (error) {
            console.error('ReferenceX inline decoration error:', error);
            editor.setDecorations(this.decorationType, []);
        }
    }

    private formatReferenceText(count: number, symbolKind: vscode.SymbolKind, config: CodeLensConfig): { title: string, color: string } {
        let icon: string;
        let colorIndicator = '';
        let color: string;

        if (count === 0) {
            icon = '○';
            color = config.colors.zero;
            colorIndicator = config.decorateWithColor ? '⚪ ' : '';
        } else if (count === 1) {
            icon = '●';
            color = config.colors.one;
            colorIndicator = config.decorateWithColor ? '🔵 ' : '';
        } else if (count < 5) {
            icon = '●';
            color = config.colors.few;
            colorIndicator = config.decorateWithColor ? '🟢 ' : '';
        } else if (count < 10) {
            icon = '●';
            color = config.colors.many;
            colorIndicator = config.decorateWithColor ? '🟡 ' : '';
        } else {
            icon = '🔥';
            color = config.colors.lots;
            colorIndicator = config.decorateWithColor ? '🔥 ' : '';
        }

        const refText = count === 1 ? 'ref' : 'refs';
        const title = `${icon} ${count} ${refText}`;

        return { title, color };
    }

    private findSymbolAtPosition(symbols: vscode.DocumentSymbol[], position: vscode.Position): vscode.DocumentSymbol | undefined {
        for (const symbol of symbols) {
            if (
                symbol.kind === vscode.SymbolKind.Function ||
                symbol.kind === vscode.SymbolKind.Method ||
                symbol.kind === vscode.SymbolKind.Class ||
                symbol.kind === vscode.SymbolKind.Constructor ||
                symbol.kind === vscode.SymbolKind.Interface ||
                symbol.kind === vscode.SymbolKind.TypeParameter ||
                symbol.kind === vscode.SymbolKind.Variable
            ) {
                if (symbol.range.start.line === position.line) {
                    return symbol;
                }
            }

            if (symbol.children && symbol.children.length > 0) {
                const found = this.findSymbolAtPosition(symbol.children, position);
                if (found) {
                    return found;
                }
            }
        }

        return undefined;
    }

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            this.updateInlineDecorations(editor);
        }
    }

    public dispose() {
        this.decorationType.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
