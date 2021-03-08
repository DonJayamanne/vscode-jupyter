// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { languages, notebook, NotebookCellData, window, workspace, WorkspaceEdit } from 'vscode';
import { IExtensionSyncActivationService } from '../../../activation/types';
import { IDisposableRegistry } from '../../../common/types';
import { isJupyterKernel } from '../helpers/helpers';

const CellMagicLanguages = new Map<string, string>([
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
                if (!cellMagic.startsWith('%%')) {
                    return;
                }
                const magic = cellMagic.substring(2).trim();
                const newLanguage = CellMagicLanguages.get(magic);
                if (!newLanguage) {
                    return;
                }
                if (e.document.languageId.toLowerCase() === newLanguage.toLowerCase()) {
                    return;
                }
                await languages.setTextDocumentLanguage(e.document, newLanguage);
            },
            this,
            this.disposables
        );
    }
}
