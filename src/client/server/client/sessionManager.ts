// // Copyright (c) Microsoft Corporation. All rights reserved.
// // Licensed under the MIT License.

// import { Kernel, ServerConnection, Session } from '@jupyterlab/services';
// import { IIterator } from '@phosphor/algorithm';
// import { ISignal, Signal } from '@phosphor/signaling';
// import { inject, injectable } from 'inversify';
// import { cloneDeep } from 'lodash';
// import { KernelFinder } from '../../datascience/kernel-launcher/kernelFinder';
// import { IJupyterKernelSpec } from '../../datascience/types';

// @injectable()
// export class ProxySessionManager implements Session.IManager {
//     public get specs(): Kernel.ISpecModels | null {
//         if (!this._specs) {
//             return null;
//         }
//         const items = this._specs.map((item) => {
//             const spec = { ...cloneDeep(item) };
//             const kernelSpec: Kernel.ISpecModel = {
//                 ...spec,
//                 language: spec.language || '',
//                 // tslint:disable-next-line: no-any
//                 resources: 'resources' in spec ? (spec as any).resources : {}
//             };
//             return [item.name, kernelSpec];
//         });
//         const kernelspecs = Object.fromEntries(items);
//         return {
//             default: '',
//             kernelspecs
//         };
//     }
//     public get isReady(): boolean {
//         return true;
//     }
//     public get ready(): Promise<void> {
//         return Promise.resolve();
//     }
//     public get isDisposed(): boolean {
//         return false;
//     }
//     public readonly specsChanged: ISignal<this, Kernel.ISpecModels>;
//     public readonly runningChanged: ISignal<this, Session.IModel[]>;
//     public readonly connectionFailure: ISignal<Session.IManager, ServerConnection.NetworkError>;
//     public serverSettings?: ServerConnection.ISettings | undefined;
//     private _specs?: IJupyterKernelSpec[];
//     constructor(@inject(KernelFinder) private readonly kernelFinder: KernelFinder) {
//         this.specsChanged = new Signal<this, Kernel.ISpecModels>(this);
//         this.runningChanged = new Signal<this, Session.IModel[]>(this);
//         this.connectionFailure = new Signal<Session.IManager, ServerConnection.NetworkError>(this);
//     }
//     public running(): IIterator<Session.IModel> {
//         // tslint:disable-next-line: no-any
//         return {} as any;
//     }
//     public startNew(options: Session.IOptions): Promise<Session.ISession> {}
//     public findById(id: string): Promise<Session.IModel> {
//         throw new Error('Method not implemented.');
//     }
//     public findByPath(path: string): Promise<Session.IModel> {
//         throw new Error('Method not implemented.');
//     }
//     public connectTo(model: Session.IModel): Session.ISession {
//         throw new Error('Method not implemented.');
//     }
//     public shutdown(id: string): Promise<void> {
//         throw new Error('Method not implemented.');
//     }
//     public shutdownAll(): Promise<void> {
//         throw new Error('Method not implemented.');
//     }
//     public async refreshSpecs(): Promise<void> {
//         this._specs = await this.kernelFinder.listKernelSpecs(undefined);
//     }
//     public refreshRunning(): Promise<void> {
//         throw new Error('Method not implemented.');
//     }
//     public stopIfNeeded(path: string): Promise<void> {
//         throw new Error('Method not implemented.');
//     }
//     public dispose(): void {
//         //
//     }
// }
