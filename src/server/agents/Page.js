var util = require('util'),
    fs = require('fs'),
    async = require('async'),
    Agent = require('../Agent'),
    agents = {};

/**
 This module will implement the needs of page API.
 https://developer.chrome.com/devtools/docs/protocol/1.1/page
 */

/**
 * Page Agent
 *
 * @param {Debugger} debugger_
 * @constructor
 * @augments Agent
 */
agents.Page = function (debugger_)  {
    Agent.call(this, debugger_, {
        enable: null,
        canScreencast: false,
        reload: null,
        setShowViewportSizeOnResize: null,
        canShowFPSCounter: null,
        canContinuouslyPaint: null,
        setTouchEmulationEnabled: null
    });

    var $this = this;

    //
    // Public stuff

    this.getResourceTree = function (params, callback) {
        var cb = function (err, url, loaderId, files) {
            if (err) callback(err);

            callback(null, {
                frameTree: {
                    frame: {
                        id: '_____NODE_DEBUGGER_____',
                        url: $this._debugger.helper.v8NameToInspectorUrl(url),
                        loaderId: loaderId
                    },
                    resources: files.map(function (filePath) {
                        return {
                            url: $this._debugger.helper.v8NameToInspectorUrl(filePath),
                            type: 'Script',
                            mimeType: 'text/javascript'
                        };
                    })
                }
            });
        };

        if (this._debugger.isConnected()) this._debugger.getScriptsTree(cb);
        else this._debugger.once('connect', this._debugger.getScriptsTree.bind(this._debugger, cb));
    };

    this.getResourceContent = function (params, callback) {
        var scriptName = this._debugger.helper.inspectorUrlToV8Name(params.url);

        if (scriptName === '') {
            var src = '// There is no main module loaded in node.\n' +
                      '// This is expected when you are debugging node\'s interactive REPL console.';

            return callback(null, {content: src});
        }

        this._debugger.loadScript(scriptName, function (err, src) {
            if (err) return callback(err);
            callback(null, {content: src});
        });
    };
};

util.inherits(agents.Page, Agent);
module.exports = agents.Page;

agents.Page.prototype._methods = [
    'enable',
    'reload',
    'setShowViewportSizeOnResize',
    'canShowFPSCounter',
    'canContinuouslyPaint',
    'setTouchEmulationEnabled',
    'canScreencast',
    'getResourceTree',
    'getResourceContent'
];