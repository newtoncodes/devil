module.exports = {
    // Dummy agents
    CSS: {
        enable: false
    },
    Database: {
        enable: false
    },
    ApplicationCache: {
        enable: false,
        getFramesWithManifests: null
    },
    IndexedDB: {
        enable: false,
        requestDatabaseNames: null
    },
    DOM: {
        enable: false
    },
    DOMDebugger: {
        enable: false
    },
    DOMStorage: {
        enable: false
    },
    Input: {
        enable: false
    },
    Network: {
        enable: false
    },
    Inspector: {
        enable: false
    },
    Worker: {
        canInspectWorkers: false,
        setAutoconnectToWorkers: false
    },

    // Smart agents
    Console: require('./Console'),
    Debugger: require('./Debugger'),
    Page: require('./Page'),
    Profiler: require('./Profiler'),
    Runtime: require('./Runtime'),
    Timeline: require('./Timeline')
};