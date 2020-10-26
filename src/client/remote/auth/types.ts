// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { nbformat } from '@jupyterlab/coreutils';

// type NotebookEntry = {
//     name: string;
//     path: string;
//     last_modified: string;
//     created: string;
//     size: number;
//     writable: boolean;
//     type: 'notebook';
// };
export type DirectoryEntry = {
    readonly name: string;
    readonly path: string;
    readonly last_modified: string;
    readonly created: string;
    readonly writable: boolean;
    readonly type: 'directory';
};
export type FileEntry = {
    readonly name: string;
    readonly path: string;
    readonly last_modified: string;
    readonly created: string;
    readonly mimetype?: string;
    readonly content?: string | nbformat.INotebookContent;
    readonly size: number;
    readonly writable: boolean;
    readonly type: 'file' | 'notebook';
};

export type DirectoryResponse = DirectoryEntry & {
    readonly content: (DirectoryEntry | FileEntry)[];
};
export type ServerStatus = {
    readonly started: string;
    readonly last_activity: string;
    readonly connections: 0;
    readonly kernels: 0;
};
export type ServerSessionKernel = {
    id: string;
    name: string;
    last_activity: string;
    connections: number;
    execution_state: string;
};
export type ServerSession = {
    id: string;
    path: string;
    name: string;
    type: 'notebook' | 'do we have anything else?';
    kernel: ServerSessionKernel;
};
export type ServerKernelSpecs = {
    default: string;
    kernelspecs: Record<string, ServerKernelSpec>;
};
export type ServerKernelSpec = {
    name: string;
    spec: {
        argv: string[];
        env: {};
        display_name: string;
        language: string;
        interrupt_mode?: 'signal' | 'message';
        metadata: {};
    };
};
