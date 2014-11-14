var util = require('util'),
    path = require('path'),
    EventEmitter = require('events').EventEmitter,
    async = require('async'),
    fs = require('fs'),
    DebuggerClient = require('./v8/DebuggerClient'),
    v8Helper = require('./v8/Helper'),
    ScriptManager = require('./ScriptManager'),
    ScriptStorage = require('./ScriptStorage');

function escapeRegex(str) {
    return str.replace(/([/\\.?*()^${}|[\]])/g, '\\$1');
}

var MODULE_HEADER = '(function (exports, require, module, __filename, __dirname) { ';
var MODULE_TRAILER = '\n});';
var MODULE_WRAP_REGEX = new RegExp(
    '^' + escapeRegex(MODULE_HEADER) +
    '([\\s\\S]*)' +
    escapeRegex(MODULE_TRAILER) + '$'
);

var newError = function (message) {
    var nameMatch = /^([^:]+):/.exec(message);

    return {
        type: 'object',
        objectId: 'ERROR',
        className: nameMatch ? nameMatch[1] : 'Error',
        description: message,
        name: nameMatch ? nameMatch[1] : 'Error',
        message: message
    };
};

var v8ResultToInspectorResult = function (result) {
    var subtype,
        inspectorResult;
    if (['object', 'function', 'regexp', 'error'].indexOf(result.type) > -1) {
        return v8Helper.v8RefToInspectorObject(result);
    }

    if (result.type == 'null') {
        // workaround for the problem with front-end's setVariableValue
        // implementation not preserving null type
        result.value = null;
        subtype = 'null';
    }

    inspectorResult = {
        type: result.type,
        subtype: subtype,
        value: result.value,
        description: String(result.value)
    };

    return inspectorResult;
};

var v8ObjectToInspectorProperties = function (obj, refs, ownProperties, accessorPropertiesOnly) {
    var proto = obj.protoObject,
        props = obj.properties || [];

    props = props.map(function (prop) {
        var ref = refs[prop.ref];
        return {
            name: String(prop.name),
            writable: !(prop.attributes & 1 << 0),
            enumerable: !(prop.attributes & 1 << 1),
            configurable: !(prop.attributes & 1 << 2),
            value: v8ResultToInspectorResult(ref)
        };
    });

    if (ownProperties && proto) {
        proto = refs[proto.ref];
        if (proto.type !== 'undefined') {
            props.push({
                name: '__proto__',
                value: v8Helper.v8RefToInspectorObject(proto),
                writable: true,
                configurable: true,
                enumerable: false,
                isOwn: true
            });
        }
    }

    props = props.filter(function (prop) {
        /*
         Node.js does not return get/set property descriptors now (v0.11.11),
         therefore we can't fully implement 'accessorPropertiesOnly'.
         See https://github.com/joyent/node/issues/7139
         */
        var isAccessorProperty = ('get' in prop || 'set' in prop);

        return accessorPropertiesOnly ? isAccessorProperty : !isAccessorProperty;
    });

    return props;
};

function getFullJson (properties, refs) {
    return properties.filter(function isArrayIndex(p) {
        return /^\d+$/.test(p.name);
    }).map(function resolvePropertyValue(p) {
        return refs[p.ref].value;
    }).join('').trim();
}

/**
 * Debugger class
 *
 * This class implements all the logic needed to debug an application.
 * It combines the standard v8 debugger client with inject functionality.
 * Implements wrappers for all kinds of debug needs.
 *
 * @params {ChildProcess} child
 * @params {v8.DebuggerClient} client
 * @constructor
 * @augments v8.DebuggerClient
 */
function Debugger (port, options) {
    DebuggerClient.call(this, port, options);
    var $this = this;

    /**
     * @type {ScriptManager}
     */
    this.scriptManager = new ScriptManager(this, options.hidden);

    /**
     * @type {ScriptStorage}
     */
    this.scriptStorage = new ScriptStorage(this, options.preload);

    //
    // Private stuff

    /**
     * @type {ChildProcess}
     * @private
     */
    var _process = null;

    /**
     * @type {boolean}
     * @private
     */
    var _saveLiveEdit = options.saveLiveEdit ? true : false;

    /**
     * @type {boolean}
     * @private
     */
    var _mute = options.mute ? true : false;

    console.log("DEBUGGER OPTIONS", options);

    /**
     * @type {boolean}
     * @private
     */
    var _injected = false;

    /**
     * @type {string}
     * @private
     */
    var _eventsPrefix = '__DEBUGGER_EVENT_START_' + Math.round((Date.now() - Math.round(Math.random() * 10000)) / 1000) + '-' + Math.round(Math.random() * 10000);
    var _eventsSuffix = '__DEBUGGER_EVENT_END_' + Math.round((Date.now() - Math.round(Math.random() * 10000)) / 1000) + '-' + Math.round(Math.random() * 10000);

    /**
     * @private
     */
    var _isRequireInFrame = function (TARGET_FRAME, cb) {
        $this._request('evaluate', {
            expression: 'require',
            frame: TARGET_FRAME >= 0 ? TARGET_FRAME : undefined,
            global: TARGET_FRAME == -1
        }, function (error, result) {
            cb(!error);
        });
    };

    /**
     * Inject the debuggee code into the debuggee process
     * @private
     */
    var _inject = function (callback) {
        if (_injected) return;

        var PARENT_CALL_FRAME = 1,
            CURRENT_CALL_FRAME = 0,
            GLOBAL_CALL_FRAME = -1;

        if ($this.isConnected() && !$this.isRunning()) {
            _isRequireInFrame(CURRENT_CALL_FRAME, function (isInCurrentFrame) {
                if (isInCurrentFrame) _doInject(CURRENT_CALL_FRAME, callback);
                else {
                    console.log("Injection failed: no require in current frame.");
                    var error = new Error('Injection failed: no require in current frame.');
                    callback(error);
                }
            });
        } else {
            setTimeout(function () {
                _inject(callback);
            }, 1);
        }
    };

    var _doInject = function (TARGET_FRAME, callback) {
        var injectorServerPath = JSON.stringify(require.resolve('./Debuggee.js'));

        console.log("DOINJECT");

        var options = {
            'port': port,
            'eventsPrefix': _eventsPrefix,
            'eventsSuffix': _eventsSuffix,
            'v8-profiler': require.resolve('v8-profiler'),
            'heapdump': require.resolve('heapdump')
        };
        var injection = '(require(\'module\')._load(' + injectorServerPath + '))(' + JSON.stringify(options) + ')';

        $this._request('evaluate', {
            expression: injection,
            frame: TARGET_FRAME >= 0 ? TARGET_FRAME : undefined,
            global: TARGET_FRAME == -1
        }, function (err) {
            if (err) return callback (err);
            _injected = true;
            callback();
        });
    };

    var _createUniqueLoaderId = function () {
        var randomPart = String(Math.random()).slice(2);
        return Date.now() + '-' + randomPart;
    };

    var _resolveMainAppScript = function (startDirectory, mainAppScript, callback) {
        $this.scriptManager.mainAppScript = mainAppScript;

        if (mainAppScript == null) {
            // mainScriptFile is null when running in the REPL mode
            return callback(null, startDirectory, mainAppScript);
        }

        fs.stat(mainAppScript, function (err, stat) {
            if (err && !/\.js$/.test(mainAppScript)) {
                mainAppScript += '.js';
            }

            return callback(null, startDirectory, mainAppScript);
        });
    };

    var _createResourceTreeResponse = function (mainAppScript, scriptFiles, callback) {
        var loaderId = _createUniqueLoaderId();
        callback(null, mainAppScript, loaderId, scriptFiles);
    };

    var _getResourceTreeForAppScript = function (startDirectory, mainAppScript, callback) {
        async.waterfall([
            $this.scriptStorage.findAllApplicationScripts.bind($this.scriptStorage, startDirectory, mainAppScript),
            _createResourceTreeResponse.bind(this, mainAppScript)
        ], callback);
    };

    var _changeLiveOrRestartFrameResponseHandler = function (callback, err, response) {
        if (err) return callback(err);

        function sendResponse(callFrames) {
            callback(null, {
                callFrames: callFrames || [],
                result: response.result
            });
        }

        function sendResponseWithCallStack() {
            $this.breakEventHandler.fetchCallFrames(function (err, response) {
                var callFrames = [];
                if (!err) callFrames = response;
                // $this.emit('info', {type: 'error', text: 'Cannot update stack trace after a script changed: ' + ((typeof err === 'string') ? err : err.message)});

                sendResponse(callFrames);
            });
        }

        var result = response.result;
        if (result['stack_modified'] && !result['stack_update_needs_step_in']) sendResponseWithCallStack();
        else sendResponse();
    };

    var _persistScriptChanges = function (scriptId, newSource) {
        if (!_saveLiveEdit) return _warn(
            'Saving of live-edit changes back to source files is disabled.\n' +
            'Use the button above to enable saving.'
        );

        var source = $this.scriptManager.findScriptByID(scriptId);
        if (!source) return _warn('Cannot save changes to disk: unknown script id %s', scriptId);

        var scriptFile = source.v8name;
        if (!scriptFile || scriptFile.indexOf(path.sep) == -1) return _warn(
            'Cannot save changes to disk: script id %s "%s" was not loaded from a file.',
            scriptId,
            scriptFile || 'null'
        );

        $this.scriptStorage.save(scriptFile, newSource, function (err) {
            if (err) return _warn('Cannot save changes to disk. %s', err);
        });
    };

    var _warn = function () {
        $this.emit('runtimeError', {type: 'warning', error: util.format.apply(this, arguments)});
        console.log('[warning]', util.format.apply(this, arguments));
    };

    /**
     * Get the full app scripts tree
     * @param {Function} callback
     */
    this.getScriptsTree = function (callback) {
        var describeProgram = '[process.cwd(), ' + 'process.mainModule ? process.mainModule.filename : process.argv[1]]';

        async.waterfall([
            $this.evaluate.bind($this, describeProgram),

            function (result, refs, cb) {
                console.log("BEFORE GETTING TREE", arguments);

                if (result.type != 'object' && result.className != 'Array') {
                    return callback(new Error('Evaluate returned unexpected result: type: ' + result.type + ' className: ' + result.className));
                }

                var props = result.properties.filter(function isArrayIndex(p) {
                    return /^\d+$/.test(p.name);
                }).map(function resolvePropertyValue(p) {
                    return refs[p.ref].value;
                });

                cb(null, props[0], props[1]);
            },

            _resolveMainAppScript,
            _getResourceTreeForAppScript
        ], function (err, mainAppScript, loaderId, scriptFiles) {
            callback(err, mainAppScript, loaderId, scriptFiles);
            $this.emit('appTree', mainAppScript, loaderId, scriptFiles);
        });
    };

    /**
     * Get script source code request
     * Copied from node-inspector
     * https://github.com/node-inspector/node-inspector
     *
     * @param {number} id
     * @param {Function} callback
     */
    this.getScriptSource = function (id, callback) {
        this._request('scripts', {includeSource: true, types: 4, ids: [Number(id)]}, function scriptSourceResponseHandler(err, result) {
            if (err) return callback(err);

            // Some modules gets unloaded (?) after they are parsed,
            // e.g. node_modules/express/node_modules/methods/index.js
            // V8 request 'scripts' returns an empty result in such case
            var source = result.length > 0 ? result[0].source : undefined;

            if (!err && !source) {
                var script = $this.scriptManager.findScriptByID(id);
                if (script) {
                    source = script.source;

                    if (typeof source === 'undefined') {
                        fs.readFile(script.v8name, 'utf-8', function (err, content) {
                            if (err) return callback(err);
                            content = content.replace(/^\#\!.*/, '');

                            var source = content;
                            $this.scriptManager.setContent(script.v8name, source);
                            return callback(null, source);
                        });
                    } else {
                        callback(null, source);
                    }
                } else {
                    callback(null, source);
                }
            } else {
                var match = MODULE_WRAP_REGEX.exec(source);
                if (match) source = match[1];

                callback(null, source);
            }
        });
    };

    this.getScripts = function (callback) {
        this._request('scripts', {includeSource: true, types: 4}, function handleScriptsResponse(err, result) {
            if (err) return callback(err);

            result.forEach($this.scriptManager.addScript.bind($this.scriptManager));
            callback(null, result);
        });
    };

    this.reloadScripts = function (callback) {
        this.scriptManager.reset(callback);
    };

    this.loadScript = function (file, callback) {
        return this.scriptStorage.load(file, callback);
    };

    this.setScriptSource = function (scriptId, source, callback) {
        this._request('changelive', {
            script_id: Number(scriptId),
            new_source: MODULE_HEADER + source + MODULE_TRAILER,
            preview_only: false
        }, function (err, response) {
            _changeLiveOrRestartFrameResponseHandler(callback, err, response);
            _persistScriptChanges(scriptId, source);
        });
    };

    this.restartFrame = function (frameId) {
        this._request('restartframe', {
            frame: Number(frameId)
        }, _changeLiveOrRestartFrameResponseHandler.bind(null, callback));
    };

    this.eval = function eval(expression, objectGroup, returnByValue, generatePreview, callback) {
        expression = 'global.process.___NODEBUG.runtime.register(' +
                         'eval(' + JSON.stringify(expression) + '), ' +
                         JSON.stringify(objectGroup) + ',' +
                         returnByValue.toString() + ',' +
                         generatePreview.toString() + '' +
                     ');';

        this.evaluate(expression, function (err, result, refs) {
            if (err) return callback(err);

            if (result.type != 'object' || result.className != 'Array') {
                callback(newError("JSONError: JSON response is not an array."));
                return;
            }

            var full = getFullJson(result.properties, refs);

            try {
                callback(null, JSON.parse(full));
            } catch (e) {
                callback(newError("JSONError: Cannot parse evaluate response."));
            }
        });
    };

    this.callFunction = function (objectId, fn, args, returnByValue, generatePreview, callback) {
        fn = '(' + fn + ')';

        var expression = 'global.process.___NODEBUG.runtime.callFunctionOn(' +
                              JSON.stringify(objectId) + ', ' +
                              'eval(' + JSON.stringify(fn) + '), ' +
                              JSON.stringify(args) + ', ' +
                              returnByValue.toString() + ', ' +
                              generatePreview.toString() + '' +
                         ');';

        this.evaluate(expression, function (err, result, refs) {
            if (err) return callback(err);

            if (result.type != 'object' || result.className != 'Array') {
                callback(newError("JSONError: JSON response is not an array."));
                return;
            }

            try {
                callback(null, JSON.parse(getFullJson(result.properties, refs)));
            } catch (e) {
                callback(newError("JSONError: Cannot parse evaluate response."));
            }
        });
    };

    var _getPropertiesOfScopeId = function (scopeId, ownProperties, accessorPropertiesOnly, callback) {
        $this.callFramesProvider.resolveScopeId(scopeId, function (err, result) {
            if (err)  callback(err);
            else _getPropertiesOfObjectId(result, ownProperties, accessorPropertiesOnly, callback);
        });
    };

    var _getPropertiesOfObjectId = function (objectId, ownProperties, accessorPropertiesOnly, callback) {
        var handle = parseInt(objectId, 10);
        var request = {handles: [handle], includeSource: false};

        $this._request('lookup', request, function (error, responseBody, responseRefs) {
            if (error) {
                callback(error);
                return;
            }
            var obj = responseBody[handle],
                props = v8ObjectToInspectorProperties(obj, responseRefs, ownProperties, accessorPropertiesOnly);

            callback(null, {result: props});
        });
    };

    this.getProperties = function (objectId, ownProperties, accessorPropertiesOnly, callback) {
        if (objectId.indexOf('__runtime__') != 0) {
            if (objectId.indexOf('scope:') == 0) {
                _getPropertiesOfScopeId(objectId, ownProperties, accessorPropertiesOnly, callback);
            } else {
                _getPropertiesOfObjectId(objectId, ownProperties, accessorPropertiesOnly, callback);
            }

            return;
        }

        var expression = 'global.process.___NODEBUG.runtime.getProperties(' +
                             JSON.stringify(objectId) + ',' +
                             ownProperties.toString() + ',' +
                             accessorPropertiesOnly.toString() + '' +
                         ');';

        this.evaluate(expression, function (err, result, refs) {
            if (err) return callback(err);

            if (result.type != 'object' || result.className != 'Array') {
                callback(newError("JSONError: JSON response is not an array."));
                return;
            }

            if (result.type != 'object' || result.className != 'Array') {
                callback(newError("JSONError: JSON response is not an array."));
                return;
            }

            try {
                callback(null, JSON.parse(getFullJson(result.properties, refs)));
            } catch (e) {
                callback(newError("JSONError: Cannot parse evaluate response."));
            }
        });
    };

    this.releaseObject = function (objectId, callback) {
        var expression = 'global.process.___NODEBUG.runtime.releaseObject(' + JSON.stringify(objectId) + ');';

        this.evaluate(expression, function (err, result) {
            if (err) return callback(err);
            callback(null, result.value);
        });

        callback();
    };

    this.releaseObjectGroup = function (objectGroup, callback) {
        var expression = 'global.process.___NODEBUG.runtime.releaseObjectGroup(' + JSON.stringify(objectGroup) + ');';

        this.evaluate(expression, function (err, result) {
            if (err) return callback(err);
            callback(null, result.value);
        });

        callback();
    };

    this.getFunctionDetails = function (functionId, callback) {
        if (functionId.toString().indexOf('__runtime__') === 0) {
            var expression = 'global.process.___NODEBUG.runtime.getFunctionDetails(' + JSON.stringify(functionId) + ');';

            this.evaluate(expression, function (err, result, refs) {
                if (err) return callback(err);

                if (result.type != 'object' || result.className != 'Array') {
                    callback(newError("JSONError: JSON response is not an array."));
                    return;
                }

                try {
                    callback(null, JSON.parse(getFullJson(result.properties, refs)));
                } catch (e) {
                    callback(newError("JSONError: Cannot parse evaluate response."));
                }
            });
        } else {
            // Debugger function request.

            this._request('lookup', {handles: [functionId], includeSource: false}, function (error, responseBody) {
                var name = responseBody.name || responseBody['inferredName'];
                if (error) callback(error);
                else callback(null, responseBody.scriptId, responseBody.line, responseBody.column, name);
            });
        }
    };

    this.takeHeapSnapshot = function (reportProgress, callback) {
        var expression = 'global.process.___NODEBUG.profiler.takeSnapshot(' + reportProgress.toString() + ');';

        this.evaluate(expression, function (err, result) {
            if (err) return callback(err);
            callback(null, result.value);
        });

        this.on('snapshotProgress', function (data) {
            $this.emit('heapSnapshotProgress', data);

            if (data.finished) {
                $this.removeAllListeners('snapshotProgress');

                fs.readFile(data.file, 'utf8', function (err, snapshot) {
                    var chunks = snapshot.match(/[\s\S]{1,8192}/g);

                    chunks.forEach(function (chunk, key) {
                        $this.emit('heapSnapshotData', {
                            chunk: chunk
                        });
                    });

                    fs.unlink(data.file);
                    $this.emit('heapSnapshotDone');
                });
            }
        });
    };

    this.startHeapProfiler = function (trackAllocations, callback) {
        // TODO: implement
        // must emit 'objectSeen' event with objectId and timestamp
    };

    this.endHeapProfiler = function (reportProgress, callback) {
        // TODO: implement
    };

    this.startCpuProfiler = function (callback) {
        var expression = 'global.process.___NODEBUG.profiler.startCpu();';

        this.evaluate(expression, function (err, result) {
            if (err) return callback(err);
            callback(null, result.value);
        });
    };

    this.stopCpuProfiler = function (callback) {
        var expression = 'global.process.___NODEBUG.profiler.stopCpu();';

        this.evaluate(expression, function (err, result) {
            if (err) return callback(err);

            $this.once('cpuReady', function (data) {
                console.log("CPU IS READY", data);

                fs.readFile(data.file, 'utf8', function (err, snapshot) {
                    if (err) callback(err);

                    try {
                        snapshot = JSON.parse(snapshot.trim());
                        if (!snapshot.samples) snapshot.samples = [];
                    } catch (e) {
                        callback(newError("JSONError: Cannot parse evaluate response."));
                    }

                    fs.unlink(data.file);
                    callback(null, snapshot);
                });
            });
        });
    };

    this.startEventLogger = function (maxCallStackDepth, callback) {
        var expression = 'global.process.___NODEBUG.timeline.start(' + maxCallStackDepth + ');';

        this.evaluate(expression, function (err, result) {
            if (err) return callback(err);
            callback(null, result.value);
        });
    };

    this.stopEventLogger = function (callback) {
        var expression = 'global.process.___NODEBUG.timeline.stop();';

        this.evaluate(expression, function (err, result) {
            if (err) return callback(err);
            callback(null, result.value);
        });
    };

    this.helper = {
        v8NameToInspectorUrl: function (v8name) {
            if (!v8name || v8name === 'repl') return '';

            if (/^\//.test(v8name)) return 'source://' + v8name;
            else if (/^[a-zA-Z]:\\/.test(v8name)) return 'source:///' + v8name.replace(/\\/g, '/');
            else if (/^\\\\/.test(v8name)) return 'source://' + v8name.substring(2).replace(/\\/g, '/');
            else return 'node:///' + v8name;

            return v8name;
        },

        inspectorUrlToV8Name: function (url) {
            var path = url.replace(/^source:\/\//, '').replace(/^node:\/\//, '');
            if (/^\/[a-zA-Z]:\//.test(path)) return path.substring(1).replace(/\//g, '\\'); // Windows disk path
            if (/^\//.test(path)) return path; // UNIX-style
            if (/^source:\/\//.test(url)) return '\\\\' + path.replace(/\//g, '\\'); // Windows UNC path

            return url;
        }
    };

    // Once started and connected, we have to inject to be able to continue with anything.
    this.once('nodeScriptParsed', function () {
        console.log("BEFORE READY HERE");

        _inject(function (err) {
            if (err) return $this.emit('error', err);

            console.log("READY HERE");
            $this.emit('ready');
        });
    });

    var _dataBuffer = '';

    function _dataHandler (data) {
        var events = [];
        var msg = '', tmp;

        if (_dataBuffer.length > 0) {
            data = _eventsPrefix + _dataBuffer + data;
            _dataBuffer = '';
        }

        var startsWithPrefix = data.indexOf(_eventsPrefix) === 0;
        var prx = data.split(_eventsPrefix);
        if (startsWithPrefix) {
            // Remove the first element, because it was prefixed
            var rem = prx.shift();
        } else {
            // This is just a normal message that should be printed.
            msg = prx.shift();
        }

        for (var i = 0; i < prx.length; i++) {
            var idx = prx[i].indexOf(_eventsSuffix);
            if (idx == -1) {
                // There is no suffix??!?!
                if (i != prx.length - 1) {
                    // This is not supposed to happen!
                    throw new Error("There is no events suffix in this message.");
                } else {
                    // Buffer this message, because it is an unfinished event.
                    _dataBuffer = prx[i];
                }
            } else {
                // We have a suffix in the message, but it must be in the end.
                tmp = prx[i].split(_eventsSuffix);
                if (tmp.length > 2) throw new Error("This here is really strange.");

                // This is just a normal event. Just add it.
                events.push(tmp[0]);

                if (tmp[1] != '') {
                    // The suffix is not in the end of the message!
                    // This means that the second part of the message is just a normal message
                    msg += tmp[1];
                }
            }
        }

        for (i = 0; i < events.length; i ++) {
            var expression = 'global.process.___NODEBUG.getEvent(' + events[i] + ');';

            _receiving ++;

            $this.evaluate(expression, function (err, result, refs) {
                _receiving --;
                if (_receiving <= 0) {
                    _receiving = 0;
                    $this.emit('received');
                }

                if (err) throw err;

                var a = getFullJson(result.properties, refs);

                try {
                    var event = JSON.parse(a);
                } catch (e) {
                    throw new Error("JSONError: Cannot parse evaluate response.");
                }

                // Emit that shit.

                $this.emit(event.name, event.data);
            });
        }

        return msg;
    }

    var _receiving = 0;
    var _finished = false;

    this.attachProcess = function (child) {
        _process = child;

        _process.on('close', function () {
            $this.emit('finish');
            _finished = true;
        });

        var firstDebuggerOutput = false;

        _process.stdout.on('data', function (data) {
            if (!firstDebuggerOutput) {
                if (data.indexOf('Debugger listening on port ') === 0) {
                    data = '[INFO] ' + data;
                    firstDebuggerOutput = true;
                }
            }

            if (data && data.length && !_mute) process.stdout.write(data);
        });

        _process.stderr.on('data', function (data) {
            if (!firstDebuggerOutput) {
                if (data.indexOf('Debugger listening on port ') === 0) {
                    data = '[INFO] ' + data;
                    firstDebuggerOutput = true;
                }
            }

            var msg = _dataHandler(data);
            if (msg && msg.length && !_mute) process.stdout.write(msg);
        });
    };

    this.destroy = function (callback) {
        // We must wait for all events to come and only then destroy the instance.

        console.log("ALMOST DESTRUCT");

        function destruct() {
            $this._destroy();
            $this.removeAllListeners();

            $this.scriptManager.destroy();
            $this.scriptStorage.destroy();

            _process = null;
            _dataBuffer = null;

            console.log("DESTRUCTED");
            callback();
        }

        if (!_finished) {
            console.log("NOT FINISHED YET");
            this.once('finish', function () {
                console.log("= FINISHED");
                if (_receiving > 0) {
                    console.log("NOT RECEIVED YET");
                    $this.once('received', function () {
                        console.log("= RECEIVED");
                        destruct();
                    });
                } else {
                    console.log("RECEIVED ALREADY");
                    destruct();
                }
            });
        } else {
            console.log("FINISHED ALREADY");
            destruct();
        }
    }
}

util.inherits(Debugger, DebuggerClient);
module.exports = Debugger;