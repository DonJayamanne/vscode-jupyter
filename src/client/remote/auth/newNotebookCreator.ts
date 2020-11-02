// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { commands, window } from 'vscode';
import { IExtensionSingleActivationService } from '../../activation/types';
import { IDisposableRegistry } from '../../common/types';
import { swallowExceptions } from '../../common/utils/decorators';
import { noop } from '../../common/utils/misc';
import { Commands } from '../../datascience/constants';
import { RemoteFileSystem } from './fileSystem';
import { RemoteFilePickerProvider } from './remoteFilePicker';
import { RemoteJupyterAuthProvider } from './remoteJupyterAutProvider';

@injectable()
export class NewNotebookCreator implements IExtensionSingleActivationService {
    constructor(
        @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry,
        @inject(RemoteFilePickerProvider) private readonly folderPicker: RemoteFilePickerProvider
    ) {}
    public async activate() {
        this.disposables.push(
            commands.registerCommand('jupyter.createnewremotenotebook', this.createBlankNotebook, this)
        );
    }
    @swallowExceptions('Create Blank Notebooks')
    private async createBlankNotebook() {
        const server = await this.pickRemoteServer();
        if (!server) {
            return;
        }
        const fileSystem = RemoteFileSystem.RegisteredFileSystems.find((item) => item.scheme === server.fileScheme);
        if (!fileSystem) {
            return;
        }
        const remoteFolder = await this.folderPicker.selectFolder(fileSystem);
        // tslint:disable-next-line: no-console
        // console.log(folder);
        // const remoteFolders = await window.showOpenDialog({
        //     canSelectFiles: false,
        //     canSelectFolders: true,
        //     canSelectMany: false,
        //     defaultUri: fileSystem.rootFolder,
        //     openLabel: 'Folder to create notebook',
        //     title: `Select folder on Remote Server (${server.label})`
        // });
        // if (!remoteFolders || remoteFolders.length === 0) {
        //     return;
        // }
        // const remoteFolder = remoteFolders[0];
        if (!remoteFolder) {
            return;
        }
        const notebookUri = await fileSystem.createNewNotebook(remoteFolder);
        if (notebookUri) {
            commands.executeCommand(Commands.OpenNotebookInPreviewEditor, notebookUri).then(noop, noop);
        }
    }

    private async pickRemoteServer() {
        switch (RemoteJupyterAuthProvider.servers.length) {
            case 0:
                return;
            case 1:
                return RemoteJupyterAuthProvider.servers[0];

            default: {
                const server = await window.showQuickPick(
                    RemoteJupyterAuthProvider.servers.map((item) => item.label),
                    {
                        canPickMany: false,
                        ignoreFocusOut: true,
                        matchOnDescription: true,
                        matchOnDetail: true,
                        placeHolder: 'Select Remote Jupyter Server'
                    }
                );
                if (server) {
                    return RemoteJupyterAuthProvider.servers.find((item) => item.label === server);
                }
            }
        }
    }
}
