const { Worker } = require('worker_threads');

async function init() {
    const Comlink = await import(
        '/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/node_modules/comlink/dist/esm/comlink.mjs'
    );
    const nodeEndpoint = await import(
        '/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/node_modules/comlink/dist/esm/node-adapter.mjs'
    );
    const worker = new Worker(
        '/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/src/kernels/lite/pyodide-kernel/src/sampleWorker.js'
    );

    const api = Comlink.wrap(nodeEndpoint.default(worker));
    console.log(await api.doMath());
    console.log('Done');
}
init();
