/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */,
/* 1 */
/***/ ((module) => {

module.exports = require("ws");

/***/ }),
/* 2 */
/***/ ((module) => {

module.exports = require("http");

/***/ }),
/* 3 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.setupWSConnection = exports.getYDoc = exports.docs = exports.getPersistence = exports.setPersistence = exports.WSSharedDoc = void 0;
const tslib_1 = __webpack_require__(4);
const yjs_1 = __webpack_require__(5);
const sync_1 = __webpack_require__(6);
const awareness_1 = __webpack_require__(7);
const encoding_1 = __webpack_require__(8);
const decoding_1 = __webpack_require__(9);
const map_1 = __webpack_require__(10);
const y_mongodb_provider_1 = __webpack_require__(11);
const debounce_1 = tslib_1.__importDefault(__webpack_require__(12));
const callback_1 = __webpack_require__(13);
const CALLBACK_DEBOUNCE_WAIT = parseInt(process.env.CALLBACK_DEBOUNCE_WAIT) || 2000;
const CALLBACK_DEBOUNCE_MAXWAIT = parseInt(process.env.CALLBACK_DEBOUNCE_MAXWAIT) || 10000;
const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;
// const wsReadyStateClosing = 2;
// const wsReadyStateClosed = 3;
const messageSync = 0;
const messageAwareness = 1;
// const messageAuth = 2
// disable gc when using snapshots!
const gcEnabled = process.env.GC !== 'false' && process.env.GC !== '0';
// const persistenceDir = process.env.YPERSISTENCE || './dist/levelDB';
class WSSharedDoc extends yjs_1.Doc {
    /**
     * @param {string} name
     */
    constructor(name) {
        super({ gc: gcEnabled });
        this.name = name;
        /**
         * Maps from conn to set of controlled user ids. Delete all user ids from awareness when this conn is closed
         * @type {Map<Object, Set<number>>}
         */
        this.conns = new Map();
        /**
         * @type {awarenessProtocol.Awareness}
         */
        this.awareness = new awareness_1.Awareness(this);
        this.awareness.setLocalState(null);
        const awarenessChangeHandler = ({ 
        // changes
        added, updated, removed, }, 
        // connection that made the change
        conn) => {
            const changedClients = added.concat(updated, removed);
            if (conn !== null) {
                const connControlledIDs = this.conns.get(conn);
                if (connControlledIDs !== undefined) {
                    added.forEach((clientID) => {
                        connControlledIDs.add(clientID);
                    });
                    removed.forEach((clientID) => {
                        connControlledIDs.delete(clientID);
                    });
                }
            }
            // broadcast awareness update
            const encoder = (0, encoding_1.createEncoder)();
            (0, encoding_1.writeVarUint)(encoder, messageAwareness);
            (0, encoding_1.writeVarUint8Array)(encoder, (0, awareness_1.encodeAwarenessUpdate)(this.awareness, changedClients));
            const buff = (0, encoding_1.toUint8Array)(encoder);
            this.conns.forEach((_, c) => {
                send(this, c, buff);
            });
        };
        this.awareness.on('update', awarenessChangeHandler);
        this.on('update', updateHandler);
        if (callback_1.isCallbackSet) {
            this.on('update', (0, debounce_1.default)(callback_1.callbackHandler, CALLBACK_DEBOUNCE_WAIT, {
                maxWait: CALLBACK_DEBOUNCE_MAXWAIT,
            }));
        }
    }
}
exports.WSSharedDoc = WSSharedDoc;
let persistence = null;
const uri = 'mongodb+srv://journey2:journey1234@cluster0.49jjmuc.mongodb.net/test?retryWrites=true&w=majority';
// if (typeof persistenceDir === 'string') {
//   console.info(`Persisting documents to "${persistenceDir}"`);
const mdb = new y_mongodb_provider_1.MongodbPersistence(uri, {
    collectionName: 'journey',
});
persistence = {
    provider: mdb,
    bindState: (docName, ydoc) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
        const persistedYdoc = yield mdb.getYDoc(docName);
        const newUpdates = (0, yjs_1.encodeStateAsUpdate)(ydoc);
        mdb.storeUpdate(docName, newUpdates);
        (0, yjs_1.applyUpdate)(ydoc, (0, yjs_1.encodeStateAsUpdate)(persistedYdoc));
        ydoc.on('update', (update) => {
            console.log('update', update);
            mdb.storeUpdate(docName, update);
        });
    }),
    writeState: (docName, ydoc) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
        // some empty function
    }),
    // };
};
function setPersistence(persistence_) {
    persistence = persistence_;
}
exports.setPersistence = setPersistence;
function getPersistence() {
    return persistence;
}
exports.getPersistence = getPersistence;
const docs = new Map();
// exporting docs so that others can use it
const _docs = docs;
exports.docs = _docs;
const updateHandler = (update, origin, doc) => {
    const encoder = (0, encoding_1.createEncoder)();
    (0, encoding_1.writeVarUint)(encoder, messageSync);
    (0, sync_1.writeUpdate)(encoder, update);
    const message = (0, encoding_1.toUint8Array)(encoder);
    doc.conns.forEach((_, conn) => send(doc, conn, message));
};
/**
 * Gets a Y.Doc by name, whether in memory or on disk
 *
 * docname - the name of the Y.Doc to find or create
 * gc - whether to allow gc on the doc (applies only when created)
 */
const getYDoc = (docname, gc = true) => (0, map_1.setIfUndefined)(docs, docname, () => {
    const doc = new WSSharedDoc(docname);
    doc.gc = gc;
    if (persistence !== null) {
        persistence.bindState(docname, doc);
    }
    docs.set(docname, doc);
    return doc;
});
const _getYDoc = getYDoc;
exports.getYDoc = _getYDoc;
const messageListener = (conn, doc, message) => {
    try {
        const encoder = (0, encoding_1.createEncoder)();
        const decoder = (0, decoding_1.createDecoder)(message);
        const messageType = (0, decoding_1.readVarUint)(decoder);
        console.log('message:', message);
        // eslint-disable-next-line default-case
        switch (messageType) {
            case messageSync:
                (0, encoding_1.writeVarUint)(encoder, messageSync);
                (0, sync_1.readSyncMessage)(decoder, encoder, doc, conn);
                // If the `encoder` only contains the type of reply message and no
                // message, there is no need to send the message. When `encoder` only
                // contains the type of reply, its length is 1.
                if ((0, encoding_1.length)(encoder) > 1) {
                    send(doc, conn, (0, encoding_1.toUint8Array)(encoder));
                }
                break;
            case messageAwareness: {
                (0, awareness_1.applyAwarenessUpdate)(doc.awareness, (0, decoding_1.readVarUint8Array)(decoder), conn);
                break;
            }
        }
    }
    catch (err) {
        console.error(err);
        doc.emit('error', [err]);
    }
};
const closeConn = (doc, conn) => {
    if (doc.conns.has(conn)) {
        const controlledIds = doc.conns.get(conn);
        doc.conns.delete(conn);
        (0, awareness_1.removeAwarenessStates)(doc.awareness, Array.from(controlledIds), null);
        if (doc.conns.size === 0 && persistence !== null) {
            // if persisted, we store state and destroy ydocument
            persistence.writeState(doc.name, doc).then(() => {
                doc.destroy();
            });
            docs.delete(doc.name);
        }
    }
    conn.close();
};
const send = (doc, conn, m) => {
    if (conn.readyState !== wsReadyStateConnecting &&
        conn.readyState !== wsReadyStateOpen) {
        closeConn(doc, conn);
    }
    try {
        conn.send(m, (err) => {
            // eslint-disable-next-line no-unused-expressions
            err != null && closeConn(doc, conn);
        });
    }
    catch (e) {
        closeConn(doc, conn);
    }
};
const pingTimeout = 30000;
function setupWSConnection(conn, req, { docName = req.url.slice(1).split('?')[0], gc = true } = {}) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, no-param-reassign
    conn.binaryType = 'arraybuffer';
    // get doc, initialize if it does not exist yet
    const doc = getYDoc(docName, gc);
    doc.conns.set(conn, new Set());
    // listen and reply to events
    conn.on('message', (message) => messageListener(conn, doc, new Uint8Array(message)));
    // Check if connection is still alive
    let pongReceived = true;
    const pingInterval = setInterval(() => {
        if (!pongReceived) {
            if (doc.conns.has(conn)) {
                closeConn(doc, conn);
            }
            clearInterval(pingInterval);
        }
        else if (doc.conns.has(conn)) {
            pongReceived = false;
            try {
                conn.ping();
            }
            catch (e) {
                closeConn(doc, conn);
                clearInterval(pingInterval);
            }
        }
    }, pingTimeout);
    conn.on('close', () => {
        closeConn(doc, conn);
        clearInterval(pingInterval);
    });
    conn.on('pong', () => {
        pongReceived = true;
    });
    // put the following in a variables in a block so the interval handlers don't keep in in
    // scope
    {
        // send sync step 1
        const encoder = (0, encoding_1.createEncoder)();
        (0, encoding_1.writeVarUint)(encoder, messageSync);
        (0, sync_1.writeSyncStep1)(encoder, doc);
        send(doc, conn, (0, encoding_1.toUint8Array)(encoder));
        const awarenessStates = doc.awareness.getStates();
        if (awarenessStates.size > 0) {
            const encoder = (0, encoding_1.createEncoder)();
            (0, encoding_1.writeVarUint)(encoder, messageAwareness);
            (0, encoding_1.writeVarUint8Array)(encoder, (0, awareness_1.encodeAwarenessUpdate)(doc.awareness, Array.from(awarenessStates.keys())));
            send(doc, conn, (0, encoding_1.toUint8Array)(encoder));
        }
    }
}
exports.setupWSConnection = setupWSConnection;


/***/ }),
/* 4 */
/***/ ((module) => {

module.exports = require("tslib");

/***/ }),
/* 5 */
/***/ ((module) => {

module.exports = require("yjs");

/***/ }),
/* 6 */
/***/ ((module) => {

module.exports = require("y-protocols/sync");

/***/ }),
/* 7 */
/***/ ((module) => {

module.exports = require("y-protocols/awareness");

/***/ }),
/* 8 */
/***/ ((module) => {

module.exports = require("lib0/encoding");

/***/ }),
/* 9 */
/***/ ((module) => {

module.exports = require("lib0/decoding");

/***/ }),
/* 10 */
/***/ ((module) => {

module.exports = require("lib0/map");

/***/ }),
/* 11 */
/***/ ((module) => {

module.exports = require("y-mongodb-provider");

/***/ }),
/* 12 */
/***/ ((module) => {

module.exports = require("lodash/debounce");

/***/ }),
/* 13 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.callbackHandler = exports.isCallbackSet = void 0;
const http_1 = __webpack_require__(2);
const CALLBACK_URL = process.env.CALLBACK_URL
    ? new URL(process.env.CALLBACK_URL)
    : null;
const CALLBACK_TIMEOUT = Number(process.env.CALLBACK_TIMEOUT) || 5000;
const CALLBACK_OBJECTS = process.env.CALLBACK_OBJECTS
    ? JSON.parse(process.env.CALLBACK_OBJECTS)
    : {};
exports.isCallbackSet = !!CALLBACK_URL;
function callbackHandler(update, origin, doc) {
    const room = doc.name;
    const dataToSend = {
        room,
        data: {},
    };
    const sharedObjectList = Object.keys(CALLBACK_OBJECTS);
    sharedObjectList.forEach((sharedObjectName) => {
        const sharedObjectType = CALLBACK_OBJECTS[sharedObjectName];
        dataToSend.data[sharedObjectName] = {
            type: sharedObjectType,
            content: getContent(sharedObjectName, sharedObjectType, doc).toJSON(),
        };
    });
    callbackRequest(CALLBACK_URL, CALLBACK_TIMEOUT, dataToSend);
}
exports.callbackHandler = callbackHandler;
const callbackRequest = (url, timeout, data) => {
    const stringifiedData = JSON.stringify(data);
    const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        timeout,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': stringifiedData.length,
        },
    };
    const req = (0, http_1.request)(options);
    req.on('timeout', () => {
        console.warn('Callback request timed out.');
        req.destroy();
    });
    req.on('error', (e) => {
        console.error('Callback request error.', e);
        req.destroy();
    });
    req.write(stringifiedData);
    req.end();
};
const getContent = (objName, objType, doc) => {
    switch (objType) {
        case 'Array':
            return doc.getArray(objName);
        case 'Map':
            return doc.getMap(objName);
        default:
            return null;
    }
};


/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
var exports = __webpack_exports__;

Object.defineProperty(exports, "__esModule", ({ value: true }));
const ws_1 = __webpack_require__(1);
const http_1 = __webpack_require__(2);
const utils_1 = __webpack_require__(3);
const wss = new ws_1.Server({ noServer: true });
const port = Number(process.env.PORT) || 1234;
const host = process.env.HOST || 'localhost';
const server = (0, http_1.createServer)((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('okay');
});
wss.on('connection', utils_1.setupWSConnection);
server.on('upgrade', (request, socket, head) => {
    // You may check auth of request here..
    // See https://github.com/websockets/ws#client-authentication
    const handleAuth = (ws) => {
        wss.emit('connection', ws, request);
    };
    wss.handleUpgrade(request, socket, head, handleAuth);
});
server.listen(port, host, () => {
    console.log(`running at '${host}' on port ${port}`);
});

})();

var __webpack_export_target__ = exports;
for(var i in __webpack_exports__) __webpack_export_target__[i] = __webpack_exports__[i];
if(__webpack_exports__.__esModule) Object.defineProperty(__webpack_export_target__, "__esModule", { value: true });
/******/ })()
;
//# sourceMappingURL=main.js.map