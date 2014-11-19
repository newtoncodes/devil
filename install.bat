#!/usr/bin/env node
/* THIS IS A HACK FOR WINDOWS. THIS FILE SHOULD NOT BE RUN ON WINDOWS, but there is no way to do that, so we just hack it.
@echo off
goto end
*/

var fs = require("fs"),
    path = require("path");

function dirMode(mode) {
    if (mode & 0400) mode |= 0100;
    if (mode & 040) mode |= 010;
    if (mode & 04) mode |= 01;
    return mode
}

function chmodrSync(p, mode) {
    var children;
    try {
        children = fs.readdirSync(p)
    } catch (er) {
        if (er && er.code === "ENOTDIR") return fs.chmodSync(p, mode);
        throw er
    }
    if (!children.length) return fs.chmodSync(p, dirMode(mode));

    children.forEach(function (child) {
        chmodrSync(path.resolve(p, child), mode)
    });
    return fs.chmodSync(p, dirMode(mode))
}

try {
    chmodrSync(__dirname + '/../node_modules/nodewebkit/nodewebkit', 0755);
} catch (e) {
    // Do nothing.
}

console.log("Fixed node-webkit permissions.");
console.log("If you are having trouble launching the client, please check the permissions of:");
console.log("    " + __dirname + '/../node_modules/nodewebkit/nodewebkit');

/*
:end */
