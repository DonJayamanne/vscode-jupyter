// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { IExtensionSingleActivationService } from '../activation/types';
import { swallowExceptions } from '../common/utils/decorators';
import { noop } from '../common/utils/misc';
import { JupyterWebserverManager } from './webserver/manager';

@injectable()
export class ServerStartup implements IExtensionSingleActivationService {
    constructor(@inject(JupyterWebserverManager) private readonly serverManager: JupyterWebserverManager) {}
    public async activate(): Promise<void> {
        this.startInBackground().catch(noop);
    }

    @swallowExceptions('Start Server in the background')
    private async startInBackground(): Promise<void> {
        await this.serverManager.connect();
    }
}
