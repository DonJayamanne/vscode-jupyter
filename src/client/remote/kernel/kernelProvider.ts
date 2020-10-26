// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Kernel } from '@jupyterlab/services';
import { inject, injectable } from 'inversify';
import * as uuid from 'uuid/v4';
// tslint:disable-next-line: no-require-imports
import { CancellationToken, Event, EventEmitter, Uri } from 'vscode';
import {
    NotebookCell,
    NotebookDocument,
    NotebookKernel as VSCNotebookKernel,
    NotebookKernelProvider
} from '../../../../types/vscode-proposed';
import { IExtensionSingleActivationService } from '../../activation/types';
import { IVSCodeNotebook } from '../../common/application/types';
import { traceInfo } from '../../common/logger';
import { IDisposableRegistry } from '../../common/types';
import { noop } from '../../common/utils/misc';
import { translateMonacoToKernelLanguage } from '../../datascience/common';
import { Telemetry } from '../../datascience/constants';
import { areKernelConnectionsEqual } from '../../datascience/jupyter/kernels/helpers';
import { KernelSelectionProvider } from '../../datascience/jupyter/kernels/kernelSelections';
import { KernelSwitcher } from '../../datascience/jupyter/kernels/kernelSwitcher';
import { IKernel, IKernelProvider, KernelConnectionMetadata } from '../../datascience/jupyter/kernels/types';
import { JupyterNotebookView } from '../../datascience/notebook/constants';
import {
    getNotebookMetadata,
    isJupyterNotebook,
    updateKernelInfoInNotebookMetadata,
    updateKernelInNotebookMetadata
} from '../../datascience/notebook/helpers/helpers';
import { INotebookStorageProvider } from '../../datascience/notebookStorage/notebookStorageProvider';
import { INotebook, INotebookProvider } from '../../datascience/types';
import { captureTelemetry } from '../../telemetry';
import { RemoteJupyterAuthProvider } from '../auth/remoteJupyterAutProvider';
import { RemoteServer } from '../auth/server';
import { ServerSessionKernel } from '../auth/types';
// tslint:disable-next-line: no-var-requires no-require-imports
const vscodeNotebookEnums = require('vscode') as typeof import('vscode-proposed');

export class VSCodeNotebookRemoteKernelMetadata implements VSCNotebookKernel {
    get preloads(): Uri[] {
        return [];
    }
    get id() {
        // return getKernelConnectionId(this.selection);
        return uuid();
    }
    constructor(
        public readonly label: string,
        public readonly description: string,
        public readonly detail: string,
        public readonly selection: Readonly<KernelConnectionMetadata>,
        public readonly isPreferred: boolean,
        private readonly kernelProvider: IKernelProvider,
        private readonly notebook: IVSCodeNotebook
    ) {}
    public executeCell(doc: NotebookDocument, cell: NotebookCell) {
        traceInfo('Execute Cell in KernelProvider.ts');
        const kernel = this.kernelProvider.getOrCreate(cell.notebook.uri, { metadata: this.selection });
        if (kernel) {
            this.updateKernelInfoInNotebookWhenAvailable(kernel, doc);
            kernel.executeCell(cell).catch(noop);
        }
    }
    public executeAllCells(document: NotebookDocument) {
        const kernel = this.kernelProvider.getOrCreate(document.uri, { metadata: this.selection });
        if (kernel) {
            this.updateKernelInfoInNotebookWhenAvailable(kernel, document);
            kernel.executeAllCells(document).catch(noop);
        }
    }
    public cancelCellExecution(_: NotebookDocument, cell: NotebookCell) {
        this.kernelProvider.get(cell.notebook.uri)?.interrupt(); // NOSONAR
    }
    public cancelAllCellsExecution(document: NotebookDocument) {
        this.kernelProvider.get(document.uri)?.interrupt(); // NOSONAR
    }
    private updateKernelInfoInNotebookWhenAvailable(kernel: IKernel, doc: NotebookDocument) {
        const disposable = kernel.onStatusChanged(() => {
            if (!kernel.info) {
                return;
            }
            const editor = this.notebook.notebookEditors.find((item) => item.document === doc);
            if (!editor || editor.kernel?.id !== this.id) {
                return;
            }
            disposable.dispose();
            updateKernelInfoInNotebookMetadata(doc, kernel.info);
        });
    }
}

@injectable()
export class RemoteKernelPickerProvider implements NotebookKernelProvider, IExtensionSingleActivationService {
    public get onDidChangeKernels(): Event<NotebookDocument | undefined> {
        return this._onDidChangeKernels.event;
    }
    private readonly _onDidChangeKernels = new EventEmitter<NotebookDocument | undefined>();
    private notebookKernelChangeHandled = new WeakSet<INotebook>();
    constructor(
        @inject(KernelSelectionProvider) private readonly kernelSelectionProvider: KernelSelectionProvider,
        @inject(IKernelProvider) private readonly kernelProvider: IKernelProvider,
        @inject(IVSCodeNotebook) private readonly notebook: IVSCodeNotebook,
        @inject(INotebookStorageProvider) private readonly storageProvider: INotebookStorageProvider,
        @inject(INotebookProvider) private readonly notebookProvider: INotebookProvider,
        @inject(KernelSwitcher) private readonly kernelSwitcher: KernelSwitcher,
        @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry
    ) {
        this.kernelSelectionProvider.onDidChangeSelections(
            (e) => {
                if (e) {
                    const doc = this.notebook.notebookDocuments.find((d) => d.uri.fsPath === e.fsPath);
                    if (doc) {
                        return this._onDidChangeKernels.fire(doc);
                    }
                }
                this._onDidChangeKernels.fire(undefined);
            },
            this,
            disposables
        );
        this.notebook.onDidChangeActiveNotebookKernel(this.onDidChangeActiveNotebookKernel, this, disposables);
    }

    public async activate() {
        this.notebook.registerNotebookKernelProvider(
            { filenamePattern: '**/*.ipynb', viewType: JupyterNotebookView },
            this
        );
    }
    @captureTelemetry(Telemetry.KernelProviderPerf)
    public async provideKernels(
        document: NotebookDocument,
        token: CancellationToken
    ): Promise<VSCodeNotebookRemoteKernelMetadata[]> {
        const scheme = document.uri.scheme;
        const server = RemoteJupyterAuthProvider.getServerByFileScheme(scheme);
        if (!server) {
            return [];
        }
        const [preferredKernel, kernels] = await Promise.all([
            this.getPreferredKernel(document, token),
            this.getKernels(document, token)
        ]);
        if (token.isCancellationRequested) {
            return [];
        }

        const mapped = [...(preferredKernel ? [preferredKernel] : []), ...(kernels || [])];
        mapped.sort((a, b) => {
            if (a.label > b.label) {
                return 1;
            } else if (a.label === b.label) {
                return 0;
            } else {
                return -1;
            }
        });
        return mapped;
    }
    private async getPreferredKernel(
        document: NotebookDocument,
        _token: CancellationToken
    ): Promise<undefined | VSCodeNotebookRemoteKernelMetadata> {
        const server = RemoteJupyterAuthProvider.getServerByFileScheme(document.uri.scheme);
        if (!server) {
            return;
        }
        // If this document is associated with a kernel that is already running, then use that kernel.
        const sessions = await server.getSessions();
        const kernelSpecsPromise = Kernel.getSpecs(server.info).then((item) => item.kernelspecs);
        const kernelSpecsList: Kernel.ISpecModel[] = Object.values(await kernelSpecsPromise);
        if (sessions.length > 0) {
            const relatedSession = sessions.find(
                (item) => Uri.file(item.path).with({ scheme: server.fileScheme }).fsPath === document.uri.fsPath
            );
            if (relatedSession) {
                return this.getLiveKernel(server, kernelSpecsList, relatedSession.kernel);
            }
        }
        const metadata = getNotebookMetadata(document);
        const languages = document.cells
            .filter((item) => item.cellKind === vscodeNotebookEnums.CellKind.Code)
            .map((item) => item.language);
        let preferredKernelSpec: Kernel.ISpecModel | undefined;
        if (metadata?.kernelspec) {
            preferredKernelSpec = kernelSpecsList.find((item) => item.name === metadata.kernelspec?.name);
        }
        if (metadata?.language_info) {
            preferredKernelSpec = kernelSpecsList.find((item) => item.language === metadata?.language_info?.name);
        }
        if (languages.length) {
            preferredKernelSpec = kernelSpecsList.find(
                (item) => item.language === translateMonacoToKernelLanguage(languages[0])
            );
        }
        if (preferredKernelSpec) {
            return new VSCodeNotebookRemoteKernelMetadata(
                preferredKernelSpec.name,
                'description',
                'detail',
                {
                    kernelSpec: {
                        ...preferredKernelSpec,
                        ...({
                            path: preferredKernelSpec.argv.length ? preferredKernelSpec.argv[0] : ''
                            // tslint:disable-next-line: no-any
                        } as any)
                    },
                    kind: 'startUsingKernelSpec'
                },
                true,
                this.kernelProvider,
                this.notebook
            );
        }
    }
    private getLiveKernel(server: RemoteServer, kernelSpecsList: Kernel.ISpecModel[], liveKernel: ServerSessionKernel) {
        const spec = kernelSpecsList.find((item) => item.name === liveKernel.name)!;
        // const model = await Kernel.findById(relatedSession.id, server.info);
        return new VSCodeNotebookRemoteKernelMetadata(
            spec.display_name,
            `Remote Kernel for ${server.label}`,
            `Live kernel with ${liveKernel.connections} connections since ${liveKernel.last_activity}`,
            {
                kernelModel: {
                    ...liveKernel,
                    ...{
                        lastActivityTime: new Date(liveKernel.last_activity),
                        numberOfConnections: liveKernel.connections
                    }
                    // tslint:disable-next-line: no-any
                } as any,
                kind: 'connectToLiveKernel'
            },
            true,
            this.kernelProvider,
            this.notebook
        );
    }
    private getKernelSpec(server: RemoteServer, kernelModel: Kernel.ISpecModel) {
        return new VSCodeNotebookRemoteKernelMetadata(
            kernelModel.display_name,
            `Remote Kernel for ${server.label}`,
            kernelModel.argv.length ? kernelModel.argv[0] : kernelModel.language,
            {
                kernelSpec: {
                    ...kernelModel,
                    ...({
                        path: kernelModel.argv.length ? kernelModel.argv[0] : ''
                        // tslint:disable-next-line: no-any
                    } as any)
                },
                kind: 'startUsingKernelSpec'
            },
            true,
            this.kernelProvider,
            this.notebook
        );
    }
    private async getKernels(
        document: NotebookDocument,
        _token: CancellationToken
    ): Promise<VSCodeNotebookRemoteKernelMetadata[]> {
        const server = RemoteJupyterAuthProvider.getServerByFileScheme(document.uri.scheme);
        if (!server) {
            return [];
        }
        const [liveKernels, specs] = await Promise.all([server.getKernels(), Kernel.getSpecs(server.info)]);
        const kernelSpecsList: Kernel.ISpecModel[] = Object.values(specs.kernelspecs);
        return [
            ...liveKernels
                .map((item) => this.getLiveKernel(server, kernelSpecsList, item))
                .filter((item) => !!item)
                .map((item) => item!),
            ...kernelSpecsList.map(this.getKernelSpec.bind(this, server))
        ];
    }
    private async onDidChangeActiveNotebookKernel({
        document,
        kernel
    }: {
        document: NotebookDocument;
        kernel: VSCNotebookKernel | undefined;
    }) {
        // We're only interested in our Jupyter Notebooks & our kernels.
        if (!kernel || !(kernel instanceof VSCodeNotebookRemoteKernelMetadata) || !isJupyterNotebook(document)) {
            return;
        }
        const selectedKernelConnectionMetadata = kernel.selection;

        const model = this.storageProvider.get(document.uri);
        if (!model || !model.isTrusted) {
            // tslint:disable-next-line: no-suspicious-comment
            // TODO: https://github.com/microsoft/vscode-python/issues/13476
            // If a model is not trusted, we cannot change the kernel (this results in changes to notebook metadata).
            // This is because we store selected kernel in the notebook metadata.
            return;
        }

        const existingKernel = this.kernelProvider.get(document.uri);
        if (existingKernel && areKernelConnectionsEqual(existingKernel.metadata, selectedKernelConnectionMetadata)) {
            return;
        }

        // Make this the new kernel (calling this method will associate the new kernel with this Uri).
        // Calling `getOrCreate` will ensure a kernel is created and it is mapped to the Uri provided.
        // This way other parts of extension have access to this kernel immediately after event is handled.
        this.kernelProvider.getOrCreate(document.uri, {
            metadata: selectedKernelConnectionMetadata
        });

        // Change kernel and update metadata.
        const notebook = await this.notebookProvider.getOrCreateNotebook({
            resource: document.uri,
            identity: document.uri,
            getOnly: true
        });

        // If we have a notebook, change its kernel now
        if (notebook) {
            if (!this.notebookKernelChangeHandled.has(notebook)) {
                this.notebookKernelChangeHandled.add(notebook);
                notebook.onKernelChanged(
                    (e) => {
                        if (notebook.disposed) {
                            return;
                        }
                        updateKernelInNotebookMetadata(document, e);
                    },
                    this,
                    this.disposables
                );
            }
            // tslint:disable-next-line: no-suspicious-comment
            // TODO: https://github.com/microsoft/vscode-python/issues/13514
            // We need to handle these exceptions in `siwthKernelWithRetry`.
            // We shouldn't handle them here, as we're already handling some errors in the `siwthKernelWithRetry` method.
            // Adding comment here, so we have context for the requirement.
            this.kernelSwitcher.switchKernelWithRetry(notebook, selectedKernelConnectionMetadata).catch(noop);
        } else {
            updateKernelInNotebookMetadata(document, selectedKernelConnectionMetadata);
        }
    }
}
