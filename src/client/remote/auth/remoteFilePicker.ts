import { inject, injectable } from 'inversify';
import { QuickInputButton, QuickPickItem, ThemeIcon, Uri } from 'vscode';
import {
    IMultiStepInputFactory,
    InputStep,
    IQuickPickParameters,
    MultiStepInput
} from '../../common/utils/multiStepInput';
import { RemoteFileSystem } from './fileSystem';
import { RemoteJupyterAuthProvider } from './remoteJupyterAutProvider';
import { RemoteServer } from './server';

type FolderSelectionState = {
    currentFolder?: Uri;
    parents: Uri[];
};

// tslint:disable-next-line: interface-name
interface QuickPickFolder extends QuickPickItem {
    path: string;
}

class RemoteFilePicker {
    constructor(
        private readonly multiStepFactory: IMultiStepInputFactory,
        private readonly fileSystem: RemoteFileSystem,
        private readonly remoteServer: RemoteServer
    ) {}
    public async selectFolder(): Promise<Uri | undefined> {
        const step = this.multiStepFactory.create<FolderSelectionState>();
        const state: FolderSelectionState = { parents: [] };
        await step.run(this.nextStep.bind(this), state);
        // tslint:disable-next-line: no-console
        console.log('1');
        return state.currentFolder;
    }
    private async nextStep(
        input: MultiStepInput<FolderSelectionState>,
        state: FolderSelectionState
    ): Promise<InputStep<FolderSelectionState> | void> {
        const selection = await this.pickFolder(input, state);
        // tslint:disable-next-line: no-console
        console.log(selection);
    }
    private async pickFolder(input: MultiStepInput<FolderSelectionState>, state: FolderSelectionState): Promise<void> {
        const currentFolder = state.currentFolder || this.fileSystem.rootFolder;
        if (state.parents.length === 0) {
            state.currentFolder = undefined;
        }
        const filesAndFolders = await this.remoteServer.getDirectoryContents(currentFolder.fsPath);
        const folders = filesAndFolders.content
            .filter((item) => item.type === 'directory')
            .sort((a, b) => (a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1));
        const items: QuickPickFolder[] = folders.map((item) => {
            return {
                label: `$(folder) ${item.name}`,
                path: item.path
            };
        });
        if (state.parents.length) {
            items.splice(0, 0, {
                // tslint:disable-next-line: no-invalid-template-strings
                label: '$(arrow-up) ...',
                path: state.parents[state.parents.length - 1].fsPath
            });
        }
        const buttons: QuickInputButton[] = [];
        if (state.parents.length) {
            buttons.push({ iconPath: new ThemeIcon('quick-input-back'), tooltip: 'Go back to previous folder' });
        }
        buttons.push({ iconPath: new ThemeIcon('menu-selection'), tooltip: `Select current folder` });
        const response: QuickPickFolder | QuickInputButton | undefined = await input.showQuickPick<
            QuickPickFolder,
            IQuickPickParameters<QuickPickFolder>
        >({
            title: `Folders on Remote Jupyter Server (${this.remoteServer.label})`,
            items,
            buttons,
            canGoBack: false,
            acceptFilterBoxTextAsSelection: false,
            placeholder: `Create a blank notebook in ${currentFolder.fsPath}`
        });
        const selection = (response as unknown) as QuickPickFolder | QuickInputButton | undefined;
        if (selection && 'path' in selection && selection.label.startsWith('$(arrow-up)')) {
            if (state.parents.length) {
                state.currentFolder = state.parents.pop();
                return this.pickFolder(input, state);
            }
        } else if (selection && 'path' in selection) {
            state.parents.push(currentFolder);
            state.currentFolder = Uri.file(selection.path).with({ scheme: this.fileSystem.scheme });
            return this.pickFolder(input, state);
        } else if (selection && 'tooltip' in selection && selection.tooltip?.startsWith('Select')) {
            state.currentFolder = currentFolder;
        } else if (selection && 'tooltip' in selection && selection.tooltip?.startsWith('Go')) {
            if (state.parents.length) {
                state.currentFolder = state.parents.pop();
                return this.pickFolder(input, state);
            }
        } else {
            state.currentFolder = undefined;
        }
        // tslint:disable-next-line: no-console
        console.log(selection);
    }
}

@injectable()
export class RemoteFilePickerProvider {
    constructor(@inject(IMultiStepInputFactory) private readonly multiStepFactory: IMultiStepInputFactory) {}
    public async selectFolder(fileSystem: RemoteFileSystem): Promise<Uri | undefined> {
        const remoteServer = RemoteJupyterAuthProvider.getServerByFileScheme(fileSystem.scheme)!;
        return new RemoteFilePicker(this.multiStepFactory, fileSystem, remoteServer).selectFolder();
    }
}
