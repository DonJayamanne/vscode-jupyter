// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { IExtensionSingleActivationService } from '../activation/types';
import { IServiceManager } from '../ioc/types';
import { JupyterServersTreeDataProvider } from './panels/serversTreeDataProvider';
import { JupyterServersTreeView } from './panels/serversTreeView';

export function registerTypes(serviceManager: IServiceManager) {
    serviceManager.addSingleton<JupyterServersTreeDataProvider>(
        JupyterServersTreeDataProvider,
        JupyterServersTreeDataProvider
    );
    serviceManager.addSingleton<IExtensionSingleActivationService>(
        IExtensionSingleActivationService,
        JupyterServersTreeView
    );
}
