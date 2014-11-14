var async = require('async');
var v8Helper = require('./Helper');

var SCOPE_ID_MATCHER = /^scope:(\d+):(\d+)$/;

var v8 = {};

/**
 * CallFramesProvider class. Uses a v8.Debugger
 * Refactored from node-inspector
 * https://github.com/node-inspector/node-inspector
 *
 * @param {v8.DebuggerClient} debuggerClient
 * @param {number} [stackTraceLimit=10]
 * @constructor v8.CallFramesProvider
 */
v8.CallFramesProvider = function (debuggerClient, stackTraceLimit) {
    var $this = this;

    //
    // Private stuff

    var _stackTraceLimit = stackTraceLimit || 10;
    var _debugger = debuggerClient;

    var _convertBacktraceToCallFrames = function (backtraceResponseBody, backtrackResponseRefs, handleResponse) {
        var debuggerFrames = backtraceResponseBody.frames || [];
        async.map(debuggerFrames, _convertDebuggerFrameToInspectorFrame.bind(this, backtrackResponseRefs), handleResponse);
    };

    var _convertDebuggerFrameToInspectorFrame = function (backtrackResponseRefs, frame, callback) {
        var scopeChain = frame['scopes'].map(function (scope) {
            return {
                object: {
                    type: 'object',
                    objectId: 'scope:' + frame.index + ':' + scope.index,
                    className: 'Object',
                    description: 'Object'
                },
                type: v8Helper.v8ScopeTypeToString(scope.type)
            };
        });

        callback(null, {
            callFrameId: frame.index.toString(),
            functionName: frame.func['inferredName'] || frame.func.name,
            location: {
                scriptId: v8Helper.v8ScriptIdToInspectorId(frame.func.scriptId),
                lineNumber: frame.line,
                columnNumber: frame.column
            },
            scopeChain: scopeChain,
            this: v8Helper.v8RefToInspectorObject(frame.receiver)
        });
    };

    //
    // Public stuff

    /**
     * Fetch call frames
     *
     * @param {Function} handleResponse
     */
    this.fetchCallFrames = function (handleResponse) {
        _debugger._request('backtrace', {inlineRefs: true, fromFrame: 0, toFrame: _stackTraceLimit}, function (err, responseBody, responseRefs) {
            if (err) return handleResponse(err);

            _convertBacktraceToCallFrames(responseBody, responseRefs, handleResponse);
        });
    };

    /**
     * Resolve scope ID
     *
     * @param {string} objectId
     * @param {Function} callback
     */
    this.resolveScopeId = function (objectId, callback) {
        var scopeIdMatch = SCOPE_ID_MATCHER.exec(objectId);
        if (!scopeIdMatch) throw new Error('Invalid scope id "' + objectId + '"');
        _debugger._request('scope', {number: Number(scopeIdMatch[2]), frameNumber: Number(scopeIdMatch[1])}, function (err, result) {
            if (err) callback(err);
            else callback(null, result.object.ref);
        });
    };

    /**
     * Check scope ID
     *
     * @param {string} objectId
     * @return {boolean}
     */
    this.isScopeId = function (objectId) {
        return SCOPE_ID_MATCHER.test(objectId);
    };
    
    this.destroy = function () {
        _debugger = null;
    }
};

module.exports = v8.CallFramesProvider;