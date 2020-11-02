// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ContentsManager, ServerConnection } from '@jupyterlab/services';
import { inject, injectable, named } from 'inversify';
import {
    Disposable,
    Event,
    EventEmitter,
    FileChangeEvent,
    FileChangeType,
    FileStat,
    FileSystemError,
    FileSystemProvider,
    FileType,
    Memento,
    Uri,
    workspace
} from 'vscode';
import { IExtensionSingleActivationService } from '../../activation/types';
import { GLOBAL_MEMENTO, IDisposable, IMemento } from '../../common/types';
import { noop } from '../../common/utils/misc';
import {
    getSerializableServerConnectionId,
    RemoteJupyterAuthProvider,
    SerializableConnectionSettingsId
} from './remoteJupyterAutProvider';
import { RemoteServer } from './server';
import { DirectoryEntry, DirectoryResponse, FileEntry } from './types';

export class File implements FileStat {
    public type: FileType;
    public ctime: number;
    public mtime: number;
    public size: number;
    public name: string;
    public data?: Uint8Array;
    constructor(public readonly entry: Readonly<FileEntry>) {
        this.type = FileType.File;
        this.ctime = new Date(entry.created).getTime();
        this.mtime = new Date(entry.last_modified).getTime();
        this.size = entry.size;
        this.name = entry.path;
    }
}

export class Directory implements FileStat {
    public type: FileType;
    public ctime: number;
    public mtime: number;
    public size: number;
    public name: string;
    public get children(): (Directory | File)[] {
        if ('content' in this.entry) {
            return this.entry.content.map((item) => (item.type === 'directory' ? new Directory(item) : new File(item)));
        } else {
            return [];
        }
    }
    // public entries: Map<string, File | Directory>;
    constructor(public readonly entry: Readonly<DirectoryEntry | DirectoryResponse>) {
        this.type = FileType.Directory;
        this.ctime = new Date(entry.created).getTime();
        this.mtime = new Date(entry.last_modified).getTime();
        this.size = 0;
        this.name = entry.path;
        // this.entries = new Map();
    }
}
export type Entry = File | Directory;

// tslint:disable-next-line: max-classes-per-file
export class RemoteFileSystem implements FileSystemProvider {
    public get onDidChangeFile(): Event<FileChangeEvent[]> {
        return this._emitter.event;
    }
    public get isDisposed() {
        return this._isDisposed === true;
    }
    public static get RegisteredFileSystems(): Readonly<RemoteFileSystem[]> {
        return RemoteFileSystem._registeredFileSystems;
    }
    public static _registeredFileSystems: RemoteFileSystem[] = [];
    private static removeServers: string[] = [];
    public readonly rootFolder: Uri;
    private _isDisposed?: boolean;

    private _emitter = new EventEmitter<FileChangeEvent[]>();
    private _bufferedEvents: FileChangeEvent[] = [];
    private _fireSoonHandle?: NodeJS.Timer;
    private readonly disposables: IDisposable[] = [];
    private remoteServer?: Promise<RemoteServer>;
    public get label() {
        return RemoteJupyterAuthProvider.getServerByFileScheme(this.scheme)?.label || this.scheme;
    }
    constructor(
        @inject(RemoteJupyterAuthProvider) private authProvider: RemoteJupyterAuthProvider,
        public readonly scheme: string,
        private readonly serializableConnectionId: SerializableConnectionSettingsId
    ) {
        RemoteFileSystem.removeServers.push(scheme);
        this.disposables.push(workspace.registerFileSystemProvider(scheme, this, { isCaseSensitive: true }));
        this.rootFolder = Uri.file('/').with({ scheme });
        RemoteFileSystem._registeredFileSystems.push(this);
    }
    public dispose() {
        RemoteFileSystem._registeredFileSystems = RemoteFileSystem._registeredFileSystems.filter(
            (item) => item !== this
        );

        this._isDisposed = true;
        this.disposables.forEach((d) => d.dispose());
    }
    public async stat(uri: Uri): Promise<FileStat> {
        return this._lookup(uri, false);
    }

    public async readDirectory(uri: Uri): Promise<[string, FileType][]> {
        const entry = await this._lookup(uri, false);
        const result: [string, FileType][] = [];
        if (!entry || entry instanceof File) {
            return result;
        }
        for (const item of entry.children) {
            result.push([item.name, item instanceof File ? FileType.File : FileType.Directory]);
        }
        return result;
    }

    // --- manage file contents

    public async readFile(uri: Uri): Promise<Uint8Array> {
        const file = await this._lookup(uri, false);
        if (file && file instanceof File) {
            let contents: string;
            if (file.entry.type === 'notebook' && file.entry.content && typeof file.entry.content === 'object') {
                contents = JSON.stringify(file.entry.content);
            } else {
                const server = await this.getRemoteServer();
                contents = await server.getFileContent(file.entry);
            }
            return new TextEncoder().encode(contents);
        }
        throw FileSystemError.FileNotFound();
    }

    public async writeFile(
        uri: Uri,
        content: Uint8Array,
        options: { create: boolean; overwrite: boolean }
    ): Promise<void> {
        // Support save as, new file, etc.
        // Check options.create // overwrite
        if (options.create) {
            return;
        } else {
            const server = await this.getRemoteServer();
            const file = await server.getFileOrDirectory(uri.fsPath);
            if (!file) {
                throw FileSystemError.FileNotFound();
            }
            if (file.type === 'directory') {
                throw FileSystemError.FileIsADirectory();
            }
            await server.saveFile(file, new TextDecoder().decode(content));
        }
        // const basename = path.posix.basename(uri.path);
        // const parent = this._lookupParentDirectory(uri);
        // let entry = parent.entries.get(basename);
        // if (entry instanceof Directory) {
        //     throw FileSystemError.FileIsADirectory(uri);
        // }
        // if (!entry && !options.create) {
        //     throw FileSystemError.FileNotFound(uri);
        // }
        // if (entry && options.create && !options.overwrite) {
        //     throw FileSystemError.FileExists(uri);
        // }
        // if (!entry) {
        //     entry = new File(basename);
        //     parent.entries.set(basename, entry);
        //     this._fireSoon({ type: FileChangeType.Created, uri });
        // }
        // entry.mtime = Date.now();
        // entry.size = content.byteLength;
        // entry.data = content;

        this._fireSoon({ type: FileChangeType.Changed, uri });
    }

    // --- manage files/folders

    public rename(_oldUri: Uri, _newUri: Uri, _options: { overwrite: boolean }): void {
        // if (!options.overwrite && this._lookup(newUri, true)) {
        //     throw FileSystemError.FileExists(newUri);
        // }
        // const entry = this._lookup(oldUri, false);
        // const oldParent = this._lookupParentDirectory(oldUri);
        // const newParent = this._lookupParentDirectory(newUri);
        // const newName = path.posix.basename(newUri.path);
        // oldParent.entries.delete(entry.name);
        // entry.name = newName;
        // newParent.entries.set(newName, entry);
        // this._fireSoon({ type: FileChangeType.Deleted, uri: oldUri }, { type: FileChangeType.Created, uri: newUri });
    }

    public async delete(uri: Uri): Promise<void> {
        const entry = await this._lookup(uri, false);
        if (!entry) {
            throw FileSystemError.FileNotFound(uri);
        }
        const server = await this.getRemoteServer();
        await server.deletePath(entry.entry);
        this._fireSoon({ type: FileChangeType.Changed, uri }, { uri, type: FileChangeType.Deleted });
    }

    public async createNewNotebook(remotePath: Uri): Promise<Uri | undefined> {
        const server = await this.getRemoteServer();
        const mgr = new ContentsManager({
            serverSettings: server.info
        });
        const model = await mgr.newUntitled({ type: 'notebook', path: remotePath.fsPath });
        // model = await mgr.get(model.path, { format: 'json', type: 'notebook', content: true });
        // const notebookContent = model.content as nbformat.INotebookContent;
        // notebookContent.cells.push({
        //     cell_type: 'code',
        //     execution_count: null,
        //     metadata: {},
        //     outputs: [],
        //     source: []
        // });
        // await mgr.save(model.path, { content: model.content, type: 'notebook', format: 'json' });
        if (model) {
            return Uri.file(model.path).with({ scheme: this.scheme });
        }
    }
    public async createNewFolder(remotePath: Uri): Promise<Uri | undefined> {
        const server = await this.getRemoteServer();
        const mgr = new ContentsManager({
            serverSettings: server.info
        });
        const model = await mgr.newUntitled({ type: 'directory', path: remotePath.fsPath });
        // model = await mgr.get(model.path, { format: 'json', type: 'notebook', content: true });
        // const notebookContent = model.content as nbformat.INotebookContent;
        // notebookContent.cells.push({
        //     cell_type: 'code',
        //     execution_count: null,
        //     metadata: {},
        //     outputs: [],
        //     source: []
        // });
        // await mgr.save(model.path, { content: model.content, type: 'notebook', format: 'json' });
        if (model) {
            return Uri.file(model.path).with({ scheme: this.scheme });
        }
    }
    public createDirectory(_uri: Uri): void {
        // const basename = path.posix.basename(uri.path);
        // const dirname = uri.with({ path: path.posix.dirname(uri.path) });
        // const parent = this._lookupAsDirectory(dirname, false);
        // const entry = new Directory(basename);
        // parent.entries.set(entry.name, entry);
        // parent.mtime = Date.now();
        // parent.size += 1;
        // this._fireSoon({ type: FileChangeType.Changed, uri: dirname }, { type: FileChangeType.Created, uri });
    }

    public watch(_resource: Uri): Disposable {
        // ignore, fires for all changes...
        return { dispose: noop };
    }
    private async getRemoteServer() {
        if (!this.remoteServer) {
            const getRemoteServer = async () => {
                let server = RemoteJupyterAuthProvider.getServerBySerializableConnectionSettingsId(
                    this.serializableConnectionId
                );
                if (!server) {
                    server = await this.authProvider.promptToLogin(this.serializableConnectionId.baseUrl);
                }
                // Don't resolve the promise.
                if (!server) {
                    // tslint:disable-next-line: no-unnecessary-local-variable promise-must-complete
                    const promise = new Promise<RemoteServer>(() => noop);
                    return promise;
                }
                return server;
            };

            this.remoteServer = getRemoteServer();
        }
        return this.remoteServer!;
    }

    // --- lookup

    private async _lookup(uri: Uri, silent: false): Promise<Directory | File>;
    private async _lookup(uri: Uri, silent: boolean): Promise<Directory | File | undefined>;
    private async _lookup(uri: Uri, _silent: boolean): Promise<Directory | File | undefined> {
        const server = await this.getRemoteServer();
        const item = await server.getFileOrDirectory(uri.fsPath);
        if (item.type === 'directory') {
            return new Directory(item);
        } else {
            return new File(item);
        }
    }

    private _fireSoon(...events: FileChangeEvent[]): void {
        this._bufferedEvents.push(...events);

        if (this._fireSoonHandle) {
            clearTimeout(this._fireSoonHandle);
        }

        this._fireSoonHandle = setTimeout(() => {
            this._emitter.fire(this._bufferedEvents);
            this._bufferedEvents.length = 0;
        }, 5);
    }
}

type FileSchemeBaseUri = SerializableConnectionSettingsId & {
    scheme: string;
};
// tslint:disable-next-line: max-classes-per-file
@injectable()
export class RemoteFileSystemFactory implements IExtensionSingleActivationService {
    private readonly fileSystemsByScheme = new Map<string, RemoteFileSystem>();
    constructor(
        @inject(IMemento) @named(GLOBAL_MEMENTO) private globalState: Memento,
        @inject(RemoteJupyterAuthProvider) private authProvider: RemoteJupyterAuthProvider
    ) {}
    public async activate(): Promise<void> {
        const schemes = this.globalState.get<FileSchemeBaseUri[]>('REMOTE_JUPYTER_FILE_SCHEMES', []);
        if (Array.isArray(schemes) && schemes.length) {
            for (const scheme of schemes) {
                if (this.fileSystemsByScheme.has(scheme.scheme)) {
                    continue;
                }
                const fileSystem = new RemoteFileSystem(this.authProvider, scheme.scheme, scheme);
                this.fileSystemsByScheme.set(scheme.scheme, fileSystem);
            }
        }
    }
    // private latestSchemes = new Set<string>();
    public getOrCreateRemoteFileSystem(scheme: string, info: ServerConnection.ISettings) {
        const serializableId = getSerializableServerConnectionId(info);
        let fileSystem = this.fileSystemsByScheme.get(scheme);
        if (!fileSystem || fileSystem.isDisposed) {
            fileSystem = new RemoteFileSystem(this.authProvider, scheme, getSerializableServerConnectionId(info));
        }
        this.fileSystemsByScheme.set(scheme, fileSystem);
        const schemes = this.globalState.get<FileSchemeBaseUri[]>('REMOTE_JUPYTER_FILE_SCHEMES', []);
        schemes.push({ scheme, ...serializableId });
        // tslint:disable-next-line: no-suspicious-comment
        // BUG: Possible we log into another remote while this is getting updated.
        // Thus get the old schemes & we end up with the previous scheme not getting saved.
        this.globalState.update('REMOTE_JUPYTER_FILE_SCHEMES', schemes);
        return fileSystem;
    }
    public getRemoteFileSystem(scheme: string) {
        return this.fileSystemsByScheme.get(scheme);
    }
}
