// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { KernelConnectionMetadata } from './types';

export class KernelConnectionMetadataProxy {
    public get kernelModel() {
        return 'kernelModel' in this.metadata ? this.metadata['kernelModel'] : undefined;
    }
    public get interpreter() {
        return this.metadata.interpreter;
    }
    public get kernelSpec() {
        return 'kernelSpec' in this.metadata ? this.metadata['kernelSpec'] : undefined;
    }
    public get kind() {
        return this.metadata.kind;
    }
    public get baseUrl() {
        return 'baseUrl' in this.metadata ? this.metadata['baseUrl'] : undefined;
    }
    public get serverId() {
        return 'serverId' in this.metadata ? this.metadata['serverId'] : undefined;
    }
    public get id() {
        return this.metadata.id;
    }
    private constructor(public metadata: KernelConnectionMetadata) {
        this.metadata = metadata;
    }
    public update(metadata: KernelConnectionMetadata) {
        this.metadata = metadata;
    }
    static isWrapped(
        metadata: KernelConnectionMetadata | KernelConnectionMetadataProxy
    ): metadata is KernelConnectionMetadataProxy {
        if (metadata instanceof KernelConnectionMetadataProxy) {
            return true;
        }
        return false;
    }
    static wrap(metadata: KernelConnectionMetadata): KernelConnectionMetadata {
        if (metadata instanceof KernelConnectionMetadataProxy) {
            return metadata;
        }
        return new KernelConnectionMetadataProxy(metadata) as unknown as KernelConnectionMetadata;
    }
}
