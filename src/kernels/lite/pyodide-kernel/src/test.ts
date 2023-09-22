import * as kernel from './kernel';
import { KernelSpecs } from './kernels/kernelspecs';
import { IPyodideWorkerKernel } from './tokens';
import { IKernel } from './kernels/tokens';
import { Kernel, ServerConnection, Session } from '@jupyterlab/services';
import * as nodeFetch from 'node-fetch';
import { SESSION_SERVICE_URL } from '@jupyterlab/services/lib/session/restapi';
import { KERNEL_SERVICE_URL } from '@jupyterlab/services/lib/kernel/restapi';
import { ISpecModels } from '@jupyterlab/services/lib/kernelspec/restapi';
import { ReadWrite } from '../../../../platform/common/types';
// import WebSocketIsomorphic from 'isomorphic-ws';
import { WebSocket } from 'mock-socket';
import { Kernels } from './kernels/kernels';
import { IWebSocketLike, KernelSocketWrapper } from '../../../common/kernelSocketWrapper';
import { ClassType } from '../../../../platform/ioc/types';
import { traceError } from '../../../../platform/logging';
import { noop } from '../../../../platform/common/utils/misc';
import { IKernelSocket } from '../../../types';

const KERNELSPEC_SERVICE_URL = 'api/kernelspecs';

export const WebSockets = new Map<string, IKernelSocket>();
export function createWebSocketWrapper(ws: ClassType<IWebSocketLike>) {
    class JupyterWebSocket extends KernelSocketWrapper(ws) {
        private kernelId: string | undefined;
        private timer: NodeJS.Timeout | number;

        constructor(url: string, protocols?: string | string[] | undefined) {
            super(url, protocols);
            let timer: NodeJS.Timeout | undefined = undefined;
            // Parse the url for the kernel id
            const parsed = /.*\/kernels\/(.*)\/.*/.exec(url);
            if (parsed && parsed.length > 1) {
                this.kernelId = parsed[1];
            }
            if (this.kernelId) {
                WebSockets.set(this.kernelId, this);
                try {
                    (this as any).on('close', () => {
                        if (timer && this.timer !== timer) {
                            clearInterval(timer as any);
                        }
                        if (WebSockets.get(this.kernelId!) === this) {
                            WebSockets.delete(this.kernelId!);
                        }
                    });
                } catch (ex) {
                    //
                }
            } else {
                traceError('KernelId not extracted from Kernel WebSocket URL');
            }

            // Ping the websocket connection every 30 seconds to make sure it stays alive
            timer = this.timer = setInterval(() => (this as any).ping(noop), 30_000);
        }
    }
    return JupyterWebSocket as any;
}

export function getSettings(): ServerConnection.ISettings {
    const pyodidOptions: IPyodideWorkerKernel.IOptions = {
        baseUrl: 'http://localhost:8015/',
        pyodideUrl:
            // 'http://localhost:8016/pyodide.js',
            '/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/src/kernels/lite/pyodide-kernel/src/pyodide/pyodide.js',
        indexUrl:
            '/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/src/kernels/lite/pyodide-kernel/src/pyodide',
        // location: '',
        // disablePyPIFallback: false,
        // pipliteWheelUrl: 'http://localhost:9092/pypi/piplite-0.0.10-py3-none-any.whl',
        // pipliteUrls: ['http://localhost:9092/pypi/all.json']
        // baseUrl: 'http://localhost:8015/',
        disablePyPIFallback: false,
        // indexUrl: 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/',
        location: '',
        mountDrive: true,
        pipliteUrls: ['http://localhost:8015/pypi/all.json'],
        pipliteWheelUrl: 'http://localhost:8015/pypi/piplite-0.0.10-py3-none-any.whl'
    };
    console.error(pyodidOptions.baseUrl);
    const kernelspecs = new KernelSpecs();
    const kernels = new Kernels({ kernelspecs });
    kernelspecs.register({
        spec: {
            name: 'pyodide',
            display_name: 'Python (Pyodide)',
            language: 'python',
            argv: [],
            resources: {
                'logo-32x32': 'KERNEL_ICON_URL',
                'logo-64x64': 'KERNEL_ICON_URL'
            }
        },
        create: async (options: IKernel.IOptions): Promise<IKernel> => {
            // return kernels.startNew(options) as any;
            return new kernel.PyodideKernel({ ...options, ...pyodidOptions });
        }
    });
    const baseUrl = 'http://localhost:8015/';
    const wsUrl = 'ws://DUMMY:8015/';
    let kernelModel: ReadWrite<Kernel.IModel> = {
        id: '1',
        name: 'pyodide',
        connections: 1,
        type: 'notebook',
        path: 'notebook'
    } as any;

    const fetch = async (info: nodeFetch.RequestInfo, init?: nodeFetch.RequestInit | undefined) => {
        const url = typeof info === 'string' ? info : 'url' in info ? info.url : info.href;
        const method = (
            (typeof info === 'object' && 'method' in info ? info.method : init?.method) || 'get'
        ).toLowerCase();
        if (url.startsWith(`${baseUrl}${SESSION_SERVICE_URL}`) && method === 'post') {
            const result = await kernels.startNew({ id: '1', location: '', name: 'pyodide' });
            (kernelModel as any).type = 'notebook';
            (kernelModel as any).path = 'notebook';
            kernelModel.id = result.id;
            kernelModel.name = result.name;

            return {
                status: 201,
                json: () =>
                    Promise.resolve(<Session.IModel>{
                        path: 'hellothere',
                        type: 'notebook',
                        name: kernelModel.name,
                        id: kernelModel.id,
                        kernel: kernelModel
                    })
            };
        }
        if (url.startsWith(`${baseUrl}${KERNEL_SERVICE_URL}/`)) {
            return {
                status: 200,
                json: () => Promise.resolve(kernelModel)
            };
        }
        if (url.startsWith(`${baseUrl}${KERNELSPEC_SERVICE_URL}`)) {
            return {
                status: 200,
                json: () =>
                    Promise.resolve([
                        <ISpecModels>{
                            default: 'pyodide',
                            kernelspecs: {
                                pyodide: {
                                    argv: [],
                                    display_name: 'pyodide',
                                    language: 'python',
                                    name: 'pyodide',
                                    resources: {}
                                }
                            }
                        }
                    ])
            };
        }
        if (url.startsWith(`${baseUrl}${KERNEL_SERVICE_URL}`)) {
            return {
                status: 200,
                json: () => Promise.resolve([])
            };
        }
        if (url.startsWith(`${baseUrl}${SESSION_SERVICE_URL}?`) || url.startsWith(`${baseUrl}${KERNEL_SERVICE_URL}`)) {
            return {
                status: 200,
                json: () => Promise.resolve([])
            };
        }
        return nodeFetch.default(url, init);
    };
    return {
        appendToken: false,
        baseUrl,
        appUrl: 'http://localhost:8015/',
        WebSocket: createWebSocketWrapper(WebSocket as any),
        Request: nodeFetch.Request as any,
        Headers: nodeFetch.Headers as any,
        fetch: fetch as any,
        init: { cache: 'no-store', credentials: 'same-origin' },
        wsUrl,
        token: ''
    };
}
async function main() {
    const pyodidOptions: IPyodideWorkerKernel.IOptions = {
        baseUrl: 'http://localhost:8015/',
        pyodideUrl:
            // 'http://localhost:8016/pyodide.js',
            '/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/src/kernels/lite/pyodide-kernel/src/pyodide/pyodide.js',
        indexUrl:
            '/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/src/kernels/lite/pyodide-kernel/src/pyodide',
        // location: '',
        // disablePyPIFallback: false,
        // pipliteWheelUrl: 'http://localhost:9092/pypi/piplite-0.0.10-py3-none-any.whl',
        // pipliteUrls: ['http://localhost:9092/pypi/all.json']
        // baseUrl: 'http://localhost:8015/',
        disablePyPIFallback: false,
        // indexUrl: 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/',
        location: '',
        mountDrive: true,
        pipliteUrls: ['http://localhost:8015/pypi/all.json'],
        pipliteWheelUrl: 'http://localhost:8015/pypi/piplite-0.0.10-py3-none-any.whl'
    };

    const kernelspecs = new KernelSpecs();
    kernelspecs.register({
        spec: {
            name: 'pyodide',
            display_name: 'Python (Pyodide)',
            language: 'python',
            argv: [],
            resources: {
                'logo-32x32': 'KERNEL_ICON_URL',
                'logo-64x64': 'KERNEL_ICON_URL'
            }
        },
        create: async (options: IKernel.IOptions): Promise<IKernel> => {
            return new kernel.PyodideKernel({ ...options, ...pyodidOptions });
        }
    });

    const k = new kernel.PyodideKernel({
        ...pyodidOptions,
        id: Date.now().toString(),
        name: 'pyodide',
        sendMessage: (msg) => {
            console.error('Msg', msg);
        }
    });

    k.ready
        .then(() => {
            k.kernelInfoRequest()
                .then((info) => {
                    console.error('Kernle Info', info);
                })
                .catch((e) => console.error('Failed to get info', e))
                .finally(() =>
                    k.executeRequest({ code: 'print(1234)' }).then((r) => {
                        console.error(r);
                    })
                )
                .catch((e) => console.error('Exec failed', e));
        })
        .catch((e) => {
            console.error('Failed to send requets', e);
        });
}

main().catch((e) => console.error(`Main failed`, e));
