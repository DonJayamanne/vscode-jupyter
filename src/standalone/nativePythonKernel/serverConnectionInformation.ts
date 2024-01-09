// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    JupyterServerCollection,
    JupyterServerCommand,
    JupyterServerCommandProvider,
    JupyterServerConnectionInformation
} from '../../api';
import { inject, injectable, optional } from 'inversify';
import { CancellationToken, Event, EventEmitter, Uri, workspace } from 'vscode';
import { IJupyterServerProviderRegistry } from '../../kernels/jupyter/types';
import { IExtensionSyncActivationService } from '../../platform/activation/types';
import { JVSC_EXTENSION_ID } from '../../platform/common/constants';
import { IDisposable, IDisposableRegistry } from '../../platform/common/types';
import { JupyterServer, JupyterServerProvider } from '../../api';
import { DisposableBase } from '../../platform/common/utils/lifecycle';
import WebSocket from 'isomorphic-ws';
import { generateUuid } from './utils';
import { KernelLauncher } from '../../kernels/raw/launcher/kernelLauncher.node';
import { JupyterInterpreterSelector } from '../../kernels/jupyter/interpreter/jupyterInterpreterSelector.node';
import { PythonEnvironment } from '../../platform/pythonEnvironments/info';
import { getPythonEnvDisplayName } from '../../platform/interpreter/helpers';
import { ServiceContainer } from '../../platform/ioc/container';
import { IPythonExecutionFactory } from '../../platform/interpreter/types.node';

@injectable()
export class NativePythonKernelProvider
    extends DisposableBase
    implements IExtensionSyncActivationService, IDisposable, JupyterServerProvider, JupyterServerCommandProvider
{
    public readonly extensionId: string = JVSC_EXTENSION_ID;
    readonly documentation = Uri.parse('https://aka.ms/vscodeJuptyerExtKernelPickerExistingServer');
    readonly displayName: string = 'Python Environments (2)...';
    readonly detail: string = 'No dependencies, no fuss';
    private _onDidChangeHandles = this._register(new EventEmitter<void>());
    onDidChangeHandles: Event<void> = this._onDidChangeHandles.event;
    private _onDidChangeServers = this._register(new EventEmitter<void>());
    onDidChangeServers = this._onDidChangeServers.event;
    constructor(
        @inject(IDisposableRegistry) disposables: IDisposableRegistry,
        @inject(IJupyterServerProviderRegistry)
        private readonly jupyterServerProviderRegistry: IJupyterServerProviderRegistry,
        @inject(JupyterInterpreterSelector)
        private readonly interpreterSelector: JupyterInterpreterSelector,
        @optional()
        @inject(Date.now().toString()) // No such item to be injected
        public readonly id: string = 'NativePythonKernel'
    ) {
        super();
        disposables.push(this);
    }
    async provideCommands(_value: string | undefined, _token: CancellationToken): Promise<JupyterServerCommand[]> {
        return [
            {
                label: 'Python',
                canBeAutoSelected: true
            }
        ];
    }
    private selectedServers = new Map<string, JupyterServer>();
    async handleCommand(_command: JupyterServerCommand, _token: CancellationToken): Promise<JupyterServer | undefined> {
        const interpreter = await this.interpreterSelector.selectPythonInterpreter();
        if (!interpreter) {
            return;
        }
        const server = {
            id: interpreter.id,
            label: getPythonEnvDisplayName(interpreter),
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            connectionInformation: new ServerConnectionInformation(interpreter)
        };
        this.selectedServers.set(server.id, server);
        return server;
    }
    private collection: JupyterServerCollection;
    activate() {
        // Register this ASAP.
        this.collection = this._register(
            this.jupyterServerProviderRegistry.createJupyterServerCollection(
                JVSC_EXTENSION_ID,
                this.id,
                this.displayName,
                this
            )
        );
        this.collection.commandProvider = this;
        this.collection.documentation = this.documentation;

        this._register(this.onDidChangeHandles(() => this._onDidChangeServers.fire(), this));
    }
    public async resolveJupyterServer(server: JupyterServer, _token: CancellationToken) {
        return this.selectedServers.get(server.id) || server;
    }

    async provideJupyterServers(_token: CancellationToken): Promise<JupyterServer[]> {
        return [
            // {
            //     id: '1',
            //     label: 'Python',
            //     // eslint-disable-next-line @typescript-eslint/no-use-before-define
            //     connectionInformation: new ServerConnectionInformation('')
            // }
        ];
    }
    public async removeJupyterServer(_server: JupyterServer): Promise<void> {
        //
    }
}
class MyWebSocket extends WebSocket {
    static serverUris = new Map<string, string>();
    constructor(url: string | URL, protocols?: string | string[] | undefined) {
        MyWebSocket.serverUris.forEach((realUrl, id) => {
            if (url.toString().includes(id)) {
                url = realUrl;
            }
        });
        super(url, protocols);
    }
}

async function spawnServer(pythonEnv: PythonEnvironment) {
    const file = '/Users/donjayamanne/Development/vsc/simple-pythonkernel/kernel_server.py';
    const ports = await KernelLauncher.findNextFreePort(9_000);
    const port = ports[0];
    const execFactory = ServiceContainer.instance.get<IPythonExecutionFactory>(IPythonExecutionFactory);
    const exec = await execFactory.createActivatedEnvironment({ interpreter: pythonEnv });
    // eslint-disable-next-line local-rules/dont-use-fspath
    const cwd = workspace.workspaceFolders?.length ? workspace.workspaceFolders[0].uri.fsPath : undefined;
    const proc = await exec.execObservable([file, port.toString()], { cwd });
    return new Promise<string>((resolve, _reject) => {
        proc.out.onDidChange((e) => {
            if (e.out.includes('Started')) {
                resolve(`ws://localhost:${port}`);
            }
        });
    });
}

async function fetchImpl(
    pythonEnv: PythonEnvironment,
    input: RequestInfo,
    _init?: RequestInit | undefined
): Promise<Response> {
    if (typeof input !== 'string' && input.method === 'GET' && input.url.includes('api/kernelspecs?')) {
        return {
            status: 200,
            json: async () => {
                return {
                    default: 'python3',
                    kernelspecs: {
                        python3: {
                            name: 'python3',
                            spec: {
                                language: 'python',
                                argv: [
                                    // eslint-disable-next-line local-rules/dont-use-fspath
                                    pythonEnv.uri.fsPath,
                                    '-m',
                                    'ipykernel_launcher',
                                    '-f',
                                    '{connection_file}'
                                ],
                                display_name: getPythonEnvDisplayName(pythonEnv),
                                env: {},
                                interrupt_mode: 'message',
                                metadata: {}
                            },
                            resources: {},
                            env: {},
                            argv: [],
                            display_name: getPythonEnvDisplayName(pythonEnv)
                        }
                    }
                };
            }
        } as any;
    }
    if (typeof input !== 'string' && input.method === 'GET' && input.url.includes('api/kernels?')) {
        return {
            status: 200,
            json: async () => {
                return [];
            }
        } as any;
    }
    if (typeof input !== 'string' && input.method === 'GET' && input.url.includes('api/sessions?')) {
        return {
            status: 200,
            json: async () => {
                return [];
            }
        } as any;
    }
    if (typeof input !== 'string' && input.method === 'POST' && input.url.includes('api/sessions?')) {
        const body = await input.json();
        const id = generateUuid();
        const url = await spawnServer(pythonEnv);
        MyWebSocket.serverUris.set(id, url);
        return {
            status: 201,
            json: async () => {
                return {
                    id,
                    path: body.path,
                    type: body.type || 'notebook',
                    name: body.kernel.name,
                    kernel: {
                        id,
                        name: body.kernel.name
                    },
                    notebook: {
                        path: body.path
                    }
                };
            }
        } as any;
    }
    debugger;
    return {} as any;
}
export class ServerConnectionInformation implements JupyterServerConnectionInformation {
    baseUrl: Uri = Uri.parse('http://local.vscode.com:8888');
    fetch: (input: RequestInfo, _init?: RequestInit | undefined) => Promise<Response>;
    WebSocket = MyWebSocket as any;
    constructor(pythonEnv: PythonEnvironment) {
        this.fetch = (input: RequestInfo, init?: RequestInit | undefined) => fetchImpl(pythonEnv, input, init);
    }
}
