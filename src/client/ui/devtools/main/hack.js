var _snd = WebSocket.prototype.send;
WebSocket.prototype.send = function () {
    console.log.apply(console, arguments);
    _snd.apply(this, arguments);
};

var _org = WebSocket;

window.WebSocket = function (arg) {
    var ret = new _org(arg);

    console.info("NEW INSTANCE OF WEBSICKET CREATED", ret);

    var _fn = null;

    ret.setShit = function (fn) {
        this._fn = fn;
        this.onmessage = function (evt) {
            evt.d = evt.data;

            try {
                var data = JSON.parse(evt.data.trim());
                /*if (data.id == 1) evt.d = '{"id":1,"result":{"result":false}}';

                if (data.id == 3) evt.d = '{"id":3,"result":{}}'; // Console.enable
                if (data.id == 4) evt.d = '{"id":4,"result":{}}'; // Network.enable
                if (data.id == 5) evt.d = '{"id":5,"result":{}}'; // Page.enable

                // Skip 6, it's ok: Page.getResourceTree

                if (data.id == 7) evt.d = '{"id":7,"result":{}}';   // Debugger.enable
                if (data.id == 8) evt.d = '{"id":8,"result":{}}';   // Debugger.setPauseOnExceptions

                if (data.id == 9) evt.d = '{"id":9,"result":{}}';   // Debugger.setAsyncCallStackDepth
                if (data.id == 10) evt.d = '{"id":10,"result":{}}'; // Debugger.skipStackFrames
                if (data.id == 11) evt.d = '{"id":11,"result":{}}'; // Runtime.enable
                if (data.id == 12) evt.d = '{"id":12,"result":{}}'; // DOM.enable
                if (data.id == 13) evt.d = '{"id":13,"result":{}}'; // CSS.enable
                if (data.id == 14) evt.d = '{"id":14,"result":{}}'; // Worker.enable
                if (data.id == 15) evt.d = '{"id":15,"result":{}}'; // Timeline.enable
                if (data.id == 16) evt.d = '{"id":16,"result":{}}'; // Database.enable
                if (data.id == 17) evt.d = '{"id":17,"result":{}}'; // DOMStorage.enable

                if (data.id == 18) evt.d = '{"id":18,"result":{}}'; // Profiler.enable // TODO: Fix later (PROFILER)
                if (data.id == 19) evt.d = '{"id":19,"result":{}}'; // Profiler.setSamplingInterval // TODO: Fix later (PROFILER)

                if (data.id == 20) evt.d = '{"id":20,"result":{}}'; // Worker.setAutoconnectToWorkers
                if (data.id == 21) evt.d = '{"id":21,"result":{}}'; // Inspector.enable
                if (data.id == 22) evt.d = '{"id":22,"result":{"result":false}}'; // Runtime.isRunRequired
*/
                //console.log("DATA", data);
            } catch (e) {
                //console.log('MSG', evt.data);
            }

            console.log("DATA", evt.data);

            var evt2 = Object.create(evt.constructor.prototype, {});
            evt2.constructor = evt.constructor;
            Object.getOwnPropertyNames(evt).forEach(function (key) {
                evt2[key] = evt[key];
            });
            evt2.data = evt.d;

            this._fn(evt);
        }
    };

    return ret;
};
window.WebSocket.prototype = _org.prototype;

/*
 Page.canScreencast {"id":1,"result":{"result":false}} Error: Not implemented.
 Worker.canInspectWorkers {"id":2,"result":{"result":true}} {"id":2,"result":{"result":false}}
 Console.enable {"id":3,"result":{}} EMPTY
 Network.enable {"id":4,"result":{}} EMPTY
 Page.enable {"id":5,"result":{}} EMPTY
 //Page.getResourceTree {"id":6,"result":{"frameTree":{"frame":{"id":"30399.1","loaderId":"30399.13","url":"file:///home/newton/workspace/nodebug/src/index.html","mimeType":"text/html","securityOrigin":"file://"},"resources":[{"url":"file:///home/newton/workspace/nodebug/src/wtf2.js","type":"Script","mimeType":"application/javascript"},{"url":"file:///home/newton/workspace/nodebug/src/wtf.js","type":"Script","mimeType":"application/javascript"}]}}}
 //Page.getResourceTree {"id":6,"result":{"frameTree":{"frame":{"id":"nodeinspector-toplevel-frame","url":"file:///home/newton/workspace/nodebug/bin/test.js","loaderId":"1414809205954-0834035447333008","_isNodeInspectorScript":true},"resources":[{"url":"file:///home/newton/workspace/nodebug/bin/nodebug.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/bin/test.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/colors/examples/normal-usage.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/colors/examples/safe-string.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/colors/lib/colors.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/colors/lib/custom/trap.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/colors/lib/custom/zalgo.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/colors/lib/extendStringPrototype.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/colors/lib/index.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/colors/lib/maps/america.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/colors/lib/maps/rainbow.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/colors/lib/maps/random.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/colors/lib/maps/zebra.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/colors/lib/styles.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/colors/lib/system/supports-colors.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/colors/safe.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/colors/tests/basic-test.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/colors/tests/safe-test.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/colors/themes/generic-logging.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/commander/index.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/node_modules/freeport/lib/freeport.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/src/client.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/src/server.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/src/wtf.js","type":"Script","mimeType":"text/javascript"},{"url":"file:///home/newton/workspace/nodebug/src/wtf2.js","type":"Script","mimeType":"text/javascript"}]}}}
  {"id":7,"result":{}} EMPTY
  {"id":8,"result":{}} EMPTY
  {"id":9,"result":{}} {"id":9,"error":"Error: Not implemented."}
  {"id":10,"result":{}} {"id":10,"error":"Error: Not implemented."}
  {"id":11,"result":{}} EMPTY
  {"id":12,"result":{}} Error: Not implemented.
  {"id":13,"result":{}} EMPTY
 {"id":14,"result":{}} Error: Not implemented.
  {"id":15,"result":{}} EMPTY
  {"id":16,"result":{}} EMPTY
  {"id":17,"result":{}} EMPTY
  {"id":18,"result":{}} Error: Not implemented.
  {"id":19,"result":{}} Error: Not implemented.
  {"id":20,"result":{}} EMPTY
 Inspector.enable {"id":21,"result":{}} Error: Not implemented.
 Runtime.isRunRequired {"id":22,"result":{"result":false}} EMPTY
 */