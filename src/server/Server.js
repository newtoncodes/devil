var util = require('util'),
    spawn = require('child_process').spawn,
    EventEmitter = require('events').EventEmitter,
    async = require('async'),
    WebSockets = require('ws').Server,

    Session = require('./Session');

Object.defineProperty(Error.prototype, 'toJSON', {
    value: function () {
        var alt = {};

        Object.getOwnPropertyNames(this).forEach(function (key) {
            alt[key] = this[key];
        }, this);

        return alt;
    },
    configurable: true,
    enumerable: false
});

/**
 * Server class
 *
 * @param {string} host
 * @param {number} port
 * @constructor
 */
function Server (host, port) {
    var _port = port || 9999;
    var _host = host || '127.0.0.1';

    var _file = null;
    var _args = null;
    var _hidden = [];
    var _v8port = 5858;
    var _break = false;
    var _preload = true;
    var _mute = false;
    var _saveFiles = false;

    var _ws = null;
    var _token = null;
    var _session = null;
    var _sessionErrorSent = false;
    var _sessionReady = false;

    var _queue = [];

    var _client = null;
    var _devtools = null;

    var _reason = null;

    var $this = this;

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

    var argsRegex = /(?:[^\s"]+|"[^"]*")+/g;

    /**
     * Public methods, accessible from the client
     *
     * @type {{run: Function, stop: Function, pause: Function, resume: Function}}
     * @private
     */
    var _methods = {
        run: function (params, callback) {
            _file = params.file || null;
            _args = params.args || '';
            _hidden = params.hidden || [];
            _v8port = params.v8port || 5858;
            _break = params.break || false;
            _preload = params.preload || true;
            _mute = params.mute || false;
            _saveFiles = params.saveFiles || false;

            if (!_file) {
                return callback("Please select a file path to execute.");
            }

            var options = {
                mute: _mute,
                breakFirst: _break,
                preload: _preload,
                saveLiveEdit: _saveFiles,
                stackTraceLimit: 10, // TODO: make a setting in future
                hidden: _hidden,
                debuggerPort: _v8port
            };

            // Parse the arguments
            _args = _args.match(argsRegex);
            if (!_args) _args = [];

            // Stop a running instance
            if (_session) {
                if (_session.isRunning()) {
                    _session.stop(function (err) {
                        if (err) return callback(err);

                        _reason = null;
                        _sessionReady = false;
                        _sessionErrorSent = false;
                        _session = new Session(_file, _args, options);
                        _session.on('error', _sessionErrorHandler);
                        _session.on('pause', _sessionPauseHandler);
                        _session.on('resume', _sessionResumeHandler);
                        _session.once('stop', _sessionStopHandler);
                        _session.once('ready', function () {
                            _sessionReady = true;
                        });
                        _session.start(callback);
                    });

                    return;
                }

                _session = null;
            }

            _reason = null;
            _sessionReady = false;
            _sessionErrorSent = false;
            _session = new Session(_file, _args, options);
            _session.on('error', _sessionErrorHandler);
            _session.on('pause', _sessionPauseHandler);
            _session.on('resume', _sessionResumeHandler);
            _session.once('stop', _sessionStopHandler);
            _session.once('ready', function () {
                _sessionReady = true;
            });
            _session.start(callback);
        },

        stop: function (params, callback) {
            if (!_session || !_session.isRunning()) return callback(new Error("There is no session running."));
            callback();

            _session.stop(function (err) {
                _session = null;
            });
        },

        pause: function (params, callback) {
            _session.pause(callback);
        },

        resume: function (params, callback) {
            _session.resume(callback);
        }
    };

    /**
     * Send a message to the Devil client
     *
     * @param {Object} message
     * @private
     */
    var _send = function _send (message) {
        if (message.id) {
            // Response
            if (!_client) return;

            if (message.error) {
                if (typeof message.error === 'string') message.error = {
                    message: message.error, name: 'ServerError'
                };
            }
        } else {
            // Notification
            if (!_client) {
                console.log("NO CLIENT");
                _queue.push(message);
                return;
            }
        }

        var payload = typeof message == 'string' ? message : JSON.stringify(message);
        _client.send(payload);
    };

    /**
     * Request handler for the Devil client messages
     *
     * @param {string} message
     * @private
     */
    var _clientRequestHandler = function _clientRequestHandler (message) {
        try {
            var request = JSON.parse(message);
        } catch (e) {
            console.error("[ERROR] Cannot parse JSON request: " + message);
            return;
        }

        if (request && request.method && _methods[request.method]) {
            // Handle the request
            if (!request.params) request.params = {};
            console.log("CALL", request.method, request.params);
            _methods[request.method].call($this, request.params, function (err, result) {
                console.log("CALLBACK");
                _send({id: request.id, error: err, result: result})
            });
        } else if (request && request.id) {
            _send({id: request.id, error: 'Wrong request or not implemented method.'});
        }
    };

    /**
     * Request handler for the devtools client
     *
     * @param {string} message
     * @private
     */
    var _devtoolsRequestHandler = function _devtoolsRequestHandler (message) {
        try {
            var request = JSON.parse(message);
        } catch (e) {
            console.error("[ERROR] Cannot parse JSON request: " + message);
            return;
        }

        if (!_sessionReady) {
            _session.once('ready', function () {
                _session.request(request);
            });
        } else {
            _session.request(request);
        }
    };

    /**
     * Connection handler for both kinds of clients.
     *
     * @param {Object} client
     * @returns {boolean}
     * @private
     */
    var _connectionHandler = function _connectionHandler (client) {
        // Try to connect this client and reject him if the session is full
        console.demonicLog("[INFO] New client connected.");

        if (_devtools) {
            console.demonicLog("[WARNING] No room for a new client. Disconnect.");
            client.close();
            return false;
        }

        if (_client) {
            // Devtools connection
            console.demonicLog("[INFO] It's the DevTools.");

            if (!_session || (_session.isStarted() && !_session.isRunning())) {
                console.demonicLog('[WARNING] There is no debugger or debuggee started yet. DevTools is not allowed to connect.');

                if (_reason) {
                    for (var ii = 0; ii < 10; ii++) client.send(JSON.stringify({id: ii}));
                    client.send(JSON.stringify({method: 'Inspector.detached', params: {reason: _reason}}), function () {
                        client.close();
                    });

                    _reason = null;
                } else client.close();

                return false;
            }

            var url = client.upgradeReq.url;

            if ('/' + _token !== url) {
                console.demonicLog('[WARNING] DevTools does not have the same auth token. Hack attempt or wtf?');
                client.close();
                return false;
            }

            _devtools = client;
            _devtools.on('message', _devtoolsRequestHandler);
            _devtools.once('close', function () {
                console.demonicLog('[INFO] Client (devtools) disconnected.');
                _devtools.removeAllListeners();
                _devtools = null;
                if (_session) _session.detachClient();
            });

            _session.attachClient(_devtools);
        } else {
            // Normal connection
            console.demonicLog("[INFO] It's a Devil client.");

            // Generate a fresh token since we've got the first client connection.
            _token = "";
            var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            for (var i = 0; i < 32; i++) _token += chars.charAt(Math.floor(Math.random() * chars.length));

            // Register the client
            _client = client;
            _client.once('message', function (msg, flags) {
                if (msg != 'Greetings, Master!') return _client.close();
                _client.send('Don\'t speak to me, scum, I am the Devil!');
                _send({
                    method: 'connected',
                    params: {
                        token: _token
                    }
                });

                _client.on('message', _clientRequestHandler);
            });

            _client.on('close', function () {
                console.demonicLog('[INFO] Client disconnected.');
                _client = null;
                if (_devtools) {
                    _devtools.close();
                    _devtools = null;
                }
            });
        }
    };

    /**
     * Error handler
     *
     * @param {Error|string} error
     * @private
     */
    var _sessionErrorHandler = function _sessionErrorHandler (error) {
        if (_sessionErrorSent) return;

        _send({method: 'error', params: error});
        _sessionErrorSent = true;
    };

    /**
     * Stop handler
     *
     * @param {string} reason
     * @private
     */
    var _sessionStopHandler = function _sessionStopHandler (reason) {
        _reason = reason;
        _send({method: 'stop', params: {reason: reason}});
    };

    /**
     * Pause handler
     *
     * @private
     */
    var _sessionPauseHandler = function _sessionPauseHandler () {
        _send({method: 'pause'});
    };

    /**
     * Resume handler
     *
     * @private
     */
    var _sessionResumeHandler = function _sessionResumeHandler () {
        _send({method: 'resume'});
    };

    /**
     * Start
     *
     * @param {Function} callback
     */
    this.start = function (callback) {
        var _calledBack = false;
        var _callback = function (err) {
            if (!_calledBack) {
                callback(err);
                _calledBack = true;
            } else {
                if (err) {
                    console.demonicLog("[ERROR] ", err.message);
                    //$this.emit('error', err);
                }
            }
        };

        _isPortAvailable(_port, function (err, isFree) {
            if (err) return _callback(err);
            if (!isFree) return _callback(new Error("Port " + _port + " is not available. Please choose another port (see help for more info)."));

            _ws = new WebSockets({port: _port, host: _host});

            _ws.once('listening', function () {
                console.demonicLog("[INFO] Server listening on " + _host + ":" + _port + ".");
                _callback();
            });

            _ws.on('close', function () {
                console.demonicLog("[ERROR] Server closed unexpectedly.");
                _callback(new Error("Server closed unexpectedly."));
            });

            _ws.on('error', function (error) {
                console.demonicLog("[ERROR] Failed to start server on " + _host + ":" + _port + ". " + error.message);
                _callback(error);
            });

            _ws.on('connection', _connectionHandler);
        });
    };
}

util.inherits(Server, EventEmitter);
module.exports = Server;