var colors = require('colors/safe');

var obj = {
    foo: 1,
    bar: 2,
    foobar: 3,
    moreThanOne: 2,
    longerThanAbc: 'abcd',
    andSomethingGood: {
        prop1: 'str',
        prop2: [1, 2, 3]
    },

    method1: function method1 () {
        return 500;
    },

    method2: function method2 (a, b) {
        return a + b;
    }
};

global.obj = global.testObject = obj;
global.test1 = 123;
global.test2 = 124;
global.test3 = 125;
global.test4 = 126;

var colorful = colors.bold.green('[TIMER]');
var colorful2 = colors.bold(colors.green(colors.dim('[TIMER]'))) + colors.green.bold('[info] ') + colors.green('Started at...') + ' test ' + colors.reset('Started at...');

global.colorful = colorful;
global.colorful2 = colorful2;
 
var EventEmitter = require('events').EventEmitter;
var testEmitter = new EventEmitter();

testEmitter.on('testEvent', function (data) {
    console.info("Emitted testEvent event.", data);
});

testEmitter.on('error', function (err) {
    console.info("Emitted error event:");
    console.error(err);
});

console.log(colors.bold.red('R'), colors.bold.green('G'), colors.bold.blue('B'), colors.dim('tiny'), colors.italic("or italic"));

console.log(colors.magenta("But there are no colors after non-strings:"), {
    foo: 'bar'
}, colors.bold.red('This should be bold and red, but it\'s not'));

console.log("testObject dump", testObject);
console.log("Testing console.dir...");
console.dir(testObject);
console.warn("It doesn't end here...");

console.time("timer for testing");
setTimeout(function () {
    console.timeEnd("timer for testing");
}, 2000);

console.log();

process.stdout.write("- Normal stdout test (this is not going to the console)\n");

var t = 0;
function _timer () {
    t++;
    console.log(colors.bold.green('TIMER'), t);
    obj.foo ++;

    if (Math.random() * 10 < 3) {
        testEmitter.emit('error', new Error("Random test error."));
    }

    if (Math.random() * 10 < 6) {
        testEmitter.emit('testEvent', {some: 'data'});
    }

    if (Math.random() * 10 < 5) {
        var to = setInterval(function () {
            // Never happening stuff.
            console.log("Random test timeout.");
        }, 1000);

        setTimeout(function () {
            clearInterval(to);
        }, 500);
    }
}

console.log("Installing a timer to slow your pc a little after 60 seconds.");

setTimeout(function () {
    for (var i = 0; i < 100000000; i ++) {
        var a = i * i;
    }
}, 60000);

module.exports = {
    start: function() {
        console.info("Installing an interval timer to keep the application alive forever (5 seconds).");
        setInterval(_timer, 2000);
    }
};