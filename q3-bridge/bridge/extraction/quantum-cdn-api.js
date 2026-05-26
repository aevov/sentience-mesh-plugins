/**
 * QuantumCDN API - JavaScript REST Interface
 * 
 * Quantum-secured content delivery: edge nodes, caching, QKD-secured transfers.
 * Integrates with Q3 Edge Worker for global distribution.
 */

// =========================================================================
// CONSTANTS
// =========================================================================

const EDGE_REGIONS = {
    'us-east': { name: 'US East', lat: 39.0, lng: -77.0 },
    'us-west': { name: 'US West', lat: 37.0, lng: -122.0 },
    'eu-west': { name: 'EU West', lat: 51.0, lng: -0.1 },
    'eu-central': { name: 'EU Central', lat: 50.0, lng: 8.7 },
    'asia-east': { name: 'Asia East', lat: 35.7, lng: 139.7 },
    'asia-south': { name: 'Asia South', lat: 19.1, lng: 72.9 }
};

const CACHE_POLICIES = {
    AGGRESSIVE: { ttl: 86400, staleWhileRevalidate: 3600 },
    MODERATE: { ttl: 3600, staleWhileRevalidate: 300 },
    MINIMAL: { ttl: 60, staleWhileRevalidate: 10 },
    NONE: { ttl: 0, staleWhileRevalidate: 0 }
};

// In-memory stores
let distributions = new Map();
let edgeNodes = new Map();
let cacheEntries = new Map();
let transfers = [];

let distIdCounter = 0;
let nodeIdCounter = 0;

// =========================================================================
// DISTRIBUTIONS
// =========================================================================

function createDistribution(name, origin, options = {}) {
    const id = `cdn-${++distIdCounter}`;

    const dist = {
        id,
        name,
        origin,
        enabled: true,
        cachePolicy: options.cachePolicy || 'MODERATE',
        quantumSecured: options.quantumSecured !== false,
        regions: options.regions || Object.keys(EDGE_REGIONS),
        createdAt: Date.now(),
        bytesServed: 0,
        requestCount: 0,
        cacheHitRatio: 0
    };

    distributions.set(id, dist);
    console.log(`[QCDN] 🌐 Distribution created: ${name}`);

    return { success: true, distribution: dist };
}

function listDistributions() {
    return Array.from(distributions.values());
}

function getDistribution(distId) {
    return distributions.get(distId) || null;
}

function deleteDistribution(distId) {
    if (!distributions.has(distId)) return { error: 'Distribution not found' };
    distributions.delete(distId);
    return { success: true, deleted: distId };
}

// =========================================================================
// EDGE NODES
// =========================================================================

function registerEdgeNode(region, endpoint) {
    if (!EDGE_REGIONS[region]) {
        return { error: `Invalid region. Use: ${Object.keys(EDGE_REGIONS).join(', ')}` };
    }

    const id = `edge-${++nodeIdCounter}`;

    const node = {
        id,
        region,
        regionName: EDGE_REGIONS[region].name,
        endpoint,
        status: 'healthy',
        load: Math.random() * 50,
        cacheSize: 0,
        lastHealthCheck: Date.now()
    };

    edgeNodes.set(id, node);
    console.log(`[QCDN] 📡 Edge node registered: ${region}`);

    return { success: true, node };
}

function listEdgeNodes(region = null) {
    const nodes = Array.from(edgeNodes.values());
    if (region) return nodes.filter(n => n.region === region);
    return nodes;
}

function getEdgeNode(nodeId) {
    return edgeNodes.get(nodeId) || null;
}

// =========================================================================
// CACHE
// =========================================================================

function cacheContent(distId, path, content, ttl = 3600) {
    const key = `${distId}:${path}`;

    const entry = {
        key,
        distId,
        path,
        size: typeof content === 'string' ? content.length : JSON.stringify(content).length,
        cachedAt: Date.now(),
        expiresAt: Date.now() + (ttl * 1000),
        hits: 0
    };

    cacheEntries.set(key, entry);
    return { success: true, entry };
}

function getCacheEntry(distId, path) {
    const key = `${distId}:${path}`;
    const entry = cacheEntries.get(key);

    if (!entry) return { hit: false };
    if (Date.now() > entry.expiresAt) {
        cacheEntries.delete(key);
        return { hit: false, expired: true };
    }

    entry.hits++;
    return { hit: true, entry };
}

function invalidateCache(distId, pathPattern = '*') {
    let count = 0;
    for (const [key, entry] of cacheEntries) {
        if (entry.distId === distId) {
            if (pathPattern === '*' || entry.path.includes(pathPattern)) {
                cacheEntries.delete(key);
                count++;
            }
        }
    }
    return { success: true, invalidated: count };
}

function getCacheStats(distId) {
    const entries = Array.from(cacheEntries.values()).filter(e => e.distId === distId);
    const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
    const totalHits = entries.reduce((sum, e) => sum + e.hits, 0);

    return {
        distId,
        entryCount: entries.length,
        totalSizeBytes: totalSize,
        totalHits,
        avgHitsPerEntry: entries.length > 0 ? (totalHits / entries.length).toFixed(1) : 0
    };
}

// =========================================================================
// TRANSFERS
// =========================================================================

function recordTransfer(distId, path, bytesServed, region, cacheHit) {
    const dist = distributions.get(distId);

    const transfer = {
        distId,
        path,
        bytesServed,
        region,
        cacheHit,
        quantumSecured: dist?.quantumSecured || false,
        timestamp: Date.now()
    };

    transfers.push(transfer);

    if (dist) {
        dist.bytesServed += bytesServed;
        dist.requestCount++;
    }

    // Keep last 10000 transfers
    if (transfers.length > 10000) {
        transfers = transfers.slice(-10000);
    }

    return { success: true, transfer };
}

function getTransferStats(distId = null) {
    let t = transfers;
    if (distId) t = t.filter(tr => tr.distId === distId);

    const totalBytes = t.reduce((sum, tr) => sum + tr.bytesServed, 0);
    const cacheHits = t.filter(tr => tr.cacheHit).length;

    return {
        totalTransfers: t.length,
        totalBytesServed: totalBytes,
        cacheHitRatio: t.length > 0 ? (cacheHits / t.length * 100).toFixed(1) + '%' : '0%',
        quantumSecured: t.filter(tr => tr.quantumSecured).length
    };
}

// =========================================================================
// STATS
// =========================================================================

function getCDNStats() {
    return {
        distributions: {
            total: distributions.size,
            enabled: Array.from(distributions.values()).filter(d => d.enabled).length
        },
        edgeNodes: {
            total: edgeNodes.size,
            healthy: Array.from(edgeNodes.values()).filter(n => n.status === 'healthy').length,
            byRegion: Object.keys(EDGE_REGIONS).reduce((acc, r) => {
                acc[r] = listEdgeNodes(r).length;
                return acc;
            }, {})
        },
        cache: {
            entries: cacheEntries.size,
            totalSize: Array.from(cacheEntries.values()).reduce((sum, e) => sum + e.size, 0)
        },
        transfers: getTransferStats()
    };
}

// =========================================================================
// EXPORTS
// =========================================================================

module.exports = {
    EDGE_REGIONS,
    CACHE_POLICIES,

    createDistribution,
    listDistributions,
    getDistribution,
    deleteDistribution,

    registerEdgeNode,
    listEdgeNodes,
    getEdgeNode,

    cacheContent,
    getCacheEntry,
    invalidateCache,
    getCacheStats,

    recordTransfer,
    getTransferStats,
    getCDNStats
};
