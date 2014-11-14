var util = require('util'),
    Agent = require('../Agent'),
    agents = {};

/**
 This module will implement the full timeline API.
 https://developer.chrome.com/devtools/docs/protocol/1.1/timeline
 */

/**
 * Timeline Agent
 *
 * @param {Debugger} debugger_
 * @constructor
 * @augments Agent
 */
agents.Timeline = function (debugger_) {
    Agent.call(this, debugger_, {
        enable: null
    });

    var $this = this;

    var _started = false;
    var _count = 0;

    //
    // Public stuff

    this.start = function (params, callback) {
        var maxCallStackDepth = parseInt(params['maxCallStackDepth']) || 5;
        if (isNaN(maxCallStackDepth)) maxCallStackDepth = 5;
        this._debugger.startEventLogger(maxCallStackDepth, function (err, res) {
            callback(err, res);
            if (!err) _started = true;
        });
    };

    this.stop = function (params, callback) {
        this._debugger.stopEventLogger(function (err, res) {
            callback(err, res);
            if (!err) {
                _started = false;
                _count = 0;
            }
        });
    };

    //
    // Events and handlers

    this._debugger.on('timelineEvent', function (event) {
        if (!_started) return;

        _count++;
        $this.emit('notification', 'Timeline.eventRecorded', {record: event});
        $this.emit('notification', 'Timeline.progress', {count: _count});
    });

    /*
    TODO: evaluate script event
    this._debugger.on('scriptParsed', function (data) {
        if (!_started) return;
        $this.emit('notification', 'Debugger.scriptParsed', data);
    });*/
};

util.inherits(agents.Timeline, Agent);
module.exports = agents.Timeline;

agents.Timeline.prototype._methods = [
    'enable',
    'start',
    'stop'
];