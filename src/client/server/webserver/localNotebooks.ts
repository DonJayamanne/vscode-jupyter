// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Session } from '@jupyterlab/services';
import { inject, injectable } from 'inversify';
import { INotebookProvider } from '../../datascience/types';

@injectable()
export class LocalNotebookProxy {
    constructor(@inject(INotebookProvider) private readonly notebookProvider: INotebookProvider) {}
    public async listSessions() {
        const activeNotebooks = this.notebookProvider.activeNotebooks;
        if (activeNotebooks.length === 0) {
            return [];
        }

        const activeSessions = await Promise.all(
            activeNotebooks.map(async (item) => {
                try {
                    const nb = await item;
                    if (!nb.session?.session) {
                        return;
                    }
                    // tslint:disable-next-line: no-unnecessary-local-variable
                    const activeSession: Session.IModel = {
                        id: nb.session.session.id,
                        name: nb.session.session.name,
                        path: nb.identity.fsPath,
                        type: nb.identity.fsPath.toLowerCase().endsWith('ipynb') ? 'notebook' : 'file',
                        kernel: {
                            id: nb.session.session.kernel.id,
                            name: nb.session.session.kernel.name
                        }
                    };
                    return activeSession;
                } catch (ex) {
                    return;
                }
            })
        );

        return activeSessions.filter((item) => !!item) as Session.IModel[];
    }
}
