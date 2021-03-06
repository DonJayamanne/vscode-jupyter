// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { injectable } from 'inversify';
import { NotebookCellData, window, workspace, WorkspaceEdit } from 'vscode';
import { IExtensionSyncActivationService } from '../../../activation/types';

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
    // constructor(){}
    activate(): void {
        workspace.onDidChangeTextDocument(async (e) => {
            console.log(e?.document.uri);

            if (!e?.document.notebook) {
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
            const edit = new WorkspaceEdit();
            edit.replaceNotebookCellMetadata(e.document.uri, cell.index, cell.metadata.with({}));
            edit.replaceNotebookCells(cell.notebook.uri, cell.index, cell.index + 1, [
                new NotebookCellData(
                    cell.cellKind,
                    cell.document.getText(),
                    newLanguage,
                    [...cell.outputs],
                    cell.metadata
                )
            ]);
            await workspace.applyEdit(edit);
        });
        // notebook.onDidChangeCellLanguage
    }
}
