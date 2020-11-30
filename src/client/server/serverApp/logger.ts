// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { format } from 'util';
import { MessagePrefixes } from './constants';

export type ILogger = {
    logMessage(message: string): void;
    logError(message: string): void;
};
const loggers = new Set<ILogger>();
export function addLogger(logger: ILogger) {
    loggers.add(logger);
}

// tslint:disable-next-line: no-any
function logToDestination(destination: 'log' | 'error', message: string, ...args: any[]) {
    if (destination === 'error') {
        // tslint:disable-next-line: no-console
        console.error(message, ...args);
    } else {
        // tslint:disable-next-line: no-console
        console.log(message, ...args);
    }

    message = `${message}, ${args.map(format).join(', ')}`;
    if (process.send) {
        const prefix = destination === 'error' ? MessagePrefixes.Error : MessagePrefixes.Log;
        process.send(`${prefix}${message}`);
    }
    loggers.forEach((logger) => {
        try {
            if (destination === 'error') {
                logger.logError(message);
            } else {
                logger.logMessage(message);
            }
        } catch (ex) {
            // Noop.
        }
    });
}
// tslint:disable-next-line: no-any
export function logMessage(message: string, ...args: any[]) {
    logToDestination('log', message, ...args);
}

// tslint:disable-next-line: no-any
export function logError(message: string, ...args: any[]) {
    logToDestination('error', message, ...args);
}
