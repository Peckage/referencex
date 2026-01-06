import * as vscode from 'vscode';

export class ReferenceHoverProvider implements vscode.HoverProvider {
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

    private findSymbolAtPosition(symbols: vscode.DocumentSymbol[], position: vscode.Position): vscode.DocumentSymbol | undefined {
        for (const symbol of symbols) {
            // Check if position is within the symbol's name range (selectionRange)
            if (symbol.selectionRange.contains(position)) {
                const config = vscode.workspace.getConfiguration('referencex');
                const showVariables = config.get('showVariables', false);

                // Only provide hover for relevant symbol types
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

            // Check children recursively
            if (symbol.children && symbol.children.length > 0) {
                const found = this.findSymbolAtPosition(symbol.children, position);
                if (found) {
                    return found;
                }
            }
        }

        return undefined;
    }

    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        const config = vscode.workspace.getConfiguration('referencex');
        const enabled = config.get('enabled', true);
        const excludeTests = config.get('excludeTests', false);

        if (!enabled) {
            return undefined;
        }

        if (excludeTests && this.isTestFile(document.uri)) {
            return undefined;
        }

        try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            if (!symbols || symbols.length === 0) {
                return undefined;
            }

            const symbol = this.findSymbolAtPosition(symbols, position);
            if (!symbol) {
                return undefined;
            }

            const locations = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeReferenceProvider',
                document.uri,
                symbol.selectionRange.start
            );

            const referenceCount = locations ? locations.length - 1 : 0;
            const displayCount = Math.max(0, referenceCount);

            // Build markdown content
            const symbolType = this.getSymbolTypeName(symbol.kind);
            const markdown = new vscode.MarkdownString();
            markdown.isTrusted = true;
            markdown.supportHtml = true;

            if (displayCount === 0) {
                markdown.appendMarkdown(`**⚠️ Unused ${symbolType}**\n\n`);
                markdown.appendMarkdown(`No references found for \`${symbol.name}\`\n\n`);
                markdown.appendMarkdown('_This code appears to be unused and could potentially be removed._');
            } else {
                const refText = displayCount === 1 ? 'reference' : 'references';
                markdown.appendMarkdown(`**📍 ${displayCount} ${refText}**\n\n`);

                // Create clickable command link
                const args = encodeURIComponent(JSON.stringify([
                    document.uri,
                    symbol.selectionRange.start,
                    locations
                ]));
                const commandUri = `command:editor.action.showReferences?${args}`;
                markdown.appendMarkdown(`[View all references](${commandUri})\n\n`);

                // Show first few reference locations
                if (locations && locations.length > 1) {
                    markdown.appendMarkdown('---\n\n**Reference locations:**\n\n');
                    const maxShow = Math.min(5, locations.length - 1); // -1 to exclude definition
                    let shown = 0;

                    for (const location of locations) {
                        if (shown >= maxShow) break;

                        // Skip the definition itself
                        if (location.uri.toString() === document.uri.toString() &&
                            location.range.start.line === symbol.selectionRange.start.line) {
                            continue;
                        }

                        const workspaceFolder = vscode.workspace.getWorkspaceFolder(location.uri);
                        const relativePath = workspaceFolder
                            ? vscode.workspace.asRelativePath(location.uri)
                            : location.uri.fsPath;

                        markdown.appendMarkdown(`- \`${relativePath}:${location.range.start.line + 1}\`\n`);
                        shown++;
                    }

                    if (locations.length - 1 > maxShow) {
                        markdown.appendMarkdown(`\n_...and ${locations.length - 1 - maxShow} more_`);
                    }
                }
            }

            return new vscode.Hover(markdown, symbol.selectionRange);
        } catch (error) {
            console.error('ReferenceX hover error:', error);
            return undefined;
        }
    }
}
