import * as vscode from 'vscode';
import { ReferenceService } from './referenceService';

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
        if (!this.symbolInfo) {
            return '';
        }
        const type = this.getSymbolTypeName(this.symbolInfo.kind);
        return `${type} "${this.symbolInfo.name}" — ${this.symbolInfo.referenceCount} references`;
    }

    private createDescription(): string {
        if (!this.symbolInfo) {
            return '';
        }
        if (this.itemType === 'symbol') {
            return `${this.symbolInfo.referenceCount} refs`;
        }
        if (this.itemType === 'reference') {
            return `line ${this.symbolInfo.range.start.line + 1}`;
        }
        return '';
    }

    private getIconPath(): vscode.ThemeIcon {
        return new vscode.ThemeIcon(`symbol-${getSymbolIcon(this.symbolInfo?.kind)}`);
    }

    private getSymbolTypeName(kind: vscode.SymbolKind): string {
        switch (kind) {
            case vscode.SymbolKind.Function: return 'Function';
            case vscode.SymbolKind.Method: return 'Method';
            case vscode.SymbolKind.Class: return 'Class';
            case vscode.SymbolKind.Interface: return 'Interface';
            case vscode.SymbolKind.Constructor: return 'Constructor';
            case vscode.SymbolKind.Variable: return 'Variable';
            default: return 'Symbol';
        }
    }
}

function getSymbolIcon(kind: vscode.SymbolKind | undefined): string {
    switch (kind) {
        case vscode.SymbolKind.Function: return 'function';
        case vscode.SymbolKind.Method: return 'method';
        case vscode.SymbolKind.Class: return 'class';
        case vscode.SymbolKind.Interface: return 'interface';
        case vscode.SymbolKind.Constructor: return 'constructor';
        case vscode.SymbolKind.Variable: return 'variable';
        default: return 'misc';
    }
}

export class DependencyTreeProvider implements vscode.TreeDataProvider<DependencyTreeItem> {
    private readonly _onDidChangeTreeData =
        new vscode.EventEmitter<DependencyTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private currentSymbol?: SymbolInfo;
    /** Outgoing-call dependencies, computed once per selected symbol. */
    private dependencyCache?: SymbolInfo[];

    constructor(private readonly service: ReferenceService) {}

    refresh(): void {
        this.dependencyCache = undefined;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: DependencyTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: DependencyTreeItem): Promise<DependencyTreeItem[]> {
        if (!element) {
            if (!this.currentSymbol) {
                const item = new DependencyTreeItem(
                    '$(info) Select a symbol to view dependencies',
                    vscode.TreeItemCollapsibleState.None
                );
                item.tooltip = 'Right-click a function, class, or method and choose "Show Dependencies"';
                return [item];
            }
            return [
                new DependencyTreeItem(
                    `$(symbol-${getSymbolIcon(this.currentSymbol.kind)}) ${this.currentSymbol.name}`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    this.currentSymbol,
                    'root'
                )
            ];
        }

        if (element.itemType === 'root' && element.symbolInfo) {
            const usedBy = new DependencyTreeItem(
                `$(references) Used By (${element.symbolInfo.referenceCount})`,
                element.symbolInfo.referenceCount > 0
                    ? vscode.TreeItemCollapsibleState.Expanded
                    : vscode.TreeItemCollapsibleState.None
            );
            usedBy.contextValue = 'usedby';
            usedBy.tooltip = `${element.symbolInfo.referenceCount} references to this symbol`;

            const deps = new DependencyTreeItem(
                '$(type-hierarchy) Dependencies',
                vscode.TreeItemCollapsibleState.Collapsed
            );
            deps.contextValue = 'dependencies';
            deps.tooltip = 'Symbols that this symbol calls or uses';

            const impact = new DependencyTreeItem(
                '$(circuit-board) Impact Analysis',
                vscode.TreeItemCollapsibleState.Collapsed
            );
            impact.contextValue = 'impact';
            impact.tooltip = 'What would be affected if this symbol is deleted';

            return [usedBy, deps, impact];
        }

        if (element.contextValue === 'usedby' && this.currentSymbol) {
            return this.buildUsedByItems(this.currentSymbol);
        }

        if (element.contextValue === 'dependencies' && this.currentSymbol) {
            const dependencies = await this.getDependencies(this.currentSymbol);
            if (dependencies.length === 0) {
                const item = new DependencyTreeItem(
                    '$(check) No dependencies found',
                    vscode.TreeItemCollapsibleState.None
                );
                item.tooltip = 'This symbol does not call other symbols in the workspace';
                return [item];
            }
            return dependencies.map(dep => new DependencyTreeItem(
                `$(symbol-${getSymbolIcon(dep.kind)}) ${dep.name}`,
                vscode.TreeItemCollapsibleState.None,
                dep,
                'symbol'
            ));
        }

        if (element.contextValue === 'impact' && this.currentSymbol) {
            return this.buildImpactItems(this.currentSymbol);
        }

        return [];
    }

    private buildUsedByItems(symbol: SymbolInfo): DependencyTreeItem[] {
        const referencesByFile = new Map<string, vscode.Location[]>();
        for (const ref of symbol.references ?? []) {
            if (this.isDefinition(ref, symbol)) {
                continue;
            }
            const fileKey = ref.uri.toString();
            const list = referencesByFile.get(fileKey) ?? [];
            list.push(ref);
            referencesByFile.set(fileKey, list);
        }

        const items: DependencyTreeItem[] = [];
        for (const [fileUri, refs] of referencesByFile) {
            const uri = vscode.Uri.parse(fileUri);
            const fileItem = new DependencyTreeItem(
                `$(file) ${vscode.workspace.asRelativePath(uri)}`,
                vscode.TreeItemCollapsibleState.Expanded
            );
            fileItem.contextValue = 'file';
            fileItem.description = `${refs.length} ref${refs.length === 1 ? '' : 's'}`;
            fileItem.tooltip = `${refs.length} references in this file`;
            items.push(fileItem);

            for (const ref of refs) {
                items.push(new DependencyTreeItem(
                    `Line ${ref.range.start.line + 1}`,
                    vscode.TreeItemCollapsibleState.None,
                    { name: symbol.name, kind: symbol.kind, uri: ref.uri, range: ref.range, referenceCount: 0 },
                    'reference'
                ));
            }
        }
        return items;
    }

    private buildImpactItems(symbol: SymbolInfo): DependencyTreeItem[] {
        const affectedFiles = new Map<string, number>();
        for (const ref of symbol.references ?? []) {
            if (this.isDefinition(ref, symbol)) {
                continue;
            }
            const key = ref.uri.toString();
            affectedFiles.set(key, (affectedFiles.get(key) ?? 0) + 1);
        }

        const canSafelyDelete = affectedFiles.size === 0;
        const summary = new DependencyTreeItem(
            canSafelyDelete
                ? '$(check) Safe to delete'
                : `$(warning) Would affect ${affectedFiles.size} file${affectedFiles.size === 1 ? '' : 's'}`,
            vscode.TreeItemCollapsibleState.None
        );
        summary.tooltip = canSafelyDelete
            ? 'This symbol has no references and can be safely deleted'
            : `Deleting this would affect ${symbol.referenceCount} direct references`;

        const items: DependencyTreeItem[] = [summary];
        for (const [filePath, count] of affectedFiles) {
            const uri = vscode.Uri.parse(filePath);
            const fileItem = new DependencyTreeItem(
                `$(file) ${vscode.workspace.asRelativePath(uri)}`,
                vscode.TreeItemCollapsibleState.None
            );
            fileItem.description = `${count} ref${count === 1 ? '' : 's'}`;
            fileItem.tooltip = `${count} references would need to be updated`;
            items.push(fileItem);
        }
        return items;
    }

    private isDefinition(ref: vscode.Location, symbol: SymbolInfo): boolean {
        return ref.uri.toString() === symbol.uri.toString() &&
               !!ref.range.intersection(symbol.range);
    }

    async setCurrentSymbol(document: vscode.TextDocument, position: vscode.Position): Promise<void> {
        const opts = { showVariables: vscode.workspace.getConfiguration('referencex').get('showVariables', false) };
        const symbols = await this.service.getSymbols(document);
        const symbol = this.service.findSymbolAtPosition(symbols, position, opts);

        if (!symbol) {
            this.currentSymbol = undefined;
            vscode.window.showInformationMessage('ReferenceX: place the cursor on a function, class, method, or interface name.');
            this.refresh();
            return;
        }

        const { count, locations } = await this.service.getReferences(document, symbol);
        this.currentSymbol = {
            name: symbol.name,
            kind: symbol.kind,
            uri: document.uri,
            range: symbol.selectionRange,
            referenceCount: count,
            references: locations
        };
        this.refresh();
    }

    /**
     * Resolve what the current symbol depends on using the language server's
     * call-hierarchy provider (accurate "outgoing calls"), cached per selection.
     */
    private async getDependencies(symbol: SymbolInfo): Promise<SymbolInfo[]> {
        if (this.dependencyCache) {
            return this.dependencyCache;
        }

        const deps: SymbolInfo[] = [];
        try {
            const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                'vscode.prepareCallHierarchy',
                symbol.uri,
                symbol.range.start
            );

            if (items && items.length > 0) {
                const outgoing = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
                    'vscode.provideOutgoingCalls',
                    items[0]
                ) ?? [];

                const seen = new Set<string>();
                for (const call of outgoing) {
                    const to = call.to;
                    const key = `${to.uri.toString()}::${to.name}::${to.selectionRange.start.line}`;
                    // Skip self-recursion and duplicates.
                    if (seen.has(key) ||
                        (to.uri.toString() === symbol.uri.toString() && to.name === symbol.name)) {
                        continue;
                    }
                    seen.add(key);
                    deps.push({
                        name: to.name,
                        kind: to.kind,
                        uri: to.uri,
                        range: to.selectionRange,
                        referenceCount: 0
                    });
                }
            }
        } catch (error) {
            console.error('ReferenceX: error finding dependencies:', error);
        }

        deps.sort((a, b) => a.name.localeCompare(b.name));
        this.dependencyCache = deps;
        return deps;
    }

    async exportToMermaid(): Promise<string> {
        if (!this.currentSymbol) {
            return 'graph TD\n    A["No symbol selected"]';
        }

        const lines = ['graph TD'];
        const rootId = 'S0';
        lines.push(`    ${rootId}["${escapeMermaid(this.currentSymbol.name)}"]`);
        lines.push(`    style ${rootId} fill:#4EC9B0`);

        // Who uses this symbol, grouped by file.
        const fileIds = new Map<string, string>();
        for (const ref of this.currentSymbol.references ?? []) {
            if (this.isDefinition(ref, this.currentSymbol)) {
                continue;
            }
            const fileName = vscode.workspace.asRelativePath(ref.uri).split('/').pop() ?? ref.uri.fsPath;
            if (!fileIds.has(fileName)) {
                const id = `F${fileIds.size}`;
                fileIds.set(fileName, id);
                lines.push(`    ${id}["${escapeMermaid(fileName)}"]`);
                lines.push(`    ${id} --> ${rootId}`);
            }
        }

        // What this symbol depends on.
        const dependencies = await this.getDependencies(this.currentSymbol);
        dependencies.forEach((dep, i) => {
            const id = `D${i}`;
            lines.push(`    ${id}["${escapeMermaid(dep.name)}"]`);
            lines.push(`    ${rootId} --> ${id}`);
            lines.push(`    style ${id} fill:#DCDCAA`);
        });

        return lines.join('\n') + '\n';
    }
}

/** Make a label safe inside a Mermaid `["..."]` node. */
function escapeMermaid(label: string): string {
    return label.replace(/"/g, '#quot;').replace(/[\r\n]+/g, ' ');
}
