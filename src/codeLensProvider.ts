import * as vscode from 'vscode';
import { ReferenceService, mapWithConcurrency } from './referenceService';

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

const SUPPORTED_LANGUAGES = new Set([
    'typescript',
    'javascript',
    'typescriptreact',
    'javascriptreact'
]);

/** Max concurrent reference-provider requests per render pass. */
const REFERENCE_CONCURRENCY = 12;
/** How long to wait after the last edit before recomputing (ms). */
const REFRESH_DEBOUNCE_MS = 400;

export class ReferenceLensProvider implements vscode.CodeLensProvider {
    private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    private readonly decorationType: vscode.TextEditorDecorationType;
    private readonly disposables: vscode.Disposable[] = [];
    private debounceTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(private readonly service: ReferenceService) {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            after: { margin: '0 0 0 1em', fontStyle: 'italic' }
        });

        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                void this.updateEditor(editor);
            }
        }, null, this.disposables);

        vscode.workspace.onDidChangeTextDocument(event => {
            if (!SUPPORTED_LANGUAGES.has(event.document.languageId)) {
                return;
            }
            // An edit anywhere can change reference counts everywhere.
            this.service.clear();
            this._onDidChangeCodeLenses.fire();
            this.scheduleDecorationUpdate();
        }, null, this.disposables);

        vscode.workspace.onDidChangeConfiguration(e => {
            if (!e.affectsConfiguration('referencex')) {
                return;
            }
            this._onDidChangeCodeLenses.fire();
            this.updateVisibleEditors();
        }, null, this.disposables);

        this.updateVisibleEditors();
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
        const path = uri.fsPath.toLowerCase().replace(/\\/g, '/');
        return path.includes('.test.') ||
               path.includes('.spec.') ||
               path.includes('__tests__') ||
               path.includes('/tests/') ||
               path.includes('/__mocks__/');
    }

    /** True when a symbol with the given count should be displayed. */
    private shouldShow(count: number, config: CodeLensConfig): boolean {
        if (count === 0 && !config.showZeroReferences) {
            return false;
        }
        if (count > 0 && config.onlyShowZeroReferences) {
            return false;
        }
        return true;
    }

    // ---- CodeLens mode -----------------------------------------------------

    public async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        const config = this.getConfig();
        if (!config.enabled || config.displayMode !== 'codelens') {
            return [];
        }
        if (config.excludeTests && this.isTestFile(document.uri)) {
            return [];
        }

        const symbols = this.service.collectSymbols(
            await this.service.getSymbols(document),
            { showVariables: config.showVariables }
        );
        if (token.isCancellationRequested) {
            return [];
        }

        const lenses = await mapWithConcurrency(symbols, REFERENCE_CONCURRENCY, async symbol => {
            const { count, locations } = await this.service.getReferences(document, symbol);
            if (!this.shouldShow(count, config)) {
                return undefined;
            }

            const { title } = this.formatReferenceText(count, config);
            const line = symbol.selectionRange.start.line;
            return new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
                title,
                command: count > 0 ? 'editor.action.showReferences' : '',
                arguments: count > 0 ? [document.uri, symbol.selectionRange.start, locations] : []
            });
        }, token);

        return lenses.filter((l): l is vscode.CodeLens => l !== undefined);
    }

    // ---- Inline mode -------------------------------------------------------

    private scheduleDecorationUpdate(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = undefined;
            this.updateVisibleEditors();
        }, REFRESH_DEBOUNCE_MS);
    }

    private updateVisibleEditors(): void {
        for (const editor of vscode.window.visibleTextEditors) {
            void this.updateEditor(editor);
        }
    }

    private async updateEditor(editor: vscode.TextEditor): Promise<void> {
        const document = editor.document;
        if (!SUPPORTED_LANGUAGES.has(document.languageId)) {
            return;
        }

        const config = this.getConfig();
        if (!config.enabled || config.displayMode !== 'inline' ||
            (config.excludeTests && this.isTestFile(document.uri))) {
            editor.setDecorations(this.decorationType, []);
            return;
        }

        const version = document.version;
        const symbols = this.service.collectSymbols(
            await this.service.getSymbols(document),
            { showVariables: config.showVariables }
        );

        const decorations = await mapWithConcurrency(symbols, REFERENCE_CONCURRENCY, async symbol => {
            const { count } = await this.service.getReferences(document, symbol);
            if (!this.shouldShow(count, config)) {
                return undefined;
            }
            const { title, color } = this.formatReferenceText(count, config);
            const lineEnd = document.lineAt(symbol.selectionRange.start.line).range.end;
            const decoration: vscode.DecorationOptions = {
                range: new vscode.Range(lineEnd, lineEnd),
                renderOptions: {
                    after: { contentText: ` ${title}`, color, fontStyle: 'italic' }
                }
            };
            return decoration;
        });

        // Drop the result if the document changed or the editor is gone.
        if (document.version !== version || !vscode.window.visibleTextEditors.includes(editor)) {
            return;
        }

        editor.setDecorations(
            this.decorationType,
            decorations.filter((d): d is vscode.DecorationOptions => d !== undefined)
        );
    }

    private formatReferenceText(count: number, config: CodeLensConfig): { title: string; color: string } {
        let icon: string;
        let color: string;

        if (count === 0) {
            icon = config.decorateWithColor ? '⚪' : '○';
            color = config.colors.zero;
        } else if (count === 1) {
            icon = config.decorateWithColor ? '🔵' : '●';
            color = config.colors.one;
        } else if (count < 5) {
            icon = config.decorateWithColor ? '🟢' : '●';
            color = config.colors.few;
        } else if (count < 10) {
            icon = config.decorateWithColor ? '🟡' : '●';
            color = config.colors.many;
        } else {
            icon = '🔥';
            color = config.colors.lots;
        }

        const title = `${icon} ${count} ${count === 1 ? 'ref' : 'refs'}`;
        return { title, color };
    }

    public refresh(): void {
        this.service.clear();
        this._onDidChangeCodeLenses.fire();
        this.updateVisibleEditors();
    }

    public dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.decorationType.dispose();
        this._onDidChangeCodeLenses.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}
