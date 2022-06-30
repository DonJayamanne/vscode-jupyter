// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import './styles.css';
import { ActivationFunction, OutputItem, RendererContext } from 'vscode-notebook-renderer';
import { IPyWidgetMessages } from '../../../../messageTypes';

const disposedOutputItems = new Set<string>();
const itemsNotRendered: { outputItem: OutputItem; element: HTMLElement }[] = [];
export const activate: ActivationFunction = (context) => {
    const logger = (message: string) => {
        console.error(message);
        if (context.postMessage) {
            context.postMessage({
                command: 'log',
                message
            });
        }
    };
    logger('Jupyter IPyWidget Renderer Activated');
    hookupTestScripts(context);
    if (context.onDidReceiveMessage) {
        context.onDidReceiveMessage((message) => {
            if (message && 'type' in message && message.type === IPyWidgetMessages.IPyWidgets_ReRenderWidgets) {
                logger('Received message to re-render widgets');
                while (itemsNotRendered.length) {
                    const { outputItem, element } = itemsNotRendered.shift()!;
                    renderWidgetOutput(outputItem, element, logger);
                }
            }
        });
    }
    return {
        renderOutputItem(outputItem: OutputItem, element: HTMLElement) {
            logger(`Got item for Rendering ${outputItem.id}`);
            try {
                renderWidgetOutput(outputItem, element, logger);
            } finally {
                sendRenderOutputItem(context, outputItem, element);
            }
        },
        disposeOutputItem(id?: string) {
            if (id) {
                disposedOutputItems.add(id);
            }
            const disposeOutputFunc =
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).ipywidgetsKernel?.disposeOutput || (global as any).ipywidgetsKernel?.disposeOutput;
            if (disposeOutputFunc) {
                return disposeOutputFunc(id);
            }
        }
    };
};
function renderWidgetOutput(outputItem: OutputItem, element: HTMLElement, logger: (message: string) => void) {
    if (disposedOutputItems.has(outputItem.id)) {
        return;
    }
    logger(`Check Rendering ${outputItem.id}`);
    const renderOutputFunc =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).ipywidgetsKernel?.renderOutput || (global as any).ipywidgetsKernel?.renderOutput;
    if (renderOutputFunc) {
        element.className = (element.className || '') + ' cell-output-ipywidget-background';
        return renderOutputFunc(outputItem, element, logger);
    } else {
        // There are two possibilities,
        // 1. We've opened an existing notebook with widget output.
        // 2. We ran a cell pointing to a Remote KernelSpec, and the controller then changed
        //   to point to a live kernel session, at which point the widget unloads & loads again.
        //   But thats all async, and when it re-loads the widget manager may not yet have been initialized.
        // Unfortunately, VS Code loads the webview & re-renders the outputs before we can start the widget manager.
        // Hence we don't know which case we're in.
        // Thus keep track of the output, and once the widget manager has
        // been initialized we might get a message back asking for the outputs to be rendered.
        itemsNotRendered.push({ outputItem, element });
        console.error('Rendering widgets on notebook open is not supported.');
        logger('Rendering widgets on notebook open is not supported.');
    }
}
function hookupTestScripts(context: RendererContext<unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyWindow = window as any;
    if (!anyWindow.widgetEntryPoint || typeof anyWindow.widgetEntryPoint.initialize !== 'function') {
        if (context.postMessage) {
            context.postMessage({
                command: 'log',
                message: 'Hook not registered'
            });
        }
        return;
    }
    if (context.postMessage) {
        context.postMessage({
            command: 'log',
            message: 'Hook registered'
        });
    }
    anyWindow.widgetEntryPoint.initialize(context);
}
function sendRenderOutputItem(context: RendererContext<unknown>, outputItem: OutputItem, element: HTMLElement) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyWindow = window as any;
    if (!anyWindow.widgetEntryPoint || typeof anyWindow.widgetEntryPoint.renderOutputItem !== 'function') {
        return;
    }
    if (context.postMessage) {
        context.postMessage({
            command: 'log',
            message: 'rendering output'
        });
    }
    anyWindow.widgetEntryPoint.renderOutputItem(outputItem, element);
}
