import * as vscode from 'vscode';
import { ReferenceLensProvider } from './codeLensProvider';
import { UnusedCodeScanner } from './unusedCodeScanner';
import { ReferenceHoverProvider } from './hoverProvider';
import { DependencyTreeProvider } from './dependencyTreeProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('ReferenceX extension is now active');

    const provider = new ReferenceLensProvider(context);

    // Register CodeLens provider for supported languages
    const languages = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'];

    for (const language of languages) {
        const disposable = vscode.languages.registerCodeLensProvider(
            { language, scheme: 'file' },
            provider
        );
        context.subscriptions.push(disposable);
    }

    // Register hover provider for supported languages
    const hoverProvider = new ReferenceHoverProvider();
    for (const language of languages) {
        const hoverDisposable = vscode.languages.registerHoverProvider(
            { language, scheme: 'file' },
            hoverProvider
        );
        context.subscriptions.push(hoverDisposable);
    }

    // Listen to document changes to refresh CodeLens
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (languages.includes(e.document.languageId)) {
                provider.refresh();
            }
        })
    );

    // Add provider to subscriptions for disposal
    context.subscriptions.push(provider);

    // Register unused code scanner command
    const scanner = new UnusedCodeScanner();
    const scanCommand = vscode.commands.registerCommand(
        'referencex.scanUnusedCode',
        () => scanner.showUnusedCodeOverview()
    );
    context.subscriptions.push(scanCommand);

    // Register dependency tree view
    const dependencyTreeProvider = new DependencyTreeProvider();
    const treeView = vscode.window.createTreeView('referencex.dependencyTree', {
        treeDataProvider: dependencyTreeProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);

    // Command to show dependencies for current symbol
    const showDependenciesCommand = vscode.commands.registerCommand(
        'referencex.showDependencies',
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            await dependencyTreeProvider.setCurrentSymbol(editor.document, editor.selection.active);
            await vscode.commands.executeCommand('referencex.dependencyTree.focus');
        }
    );
    context.subscriptions.push(showDependenciesCommand);

    // Command to go to a location (used by tree view items)
    const goToLocationCommand = vscode.commands.registerCommand(
        'referencex.goToLocation',
        async (uri: vscode.Uri, range: vscode.Range) => {
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);
            editor.selection = new vscode.Selection(range.start, range.start);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        }
    );
    context.subscriptions.push(goToLocationCommand);

    // Command to export dependency graph to Mermaid
    const exportMermaidCommand = vscode.commands.registerCommand(
        'referencex.exportMermaid',
        async () => {
            const mermaid = await dependencyTreeProvider.exportToMermaid();
            const document = await vscode.workspace.openTextDocument({
                content: mermaid,
                language: 'mermaid'
            });
            await vscode.window.showTextDocument(document);
        }
    );
    context.subscriptions.push(exportMermaidCommand);

    // Command to refresh dependency tree
    const refreshTreeCommand = vscode.commands.registerCommand(
        'referencex.refreshDependencyTree',
        () => dependencyTreeProvider.refresh()
    );
    context.subscriptions.push(refreshTreeCommand);
}

export function deactivate() {}
