// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { BackgroundWebServer } from './app';
import { MessagePrefixes } from './constants';
import { logError, logMessage } from './logger';

logMessage('Started background process');
logMessage(JSON.stringify(process.env));

async function main() {
    const server = new BackgroundWebServer();
    const port = await server.start();
    logMessage(`Background process port ${port}`);
    if (process.send) {
        process.send(`${MessagePrefixes.Port}${port}`);
    }
}

main().catch((ex) => logError('failed to start server', ex));
