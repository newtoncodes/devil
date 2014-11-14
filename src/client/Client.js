var util = require('util'),
    EventEmitter = require('events').EventEmitter,
    WebSocket = require('ws');

function Client (src) {
    var $this = this;

    var _host = null;
    var _port = null;
    var _ws = null;

    var _running = false;
    var _paused = false;
    var _connected = false;

    var _requests = {};
    var _nextId = 1;

    var _token = null;

    var _messageHandler = function (message) {
        console.log("[MESSAGE]", message);

        try {
            var data = JSON.parse(message);
        } catch (e) {
            $this.emit("error", "Cannot parse JSON message from server.");
            return;
        }

        if (typeof data !== 'object') {
            return $this.emit("error", "A JSON message from the server is not an object.");
        }

        if (!data.id) {
            // Notification
            $this.emit(data.method + 'Notification', data.params);
        } else {
            // Response
            if (!_requests[data.id]) return $this.emit("error", "Got response twice? Not existing id.");
            var fn = _requests[data.id];
            delete _requests[data.id];
            fn(data.error, data.params);
        }
    };

    var _request = function (method, params, callback) {
        if (!params) params = {};

        var data = {
            params: params
        };

        data.id = _nextId ++;
        data.method = method;
        _requests[data.id] = callback;

        _ws.send(JSON.stringify(data));
    };

    this.on('connectedNotification', function (data) {
        _token = data.token;
        $this.emit('connect', _token);
    });

    this.on('stopNotification', function (data) {
        $this.emit('stop');
        _running = false;
        _paused = false;
    });

    this.on('pauseNotification', function (data) {
        $this.emit('pause');
        _paused = true;
    });

    this.on('resumeNotification', function (data) {
        $this.emit('resume');
        _paused = false;
    });

    this.on('errorNotification', function (data) {
        $this.emit('error', data);
    });

    this.connect = function (host, port, callback) {
        if (_connected || _ws) this.disconnect();

        console.log("[INFO] Connecting to " + host + ":" + port);

        var tmp = false;
        var _cb = function (err) {
            if (!tmp) callback(err);
            else {
                tmp = true;
                if (err) $this.disconnect(err);
            }
        };

        _host = host;
        _port = port;

        _ws = new WebSocket('ws://' + _host + ':' + _port);

        _ws.on('open', function () {
            _ws.send('Greetings, Master!');
        });

        _ws.once('message', function (message) {
            console.log("[MESSAGE]", message);

            if (message == 'Don\'t speak to me, scum, I am the Devil!') {
                $this.once('connect', _cb.bind($this, null));
                _connected = true;
                _ws.on('message', _messageHandler);
            } else {
                // THis is not our server. Get out of here.
                _cb(new Error("This is not a devil server."));
            }
        });

        _ws.on('close', function () {
            console.log("[ERROR] WebSocket closed.");
            _cb(new Error('Connection closed.'));
        });

        _ws.on('error', function (err) {
            console.log("[ERROR]", err);
            _cb(err);
        });
    };

    this.disconnect = function (error) {
        console.log("[INFO] Disconnecting from " + _host + ":" + _port);

        if (_ws) {
            _ws.removeAllListeners();
            _ws.close();
        }

        this.emit('disconnect', error);
        _running = false;
        _paused = false;
        _connected = false;
        _ws = null;
    };

    this.run = function (options, callback) {
        if (_running) return callback(new Error('Already running.'));

        // The server will initialize a new session and send a ready event.
        _request('run', options, function (err, data) {
            if (err) return callback(err);

            src('devtools/devtools.html?ws=' + _host + ':' + _port + '/' + _token);
            _running = true;

            callback();
        });
    };

    this.pause = function (callback) {
        if (!_running) return callback(new Error('Not running.'));
        if (_paused) return callback();
        _request('pause', null, function (err, data) {
            if (err) return callback(err);

            _paused = true;
            callback();
        });
    };

    this.resume = function (callback) {
        if (!_running) return callback(new Error('Not running.'));
        if (!_paused) return callback();
        _request('resume', null, function (err, data) {
            if (err) return callback(err);

            _paused = false;
            callback();
        });
    };

    this.stop = function (callback) {
        if (!_running) return callback(new Error('Not running.'));
        _request('stop', null, function (err, data) {
            if (err) return callback(err);
            $this.emit('stop');

            callback();
        });
    };
}

util.inherits(Client, EventEmitter);
module.exports = Client;