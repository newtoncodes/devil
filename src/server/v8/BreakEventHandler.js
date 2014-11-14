var v8Helper = require('./Helper');

var v8 = {};

/**
 * BreakEventHandler class. Uses a v8.Debugger
 * Refactored from node-inspector
 * https://github.com/node-inspector/node-inspector
 *
 * @param {v8.DebuggerClient} debuggerClient
 * @constructor v8.BreakEventHandler
 */
v8.BreakEventHandler = function (debuggerClient) {
    var $this = this;

    //
    // Private stuff

    /**
     * @type {Function}
     * @private
     */
    var _callbackForNextBreak = null;

    /**
     * @type {v8.DebuggerClient}
     * @private
     */
    var _debugger = null;

    /**
     * @type {v8.CallFramesProvider}
     * @private
     */
    var _callFramesProvider = null;

    var _firstBreak = null;

    //
    // Handlers

    var _breakHandler = function (obj) {
        var scriptId = obj.script.id,
            hitBreakpoints = obj.breakpoints,
            source = _debugger.hasOwnProperty('scriptManager') && _debugger['scriptManager'].findScriptByID(scriptId),
            callback;

        var ignore = false;

        // Source is undefined when the breakpoint was in code eval()-ed via
        // console or eval()-ed internally by node inspector.
        // We could send backtrace in such case, but that isn't working well now.
        // V8 is reusing the same scriptId for multiple eval() calls and DevTools
        // front-end does not update the displayed source code when a content
        // of a script changes.
        // The following solution - ignore the breakpoint and resume the
        // execution - should be good enough in most cases.
        if (!source || source.hidden) ignore = true;

        // In the case of "break on uncaught exception" triggered by
        // "TypeError: undefined is not a function", the exception is
        // thrown by a V8 builtin CALL_NON_FUNCTION defined in
        // v8/src/runtime.js. Thus, the script id of the event is not know
        // by Node Inspector, but the break even must not be ignored.
        // See https://github.com/node-inspector/node-inspector/issues/344
        if (obj['exception']) ignore = false;

        if (ignore) {
            return _debugger.stepOut();
        }

        if ($this.callbackForNextBreak) {
            callback = $this.callbackForNextBreak;
            $this.callbackForNextBreak = null;
            callback(obj);
            return;
        }

        if ($this.continueToLocationBreakpointId !== null) {
            _debugger.clearBreakpoint($this.continueToLocationBreakpointId, function (err) {
                if (err) {
                    _debugger.emit('runtimeError', {
                        type: 'warning',
                        error: (typeof err === 'string') ? err : err.message
                    });

                    _debugger.emit('info', {type: 'warning', text: (typeof err === 'string') ? err : err.message});
                }
                else $this.continueToLocationBreakpointId = null;
            });
        }

        $this.sendBacktraceToFrontend(obj['exception'], hitBreakpoints);
    };

    _debugger = debuggerClient;
    _debugger.on('break', _breakHandler);
    _debugger.on('exception', _breakHandler);
    _callFramesProvider = _debugger.callFramesProvider;

    //
    // Public stuff

    this.continueToLocationBreakpointId = null;

    Object.defineProperties(this, {
        callbackForNextBreak: {
            get: function () {
                return _callbackForNextBreak;
            },
            set: function (value) {
                if (value && _callbackForNextBreak)
                    throw new Error('Cannot set multiple callbacks for the next break.');
                _callbackForNextBreak = value;
            }
        }
    });

    /**
     * @param {Function} callback
     */
    this.fetchCallFrames = function (callback) {
        if (!_debugger) throw new Error("Debugger is not attached");

        _callFramesProvider.fetchCallFrames(callback);
    };

    /**
     * @param {Object} exception
     * @param {Array.<number>} [hitBreakpoints]
     */
    this.sendBacktraceToFrontend = function (exception, hitBreakpoints) {
        if (!_debugger) throw new Error("Debugger is not attached");

        this.fetchCallFrames(function (error, result) {
            // Notify for errors during the runtime.
            if (exception) exception = v8Helper.v8RefToInspectorObject(exception);

            if (exception || error) {
                _debugger.emit('runtimeError', {
                    type: 'error',
                    error: error || exception,
                    callFrames: result
                });
            }

            if (!error) {
                var data = {
                    callFrames: result,
                    reason: exception ? 'exception' : 'other',
                    data: exception ? exception : null,
                    hitBreakpoints: hitBreakpoints
                };

                if (_firstBreak) _debugger.emit('pause', data);
                else _firstBreak = data;
            }
        });
    };

    this.emitFirstBreak = function () {
        if (!_firstBreak || _firstBreak === true) {
            _firstBreak = true;
            return;
        }

        _debugger.emit('pause', _firstBreak);
    };

    this.destroy = function () {
        _debugger = null;
    }
};

module.exports = v8.BreakEventHandler;