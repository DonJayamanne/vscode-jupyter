// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// import { IExtensionSingleActivationService } from '../activation/types';
import { IServiceManager } from '../ioc/types';
// import { ServerStartup } from './startup';
// import { WebServerLogger } from './webserver/logger';
// import { JupyterWebserverManager } from './webserver/manager';
// import { JupyterWebServerStarter } from './webserver/starter';

// export function registerBackgroundServices(serviceManager: IServiceManager) {
export function registerBackgroundServices(_: IServiceManager) {
    // serviceManager.add<IExtensionSingleActivationService>(IExtensionSingleActivationService, ServerStartup);
    // serviceManager.addSingleton<JupyterWebserverManager>(JupyterWebserverManager, JupyterWebserverManager);
    // serviceManager.add<JupyterWebServerStarter>(JupyterWebServerStarter, JupyterWebServerStarter);
    // serviceManager.addSingleton<WebServerLogger>(WebServerLogger, WebServerLogger);
}
