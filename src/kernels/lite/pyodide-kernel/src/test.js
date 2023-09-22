var { Worker } = require('worker_threads');

// 1. cd vscode-jupyter/src/kernels/lite/pyodide-kernel
// python -m http.server 8015
// 2. cd src/kernels/lite/pyodide-kernel/src/pyodide
// python -m http.server 8016
// 3. npm run worker-watch
// 4. npm run compile
// node ....test.js

async function main() {
    const Comlink = await import('comlink/dist/esm/comlink.mjs');
    const nodeEndpoint = await import('comlink/dist/esm/node-adapter.mjs');

    var w = new Worker('/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/out/comlink.worker.js');
    w.on('message', (message) =>
        message && 'log' in message ? console.log(`> ${message.log} ${JSON.stringify(message.data)}`) : undefined
    );
    var remote = Comlink.wrap(nodeEndpoint.default(w));
    console.error('Start');
    const name = await remote.name;
    console.error('End', name);
    const result = await remote.doSomething();
    console.error('End', result);
    var options = {
        baseUrl: 'http://localhost:8015/',
        pyodideUrl:
            // 'http://localhost:8016/pyodide.js',
            '/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/src/kernels/lite/pyodide-kernel/src/pyodide/pyodide.js',
        indexUrl:
            '/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/src/kernels/lite/pyodide-kernel/src/pyodide',
        // location: '',
        // disablePyPIFallback: false,
        // pipliteWheelUrl: 'http://localhost:9092/pypi/piplite-0.0.10-py3-none-any.whl',
        // pipliteUrls: ['http://localhost:9092/pypi/all.json']
        baseUrl: 'http://localhost:8015/',
        disablePyPIFallback: false,
        // indexUrl: 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/',
        location: '',
        mountDrive: true,
        pipliteUrls: ['http://localhost:8015/pypi/all.json'],
        pipliteWheelUrl: 'http://localhost:8015/pypi/piplite-0.0.10-py3-none-any.whl'
        // pyodideUrl: 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js'
    };
    remote.initialize(options).then(
        async () => {
            console.error('Getting Kernel Info');
            const result = await remote.execute({ code: 'print(1234)' });
            // const result = await remote.execute('import sys\nprint(sys.version)');
            console.log('Result', result);
        },
        (ex) => {
            console.error('Failed to initialize', ex);
        }
    );

    console.log('Waiting to exist');
    setTimeout(() => {
        console.log('Exiting');
        // remote.exit();
    }, 30_000);
}
main();
