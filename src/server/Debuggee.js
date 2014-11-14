var util = require('util'),
    fs = require('fs'),
    os = require('os'),
    EventEmitter = require('events').EventEmitter;

var objects = {};
var objectGroups = {};

var toString = Object.prototype.toString, nativeIsArray = Array.isArray;
var isArray = nativeIsArray || function (obj) {
            return toString.call(obj) === '[object Array]';
        },
    isObject = function (obj) {
        var type = typeof obj;
        return type === 'function' || type === 'object' && !!obj;
    };

var _uId = 1;



var formatRegExp = /(?![^%])%j/g;
var formatRegExp2 = /(?![^%])%[fioc]/g;
var regExp = /%[sdjfioc%]/g;

var cpuProfiler = null;
var heapdump = null;

var snapshotId = Math.round((Date.now() - Math.round(Math.random() * 10000)) / 1000);

var waiting = false;
var eCount = 0;
function waitTick() {
    if (eCount <= 0) {
        waiting = false;
        return;
    }

    Timeline.orgSetTimeout(waitTick, 5); // 5... we are not about speed, we are about not pushing the process.
}

function wait() {
    if (waiting) return;
    if (eCount <= 0) {
        waiting = false;
        return;
    }

    waiting = true;
    Timeline.orgSetTimeout(waitTick, 5); // 5... we are not about speed, we are about not pushing the process.
}

function newObjectId () {
    return '__runtime__' + (_uId ++) + '__';
}

function v8NameToInspectorUrl (v8name) {
    if (!v8name || v8name === 'repl') return '';

    if (/^\//.test(v8name)) return 'source://' + v8name;
    else if (/^[a-zA-Z]:\\/.test(v8name)) return 'source:///' + v8name.replace(/\\/g, '/');
    else if (/^\\\\/.test(v8name)) return 'source://' + v8name.substring(2).replace(/\\/g, '/');
    else return 'node:///' + v8name;

    return v8name;
}


function getFunctionCallArgs(arg) {
    switch (arg.type) {
        case undefined:
        case 'string': //return util.format('"%s"', arg.value);
        case 'number':
            return arg.value;
        case 'null':
        case 'undefined':
            return arg.type;
        case 'object':
        case 'function':
            return objects[arg.objectId];
        default:
            throw new Error(util.format('Function arguments of type "%s" are not supported', arg.type));
    }
}

function getPropertyDescriptors(object, ownProperties, accessorPropertiesOnly) {
    var descriptors = [];
    var nameProcessed = {};
    nameProcessed.__proto__ = null;
    var descriptor;

    for (var o = object; isObject(o); o = o.__proto__) {
        var names = Object.getOwnPropertyNames(o);
        for (var i = 0; i < names.length; ++i) {
            var name = names[i];
            if (nameProcessed[name]) continue;

            try {
                nameProcessed[name] = true;
                descriptor = Object.getOwnPropertyDescriptor(object, name);
                if (!descriptor) {
                    try {
                        if (!accessorPropertiesOnly) descriptors.push({
                            name: name,
                            value: object[name],
                            writable: false,
                            configurable: false,
                            enumerable: false
                        });
                    } catch (e) {
                        // Silent catch.
                    }
                    continue;
                }
            } catch (e) {
                descriptor = {};
                descriptor.value = e;
                descriptor.wasThrown = true;
            }

            descriptor.name = name;

            var isAccessorProperty = ('get' in descriptor || 'set' in descriptor);
            if (!accessorPropertiesOnly || isAccessorProperty) descriptors.push(descriptor);
        }

        if (ownProperties) {
            if (!accessorPropertiesOnly && object.__proto__)
                descriptors.push({
                    name: "__proto__",
                    value: object.__proto__,
                    writable: true,
                    configurable: true,
                    enumerable: false
                });
            break;
        }
    }

    return descriptors;
}

function getStack() {
    var orig = Error.prepareStackTrace;
    Error.prepareStackTrace = function (_, stack) {
        return stack;
    };

    var err = new Error;
    Error.captureStackTrace(err, arguments.callee);
    var stack = err.stack;
    Error.prepareStackTrace = orig;
    return stack;
}





/**
 * RemoteObject
 *
 * @param {string} type
 * @constructor
 */
var RemoteObject = function RemoteObject (type) {
    /**
     * Object type.
     * @type {string} ("boolean" , "function" , "number" , "object" , "string" , "undefined")
     */
    this.type = type;

    /**
     * Optional
     * Object class (constructor) name. Specified for object type values only.
     * @type {string}
     */
    this.className = undefined;

    /**
     * Optional
     * String representation of the object.
     * @type {string}
     */
    this.description = undefined;

    /**
     * Optional
     * Unique object identifier (for non-primitive values).
     * @type {string}
     */
    this.objectId = undefined;

    /**
     * Optional
     * Object subtype hint. Specified for object type values only.
     * @type {string} ("array" , "date" , "node" , "null" , "regexp")
     */
    this.subtype = undefined;

    /**
     * Optional
     * Remote object value (in case of primitive values or JSON values if it was requested).
     * @type {string}
     */
    this.value = undefined;

    this.toString = function () {
        var o = {};
        if (typeof this.type !== 'undefined') o.type = this.type;
        if (typeof this.className !== 'undefined') o.className = this.className;
        if (typeof this.description !== 'undefined') o.description = this.description;
        if (typeof this.objectId !== 'undefined') o.objectId = this.objectId;
        if (typeof this.subtype !== 'undefined') o.subtype = this.subtype;
        if (typeof this.value !== 'undefined') o.value = this.value;
        if (this.preview) o.preview = this.preview;

        return JSON.stringify(o);
    }
};

/**
 * Create a preview for the console objects
 *
 * @param {Object} obj
 * @returns {*}
 */
RemoteObject.createPreview = function (obj) {
    var keys;

    if (isArray(obj)) {
        return null;
        //keys = Object.keys(obj);
    } else if (isObject(obj)) {
        keys = Object.getOwnPropertyNames(obj);
    } else {
        return null;
    }

    var preview = {
        lossless: true,
        overflow: false,
        properties: []
    };

    var k = 0;
    keys.forEach(function (key) {
        var el = obj[key];
        var type = (typeof el);
        var val;
        k ++;
        if (k > 5) {
            preview.lossless = false;
            preview.overflow = true;
            return false;
        }

        if (isObject(el)) {
            val = el.constructor && el.constructor.name ? el.constructor.name : Object.prototype.toString.call(el);
            preview.lossless = false;
        } else if (isArray(el)) {
            val = 'Array[' + obj.length + ']';
            preview.lossless = false;
        } else if (el instanceof RegExp) {
            val = el.toString();
            preview.lossless = false;
        } else if (el instanceof Date) {
            val = el.toString();
            preview.lossless = false;
        } else if (typeof el === 'function') {
            val = '';
            preview.lossless = false;
        } else {
            val = el;
        }

        preview.properties.push({
            name: key,
            type: type,
            value: val
        });
    });

    return preview;
};

/**
 * Convert an object to a RemoteObject
 *
 * @param {Object} obj
 * @param {boolean} addValue
 * @param {boolean} generatePreview
 * @param {string} objectGroup
 * @returns {Object}
 */
RemoteObject.wrapObject = function (obj, addValue, generatePreview, objectGroup) {
    var type = typeof obj, o = null, objectId = null;

    // First lets see if this object exists already
    if (type === 'object' || type === 'array' || type === 'function') {
        Object.keys(objects).forEach(function (key) {
            if (objects[key] === obj) {
                objectId = key;
                return false;
            }
        });
    }

    o = new RemoteObject(type);
    if (o.type === 'array') o.type = 'object';

    if (o.type === 'string') {
        o.className = 'String';
        o.value = obj;
    } else if (o.type === 'function') {
        o.className = 'Function';
        o.description = obj.toString();
        o.objectId = objectId || newObjectId();
    } else if (o.type === 'number') {
        o.className = 'Number';
        o.value = obj;
    } else if (o.type === 'boolean') {
        o.className = 'Boolean';
        o.value = obj;
    } else if (o.type === 'object') {
        if (obj) {
            o.objectId = objectId || newObjectId();
            if (obj.constructor) o.className = obj.constructor.name ? obj.constructor.name : 'Anonymous';
            else o.className = 'Object';
            o.description = o.className;
        }

        if (isArray(obj)) {
            o.subtype = 'array';
            o.className = 'Array';
            o.description = 'Array[' + obj.length + ']';
        } else if (obj instanceof Date) {
            o.subtype = 'date';
            o.description = obj.toString();
        } else if (obj === null) {
            o.subtype = 'null';
        } else if (obj instanceof RegExp) {
            o.className = 'RegExp';
            o.subtype = 'regexp';
            o.description = obj.toString();
        }

        if (addValue || obj === null) o.value = obj;
        if (generatePreview) o.preview = RemoteObject.createPreview(obj);
    }

    if (o.objectId) {
        objects[o.objectId] = obj;

        if (objectGroup) {
            if (!objectGroups[objectGroup]) objectGroups[objectGroup] = {};
            objectGroups[objectGroup][o.objectId] = true;
        }
    }

    return o;
};

/**
 * Call frame from Stack trace
 *
 * @constructor
 */
function CallFrame (url, functionName, line, column) {
    /**
     * JavaScript script column number.
     * @type {number}
     */
    this.columnNumber = column;

    /**
     * JavaScript function name.
     * @type {string}
     */
    this.functionName = functionName;

    /**
     * JavaScript script line number.
     * @type {number}
     */
    this.lineNumber = line;

    /**
     * JavaScript script id.
     * @type {number}
     */
    //this.scriptId = scriptId;

    /**
     * JavaScript script name or url.
     * @type {string}
     */
    this.url = url;
}

/**
 * Console message object
 *
 * @constructor ConsoleMessage
 */
function ConsoleMessage (level, text, url, line, column, params) {
    /**
     * Message severity.
     * @type {string} ("debug" , "error" , "log" , "warning" ])
     */
    this.level = level;

    /**
     * Message text.
     * @type {string}
     */
    this.text = text;

    /**
     * Message source.
     * @type {string} ("appcache" , "console-api" , "css" , "deprecation" , "javascript" , "network" , "other" , "rendering" , "security" , "storage" , "xml")
     */
    this.source = 'console-api';

    /**
     * Optional
     * Column number in the resource that generated this message.
     * @type {number}
     */
    this.column = column;

    /**
     * Optional
     * Line number in the resource that generated this message.
     * @type {number}
     */
    this.line = line;

    /**
     * @type {number}
     */
    this.timestamp = Date.now() / 1000;

    /**
     * Optional
     * Message parameters in case of the formatted message.
     * @type {Array.<RemoteObject>}
     */
    this.parameters = params || undefined;

    /**
     * Optional
     * Repeat count for repeated messages.
     * @type {number}
     */
    this.repeatCount = undefined;

    /**
     * Optional
     * JavaScript stack trace for assertions and error messages.
     * @type {Array.<CallFrame>}
     */
    this.stackTrace = undefined;

    /**
     * Optional
     * Console message type.
     * @type {string} ("assert" , "clear" , "dir" , "dirxml" , "endGroup" , "log" , "profile" , "profileEnd" , "startGroup" , "startGroupCollapsed" , "table" , "timing" , "trace")
     */
    this.type = 'log';

    /**
     * Optional
     * URL of the message origin.
     * @type {string}
     */
    this.url = url || undefined;
}

/**
 * Timeline Event
 *
 * @param {Object} options
 * @constructor
 */
var TimelineEvent = function TimelineEvent (options) {
    options = options || {};

    this.startTime = Date.now(),
    this.endTime = null;
    this.data = options.data;
    this.type = options.type;
    this.children = [];

    //var memory = process.memoryUsage();
    //this.usedHeapSize = memory.heapUsed;
    //this.totalHeapSize = memory.heapTotal;
};

/**
 * Add a child event
 *
 * @param {Object} child
 */
TimelineEvent.prototype.addChild = function (child) {
    this.children.push(child);
};

/**
 * Finish the object
 *
 * @param {Object} data
 * @returns {TimelineEvent}
 */
TimelineEvent.prototype.end = function (data) {
    this.endTime = Date.now();
    util._extend(this.data, data);

    return this;
};

TimelineEvent.EventDispatch = "EventDispatch";
TimelineEvent.TimerInstall = "TimerInstall";
TimelineEvent.TimerRemove = "TimerRemove";
TimelineEvent.TimerFire = "TimerFire";
TimelineEvent.TimeStamp = "TimeStamp";
TimelineEvent.FunctionCall = "FunctionCall";
TimelineEvent.GCEvent = "GCEvent";
TimelineEvent.EvaluateScript = "EvaluateScript";
TimelineEvent.UpdateCounters = "UpdateCounters";

/**
 * Runtime controller
 *
 * @type {{register: Function, callFunctionOn: Function, getProperties: Function, getFunctionDetails: Function, releaseObject: Function, releaseObjectGroup: Function}}
 */
var Runtime = {
    register: function (result, objectGroup, returnByValue, generatePreview) {
        var ro = RemoteObject.wrapObject(result, returnByValue, generatePreview, objectGroup);
        return ro.toString().match(/.{1,80}/g).slice();
    },

    callFunctionOn: function (objectId, fn, args, returnByValue, generatePreview) {
        for (var i = 0; i < args.length; i++) args[i] = getFunctionCallArgs(args[i]);

        var result = fn.apply(objects[objectId], args);
        var ro = RemoteObject.wrapObject(result, returnByValue, generatePreview);
        return ro.toString().match(/.{1,80}/g).slice();
    },

    getProperties: function (objectId, ownProperties, accessorPropertiesOnly) {
        var object = objects[objectId];
        var descriptors = getPropertyDescriptors(object, ownProperties, accessorPropertiesOnly);

        if (descriptors.length === 0 && "arguments" in object) {
            for (var key in object) {
                descriptors.push({
                    name: key,
                    value: object[key],
                    writable: false,
                    configurable: false,
                    enumerable: true
                });
            }
        }

        for (var i = 0; i < descriptors.length; ++i) {
            var descriptor = descriptors[i];
            if (descriptor.get) descriptor.get = RemoteObject.wrapObject(descriptor.get);
            if (descriptor.set) descriptor.set = RemoteObject.wrapObject(descriptor.set);
            if (descriptor.hasOwnProperty('value')) descriptor.value = RemoteObject.wrapObject(descriptor.value);
            if (descriptor.configurable) descriptor.configurable = false;
            if (descriptor.enumerable) descriptor.enumerable = false;
        }

        return JSON.stringify(descriptors).match(/.{1,80}/g).slice();
    },

    getFunctionDetails: function (objectId) {
        var fn = objects[objectId];
        return JSON.stringify({
            details: {
                location: {
                    scriptId: 0,
                    lineNumber: 0,
                    columnNumber: 0
                },
                name: fn.name,
                scopeChain: []
            }
        }).match(/.{1,80}/g).slice();
    },

    releaseObject: function (objectId) {
        if (objects.hasOwnProperty(objectId)) delete objects[objectId];
        Object.keys(objectGroups).forEach(function (group) {
            if (objectGroups[group].hasOwnProperty(objectId)) delete objectGroups[group][objectId];
        });
    },

    releaseObjectGroup: function (group) {
        if (objectGroups.hasOwnProperty(group)) {
            Object.keys(objectGroups[group]).forEach(function (objectId) {
                if (objects.hasOwnProperty(objectId)) delete objects[objectId];
            });

            delete objectGroups[group];
        }
    }
};

/**
 * Timeline controller
 *
 * @type {{orgEmit: (Function|EventEmitter.emit), orgAddListener: (Function|EventEmitter.addListener|Readable.addListener|addListener), orgRemoveListener: (Function|EventEmitter.removeListener), orgSetTimeout: Function, orgClearTimeout: (Function|*), orgSetInterval: Function, orgClearInterval: (Function|*), started: boolean, statsInterval: number, timers: number, totalTimers: number, counter: number, count: number, listeners: number, totalListeners: number, emit: Function, emitHandler: Function, addListener: Function, removeListener: Function, createTimerHandler: Function, setTimer: Function, clearTimer: Function, wrap: Function, start: Function, stop: Function}}
 */
var Timeline = {
    orgEmit: process.EventEmitter.prototype.emit,
    orgAddListener: process.EventEmitter.prototype.addListener,
    orgRemoveListener: process.EventEmitter.prototype.removeListener,
    orgSetTimeout: setTimeout,
    orgClearTimeout: clearTimeout,
    orgSetInterval: setInterval,
    orgClearInterval: clearInterval,

    started: false,
    statsInterval: 0,

    timers: 0,
    totalTimers: 0,
    counter: 1,
    count: 0,
    listeners: 0,
    totalListeners: 0,

    emit: function (evt) {
        global.process.___NODEBUG.emit('timelineEvent', evt)
    },

    emitHandler: function (type) {
        if (!Timeline.started) {
            return Timeline.orgEmit.apply(this, arguments);
        }

        var timelineEvent = new TimelineEvent({
            type: TimelineEvent.EventDispatch,
            data: {type: type}
        });

        Timeline.count ++;

        var result = Timeline.orgEmit.apply(this, arguments);
        if (result) {
            timelineEvent.end();
            var stack = getStack();

            var functionEvent = new TimelineEvent({
                type: TimelineEvent.FunctionCall,
                data: {
                    scriptName: v8NameToInspectorUrl(stack[1].getFileName()),
                    scriptLine: stack[1].getLineNumber(),
                    listeners: result
                }
            });

            functionEvent.stackTrace = [];
            for (var i = 1; i < stack.length; i++) {
                if (i === 2) continue;
                var callee = stack[i];
                functionEvent.stackTrace.push({
                    functionName: callee.getFunctionName(),
                    url: v8NameToInspectorUrl(callee.getFileName()),
                    lineNumber: callee.getLineNumber(),
                    columnNumber: callee.getColumnNumber()
                });
            }
            timelineEvent.addChild(functionEvent.end());

            Timeline.emit(timelineEvent);
        }

        return result;
    },

    addListener: function (name, fn) {
        if (typeof fn !== 'function') {
            // Strange fn type. Let's just throw it to the regular addListener.
            Timeline.orgAddListener.apply(this, arguments);
            return;
        }

        Timeline.listeners ++;
        Timeline.orgAddListener.apply(this, arguments);
    },

    removeListener: function (name, fn) {
        if (typeof fn !== 'function') {
            // Strange fn type. Let's just throw it to the regular addListener.
            Timeline.orgRemoveListener.apply(this, arguments);
            return;
        }

        Timeline.listeners --;
        Timeline.orgRemoveListener.apply(this, arguments);
    },

    createTimerHandler: function (timerId, cb) {
        return function () {
            if (this._timerId) {
                Timeline.count ++;
                Timeline.totalTimers --;
                if (Timeline.started) Timeline.timers --;
            }

            if (!Timeline.started) {
                // Just execute the regular callback.
                return cb(arguments);
            }

            // Every time a timer fires, we have to fire a TimerFire event.
            var timelineEvent = new TimelineEvent({
                type: TimelineEvent.TimerFire,
                data: {timerId: timerId}
            });

            // Execute the regular callback.
            cb (arguments);

            // Log time and emit the event.
            Timeline.emit(timelineEvent.end());
        }
    },

    setTimer: function (cb, after, repeat, args) {
        // Always set timeouts with our function but check if timeline is enabled to fire events.
        // This is because we need always to know when a timer fires so that if we start the timeline later,
        // we can still see the timer firing.

        var org = repeat ? Timeline.orgSetInterval : Timeline.orgSetTimeout;
        var timer;

        if (typeof cb !== 'function') {
            // Strange cb type. Let's just throw it to the regular timer setter.
            org.apply(this, args);
            return;
        }

        // Increment counters
        Timeline.totalTimers ++;
        Timeline.count++;

        // Create the timer handler
        var timerId = Timeline.counter ++;
        args[0] = Timeline.createTimerHandler(timerId, cb, repeat);
        if (!Timeline.started) {
            // Execute the normal timer factory
            timer = org.apply(this, args);
            timer._timerId = timerId;
            return timer;
        }

        // Increment counters
        Timeline.timers ++;

        // Create the timeline event and the child function call event
        var timelineEvent = new TimelineEvent({
            type: TimelineEvent.TimerInstall,
            data: {timerId: timerId, timeout: after, repeat: repeat}
        });

        var stack = getStack();

        var functionEvent = new TimelineEvent({
            type: TimelineEvent.FunctionCall,
            data: {
                scriptName: v8NameToInspectorUrl(stack[2].getFileName()),
                scriptLine: stack[2].getLineNumber()
            }
        });

        functionEvent.stackTrace = [];
        for (var i = 2; i < stack.length; i++) {
            if (i === 3) continue;
            var callee = stack[i];
            functionEvent.stackTrace.push({
                functionName: callee.getFunctionName(),
                url: v8NameToInspectorUrl(callee.getFileName()),
                lineNumber: callee.getLineNumber(),
                columnNumber: callee.getColumnNumber()
            });
        }

        timelineEvent.addChild(functionEvent.end());

        // Execute the normal timer factory
        timer = org.apply(this, args);
        timer._timerId = timerId;

        // End and emit the timer event
        Timeline.emit(timelineEvent.end());
        return timer;
    },

    clearTimer: function (timer) {
        var org = timer._repeat ? Timeline.orgClearInterval : Timeline.orgClearTimeout;
        var result;

        if (timer._timerId) {
            Timeline.totalTimers --;
            if (Timeline.started) Timeline.timers --;
        }

        if (!Timeline.started || !timer._timerId) {
            // Execute the normal timer factory
            result = org.apply(this, arguments);
            return result;
        }

        var timelineEvent = new TimelineEvent({
            type: TimelineEvent.TimerRemove,
            data: {timerId: timer._timerId}
        });

        var stack = getStack();

        var functionEvent = new TimelineEvent({
            type: TimelineEvent.FunctionCall,
            data: {
                scriptName: v8NameToInspectorUrl(stack[2].getFileName()),
                scriptLine: stack[2].getLineNumber()
            }
        });

        functionEvent.stackTrace = [];
        for (var i = 2; i < stack.length; i++) {
            if (i === 3) continue;
            var callee = stack[i];
            functionEvent.stackTrace.push({
                functionName: callee.getFunctionName(),
                url: v8NameToInspectorUrl(callee.getFileName()),
                lineNumber: callee.getLineNumber(),
                columnNumber: callee.getColumnNumber()
            });
        }
        timelineEvent.addChild(functionEvent.end());

        result = org.apply(this, arguments);
        Timeline.emit(timelineEvent.end());
        return result;
    },

    wrap: function () {
        global.setTimeout = function (cb, after) {
            return Timeline.setTimer(cb, after, false, arguments);
        };

        global.setInterval = function (cb, after) {
            return Timeline.setTimer(cb, after, true, arguments);
        };

        process.EventEmitter.prototype.emit = Timeline.emitHandler;

        global.clearTimeout = Timeline.clearTimer;
        global.clearInterval = Timeline.clearTimer;

        EventEmitter.prototype.addListener = process.EventEmitter.prototype.addListener = Timeline.addListener;
        EventEmitter.prototype.on = process.EventEmitter.prototype.on = Timeline.addListener;
        EventEmitter.prototype.removeListener = process.EventEmitter.prototype.removeListener = Timeline.removeListener;
    },

    start: function (maxCallStack) {
        // TODO: maxCallStack
        var $this = this;
        var timerCounter = 0;
        var timers = {};

        /*
        TODO: enable GC events in future
        gc.on('gc', function (info) {
            var event = new TimelineEvent({
                type: TimelineEvent.GCEvent,
                data: {
                    forced: info.forced,
                    type: info.type,
                    jsEventListeners: Timeline.listeners,
                    jsHeapSizeUsed: process.memoryUsage().heapUsed
                }
            });

            event.end();
            event.startTime = info.date.getTime();
            event.endTime = event.startTime + Math.round(info.duration);
            Timeline.emit(event);
        });
        */

        var timelineEvent = new TimelineEvent({
            type: TimelineEvent.UpdateCounters
        });

        Timeline.statsInterval = Timeline.orgSetInterval(function () {
            Timeline.emit(new TimelineEvent({
                type: TimelineEvent.UpdateCounters,
                data: {
                    jsEventListeners: Timeline.listeners,
                    jsHeapSizeUsed: process.memoryUsage().heapUsed
                }
            }));
        }, 500);

        Timeline.started = true;
        return true;
    },

    stop: function () {
        //global.process.EventEmitter.prototype.emit = this.orgEmit;
        Timeline.started = false;
        if (Timeline.statsInterval) Timeline.orgClearInterval(Timeline.statsInterval);
        return true;
    }
};

/**
 * Profiler controller
 *
 * @type {{startCpu: Function, stopCpu: Function, takeSnapshot: Function, startHeap: Function, stopHeap: Function}}
 */
var Profiler = {
    startCpu: function () {
        cpuProfiler.startProfiling('cpu-block', true);
    },

    stopCpu: function () {
        var data = cpuProfiler.stopProfiling('cpu-block');
        var file = os.tmpdir() + '/' + snapshotId + '.cpusnapshot';

        try {
            fs.writeFileSync(file, JSON.stringify(data));
        } catch (e) {
            // Ignore errors here.
            return;
        }

        // On successful write, just send an event for the server to read it.
        global.process.___NODEBUG.emit('cpuReady', {file: file});
    },

    takeSnapshot: function () {
        //process.nextTick(function () {
            heapdump.writeSnapshot(os.tmpdir() + '/' + snapshotId + '.heapsnapshot', function (err, filename) {
                var stats = fs.statSync(filename);
                var size = stats["size"];

                global.process.___NODEBUG.emit('snapshotProgress', {
                    done: size,
                    total: size,
                    finished: true,
                    file: filename
                });
            });
        //});

        return true;
    },

    startHeap: function () {
        // TODO: implement
    },

    stopHeap: function () {
        // TODO: implement
    }
};

/**
 %s    Formats the value as a string.
 %d or %i    Formats the value as an integer.
 %f    Formats the object as a floating point value.
 %o or % O    Formats the value as an expandable JavaScript object.
 %c    Applies CSS style rules to output string specified by the second parameter.

 * @param {string} level
 * @param {string} str
 * @param {...*} [param]
 */
ConsoleMessage.wrapMessage = function (level, str, param) {
    // The DevTools only accept already formatted messages.
    // We need to do all the job and send remote objects for the big stuff.
    // All the rest must be normal formatted data, similar to the Runtime.

    var stack = getStack();
    var file = v8NameToInspectorUrl(stack[2].getFileName());
    var line = stack[2].getLineNumber();
    var column = stack[2].getColumnNumber();
    var params = [];

    var len = arguments.length;
    var i = 2;

    // Minimum 2 parameters
    if (len < 1) return;
    if (len == 1) {
        str = '';
        arguments[1] = '';
        len = 2;
    }

    // All parameters are actual parameters, even the first string.
    for (i = 1; i < len; i++) {
        var type = typeof arguments[i];
        if (type === 'object' || type === 'array' || type === 'function') {
            params.push(RemoteObject.wrapObject(arguments[i], false, true));
        } else {
            params.push({type: type, value: arguments[i]});
        }
    }

    /*

    It's better in the devtools console if we don't show any colors in the strings after the first one.
    This is because to do that we need to concat all strings in the first one (devtools requirement for formatted messages).
    But this makes it worse for integers and objects, because they have to be embedded and it doesn't look good.
    That's why we will disable this for now, but after all the coding it's hard to delete it.

     var flags = 0;
     len = params.length;

    // Put all string parameters in the first one.
    if (params[0].type === 'string' && len > 1) {
        i = 1;

        params[0].value = str.replace(regExp, function (x) {
            if (i >= len || x !== '%s' || params[i].type !== 'string') {
                if (x !== '%%' && i < len) {
                    flags ++;
                    i ++;
                }
                return x;
            }

            var s = params[i].value;
            params.splice(i, 1);
            len --;

            return s;
        });

        len = params.length;
    }

    // Now get all string params again (maybe there are some in the end or the first one is not a string)
    var tail = '';
    for (i = 1; i < len; i ++) {
        if (params[i].type !== 'string') {
            //if (i <= flags) tail += ' ';
            if (params[i].type === 'number') tail += ' %d';
            else tail += ' %O';
            continue;
        }

        if (params[i].value.length > 0) tail += ' ' + params[i].value;
        params.splice(i, 1);
        i --; len --;
    }

    // Add the tail to the message.
    if (tail.length > 0) {
        if (params[0].type === 'string') {
            params[0].value += tail;
        } else {
            params.unshift({
                type: 'string',
                value: tail.substr(1)
            });
        }
    }
    */

    var msg = new ConsoleMessage(level, params[0].type === 'string' ? params[0].value : '', file, line, column, params);
    msg.stackTrace = [];

    // Generate call stack
    if (level == 'error' || level == 'trace') {
        for (i = 2; i < stack.length; i ++) {
            msg.stackTrace.push(new CallFrame(
                v8NameToInspectorUrl(stack[i].getFileName()),
                stack[i].getFunctionName(),
                stack[i].getLineNumber(),
                stack[i].getColumnNumber()
            ));
        }
    }

    return msg;
};

/**
 * Console controller
 *
 * @type {{console: (*|Console|console), org: {log: Console.log, warn: Console.warn, error: (Console.error|*), info: (Console.info|*)}, send: Function, wrap: Function}}
 */
var Console = {
    console: global.console,
    org: {
        log: global.console.log,
        warn: global.console.warn,
        error: global.console.error,
        info: global.console.info,
        trace: global.console.trace,
        dir: global.console.dir,
        time: global.console.time,
        timeEnd: global.console.timeEnd
    },

    send: function (message) {
        global.process.___NODEBUG.emit('message', message);
    },

    wrap: function () {
        global.console.log = function () {
            var args = ['log'];
            for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
            var msg = ConsoleMessage.wrapMessage.apply(this, args);
            Console.send(msg);

            return Console.org.log.apply(Console.console, arguments);
        };

        global.console.info = function () {
            var args = ['info'];
            for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
            var msg = ConsoleMessage.wrapMessage.apply(this, args);
            Console.send(msg);

            return Console.org.log.apply(Console.console, arguments);
        };

        global.console.warn = function () {
            var args = ['warning'];
            for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
            var msg = ConsoleMessage.wrapMessage.apply(this, args);
            Console.send(msg);

            return Console.org.warn.apply(Console.console, arguments);
        };

        global.console.error = function () {
            var args = ['error'];
            for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
            var msg = ConsoleMessage.wrapMessage.apply(this, args);
            Console.send(msg);

            return Console.org.error.apply(Console.console, arguments);
        };

        global.console.dir = function (object) {
            var msg = ConsoleMessage.wrapMessage('log', object);
            msg.type = 'dir';

            Console.send(msg);
            return Console.org.dir.apply(Console.console, arguments);
        };

        global.console.time = function (label) {
            this._times[label] = Date.now();
           // return Console.org.time.apply(Console.console, arguments);
        };

        global.console.timeEnd = function (label) {
            var time = this._times[label];
            if (!time) throw new Error('No such label: ' + label);

            var duration = Date.now() - time;
            this.info('%s: %dms', label, duration);

            //return Console.org.timeEnd.apply(Console.console, arguments);
        };

        global.console.trace = function () {
            var args = ['trace'];
            for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
            var msg = ConsoleMessage.wrapMessage.apply(this, args);
            msg.type = 'trace';
            Console.send(msg);

            var err = new Error;
            err.name = 'Trace';
            err.message = util.format.apply(this, arguments);
            Error.captureStackTrace(err, arguments.callee);
            Console.org.error.apply(Console.console, [err.stack]);
        };
    }
};

Console.wrap();
Timeline.wrap();

/**
 * Export function
 *
 * @param {Object} options
 */
module.exports = function (options) {
    cpuProfiler = require(options['v8-profiler']);
    heapdump = require(options['heapdump']);

    // Events prefix & suffix
    var eventsPrefix = options.eventsPrefix;
    var eventsSuffix = options.eventsSuffix;

    // Keep a short reference to stdout
    var out = process.stderr;

    var id = 0;
    var events = [];

    global.require = require;

    global.process.___NODEBUG = {
        // Keep a reference to the real require (may be replaced by the user)
        require: require,

        // Prevent from closing before getting all events.

        emit: function(name, data) {
            id ++;

            events[id] = JSON.stringify({
                name: name,
                data: data
            });

            out.write(eventsPrefix + id + eventsSuffix);
            eCount ++;
            wait();
        },

        getEvent: function (id) {
            if (!events.hasOwnProperty(id)) return '';
            var event = events[id];
            delete events[id];

            eCount --;

            return event.match(/.{1,80}/g).slice();
        },

        runtime: Runtime,
        profiler: Profiler,
        timeline: Timeline,
        console: Console
    };

    // Fake the process that it's a normal TTY (usually used in colors and other similar packages)
    process.stdout.isTTY = true;
};