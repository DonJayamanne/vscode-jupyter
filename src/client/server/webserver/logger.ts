// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable, named } from 'inversify';
import { io } from 'socket.io-client';
import { IOutputChannel } from '../../common/types';
import { BACKGROUND_SERVICE_OUTPUT_CHANNEL } from '../../datascience/constants';
import { MessagePrefixes } from '../serverApp/constants';
import { SocketServerInfo } from './starter';

@injectable()
export class WebServerLogger {
    constructor(
        @inject(IOutputChannel) @named(BACKGROUND_SERVICE_OUTPUT_CHANNEL) private readonly jupyterOutput: IOutputChannel
    ) {}

    /**
     * Connect to the socket server and start logging everthing.
     */
    public connect(address: SocketServerInfo) {
        const socket = io(`http://localhost:${address.port}`);
        // tslint:disable-next-line: messages-must-be-localized
        this.jupyterOutput.appendLine('Start monitoring server logs');
        socket.on(MessagePrefixes.Error, (message: string) => {
            this.jupyterOutput.appendLine(message);
        });
        socket.on(MessagePrefixes.Log, (message: string) => {
            this.jupyterOutput.appendLine(message);
        });
    }
}
