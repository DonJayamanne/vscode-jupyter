// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { spawn } from 'child_process';
import { inject, injectable, named } from 'inversify';
import * as util from 'util';
import { Memento } from 'vscode';
import { ProcessService } from '../../common/process/proc';
import {
    GLOBAL_MEMENTO,
    IAsyncDisposable,
    IAsyncDisposableRegistry,
    IMemento,
    IOutputChannel
} from '../../common/types';
import { EXTENSION_ROOT_DIR } from '../../constants';
import { BACKGROUND_SERVICE_OUTPUT_CHANNEL } from '../../datascience/constants';
import { BackgroundServerModule } from './constants';
import { WebServerLogger } from './logger';

const MessagePrefix = 'JVSC_LOG:';
const MessagePrefixLength = 'JVSC_LOG:'.length;
const ErrorMessagePrefix = 'JVSC_ERROR:';
const ErrorMessagePrefixLength = 'JVSC_ERROR:'.length;
const PortMessagePrefix = 'JVSC_PORT:';
const PortMessagePrefixLength = 'JVSC_PORT:'.length;

const BackgroundServerPortInMementoKey = 'JVSC_BACKGROUND_SERVER_PORT';
export type SocketServerInfo = {
    port: number;
};

// tslint:disable: messages-must-be-localized

@injectable()
export class JupyterWebServerStarter implements IAsyncDisposable {
    private starting?: Promise<SocketServerInfo>;
    private readonly disposables: IAsyncDisposable[] = [];
    constructor(
        @inject(IAsyncDisposableRegistry) disposables: IAsyncDisposableRegistry,
        @inject(IOutputChannel)
        @named(BACKGROUND_SERVICE_OUTPUT_CHANNEL)
        private readonly jupyterOutput: IOutputChannel,
        @inject(WebServerLogger) private readonly logger: WebServerLogger,
        @inject(IMemento) @named(GLOBAL_MEMENTO) private readonly globalMemento: Memento
    ) {
        disposables.push(this);
    }
    public async dispose(): Promise<void> {
        await Promise.all(this.disposables.map((d) => d.dispose()));
    }
    public async start(): Promise<SocketServerInfo> {
        if (this.starting) {
            return this.starting;
        }

        const promise = new Promise<SocketServerInfo>(async (resolve, reject) => {
            const backgroundServerInfo = this.globalMemento.get<{ port: number; pid: number }>(
                BackgroundServerPortInMementoKey
            );
            if (backgroundServerInfo) {
                if (ProcessService.isAlive(backgroundServerInfo.pid)) {
                    const info = { port: backgroundServerInfo.port };
                    this.logger.connect(info);
                    return resolve(info);
                }
            }
            // Start our own simple webserver.
            // Next start the real background process & pass the address of our server.
            // When the background process has started, it can send back information via the simple web server.
            try {
                const proc = spawn(process.execPath, [BackgroundServerModule], {
                    detached: true,
                    cwd: EXTENSION_ROOT_DIR,
                    // execArgv: [],
                    env: {
                        ...process.env,
                        ELECTRON_RUN_AS_NODE: '1',
                        VSCODE_IPC_HOOK: undefined,
                        VSCODE_IPC_HOOK_EXTHOST: undefined,
                        VSCODE_NLS_CONFIG: undefined,
                        VSCODE_PID: undefined,
                        VSCODE_HANDLES_UNCAUGHT_ERRORS: undefined,
                        VSCODE_LOG_STACK: undefined
                    },
                    stdio: 'ignore'
                });
                proc.unref();
                this.jupyterOutput.appendLine(`Forked process ${proc.pid}`);
                const messageHandler = async (message: unknown) => {
                    if (typeof message !== 'string') {
                        return;
                    }
                    if (message.startsWith(MessagePrefix)) {
                        this.jupyterOutput.appendLine(`${message.substring(MessagePrefixLength)}`);
                    } else if (message.startsWith(ErrorMessagePrefix)) {
                        const errorMessage = message.substring(ErrorMessagePrefixLength);
                        this.jupyterOutput.appendLine(`${errorMessage}`);
                        reject(errorMessage);
                    } else if (message.startsWith(PortMessagePrefix)) {
                        const port = parseInt(message.substring(PortMessagePrefixLength), 10);
                        const info = { port };
                        this.logger.connect(info);
                        proc.off('message', messageHandler);
                        await this.globalMemento.update(BackgroundServerPortInMementoKey, { port, pid: proc.pid });
                        resolve(info);
                    }
                };
                proc.on('message', messageHandler);
            } catch (ex) {
                this.jupyterOutput.appendLine(`Failed to start background service ${util.format(ex)}.`);
                reject(ex);
            }
        });

        return (this.starting = promise);
    }
}
