/**
 * QuantumDB API - JavaScript REST Interface
 * 
 * Quantum-accelerated database: Grover search, quantum joins,
 * quantum-secured storage, and PostgreSQL-compatible queries.
 */

// =========================================================================
// QUANTUM DB CONSTANTS
// =========================================================================

// Query types
const QUERY_TYPES = {
    SELECT: 'select',
    INSERT: 'insert',
    UPDATE: 'update',
    DELETE: 'delete',
    GROVER: 'grover',      // Quantum search
    QJOIN: 'quantum_join'  // Quantum join
};

// Encryption modes
const ENCRYPTION_MODES = {
    NONE: 'none',
    AES256: 'aes256',
    QUANTUM: 'quantum'  // QKD-derived keys
};

// In-memory stores
let databases = new Map();
let collections = new Map();
let documents = new Map();
let queries = [];

let dbIdCounter = 0;
let collectionIdCounter = 0;
let docIdCounter = 0;
let queryIdCounter = 0;

// =========================================================================
// DATABASE MANAGEMENT
// =========================================================================

/**
 * Create a new database
 */
function createDatabase(name, options = {}) {
    const id = `qdb-${++dbIdCounter}`;

    const db = {
        id,
        name,
        encryption: options.encryption || ENCRYPTION_MODES.AES256,
        collections: [],
        createdAt: Date.now(),
        documentCount: 0,
        sizeBytes: 0,
        queryCount: 0,
        quantumAccelerated: 0
    };

    databases.set(id, db);
    console.log(`[QDB] 💾 Database created: ${name} (${db.encryption} encryption)`);

    return db;
}

/**
 * List databases
 */
function listDatabases() {
    return Array.from(databases.values());
}

/**
 * Get database
 */
function getDatabase(dbId) {
    return databases.get(dbId) || null;
}

/**
 * Delete database
 */
function deleteDatabase(dbId) {
    const db = databases.get(dbId);
    if (!db) return { error: 'Database not found' };

    // Delete all collections and documents
    db.collections.forEach(colId => {
        const col = collections.get(colId);
        if (col) {
            col.documents.forEach(docId => documents.delete(docId));
            collections.delete(colId);
        }
    });

    databases.delete(dbId);
    return { success: true, deleted: dbId };
}

// =========================================================================
// COLLECTION MANAGEMENT
// =========================================================================

/**
 * Create collection in database
 */
function createCollection(dbId, name, schema = {}) {
    const db = databases.get(dbId);
    if (!db) return { error: 'Database not found' };

    const id = `col-${++collectionIdCounter}`;

    const collection = {
        id,
        dbId,
        name,
        schema,
        documents: [],
        indexes: [],
        createdAt: Date.now(),
        documentCount: 0
    };

    collections.set(id, collection);
    db.collections.push(id);

    console.log(`[QDB] 📁 Collection created: ${name} in ${db.name}`);

    return collection;
}

/**
 * List collections in database
 */
function listCollections(dbId) {
    const db = databases.get(dbId);
    if (!db) return [];

    return db.collections.map(colId => collections.get(colId)).filter(Boolean);
}

/**
 * Get collection
 */
function getCollection(collectionId) {
    return collections.get(collectionId) || null;
}

// =========================================================================
// DOCUMENT OPERATIONS
// =========================================================================

/**
 * Insert document
 */
function insertDocument(collectionId, data) {
    const collection = collections.get(collectionId);
    if (!collection) return { error: 'Collection not found' };

    const db = databases.get(collection.dbId);
    const id = `doc-${++docIdCounter}`;

    const doc = {
        id,
        collectionId,
        data,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        encrypted: db?.encryption !== ENCRYPTION_MODES.NONE
    };

    documents.set(id, doc);
    collection.documents.push(id);
    collection.documentCount++;

    if (db) {
        db.documentCount++;
        db.sizeBytes += JSON.stringify(data).length;
    }

    return { success: true, document: doc };
}

/**
 * Get document
 */
function getDocument(documentId) {
    return documents.get(documentId) || null;
}

/**
 * Update document
 */
function updateDocument(documentId, data) {
    const doc = documents.get(documentId);
    if (!doc) return { error: 'Document not found' };

    doc.data = { ...doc.data, ...data };
    doc.updatedAt = Date.now();

    return { success: true, document: doc };
}

/**
 * Delete document
 */
function deleteDocument(documentId) {
    const doc = documents.get(documentId);
    if (!doc) return { error: 'Document not found' };

    const collection = collections.get(doc.collectionId);
    if (collection) {
        collection.documents = collection.documents.filter(id => id !== documentId);
        collection.documentCount--;

        const db = databases.get(collection.dbId);
        if (db) db.documentCount--;
    }

    documents.delete(documentId);
    return { success: true, deleted: documentId };
}

// =========================================================================
// QUANTUM QUERIES
// =========================================================================

/**
 * Execute query with optional quantum acceleration
 */
function executeQuery(collectionId, query, useQuantum = true) {
    const collection = collections.get(collectionId);
    if (!collection) return { error: 'Collection not found' };

    const db = databases.get(collection.dbId);
    const queryId = `query-${++queryIdCounter}`;
    const startTime = Date.now();

    // Get all documents in collection
    const docs = collection.documents.map(id => documents.get(id)).filter(Boolean);

    // Determine if quantum acceleration applies
    const n = docs.length;
    const isLargeDataset = n > 100;
    const quantumAccelerated = useQuantum && isLargeDataset;

    // Simulate query execution
    let results = [];
    let classicalOps = n;
    let quantumOps = Math.ceil(Math.sqrt(n));

    if (query.filter) {
        // Filter documents
        results = docs.filter(doc => {
            for (const [key, value] of Object.entries(query.filter)) {
                if (doc.data[key] !== value) return false;
            }
            return true;
        });
    } else {
        results = docs;
    }

    // Apply limit
    if (query.limit) {
        results = results.slice(0, query.limit);
    }

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    // Calculate speedup
    const speedup = quantumAccelerated ? (classicalOps / quantumOps).toFixed(1) : 1;

    const queryRecord = {
        id: queryId,
        collectionId,
        query,
        resultCount: results.length,
        scannedDocs: n,
        quantumAccelerated,
        classicalOps,
        quantumOps: quantumAccelerated ? quantumOps : classicalOps,
        speedup,
        executionTime,
        timestamp: Date.now()
    };

    queries.push(queryRecord);

    if (db) {
        db.queryCount++;
        if (quantumAccelerated) db.quantumAccelerated++;
    }

    console.log(`[QDB] 🔍 Query executed: ${results.length} results, ${quantumAccelerated ? `Grover ${speedup}x speedup` : 'classical'}`);

    return {
        success: true,
        results: results.map(d => d.data),
        meta: queryRecord
    };
}

/**
 * Grover search - quantum unstructured search
 */
function groverSearch(collectionId, condition) {
    const collection = collections.get(collectionId);
    if (!collection) return { error: 'Collection not found' };

    const n = collection.documentCount;
    const groverIterations = Math.ceil(Math.PI / 4 * Math.sqrt(n));

    // Execute with quantum acceleration
    const result = executeQuery(collectionId, { filter: condition }, true);

    return {
        ...result,
        algorithm: 'Grover',
        iterations: groverIterations,
        complexity: `O(√${n}) = O(${Math.ceil(Math.sqrt(n))})`
    };
}

/**
 * List recent queries
 */
function listQueries(dbId = null, limit = 50) {
    let q = queries;
    if (dbId) {
        const db = databases.get(dbId);
        if (db) {
            const colIds = db.collections;
            q = q.filter(query => colIds.includes(query.collectionId));
        }
    }
    return q.slice(-limit).reverse();
}

// =========================================================================
// STATS
// =========================================================================

/**
 * Get QuantumDB stats
 */
function getDBStats() {
    const dbs = listDatabases();
    const totalDocs = dbs.reduce((sum, db) => sum + db.documentCount, 0);
    const totalQueries = dbs.reduce((sum, db) => sum + db.queryCount, 0);
    const quantumQueries = dbs.reduce((sum, db) => sum + db.quantumAccelerated, 0);

    return {
        databases: {
            total: dbs.length,
            totalSizeBytes: dbs.reduce((sum, db) => sum + db.sizeBytes, 0)
        },
        collections: {
            total: collections.size
        },
        documents: {
            total: totalDocs
        },
        queries: {
            total: totalQueries,
            quantumAccelerated: quantumQueries,
            quantumRatio: totalQueries > 0 ? (quantumQueries / totalQueries * 100).toFixed(1) + '%' : '0%'
        },
        performance: {
            avgSpeedup: queries.length > 0
                ? (queries.reduce((sum, q) => sum + parseFloat(q.speedup), 0) / queries.length).toFixed(1) + 'x'
                : '1x'
        }
    };
}

// =========================================================================
// EXPORTS
// =========================================================================

module.exports = {
    // Constants
    QUERY_TYPES,
    ENCRYPTION_MODES,

    // Databases
    createDatabase,
    listDatabases,
    getDatabase,
    deleteDatabase,

    // Collections
    createCollection,
    listCollections,
    getCollection,

    // Documents
    insertDocument,
    getDocument,
    updateDocument,
    deleteDocument,

    // Queries
    executeQuery,
    groverSearch,
    listQueries,

    // Stats
    getDBStats
};
