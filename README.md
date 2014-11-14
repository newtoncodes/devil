# Devil

**Devil** is a debugger/profiler for node.js with a GUI client. It uses the built-in WebKit DevTools GUI for Safari/Chromium/Chrome/etc... wrapped in [node-webkit](https://github.com/rogerwang/node-webkit).
The project is based on [node-inspector](https://github.com/node-inspector/node-inspector) and [node-webkit-agent](https://github.com/c4milo/node-webkit-agent)
(big thanks to the authors) but it's an entirely separate project. We have used a lot of node-inspector's code, refactored most of it, changed and added a lot. Thanks to [c4milo](https://github.com/c4milo)
for the great ideas for the timeline implementation!
* Check out the screenshots below or [here](http://imgur.com/a/tN6MU).

## Features

Unlike node-inspector, this app is GUI based and it's used mostly with the GUI. You can start any script from the GUI and restart is as many times as you want, reloading all the code every time. This makes
it much easier to debug and develop at the same time. You can have Devil running all the time and just start your program from it when it's time to test. It will show you all the output in the console and
the standard output of the process too.

#### Sources & debugger

You can view all the application sources, as long as it's running. Live editing is enabled and saving can be enabled using a button in the GUI. The debugger is fully functioning. All the functionality here
is almost fully based on [node-inspector](https://github.com/node-inspector/node-inspector), so again, thanks to the authors! We didn't have to start from scratch here. You can find many of node-inspector's
classes in our code.

#### Profiler

The profiler works as well. Continuous heap profiling is still not implemented, but you can take a snapshot and profile CPU. For heap snapshots we use a module called heapdump and for CPU - the v8-profiler,
again, developed by [node-inspector](https://github.com/node-inspector) team.
* CPU profiler works with both 0.10.x and 0.11.x but if you are using 0.11.x, you will be able to see charts and additional stuff. 0.10.x has less features. Consider running Devil with 0.11.x if you want
the full profiler functionality.

#### Timeline

The timeline is working for emitting events and keeping track of timers. It's inspired by [node-webkit-agent](https://github.com/c4milo/node-webkit-agent), but also supports keeping track of timers that
are initialized before the timeline started. Also has a few other small improvements like memory dumps and cpu usage.

#### Console (runtime)

The console is fully supported. As long as we have tested, all logging functions display the right output. Also you can use colors. If your node.js application uses colors as stdout, we translate that colors
to CSS codes in the DevTools console, you can see the result in the screenshots below. There is full runtime support and access to the global object and require. You can require any application module from the
console and use it runtime. All that is needed is the application to be running still, of course.

## Installation
`npm install devil`

* You have to reinstall the program if you change the node.js version, because the plugins need recompilation.

## Usage

Simply use the command:

`devil`

or

`node /path/to/devil`

It will start a server and a client and you can start doing your job. If you want more advanced usage, try **--help** for more info. The port and host of the server are configurable.
You can also start the program as a server or client only if you want remote debugging.

#### Just try it out

We have added a test application, just to try out Devil. After starting Devil, just enter **../../testapp** or **/path/to/devil/testapp** and run it. It has some basic functionality for testing.

#### Remote debugging

You can use Devil to debug an application running remotely. You have to install the module both on the "server" machine (the computer that runs your node.js app, that you want to debug)
and the "client" (usually your computer). Start the server with: 

`devil -s -h 0.0.0.0`

This will start Devil without the client, listening on any IP. Then, run the client from your computer with:

`devil -c -h [IP]`

Where [IP] is the server's IP.


## Screenshots

### Scripts and Live edit
![Screenshot](http://i.imgur.com/7PaSvMY.png)

### Debugging
![Screenshot](http://i.imgur.com/MlD0wKC.png)

### Timeline
![Screenshot](http://i.imgur.com/ecsPJx5.png)

### CPU Profiling
![Screenshot](http://i.imgur.com/ifKS3np.png)

### Heap Profiling
![Screenshot](http://i.imgur.com/dP3oxGq.png)

### Console
![Screenshot](http://i.imgur.com/RRSPYKF.png)

### Runtime
![Screenshot](http://i.imgur.com/INQd8Kh.png)


## License
The MIT License (MIT)

Copyright (c) 2014 Newton Soft Ltd <dev@newton.codes>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.