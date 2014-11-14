var util = require('util'),
    Agent = require('../Agent'),
    agents = {};

/**
 This module will implement the full console API.
 https://developer.chrome.com/devtools/docs/protocol/1.1/console
 */

/**
 * Console Agent
 *
 * @param {Debugger} debugger_
 * @constructor
 * @augments Agent
 */
agents.Console = function (debugger_) {
    Agent.call(this, debugger_, {
        enable: null,
        disable: null
    });

    var _lastMessage = null;
    var _repeatCount = 1;

    var $this = this;

    //
    // Private stuff
    var _addMessage = function () {
        $this.emit('notification', 'Console.messageAdded', message);
    };

    //
    // Public stuff

    this.clear = function () {
        $this.emit('notification', 'Console.messagesCleared');
    };

    this.clearMessages = function (params, callback) {
        _messages = [];
        callback();
        this.clear();
    };

    // Events and handlers

    var _messageHandler = function (message) {
        if (message.stackTrace) for (var i = 0; i < message.stackTrace.length; i++) {
            if (!$this._debugger.scriptManager.sourcesMap[message.stackTrace[i].url]) continue;
            message.stackTrace[i].scriptId = $this._debugger.scriptManager.sourcesMap[message.stackTrace[i].url];
        }

        prepareMessage(message.parameters);

        $this.emit('notification', 'Console.messageAdded', {
            message: message
        });
    };

    this._debugger.on('runtimeError', function (event) {
        // type, text

        $this.emit('notification', 'Console.messageAdded', {
            message: ConsoleMessage.wrapError(event.type, event.error, event.callFrames),
            callStack: event.callFrames
        });
    });

    this._debugger.on('evalError', function (error) {
        // type, text

        $this.emit('notification', 'Console.messageAdded', {
            message: ConsoleMessage.wrapError('error', error)
        });
    });

    this._debugger.on('message', _messageHandler);
};

util.inherits(agents.Console, Agent);
module.exports = agents.Console;

agents.Console.prototype._methods = [
    'enable',
    'disable',
    'clearMessages'
];

// TODO: timers and other console functions that are not implemented.

/**
 * Console message object
 * @constructor Console.Message
 */
function ConsoleMessage(level, text, url, line, column, params) {
    this.level = level;
    this.text = text;
    this.source = 'console-api';
    this.column = column;
    this.line = line;
    this.timestamp = Date.now() / 1000;
    this.parameters = params || undefined;
    this.url = url || undefined;
}

var errName = function (message) {
    var nameMatch = /^([^:]+):/.exec(message);
    return nameMatch ? nameMatch[1] : 'Error';
};

ConsoleMessage.wrapError = function (level, error, stack) {
    var file = '', line = 0, column = 0;

    if (stack && stack.length) {
        line = stack[0].location.lineNumber;
        column = stack[0].location.columnNumber;
    }

    if (typeof error !== 'string') error = error.message ? error.message : (error.description ? error.description : 'Unknown error');
    var params = [{type: 'string', value: error}];
    var msg = new ConsoleMessage(level, params[0].value, file, line, column, params);

    if (stack && stack.length > 0) {
        msg.stackTrace = [];

        for (var i = 0; i < stack.length; i ++) {
            if (!stack[i].location) continue;

            msg.stackTrace.push({
                functionName: stack[i].functionName,
                scriptId: stack[i].location.scriptId,
                lineNumber: stack[i].location.lineNumber,
                columnNumber: stack[i].location.columnNumber
            });
        }
    }

    return msg;
};

var styles = {};
var codes = {
    reset: [0, 0],

    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
    inverse: [7, 27],
    hidden: [8, 28],
    strikethrough: [9, 29],

    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
    grey: [90, 39],

    bgBlack: [40, 49],
    bgRed: [41, 49],
    bgGreen: [42, 49],
    bgYellow: [43, 49],
    bgBlue: [44, 49],
    bgMagenta: [45, 49],
    bgCyan: [46, 49],
    bgWhite: [47, 49]
};

var cssStyles = {
    reset: 'color: inherit; background: inherit; font-weight: inherit; font-style: inherit; text-decoration: inherit;',

    bold: 'font-weight: bold;',
    boldClose: 'font-weight: inherit;',
    dim: 'font-weight: 300;',
    dimClose: 'font-weight: inherit;',

    italic: 'font-style: italic;',
    italicClose: 'font-style: inherit;',
    underline: 'text-decoration: underline;',
    underlineClose: 'text-decoration: inherit;',
    strikethrough: 'text-decoration: line-through',
    strikethroughClose: 'text-decoration: inherit;',

    inverse: '',
    inverseClose: '',
    hidden: '',
    hiddenClose: '',

    black: 'color: black;',
    blackClose: 'color: inherit;',
    red: 'color: red;',
    redClose: 'color: inherit;',
    green: 'color: green;',
    greenClose: 'color: inherit;',
    yellow: 'color: yellow;',
    yellowClose: 'color: inherit;',
    blue: 'color: blue;',
    blueClose: 'color: inherit;',
    magenta: 'color: magenta;',
    magentaClose: 'color: inherit;',
    cyan: 'color: cyan;',
    cyanClose: 'color: inherit;',
    white: 'color: white;',
    whiteClose: 'color: inherit;',
    grey: 'color: grey;',
    greyClose: 'color: inherit;',

    bgBlack: 'background-color: black;',
    bgBlackClose: 'background-color: inherit;',
    bgRed: 'background-color: red;',
    bgRedClose: 'background-color: inherit;',
    bgGreen: 'background-color: green;',
    bgGreenClose: 'background-color: inherit;',
    bgYellow: 'background-color: yellow;',
    bgYellowClose: 'background-color: inherit;',
    bgBlue: 'background-color: blue;',
    bgBlueClose: 'background-color: inherit;',
    bgMagenta: 'background-color: magenta;',
    bgMagentaClose: 'background-color: inherit;',
    bgCyan: 'background-color: cyan;',
    bgCyanClose: 'background-color: inherit;',
    bgWhite: 'background-color: white;',
    bgWhiteClose: 'background-color: inherit;'
};

Object.keys(codes).forEach(function (key) {
    var val = codes[key];

    // open
    var style = styles['\u001b[' + val[0] + 'm'] = {};
    style.open = true;
    style.name = key;

    style = styles['\u001b[' + val[1] + 'm'] = {};
    style.open = false;
    style.name = key;
});

var regExp = /%[sdjfioc%]/g;

function prepareMessage (arr) {
    formatMessage(arr);

    for (var i = 1; i < arr.length; i ++) {
        if (arr[i].type === 'string') arr[i].value = stripColors(arr[i].value);
    }
}

function formatMessage (arr) {
    if (arr[0].type !== 'string') return null;

    var idx = 1, i = 1, len = arr.length;
    var noMore = false;

    // We have to replace %j with %O
    arr[0].value = arr[0].value.replace(regExp, function (s) {
        if (s == '%%') return s;

        switch (s) {
            case '%f':
            case '%i':
            case '%o':
            case '%c':
            case '%O':
                return '%' + s;
            case '%j':
                if (i >= len) return s;
                noMore = true;
                i++;
                return '%O';
            case '%s':
                if (noMore || i >= len) return s;
                if (arr[i].type !== 'string') {
                    noMore = true;
                    return s;
                }

                s = arr[i].value;
                arr.splice(i, 1);
                len --;
                return s;
            default:
                noMore = true;
                i++;
                return s;
        }
    });

    while (arr.length > 1 && arr[1].type === 'string') arr[0].value += ' ' + arr.splice(1, 1)[0].value;

    arr[0].value = translateColors(arr[0].value, arr);
}

function translateColors (string, arr) {
    var idx = 1;

    string = string.replace(/(?:\x1B\[\d+m)+/g, function (g) {
        var matches = g.match(/\x1B\[\d+m/g);
        var style = '';
        for (var i = 0; i < matches.length; i++) {
            if (!styles[matches[i]] || styles[matches[i]].name == 'reset') continue;

            if (styles[matches[i]].open) style += (cssStyles[styles[matches[i]].name]);
            else style += (cssStyles[styles[matches[i]].name + 'Close']);
        }

        arr.splice(idx ++, 0, style);

        return '%c';
    });

    return string;
}

function stripColors(str) {
    return ("" + str).replace(/\x1B\[\d+m/g, '');
}