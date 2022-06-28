// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const fs = require('fs-extra');
const path = require('path');
const { createServer } = require('http');
const jsonc = require('jsonc-parser');
const mocha = require('mocha');
const dedent = require('dedent');
const { EventEmitter } = require('events');
const colors = require('colors');
// const core = require('@actions/core');

const settingsFile = path.join(__dirname, '..', 'src', 'test', 'datascience', '.vscode', 'settings.json');
const webTestSummaryJsonFile = path.join(__dirname, '..', 'webtest.json');
const webTestSummaryFile = path.join(__dirname, '..', 'webtest.txt');
const webTestSummaryNb = path.join(__dirname, '..', 'webtest.ipynb');
const progress = [];

exports.startReportServer = async function () {
    return new Promise((resolve) => {
        console.log(`Creating test server`);
        server = createServer((req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST,GET');
            res.setHeader('Access-Control-Max-Age', 2592000); // 30 days

            if (req.method === 'OPTIONS') {
                res.writeHead(200, {
                    'Access-Control-Allow-Origin': '*', // REQUIRED CORS HEADER
                    'Access-Control-Allow-Methods': 'GET, POST, DELETE, PUT, PATCH', // REQUIRED CORS HEADER
                    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept' // REQUIRED CORS HEADER
                });
                res.end();
                return;
            } else if (req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Done');
            } else if (req.method === 'POST') {
                let data = '';
                req.on('data', (chunk) => {
                    data += chunk.toString();
                });
                req.on('end', () => {
                    fs.appendFileSync(webTestSummaryFile, data);
                    try {
                        progress.push(JSON.parse(data));
                    } catch (ex) {
                        console.error('Failed to parse test output', ex);
                    }
                    res.writeHead(200);
                    res.end();
                });
            } else {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Done');
            }
        });
        server.listen({ host: '127.0.0.1', port: 0 }, async () => {
            const port = server.address().port;
            console.log(`Test server listening on port ${port}`);
            const settingsJson = fs.readFileSync(settingsFile).toString();
            const edits = jsonc.modify(settingsJson, ['jupyter.REPORT_SERVER_PORT'], port, {});
            const updatedSettingsJson = jsonc.applyEdits(settingsJson, edits);
            fs.writeFileSync(settingsFile, updatedSettingsJson);
            resolve({
                dispose: async () => {
                    console.error(`Disposing test server`);
                    fs.writeFileSync(webTestSummaryJsonFile, JSON.stringify(progress));
                    server.close();
                }
            });
        });
    });
};

exports.dumpTestSummary = () => {
    try {
        const summary = JSON.parse(fs.readFileSync(webTestSummaryJsonFile).toString());
        const eventEmitter = new EventEmitter();
        const reportWriter = new mocha.reporters.Spec(eventEmitter, { color: true });
        reportWriter.failures = [];
        const cells = [];
        let indent = 0;
        let executionCount = 0;
        summary.forEach((output) => {
            // mocha expects test objects to have a method `slow, fullTitle, titlePath`.
            ['slow', 'fullTitle', 'titlePath'].forEach((fnName) => {
                const value = output[fnName];
                output[fnName] = () => value;
            });
            if ('stats' in output) {
                reportWriter.stats = output.stats;
            }
            if (output.event === 'fail') {
                reportWriter.failures.push(output);
            }
            eventEmitter.emit(output.event, Object.assign({}, output));

            switch (output.event) {
                case 'suite': {
                    indent += 1;
                    const indentString = '#'.repeat(indent);
                    cells.push({
                        cell_type: 'markdown',
                        metadata: {
                            collapsed: true
                        },
                        source: dedent`
                                ${indentString} ${output.title}
                                `
                    });
                    break;
                }
                case 'suite end': {
                    indent -= 1;
                    break;
                }
                case 'fail': {
                    const stackFrames = (output.err.stack || '').split(/\r?\n/);
                    const line1 = stackFrames.shift() || '';

                    const assertionError = {
                        ename: '',
                        evalue: '',
                        output_type: 'error',
                        traceback: [`${colors.red(line1)}\n`, stackFrames.join('\n')]
                    };
                    const consoleOutputs = (output.consoleOutput || [])
                        .map((item) => {
                            const time = item.time ? new Date(item.time) : '';
                            const timeStr = time ? `${time.toLocaleTimeString()}.${time.getMilliseconds()}` : '';
                            const colorizedTime = timeStr ? `${colors.blue(timeStr)}: ` : '';
                            switch (item.category) {
                                case 'warn':
                                    return `${colorizedTime}${colors.yellow(item.output)}`;
                                case 'error':
                                    return `${colorizedTime}${colors.red(item.output)}`;
                                default:
                                    return `${colorizedTime}${item.output}`;
                                    break;
                            }
                        })
                        .map((item) => `${item}\n`);
                    const consoleOutput = {
                        name: 'stdout',
                        output_type: 'stream',
                        text: consoleOutputs
                    };
                    cells.push({
                        cell_type: 'code',
                        metadata: {
                            collapsed: true
                        },
                        source: `#${output.title}`,
                        execution_count: ++executionCount,
                        outputs: [assertionError, consoleOutput]
                    });
                    break;
                }
            }
        });
        fs.writeFileSync(webTestSummaryNb, JSON.stringify({ cells: cells }));
    } catch (ex) {
        console.error('Failed dumpTestSummary', ex);
    }
};
