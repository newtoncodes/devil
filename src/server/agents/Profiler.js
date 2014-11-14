var util = require('util'),
    Agent = require('../Agent'),
    agents = {};

/**
 * Profiler Agent
 *
 * @param {Debugger} debugger_
 * @constructor
 * @augments Agent
 */
agents.Profiler = function (debugger_) {
    Agent.call(this, debugger_, {
        enable: null,
        setSamplingInterval: false,
        causesRecompilation: false,
        hasHeapProfiler: true
    });

    var $this = this;

    //
    // Public stuff

    this.start = function (params, callback) {
        this._debugger.startCpuProfiler(function (err) {
            if (err) return callback(err);
            callback();
        });
    };

    this.stop = function (params, callback) {
        this._debugger.stopCpuProfiler(function (err, profile) {
            if (err) return callback(err);
            callback(null, {profile: profile});
        });
    };

    this.takeHeapSnapshot = function (params, callback) {
        var reportProgress = params['reportProgress'] || false;
        this._debugger.takeHeapSnapshot(reportProgress, function (err) {
            if (err) return callback(err);

            $this._debugger.once('heapSnapshotDone', function (event) {
                callback();
            });
        });
    };

    this.startTrackingHeapObjects = function (params, callback) {
        var trackAllocations = params['trackAllocations'] || false;
        this._debugger.startHeapProfiler(trackAllocations, callback);
    };

    this.stopTrackingHeapObjects = function (params, callback) {
        var reportProgress = params['reportProgress'] || false;
        this._debugger.startHeapProfiler(reportProgress, callback);
    };

    //
    // Events and handlers

    this._debugger.on('heapSnapshotProgress', function (event) {
        $this.emit('notification', 'HeapProfiler.reportHeapSnapshotProgress', event);
    });

    this._debugger.on('heapSnapshotData', function (event) {
        $this.emit('notification', 'HeapProfiler.addHeapSnapshotChunk', event);
    });

    this._debugger.on('objectSeen', function (event) {
        $this.emit('notification', 'HeapProfiler.lastSeenObjectId', {lastSeenObjectId: event.objectId, timestamp: event.timestamp});
    });
};

util.inherits(agents.Profiler, Agent);
module.exports = agents.Profiler;

agents.Profiler.prototype._methods = [
    'enable',
    'start',
    'stop',
    'setSamplingInterval',
    'hasHeapProfiler',
    'causesRecompilation',
    'takeHeapSnapshot'
    //'startTrackingHeapObjects',
    //'stopTrackingHeapObjects'
];