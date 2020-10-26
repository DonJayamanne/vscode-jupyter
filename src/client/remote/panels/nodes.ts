// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ThemeIcon, TreeItem, TreeItemCollapsibleState, Uri } from 'vscode';
import { Commands } from '../../datascience/constants';
import { RemoteServer } from '../auth/server';
import { DirectoryEntry, FileEntry, ServerSession, ServerSessionKernel, ServerStatus } from '../auth/types';

// tslint:disable: max-classes-per-file

// export class ServerInfo {
//     constructor(public readonly info: DeepReadonly<ServerConnection.ISettings>) {}
//     public get label(): string {
//         return this.info.baseUrl;
//     }
// }
export type NodeType =
    | 'server'
    | 'fileSystem'
    | 'serverStatus'
    | 'serverStatusInfo'
    | 'serverKernels'
    | 'serverKernel'
    | 'serverSessions'
    | 'serverSession'
    | 'file'
    | 'directory'
    | 'fileSystem';
export interface ITreeNode<T extends NodeType> {
    readonly type: T;
    getChildren?(): Promise<TreeItem[]>;
}
// export abstract class BaseTreeItem<T extends NodeType = 'server'> extends TreeItem {
//     public readonly type:NodeType = T;
// }
function createTreeNode(name: string, value: string | number): TreeItem & ITreeNode<'serverStatusInfo'> {
    const node = new TreeItem(name, TreeItemCollapsibleState.None);
    node.description = `${value}`;
    Object.assign(node, { type: 'serverStatusInfo' });
    // tslint:disable-next-line: no-any
    return node as any;
}
export class StatusNode extends TreeItem implements ITreeNode<'serverStatus'> {
    public readonly type = 'serverStatus';
    constructor(private readonly status: ServerStatus) {
        super('Status', TreeItemCollapsibleState.Collapsed);
    }

    public async getChildren(): Promise<TreeItem[]> {
        return [
            createTreeNode('Started', this.status.started),
            createTreeNode('Last Activity', this.status.last_activity),
            createTreeNode('Connections', this.status.connections),
            createTreeNode('Kernels', this.status.kernels)
        ];
    }
}
export class KernelNode extends TreeItem implements ITreeNode<'serverKernel'> {
    public readonly type = 'serverKernel';
    constructor(_: RemoteServer, kernel: ServerSessionKernel) {
        super(kernel.name || kernel.id, TreeItemCollapsibleState.None);
        const connection = kernel.connections === 1 ? '1 connection' : `${kernel.connections} connections`;
        this.description = connection;
        this.tooltip = connection;
        // this.iconPath = Uri.file(
        //     '/Users/donjayamanne/Desktop/Development/vsc/vscode-jupyter/src/test/datascience/sub/test.ipynb'
        // );
    }

    public async getChildren(): Promise<TreeItem[]> {
        return [];
    }
}
export class SessionNode extends TreeItem implements ITreeNode<'serverSession'> {
    public readonly type = 'serverSession';
    constructor(private readonly info: RemoteServer, private readonly session: ServerSession) {
        super(session.name || session.path || session.id, TreeItemCollapsibleState.Collapsed);
        const uri = Uri.parse(session.path).with({ scheme: info.fileScheme });
        this.command = {
            command: Commands.OpenNotebookInPreviewEditor,
            arguments: [uri],
            title: 'Open Notebook'
        };
        this.resourceUri = uri;
        this.iconPath = ThemeIcon.File;
        const connection =
            session.kernel.connections === 1 ? '1 connection' : `${session.kernel.connections} connections`;
        this.description = `${connection} using kernel ${session.kernel.name}`;
        this.tooltip = `${connection} using kernel ${session.kernel.name}`;
        // this.iconPath = Uri.file(
        //     '/Users/donjayamanne/Desktop/Development/vsc/vscode-jupyter/src/test/datascience/sub/test.ipynb'
        // );
    }

    public async getChildren(): Promise<TreeItem[]> {
        // return [];
        return [new KernelNode(this.info, this.session.kernel)];
    }
}
export class SessionsNode extends TreeItem implements ITreeNode<'serverSessions'> {
    public readonly type = 'serverSessions';
    constructor(private readonly info: RemoteServer) {
        super('Active notebooks on server', TreeItemCollapsibleState.Collapsed);
        // const uri = Uri.file('wow.ipynb');
        // this.resourceUri = uri;
        this.iconPath = new ThemeIcon('vm-active');
    }

    public async getChildren(): Promise<TreeItem[]> {
        const sessions = await this.info.getSessions();
        return sessions
            .filter((session) => session.type === 'notebook')
            .map((session) => new SessionNode(this.info, session));
    }
}
export class KernelsNode extends TreeItem implements ITreeNode<'serverKernels'> {
    public readonly type = 'serverKernels';
    constructor(private readonly info: RemoteServer) {
        super('Active kernels', TreeItemCollapsibleState.Collapsed);
        this.iconPath = new ThemeIcon('zap');
    }

    public async getChildren(): Promise<TreeItem[]> {
        const kernels = await this.info.getKernels();
        return kernels.map((kernel) => new KernelNode(this.info, kernel));
    }
}

export class DirectoryNode extends TreeItem implements ITreeNode<'directory'> {
    public readonly type = 'directory';
    constructor(private readonly info: RemoteServer, private readonly dir: DirectoryEntry) {
        super(dir.name, TreeItemCollapsibleState.Collapsed);
        this.resourceUri = Uri.parse(dir.path);
        this.iconPath = ThemeIcon.Folder;
    }

    public async getChildren(): Promise<TreeItem[]> {
        const children = await this.info.getDirectoryContents(this.dir);

        return sortFolderContents(children.content.map(childFileFolderToNode.bind(undefined, this.info)));
    }
}
export class FileNode extends TreeItem implements ITreeNode<'file'> {
    public readonly type = 'file';
    constructor(info: RemoteServer, file: FileEntry) {
        super(file.name, TreeItemCollapsibleState.None);
        this.iconPath = ThemeIcon.File;
        const uri = Uri.parse(file.path).with({ scheme: info.fileScheme });
        this.resourceUri = uri;

        this.command = {
            command: file.type === 'file' ? 'vscode.open' : Commands.OpenNotebookInPreviewEditor,
            arguments: [uri],
            title: 'Open File'
        };
    }

    public async getChildren(): Promise<TreeItem[]> {
        return [];
    }
}
function childFileFolderToNode(info: RemoteServer, item: DirectoryEntry | FileEntry): DirectoryNode | FileNode {
    return item.type === 'directory' ? new DirectoryNode(info, item) : new FileNode(info, item);
}
function sortFolderContents(items: (DirectoryNode | FileNode)[]): (DirectoryNode | FileNode)[] {
    const folders = items
        .filter((item) => item.type === 'directory')
        .sort((a, b) => ((a.label || '').toLocaleLowerCase() > (b.label || '').toLocaleLowerCase() ? 1 : -1));
    const files = items
        .filter((item) => item.type === 'file')
        .sort((a, b) => ((a.label || '').toLocaleLowerCase() > (b.label || '').toLocaleLowerCase() ? 1 : -1));
    return [...folders, ...files];
}

export class FileSystemNode extends TreeItem implements ITreeNode<'fileSystem'> {
    public readonly type = 'fileSystem';
    constructor(private readonly info: RemoteServer) {
        super('File System', TreeItemCollapsibleState.Collapsed);
        // this.resourceUri = Uri.parse(info.info.baseUrl);
        // this.iconPath = ThemeIcon.Folder;
        this.iconPath = new ThemeIcon('remote-explorer');
    }

    public async getChildren(): Promise<TreeItem[]> {
        const children = await this.info.getDirectoryContents();
        return sortFolderContents(children.content.map(childFileFolderToNode.bind(undefined, this.info)));
    }
}
export class ServerNode extends TreeItem implements ITreeNode<'server'> {
    public readonly type = 'server';
    constructor(private readonly info: RemoteServer) {
        super(info.label, TreeItemCollapsibleState.Expanded);
        this.iconPath = new ThemeIcon('server');
    }

    public async getChildren() {
        const status = await this.info.getStatus();
        return [
            new StatusNode(status),
            new KernelsNode(this.info),
            new SessionsNode(this.info),
            new FileSystemNode(this.info)
        ];
    }
}

export type RemoteServerNode = TreeItem | ServerNode | StatusNode;
