#!/usr/bin/env node

var fs = require("fs"),
    path = require("path"),
    exe = require('nodewebkit').findpath();

// If a party has r, add x
// so that dirs are listable
function dirMode(mode) {
    if (mode & 0400) mode |= 0100
    if (mode & 040) mode |= 010
    if (mode & 04) mode |= 01
    return mode
}

var isAccessible = function (path) {
    try {
        fs.readdirSync(path);
    } catch (e) {
        return false;
    }

    return true;
};

var chmod = function (dir) {
    if (isAccessible(dir)) return true;

    var parent = path.dirname(dir);
    if (parent !== dir && !isAccessible(parent)) {
        chmod(parent);
    }

    console.log("CHMOD", dir, 755);
    fs.chmodSync(dir, 755);
};

chmod(exe);