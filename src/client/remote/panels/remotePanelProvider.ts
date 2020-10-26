// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { commands, Event, EventEmitter, notebook, TreeDataProvider, TreeItem, window } from 'vscode';
import { NotebookDocumentMetadataChangeEvent } from '../../../../types/vscode-proposed';
import { IExtensionSingleActivationService } from '../../activation/types';
import { IDisposableRegistry } from '../../common/types';
import { noop } from '../../common/utils/misc';
import { getNotebookMetadata } from '../../datascience/notebook/helpers/helpers';
import { RemoteFileSystemFactory } from '../auth/fileSystem';
import { RemoteJupyterAuthProvider } from '../auth/remoteJupyterAutProvider';
import { RemoteServer } from '../auth/server';
import { RemoteServerNode, ServerNode } from './nodes';

@injectable()
export class RemoteTreeViewProvider implements TreeDataProvider<RemoteServerNode>, IExtensionSingleActivationService {
    public get onDidChangeTreeData(): Event<RemoteServerNode | undefined> {
        return this._onDidChangeTreeData.event;
    }

    private _onDidChangeTreeData: EventEmitter<RemoteServerNode | undefined> = new EventEmitter<
        RemoteServerNode | undefined
    >();

    private readonly serverNodes = new Set<ServerNode>();
    private readonly servers = new Set<RemoteServer>();
    // private tree!: json.Node;
    // private text!: string;

    constructor(
        @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry,
        @inject(RemoteJupyterAuthProvider) private readonly authProvider: RemoteJupyterAuthProvider,
        @inject(RemoteFileSystemFactory) private readonly fsFactory: RemoteFileSystemFactory
    ) {
        notebook.onDidChangeActiveNotebookEditor(() => this.onDidChangeActiveNotebookEditor());
        notebook.onDidChangeNotebookDocumentMetadata(this.onDidChangeNotebookMetadata, this);
        this.parseTree();
        commands.executeCommand('setContext', 'notebookMetadataOutline.visible', true);
        this.onDidChangeActiveNotebookEditor().catch(noop);
        this.registerCommands();
    }
    public async activate() {
        window.registerTreeDataProvider('jupyter.remoteServer', this);
        this.authProvider.onDidLogIntoRemoteServer(this.onDidLogIntoRemoteServer, this, this.disposables);
    }

    public refresh(item?: RemoteServerNode): void {
        this.parseTree();
        if (item) {
            this._onDidChangeTreeData.fire(item);
        } else {
            this._onDidChangeTreeData.fire(undefined);
        }
    }

    public rename(offset: number): void {
        window.showInputBox({ placeHolder: 'Enter the new label' }).then((value) => {
            if (value !== null && value !== undefined) {
                // tslint:disable: no-console
                console.log(value, offset);
                // this.editor.edit((editBuilder) => {
                //     const path = json.getLocation(this.text, offset).path;
                //     let propertyNode = json.findNodeAtLocation(this.tree, path);
                //     if (propertyNode && propertyNode.parent && propertyNode?.parent?.type !== 'array') {
                //         propertyNode = (Array.isArray(propertyNode?.parent?.children) && propertyNode.parent.children.length > 0) ? propertyNode?.parent.children[0] : undefined;
                //     }

                //     // editBuilder.replace(range, `"${value}"`);
                //     setTimeout(() => {
                //         this.parseTree();
                //         this.refresh(offset);
                //     }, 100);
                // });
            }
        });
    }

    public async getChildren(item?: RemoteServerNode): Promise<RemoteServerNode[]> {
        if (item) {
            return 'getChildren' in item ? item.getChildren() : [];
        } else {
            return [...this.serverNodes];
        }
        // if (offset) {
        //     const path = json.getLocation(this.text, offset).path;
        //     const node = json.findNodeAtLocation(this.tree, path);
        //     return node ? this.getChildrenOffsets(node) : [];
        // } else {
        //     return this.tree ? this.getChildrenOffsets(this.tree) : [];
        // }
        return [];
    }

    public getTreeItem(item: RemoteServerNode): TreeItem {
        return item;
        // const path = json.getLocation(this.text, offset).path;
        // const valueNode = json.findNodeAtLocation(this.tree, path);
        // if (valueNode) {
        //     const hasChildren = valueNode.type === 'object' || valueNode.type === 'array';
        //     const treeItem: TreeItem = new TreeItem(
        //         this.getLabel(valueNode),
        //         hasChildren
        //             ? valueNode.type === 'object'
        //                 ? TreeItemCollapsibleState.Collapsed
        //                 : TreeItemCollapsibleState.Collapsed
        //             : TreeItemCollapsibleState.None
        //     );
        //     // treeItem.command = {
        //     //     command: 'notebook.editMetadata',
        //     //     title: '',
        //     //     arguments: []
        //     // };
        //     treeItem.iconPath = this.getIcon(valueNode);
        //     treeItem.contextValue = valueNode.type;
        //     return treeItem;
        // }
        // tslint:disable-next-line: no-any
        return undefined as any;
        // return;
    }
    private registerCommands() {
        commands.registerCommand(
            'jupyter.addRemoteServer',
            this.authProvider.promptToLogin.bind(this.authProvider),
            this.disposables
        );
    }
    private onDidLogIntoRemoteServer(server: RemoteServer) {
        if (this.servers.has(server)) {
            return;
        }
        const node = new ServerNode(server);
        this.fsFactory.getOrCreateRemoteFileSystem(server.fileScheme, server.info);
        this.serverNodes.add(node);
        this.servers.add(server);
        this.refresh();
    }
    // public select(range: Range) {
    //     this.editor.selection = new Selection(range.start, range.end);
    // }

    private async onDidChangeActiveNotebookEditor() {
        if (notebook.activeNotebookEditor && getNotebookMetadata(notebook.activeNotebookEditor.document)) {
            // const metadata = cloneDeep(getNotebookMetadata(notebook.activeNotebookEditor.document));
            commands.executeCommand('setContext', 'notebookMetadataOutlineEnabled', true);
            await commands.executeCommand('setContext', 'notebookMetadataOutline.visible', true);
            this.refresh();
        } else {
            // commands.executeCommand('setContext', 'notebookMetadataOutline.visible', false);
            // commands.executeCommand('setContext', 'notebookMetadataOutlineEnabled', false);
        }
    }

    private onDidChangeNotebookMetadata(changeEvent: NotebookDocumentMetadataChangeEvent): void {
        if (changeEvent.document === notebook.activeNotebookEditor?.document) {
            this._onDidChangeTreeData.fire(undefined);
        }
    }

    private parseTree(): void {
        // if (notebook.activeNotebookEditor && getNotebookMetadata(notebook.activeNotebookEditor.document)) {
        //     const metadata = cloneDeep(getNotebookMetadata(notebook.activeNotebookEditor.document));
        //     // this.text = JSON.stringify(metadata);
        //     // this.tree = json.parseTree(this.text);
        // }
    }

    // private getChildrenOffsets(node: json.Node): number[] {
    //     const offsets: number[] = [];
    //     for (const child of node.children || []) {
    //         const childPath = json.getLocation(this.text, child.offset).path;
    //         const childNode = json.findNodeAtLocation(this.tree, childPath);
    //         if (childNode) {
    //             offsets.push(childNode.offset);
    //         }
    //     }
    //     return offsets;
    // }

    // tslint:disable-next-line: no-any
    // private getIcon(node: jRemoteServerNode): any {
    //     console.log(node);
    //     // const nodeType = node.type;
    //     // if (nodeType === 'boolean') {
    //     //     return {
    //     //         light: this.context.asAbsolutePath(path.join('resources', 'light', 'boolean.svg')),
    //     //         dark: this.context.asAbsolutePath(path.join('resources', 'dark', 'boolean.svg'))
    //     //     };
    //     // }
    //     // if (nodeType === 'string') {
    //     //     return {
    //     //         light: this.context.asAbsolutePath(path.join('resources', 'light', 'string.svg')),
    //     //         dark: this.context.asAbsolutePath(path.join('resources', 'dark', 'string.svg'))
    //     //     };
    //     // }
    //     // if (nodeType === 'number') {
    //     //     return {
    //     //         light: this.context.asAbsolutePath(path.join('resources', 'light', 'number.svg')),
    //     //         dark: this.context.asAbsolutePath(path.join('resources', 'dark', 'number.svg'))
    //     //     };
    //     // }
    //     return null;
    // }

    // private getLabel(node: RemoteServerNode): string {
    //     // tslint:disable-next-line: prefer-template restrict-plus-operands
    //     // return 'Hello' + node.value;
    //     if (node.parent?.type === 'array') {
    //         // const prefix = node.parent.children!.indexOf(node).toString();
    //         // if (node.type === 'object') {
    //         //     return prefix + ':{ }';
    //         // }
    //         // if (node.type === 'array') {
    //         //     return prefix + ':[ ]';
    //         // }
    //         // return prefix + ':' + node.value.toString();
    //         return node.value.toString();
    //     } else {
    //         const value = node.value ? `: ${node.value}` : '';
    //         return `${node.parent!.children![0].value || ''}${value}`;
    //         // const property = node.parent.children[0].value.toString();
    //         // if (node.type === 'array' || node.type === 'object') {
    //         //     if (node.type === 'object') {
    //         //         return '{ } ' + property;
    //         //     }
    //         //     if (node.type === 'array') {
    //         //         return '[ ] ' + property;
    //         //     }
    //         // }
    //         // const value = this.editor.document.getText(
    //         //     new vscode.Range(
    //         //         this.editor.document.positionAt(node.offset),
    //         //         this.editor.document.positionAt(node.offset + node.length)
    //         //     )
    //         // );
    //         // return `${property}: ${value}`;
    //     }
    // }
}
