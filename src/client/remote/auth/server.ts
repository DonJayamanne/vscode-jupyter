// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ContentsManager, KernelManager, ServerConnection, SessionManager } from '@jupyterlab/services';
import { EventEmitter } from 'vscode';
import { IJupyterKernelSpec } from '../../datascience/types';
import {
    DirectoryEntry,
    DirectoryResponse,
    FileEntry,
    ServerSession,
    ServerSessionKernel,
    ServerStatus
} from './types';
// tslint:disable: no-any
export class RemoteServer {
    public get onDidDispose() {
        return this._disposed.event;
    }
    public readonly _disposed = new EventEmitter<void>();
    constructor(
        public readonly label: string,
        public readonly fileScheme: string,
        public readonly info: Readonly<ServerConnection.ISettings>
    ) {}
    public dispose() {
        this._disposed.fire();
    }

    public async getStatus(): Promise<ServerStatus> {
        // return this.fetch<ServerStatus>('api/status');
        return {
            connections: 0,
            kernels: 0,
            last_activity: '',
            started: ''
        };
    }
    public async getSessions(): Promise<ServerSession[]> {
        const mgr = new SessionManager({ serverSettings: this.info });
        await mgr.refreshRunning();
        const sessions: ServerSession[] = [];
        const iterator = mgr.running();
        let session = iterator.next();

        while (session) {
            sessions.push(session as any);
            session = iterator.next();
        }

        return sessions;

        // return this.fetch<ServerSession[]>('api/sessions');
    }
    public async getKernels(): Promise<ServerSessionKernel[]> {
        const kernelManager = new KernelManager({ serverSettings: this.info });
        await kernelManager.refreshRunning();
        const sessions: ServerSessionKernel[] = [];
        const iterator = kernelManager.running();
        let session = iterator.next();

        while (session) {
            sessions.push(session as any);
            session = iterator.next();
        }

        return sessions;

        // return this.fetch<ServerSessionKernel[]>('api/kernels');
    }
    public async getKernelSpecs(): Promise<IJupyterKernelSpec[]> {
        const kernelManager = new KernelManager({ serverSettings: this.info });
        await kernelManager.refreshSpecs();
        // return kernelManager.specs;
        // const item = await this.fetch<ServerKernelSpecs>('api/kernelspecs');
        return Object.keys(kernelManager.specs!.kernelspecs).map((specName) => {
            const spec = kernelManager.specs!.kernelspecs[specName]!;
            return {
                argv: Array.isArray(spec.argv) ? spec.argv : [],
                display_name: spec.display_name || '',
                name: spec.name,
                path: Array.isArray(spec.argv) && spec.argv.length ? spec.argv[0] : '',
                env: (spec.env as any) || {},
                // interrupt_mode: (spec as any).interrupt_mode,
                language: spec.language,
                metadata: spec.metadata as any
            };
        });
    }
    public async getDirectoryContents(directory?: DirectoryEntry | string): Promise<DirectoryResponse> {
        const contentManager = new ContentsManager({ serverSettings: this.info });
        const dir = directory ? (typeof directory === 'string' ? directory : directory.path) : '';
        return contentManager.get(dir) as any;

        // return this.fetch<DirectoryResponse>(`api/contents${dir.startsWith('/') ? '' : '/'}${dir}`);
    }
    public async getFileOrDirectory(path?: string): Promise<DirectoryResponse | FileEntry> {
        const contentManager = new ContentsManager({ serverSettings: this.info });
        return contentManager.get(path ? path : '') as any;
        // const separator = path && path.startsWith('/') ? '' : '/';
        // return this.fetch<DirectoryResponse | FileEntry>(`api/contents${separator}${path || ''}`);
    }
    // public async createFile(filePath: string, contents?: string): Promise<FileEntry> {
    //     return this.fetch<DirectoryResponse>(`api/contents${directory ? '/' : ''}${directory?.path || ''}`);
    // }
    public async saveFile(_: FileEntry, __: string): Promise<void> {
        // const body = {
        //     type: 'file',
        //     format: 'text',
        //     content
        // };
        // const updatedFile = await this.put<FileEntry>(`api/contents${file?.path || ''}`, {
        //     method: 'put',
        //     body
        // });
        // Object.assign(file, updatedFile);
    }
    public async deletePath(_: FileEntry | DirectoryEntry): Promise<void> {
        // await this.delete(`api/contents${item.path}`);
    }
    public async getFileContent(file: FileEntry): Promise<string> {
        const contentManager = new ContentsManager({ serverSettings: this.info });
        const response = await contentManager.get(file.path);
        // const response = await this.fetch<FileEntry>(`api/contents/${file.path}`);
        if (!response.content) {
            return '';
        }
        if (typeof response.content === 'string') {
            return response.content;
        }
        if (typeof response.content === 'object') {
            return JSON.stringify(response.content);
        }
        return '';
    }

    // private async fetch<T>(url: string): Promise<T> {
    //     return this.request<T>(url, { method: 'get' });
    // }
    // private async put<T>(url: string, body: {}): Promise<T> {
    //     return this.request<T>(url, { method: 'get', body: JSON.stringify(body) });
    // }
    // private async delete(url: string): Promise<void> {
    //     await this.request<any>(url, { method: 'delete' });
    // }
    // private async request<T>(url: string, options: { method: 'get' | 'put' | 'delete'; body?: string }): Promise<T> {
    //     try {
    //         const prefix = `${this.info.baseUrl}${this.info.baseUrl.endsWith('/') ? '' : '/'}`;
    //         const result = await this.info.fetch(`${prefix}${url}`, {
    //             // ...this.info.init,
    //             method: options.method,
    //             body: options.body
    //         });
    //         return result.json() as Promise<T>;
    //     } catch (ex) {
    //         // tslint:disable-next-line: no-console
    //         console.error(ex);
    //         throw ex;
    //     }
    // }
}
