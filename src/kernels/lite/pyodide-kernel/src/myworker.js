const {
    expose
} = require('/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/out/kernels/lite/pyodide-kernel/src/comlink/comlink.js');
const {parentPort} = require('worker_threads');
const obj = {
    counter: 0,
    inc() {
        this.counter++;
    },
    async doAsync() {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return 'done';
    }
};

// parentPort.postMessage('Started');
expose(obj, parentPort);
