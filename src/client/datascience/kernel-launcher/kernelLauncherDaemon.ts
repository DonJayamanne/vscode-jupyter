// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { ChildProcess } from 'child_process';
import * as fs from 'fs-extra';
import { inject, injectable, optional } from 'inversify';
import { IDisposable } from 'monaco-editor';
import { IPythonExecutionFactory, ObservableExecutionResult } from '../../common/process/types';
import { Resource } from '../../common/types';
import { noop } from '../../common/utils/misc';
import { PythonEnvironment } from '../../pythonEnvironments/info';
import { IJupyterKernelSpec } from '../types';
import { KernelDaemonPool } from './kernelDaemonPool';
import { KernelEnvironmentVariablesService } from './kernelEnvVarsService';
import { IPythonKernelDaemon } from './types';

/**
 * Launches a Python kernel in a daemon.
 * We need a daemon for the sole purposes of being able to interrupt kernels in Windows.
 * (Else we don't need a kernel).
 */
@injectable()
export class PythonKernelLauncherDaemon implements IDisposable {
    private readonly processesToDispose: ChildProcess[] = [];
    constructor(
        @inject(KernelDaemonPool) private readonly daemonPool: KernelDaemonPool,
        @inject(KernelEnvironmentVariablesService)
        private readonly kernelEnvVarsService: KernelEnvironmentVariablesService,
        @inject(IPythonExecutionFactory)
        private readonly pythonExecFactory: IPythonExecutionFactory,
        @optional()
        private readonly useLongRunningKernels?: boolean
    ) {}
    public async launch(
        resource: Resource,
        workingDirectory: string,
        kernelSpec: IJupyterKernelSpec,
        interpreter?: PythonEnvironment
    ): Promise<{ observableOutput: ObservableExecutionResult<string>; daemon: IPythonKernelDaemon | undefined }> {
        // Check to see if we have the type of kernelspec that we expect
        const args = kernelSpec.argv.slice();
        const modulePrefixIndex = args.findIndex((item) => item === '-m');
        if (modulePrefixIndex === -1) {
            throw new Error(
                `Unsupported KernelSpec file. args must be [<pythonPath>, '-m', <moduleName>, arg1, arg2, ..]. Provied ${args.join(
                    ' '
                )}`
            );
        }
        const moduleName = args[modulePrefixIndex + 1];
        const moduleArgs = args.slice(modulePrefixIndex + 2);
        const envPromise = this.kernelEnvVarsService.getEnvironmentVariables(resource, kernelSpec);
        const wdExistsPromise = fs.pathExists(workingDirectory);

        if (this.useLongRunningKernels) {
            const [executionFactory, env, wdExists] = await Promise.all([
                this.pythonExecFactory.createActivatedEnvironment({ interpreter, resource }),
                envPromise,
                wdExistsPromise
            ]);
            // Don't use daemon for processes that are detached.
            const observableOutput = executionFactory.execModuleObservable(moduleName, moduleArgs, {
                env,
                cwd: wdExists ? workingDirectory : process.cwd(),
                detached: this.useLongRunningKernels
            });

            return { observableOutput, daemon: undefined };
        } else {
            const [daemon, wdExists, env] = await Promise.all([
                this.daemonPool.get(resource, kernelSpec, interpreter),
                wdExistsPromise,
                envPromise
            ]);

            // The daemon pool can return back a non-IPythonKernelDaemon if daemon service is not supported or for Python 2.
            // Use a check for the daemon.start function here before we call it.
            if (!('start' in daemon)) {
                // If we don't have a KernelDaemon here then we have an execution service and should use that to launch
                const observableOutput = daemon.execModuleObservable(moduleName, moduleArgs, {
                    env,
                    cwd: wdExists ? workingDirectory : process.cwd(),
                    detached: this.useLongRunningKernels
                });

                return { observableOutput, daemon: undefined };
            } else {
                // In the case that we do have a kernel deamon, just return it
                const observableOutput = await daemon.start(moduleName, moduleArgs, {
                    env,
                    cwd: workingDirectory,
                    detached: this.useLongRunningKernels
                });
                if (observableOutput.proc) {
                    this.processesToDispose.push(observableOutput.proc);
                }
                return { observableOutput, daemon };
            }
        }
    }
    public dispose() {
        while (this.processesToDispose.length) {
            try {
                this.processesToDispose.shift()!.kill();
            } catch {
                noop();
            }
        }
    }
}
