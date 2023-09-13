const { Worker } = require('worker_threads');

// const { wrap } = require('comlink');

async function init() {
    const Comlink = await import("/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/node_modules/comlink/dist/esm/comlink.mjs");
    const nodeEndpoint = await import("/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/node_modules/comlink/dist/esm/node-adapter.mjs");
    console.error('Before Worker', Comlink);
    const worker = new Worker(
        '/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/src/kernels/lite/pyodide-kernel/src/myworker.js'
    );
    worker.on('message', (message) => {
        if (message && 'log' in message) console.log(`> ${message.log} ${JSON.stringify(message.data)}`);
        // console.error('Message', message);
    });
    console.error('Before Wrap');
    // WebWorkers use `postMessage` and therefore work with Comlink.
    const obj = Comlink.wrap(nodeEndpoint.default(worker));
    console.error('After Wrap');
    console.log(`Counter: ${await obj.counter}`);
    await obj.inc();
    console.log(`Done inc`);
    // console.log(`Counter: ${await obj.counter}`);
    // const reslut = await obj.doAsync();
    console.log(`Result: ${result}`);
}
init();
