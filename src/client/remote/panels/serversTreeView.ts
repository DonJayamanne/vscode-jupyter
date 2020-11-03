// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { window } from 'vscode';
import { IExtensionSingleActivationService } from '../../activation/types';
import { IDisposableRegistry } from '../../common/types';
import { JupyterServersTreeDataProvider } from './serversTreeDataProvider';

@injectable()
export class JupyterServersTreeView implements IExtensionSingleActivationService {
    constructor(
        @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry,
        @inject(JupyterServersTreeDataProvider) private readonly dataProvider: JupyterServersTreeDataProvider
    ) {}
    public async activate(): Promise<void> {
        this.disposables.push(window.registerTreeDataProvider('jupyter.serversView', this.dataProvider));
    }
}
