// // Copyright (c) Microsoft Corporation. All rights reserved.
// // Licensed under the MIT License.

// import {
//     Builder,
//     Contents,
//     Kernel,
//     NbConvert,
//     ServerConnection,
//     ServiceManager,
//     Session,
//     Setting,
//     TerminalSession,
//     Workspace
// } from '@jupyterlab/services';
// import { ISignal } from '@phosphor/signaling';
// export class ProxyServiceManager implements ServiceManager.IManager {
//     public get builder(): Builder.IManager {
//         throw new Error('Not implemented');
//     }
//     public get contents(): Contents.IManager {
//         throw new Error('Not implemented');
//     }
//     public get isReady(): boolean {
//         return true;
//     }
//     public get ready(): Promise<void> {
//         return Promise.resolve();
//     }
//     public readonly serverSettings: ServerConnection.ISettings;
//     public readonly sessions: Session.IManager;
//     public readonly settings: Setting.IManager;
//     public readonly specs: Kernel.ISpecModels | null;
//     public readonly specsChanged: ISignal<this, Kernel.ISpecModels>;
//     public readonly terminals: TerminalSession.IManager;
//     public readonly workspaces: Workspace.IManager;
//     public readonly nbconvert: NbConvert.IManager;
//     public readonly isDisposed: boolean;
//     public dispose(): void {}
// }
