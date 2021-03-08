// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { languages, notebook, NotebookCellData, TextDocument, window, workspace, WorkspaceEdit } from 'vscode';
import { IExtensionSyncActivationService } from '../../../activation/types';
import { IDisposableRegistry } from '../../../common/types';
import { isJupyterKernel } from '../helpers/helpers';

const CellMagicLanguagesMap = new Map<string, string>([
    ['html', 'html'],
    ['svg', 'xml'],
    ['js', 'javascript'],
    ['bash', 'shellscript'],
    ['latex', 'latex'],
    ['perl', 'perl'],
    ['python', 'python'],
    ['pypy', 'python'],
    ['python', 'python'],
    ['python2', 'python'],
    ['python3', 'python'],
    ['ruby', 'ruby'],
    ['script', 'shellscript'],
    ['sh', 'shellscript']
]);
const CellMagicLanguages = new Set(CellMagicLanguagesMap.values());

const cellsForWhichLanguageWasChanged = new WeakSet<TextDocument>();

@injectable()
export class CellMagicMonitor implements IExtensionSyncActivationService {
    constructor(@inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry) {}
    activate(): void {
        workspace.onDidChangeTextDocument(
            async (e) => {
                if (
                    !e?.document.notebook ||
                    window.activeNotebookEditor?.document !== e.document.notebook ||
                    (window.activeNotebookEditor?.kernel && !isJupyterKernel(window.activeNotebookEditor?.kernel))
                ) {
                    return;
                }
                const cell = e.document.notebook.cells.find((item) => item.document === e.document);
                if (!cell) {
                    return;
                }
                const cellMagic = e.document.lineAt(0).text.trim();
                // If there are no cell languages, then revert the language to Python.
                if (!cellMagic.startsWith('%%')) {
                    if (
                        CellMagicLanguages.has(e.document.languageId) &&
                        cellsForWhichLanguageWasChanged.has(e.document)
                    ) {
                        await languages.setTextDocumentLanguage(e.document, 'python');
                    }
                    return;
                }
                const magic = cellMagic.substring(2).trim();
                const newLanguage = CellMagicLanguagesMap.get(magic);
                if (!newLanguage) {
                    // If we don't recognize this magic cell language then revert to Python.
                    if (
                        CellMagicLanguages.has(e.document.languageId) &&
                        cellsForWhichLanguageWasChanged.has(e.document)
                    ) {
                        await languages.setTextDocumentLanguage(e.document, 'python');
                        return;
                    }
                    return;
                }
                if (e.document.languageId.toLowerCase() === newLanguage.toLowerCase()) {
                    return;
                }
                cellsForWhichLanguageWasChanged.add(e.document);
                await languages.setTextDocumentLanguage(e.document, newLanguage);
            },
            this,
            this.disposables
        );
    }
}
