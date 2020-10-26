// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import {
    CancellationToken,
    commands,
    Uri,
    Webview,
    WebviewView,
    WebviewViewProvider,
    WebviewViewResolveContext,
    window
} from 'vscode';
import { IExtensionSingleActivationService } from '../../activation/types';
import { IExtensionContext } from '../../common/types';

@injectable()
export class NotebookMetadataEditor implements WebviewViewProvider, IExtensionSingleActivationService {
    public static readonly viewType = 'notebook.metadataEditor';

    private _view?: WebviewView;
    private readonly _extensionUri: Uri;
    constructor(@inject(IExtensionContext) private readonly context: IExtensionContext) {
        this._extensionUri = context.extensionUri;
    }
    public async activate() {
        this.context.subscriptions.push(window.registerWebviewViewProvider(NotebookMetadataEditor.viewType, this));

        this.context.subscriptions.push(
            commands.registerCommand('calicoColors.addColor', () => {
                this.addColor();
            })
        );

        this.context.subscriptions.push(
            commands.registerCommand('calicoColors.clearColors', () => {
                this.clearColors();
            })
        );
    }

    public resolveWebviewView(
        webviewView: WebviewView,
        _context: WebviewViewResolveContext,
        _token: CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage((data) => {
            // tslint:disable-next-line: switch-default
            switch (data.type) {
                case 'colorSelected': {
                    window.showInformationMessage(data.value);
                    break;
                }
            }
        });
    }

    public addColor() {
        if (this._view) {
            this._view.show?.(true); // `show` is not implemented in 1.49 but is for 1.50 insiders
            this._view.webview.postMessage({ type: 'addColor' });
        }
    }

    public clearColors() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'clearColors' });
        }
    }

    private _getHtmlForWebview(webview: Webview) {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(
            Uri.joinPath(this._extensionUri, 'src/client/activityBar/metadata', 'main.js')
        );

        // // Do the same for the stylesheet.
        const styleUri = webview.asWebviewUri(
            Uri.joinPath(this._extensionUri, 'src/client/activityBar/metadata', 'main.css')
        );

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleUri}" rel="stylesheet">
				<title>Cat Colors</title>
			</head>
			<body>
                <div class="editor" contenteditable="true" >
{
    "language_info": {
        "codemirror_mode": {
            "name": "ipython",
            "version": 3
        },
        "file_extension": ".py",
        "mimetype": "text/x-python",
        "name": "python",
        "nbconvert_exporter": "python",
        "pygments_lexer": "ipython3",
        "version": "3.8.2-final"
    },
    "orig_nbformat": 2
}
				</div>
				<button class="add-color-button">Update</button>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        // tslint:disable-next-line: insecure-random
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
