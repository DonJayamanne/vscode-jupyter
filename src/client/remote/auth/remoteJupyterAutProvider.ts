// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ServerConnection } from '@jupyterlab/services';
import { Agent as HttpsAgent } from 'https';
import { inject, injectable } from 'inversify';
import * as nodeFetch from 'node-fetch';
import { EventEmitter, Uri, window } from 'vscode';
import { traceInfo } from '../../common/logger';
import { DataScience } from '../../common/utils/localize';
import { noop } from '../../common/utils/misc';
import { createAuthorizingRequest } from '../../datascience/jupyter/jupyterRequest';
import { createJupyterWebSocket } from '../../datascience/jupyter/jupyterWebSocket';
import { IJupyterConnection, IJupyterPasswordConnect } from '../../datascience/types';
import { RemoteServer } from './server';

export type ServerConnectionISettingsId = string;
export function getServerConnectionId(settings: ServerConnection.ISettings): ServerConnectionISettingsId {
    return JSON.stringify({
        ...settings,
        Headers: undefined,
        Request: undefined,
        WebSocket: undefined,
        fetch: undefined
    });
}

export type SerializableConnectionSettingsId = {
    baseUrl: string;
    id: ServerConnectionISettingsId;
};
export type SerializedConnectionSettingsId = string;

export function getSerializableServerConnectionId(
    settings: ServerConnection.ISettings
): SerializableConnectionSettingsId {
    return {
        baseUrl: settings.baseUrl,
        id: getServerConnectionId(settings)
    };
}
@injectable()
export class RemoteJupyterAuthProvider {
    private get jupyterlab(): typeof import('@jupyterlab/services') {
        if (!this._jupyterlab) {
            // tslint:disable-next-line: no-require-imports
            this._jupyterlab = require('@jupyterlab/services');
        }
        return this._jupyterlab!;
    }

    public get remoteUrls(): string[] {
        return [];
    }
    public get onDidLogIntoRemoteServer() {
        return this._onDidAddServer.event;
    }
    private static serverMappedBySettings = new Map<ServerConnectionISettingsId, RemoteServer>();
    private static _servers: RemoteServer[] = [];
    public static get servers(): Readonly<RemoteServer[]> {
        return [...RemoteJupyterAuthProvider._servers];
    }
    private static serverMappedBySerializableConnectionSettingsId = new Map<
        SerializedConnectionSettingsId,
        RemoteServer
    >();
    private static Servers = new Set<string>();
    private readonly _onDidAddServer = new EventEmitter<RemoteServer>();
    private _jupyterlab?: typeof import('@jupyterlab/services');
    constructor(@inject(IJupyterPasswordConnect) private readonly remoteLoginService: IJupyterPasswordConnect) {}
    public static getServerByFileScheme(scheme: string): RemoteServer | undefined {
        for (const [_, server] of RemoteJupyterAuthProvider.serverMappedBySettings) {
            if (server.fileScheme === scheme) {
                return server;
            }
        }
    }
    public static getServer(settings: ServerConnection.ISettings): RemoteServer | undefined {
        return RemoteJupyterAuthProvider.serverMappedBySettings.get(getServerConnectionId(settings));
    }
    public static getServerBySerializableConnectionSettingsId(
        id: SerializableConnectionSettingsId
    ): RemoteServer | undefined {
        return RemoteJupyterAuthProvider.serverMappedBySerializableConnectionSettingsId.get(JSON.stringify(id));
    }
    // public static getServerByBaseUri(baseUrl: string): Promise<RemoteServer> {
    //     return RemoteJupyterAuthProvider.serverMappedBySettings.get(getServerConnectionId(settings));
    // }

    public async promptToLogin(baseUrl?: string): Promise<RemoteServer | undefined> {
        baseUrl =
            baseUrl ||
            (await window.showInputBox({
                prompt: 'Enter Url of Jupyter Server',
                ignoreFocusOut: true,
                validateInput: (value?: string) => (value?.trim().length === 0 ? 'Enter a value' : '')
            }));
        if (!baseUrl) {
            return;
        }
        const existingServer = RemoteJupyterAuthProvider._servers.find(
            (item) => item.info.baseUrl.trim().toLowerCase() === baseUrl!.trim().toLowerCase()
        );
        if (existingServer) {
            return existingServer;
        }
        // const serverSettings: Partial<ServerConnection.ISettings> = {
        //     baseUrl: baseUrl,
        //     appUrl: '',
        //     // A web socket is required to allow token authentication
        //     wsUrl: baseUrl.replace('http', 'ws')
        // };

        // // Before we connect, see if we are trying to make an insecure connection, if we are, warn the user
        // await this.secureConnectionCheck(connInfo);
        let token = '';
        if (baseUrl.indexOf('token') > 0) {
            token = baseUrl.substring(baseUrl.indexOf('=') + 1);
            baseUrl = baseUrl.substring(0, baseUrl.indexOf('?token'));
        }
        // const info = await this.remoteLoginService.getPasswordConnectionInfo(baseUrl);
        let connection: ServerConnection.ISettings;
        if (token) {
            connection = ServerConnection.makeSettings({
                baseUrl,
                token
            });
        } else {
            connection = await this.getServerConnectSettings({
                baseUrl,
                displayName: '',
                localLaunch: false,
                token,
                valid: true,
                disconnected: new EventEmitter<number>().event,
                hostName: '',
                localProcExitCode: 0,
                rootDirectory: '',
                type: 'jupyter',
                dispose: noop
            });
        }
        // tslint:disable-next-line: no-console
        console.log(connection);

        const uri = Uri.parse(connection.baseUrl);
        let label = Uri.parse(connection.baseUrl).authority;
        if (RemoteJupyterAuthProvider.Servers.has(label)) {
            label = `${label}/${uri.path}`;
        }
        if (RemoteJupyterAuthProvider.Servers.has(label)) {
            label = `${label}/${uri.path}`;
        }
        if (RemoteJupyterAuthProvider.Servers.has(label)) {
            label = uri.toString();
        }
        const fileScheme = Uri.parse(connection.baseUrl).authority.replace(/([^a-z0-9]+)/gi, '');
        const server = new RemoteServer(label, fileScheme, connection);
        RemoteJupyterAuthProvider._servers.push(server);
        RemoteJupyterAuthProvider.serverMappedBySettings.set(getServerConnectionId(connection), server);
        RemoteJupyterAuthProvider.serverMappedBySerializableConnectionSettingsId.set(
            JSON.stringify(getSerializableServerConnectionId(connection)),
            server
        );
        server.onDidDispose(() => {
            RemoteJupyterAuthProvider._servers = RemoteJupyterAuthProvider._servers.filter((item) => item !== server);
            RemoteJupyterAuthProvider.serverMappedBySettings.delete(getServerConnectionId(connection));
            RemoteJupyterAuthProvider.serverMappedBySerializableConnectionSettingsId.delete(
                JSON.stringify(getSerializableServerConnectionId(connection))
            );
        });
        this._onDidAddServer.fire(server);
        return server;
        // // const sessions = connection.fetch({})
        // try {
        //     const prefix = `${connection.baseUrl}${connection.baseUrl.endsWith('/') ? '' : '/'}`;
        //     const result = await connection.fetch(`${prefix}api/sessions`, { ...connection.init, method: 'get' });
        //     console.info(result);
        //     const json = await result.json();
        //     console.info(json);
        // } catch (ex) {
        //     // tslint:disable-next-line: no-console
        //     console.error(ex);
        // }
    }
    public async getServerConnectSettings(connInfo: IJupyterConnection): Promise<ServerConnection.ISettings> {
        let serverSettings: Partial<ServerConnection.ISettings> = {
            baseUrl: connInfo.baseUrl,
            appUrl: '',
            // A web socket is required to allow token authentication
            wsUrl: connInfo.baseUrl.replace('http', 'ws')
        };

        // // Before we connect, see if we are trying to make an insecure connection, if we are, warn the user
        // await this.secureConnectionCheck(connInfo);

        // Agent is allowed to be set on this object, but ts doesn't like it on RequestInit, so any
        // tslint:disable-next-line:no-any
        let requestInit: any = { cache: 'no-store', credentials: 'same-origin' };
        let cookieString;
        // tslint:disable-next-line: no-any
        let requestCtor: any = nodeFetch.Request;

        // If authorization header is provided, then we need to prevent jupyterlab services from
        // writing the authorization header.
        if (connInfo.getAuthHeader) {
            requestCtor = createAuthorizingRequest(connInfo.getAuthHeader);
        }

        // If no token is specified prompt for a password
        if ((connInfo.token === '' || connInfo.token === 'null') && !connInfo.getAuthHeader) {
            // if (this.failOnPassword) {
            //     throw new Error('Password request not allowed.');
            // }
            serverSettings = { ...serverSettings, token: '' };
            const pwSettings = await this.remoteLoginService.getPasswordConnectionInfo(connInfo.baseUrl);
            if (pwSettings && pwSettings.requestHeaders) {
                requestInit = { ...requestInit, headers: pwSettings.requestHeaders };
                // tslint:disable-next-line: no-any
                cookieString = (pwSettings.requestHeaders as any).Cookie || '';

                // Password may have overwritten the base url and token as well
                if (pwSettings.remappedBaseUrl) {
                    // tslint:disable-next-line: no-any
                    (serverSettings as any).baseUrl = pwSettings.remappedBaseUrl;
                    // tslint:disable-next-line: no-any
                    (serverSettings as any).wsUrl = pwSettings.remappedBaseUrl.replace('http', 'ws');
                }
                if (pwSettings.remappedToken) {
                    // tslint:disable-next-line: no-any
                    (serverSettings as any).token = pwSettings.remappedToken;
                }
            } else if (pwSettings) {
                serverSettings = { ...serverSettings, token: connInfo.token };
            } else {
                // Failed to get password info, notify the user
                throw new Error(DataScience.passwordFailure());
            }
        } else {
            serverSettings = { ...serverSettings, token: connInfo.token };
        }

        if (!connInfo.getAuthHeader && cookieString) {
            requestCtor = createAuthorizingRequest(undefined, cookieString);
        }

        const allowUnauthorized = true;
        // If this is an https connection and we want to allow unauthorized connections set that option on our agent
        // we don't need to save the agent as the previous behaviour is just to create a temporary default agent when not specified
        if (connInfo.baseUrl.startsWith('https') && allowUnauthorized) {
            const requestAgent = new HttpsAgent({ rejectUnauthorized: false });
            requestInit = { ...requestInit, agent: requestAgent };
        }

        // This replaces the WebSocket constructor in jupyter lab services with our own implementation
        // See _createSocket here:
        // https://github.com/jupyterlab/jupyterlab/blob/cfc8ebda95e882b4ed2eefd54863bb8cdb0ab763/packages/services/src/kernel/default.ts
        serverSettings = {
            ...serverSettings,
            init: requestInit,
            WebSocket: createJupyterWebSocket(
                cookieString,
                allowUnauthorized,
                connInfo.getAuthHeader
                // tslint:disable-next-line:no-any
            ) as any,
            // Redefine fetch to our node-modules so it picks up the correct version.
            // Typecasting as any works fine as long as all 3 of these are the same version
            // tslint:disable-next-line:no-any
            fetch: nodeFetch.default as any,
            // tslint:disable-next-line:no-any
            Request: requestCtor,
            // tslint:disable-next-line:no-any
            Headers: new nodeFetch.Headers(cookieString ? { Cookie: cookieString } : {}) as any
        };

        traceInfo(`Creating server with settings : ${JSON.stringify(serverSettings)}`);
        return this.jupyterlab.ServerConnection.makeSettings(serverSettings);
    }

    // // Check if our server connection is considered secure. If it is not, ask the user if they want to connect
    // // If not, throw to bail out on the process
    // private async secureConnectionCheck(connInfo: IJupyterConnection): Promise<void> {
    //     // If they have turned on global server trust then everything is secure
    //     if (this.userAllowsInsecureConnections.value) {
    //         return;
    //     }

    //     // If they are local launch, https, or have a token, then they are secure
    //     if (connInfo.localLaunch || connInfo.baseUrl.startsWith('https') || connInfo.token !== 'null') {
    //         return;
    //     }

    //     // At this point prompt the user, cache the promise so we don't ask multiple times for the same server
    //     let serverSecurePromise = JupyterSessionManager.secureServers.get(connInfo.baseUrl);

    //     if (serverSecurePromise === undefined) {
    //         serverSecurePromise = this.insecureServerWarningPrompt();
    //         JupyterSessionManager.secureServers.set(connInfo.baseUrl, serverSecurePromise);
    //     }

    //     // If our server is not secure, throw here to bail out on the process
    //     if (!(await serverSecurePromise)) {
    //         throw new Error(localize.DataScience.insecureSessionDenied());
    //     }
    // }
}
