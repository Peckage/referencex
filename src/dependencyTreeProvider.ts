import * as vscode from 'vscode';

interface SymbolInfo {
    name: string;
    kind: vscode.SymbolKind;
    uri: vscode.Uri;
    range: vscode.Range;
    referenceCount: number;
    references?: vscode.Location[];
}

export class DependencyTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly symbolInfo?: SymbolInfo,
        public readonly itemType?: 'root' | 'file' | 'symbol' | 'reference'
    ) {
        super(label, collapsibleState);

        if (symbolInfo) {
            this.tooltip = this.createTooltip();
            this.description = this.createDescription();
            this.iconPath = this.getIconPath();
            this.contextValue = itemType;

            // Make references clickable
            if (itemType === 'reference' || itemType === 'symbol') {
                this.command = {
                    command: 'referencex.goToLocation',
                    title: 'Go to Location',
                    arguments: [symbolInfo.uri, symbolInfo.range]
                };
            }
        }
    }

    private createTooltip(): string {
        if (!this.symbolInfo) return '';

        const type = this.getSymbolTypeName(this.symbolInfo.kind);
        return `${type} "${this.symbolInfo.name}" - ${this.symbolInfo.referenceCount} references`;
    }

    private createDescription(): string {
        if (!this.symbolInfo) return '';

        if (this.itemType === 'symbol') {
            return `${this.symbolInfo.referenceCount} refs`;
        }

        if (this.itemType === 'reference') {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(this.symbolInfo.uri);
            const relativePath = workspaceFolder
                ? vscode.workspace.asRelativePath(this.symbolInfo.uri)
                : this.symbolInfo.uri.fsPath;
            return `line ${this.symbolInfo.range.start.line + 1}`;
        }

        return '';
    }

    private getIconPath(): vscode.ThemeIcon {
        if (!this.symbolInfo) {
            return new vscode.ThemeIcon('symbol-misc');
        }

        switch (this.symbolInfo.kind) {
            case vscode.SymbolKind.Function:
                return new vscode.ThemeIcon('symbol-function');
            case vscode.SymbolKind.Method:
                return new vscode.ThemeIcon('symbol-method');
            case vscode.SymbolKind.Class:
                return new vscode.ThemeIcon('symbol-class');
            case vscode.SymbolKind.Interface:
                return new vscode.ThemeIcon('symbol-interface');
            case vscode.SymbolKind.Variable:
                return new vscode.ThemeIcon('symbol-variable');
            default:
                return new vscode.ThemeIcon('symbol-misc');
        }
    }

    private getSymbolTypeName(kind: vscode.SymbolKind): string {
        switch (kind) {
            case vscode.SymbolKind.Function: return 'Function';
            case vscode.SymbolKind.Method: return 'Method';
            case vscode.SymbolKind.Class: return 'Class';
            case vscode.SymbolKind.Interface: return 'Interface';
            case vscode.SymbolKind.Variable: return 'Variable';
            default: return 'Symbol';
        }
    }
}

export class DependencyTreeProvider implements vscode.TreeDataProvider<DependencyTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<DependencyTreeItem | undefined | null | void> =
        new vscode.EventEmitter<DependencyTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DependencyTreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private currentSymbol?: SymbolInfo;

    constructor() {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DependencyTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DependencyTreeItem): Promise<DependencyTreeItem[]> {
        if (!element) {
            // Root level - show current symbol or prompt
            if (this.currentSymbol) {
                return [
                    new DependencyTreeItem(
                        `$(symbol-${this.getSymbolIcon(this.currentSymbol.kind)}) ${this.currentSymbol.name}`,
                        vscode.TreeItemCollapsibleState.Expanded,
                        this.currentSymbol,
                        'root'
                    )
                ];
            } else {
                const item = new DependencyTreeItem(
                    '$(info) Select a symbol to view dependencies',
                    vscode.TreeItemCollapsibleState.None
                );
                item.tooltip = 'Right-click on a function, class, or method and select "Show Dependencies"';
                return [item];
            }
        }

        if (element.itemType === 'root' && element.symbolInfo) {
            // Show main categories
            const items: DependencyTreeItem[] = [];

            // Used By section
            const usedByItem = new DependencyTreeItem(
                `$(references) Used By (${element.symbolInfo.referenceCount})`,
                element.symbolInfo.referenceCount > 0
                    ? vscode.TreeItemCollapsibleState.Expanded
                    : vscode.TreeItemCollapsibleState.None
            );
            usedByItem.contextValue = 'usedby';
            usedByItem.tooltip = `${element.symbolInfo.referenceCount} references to this symbol`;
            items.push(usedByItem);

            // Dependencies section (what this symbol uses)
            const depsItem = new DependencyTreeItem(
                '$(type-hierarchy) Dependencies',
                vscode.TreeItemCollapsibleState.Collapsed
            );
            depsItem.contextValue = 'dependencies';
            depsItem.tooltip = 'Symbols that this symbol depends on';
            items.push(depsItem);

            // Impact Analysis
            const impactItem = new DependencyTreeItem(
                '$(circuit-board) Impact Analysis',
                vscode.TreeItemCollapsibleState.Collapsed
            );
            impactItem.contextValue = 'impact';
            impactItem.tooltip = 'Show what would be affected if this symbol is deleted';
            items.push(impactItem);

            return items;
        }

        if (element.contextValue === 'usedby' && this.currentSymbol?.references) {
            // Group references by file
            const referencesByFile = new Map<string, vscode.Location[]>();

            for (const ref of this.currentSymbol.references) {
                // Skip the definition itself
                if (ref.uri.toString() === this.currentSymbol.uri.toString() &&
                    ref.range.start.line === this.currentSymbol.range.start.line) {
                    continue;
                }

                const fileKey = ref.uri.toString();
                if (!referencesByFile.has(fileKey)) {
                    referencesByFile.set(fileKey, []);
                }
                referencesByFile.get(fileKey)!.push(ref);
            }

            const items: DependencyTreeItem[] = [];

            for (const [fileUri, refs] of referencesByFile) {
                const uri = vscode.Uri.parse(fileUri);
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
                const relativePath = workspaceFolder
                    ? vscode.workspace.asRelativePath(uri)
                    : uri.fsPath;

                const fileItem = new DependencyTreeItem(
                    `$(file) ${relativePath}`,
                    vscode.TreeItemCollapsibleState.Expanded
                );
                fileItem.contextValue = 'file';
                fileItem.tooltip = `${refs.length} references in this file`;
                items.push(fileItem);

                // Add individual references
                for (const ref of refs) {
                    const refInfo: SymbolInfo = {
                        name: this.currentSymbol.name,
                        kind: this.currentSymbol.kind,
                        uri: ref.uri,
                        range: ref.range,
                        referenceCount: 0
                    };

                    const refItem = new DependencyTreeItem(
                        `Line ${ref.range.start.line + 1}`,
                        vscode.TreeItemCollapsibleState.None,
                        refInfo,
                        'reference'
                    );
                    items.push(refItem);
                }
            }

            return items;
        }

        if (element.contextValue === 'dependencies' && this.currentSymbol) {
            // Find what symbols this symbol depends on
            const dependencies = await this.findDependencies(this.currentSymbol);

            if (dependencies.length === 0) {
                const item = new DependencyTreeItem(
                    '$(check) No dependencies found',
                    vscode.TreeItemCollapsibleState.None
                );
                item.tooltip = 'This symbol does not reference other symbols in the workspace';
                return [item];
            }

            return dependencies.map(dep => {
                const item = new DependencyTreeItem(
                    `$(symbol-${this.getSymbolIcon(dep.kind)}) ${dep.name}`,
                    vscode.TreeItemCollapsibleState.None,
                    dep,
                    'symbol'
                );
                return item;
            });
        }

        if (element.contextValue === 'impact' && this.currentSymbol) {
            const impact = await this.analyzeImpact(this.currentSymbol);

            const items: DependencyTreeItem[] = [];

            // Summary
            const summaryItem = new DependencyTreeItem(
                impact.canSafelyDelete
                    ? '$(check) Safe to delete'
                    : `$(warning) Would affect ${impact.affectedFiles.size} files`,
                vscode.TreeItemCollapsibleState.None
            );
            summaryItem.tooltip = impact.canSafelyDelete
                ? 'This symbol has no references and can be safely deleted'
                : `Deleting this would affect ${impact.directReferences} direct references`;
            items.push(summaryItem);

            if (!impact.canSafelyDelete) {
                // Show affected files
                for (const [filePath, count] of impact.affectedFiles) {
                    const uri = vscode.Uri.parse(filePath);
                    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
                    const relativePath = workspaceFolder
                        ? vscode.workspace.asRelativePath(uri)
                        : uri.fsPath;

                    const fileItem = new DependencyTreeItem(
                        `$(file) ${relativePath}`,
                        vscode.TreeItemCollapsibleState.None
                    );
                    fileItem.description = `${count} refs`;
                    fileItem.tooltip = `${count} references would need to be updated`;
                    items.push(fileItem);
                }
            }

            return items;
        }

        return [];
    }

    private getSymbolIcon(kind: vscode.SymbolKind): string {
        switch (kind) {
            case vscode.SymbolKind.Function: return 'function';
            case vscode.SymbolKind.Method: return 'method';
            case vscode.SymbolKind.Class: return 'class';
            case vscode.SymbolKind.Interface: return 'interface';
            case vscode.SymbolKind.Variable: return 'variable';
            default: return 'misc';
        }
    }

    async setCurrentSymbol(document: vscode.TextDocument, position: vscode.Position) {
        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );

        if (!symbols) {
            this.currentSymbol = undefined;
            this.refresh();
            return;
        }

        const symbol = this.findSymbolAtPosition(symbols, position);
        if (!symbol) {
            this.currentSymbol = undefined;
            this.refresh();
            return;
        }

        const locations = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            document.uri,
            symbol.selectionRange.start
        );

        this.currentSymbol = {
            name: symbol.name,
            kind: symbol.kind,
            uri: document.uri,
            range: symbol.selectionRange,
            referenceCount: locations ? locations.length - 1 : 0,
            references: locations
        };

        this.refresh();
    }

    private findSymbolAtPosition(symbols: vscode.DocumentSymbol[], position: vscode.Position): vscode.DocumentSymbol | undefined {
        for (const symbol of symbols) {
            if (symbol.selectionRange.contains(position)) {
                const config = vscode.workspace.getConfiguration('referencex');
                const showVariables = config.get('showVariables', false);

                if (
                    symbol.kind === vscode.SymbolKind.Function ||
                    symbol.kind === vscode.SymbolKind.Method ||
                    symbol.kind === vscode.SymbolKind.Class ||
                    symbol.kind === vscode.SymbolKind.Interface ||
                    (showVariables && symbol.kind === vscode.SymbolKind.Variable)
                ) {
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

    private async findDependencies(symbolInfo: SymbolInfo): Promise<SymbolInfo[]> {
        const dependencies: SymbolInfo[] = [];

        try {
            const document = await vscode.workspace.openTextDocument(symbolInfo.uri);
            const text = document.getText(symbolInfo.range);

            // Get all symbols in the workspace
            const files = await vscode.workspace.findFiles(
                '**/*.{ts,tsx,js,jsx}',
                '**/node_modules/**'
            );

            const symbolNames = new Set<string>();

            for (const file of files) {
                const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                    'vscode.executeDocumentSymbolProvider',
                    file
                );

                if (symbols) {
                    this.collectSymbolNames(symbols, symbolNames);
                }
            }

            // Check which symbols are referenced in this symbol's text
            for (const name of symbolNames) {
                if (name !== symbolInfo.name && text.includes(name)) {
                    // Find the symbol info
                    for (const file of files) {
                        const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                            'vscode.executeDocumentSymbolProvider',
                            file
                        );

                        if (symbols) {
                            const dep = this.findSymbolByName(symbols, name, file);
                            if (dep) {
                                dependencies.push(dep);
                                break;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error finding dependencies:', error);
        }

        return dependencies;
    }

    private collectSymbolNames(symbols: vscode.DocumentSymbol[], names: Set<string>) {
        for (const symbol of symbols) {
            if (
                symbol.kind === vscode.SymbolKind.Function ||
                symbol.kind === vscode.SymbolKind.Method ||
                symbol.kind === vscode.SymbolKind.Class ||
                symbol.kind === vscode.SymbolKind.Interface
            ) {
                names.add(symbol.name);
            }

            if (symbol.children) {
                this.collectSymbolNames(symbol.children, names);
            }
        }
    }

    private findSymbolByName(symbols: vscode.DocumentSymbol[], name: string, uri: vscode.Uri): SymbolInfo | undefined {
        for (const symbol of symbols) {
            if (symbol.name === name) {
                return {
                    name: symbol.name,
                    kind: symbol.kind,
                    uri,
                    range: symbol.selectionRange,
                    referenceCount: 0
                };
            }

            if (symbol.children) {
                const found = this.findSymbolByName(symbol.children, name, uri);
                if (found) {
                    return found;
                }
            }
        }

        return undefined;
    }

    private async analyzeImpact(symbolInfo: SymbolInfo): Promise<{
        canSafelyDelete: boolean;
        directReferences: number;
        affectedFiles: Map<string, number>;
    }> {
        const affectedFiles = new Map<string, number>();

        if (symbolInfo.references) {
            for (const ref of symbolInfo.references) {
                // Skip the definition
                if (ref.uri.toString() === symbolInfo.uri.toString() &&
                    ref.range.start.line === symbolInfo.range.start.line) {
                    continue;
                }

                const fileKey = ref.uri.toString();
                affectedFiles.set(fileKey, (affectedFiles.get(fileKey) || 0) + 1);
            }
        }

        return {
            canSafelyDelete: affectedFiles.size === 0,
            directReferences: symbolInfo.referenceCount,
            affectedFiles
        };
    }

    async exportToMermaid(): Promise<string> {
        if (!this.currentSymbol) {
            return 'graph TD\n    A[No symbol selected]';
        }

        let mermaid = 'graph TD\n';
        const symbolId = 'S0';
        mermaid += `    ${symbolId}["${this.currentSymbol.name}"]\n`;
        mermaid += `    style ${symbolId} fill:#4EC9B0\n`;

        // Add references (who uses this)
        if (this.currentSymbol.references) {
            let refId = 1;
            const fileRefs = new Map<string, number>();

            for (const ref of this.currentSymbol.references) {
                if (ref.uri.toString() === this.currentSymbol.uri.toString() &&
                    ref.range.start.line === this.currentSymbol.range.start.line) {
                    continue;
                }

                const workspaceFolder = vscode.workspace.getWorkspaceFolder(ref.uri);
                const relativePath = workspaceFolder
                    ? vscode.workspace.asRelativePath(ref.uri)
                    : ref.uri.fsPath;

                const fileName = relativePath.split('/').pop() || relativePath;
                const fileKey = `F${refId}`;

                if (!fileRefs.has(fileName)) {
                    fileRefs.set(fileName, refId);
                    mermaid += `    ${fileKey}["${fileName}"]\n`;
                    mermaid += `    ${fileKey} --> ${symbolId}\n`;
                    refId++;
                }
            }
        }

        // Add dependencies (what this uses)
        const dependencies = await this.findDependencies(this.currentSymbol);
        for (let i = 0; i < dependencies.length; i++) {
            const depId = `D${i}`;
            mermaid += `    ${depId}["${dependencies[i].name}"]\n`;
            mermaid += `    ${symbolId} --> ${depId}\n`;
            mermaid += `    style ${depId} fill:#DCDCAA\n`;
        }

        return mermaid;
    }
}
