var util = require('util'),
    EventEmitter = require('events').EventEmitter;

function Agent (debugger_, dummies) {
    var $this = this;

    this._debugger = debugger_;
    this._methods = this._methods.concat();

    Object.keys(dummies).forEach(function (method) {
        if (!$this.hasMethod(method)) $this._methods.push(method);
        $this[method] = dummies[method] === null ? $this._dummy : (dummies[method] ? $this._dummyTrue : $this._dummyFalse);
    });
}
util.inherits(Agent, EventEmitter);
module.exports = Agent;

/**
 * @type {Debugger}
 * @protected
 */
Agent.prototype._debugger = null;

/**
 * @type {Array.<string>}
 * @protected
 */
Agent.prototype._methods = [];

Agent.prototype._dummy = function _dummy (params, callback) {
    callback();
};

Agent.prototype._dummyTrue = function _dummyTrue (params, callback) {
    callback(null, {result: true});
};

Agent.prototype._dummyFalse = function _dummyFalse (params, callback) {
    callback(null, {result: false});
};

Agent.prototype.hasMethod = function hasMethod (method) {
    return this._methods.indexOf(method) != -1;
};

Agent.prototype.execute = function execute (method, params, callback) {
    if (this.hasMethod(method)) return callback("NotImplemented:Method not implemented.");
    return this[method].call(this, params, callback);
};

Agent.prototype.destroy = function () {
    if (this._debugger) this._debugger = null;
};