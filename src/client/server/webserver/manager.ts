// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { io, Socket } from 'socket.io-client';
import { traceError } from '../../common/logger';
import { IDisposable, IDisposableRegistry } from '../../common/types';
import { IKernelFinder } from '../../datascience/kernel-launcher/types';
import { Routes } from '../serverApp/constants';
import { JupyterWebServerStarter } from './starter';

@injectable()
export class JupyterWebserverManager implements IDisposable {
    private disposables: IDisposable[] = [];
    private socket?: Socket;
    private connected?: Promise<void>;
    // tslint:disable-next-line: no-any
    private routeHandlers = new Map<Routes, (...args: any) => Promise<any>>();
    constructor(
        @inject(IDisposableRegistry) disposables: IDisposableRegistry,
        @inject(JupyterWebServerStarter) private readonly starter: JupyterWebServerStarter,
        @inject(IKernelFinder) private readonly kernelFinder: IKernelFinder
    ) {
        disposables.push();
        this.routeHandlers.set(Routes.getKernelSpecs, this.getKernelSpecs.bind(this));
    }
    public dispose() {
        this.disposables.forEach((d) => d.dispose());
        if (this.socket) {
            this.socket.disconnect();
        }
    }
    public async connect(): Promise<void> {
        if (this.connected) {
            return this.connected;
        }

        this.connected = new Promise<void>(async (resolve, reject) => {
            try {
                const connection = await this.starter.start();
                const socket = (this.socket = io(`http://localhost:${connection.port}`));
                socket.on('connect', resolve);
                this.addMessageHandlers(socket, Routes.getKernelSpecs);
            } catch (ex) {
                this.connected = undefined;
                reject(ex);
            }
        });
        return this.connected;
    }

    private addMessageHandlers(socket: Socket, route: Routes) {
        // tslint:disable-next-line: no-any
        socket.on(route, async (id: string, payload?: any) => {
            const handler = this.routeHandlers.get(route);
            if (!handler) {
                traceError(`No handler for ${route}`);
            } else {
                try {
                    const response = await handler(payload);
                    socket.emit(route, id, undefined, response);
                } catch (ex) {
                    socket.emit(route, id, ex);
                }
            }
        });
    }
    private getKernelSpecs() {
        return this.kernelFinder.listKernelSpecs(undefined);
    }
}
