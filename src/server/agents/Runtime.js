var util = require('util'),
    Agent = require('../Agent'),
    agents = {};

/**
 This module will implement the full runtime API.
 https://developer.chrome.com/devtools/docs/protocol/1.1/runtime
 */

/**
 * Runtime Agent
 *
 * @param {Debugger} debugger_
 * @constructor
 * @augments Agent
 */
agents.Runtime = function (debugger_) {
    Agent.call(this, debugger_, {
        enable: null,
        isRunRequired: false
    });

    var $this = this;

    //
    // Public stuff

    this.evaluate = function (params, callback) {
        var expression = params['expression'];
        var objectGroup = params['objectGroup'] || '__GLOBAL__';
        var returnByValue = params['returnByValue'] ? true : false;
        var generatePreview = params['generatePreview'] ? true : false;

        this._debugger.eval(expression, objectGroup, returnByValue, generatePreview, function (err, result) {
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

    this.callFunctionOn = function (params, callback) {
        var objectId = params['objectId'] || '__DEFAULT_OBJECT__';
        var fn = params['functionDeclaration'] || 'function() {}';
        var args = params['arguments'] || [];
        var returnByValue = params['returnByValue'] ? true : false;
        var generatePreview = params['generatePreview'] ? true : false;

        this._debugger.callFunction(objectId, fn, args, returnByValue, generatePreview, function (err, result) {
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

    this.getProperties = function (params, callback) {
        var objectId = params['objectId'] || '__DEFAULT_OBJECT__';
        var ownProperties = params['ownProperties'] || false;
        var accessorPropertiesOnly = params['accessorPropertiesOnly'] || false;

        this._debugger.getProperties(objectId, ownProperties, accessorPropertiesOnly, function (err, result) {
            if (err) return callback(err);

            callback(null, {
                result: result
            });
        });
    };

    this.releaseObject = function (params, callback) {
        var objectId = params.objectId || '__DEFAULT_OBJECT__';
        callback();
        //this._debugger.releaseObject(objectId, callback);
    };

    this.releaseObjectGroup = function (params, callback) {
        var objectGroup = params.objectGroup || '__GLOBAL__';
        callback();
        //this._debugger.releaseObjectGroup(objectGroup, callback);
    };

    //
    // Events and handlers

    this._debugger.on('appTree', function () {
        $this.emit('notification', 'Runtime.executionContextCreated', {
            context: {
                frameId: '__NODE_DEBUGGER__', id: 1
            }
        });
    });
};

util.inherits(agents.Runtime, Agent);
module.exports = agents.Runtime;

agents.Runtime.prototype._methods = [
    'enable',
    'callFunctionOn',
    'evaluate',
    'isRunRequired',
    'getProperties',
    'releaseObject',
    'releaseObjectGroup'
];
