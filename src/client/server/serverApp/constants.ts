// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

export enum Routes {
    getKernelSpecs = '/api/kernelSpecs',
    spawnRawKernelProcess = '/api/kernels/raw'
}

export enum MessagePrefixes {
    Log = 'JVSC_LOG:',
    Error = 'JVSC_ERROR:',
    Port = 'JVSC_PORT:'
}
