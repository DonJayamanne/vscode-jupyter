const { parentPort } = require('worker_threads');
// import * as Comlink from '/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/node_modules/comlink/dist/esm/comlink.mjs';
// import nodeEndpoint from '/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/node_modules/comlink/dist/esm/node-adapter.mjs';

const api = {
    doMath() {
        return 4;
    }
};

async function main() {
    const Comlink = await import(
        '/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/node_modules/comlink/dist/esm/comlink.mjs'
    );
    const nodeEndpoint = await import(
        '/Users/donjayamanne/Desktop/development/vsc/vscode-jupyter/node_modules/comlink/dist/esm/node-adapter.mjs'
    );

    Comlink.expose(api, nodeEndpoint.default(parentPort));
    // console.error('Done1243', nodeEndpoint);
}
main();
