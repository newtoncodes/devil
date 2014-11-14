// see Blink inspector > ContentSearchUtils.cpp > findMagicComment()
var SOURCE_MAP_URL_REGEX = /\/\/[@#][ \t]sourceMappingURL=[ \t]*([^\s'"]*)[ \t]*$/m;

/**
 * ScriptManager class. Uses a v8.Debugger
 * Refactored from node-inspector
 * https://github.com/node-inspector/node-inspector
 *
 * @param {Array.<string>} hidden
 * @param {Debugger} debuggerClient
 * @constructor v8.ScriptManager
 */
function ScriptManager (debuggerClient, hidden) {
    var $this = this;

    //
    // Private stuff

    /**
     * @type {Object.<object>}
     * @private
     */
    var _sources = {};

    /**
     * @type {Array.<string>}
     * @private
     */
    var _hidden = hidden || [];

    /**
     * @type {Debugger}
     * @private
     */
    var _debugger = debuggerClient;

    var _isNodeInternal = function (scriptName) {
        // node.js internal scripts have no path, just a filename
        // regular scripts have always a full path
        //   (i.e their name contains at least one path separator)
        var isFullPath = /[\/\\]/.test(scriptName);
        return !isFullPath;
    };

    var _doAddScript = function (v8data, hidden) {
        var inspectorUrl = _debugger.helper.v8NameToInspectorUrl(v8data.name);

        /*
         "type":"Script",
         "mimeType":"text/javascript"
         */
        var inspectorScriptData = {
            scriptId: String(v8data.id),
            url: inspectorUrl,
            startLine: v8data.lineOffset,
            startColumn: v8data.columnOffset

            /* Properties not set:
             endLine: undefined,
             endColumn: undefined,
             isContentScript: undefined,
             hasSourceURL: undefined,
             */
        };

        $this.sourcesMap[inspectorUrl] = inspectorScriptData.scriptId;

        if (!_sources[inspectorScriptData.scriptId]) {
            _sources[inspectorScriptData.scriptId] = {
                hidden: hidden,
                v8name: v8data.name,
                url: inspectorUrl,
                mimeType: "text/javascript",
                type: "Script"
            };
        } else {
            if (!_sources[inspectorScriptData.scriptId].v8name) _sources[inspectorScriptData.scriptId].v8name = v8data.name;
            if (!_sources[inspectorScriptData.scriptId].url) _sources[inspectorScriptData.scriptId].url = inspectorUrl;
            _sources[inspectorScriptData.scriptId].mimeType = "text/javascript";
            _sources[inspectorScriptData.scriptId].type = "Script";
        }

        return inspectorScriptData;
    };

    var _getSourceMapUrl = function (scriptId, scriptSource, callback) {
        var getSource;

        if (scriptSource == null) {
            console.log('_getSourceMapUrl(%s) - fetching source from V8', scriptId);
            getSource = _debugger.getScriptSource.bind(_debugger, scriptId);
        } else {
            console.log('_getSourceMapUrl(%s) - using the supplied source', scriptId);
            getSource = function (cb) {
                cb(null, scriptSource);
            };
        }

        getSource(function (err, data) {
            _parseSourceMapUrlFromScriptSource(data, callback);
        });
    };

    var _parseSourceMapUrlFromScriptSource = function (source, callback) {
        var match = SOURCE_MAP_URL_REGEX.exec(source);
        callback(null, match ? match[1] : undefined);
    };

    //
    // Handlers

    /**
     * After compile handler for the debugger
     *
     * @param {Object} event
     * @private
     */
    var _afterCompileHandler = function (event) {
        if (!event.script) {
            console.demonicLog('[ERROR] Unexpected error: debugger emitted afterCompile event with no script data.');
            return;
        }

        $this.addScript(event.script);
    };

    //
    // Public stuff

    /**
     * @type {string}
     */
    this.mainAppScript = null;

    this.sourcesMap = {};

    /**
     * @param {v8.Debugger} debuggerClient
     */
    this.attachDebugger = function (debuggerClient) {
        _debugger = debuggerClient;
        _debugger.on('afterCompile', _afterCompileHandler);
    };
    if (debuggerClient) this.attachDebugger(debuggerClient);

    /**
     * Check if script is hidden
     *
     * @param {string} scriptPath
     * @returns {boolean}
     */
    this.isScriptHidden = function (scriptPath) {
        return _hidden.some(function fnHiddenScriptMatchesPath(r) {
            return r.test(scriptPath);
        });
    };

    /**
     * Find script by script ID
     *
     * @param {number} id
     * @returns {object}
     */
    this.findScriptByID = function (id) {
        return _sources[id];
    };

    /**
     * Get all scripts
     *
     * @param {Function} callback
     */
    this.getAllScripts = function (callback) {
        var urls = [];
        for (var i in _sources) {
            if (!_sources.hasOwnProperty(i)) continue;
            urls.push(_sources[i].url);
        }

        callback(null, urls);
    };


    var _map = {};

    /**
     * Set content of a script
     *
     * @param {string} path
     * @param {string} content
     */
    this.setContent = function (path, content) {
        var id = _map[path];
        if (!id || !_sources[id]) return;

        if (!_sources[id].source) {
            _sources[id].source = content;
        }
    };

    /**
     * Add script to the cache
     *
     * @param {object} v8data
     */
    this.addScript = function (v8data) {
        var localPath = v8data.name;
        var hidden = this.isScriptHidden(localPath) && localPath != this.mainAppScript;

        _map[localPath] = v8data.id;

        var inspectorScriptData = _doAddScript(v8data, hidden);

        console.log('addScript id: %s localPath: %s hidden? %s source? %s', v8data.id, localPath, hidden, !!v8data.source);
        if (localPath == 'node.js') _debugger.emit('nodeScriptParsed');

        if (hidden || _isNodeInternal(localPath)) {
            if (!hidden) _debugger.emit('scriptParsed', inspectorScriptData);
        } else {
            _getSourceMapUrl(v8data.id, v8data.source, function onGetSourceMapUrlReturn(err, sourceMapUrl) {
                if (err) console.demonicLog('[WARNING] Cannot parse SourceMap URL for script %s (id %d). %s', localPath, v8data.id, err);
                inspectorScriptData.sourceMapURL = sourceMapUrl;
                if (!hidden) _debugger.emit('scriptParsed', inspectorScriptData);
            });
        }
    };

    /**
     * Reset scripts
     */
    this.reset = function (callback) {
        _debugger.getScripts(function handleScriptsResponse(err, result) {
            if (err) return callback(err);

            result.forEach(_debugger.scriptManager.addScript.bind(_debugger.scriptManager));
            callback();
        });
    };

    /**
     * Destructor
     */
    this.destroy = function () {
        _debugger = null;
        _sources = null;
    };
};

module.exports = ScriptManager;