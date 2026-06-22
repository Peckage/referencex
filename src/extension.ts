import * as vscode from 'vscode';
import { ReferenceLensProvider } from './codeLensProvider';
import { UnusedCodeScanner } from './unusedCodeScanner';
import { ReferenceHoverProvider } from './hoverProvider';
import { DependencyTreeProvider } from './dependencyTreeProvider';
import { ReferenceService } from './referenceService';

const SUPPORTED_LANGUAGES = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'];

export function activate(context: vscode.ExtensionContext) {
    // One shared service so a render pass that touches a symbol from several
    // angles (CodeLens, hover, tree) only hits the language server once.
    const service = new ReferenceService();

    const provider = new ReferenceLensProvider(service);
    context.subscriptions.push(provider);

    const hoverProvider = new ReferenceHoverProvider(service);

    for (const language of SUPPORTED_LANGUAGES) {
        const selector: vscode.DocumentSelector = { language, scheme: 'file' };
        context.subscriptions.push(
            vscode.languages.registerCodeLensProvider(selector, provider),
            vscode.languages.registerHoverProvider(selector, hoverProvider)
        );
    }

    // Keep the shared cache fresh: any saved/created/deleted file can change
    // reference counts elsewhere. (In-memory edits are handled by the provider.)
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(() => service.clear()),
        vscode.workspace.onDidCreateFiles(() => service.clear()),
        vscode.workspace.onDidDeleteFiles(() => service.clear()),
        vscode.workspace.onDidRenameFiles(() => service.clear())
    );

    // Unused code scanner.
    const scanner = new UnusedCodeScanner(service);
    context.subscriptions.push(
        vscode.commands.registerCommand('referencex.scanUnusedCode', () => scanner.showUnusedCodeOverview())
    );

    // Dependency tree view.
    const dependencyTreeProvider = new DependencyTreeProvider(service);
    context.subscriptions.push(
        vscode.window.createTreeView('referencex.dependencyTree', {
            treeDataProvider: dependencyTreeProvider,
            showCollapseAll: true
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('referencex.showDependencies', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('ReferenceX: no active editor.');
                return;
            }
            await dependencyTreeProvider.setCurrentSymbol(editor.document, editor.selection.active);
            await vscode.commands.executeCommand('referencex.dependencyTree.focus');
        }),

        vscode.commands.registerCommand('referencex.goToLocation',
            async (uri: vscode.Uri, range: vscode.Range) => {
                const document = await vscode.workspace.openTextDocument(uri);
                const editor = await vscode.window.showTextDocument(document);
                editor.selection = new vscode.Selection(range.start, range.start);
                editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            }),

        vscode.commands.registerCommand('referencex.exportMermaid', async () => {
            const mermaid = await dependencyTreeProvider.exportToMermaid();
            // Wrap in a fenced block so it renders in Markdown preview / GitHub.
            const content = `# Dependency Graph\n\n\`\`\`mermaid\n${mermaid}\`\`\`\n`;
            const document = await vscode.workspace.openTextDocument({ content, language: 'markdown' });
            await vscode.window.showTextDocument(document);
        }),

        vscode.commands.registerCommand('referencex.refreshDependencyTree', () => {
            service.clear();
            dependencyTreeProvider.refresh();
        })
    );
}

export function deactivate() {}
