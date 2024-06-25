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

    // var w = new Worker('/Users/donjayamanne/Development/vsc/AdvancedDataAgent/out/comlink.worker.js');
    var w = new Worker('/Users/donjayamanne/Development/vsc/vscode-jupyter/out/comlink.worker.js');
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
            '/Users/donjayamanne/Development/vsc/vscode-jupyter/src/kernels/lite/pyodide-kernel/src/pyodide/pyodide.js',
        indexUrl: '/Users/donjayamanne/Development/vsc/vscode-jupyter/src/kernels/lite/pyodide-kernel/src/pyodide',
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
            const header = {'header': {'msg_id': '1234'}};
//             const result = await remote.execute({ code: `
// import matplotlib_inline
// matplotlib_inline.backend_inline.set_matplotlib_formats('png')

// #from IPython.display import set_matplotlib_formats
// # %matplotlib inline
// # get_ipython().magic('matplotlib inLine')
// # set_matplotlib_formats('png')


// import numpy as np
// import matplotlib.pyplot as plt
// x = np.linspace(0, 20, 200)
// plt.plot(x, np.sin(x), label="sine_long_label")
// plt.legend(bbox_to_anchor =(1.1, 1.0))
// plt.show()
// ` }, header);
            const result = await remote.execute({ code: `
import pandas as pd
data = {'name': ['Alice', 'Bob', 'Charlie', 'David'],
        'age': [25, 30, 35, 40],
        'city': ['New York', 'Paris', 'London', 'Tokyo']}
df = pd.DataFrame(data)
df
` }, header);
//             const result = await remote.execute({ code: `
// import os
// print(os.listdir('/mnt'))
// print(os.getcwd())
// ` }, header);
            // const result = await remote.execute({ code: 'print(1234)' });
            // const result = await remote.execute({ code: 'import pandas;print(pandas.__version__)'}, {'header': {'msg_id': '1234'}});
            // const result = await remote.execute({code: 'import sys\nprint(sys.version)'}, {'header': {'msg_id': '1234'}});
            // const result = await remote.execute({code: 'import sys\nsys.version'}, {'header': {'msg_id': '1234'}});
            console.log('Result', result);
        },
        (ex) => {
            console.error('Failed to initialize', ex);
        }
    );

    console.log('Waiting to exit');
    setTimeout(() => {
        console.log('Exiting');
        // remote.exit();
    }, 30_000);
}
main();
