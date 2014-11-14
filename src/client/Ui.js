var Client = require('./Client');

console.dir(process.versions);

function Ui (window) {
    var $ = window.$;
    var document = window.document;
    var $this = this;

    // Load native UI library
    var args = window.nwDispatcher.requireNwGui().App.argv;
    var _host = args[0] || '127.0.0.1';
    var _port = parseInt(args[1]) || 9999;
    if (isNaN(_port)) _port = 9999;

    var _options = {};
    var _running = false;

    var _devtools = $("#devtools");
    var _frame = _devtools.find('iframe');

    var _fileDialog = $("#file_dialog");
    var _fileInput = $("#file_input");
    var _argsInput = $("#args_input");

    var _header = $(".header");

    var _loader = $('#loader');
    var _overlay = $("#overlay");
    var _overlay2 = $("#overlay2");
    var _busyOverlay = $("#busy");

    var _resumeBtn = $("#resume_btn");
    var _pauseBtn = $("#pause_btn");
    var _runBtn = $("#run_btn");
    var _stopBtn = $("#stop_btn");

    /**
     * @type {Client}
     */
    var _client = null;

    //
    // Private stuff

    var _getW = function (text) {
        return $("#hidden-shit").html(text).width();
    };

    var _resizeInputs = function (fv, av) {
        var max = $(window).width() - 281;

        var f = _fileInput;
        var a = _argsInput;

        var half = (max / 2);

        var fw = Math.max(_getW(fv || f.val()) + 47, 100);
        var aw = Math.max(_getW(av || a.val()) + 25, 80);

        if (aw > max * 0.4) {
            if (fw >= max * 0.6) {
                // Take the max values
                fw = max * 0.6;
                aw = max * 0.4;
            } else {
                // fw stays, increase aw
                aw = Math.min(aw, max - fw);
            }
        } else if (aw < max * 0.4) {
            if (fw < max * 0.6) {
                // Do nothing, we are ok anyway.
            } else {
                // aw stays, increase fw
                fw = Math.min(fw, max - aw);
            }
        }

        f.css('width', fw + 'px');
        a.css('width', aw + 'px');
    };

    var _checkRegex = function (el) {
        var r = el.val();

        try {
            new RegExp(r);
        } catch (e) {
            el.addClass('error');
            return;
        }

        el.removeClass('error');
    };

    var _getErrorMessage = function (err) {
        if (typeof err === 'stirng') return err;

        return err.message ? err.message : (err.description ? err.description : 'Unknown error');
    };

    //
    // View handlers

    var _connectHandler = function () {
        _loader.hide();
        _overlay.fadeOut(300);
        _overlay2.css('opacity', '1');
    };

    var _disconnectHandler = function () {
        _resumeHandler();

        _loader.show();
        _overlay.fadeIn(300);
        _overlay2.css('opacity', '0');
    };

    var _runHandler = function () {
        _resumeHandler();

        _runBtn.hide();
        _stopBtn.show();

        _overlay2.fadeOut(300, function () {
            _overlay2.hide();
        });

        _header.find("input[type=text]").prop('readonly', true);

        _resumeBtn.hide();
        if (_running) _pauseBtn.show();
        else _pauseBtn.hide();
    };

    var _pauseHandler = function () {
        _pauseBtn.hide();
        _resumeBtn.show();
    };

    var _resumeHandler = function () {
        _resumeBtn.hide();
        if (_running) _pauseBtn.show();
        else _pauseBtn.hide();
    };

    var _stopHandler = function () {
        _resumeHandler();

        _stopBtn.hide();
        _runBtn.show();

        _header.find("input[type=text]").prop('readonly', false);

        _resumeBtn.hide();
        _pauseBtn.hide();
    };

    var _busyHandler = function () {
        _busyOverlay.fadeIn(100);
    };

    var _finishHandler = function () {
        _busyOverlay.fadeOut(100);
    };

    var _resizeHandler = function () {
        _devtools.css({
            height: ($(window).height() - 51) + 'px'
        });
        _overlay.css({
            height: ($(window).height() - 50) + 'px'
        });
        _overlay2.css({
            height: ($(window).height() - 50) + 'px'
        });

        _resizeInputs();
    };

    //
    // Public stuff

    this.resizeInputs = function () {
        _resizeInputs();
    };

    this.browseFiles = function () {
        if (_running) return window.alert("Cannot change options while running.");
        _fileDialog.click();
    };

    this.addOne = function (val) {
        $('.modal-body .inputs').append('<div><span>/</span><span>/</span><input type="text" value="' + (val ? val : '') + '"><a href="#" onclick="$(this).parent().remove(); return false;"><i class="glyphicon glyphicon-remove"></i></a></div>');
    };

    this.openModal = function () {
        if (_running) return window.alert("Cannot change options while running.");
        var modal = $('#hidden-modal');

        modal.find('.inputs').html('');
        var arr = _options.hidden || [];
        arr.forEach(function (f) {
            $this.addOne(f);
        });

        modal.modal('show');
    };

    this.saveHiddenFiles = function () {
        var found = false;
        var arr = [];

        $('#hidden-modal .inputs input').each(function () {
            var r = $(this).val();

            try {
                if (!r.length) throw new Error('Empty.');
                new RegExp(r);
            } catch (e) {
                found = true;
                var res = window.confirm("'" + r + "' is not a valid regular expression. Do you want to ignore it?");
                if (!res) return false;
                else found = false;
                return;
            }

            arr.push(r);
        });

        if (found) return;

        _options.hidden = arr;
        $("#hidden-modal").modal('hide');
    };

    this.setOption = function (option, value, el) {
        if (_running) {
            if (el) $(el).prop('checked', !value);
            return window.alert("Cannot change options while running.");
        }

        _options[option] = value;
    };

    this.run = function () {
        if (_running) return window.alert("Already running.");
        _busyHandler();

        _client.run(_options, function (err) {
            _finishHandler();

            if (err) return window.alert(_getErrorMessage(err));

            _running = true;
            _runHandler();
        });
    };

    this.pause = function () {
        if (!_running) return window.alert("Not running.");
        _busyHandler();

        _client.pause(function (err) {
            _finishHandler();

            if (err) return window.alert(_getErrorMessage(err));
            _pauseHandler();
        });
    };

    this.resume = function () {
        if (!_running) return window.alert("Not running.");
        _busyHandler();

        _client.resume(function (err) {
            _finishHandler();

            if (err) return window.alert(_getErrorMessage(err));
            _resumeHandler();
        });
    };

    this.stop = function () {
        if (!_running) return window.alert("Not running.");
        _busyHandler();

        _client.stop(function (err) {
            _finishHandler();

            if (err) return window.alert(_getErrorMessage(err));
        });
    };

    //
    // Initialize

    // Set the connecting message
    _overlay.find(".msg").html("Connecting to " + _host + ":" + _port + "...");

    // Initial view stuff
    $(window).resize(_resizeHandler);
    _resizeHandler();

    // Tooltips
    $('[title]').each(function (el) {
        $(this).qtip({
            style: {
                classes: 'qtip qtip-dark'
            },
            position: {
                my: 'top center',
                at: 'bottom center',
                target: $(this)
            }
        });
    });

    _fileInput.on('keydown', function (evt) {
        if (evt.keyCode == 46 || evt.keyCode == 8) return;

        _resizeInputs($(this).val() + String.fromCharCode(evt.which));
    });

    _argsInput.on('keydown', function (evt) {
        if (evt.keyCode == 46 || evt.keyCode == 8) return;

        _resizeInputs(null, $(this).val() + String.fromCharCode(evt.which));
    });

    // Modal inputs
    $(document).on('keyup', '#hidden-modal input[type=text]', function () {
        _checkRegex($(this));
    });

    $(document).on('change', '#hidden-modal input[type=text]', function () {
        _checkRegex($(this));
    });

    _fileDialog.change(function (e) {
        _fileInput.val(_fileDialog.val());
        _fileInput.change();
    });

    // Bootstrap the real stuff

    _client = new Client(_frame.attr.bind(_frame, 'src'));

    _client.on('error', function (reason) {
        if (reason) window.alert("Error: " + _getErrorMessage(reason) + "");

        _running = false;
        _stopHandler();
    });

    _client.on('disconnect', function (reason) {
        if (reason) window.alert("Error: " + _getErrorMessage(reason) + "");

        _running = false;
        _stopHandler();
        _disconnectHandler();
    });

    _client.on('stop', function (reason) {
        if (reason) window.alert("Stopped: " + (reason ? _getErrorMessage(reason) : "Unknown reason"));

        _running = false;
        _stopHandler();
    });

    _client.on('pause', _pauseHandler);
    _client.on('resume', _resumeHandler);

    // Initial view is connecting
    var cb = function (err) {
        if (err) {
            _loader.find('span').html("Error: " + _getErrorMessage(err) + ". Reconnecting...");
            setTimeout(function () {
                _client.connect(_host, _port, cb);
            }, 1000);

            return;
        }

        _connectHandler();
    };
    
    _client.connect(_host, _port, cb);
}

module.exports = Ui;