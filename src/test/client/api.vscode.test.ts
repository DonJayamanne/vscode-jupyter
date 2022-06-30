/* eslint-disable @typescript-eslint/no-explicit-any */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { assert } from 'chai';
import { traceInfo } from '../../platform/logging';
import { IDisposable } from '../../platform/common/types';
import {
    closeNotebooksAndCleanUpAfterTests,
    createEmptyPythonNotebook,
    createTemporaryNotebook,
    insertCodeCell,
    prewarmNotebooks,
    runCell,
    startJupyterServer,
    waitForTextOutput
} from '../datascience/notebook/helper.node';
import { initialize } from '../initialize.node';
import * as sinon from 'sinon';
import { captureScreenShot, createEventHandler, IExtensionTestApi } from '../common.node';
import { IVSCodeNotebook } from '../../platform/common/application/types';
import { IS_REMOTE_NATIVE_TEST } from '../constants.node';
import { workspace } from 'vscode';
import { KernelConnectionMetadata } from '../../kernels/types';

// eslint-disable-next-line
suite('3rd Party Kernel Service API', function () {
    let api: IExtensionTestApi;
    let vscodeNotebook: IVSCodeNotebook;
    const disposables: IDisposable[] = [];
    this.timeout(120_000);
    suiteSetup(async function () {
        traceInfo('Suite Setup VS Code Notebook - Execution');
        this.timeout(120_000);
        try {
            api = await initialize();
            await startJupyterServer();
            await prewarmNotebooks();
            sinon.restore();
            vscodeNotebook = api.serviceContainer.get<IVSCodeNotebook>(IVSCodeNotebook);
            traceInfo('Suite Setup (completed)');
        } catch (e) {
            traceInfo('Suite Setup (failed) - Execution');
            await captureScreenShot('API-suite');
            throw e;
        }
    });
    // Use same notebook without starting kernel in every single test (use one for whole suite).
    setup(async function () {
        try {
            traceInfo(`Start Test ${this.currentTest?.title}`);
            sinon.restore();
            await startJupyterServer();
            traceInfo(`Start Test (completed) ${this.currentTest?.title}`);
        } catch (e) {
            await captureScreenShot(this);
            throw e;
        }
    });
    teardown(async function () {
        traceInfo(`Ended Test ${this.currentTest?.title}`);
        if (this.currentTest?.isFailed()) {
            await captureScreenShot(this);
        }
        // Added temporarily to identify why tests are failing.
        await closeNotebooksAndCleanUpAfterTests(disposables);
        traceInfo(`Ended Test (completed) ${this.currentTest?.title}`);
    });
    suiteTeardown(() => closeNotebooksAndCleanUpAfterTests(disposables));

    function getMetadataForComparison(metadata: KernelConnectionMetadata) {
        metadata = JSON.parse(JSON.stringify(metadata));
        if ('kernelSpec' in metadata) {
            metadata.kernelSpec.specFile = undefined;
        }
        return metadata;
    }
    function compareKernelConnectionMetadata(a: KernelConnectionMetadata, b: KernelConnectionMetadata) {
        const aJson = getMetadataForComparison(a);
        if (a.interpreter?.uri) {
            aJson.interpreter!.uri = a.interpreter.uri.toString() as any;
        }
        if ('kernelSpec' in aJson && aJson.kernelSpec.metadata) {
            delete aJson.kernelSpec.metadata.interpreter;
        }
        const bJson = getMetadataForComparison(b);
        if (b.interpreter?.uri) {
            bJson.interpreter!.uri = b.interpreter.uri.toString() as any;
        }
        if ('kernelSpec' in bJson && bJson.kernelSpec.metadata) {
            delete bJson.kernelSpec.metadata.interpreter;
        }
        assert.deepEqual(
            aJson,
            bJson,
            `Kernel Connection is not the same, actual ${JSON.stringify(
                aJson,
                undefined,
                3
            )}, expected ${JSON.stringify(bJson, undefined, 3)}`
        );
    }
    test('List kernel specs', async () => {
        const kernelService = await api.getKernelService();

        // Verify we can invoke the methods on the service.
        const specs = await kernelService!.getKernelSpecifications();
        assert.isAtLeast(specs.length, 1);
    });

    test('Access Kernels', async () => {
        const kernelService = await api.getKernelService();
        const onDidChangeKernels = createEventHandler(kernelService!, 'onDidChangeKernels');

        await createEmptyPythonNotebook(disposables);
        await insertCodeCell('print("123412341234")', { index: 0 });
        const cell = vscodeNotebook.activeNotebookEditor?.notebook.cellAt(0)!;
        await Promise.all([runCell(cell), waitForTextOutput(cell, '123412341234')]);

        await onDidChangeKernels.assertFiredExactly(1);

        const kernels = kernelService?.getActiveKernels();
        assert.isAtLeast(kernels!.length, 1);
        assert.strictEqual(
            kernels![0].uri!.toString(),
            vscodeNotebook.activeNotebookEditor?.notebook.uri.toString(),
            'Kernel notebook is not the active notebook'
        );

        assert.isObject(kernels![0].metadata, 'Kernel Connection is undefined');
        const kernel = kernelService?.getKernel(vscodeNotebook.activeNotebookEditor!.notebook!.uri);
        assert.strictEqual(kernels![0].metadata, kernel!.metadata, 'Kernel Connection not same for the document');

        await closeNotebooksAndCleanUpAfterTests(disposables);

        await onDidChangeKernels.assertFiredExactly(2);
    });

    test('Start Kernel', async function () {
        const kernelService = await api.getKernelService();
        const onDidChangeKernels = createEventHandler(kernelService!, 'onDidChangeKernels');

        const kernelSpecs = await kernelService!.getKernelSpecifications();
        const pythonKernel = IS_REMOTE_NATIVE_TEST()
            ? kernelSpecs.find(
                  (item) => item.kind === 'startUsingRemoteKernelSpec' && item.kernelSpec.language === 'python'
              )
            : kernelSpecs.find((item) => item.kind === 'startUsingPythonInterpreter');
        assert.isOk(pythonKernel, 'Python Kernel Spec not found');

        // Don't use same file (due to dirty handling, we might save in dirty.)
        // Coz we won't save to file, hence extension will backup in dirty file and when u re-open it will open from dirty.
        const nbFile = await createTemporaryNotebook([], disposables);
        const nb = await workspace.openNotebookDocument(nbFile);
        const kernelInfo = await kernelService?.startKernel(pythonKernel!, nb.uri!);

        assert.isOk(kernelInfo!.connection, 'Kernel Connection is undefined');
        assert.isOk(kernelInfo!.kernelSocket, 'Kernel Socket is undefined');

        await onDidChangeKernels.assertFiredExactly(1);

        let kernels = kernelService?.getActiveKernels();
        assert.isAtLeast(kernels!.length, 1);
        assert.strictEqual(
            kernels![0].uri!.toString(),
            nb.uri.toString(),
            'Kernel notebook is not the active notebook'
        );

        compareKernelConnectionMetadata(kernels![0].metadata as any, pythonKernel as any);
        const kernel = kernelService?.getKernel(nb.uri);
        compareKernelConnectionMetadata(kernels![0].metadata as any, kernel!.metadata as any);

        await closeNotebooksAndCleanUpAfterTests(disposables);

        await onDidChangeKernels.assertFiredExactly(2);

        assert.strictEqual(kernelInfo!.connection.connectionStatus, 'disconnected');
        assert.isTrue(kernelInfo!.connection.isDisposed, 'Not disposed');
    });
});
