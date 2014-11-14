var util = require('util'),
    path = require('path'),
    async = require('async'),
    Agent = require('../Agent'),
    agents = {};

/**
 This module will implement the full debugger API.
 https://developer.chrome.com/devtools/docs/protocol/1.1/debugger
 */

/**
 * Debugger Agent
 *
 * @param {Debugger} debugger_
 * @constructor
 * @augments Agent
 */
agents.Debugger = function (debugger_) {
    Agent.call(this, debugger_, {
        skipStackFrames: null, // TODO: maybe finish?
        setAsyncCallStackDepth: null, // TODO: maybe finish?
        setOverlayMessage: null
    });

    var $this = this;

    //
    // Public stuff

    this.enable = function (params, callback) {
        var onConnect = function () {
            callback();

            async.waterfall([
                $this._debugger.removeAllBreakpoints.bind($this._debugger),
                $this._debugger.reloadScripts.bind($this._debugger)
            ]);

            /*
            Not needed anymore
            function (callback) {
                //if (!$this._debugger.isRunning()) $this._debugger.breakEventHandler.sendBacktraceToFrontend(null);
                callback();
            }
             */
        };

        if (this._debugger.isConnected()) onConnect();
        else this._debugger.once('connect', onConnect);
    };

    this.disable = function (params, callback) {
        if (this._debugger.isConnected()) this._debugger.close();
        callback();
    };

    this.pause = function (params, callback) {
        this._debugger.pause(callback);
    };

    this.resume = function (params, callback) {
        this._debugger.resume(callback);
    };

    this.stepOver = function (params, callback) {
        this._debugger.stepOver(callback);
    };

    this.stepInto = function (params, callback) {
        this._debugger.stepInto(callback);
    };

    this.stepOut = function (params, callback) {
        this._debugger.stepOut(callback);
    };

    this.canSetScriptSource = function (params, callback) {
        callback(null, {result: true});
    };

    this.setPauseOnExceptions = function (params, callback) {
        async.eachSeries([['all', params.state == 'all'], ['uncaught', params.state == 'uncaught']], function (arg, next) {
           $this._debugger.setExceptionBreak(arg[0], arg[1], next);
        }, callback);
    };

    this.continueToLocation = function (params, callback) {
        this._debugger.continueToLocation(params.location.scriptId, params.location.lineNumber, params.location.columnNumber, callback);
    };

    this.getScriptSource = function (params, callback) {
        this._debugger.getScriptSource(params.scriptId, function (err, source) {
            if (err) return callback(err);
            return callback(null, {scriptSource: source});
        });
    };

    this.setScriptSource = function (params, callback) {
        this._debugger.setScriptSource(params['scriptId'], params['scriptSource'], callback);
    };

    this.setBreakpointByUrl = function (params, callback) {
        if (params['urlRegex'] !== undefined) {
            // DevTools protocol defines urlRegex parameter,
            // but the parameter is not used by the front-end.
            return callback('Error: setBreakpointByUrl using urlRegex is not implemented.');
        }

        this._debugger.setBreakpoint(
            this._debugger.helper.inspectorUrlToV8Name(params.url),
            params.lineNumber,
            params.columnNumber,
            params.condition,
            callback
        );
    };

    this.removeBreakpoint = function (params, callback) {
        this._debugger.clearBreakpoint(params.breakpointId, callback);
    };

    this.setBreakpointsActive = function (params, callback) {
        this._debugger.getBreakpoints(function (error, response) {
            if (error) return callback(error);

            async.eachSeries(response.breakpoints, function setBreakpointState(bp, next) {
                $this._debugger.changeBreakpoint(bp.number, params.active, next);
            }, callback);
        });
    };

    this.evaluateOnCallFrame = function (params, callback) {
        this._debugger.evaluateOnFrame(params.callFrameId, params.expression, function (err, result) {
            if (err) return callback(null, {
                result: err,
                wasThrown: true
            });

            callback(null, {
                result: result,
                wasThrown: false
            });
        });
    };

    this.getFunctionDetails = function (params, callback) {
        this._debugger.getFunctionDetails(params['functionId'], function (err, scriptId, line, column, name) {
            if (err) return callback(err);

            callback(null, {
                details: {
                    location: {
                        scriptId: String(scriptId),
                        lineNumber: line,
                        columnNumber: column
                    },
                    name: name,

                    // There is a list of scope ids in responseBody.scopes, but not scope
                    // details :( // We need to issue `scopes` request to fetch scopes
                    // details, but we don't have frame number where the function was defined.
                    // Let's leave the scopeChain empty for now.
                    scopeChain: []
                }
            })
        });
    };

    this.setVariableValue = function (params, callback) {
        var name = params['name'];
        var value = params['newValue'];
        var scope = params['scopeNumber'];
        var frameId = params['callFrameId'];

        this._debugger.setVariableValue(name, value, scope, frameId, callback);
    };

    this.setSkipAllPauses = function (params, callback) {
        if (params['skipped']) callback('Not implemented.'); // TODO: implement
        else callback();
    };

    this.restartFrame = function (params, callback) {
        this._debugger.setVariableValue(params['callFrameId'], callback);
    };

    //
    // Events and handlers

    this._debugger.on('pause', function (data) {
        // Debugger.paused notification
        $this.emit('notification', 'Debugger.paused', data);
    });

    this._debugger.on('resume', function (data) {
        // Debugger.resumed notification
        $this.emit('notification', 'Debugger.resumed', data);
    });

    this._debugger.on('scriptParsed', function (data) {
        // Debugger.paused notification
        $this.emit('notification', 'Debugger.scriptParsed', data);
    });
};

util.inherits(agents.Debugger, Agent);
module.exports = agents.Debugger;

agents.Debugger.prototype._methods = [
    'enable',
    'disable',
    'resume',
    'pause',
    'stepOver',
    'stepInto',
    'stepOut',
    'canSetScriptSource',
    'setSkipAllPauses',
    'setVariableValue',
    'restartFrame',
    'getFunctionDetails',
    'evaluateOnCallFrame',
    'setOverlayMessage',
    'setBreakpointsActive',
    'removeBreakpoint',
    'setScriptSource',
    'getScriptSource',
    'setBreakpointByUrl',
    'continueToLocation',
    'setPauseOnExceptions',
    'setAsyncCallStackDepth',
    'skipStackFrames'
];