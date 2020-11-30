// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as socketio from 'socket.io';
import * as uuid from 'uuid/v4';
import { createDeferred, Deferred } from '../../common/utils/async';
import { Routes } from '../serverApp/constants';

export type Request = {
    type: Routes;
    // tslint:disable-next-line: no-any
    payload?: any;
};

export class VSCodeComms {
    // tslint:disable-next-line: no-any
    private pendingRequests = new Map<string, Deferred<any>>();
    constructor(private readonly io: socketio.Server) {
        this.addVSCodeSocketConnections(io);
    }
    // tslint:disable-next-line: no-any
    public sendRequest(request: Request): Promise<any> {
        const deferred = createDeferred();
        const id = uuid();
        this.pendingRequests.set(id, deferred);
        this.io.emit(request.type, id, request.payload);
        return deferred.promise;
    }
    private addVSCodeSocketConnections(io: socketio.Server) {
        io.on('connection', (socket: socketio.Socket) => {
            this.addMessageHandlers(socket, Routes.getKernelSpecs);
            socket.emit('Connected to server');
        });
    }
    private addMessageHandlers(socket: socketio.Socket, route: Routes) {
        // tslint:disable-next-line: no-any
        socket.on(route, (id: string, error?: any, result?: any) => {
            const promise = this.pendingRequests.get(id);
            if (!promise) {
                // tslint:disable-next-line: no-console
                console.error(`RequestId not found ${id}`);
            } else {
                if (error) {
                    promise.reject(error);
                } else {
                    promise.resolve(result);
                }
            }
        });
    }
}
