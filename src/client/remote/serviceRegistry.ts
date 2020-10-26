// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { IExtensionSingleActivationService } from '../activation/types';
import { IServiceManager } from '../ioc/types';
import { RemoteFileSystemFactory } from './auth/fileSystem';
import { NewNotebookCreator } from './auth/newNotebookCreator';
import { RemoteFilePickerProvider } from './auth/remoteFilePicker';
// import { RemoteJupyterCommandManager } from './auth/commandManager';
import { RemoteJupyterAuthProvider } from './auth/remoteJupyterAutProvider';
import { RemoteKernelPickerProvider } from './kernel/kernelProvider';
import { RemoteTreeViewProvider } from './panels/remotePanelProvider';

export function registerTypes(serviceManager: IServiceManager) {
    serviceManager.addSingleton<IExtensionSingleActivationService>(
        IExtensionSingleActivationService,
        RemoteTreeViewProvider
    );
    serviceManager.addSingleton<IExtensionSingleActivationService>(
        IExtensionSingleActivationService,
        RemoteKernelPickerProvider
    );
    serviceManager.addSingleton<IExtensionSingleActivationService>(
        IExtensionSingleActivationService,
        NewNotebookCreator
    );
    serviceManager.addSingleton<RemoteFilePickerProvider>(RemoteFilePickerProvider, RemoteFilePickerProvider);
    serviceManager.addSingleton<RemoteFileSystemFactory>(RemoteFileSystemFactory, RemoteFileSystemFactory);
    serviceManager.addBinding(RemoteFileSystemFactory, IExtensionSingleActivationService);
    // serviceManager.addSingleton<IExtensionSingleActivationService>(
    //     IExtensionSingleActivationService,
    //     RemoteJupyterCommandManager
    // );
    serviceManager.addSingleton<RemoteJupyterAuthProvider>(RemoteJupyterAuthProvider, RemoteJupyterAuthProvider);
}
