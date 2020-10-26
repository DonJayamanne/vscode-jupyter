// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ServerConnection } from '@jupyterlab/services';
import { Kernel } from '@jupyterlab/services/lib/kernel';
import { noop } from '../../common/utils/misc';
import { IJupyterKernelSpec } from '../../datascience/types';
import { RemoteJupyterAuthProvider } from './remoteJupyterAutProvider';
import { RemoteServer } from './server';
import { ServerSession } from './types';

const kernelManagers = new WeakMap<RemoteServer, IRemoteKernelManager>();

export type IRemoteKernelManager = {
    listKernels(): Promise<Kernel.IModel[]>;
    getKernel(session: ServerSession): Promise<Kernel.IModel>;
    getKernelSpecs(): Promise<IJupyterKernelSpec[]>;
};

export class KernelManager implements IRemoteKernelManager {
    private cacheOfKernelSpecs?: IJupyterKernelSpec[];
    constructor(private readonly info: RemoteServer) {}
    // public async getKernelFromSession(kernel: ServerSessionKernel) {
    //     Kernel.listRunning()
    // }
    public async listKernels() {
        const items = await Kernel.listRunning(this.info.info);
        // tslint:disable-next-line: no-console
        console.log(items);
        return items;
    }
    public async getKernel(session: ServerSession) {
        const kernel = await Kernel.findById(session.kernel.id, this.info.info);
        // tslint:disable-next-line: no-console
        console.log(kernel);
        // Kernel.connectTo(kernel, this.info.info).
        return kernel;
    }
    public async connectToExistingKernel(kernelId: string) {
        const model = await Kernel.findById(kernelId, this.info.info);
        return Kernel.connectTo(model, this.info.info);
    }
    // public async startNewkernel(kernelSpec: IJupyterKernelSpec) {
    //     Session.startNew({
    //         path:'',
    //         name: 'Hello',
    //         kernelName:'julia-1.5',
    //         serverSettings: this.info.info,
    //         username:'',
    //         type:''
    //     })
    //     // const model = await Kernel.findById(kernelSpec.name, this.info.info);
    //     // await Session.
    //     // return Kernel.startNew({
    //     //     clientId: uuid(),
    //     //     handleComms: true,
    //     //     name: kernelSpec.name,
    //     //     serverSettings: this.info.info,
    //     //     username: ''
    //     // }, this.info.info);
    // }
    public async getKernelSpecs(): Promise<IJupyterKernelSpec[]> {
        const promise = this.info.getKernelSpecs();
        promise.then((items) => (this.cacheOfKernelSpecs = items)).catch(noop);
        if (this.cacheOfKernelSpecs) {
            return this.cacheOfKernelSpecs;
        }
        return promise;
    }
}

export function getKernelManager(info: ServerConnection.ISettings): IRemoteKernelManager {
    const server = RemoteJupyterAuthProvider.getServer(info);
    if (!server) {
        throw new Error('No server');
    }
    const manager = kernelManagers.get(server) ?? new KernelManager(server);
    kernelManagers.set(server, manager);
    return manager;
}
