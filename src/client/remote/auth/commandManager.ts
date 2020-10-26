// // Copyright (c) Microsoft Corporation. All rights reserved.
// // Licensed under the MIT License.

// import { inject, injectable } from 'inversify';
// import { commands } from 'vscode';
// import { IExtensionSingleActivationService } from '../../activation/types';
// import { IDisposableRegistry } from '../../common/types';
// import { RemoteJupyterAuthProvider } from './remoteJupyterAutProvider';

// @injectable()
// export class RemoteJupyterCommandManager implements IExtensionSingleActivationService {
//     constructor(
//         @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry,
//         @inject(RemoteJupyterAuthProvider) private readonly authProvider: RemoteJupyterAuthProvider
//     ) {}
//     public async activate(): Promise<void> {
//         this.registerCommands();
//     }
// }
