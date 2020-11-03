// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { Event, EventEmitter, TreeDataProvider, TreeItem, TreeItemCollapsibleState, Uri } from 'vscode';
import { IDisposable, IDisposableRegistry } from '../../common/types';

export type JupyterServerTreeNodeType = 'jupyterServer';

export abstract class BaseTreeNode extends TreeItem {
    /**
     * @param label A human-readable string describing this item
     * @param collapsibleState [TreeItemCollapsibleState](#TreeItemCollapsibleState) of the tree item. Default is [TreeItemCollapsibleState.None](#TreeItemCollapsibleState.None)
     */
    constructor(type: JupyterServerTreeNodeType, label: string, collapsibleState?: TreeItemCollapsibleState);

    /**
     * @param resourceUri The [uri](#Uri) of the resource representing this item.
     * @param collapsibleState [TreeItemCollapsibleState](#TreeItemCollapsibleState) of the tree item. Default is [TreeItemCollapsibleState.None](#TreeItemCollapsibleState.None)
     */
    // tslint:disable-next-line: unified-signatures
    constructor(type: JupyterServerTreeNodeType, resourceUri: Uri, collapsibleState?: TreeItemCollapsibleState);
    constructor(
        public readonly type: JupyterServerTreeNodeType,
        item: string | Uri,
        collapsibleState?: TreeItemCollapsibleState
    ) {
        // tslint:disable-next-line: no-any
        super(item as any, collapsibleState);
        this.contextValue = type;
    }
}
export type JupyterServerTreeItem = BaseTreeNode;

@injectable()
export class JupyterServersTreeDataProvider implements TreeDataProvider<JupyterServerTreeItem>, IDisposable {
    /**
     * An optional event to signal that an element or root has changed.
     * This will trigger the view to update the changed element/root and its children recursively (if shown).
     * To signal that root has changed, do not pass any argument or pass `undefined` or `null`.
     */
    public get onDidChangeTreeData(): Event<JupyterServerTreeItem | undefined | null | void> {
        return this._onDidChangeTreeData.event;
    }
    public static readonly instance: Readonly<JupyterServersTreeDataProvider>;
    private _onDidChangeTreeData = new EventEmitter<JupyterServerTreeItem | undefined | null | void>();
    constructor(@inject(IDisposableRegistry) disposables: IDisposableRegistry) {
        disposables.push(this);
    }

    public dispose() {
        this._onDidChangeTreeData.dispose();
    }
    /**
     * Get [TreeItem](#TreeItem) representation of the `element`
     *
     * @param element The element for which [TreeItem](#TreeItem) representation is asked for.
     * @return [TreeItem](#TreeItem) representation of the element
     */
    public getTreeItem(element: JupyterServerTreeItem): TreeItem | Thenable<TreeItem> {
        return element;
    }

    /**
     * Get the children of `element` or root if no element is passed.
     *
     * @param element The element from which the provider gets children. Can be `undefined`.
     * @return Children of `element` or root if no element is passed.
     */
    public async getChildren(_element?: JupyterServerTreeItem): Promise<JupyterServerTreeItem[]> {
        return [];
    }
}
