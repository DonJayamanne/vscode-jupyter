// // Copyright (c) Microsoft Corporation. All rights reserved.
// // Licensed under the MIT License.

// import { ServerConnection } from '@jupyterlab/services';
// import * as express from 'express';
// export class JupyterServerRouteHandler {
//     private readonly baseUrl: string;
//     constructor(
//         private readonly app: express.Express,
//         private readonly path: string,
//         private readonly serverSettings: ServerConnection.ISettings
//     ) {
//         this.baseUrl = this.serverSettings.baseUrl.endsWith('/')
//             ? serverSettings.baseUrl
//             : `${serverSettings.baseUrl}/`;
//     }

//     private registerRoutes() {
//         this.app.use((req, resp, next) => {
//             if (!req.path.startsWith(this.path)) {
//                 return next();
//             }

//             const path = req.path.substring(`/${this.path}`.length);
//             const url = `${this.baseUrl}${path.startsWith('/') ? path.substring(1) : path}`;
//             // new this.serverSettings.Request()
//             // const realRequest = ServerConnection.makeRequest(
//             //     url,
//             //     {
//             //         body: req.body,
//             //         method: req.method
//             //     },
//             //     this.serverSettings
//             // );
//             const proxyRequest = new this.serverSettings.Request(url);
//             req.pipe(new this.serverSettings.Request(url))
//             realRequest.then(realResponse => {
//                 realResponse.body?.pipeTo(resp.)
//             })
//         });
//     }
// }
