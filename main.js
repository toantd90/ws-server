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
const debounce_1 = tslib_1.__importDefault(__webpack_require__(19));
const callback_1 = __webpack_require__(20);
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
const mdb = new y_mongodb_provider_1.MongodbPersistence(uri);
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
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const tslib_1 = __webpack_require__(4);
tslib_1.__exportStar(__webpack_require__(12), exports);


/***/ }),
/* 12 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MongodbPersistence = void 0;
const tslib_1 = __webpack_require__(4);
const Y = tslib_1.__importStar(__webpack_require__(5));
const promise = tslib_1.__importStar(__webpack_require__(13));
const adapter_1 = __webpack_require__(14);
const U = tslib_1.__importStar(__webpack_require__(16));
class MongodbPersistence {
    /**
     * Create a y-mongodb persistence instance.
     */
    constructor(url, 
    // eslint-disable-next-line default-param-last
    { flushSize = 400 } = {}, clientOptions) {
        const db = new adapter_1.MongoAdapter(url, clientOptions);
        this.flushSize = flushSize !== null && flushSize !== void 0 ? flushSize : U.PREFERRED_TRIM_SIZE;
        // scope the queue of the transaction to each docName
        // -> this should allow concurrency for different rooms
        // Idea and adjusted code from: https://github.com/fadiquader/y-mongodb/issues/10
        this.tr = {};
        /**
         * Execute an transaction on a database. This will ensure that other processes are
         * currently not writing.
         *
         * This is a private method and might change in the future.
         */
        this._transact = (docName, f) => {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            if (!this.tr[docName]) {
                this.tr[docName] = promise.resolve();
            }
            const currTr = this.tr[docName];
            this.tr[docName] = (() => tslib_1.__awaiter(this, void 0, void 0, function* () {
                yield currTr;
                let res = null;
                try {
                    res = yield f(db);
                }
                catch (err) {
                    console.warn('Error during saving transaction', err);
                }
                return res;
            }))();
            return this.tr[docName];
        };
    }
    /**
     * Create a Y.Doc instance with the data persistet in mongodb.
     * Use this to temporarily create a Yjs document to sync changes or extract data.
     */
    getYDoc(docName) {
        return this._transact(docName, (db) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const updates = yield U.getMongoUpdates(db, docName);
            const ydoc = new Y.Doc();
            ydoc.transact(() => {
                for (let i = 0; i < updates.length; i++) {
                    Y.applyUpdate(ydoc, updates[i]);
                }
            });
            if (updates.length > this.flushSize) {
                yield U.flushDocument(db, docName, Y.encodeStateAsUpdate(ydoc), Y.encodeStateVector(ydoc));
            }
            return ydoc;
        }));
    }
    /**
     * Store a single document update to the database.
     */
    storeUpdate(docName, update) {
        return this._transact(docName, (db) => U.storeUpdate(db, docName, update));
    }
    /**
     * The state vector (describing the state of the persisted document - see https://github.com/yjs/yjs#Document-Updates) is maintained in a separate field and constantly updated.
     *
     * This allows you to sync changes without actually creating a Yjs document.
     *
     */
    getStateVector(docName) {
        return this._transact(docName, (db) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const { clock, sv } = yield U.readStateVector(db, docName);
            let curClock = -1;
            if (sv !== null) {
                curClock = yield U.getCurrentUpdateClock(db, docName);
            }
            if (sv !== null && clock === curClock) {
                return sv;
            }
            // current state vector is outdated
            const updates = yield U.getMongoUpdates(db, docName);
            const { update, sv: newSv } = U.mergeUpdates(updates);
            yield U.flushDocument(db, docName, update, newSv);
            return newSv;
        }));
    }
    /**
     * Get the differences directly from the database.
     * The same as Y.encodeStateAsUpdate(ydoc, stateVector).
     */
    getDiff(docName, stateVector) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const ydoc = yield this.getYDoc(docName);
            return Y.encodeStateAsUpdate(ydoc, stateVector);
        });
    }
    /**
     * Delete a document, and all associated data from the database.
     * When option multipleCollections is set, it removes the corresponding collection
     */
    clearDocument(docName) {
        return this._transact(docName, (db) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield db.dropCollection(docName);
        }));
    }
    /**
     * Persist some meta information in the database and associate it
     * with a document. It is up to you what you store here.
     * You could, for example, store credentials here.
     */
    setMeta(docName, metaKey, value) {
        /*	Unlike y-leveldb, we simply store the value here without encoding
                 it in a buffer beforehand. */
        return this._transact(docName, (db) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield db.put(U.createDocumentMetaKey(docName, metaKey), { value });
        }));
    }
    /**
     * Retrieve a store meta value from the database. Returns undefined if the
     * metaKey doesn't exist.
     */
    getMeta(docName, metaKey) {
        return this._transact(docName, (db) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const res = yield db.get(Object.assign({}, U.createDocumentMetaKey(docName, metaKey)));
            if (!(res === null || res === void 0 ? void 0 : res['value'])) {
                return undefined;
            }
            return res['value'];
        }));
    }
    /**
     * Delete a store meta value.
     */
    delMeta(docName, metaKey) {
        return this._transact(docName, (db) => db.del(Object.assign({}, U.createDocumentMetaKey(docName, metaKey))));
    }
    /**
     * Retrieve the names of all stored documents.
     */
    getAllDocNames() {
        return this._transact('global', (db) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            return db.getCollectionNames();
        }));
    }
    /**
     * Internally y-mongodb stores incremental updates. You can merge all document
     * updates to a single entry. You probably never have to use this.
     * It is done automatically every $options.flushsize (default 400) transactions.
     */
    flushDocument(docName) {
        return this._transact(docName, (db) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            const updates = yield U.getMongoUpdates(db, docName);
            const { update, sv } = U.mergeUpdates(updates);
            yield U.flushDocument(db, docName, update, sv);
        }));
    }
    /**
     * Delete the whole yjs mongodb
     */
    flushDB() {
        return this._transact('global', (db) => tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield U.flushDB(db);
        }));
    }
}
exports.MongodbPersistence = MongodbPersistence;


/***/ }),
/* 13 */
/***/ ((module) => {

module.exports = require("lib0/promise");

/***/ }),
/* 14 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.MongoAdapter = void 0;
const tslib_1 = __webpack_require__(4);
const mongodb_1 = __webpack_require__(15);
class MongoAdapter {
    constructor(url, options = {}) {
        if (typeof url === 'object') {
            const { user, password: pwd, dbName: db, host } = url;
            // eslint-disable-next-line no-param-reassign
            url = user ? `mongodb://${user}:${pwd}@${host}` : `mongodb://${host}`;
            // eslint-disable-next-line no-param-reassign
            url += db ? `/${db}` : '';
        }
        this.connectionString = url;
        this.options = options;
    }
    connect() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (this.db)
                return this.db;
            const client = yield mongodb_1.MongoClient.connect(this.connectionString, this.options);
            this.db = client.db();
            return this.db;
        });
    }
    collection(name) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const client = yield this.connect();
            return client.collection(name);
        });
    }
    get(query) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const doc = yield this.collection(query.docName);
            return doc.findOne(query);
        });
    }
    put(query, values) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const collection = yield this.collection(query.docName);
            const doc = yield collection.findOneAndUpdate(query, { $set: Object.assign(Object.assign({}, query), values) }, { upsert: true, returnDocument: 'after' });
            if (!doc)
                return;
            return doc['value'];
        });
    }
    del(query) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const doc = yield this.collection(query.docName);
            return doc.deleteMany(query);
        });
    }
    readAsCursor(query, { limit, reverse } = {}) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const doc = yield this.collection(query.docName);
            let curs = doc.find(query);
            if (reverse)
                curs = curs.sort({ clock: -1 });
            if (limit)
                curs = curs.limit(limit);
            return curs.toArray();
        });
    }
    /**
     * Close connection to MongoDB instance.
     */
    close() {
        var _a;
        (_a = this.client) === null || _a === void 0 ? void 0 : _a.close();
    }
    getCollectionNames() {
        var _a, _b;
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const collections = (_b = (yield ((_a = this.db) === null || _a === void 0 ? void 0 : _a.listCollections().toArray()))) !== null && _b !== void 0 ? _b : [];
            return collections.map(({ name }) => name);
        });
    }
    /**
     * Delete database
     */
    flush() {
        var _a, _b;
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            yield ((_a = this.db) === null || _a === void 0 ? void 0 : _a.dropDatabase());
            yield ((_b = this.client) === null || _b === void 0 ? void 0 : _b.close());
        });
    }
    dropCollection(collectionName) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            const doc = yield this.collection(collectionName);
            return doc.drop();
        });
    }
}
exports.MongoAdapter = MongoAdapter;


/***/ }),
/* 15 */
/***/ ((module) => {

module.exports = require("mongodb");

/***/ }),
/* 16 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.flushDocument = exports.readStateVector = exports.decodeMongodbStateVector = exports.mergeUpdates = exports.storeUpdate = exports.writeStateVector = exports.getCurrentUpdateClock = exports.getMongoUpdates = exports.flushDB = exports.getMongoBulkData = exports.createDocumentMetaKey = exports.createDocumentStateVectorKey = exports.createDocumentUpdateKey = exports.clearUpdatesRange = exports.PREFERRED_TRIM_SIZE = void 0;
const tslib_1 = __webpack_require__(4);
const Y = tslib_1.__importStar(__webpack_require__(5));
const binary = tslib_1.__importStar(__webpack_require__(17));
const encoding = tslib_1.__importStar(__webpack_require__(8));
const decoding = tslib_1.__importStar(__webpack_require__(9));
const buffer_1 = __webpack_require__(18);
exports.PREFERRED_TRIM_SIZE = 400;
/**
 * Remove all documents from db with Clock between $from and $to
 */
const clearUpdatesRange = (adapter, docName, from, to
// eslint-disable-next-line @typescript-eslint/require-await
) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    adapter.del({
        docName,
        clock: {
            $gte: from,
            $lt: to,
        },
    });
});
exports.clearUpdatesRange = clearUpdatesRange;
/**
 * Create a unique key for a update message.
 */
const createDocumentUpdateKey = (docName, clock) => {
    if (clock !== undefined) {
        return {
            version: 'v1',
            action: 'update',
            docName,
            clock,
        };
    }
    return {
        version: 'v1',
        action: 'update',
        docName,
    };
};
exports.createDocumentUpdateKey = createDocumentUpdateKey;
/**
 * We have a separate state vector key so we can iterate efficiently over all documents
 */
const createDocumentStateVectorKey = (docName) => ({
    docName,
    version: 'v1_sv',
});
exports.createDocumentStateVectorKey = createDocumentStateVectorKey;
const createDocumentMetaKey = (docName, metaKey) => ({
    version: 'v1',
    docName,
    metaKey: `meta_${metaKey}`,
});
exports.createDocumentMetaKey = createDocumentMetaKey;
const getMongoBulkData = (adapter, query, opts) => adapter.readAsCursor(query, opts);
exports.getMongoBulkData = getMongoBulkData;
const flushDB = (adapter) => adapter.flush();
exports.flushDB = flushDB;
/**
 * Convert the mongo document array to an array of values (as buffers)
 */
const _convertMongoUpdates = (docs) => {
    if (!Array.isArray(docs) || !docs.length)
        return [];
    return docs.map((update) => update['value'].buffer);
};
/**
 * Get all document updates for a specific document.
 */
const getMongoUpdates = (adapter, docName, opts = {}) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const docs = yield (0, exports.getMongoBulkData)(adapter, (0, exports.createDocumentUpdateKey)(docName), opts);
    return _convertMongoUpdates(docs);
});
exports.getMongoUpdates = getMongoUpdates;
const getCurrentUpdateClock = (adapter, docName) => (0, exports.getMongoBulkData)(adapter, Object.assign(Object.assign({}, (0, exports.createDocumentUpdateKey)(docName, 0)), { clock: {
        $gte: 0,
        $lt: binary.BITS32,
    } }), { reverse: true, limit: 1 }).then((updates) => {
    if (updates.length === 0) {
        return -1;
    }
    return updates[0]['clock'];
});
exports.getCurrentUpdateClock = getCurrentUpdateClock;
const writeStateVector = (adapter, docName, sv, clock) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, clock);
    encoding.writeVarUint8Array(encoder, sv);
    yield adapter.put((0, exports.createDocumentStateVectorKey)(docName), {
        value: buffer_1.Buffer.from(encoding.toUint8Array(encoder)),
    });
});
exports.writeStateVector = writeStateVector;
const storeUpdate = (adapter, docName, update) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const clock = yield (0, exports.getCurrentUpdateClock)(adapter, docName);
    if (clock === -1) {
        // make sure that a state vector is always written, so we can search for available documents
        const ydoc = new Y.Doc();
        Y.applyUpdate(ydoc, update);
        const sv = Y.encodeStateVector(ydoc);
        yield (0, exports.writeStateVector)(adapter, docName, sv, 0);
    }
    yield adapter.put((0, exports.createDocumentUpdateKey)(docName, clock + 1), {
        value: buffer_1.Buffer.from(update),
    });
    return clock + 1;
});
exports.storeUpdate = storeUpdate;
/**
 * For now this is a helper method that creates a Y.Doc and then re-encodes a document update.
 * In the future this will be handled by Yjs without creating a Y.Doc (constant memory consumption).
 */
const mergeUpdates = (updates) => {
    const ydoc = new Y.Doc();
    ydoc.transact(() => {
        for (let i = 0; i < updates.length; i++) {
            Y.applyUpdate(ydoc, updates[i]);
        }
    });
    return { update: Y.encodeStateAsUpdate(ydoc), sv: Y.encodeStateVector(ydoc) };
};
exports.mergeUpdates = mergeUpdates;
const decodeMongodbStateVector = (buf) => {
    let decoder;
    if (buffer_1.Buffer.isBuffer(buf)) {
        decoder = decoding.createDecoder(buf);
    }
    else if (buffer_1.Buffer.isBuffer(buf === null || buf === void 0 ? void 0 : buf.buffer)) {
        decoder = decoding.createDecoder(buf.buffer);
    }
    else {
        throw new Error('No buffer provided at decodeMongodbStateVector()');
    }
    const clock = decoding.readVarUint(decoder);
    const sv = decoding.readVarUint8Array(decoder);
    return { sv, clock };
};
exports.decodeMongodbStateVector = decodeMongodbStateVector;
const readStateVector = (adapter, docName) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const doc = yield adapter.get(Object.assign({}, (0, exports.createDocumentStateVectorKey)(docName)));
    if (!(doc === null || doc === void 0 ? void 0 : doc['value'])) {
        // no state vector created yet or no document exists
        return { sv: null, clock: -1 };
    }
    return (0, exports.decodeMongodbStateVector)(doc['value']);
});
exports.readStateVector = readStateVector;
/**
 * Merge all MongoDB documents of the same yjs document together.
 */
const flushDocument = (adapter, docName, stateAsUpdate, stateVector) => tslib_1.__awaiter(void 0, void 0, void 0, function* () {
    const clock = yield (0, exports.storeUpdate)(adapter, docName, stateAsUpdate);
    yield (0, exports.writeStateVector)(adapter, docName, stateVector, clock);
    yield (0, exports.clearUpdatesRange)(adapter, docName, 0, clock);
    return clock;
});
exports.flushDocument = flushDocument;


/***/ }),
/* 17 */
/***/ ((module) => {

module.exports = require("lib0/binary");

/***/ }),
/* 18 */
/***/ ((module) => {

module.exports = require("buffer");

/***/ }),
/* 19 */
/***/ ((module) => {

module.exports = require("lodash/debounce");

/***/ }),
/* 20 */
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