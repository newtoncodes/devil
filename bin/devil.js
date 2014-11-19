#!/usr/bin/env node

var program = require('commander'),
    config = require('../package.json'),
    fs = require('fs'),
    os = require('os'),
    spawn = require('child_process').spawn,

    Server = require('../src/server/Server');

program.version(config.version);
program.option('-s, --server', 'Server mode', false);
program.option('-c, --client', 'Client mode', false);
program.option('-h, --host [value]', 'Host address', '127.0.0.1');
program.option('-p, --port [value]', 'Port number', null);
program.parse(process.argv);

var _client = true, _server = true;
if (program.client || program.server) {
    if (!program.client) _client = false;
    if (!program.server) _server = false;
}

if (!program.port || isNaN(parseInt(program.port))) program.port = 0;
else program.port = parseInt(program.port);
if (program.port < 0 || !program.port || program.port > 65535) program.port = 0;

// Replace the console.log
console.demonicLog = console.log;
console.log =  new Function();

if (_server) {
    // Initialize a server
    var server = new Server(program.host, program.port);

    server.start(function (error) {
        if (error) {
            console.demonicLog("[ERROR] Server failed to start.");
            console.error(error);
        }
    });
}

if (_client) {
    var exe = require('nodewebkit').findpath();

    var exists = fs.existsSync(exe);
    if (!exists) {
        console.demonicLog("[ERROR] Cannot find node-webkit executable.");
        process.exit();
    }

    var lastErr = null;
    
    var client = spawn(exe, [__dirname + '/../src/client', program.host, program.port], {
        stdio: ['ignore', 'ignore', null]
    });

    client.stderr.on('data', function(data) {
        lastErr = data.toString('utf8');
    });

    client.on('close', function () {
        if (_server) console.demonicLog("[EXIT] Client closed.\n[INFO] Last error message from client:\n" + lastErr + "\n");
        process.exit();
    });
}

