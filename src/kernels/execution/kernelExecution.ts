// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

'use strict';

import { KernelMessage } from '@jupyterlab/services';
import { traceInfo, traceInfoIfCI, traceWarning } from '../../platform/logging';
import { IDisposable, Resource } from '../../platform/common/types';
import { createDeferred, waitForPromise } from '../../platform/common/utils/async';
import { StopWatch } from '../../platform/common/utils/stopWatch';
import { sendKernelTelemetryEvent } from '../telemetry/sendKernelTelemetryEvent';
import { Telemetry } from '../../telemetry';
import { IKernelConnectionSession, InterruptResult, KernelConnectionMetadata } from '../../kernels/types';
import { noop } from '../../platform/common/utils/misc';

/**
 * Separate class that deals just with kernel execution.
 * Else the `Kernel` class gets very big.
 */
export class KernelExecution implements IDisposable {
    protected readonly disposables: IDisposable[] = [];
    private _interruptPromise?: Promise<InterruptResult>;
    private _restartPromise?: Promise<void>;
    private disposed?: boolean;
    public get restarting() {
        return this._restartPromise || Promise.resolve();
    }
    constructor(
        protected readonly resourceUri: Resource,
        protected readonly kernelConnectionMetadata: KernelConnectionMetadata,
        private readonly interruptTimeout: number
    ) {}

    public async cancel() {
        noop();
    }

    /**
     * Interrupts the execution of cells.
     * If we don't have a kernel (Jupyter Session) available, then just abort all of the cell executions.
     */
    public async interrupt(sessionPromise?: Promise<IKernelConnectionSession>): Promise<InterruptResult> {
        const session = sessionPromise ? await sessionPromise.catch(() => undefined) : undefined;
        const pendingExecutions = this.cancelPendingExecutions();
        traceInfo('Interrupt kernel execution');

        if (!session) {
            traceInfo('No kernel session to interrupt');
            this._interruptPromise = undefined;
            await pendingExecutions;
            return InterruptResult.Success;
        }

        // Interrupt the active execution
        const result = this._interruptPromise
            ? await this._interruptPromise
            : await (this._interruptPromise = this.interruptExecution(session, pendingExecutions));

        // Done interrupting, clear interrupt promise
        this._interruptPromise = undefined;

        return result;
    }
    protected async cancelPendingExecutions(): Promise<void> {
        noop();
    }
    /**
     * Restarts the kernel
     * If we don't have a kernel (Jupyter Session) available, then just abort all of the cell executions.
     */
    public async restart(sessionPromise?: Promise<IKernelConnectionSession>): Promise<void> {
        const session = sessionPromise ? await sessionPromise.catch(() => undefined) : undefined;

        if (!session) {
            traceInfo('No kernel session to interrupt');
            this._restartPromise = undefined;
            return;
        }

        // Restart the active execution
        if (!this._restartPromise) {
            this._restartPromise = this.restartExecution(session);
            this._restartPromise
                // Done restarting, clear restart promise
                .finally(() => (this._restartPromise = undefined))
                .catch(noop);
        }
        await this._restartPromise;
    }
    public dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        traceInfoIfCI(`Dispose KernelExecution`);
        this.disposables.forEach((d) => d.dispose());
    }
    private async interruptExecution(
        session: IKernelConnectionSession,
        pendingExecutions: Promise<unknown>
    ): Promise<InterruptResult> {
        const restarted = createDeferred<boolean>();
        const stopWatch = new StopWatch();
        // Listen to status change events so we can tell if we're restarting
        const restartHandler = (e: KernelMessage.Status) => {
            if (e === 'restarting' || e === 'autorestarting') {
                // We restarted the kernel.
                traceWarning('Kernel restarting during interrupt');

                // Indicate we restarted the race below
                restarted.resolve(true);
            }
        };
        const restartHandlerToken = session.onSessionStatusChanged(restartHandler);

        // Start our interrupt. If it fails, indicate a restart
        session.interrupt().catch((exc) => {
            traceWarning(`Error during interrupt: ${exc}`);
            restarted.resolve(true);
        });

        const promise = (async () => {
            try {
                // Wait for all of the pending cells to finish or the timeout to fire
                const result = await waitForPromise(
                    Promise.race([pendingExecutions, restarted.promise]),
                    this.interruptTimeout
                );

                // See if we restarted or not
                if (restarted.completed) {
                    return InterruptResult.Restarted;
                }

                if (result === null) {
                    // We timed out. You might think we should stop our pending list, but that's not
                    // up to us. The cells are still executing. The user has to request a restart or try again
                    return InterruptResult.TimedOut;
                }

                // Indicate the interrupt worked.
                return InterruptResult.Success;
            } catch (exc) {
                // Something failed. See if we restarted or not.
                if (restarted.completed) {
                    return InterruptResult.Restarted;
                }

                // Otherwise a real error occurred.
                sendKernelTelemetryEvent(
                    this.resourceUri,
                    Telemetry.NotebookInterrupt,
                    { duration: stopWatch.elapsedTime },
                    undefined,
                    exc
                );
                throw exc;
            } finally {
                restartHandlerToken.dispose();
            }
        })();

        return promise.then((result) => {
            sendKernelTelemetryEvent(
                this.resourceUri,
                Telemetry.NotebookInterrupt,
                { duration: stopWatch.elapsedTime },
                {
                    result
                }
            );
            return result;
        });
    }

    private async restartExecution(session: IKernelConnectionSession): Promise<void> {
        // Just use the internal session. Pending cells should have been canceled by the caller
        await session.restart();
    }
}
