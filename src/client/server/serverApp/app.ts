// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as cors from 'cors';
import * as express from 'express';
import * as http from 'http';
import * as socketio from 'socket.io';
import { MessagePrefixes, Routes } from './constants';
import { addLogger, ILogger, logMessage } from './logger';
import { VSCodeComms } from './vscodeComms';

export class BackgroundWebServer {
    private server?: http.Server;
    private socketServer?: SocketIO.Server;
    private startPromise?: Promise<number>;
    private comms!: VSCodeComms;
    // private disposed?: boolean;
    public async dispose(): Promise<void> {
        // this.disposed = true;
        if (this.server) {
            await new Promise<unknown>((resolve) => this.server!.close(resolve));
        }
        if (this.socketServer) {
            await new Promise<void>((resolve) => this.socketServer!.close(resolve));
        }
        this.startPromise = undefined;
    }

    public async start(): Promise<number> {
        if (!this.startPromise) {
            this.startPromise = new Promise<number>((resolve, reject) => {
                const app = express();
                const server = (this.server = http.createServer(app));
                // tslint:disable-next-line: no-any
                const io = (this.socketServer = (socketio as any)(server));

                app.use(cors());

                this.addRoutes(app);
                this.addVSCodeSocketConnections(io);
                this.addLogger(io);

                server.listen(undefined, 'localhost', () => {
                    const address = server.address();
                    if (typeof address === 'string') {
                        reject(new Error(`Expected port & host, instead got ${address}`));
                    } else {
                        resolve(address.port);
                    }
                });
            });
        }
        return this.startPromise;
    }
    private addRoutes(app: express.Express) {
        app.get('/', (_: express.Request, res: express.Response) => {
            logMessage('Got request for /');
            res.status(200).send('Hello World!');
        });
        app.get('/api/kernelspecs', async (_: express.Request, res: express.Response) => {
            logMessage('Got request for kernel specs');
            const result = await this.comms.sendRequest({ type: Routes.getKernelSpecs });
            logMessage('Got response for kernel specs');
            res.status(200).send(result);
        });
    }

    private addVSCodeSocketConnections(io: socketio.Server) {
        this.comms = new VSCodeComms(io);
        io.on('connection', (socket) => {
            socket.emit('Connected to server');
        });
    }
    private addLogger(io: socketio.Server) {
        const logger: ILogger = {
            logError: (message: string) => {
                io.emit(MessagePrefixes.Error, message);
            },
            logMessage: (message: string) => {
                io.emit(MessagePrefixes.Log, message);
            }
        };
        addLogger(logger);
    }
}
