/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The require scope
/******/ 	var __webpack_require__ = {};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

;// CONCATENATED MODULE: external "ws"
const external_ws_namespaceObject = require("ws");
;// CONCATENATED MODULE: external "http"
const external_http_namespaceObject = require("http");
;// CONCATENATED MODULE: external "yjs"
const external_yjs_namespaceObject = require("yjs");
;// CONCATENATED MODULE: external "y-protocols/sync"
const sync_namespaceObject = require("y-protocols/sync");
;// CONCATENATED MODULE: external "y-protocols/awareness"
const awareness_namespaceObject = require("y-protocols/awareness");
;// CONCATENATED MODULE: external "lib0/encoding"
const encoding_namespaceObject = require("lib0/encoding");
;// CONCATENATED MODULE: external "lib0/decoding"
const decoding_namespaceObject = require("lib0/decoding");
;// CONCATENATED MODULE: external "lib0/map"
const map_namespaceObject = require("lib0/map");
;// CONCATENATED MODULE: external "y-leveldb"
const external_y_leveldb_namespaceObject = require("y-leveldb");
;// CONCATENATED MODULE: external "lodash/debounce"
const debounce_namespaceObject = require("lodash/debounce");
var debounce_default = /*#__PURE__*/__webpack_require__.n(debounce_namespaceObject);
;// CONCATENATED MODULE: ./src/callback.ts

const CALLBACK_URL = process.env.CALLBACK_URL
    ? new URL(process.env.CALLBACK_URL)
    : null;
const CALLBACK_TIMEOUT = Number(process.env.CALLBACK_TIMEOUT) || 5000;
const CALLBACK_OBJECTS = process.env.CALLBACK_OBJECTS
    ? JSON.parse(process.env.CALLBACK_OBJECTS)
    : {};
const isCallbackSet = !!CALLBACK_URL;
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
    const req = (0,external_http_namespaceObject.request)(options);
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

;// CONCATENATED MODULE: ./src/utils.ts









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
const persistenceDir = process.env.YPERSISTENCE;
class WSSharedDoc extends external_yjs_namespaceObject.Doc {
    awareness;
    name;
    conns;
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
        this.awareness = new awareness_namespaceObject.Awareness(this);
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
            const encoder = (0,encoding_namespaceObject.createEncoder)();
            (0,encoding_namespaceObject.writeVarUint)(encoder, messageAwareness);
            (0,encoding_namespaceObject.writeVarUint8Array)(encoder, (0,awareness_namespaceObject.encodeAwarenessUpdate)(this.awareness, changedClients));
            const buff = (0,encoding_namespaceObject.toUint8Array)(encoder);
            this.conns.forEach((_, c) => {
                send(this, c, buff);
            });
        };
        this.awareness.on('update', awarenessChangeHandler);
        this.on('update', updateHandler);
        if (isCallbackSet) {
            this.on('update', debounce_default()(callbackHandler, CALLBACK_DEBOUNCE_WAIT, {
                maxWait: CALLBACK_DEBOUNCE_MAXWAIT,
            }));
        }
    }
}
let persistence = null;
if (typeof persistenceDir === 'string') {
    console.info(`Persisting documents to "${persistenceDir}"`);
    const ldb = new external_y_leveldb_namespaceObject.LeveldbPersistence(persistenceDir);
    persistence = {
        provider: ldb,
        bindState: async (docName, ydoc) => {
            const persistedYdoc = await ldb.getYDoc(docName);
            const newUpdates = (0,external_yjs_namespaceObject.encodeStateAsUpdate)(ydoc);
            ldb.storeUpdate(docName, newUpdates);
            (0,external_yjs_namespaceObject.applyUpdate)(ydoc, (0,external_yjs_namespaceObject.encodeStateAsUpdate)(persistedYdoc));
            ydoc.on('update', (update) => {
                ldb.storeUpdate(docName, update);
            });
        },
        writeState: async (docName, ydoc) => {
            // some empty function
        },
    };
}
function setPersistence(persistence_) {
    persistence = persistence_;
}
function getPersistence() {
    return persistence;
}
const docs = new Map();
// exporting docs so that others can use it
const _docs = docs;

const updateHandler = (update, origin, doc) => {
    const encoder = (0,encoding_namespaceObject.createEncoder)();
    (0,encoding_namespaceObject.writeVarUint)(encoder, messageSync);
    (0,sync_namespaceObject.writeUpdate)(encoder, update);
    const message = (0,encoding_namespaceObject.toUint8Array)(encoder);
    doc.conns.forEach((_, conn) => send(doc, conn, message));
};
/**
 * Gets a Y.Doc by name, whether in memory or on disk
 *
 * docname - the name of the Y.Doc to find or create
 * gc - whether to allow gc on the doc (applies only when created)
 */
const getYDoc = (docname, gc = true) => (0,map_namespaceObject.setIfUndefined)(docs, docname, () => {
    const doc = new WSSharedDoc(docname);
    doc.gc = gc;
    if (persistence !== null) {
        persistence.bindState(docname, doc);
    }
    docs.set(docname, doc);
    return doc;
});
const _getYDoc = getYDoc;

const messageListener = (conn, doc, message) => {
    try {
        const encoder = (0,encoding_namespaceObject.createEncoder)();
        const decoder = (0,decoding_namespaceObject.createDecoder)(message);
        const messageType = (0,decoding_namespaceObject.readVarUint)(decoder);
        // eslint-disable-next-line default-case
        switch (messageType) {
            case messageSync:
                (0,encoding_namespaceObject.writeVarUint)(encoder, messageSync);
                (0,sync_namespaceObject.readSyncMessage)(decoder, encoder, doc, conn);
                // If the `encoder` only contains the type of reply message and no
                // message, there is no need to send the message. When `encoder` only
                // contains the type of reply, its length is 1.
                if ((0,encoding_namespaceObject.length)(encoder) > 1) {
                    send(doc, conn, (0,encoding_namespaceObject.toUint8Array)(encoder));
                }
                break;
            case messageAwareness: {
                (0,awareness_namespaceObject.applyAwarenessUpdate)(doc.awareness, (0,decoding_namespaceObject.readVarUint8Array)(decoder), conn);
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
        (0,awareness_namespaceObject.removeAwarenessStates)(doc.awareness, Array.from(controlledIds), null);
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
        const encoder = (0,encoding_namespaceObject.createEncoder)();
        (0,encoding_namespaceObject.writeVarUint)(encoder, messageSync);
        (0,sync_namespaceObject.writeSyncStep1)(encoder, doc);
        send(doc, conn, (0,encoding_namespaceObject.toUint8Array)(encoder));
        const awarenessStates = doc.awareness.getStates();
        if (awarenessStates.size > 0) {
            const encoder = (0,encoding_namespaceObject.createEncoder)();
            (0,encoding_namespaceObject.writeVarUint)(encoder, messageAwareness);
            (0,encoding_namespaceObject.writeVarUint8Array)(encoder, (0,awareness_namespaceObject.encodeAwarenessUpdate)(doc.awareness, Array.from(awarenessStates.keys())));
            send(doc, conn, (0,encoding_namespaceObject.toUint8Array)(encoder));
        }
    }
}

;// CONCATENATED MODULE: ./src/main.ts



const wss = new external_ws_namespaceObject.Server({ noServer: true });
const port = Number(process.env.PORT) || 1234;
const host = process.env.HOST || 'localhost';
const server = (0,external_http_namespaceObject.createServer)((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('okay');
});
wss.on('connection', setupWSConnection);
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

var __webpack_export_target__ = exports;
for(var i in __webpack_exports__) __webpack_export_target__[i] = __webpack_exports__[i];
if(__webpack_exports__.__esModule) Object.defineProperty(__webpack_export_target__, "__esModule", { value: true });
/******/ })()
;
//# sourceMappingURL=main.js.map