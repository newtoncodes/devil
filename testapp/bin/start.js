// Test application

console.info("This is a test application for Devil.");
console.log('process.argv', process.argv);

console.log("---");
console.log("Testing console.log.");
console.warn("Testing console.warn.");
console.error("Testing console.error.");
console.trace("Testing console.trace.");

var test = require('../src/test');
test.start();

function testFunction(arg1, arg2) {
    console.log(arg1, arg2);
    return 100;
}

global.testVar = 123;
global.testFunction = testFunction;
global.testArray = [1, 2, 3, 'stringy'];
global.testRegex = /.*?/g;

console.log("The end.");