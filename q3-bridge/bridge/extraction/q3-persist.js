/**
 * Q3 Persistence Layer - Storage Backend for all Quantum Systems
 * Uses Q3 object storage for persisting quantum system data.
 */

const fs = require('fs');
const path = require('path');

// Persistence directory (use Q3 storage in production)
const PERSIST_DIR = process.env.Q3_PERSIST_DIR || './q3-persist';

// Ensure directory exists
if (!fs.existsSync(PERSIST_DIR)) {
    fs.mkdirSync(PERSIST_DIR, { recursive: true });
}

/**
 * Save data to Q3 storage
 */
function save(collection, key, data) {
    const filePath = path.join(PERSIST_DIR, `${collection}_${key}.json`);
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return { success: true, path: filePath };
    } catch (e) {
        console.error(`[Q3Persist] Save error: ${e.message}`);
        return { error: e.message };
    }
}

/**
 * Load data from Q3 storage
 */
function load(collection, key) {
    const filePath = path.join(PERSIST_DIR, `${collection}_${key}.json`);
    try {
        if (!fs.existsSync(filePath)) return null;
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error(`[Q3Persist] Load error: ${e.message}`);
        return null;
    }
}

/**
 * Delete data from Q3 storage
 */
function remove(collection, key) {
    const filePath = path.join(PERSIST_DIR, `${collection}_${key}.json`);
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return { success: true };
        }
        return { error: 'Not found' };
    } catch (e) {
        return { error: e.message };
    }
}

/**
 * List all keys in a collection
 */
function list(collection) {
    try {
        const files = fs.readdirSync(PERSIST_DIR);
        return files
            .filter(f => f.startsWith(collection + '_') && f.endsWith('.json'))
            .map(f => f.replace(`${collection}_`, '').replace('.json', ''));
    } catch (e) {
        return [];
    }
}

/**
 * Save entire Map to storage
 */
function saveMap(collection, map) {
    const data = {};
    for (const [key, value] of map) {
        data[key] = value;
    }
    return save(collection, 'all', data);
}

/**
 * Load entire Map from storage
 */
function loadMap(collection) {
    const data = load(collection, 'all');
    if (!data) return new Map();
    return new Map(Object.entries(data));
}

/**
 * Save array to storage
 */
function saveArray(collection, array) {
    return save(collection, 'all', array);
}

/**
 * Load array from storage
 */
function loadArray(collection) {
    return load(collection, 'all') || [];
}

module.exports = {
    save,
    load,
    remove,
    list,
    saveMap,
    loadMap,
    saveArray,
    loadArray,
    PERSIST_DIR
};
