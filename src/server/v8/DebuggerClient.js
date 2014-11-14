var util = require('util'),
    net = require('net'),
    EventEmitter = require('events').EventEmitter,
    Protocol = require('_debugger').Protocol,
    async = require('async'),

    CallFramesProvider = require('./CallFramesProvider'),
    BreakEventHandler = require('./BreakEventHandler'),

    v8Helper = require('./Helper'),
    v8 = {};

/**
 * @constructor v8.Debugger
 * @augments EventEmitter
 */
v8.DebuggerClient = function (port, options) {
    var $this = this;

    if (!options) options = {};
    options.stackTraceLimit = options.stackTraceLimit || 10;
    options.hidden = options.hidden || [];

    //
    // Private stuff

    var _port = port;
    var _running = false;
    var _connected = false;
    var _socket = null;
    var _protocol = null;
    var _error = null;
    var _reason = 'Debugger was restarted.';

    var _callbacks = {
        id: 1,
        registry: {},

        add: function (fn) {
            var id = this.id++;
            this.registry[id] = fn || (function () {
                // Dummy function
            });
            return id;
        },

        execute: function (id, args) {
            if (!this.registry[id]) return;
            this.registry[id].apply(null, args);
            delete this.registry[id];
        },

        remove: function (id) {
            if (!this.registry[id]) return;
            delete this.registry[id];
        }
    };
    
    var _send = function (data) {
        if (!_connected) return;
        try {
            // Ensure that we never get an unwanted error.
            _socket.write('Content-Length: ' + Buffer.byteLength(data, 'utf8') + '\r\n\r\n' + data, 'utf8', function (err) {
                if (err) return;
            });
        } catch (e) {}
    };

    var _request = function (command, params, callback) {
        if (!_connected) {
            var err = new Error(_reason);
            err.name = 'NoConnection';
            return callback(err);
        }

        var message = {
            seq: 0,
            type: 'request',
            command: command
        };

        if (typeof callback === 'function') {
            message.seq = _callbacks.add(callback);
        }

        if (params) {
            Object.keys(params).forEach(function (key) {
                message[key] = params[key];
            });
        }

        _send(JSON.stringify(message));
    };

    var _close = function () {
        if (!_connected) return;
        _socket.end();
    };

    var _setup = function () {
        _protocol = new Protocol();
        _protocol.onResponse = _responseHandler;

        _socket = net.createConnection(_port);
        _socket.on('connect', _connectHandler);
        _socket.on('data', _protocol.execute.bind(_protocol));
        _socket.on('error', _errorHandler);

        _socket.on('end', function () {
            $this.close.bind($this);
        });

        _socket.on('close', _closeHandler);
        _socket.setEncoding('utf8');
    };

    /**
     * Send a request to the debugger
     * Copied from node-inspector
     * https://github.com/node-inspector/node-inspector
     *
     * @param {string} command
     * @param {!Object} args
     * @param {Function} callback
     */
    this._request = function (command, args, callback) {
        if (typeof callback !== 'function') {
            callback = function (error) {
                if (!error) return;
                console.log('Warning: ignored V8 debugger error. %s', error);
            };
        }

        // Note: we must not add args object if it was not sent.
        // E.g. resume (V8 request 'continue') does no work
        // correctly when args are empty instead of undefined
        if (args && args.maxStringLength == null) args.maxStringLength = 10000;

        _request(command, {arguments: args}, function (response) {
            var refsLookup;
            if (!response.success) callback(response.message);
            else {
                refsLookup = {};
                if (response['refs']) response['refs'].forEach(function (r) {
                    refsLookup[r.handle] = r;
                });
                callback(null, response.body, refsLookup);
            }
        });
    };

    //
    // Handlers

    var _connectHandler = function () {
        if (_connected) return;

        _connected = true;
        _reason = null;

        // We need to update _running state before we continue with debugging.
        // Send the dummy request so that we can read the state from the response.
        $this._request('version', {}, function (error) {
            if (error) return $this.emit('error', error);

            $this.emit('connect');
        });
    };

    var _errorHandler = function (err) {
        if (err.code == 'ECONNREFUSED') {
            err.help = 'Is node running with --debug port ' + _port + '?';
        } else if (err.code == 'ECONNRESET') {
            err.help = 'Check there is no other debugger client attached to port ' + _port + '.';
        }

        _error = err.toString();
        if (err.help) _error += '. ' + err.help;

        $this.emit('error', new Error(_error));
    };

    var _closeHandler = function (err) {
        _port = null;
         _connected = false;
         _socket = null;
        _error = null;

        $this.emit('close', err ? _error : 'Debugged process exited.');
    };

    var _responseHandler = function (message) {
        var obj = message.body;
        if (typeof obj.running === 'boolean') _running = obj.running;

        if (obj.type === 'response' && obj['request_seq'] > 0) {
            console.log('Response: ' + message.body);
            _callbacks.execute(obj['request_seq'], [obj]);
        } else if (obj.type === 'event') {
            console.log('Event: ' + message.body);
            if (['break', 'exception'].indexOf(obj.event) > -1) _running = false;
            if (['break', 'afterCompile', 'exception'].indexOf(obj.event) != -1) {
                $this.emit(obj.event, obj.body);
            }
        } else {
            console.log('Unknown: ' + message.body);
        }
    };

    //
    // Public stuff

    this.callFramesProvider = new CallFramesProvider(this, options.stackTraceLimit);
    this.breakEventHandler = new BreakEventHandler(this);

    /**
     * Check if we are connected to the debugger
     *
     * @returns {boolean}
     */
    this.isConnected = function () {
        return _connected;
    };

    /**
     * Check if execution is running
     *
     * @returns {boolean}
     */
    this.isRunning = function () {
        return _connected && _running;
    };

    /**
     * Connect to the debugger
     */
    this.connect = function (port) {
        if (port) _port = port;
        console.log("Connecting...");
        _setup();
    };

    /**
     * Close the connection
     */
    this.close = function () {
        _close();
    };

    this.evaluate = function (expression, callback) {
        this._request('evaluate', {expression: expression, global: true}, function (err, result, refs) {
            // Errors from V8 are actually just messages, so we need to fill them out a bit.
            if (err) {
                err = v8Helper.v8ErrorToInspectorError(err);
                $this.emit('evalError', err);
                return callback(err);
            }

            callback(null, result, refs);
        });
    };

    this.evaluateOnFrame = function (frameId, expression, callback) {
        this._request('evaluate', {expression: expression, frame: Number(frameId)}, function (err, result, refs) {
            // Errors from V8 are actually just messages, so we need to fill them out a bit.
            if (err) {
                err = v8Helper.v8ErrorToInspectorError(err);
                $this.emit('evalError', err);
                return callback(err);
            }

            callback(null, result, refs);
        });
    };

    var _sendContinue = function (stepAction, callback) {
        var args = stepAction ? {stepaction: stepAction} : undefined;
        $this._request('continue', args, function (error) {
            if (callback) callback(error);
            if (!error) $this.emit('resume');
        });
    };

    this.getBreakpoints = function (callback) {
        this._debugger.request('listbreakpoints', {}, callback);
    };

    this.setBreakpoint = function (url, line, column, condition, callback) {
        this._request('setbreakpoint', {
            type: 'script',
            target: url,
            line: line,
            column: column,
            condition: condition
        }, function (error, response) {
            if (error != null) return callback(error);

            callback(null, {
                breakpointId: response.breakpoint.toString(),
                locations: response['actual_locations'].map(function (v8loc) {
                    return {
                        scriptId: v8loc.script_id.toString(),
                        lineNumber: v8loc.line,
                        columnNumber: v8loc.column
                    };
                })
            });
        });
    };
    
    this.changeBreakpoint = function (id, status, callback) {
        $this._debugger.request('changebreakpoint', {breakpoint: id, enabled: status}, callback);
    };

    this.clearBreakpoint = function (breakpointId, callback) {
        this._request('clearbreakpoint', {breakpoint: breakpointId}, callback);
    };

    this.removeOneBreakpoint = function (bp, next) {
        this.clearBreakpoint(bp.number, function (error) {
            if (error) console.demonicLog('Warning: cannot remove old breakpoint %d. %s', bp.number, error);
            next();
        });
    };

    this.removeAllBreakpoints = function (callback) {
        this._request('listbreakpoints', {}, function (err, response) {
            if (err) {
                console.demonicLog('Warning: cannot remove old breakpoints. %s', err);
                callback();
                return;
            }

            async.eachSeries(response.breakpoints, $this.removeOneBreakpoint.bind($this), callback);
        });
    };

    this.pause = function (callback) {
        this._request('suspend', {}, function (error, result) {
            callback(error, result);
            if (!error) $this.breakEventHandler.sendBacktraceToFrontend(null);
        });
    };

    this.resume = function (callback) {
        _sendContinue(undefined, callback);
    };

    this.stepOver = function (callback) {
        _sendContinue('next', callback);
    };

    this.stepInto = function (callback) {
        _sendContinue('in', callback);
    };

    this.stepOut = function (callback) {
        _sendContinue('out', callback);
    };

    this.continueToLocation = function (scriptId, line, column, callback) {
        this._request('setbreakpoint', {
            type: 'scriptId',
            target: v8Helper.inspectorScriptIdToV8Id(scriptId),
            line: line,
            column: column
        }, function (error, response) {
            if (error != null) return callback(error);

            $this.breakEventHandler.continueToLocationBreakpointId = response.breakpoint;
            $this.resume(callback);
        });
    };

    this.setExceptionBreak = function setExceptionBreak(type, enabled, callback) {
        this._request('setexceptionbreak', {type: type, enabled: enabled}, callback);
    };

    this.setVariableValue = function (name, value, scopeNumber, callFrameId, callback) {
        this.evaluate('process.version', function (err, version) {
            var match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(version);
            if (!match) return false;
            if (
                match[1] > 0 || // v1+
                (match[2] == 10 && match[3] >= 12) || // v0.10.12+
                (match[2] == 11 && match[3] >= 2) ||  // v0.11.2+
                (match[2] >= 12) // v0.12+
            ) {
                var value = v8Helper.inspectorValueToV8Value(value);

                $this._request('setVariableValue', {
                    name: name,
                    scope: {
                        number: Number(scopeNumber),
                        frameNumber: Number(callFrameId)
                    },
                    newValue: value
                }, function (err, result) {
                    callback(err, result);
                });
            } else {
                callback(
                    'V8 engine in node version ' + version +
                    ' does not support setting variable value from debugger.\n' +
                    ' Please upgrade to version v0.10.12 (stable) or v0.11.2 (unstable)' +
                    ' or newer.');
            }
        });
    };

    this._destroy = function () {
        this.removeAllListeners();

        if (_socket) {
            _socket.removeAllListeners();
            _socket.end();
        }

        if (_protocol && _protocol.removeAllListeners) {
            _protocol.removeAllListeners();
        }

        _running = false;
        _connected = false;
        _socket = null;
        _protocol = null;
        _error = null;
        _reason = 'Debugger was stopped.';
        _callbacks = {};


        this.breakEventHandler.destroy();
        this.callFramesProvider.destroy();
    }
};

util.inherits(v8.DebuggerClient, EventEmitter);
module.exports = v8.DebuggerClient;
