var util = require('util'),
    spawn = require('child_process').spawn,
    EventEmitter = require('events').EventEmitter,
    freeport = require('freeport'),
    async = require('async'),

    Debugger = require('./Debugger'),
    FakeAgent = require('./Agent'),
    agents = require('./agents/index');


var statusCodes = {
    1: {
        name: 'Uncaught Fatal Exception',
        message: 'There was an uncaught exception, and it was not handled by a domain or an uncaughtException event handler.'
    },

    2: {
        name: 'Bash Misuse',
        message: 'Bash for builtin misuse'
    },

    3: {
        name: 'Internal JavaScript Parse Error',
        message: 'The JavaScript source code internal in Node\'s bootstrapping process caused a parse error.This is extremely rare, and generally can only happen during development of Node itself.'
    },

    4: {
        name: 'Internal JavaScript Evaluation Failure',
        message: 'The JavaScript source code internal in Node\'s bootstrapping process failed to return a function value when evaluated.This is extremely rare, and generally can only happen during development of Node itself.'
    },

    5: {
        name: 'Fatal Error',
        message: 'There was a fatal unrecoverable error in V8. Typically a message will be printed to stderr with the prefix FATAL ERROR.'
    },

    6: {
        name: 'Non-function Internal Exception Handler',
        message: 'There was an uncaught exception, but the internal fatal exception handler function was somehow set to a non-function, and could not be called.'
    },

    7: {
        name: 'Internal Exception Handler Run-Time Failure',
        message: 'There was an uncaught exception, and the internal fatal exception handler function itself threw an error while attempting to handle it. This can happen, for example, if a process.on(\'uncaughtException\') or domain.on(\'error\') handler throws an error.'
    },

    8: {
        name: 'Unknown',
        message: 'In previous versions of Node, exit code 8 sometimes indicated an uncaught exception.'
    },

    9: {
        name: 'Invalid Argument',
        message: 'Either an unknown option was specified, or an option requiring a value was provided without a value.'
    },

    10: {
        name: 'Internal JavaScript Run-Time Failure',
        message: 'The JavaScript source code internal in Node\'s bootstrapping process threw an error when the bootstrapping function was called.'
    },

    11: {
        name: 'Unknown',
        message: 'Unknown error'
    },

    12: {
        name: 'Invalid Debug Argument',
        message: 'The --debug and/or --debug-brk options were set, but an invalid port number was chosen.'
    },

    default: {
        name: 'Signal Exit',
        message: 'Killed with signal.'
    }
};

function Session (file, args, options) {
    var $this = this;

    //
    // Private stuff

    var _file = file;
    var _args = args;
    var _debuggerPort = 5858;

    var _config = {
        breakFirst: false,
        stackTraceLimit: 10,
        hidden: [
            /.+\/devil\/node_modules\/v8\-profiler\/.+/,
            /.+\/devil\/node_modules\/heapdump\/.+/,
            /.+\/devil\/src\/server\/Debuggee\.js/
        ],
        preload: true,
        saveLiveEdit: true,
        mute: false
    };

    /**
     * Debugger client
     *
     * @type {Debugger}
     * @private
     */
    var _debugger = null;

    /**
     * WebSockets client
     *
     * @type {Object}
     * @private
     */
    var _client = null;

    /**
     * The child process
     *
     * @type {ChildProcess}
     * @private
     */
    var _process = null;

    /**
     * Is the process running or not. Refers ONLY to the process.
     *
     * @type {boolean}
     * @private
     */
    var _running = false;

    /**
     * Weather the process is already started once. Used only inside the process handlers.
     *
     * @type {boolean}
     * @private
     */
    var _started = false;

    /**
     * Notifications queue. This is used only when notifications are paused (in the beginning of every client connection).
     *
     * @type {Array}
     * @private
     */
    var _queue = [];

    /**
     * Events paused or not
     *
     * @type {boolean}
     * @private
     */
    var _paused = true;

    /**
     * Debugger is connected or not
     *
     * @type {boolean}
     * @private
     */
    var _connected = false;

    /**
     * If we already handled the initial break.
     *
     * @type {boolean}
     * @private
     */
    var _breakHandled = false;

    /**
     * Count of current sending requests
     *
     * @type {number}
     * @private
     */
    var _sending = 0;

    /**
     * Collection of agents
     *
     * @type {Object}
     * @private
     */
    var _agents = {};

    // Parse options
    options = options || {};
    if (options.mute) _config.mute = true;
    if (options.breakFirst) _config.breakFirst = true;
    //if (options.preload) _config.preload = true;
    if (options.hasOwnProperty('saveLiveEdit') && (typeof options.saveLiveEdit !== 'undefined') && !options.saveLiveEdit) _config.saveLiveEdit = false;
    if (options.stackTraceLimit && !isNaN(parseInt(options.stackTraceLimit)) && isFinite(parseInt(options.stackTraceLimit))) _config.stackTraceLimit = parseInt(options.stackTraceLimit);
    if (options.hidden && ((typeof options.hidden === 'array') || (options.hidden instanceof Array))) {
        for (var i = 0; i < options.hidden.length; i ++) {
            if (typeof options.hidden[i] === 'string') {
                try {
                    var r = new RegExp(options.hidden[i]);
                } catch (e) {
                    continue;
                }

                _config.hidden.push(r);
            }
        }
    }

    if (options.debuggerPort && !isNaN(parseInt(options.debuggerPort)) && isFinite(parseInt(options.debuggerPort))) _debuggerPort = parseInt(options.debuggerPort);

    /**
     * Pause notifications
     *
     * @private
     */
    var _pauseNotifications = function () {
        if (_paused) return;
        _paused = true;
    };

    /**
     * Resume notifications
     *
     * @private
     */
    var _resumeNotifications = function () {
        if (!_paused) return;
        _paused = false;
        while (_queue.length) _send(_queue.shift());
    };

    /**
     * Send something to the client
     *
     * @param message
     * @private
     */
    var _send = function (message) {
        var payload = typeof message == 'string' ? message : JSON.stringify(message);
        console.log('Backend: ' + payload);

        if (message.id) {
            // Response
            if (!_client) return;

            if (message.error) {
                if (typeof message.error === 'string') message.error = {
                    message: message.error,
                    name: 'DebuggerError'
                };

                // TODO: display the error somehow.

                if (message.error.name == 'NoConnection') {
                    // Legacy stuff. This wont happen now, since there is a handler for closed connection.
                    return _stop(message.error);
                }
            }
        } else {
            // Notification

            if (!_client || _paused) {
                _queue.push(message);
                return;
            }
        }

        _sending ++;
        _client.send(payload, function () {
            _sending --;
            if (_sending <= 0) {
                _sending = 0;

                console.log("Session: Emitting sent");
                $this.emit('sent');
            }
        });
    };

    /**
     * Check if port is available
     *
     * @param port
     * @param fn
     * @private
     */
    var _isPortAvailable = function (port, fn) {
        var net = require('net');
        var tester = net.createServer().once('error', function (err) {
            if (err.code != 'EADDRINUSE') return fn(err);
            fn(null, false);
        }).once('listening', function () {
            tester.once('close', function () {
                fn(null, true);
            }).close();
        }).listen(port);
    };

    /**
     * If debugger port is not available, we use this function to get an available one.
     *
     * @param callback
     * @private
     */
    var _fixDebuggerPort = function (callback) {
        _isPortAvailable(_debuggerPort, function (err, free) {
            if (err) return callback(err);

            if (!free) {
                // For debugger port, we find the first available port to use.

                freeport(function (err, port) {
                    if (err) {
                        console.demonicLog("[DEBUGGER] Could not find a free port.");
                        return callback(err);
                    }

                    _debuggerPort = port;
                    callback();
                });

                return;
            }

            callback();
        });
    };

    /**
     * Start the debugged process
     *
     * @param callback
     * @returns {*}
     * @private
     */
    var _startDebuggee = function (callback) {
        // Check the file first
        var f = null;
        try {f = require.resolve(_file);} catch (e) {}
        if (!f) return callback(new Error("Cannot resolve file: " + _file));
        _file = f;

        // So we start the new node instance with a debugger attached and we always break first, because we need a break to inject.
        _args.unshift(_file);
        _args.unshift('--debug-brk');
        _args.unshift('--debug=' + _debuggerPort);

        try {
            _process = spawn(process.execPath, _args);
            _process.stdout.setEncoding('utf8');
            _process.stderr.setEncoding('utf8');

            _running = true;
        } catch (err) {
            // This is usually not supposed to happen. Paranoia.
            return callback(err);
        }

        // At this point it's better maybe to call the callback and then continue with the rest.
        // We will still wait for a lot of stuff after this, but the client needs time to connect too,
        // so we give it ahead start.
        callback();

        // Error events may or may not be sent before exit events.
        // We have to listen for this event for sure, but never rely on it.
        // Let's just send the errors to the user but not kill the process or something.
        _process.on('error', function (err) {
            console.demonicLog("[ERROR] Process returned an error. " + err.message);
            $this.emit('error', err);
        });

        // The process always gives exit before close, because close is called when
        // the stdio is closed. We need the stdio to finish all event handling so
        // it's better to use the close event for real stuff and the exit only to notify.
        _process.on('exit', _exitHandler);
        _process.on('close', function (code, signal) {
            if (code === null || code > 128) _unexpectedCloseHandler(signal);
            else if (code == 0) _normalCloseHandler();
            else _errorCloseHandler(code);
        });

        // For us the process is started when we first receive data of any kind.
        // The normal case will send "Debugger listening on port ..."
        var dataCb = function (data) {
            if (!_started) {
                if (_running) setTimeout(function () {
                    _debugger.connect(_debuggerPort);
                }, 10);
                _started = true;
            }
        };
        _process.stdout.once('data', dataCb);
        _process.stderr.once('data', dataCb);

        // And finally give that process to the debugger
        _debugger.attachProcess(_process);
    };

    var _disconnectClient = function (reason, callback) {
        console.demonicLog("[INFO] Disconnecting client...", reason);

        if (!_client) return callback ? callback() : 0;


        // Send all pending stuff
        if (_paused && _queue.length) {
            _resumeNotifications();
        }

        $this.once('sent', function disconnect() {
            // Everything is sent now. Just close the connection.
            _client.removeAllListeners('message');
            _client.close();
            _client = null;
            if (callback) callback();
        });

        _send({method: 'Inspector.detached', params: {reason: reason}});
        _pauseNotifications();
    };

    var _stopCallback = null;

    /**
     * Stop the debugged process and everything behind it.
     *
     * @param error
     * @param callback
     * @private
     */
    var _stop = function (error, callback) {
        if (callback) _stopCallback = callback;

        // If process is running, stop it.
        // Now, if this method is called and the process is still running, this means that
        // this function is called intentionally by the user (the process handlers would call it after it's not running anymore).
        // So maybe a good way is to kill the process and return and leave the handlers to call this function again.
        if (_process) {
            // But remove all event listeners anyway.

            if (_running) {
                // Here is the trick. Process is still running. Kill it.
                try {
                    _process.kill('SIGKILL');
                } catch (e) {
                }

                return;
            }

            // Just delete the process now. Whatever happened above, we don't need this instance anymore.
            _process.removeAllListeners();
            _process = null;
            _running = false;
        }

        if (!callback) callback = _stopCallback;

        _connected = false;
        _queue = [];
        _paused = false;

        // Generate the stop reason
        var reason = '';
        if (error) {
            if (typeof error === 'string') reason = error;
            else if (typeof error === 'object') {
                reason = error.name ? error.name + ': ' : '';
                reason += error.message ? error.message : (error.description ? error.description : 'No message');
            } else reason = 'Unknown reason';
        } else {
            reason = 'The processed finished. No errors detected.';
        }

        $this.emit('stop', reason);

        // Destroy the debugger instance.
        if (_debugger) {
            // Destroying is async because we have to wait for all events to get handled
            // by the debugger and sent to the agents before we can destroy everything.
            // Otherwise, some of the final console messages (for example) don't arrive on the client.
            _debugger.destroy(function () {
                // Destroy all agents now if any exist still.
                if (_agents) Object.keys(_agents).forEach(function (agent) {
                    _agents[agent].destroy();
                    delete _agents[agent];
                });

                // After destruction is ready, we are also ready to disconnect the client finally.
                _disconnectClient(reason, callback);
            });

            _debugger = null;
        } else {
            // Destroy all agents now if any exist still.
            if (_agents) Object.keys(_agents).forEach(function (agent) {
                _agents[agent].destroy();
                delete _agents[agent];
            });

            // There is no debugger to destroy.
            // Finally disconnect the client (if there is one) and call the callback.
            _disconnectClient(reason, callback);
        }
    };

    /**
     * Handles all kinds of exits, stops everything but waits for the close event to disconnect the client.
     *
     * @private
     */
    var _exitHandler = function () {
        _running = false;
    };

    /**
     * Normal close, without any errors.
     *
     * @private
     */
    var _normalCloseHandler = function () {
        _process = null;
        _running = false;

        console.demonicLog("\n\n------\n[INFO] Execution finished without errors.");

        _stop(null);
    };

    /**
     * Killed with a signal or something like that.
     *
     * @param signal
     * @private
     */
    var _unexpectedCloseHandler = function (signal) {
        _process = null;
        _running = false;

        console.demonicLog("\n\n------\n[INFO] Killed with signal: " + signal);

        _stop({
            name: 'Killed',
            message: 'Killed with signal: ' + signal
        });
    };

    /**
     * Error close handler. Error codes are described above.
     *
     * @param code
     * @private
     */
    var _errorCloseHandler = function (code) {
        _process = null;
        _running = false;

        console.demonicLog("\n\n------\n[INFO] Exited with status: " + code);

        if (statusCodes[code]) {
            _stop(statusCodes[code]);
        } else {
            // Unknown status
            _stop({
                name: 'Unknown Error',
                message: 'Unknown status code: ' + code
            });
        }
    };

    //
    // Public stuff

    /**
     * Handle all requests from the client
     *
     * @private
     */
    this.request = function (request) {
        var tmp = request.method.split('.');

        // Hack for profiler
        tmp[0] = tmp[0] === 'HeapProfiler' ? 'Profiler' : tmp[0];

        request.fullMethod = request.method;
        request.agent = tmp[0];
        request.method = tmp[1];

        if (!(request && request.id)) {
            // Totally wrong stuff. Ignore.
            console.demonicLog("[ERROR] Wrong request format.", request);
            return;
        }

        // No request if there no debugger.
        if (!_debugger) return;

        if (_agents && request && request.method && _agents[request.agent] && _agents[request.agent].hasMethod(request.method)) {
            // Handle the request
            _agents[request.agent][request.method](request.params, function (err, result) {
                _send({id: request.id, error: err, result: result});
            });
        } else if (request && request.id) {
            _send({id: request.id, error: 'Wrong request or not implemented method.'});
        }
    };

    this.attachClient = function (client) {
        // Start serving but don't send anything before debugger connects.
        _client = client;
        _pauseNotifications();
    };

    this.detachClient = function () {
        _client = null;
    };

    this.start = function (callback) {
        // Start the debuggee and wait for the debugger to connect
        async.waterfall([_fixDebuggerPort, _startDebuggee], callback);
    };

    this.stop = function (callback) {
        _stop(null, function () {
            callback();
        });
    };

    this.pause = function (callback) {
        if (_connected) _debugger.pause(callback);
        else callback(new Error("Not connected to the debugger."));
    };

    this.resume = function (callback) {
        if (_connected) _debugger.resume(callback);
        else callback(new Error("Not connected to the debugger."));
    };

    this.isConnected = function () {
        return _connected;
    };

    this.isRunning = function () {
        return _running;
    };

    this.isStarted = function () {
        return _started;
    };

    //
    // Initialize

    // Create the debugger
    _debugger = new Debugger(_debuggerPort, _config);

    _debugger.once('connect', function () {
        console.demonicLog('[INFO] Debugger connected.');
        _connected = true;
    });

    _debugger.on('ready', function () {
        // This is called when the inject is ready.
        // For now we don't need this event but let's leave it as a reminder.
        $this.emit('ready');
    });

    _debugger.on('pause', function () {
        $this.emit('pause');
    });

    _debugger.on('resume', function () {
        $this.emit('resume');
    });

    _debugger.once('close', function () {
        // When the debugger closes we have to close all connections and disable everything
        // from now on. First let's check if debugger closed because the process closed.
        if (!_running) return;

        setTimeout(function () {
            if (!_running) return;

            console.demonicLog('[ERROR] Debugger closed unexpectedly.');

            // Ok, so if running, we have to stop! GO ahead... first emit an error and stop.
            $this.emit('error', new Error('Debugger closed unexpectedly.'));

            _stop({
                name: 'Debugger Error',
                message: 'Debugger closed unexpectedly.'
            });
        }, 10);
    });

    _debugger.on('error', function (err) {
        if (!_running) return;

        setTimeout(function () {
            if (!_running) return;

            console.trace('[ERROR] Debugger returned error:', err);

            // On debugger error it's best to return the error to the user and do nothing.
            $this.emit('error', new Error('Debugger error: ' + JSON.stringify(err)));
        }, 0);
    });

    _debugger.on('appTree', function () {
        // Resume notifications when resource tree is ready
        _resumeNotifications();

        setTimeout(function () {
            // Also resume the script if the user didn't want a break.
            if (!_config.breakFirst && !_breakHandled) {
                console.demonicLog("[INFO] Executing script...\n------\n\n");
                _breakHandled = true;
                _debugger.resume(function (error) {
                    if (error) return $this.emit('error', error);
                });
            } else {
                console.demonicLog("[INFO] Executing script (paused)...\n------\n\n");
                _debugger.breakEventHandler.emitFirstBreak();
            }
        }, 5);
    });

    // Init agents first so they can start listening from now.
    for (var a in agents) {
        if (!agents.hasOwnProperty(a)) continue;

        _agents[a] = (typeof agents[a] === 'function') ? new agents[a](_debugger) : new FakeAgent(_debugger, agents[a]);
        _agents[a].on('notification', function (method, params) {
            _send({method: method, params: params});
        });
    }
}

util.inherits(Session, EventEmitter);
module.exports = Session;