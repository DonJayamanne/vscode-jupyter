// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ServerConnection } from '@jupyterlab/services';
import * as cors from 'cors';
import * as express from 'express';
import * as http from 'http';
import { createProxyMiddleware } from 'http-proxy-middleware';
import * as socketio from 'socket.io';
import * as uuid from 'uuid/v4';
import * as ws from 'ws';
import { createDeferred } from '../../common/utils/async';
import { MessagePrefixes } from './constants';
import { addLogger, ILogger, logMessage } from './logger';
// import { VSCodeComms } from './vscodeComms';

export class BackgroundWebServer {
    private server?: http.Server;
    private socketServer?: SocketIO.Server;
    private app?: express.Express;
    private wsServer?: ws.Server;
    // private wsClient?: WebSocket;
    // private realWsClient?: ws;
    private startPromise?: Promise<number>;
    private jupyterServerMap = new Map<string, ServerConnection.ISettings>();
    // private readonly originalWSServerMessages: any[] = [];
    private settings!: ServerConnection.ISettings;
    // private comms!: VSCodeComms;
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
            // tslint:disable-next-line: promise-must-complete
            this.startPromise = new Promise<number>((resolve, reject) => {
                const app = (this.app = express());
                const server = (this.server = http.createServer(app));
                // tslint:disable-next-line: no-any
                const io = (this.socketServer = (socketio as any)(server));

                app.use(cors());

                this.addRoutes(app);
                this.addVSCodeSocketConnections(io);
                this.addLogger(io);
                this.addDummyServer();
                const wsServer = (this.wsServer = new ws.Server({ noServer: true }));
                // tslint:disable-next-line: no-console
                console.log(this.wsServer.clients.size);
                // tslint:disable-next-line: no-console
                console.log('this.settings.wsUrl');
                // tslint:disable-next-line: no-console
                console.log(this.settings.wsUrl);
                // tslint:disable-next-line: no-any
                wsServer.on('connection', (webSocket: ws, request: http.IncomingMessage, client: any) => {
                    const url = request.url!;

                    const wsUrl = this.settings.wsUrl + url.substring(url.indexOf('/api/kernels') + 1);
                    // tslint:disable-next-line: no-console
                    console.log(`Connecting to real socket ${wsUrl}`);
                    const proxyWebSocket = new this.settings.WebSocket(wsUrl);
                    // tslint:disable-next-line: no-any
                    proxyWebSocket.onerror = (ex: any) => {
                        // tslint:disable-next-line: no-console
                        console.error('Error from Socket Server Client', ex);
                    };
                    const promise = createDeferred();
                    let chain = promise.promise;
                    proxyWebSocket.onopen = () => {
                        logMessage('Opened the connection with the server socket');
                        logMessage(`1.State ${proxyWebSocket.readyState}`);
                        promise.resolve();
                    };
                    // tslint:disable-next-line: no-function-expression
                    proxyWebSocket.onmessage = (data) => {
                        // if (this.realWsClient) {
                        logMessage(
                            `Got message from real Socket Server & sending to real Socket Client, length ${
                                data.data.toString().length
                            }`
                        );
                        // chain = chain.then(() => {
                        webSocket.send(data.data.toString());
                    };

                    // this.realWsClient = webSocket;
                    logMessage('Logged to Web Socket');
                    // tslint:disable: no-console
                    console.log('Request');
                    console.log(request.url);
                    // console.log(request.url);
                    // console.log(request.url);
                    // console.log(request.url);
                    // console.log('webSocket');
                    // console.log('webSocket');
                    // console.log('webSocket');
                    // console.log(webSocket);
                    // console.log('client');
                    // console.log('client');
                    // console.log('client');
                    // console.log('client');
                    // console.log('client');
                    // console.log('client');
                    // console.log('client');
                    // console.log(client);
                    // console.log('_request');
                    // console.log('_request');
                    // console.log('_request');
                    // console.log('_request');
                    // console.log('_request');
                    // console.log('_request');
                    // console.log(_request);
                    // tslint:disable-next-line: no-console
                    // console.log(client.url);
                    // tslint:disable-next-line: no-console
                    // console.log(webSocket);
                    // // // tslint:disable-next-line: no-console
                    // console.log(request);
                    // // // tslint:disable-next-line: no-console
                    // console.log(client);
                    // tslint:disable-next-line: no-console
                    // webSocket.on('message', (message) => console.log(message));
                    // tslint:disable-next-line: no-any
                    webSocket.on('message', (msg: string) => {
                        // tslint:disable-next-line: no-console
                        logMessage(
                            `Received Socket message length ${msg.length} from Real Socket Client & sending to real Socket server`
                        );
                        chain = chain.then(() => {
                            logMessage(`2.State ${proxyWebSocket.readyState}`);
                            proxyWebSocket.send(msg);
                        });
                    });
                    // tslint:disable-next-line: no-any
                    webSocket.on('error', (ex: any) => {
                        // tslint:disable-next-line: no-console
                        console.error('Error from Real Client', ex);
                    });

                    // If we have some messages from real socket server, then add here.
                    // this.originalWSServerMessages.forEach((msg) => {
                    //     logMessage(`Sending initial message to real client`);
                    //     webSocket.send(msg);
                    // });
                });
                wsServer.on('error', (ex) => {
                    // tslint:disable-next-line: no-console
                    console.error('wsServer error', ex);
                });

                server.on('upgrade', (request, socket, head) => {
                    wsServer.handleUpgrade(request, socket, head, (webSocket) => {
                        wsServer.emit('connection', webSocket, request);
                    });
                });
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
    public addDummyServer() {
        const settings = ServerConnection.makeSettings({ baseUrl: 'http://localhost:8888/', token: '' });
        this.addJupyterServer(settings);
        this.settings = settings;
    }
    public addJupyterServer(settings: ServerConnection.ISettings) {
        const id = uuid();
        this.jupyterServerMap.set(id, settings);
        logMessage(`Proxy Server added ${id}`);

        // const oldPath = `^/jupyterApi/${id}/api`;
        const pathRewrite: Record<string, string> = {};
        pathRewrite[`^/jupyterApi/${id}/api`] = 'api'; // rewrite path
        // pathRewrite['^/jupyterApi/remove/path'] = '/path'; // remove base path

        this.app!.use(
            `/jupyterApi/${id}`,
            createProxyMiddleware({
                target: settings.baseUrl,
                changeOrigin: true,
                pathRewrite
            })
        );
    }
    private addRoutes(app: express.Express) {
        app.get('/', (_: express.Request, res: express.Response) => {
            logMessage('Got request for /');
            res.status(200).send('Hello World!');
        });
        app.get('/api/kernelspecs', async (_: express.Request, res: express.Response) => {
            logMessage('Got request for kernel specs');
            // const result = await this.comms.sendRequest({ type: Routes.getKernelSpecs });
            // logMessage('Got response for kernel specs');
            res.status(200).send({ result: 123 });
        });
    }

    private addVSCodeSocketConnections(io: socketio.Server) {
        // this.comms = new VSCodeComms(io);
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
