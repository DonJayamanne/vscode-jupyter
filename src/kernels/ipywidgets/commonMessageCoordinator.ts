// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import type { KernelMessage } from '@jupyterlab/services';
import { Event, EventEmitter, NotebookDocument, notebooks } from 'vscode';
import { IApplicationShell, ICommandManager, IVSCodeNotebook } from '../../platform/common/application/types';
import { STANDARD_OUTPUT_CHANNEL } from '../../platform/common/constants';
import { traceVerbose, traceError, traceInfo, traceInfoIfCI } from '../../platform/logging';
import { IDisposableRegistry, IOutputChannel, IConfigurationService, IHttpClient } from '../../platform/common/types';
import { Common, DataScience } from '../../platform/common/utils/localize';
import { noop } from '../../platform/common/utils/misc';
import { stripAnsi } from '../../platform/common/utils/regexp';
import {
    ILoadIPyWidgetClassFailureAction,
    InteractiveWindowMessages,
    IPyWidgetMessages,
    LoadIPyWidgetClassLoadAction,
    NotifyIPyWidgetWidgetVersionNotSupportedAction
} from '../../messageTypes';
import { IServiceContainer } from '../../platform/ioc/types';
import { sendTelemetryEvent, Telemetry } from '../../telemetry';
import { getTelemetrySafeHashedString } from '../../platform/telemetry/helpers';
import { Commands } from '../../platform/common/constants';
import { IKernelProvider } from '../types';
import { IPyWidgetMessageDispatcherFactory } from './ipyWidgetMessageDispatcherFactory';
import { IPyWidgetScriptSource } from './ipyWidgetScriptSource';
import { IIPyWidgetMessageDispatcher, ILocalResourceUriConverter, IWidgetScriptSourceProviderFactory } from './types';
import { ConsoleForegroundColors } from '../../platform/logging/types';
import { createDeferred } from '../../platform/common/utils/async';
import { IWebviewCommunication } from '../../platform/webviews/types';
import { swallowExceptions } from '../../platform/common/utils/decorators';

/**
 * This class wraps all of the ipywidgets communication with a backing notebook
 */
//
export class CommonMessageCoordinator {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private cachedMessages: any[] = [];
    /**
     * Whether we have any handlers listerning to this event.
     */
    private listeningToPostMessageEvent?: boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public get postMessage(): Event<{ message: string; payload: any }> {
        this.listeningToPostMessageEvent = true;
        return this.postEmitter.event;
    }
    private ipyWidgetMessageDispatcher?: IIPyWidgetMessageDispatcher;
    private ipyWidgetScriptSource?: IPyWidgetScriptSource;
    private appShell: IApplicationShell;
    private commandManager: ICommandManager;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly postEmitter = new EventEmitter<{ message: string; payload: any }>();
    private disposables: IDisposableRegistry;
    private jupyterOutput: IOutputChannel;
    private readonly configService: IConfigurationService;
    private webview: IWebviewCommunication | undefined;
    private modulesForWhichWeHaveDisplayedWidgetErrorMessage = new Set<string>();
    private kernelProvider: IKernelProvider;
    private queuedMessages: { type: string; payload: unknown }[] = [];
    private readyMessageReceived?: boolean;
    public constructor(
        private readonly document: NotebookDocument,
        private readonly serviceContainer: IServiceContainer
    ) {
        this.disposables = this.serviceContainer.get<IDisposableRegistry>(IDisposableRegistry);
        this.jupyterOutput = this.serviceContainer.get<IOutputChannel>(IOutputChannel, STANDARD_OUTPUT_CHANNEL);
        this.appShell = this.serviceContainer.get<IApplicationShell>(IApplicationShell, IApplicationShell);
        this.commandManager = this.serviceContainer.get<ICommandManager>(ICommandManager);
        this.configService = this.serviceContainer.get<IConfigurationService>(IConfigurationService);
        this.kernelProvider = this.serviceContainer.get<IKernelProvider>(IKernelProvider);
    }

    public dispose() {
        this.cachedMessages = [];
        this.ipyWidgetMessageDispatcher?.dispose(); // NOSONAR
        this.ipyWidgetScriptSource?.dispose(); // NOSONAR
    }

    public async attach(webview: IWebviewCommunication) {
        if (this.webview !== webview) {
            // New webview, make sure to initialize.
            this.initialize();

            // Save the webview
            this.webview = webview;
            const promise = createDeferred<void>();

            // Attach message requests to this webview (should dupe to all of them)
            this.postMessage(
                (e) => {
                    traceInfoIfCI(`${ConsoleForegroundColors.Green}Widget Coordinator sent ${e.message}`);
                    // Special case for webview URI translation
                    if (e.message === InteractiveWindowMessages.ConvertUriForUseInWebViewRequest) {
                        this.onMessage(InteractiveWindowMessages.ConvertUriForUseInWebViewResponse, {
                            request: e.payload,
                            response: webview.asWebviewUri(e.payload)
                        });
                    } else {
                        if (!webview.isReady || !this.readyMessageReceived) {
                            // We've created the controller, however it hasn't been selected just yet.
                            // The IWebviewCommunication object keep track of the controller as well,
                            // hence that too needs to get updated with the active controller (i.e. detect the change from kernel spec to live kernel).
                            this.queuedMessages.push({ type: e.message, payload: e.payload });
                            return;
                        }
                        this.sendPendingWebViewMessages();
                        webview.postMessage({ type: e.message, payload: e.payload }).then(noop, noop);
                    }
                },
                this,
                this.disposables
            );
            webview.onDidReceiveMessage(
                (m) => {
                    traceInfoIfCI(`${ConsoleForegroundColors.Green}Widget Coordinator received ${m.type}`);
                    this.onMessage(m.type, m.payload);
                    const kernel = this.kernelProvider.get(this.document.uri);
                    // Special case the WidgetManager loaded message. It means we're ready
                    // to use a kernel. (IPyWidget Dispatcher uses this too)
                    if (m.type === IPyWidgetMessages.IPyWidgets_Ready) {
                        if (kernel?.kernelConnectionMetadata.kind === 'startUsingRemoteKernelSpec') {
                            return;
                        }
                        if (!webview.isReady) {
                            return;
                        }
                        this.readyMessageReceived = true;
                        this.sendPendingWebViewMessages();
                        // At this point, we know the kernels are ready, and the webview is ready to receive messages.
                        // Its possible the webview was initially unable to render some widgets, but now that everything is ready we
                        // should be able to render them now.
                        // E.g assume we're dealing with remote kernel specs,
                        // Then we start a kernel, next we create a controller that points to the live kernel & change the controller.
                        // What happens now is the, webview is re-loaded (as theres a change in the controllers).
                        // However if the user were to run a cell, then the output would get displayed and it could end up,
                        // being displayed in the old webview & when the webview is re-loaded, it would be displayed in the new webview.
                        // However its possble the kernel is not yet ready at that point in time.
                        // We could solve this issue easily by not executing cells, until the webview is ready,
                        // however that would have significant performance implications.
                        // Hence for ipywidgets, once the webview has completely been initialized, we can attempt to re-render the widgets.
                        const nbEditor = this.serviceContainer
                            .get<IVSCodeNotebook>(IVSCodeNotebook)
                            .notebookEditors.find((item) => item.notebook === this.document);
                        if (nbEditor) {
                            notebooks
                                .createRendererMessaging('jupyter-ipywidget-renderer')
                                .postMessage({ type: IPyWidgetMessages.IPyWidgets_ReRenderWidgets }, nbEditor)
                                .then(noop, noop);
                        }
                        promise.resolve();
                    }
                },
                this,
                this.disposables
            );
            // In case the webview loaded earlier and it already sent the IPyWidgetMessages.IPyWidgets_Ready message
            // This way we don't make assumptions, we just query widgets and ask its its ready (avoids timing issues etc).
            webview
                .postMessage({ type: IPyWidgetMessages.IPyWidgets_IsReadyRequest, payload: undefined })
                .then(noop, noop);

            // Wait for the widgets ready message
            await promise.promise;
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public onMessage(message: string, payload?: any): void {
        if (message === InteractiveWindowMessages.IPyWidgetLoadSuccess) {
            this.sendLoadSucceededTelemetry(payload);
        } else if (message === InteractiveWindowMessages.IPyWidgetLoadFailure) {
            this.handleWidgetLoadFailure(payload);
        } else if (message === InteractiveWindowMessages.IPyWidgetWidgetVersionNotSupported) {
            this.sendUnsupportedWidgetVersionFailureTelemetry(payload);
        } else if (message === InteractiveWindowMessages.IPyWidgetRenderFailure) {
            this.sendRenderFailureTelemetry(payload);
        } else if (message === InteractiveWindowMessages.IPyWidgetUnhandledKernelMessage) {
            this.handleUnhandledMessage(payload);
        }

        // Pass onto our two objects that are listening to messages

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.getIPyWidgetMessageDispatcher().receiveMessage({ message: message as any, payload }); // NOSONAR
        this.getIPyWidgetScriptSource().onMessage(message, payload);
    }

    private sendPendingWebViewMessages() {
        if (!this.webview) {
            return;
        }
        // Check if the controller has been selected by our code.
        while (this.queuedMessages.length) {
            this.webview.postMessage(this.queuedMessages.shift()!).then(noop, noop);
        }
    }
    private initialize() {
        traceVerbose('initialize CommonMessageCoordinator');
        // First hook up the widget script source that will listen to messages even before we start sending messages.
        this.getIPyWidgetScriptSource().initialize();
        this.getIPyWidgetMessageDispatcher().initialize();
    }

    private sendLoadSucceededTelemetry(payload: LoadIPyWidgetClassLoadAction) {
        try {
            sendTelemetryEvent(Telemetry.IPyWidgetLoadSuccess, 0, {
                moduleHash: getTelemetrySafeHashedString(payload.moduleName),
                moduleVersion: payload.moduleVersion
            });
        } catch {
            // do nothing on failure
        }
    }

    private handleWidgetLoadFailure(payload: ILoadIPyWidgetClassFailureAction) {
        try {
            let errorMessage: string = payload.error.toString();
            const cdnsEnabled = this.configService.getSettings(undefined).widgetScriptSources.length > 0;
            const key = `${payload.moduleName}:${payload.moduleVersion}`;
            if (!payload.isOnline) {
                errorMessage = DataScience.loadClassFailedWithNoInternet().format(
                    payload.moduleName,
                    payload.moduleVersion
                );
                this.appShell.showErrorMessage(errorMessage).then(noop, noop);
            } else if (!cdnsEnabled && !this.modulesForWhichWeHaveDisplayedWidgetErrorMessage.has(key)) {
                this.modulesForWhichWeHaveDisplayedWidgetErrorMessage.add(key);
                const moreInfo = Common.moreInfo();
                const enableDownloads = DataScience.enableCDNForWidgetsButton();
                errorMessage = DataScience.enableCDNForWidgetsSetting().format(
                    payload.moduleName,
                    payload.moduleVersion
                );
                this.appShell
                    .showErrorMessage(errorMessage, { modal: true }, ...[enableDownloads, moreInfo])
                    .then((selection) => {
                        switch (selection) {
                            case moreInfo:
                                this.appShell.openUrl('https://aka.ms/PVSCIPyWidgets');
                                break;
                            case enableDownloads:
                                this.enableCDNForWidgets().ignoreErrors();
                                break;
                            default:
                                break;
                        }
                    }, noop);
            }
            traceError(`Widget load failure ${errorMessage}`, payload);

            sendTelemetryEvent(Telemetry.IPyWidgetLoadFailure, 0, {
                isOnline: payload.isOnline,
                moduleHash: getTelemetrySafeHashedString(payload.moduleName),
                moduleVersion: payload.moduleVersion,
                timedout: payload.timedout
            });
        } catch {
            // do nothing on failure
        }
    }
    @swallowExceptions()
    private async enableCDNForWidgets() {
        await this.commandManager.executeCommand(Commands.EnableLoadingWidgetsFrom3rdPartySource);
        if (this.webview) {
            await this.webview.postMessage({ type: IPyWidgetMessages.IPyWidgets_AttemptToDownloadFailedWidgetsAgain });
        }
    }
    private sendUnsupportedWidgetVersionFailureTelemetry(payload: NotifyIPyWidgetWidgetVersionNotSupportedAction) {
        try {
            sendTelemetryEvent(Telemetry.IPyWidgetWidgetVersionNotSupportedLoadFailure, 0, {
                moduleHash: getTelemetrySafeHashedString(payload.moduleName),
                moduleVersion: payload.moduleVersion
            });
        } catch {
            // do nothing on failure
        }
    }
    private sendRenderFailureTelemetry(payload: Error) {
        try {
            traceError('Error rendering a widget: ', payload);
            sendTelemetryEvent(Telemetry.IPyWidgetRenderFailure);
        } catch {
            // Do nothing on a failure
        }
    }

    private handleUnhandledMessage(msg: KernelMessage.IMessage) {
        // Skip status messages
        if (msg.header.msg_type !== 'status') {
            try {
                // Special case errors, strip ansi codes from tracebacks so they print better.
                if (msg.header.msg_type === 'error') {
                    const errorMsg = msg as KernelMessage.IErrorMsg;
                    errorMsg.content.traceback = errorMsg.content.traceback.map(stripAnsi);
                }
                traceInfo(`Unhandled widget kernel message: ${msg.header.msg_type} ${msg.content}`);
                this.jupyterOutput.appendLine(
                    DataScience.unhandledMessage().format(msg.header.msg_type, JSON.stringify(msg.content))
                );
                sendTelemetryEvent(Telemetry.IPyWidgetUnhandledMessage, undefined, { msg_type: msg.header.msg_type });
            } catch {
                // Don't care if this doesn't get logged
            }
        }
    }
    private getIPyWidgetMessageDispatcher() {
        if (!this.ipyWidgetMessageDispatcher) {
            this.ipyWidgetMessageDispatcher = this.serviceContainer
                .get<IPyWidgetMessageDispatcherFactory>(IPyWidgetMessageDispatcherFactory)
                .create(this.document);
            this.disposables.push(this.ipyWidgetMessageDispatcher.postMessage(this.cacheOrSend, this));
        }
        return this.ipyWidgetMessageDispatcher;
    }

    private getIPyWidgetScriptSource() {
        if (!this.ipyWidgetScriptSource) {
            this.ipyWidgetScriptSource = new IPyWidgetScriptSource(
                this.document,
                this.serviceContainer.get<IKernelProvider>(IKernelProvider),
                this.serviceContainer.get<IDisposableRegistry>(IDisposableRegistry),
                this.serviceContainer.get<IConfigurationService>(IConfigurationService),
                this.serviceContainer.get<IHttpClient>(IHttpClient),
                this.serviceContainer.get<IWidgetScriptSourceProviderFactory>(IWidgetScriptSourceProviderFactory),
                this.serviceContainer.get<ILocalResourceUriConverter>(ILocalResourceUriConverter)
            );
            this.disposables.push(this.ipyWidgetScriptSource.postMessage(this.cacheOrSend, this));
        }
        return this.ipyWidgetScriptSource;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private cacheOrSend(data: any) {
        // If no one is listening to the messages, then cache these.
        // It means its too early to dispatch the messages, we need to wait for the event handlers to get bound.
        if (!this.listeningToPostMessageEvent) {
            traceInfoIfCI(`${ConsoleForegroundColors.Green}Queuing messages (no listenerts)`);
            this.cachedMessages.push(data);
            return;
        }
        this.cachedMessages.forEach((item) => this.postEmitter.fire(item));
        this.cachedMessages = [];
        this.postEmitter.fire(data);
    }
}
