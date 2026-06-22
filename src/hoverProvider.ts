import * as vscode from 'vscode';
import { ReferenceService } from './referenceService';

export class ReferenceHoverProvider implements vscode.HoverProvider {
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

    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        const config = vscode.workspace.getConfiguration('referencex');
        if (!config.get('enabled', true)) {
            return undefined;
        }
        if (config.get('excludeTests', false) && this.isTestFile(document.uri)) {
            return undefined;
        }

        const opts = { showVariables: config.get('showVariables', false) };

        try {
            const symbols = await this.service.getSymbols(document);
            if (token.isCancellationRequested) {
                return undefined;
            }

            const symbol = this.service.findSymbolAtPosition(symbols, position, opts);
            if (!symbol) {
                return undefined;
            }

            const { count, locations } = await this.service.getReferences(document, symbol);
            if (token.isCancellationRequested) {
                return undefined;
            }

            const symbolType = this.getSymbolTypeName(symbol.kind);
            const markdown = new vscode.MarkdownString();
            markdown.isTrusted = true;

            if (count === 0) {
                markdown.appendMarkdown(`**⚠️ Unused ${symbolType}**\n\n`);
                markdown.appendMarkdown(`No references found for \`${symbol.name}\`\n\n`);
                markdown.appendMarkdown('_This code appears to be unused and could potentially be removed._');
            } else {
                const refText = count === 1 ? 'reference' : 'references';
                markdown.appendMarkdown(`**📍 ${count} ${refText}** to \`${symbol.name}\`\n\n`);

                const args = encodeURIComponent(JSON.stringify([
                    document.uri,
                    symbol.selectionRange.start,
                    locations
                ]));
                markdown.appendMarkdown(`[View all references](command:editor.action.showReferences?${args})\n\n`);

                markdown.appendMarkdown('---\n\n**Reference locations:**\n\n');
                const defKey = document.uri.toString();
                const maxShow = 5;
                let shown = 0;

                for (const location of locations) {
                    // Skip the definition occurrence.
                    if (location.uri.toString() === defKey &&
                        location.range.intersection(symbol.selectionRange)) {
                        continue;
                    }
                    if (shown >= maxShow) {
                        break;
                    }
                    const relativePath = vscode.workspace.asRelativePath(location.uri);
                    const line = location.range.start.line + 1;
                    markdown.appendMarkdown(`- \`${relativePath}:${line}\`\n`);
                    shown++;
                }

                if (count > maxShow) {
                    markdown.appendMarkdown(`\n_…and ${count - maxShow} more_`);
                }
            }

            return new vscode.Hover(markdown, symbol.selectionRange);
        } catch (error) {
            console.error('ReferenceX hover error:', error);
            return undefined;
        }
    }
}
