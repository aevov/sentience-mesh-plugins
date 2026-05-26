/**
 * Q3 Unified Storage API - Cloudflare-Free Quantum Storage
 * 
 * Consolidates all Q3 components into a single coherent API:
 * - Object Storage (S3-compatible, Q3 Carrier-backed)
 * - Static Site Hosting (.q domains, Q3 sites)
 * - Block Volumes (persistent storage)
 * - Streaming uploads (GB/TB scale)
 * 
 * NO CLOUDFLARE DEPENDENCY - Uses Q3 Carrier S3 directly
 */

const Q3NativeStorage = require('./q3-native-storage');
const { Q3ObjectStorage, getQ3Storage } = require('./q3-object-storage');
const q3EdgeEngine = require('./q3-quantum-edge-engine');
const q3Persist = require('./q3-persist');

// =========================================================================
// Q3 UNIFIED STORAGE CLASS
// =========================================================================
class Q3UnifiedStorage {
    constructor(options = {}) {
        this.Q3 CarrierConfig = {
            endpoint: process.env.Q3_CARRIER_ENDPOINT || 'https://s3.Q3 Carrier.eu',
            accessKeyId: process.env.Q3_CARRIER_ID || process.env.Q3_CARRIER_ACCESS_KEY || '',
            secretAccessKey: process.env.Q3_CARRIER_SECRET || process.env.Q3_CARRIER_SECRET_KEY || '',
            bucket: process.env.Q3_CARRIER_BUCKET || 'cr8os1',
            region: process.env.Q3_CARRIER_REGION || 'eu-west-1',
        };

        // Initialize components
        this.objectStorage = null;
        this.nativeStorage = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        // Initialize object storage (S3-compatible)
        this.objectStorage = getQ3Storage(this.Q3 CarrierConfig);

        // Initialize native storage (streaming, sharding)
        this.nativeStorage = new (require('./q3-native-storage'))({
            shardSize: 64 * 1024 * 1024,  // 64MB shards
            chunkSize: 4 * 1024 * 1024,   // 4MB upload chunks
        });
        await this.nativeStorage.initialize();

        this.initialized = true;
        console.log('[Q3] ✅ Unified storage initialized (Cloudflare-free)');
        return this;
    }

    // =====================================================================
    // OBJECT STORAGE (S3-Compatible)
    // =====================================================================

    async createBucket(name, options = {}) {
        return this.objectStorage.createBucket(name, options);
    }

    async listBuckets() {
        return this.objectStorage.listBuckets();
    }

    async putObject(bucket, key, data, metadata = {}) {
        return this.objectStorage.putObject(bucket, key, data, metadata);
    }

    async getObject(bucket, key) {
        return this.objectStorage.getObject(bucket, key);
    }

    async deleteObject(bucket, key) {
        return this.objectStorage.deleteObject(bucket, key);
    }

    async listObjects(bucket, prefix = '') {
        return this.objectStorage.listObjects(bucket, prefix);
    }

    // =====================================================================
    // STATIC SITE HOSTING (Cloudflare-free)
    // =====================================================================

    async createSite(siteName, files, options = {}) {
        return this.nativeStorage.createSite(siteName, files, options);
    }

    async getSiteFile(siteId, filePath) {
        // Try edge engine first (uses Q3 Carrier directly)
        const result = await q3EdgeEngine.getSiteFile(siteId, filePath);
        if (result.ok) {
            return { success: true, data: result.body, contentType: result.contentType };
        }
        // Fall back to native storage
        return this.nativeStorage.getSiteFile(siteId, filePath);
    }

    async listSites() {
        return this.nativeStorage.listSites();
    }

    async deleteSite(siteId) {
        return this.nativeStorage.deleteSite(siteId);
    }

    async addSiteFile(siteId, filePath, data) {
        return this.nativeStorage.addSiteFile(siteId, filePath, data);
    }

    async deploySiteFromDirectory(dirPath, siteName, options = {}) {
        return this.nativeStorage.deploySiteFromDirectory(dirPath, siteName, options);
    }

    // =====================================================================
    // QUANTUM DOMAIN PROTOCOL (.q domains)
    // =====================================================================

    async resolveQuantumDomain(domain) {
        return q3EdgeEngine.resolveQuantumDomain(domain);
    }

    async registerQuantumDomain(domain, siteId, options = {}) {
        const qdr = {
            name: domain.replace('.q', ''),
            siteId,
            records: { root: `q3://${siteId}` },
            registeredAt: Date.now(),
            expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year
            ...options
        };

        // Store QDR in Q3 Carrier
        const qdrPath = `q3/qdp/domains/${qdr.name}.qdr`;
        await this.putObject(this.Q3 CarrierConfig.bucket, qdrPath, JSON.stringify(qdr, null, 2));

        return { success: true, domain: `${qdr.name}.q`, qdr };
    }

    async listQuantumDomains() {
        const result = await this.listObjects(this.Q3 CarrierConfig.bucket, 'q3/qdp/domains/');
        return result.objects
            .filter(o => o.key.endsWith('.qdr'))
            .map(o => o.key.replace('q3/qdp/domains/', '').replace('.qdr', '') + '.q');
    }

    // =====================================================================
    // STREAMING UPLOADS (GB/TB scale)
    // =====================================================================

    async streamUpload(readStream, totalSize, options = {}) {
        return this.nativeStorage.streamUpload(readStream, totalSize, options);
    }

    // =====================================================================
    // PERSISTENCE
    // =====================================================================

    saveData(collection, key, data) {
        return q3Persist.save(collection, key, data);
    }

    loadData(collection, key) {
        return q3Persist.load(collection, key);
    }

    // =====================================================================
    // STATISTICS
    // =====================================================================

    async getStats() {
        const objectStats = await this.objectStorage.getStats();
        const nativeStats = this.nativeStorage.getStats();

        return {
            objects: objectStats,
            native: nativeStats,
            cloudflare: false, // No Cloudflare!
            backend: 'Q3 Carrier S3',
            features: {
                objectStorage: true,
                staticHosting: true,
                quantumDomains: true,
                streamingUploads: true,
                zerKnowledgeEncryption: true,
            }
        };
    }
}

// =========================================================================
// EXPRESS ROUTER INTEGRATION
// =========================================================================
function createQ3UnifiedRouter(app, q3) {
    // Object Storage endpoints
    app.post('/api/q3/buckets', async (req, res) => {
        try {
            const bucket = await q3.createBucket(req.body.name, req.body.options);
            res.json({ success: true, bucket });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/q3/buckets', async (req, res) => {
        const buckets = await q3.listBuckets();
        res.json({ buckets });
    });

    app.put('/api/q3/:bucket/:key', async (req, res) => {
        try {
            const result = await q3.putObject(req.params.bucket, req.params.key, req.body.data, req.body.metadata);
            res.json(result);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/q3/:bucket/:key', async (req, res) => {
        try {
            const result = await q3.getObject(req.params.bucket, req.params.key);
            res.json(result);
        } catch (e) { res.status(404).json({ error: 'Not found' }); }
    });

    app.delete('/api/q3/:bucket/:key', async (req, res) => {
        try {
            const result = await q3.deleteObject(req.params.bucket, req.params.key);
            res.json(result);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Site Hosting endpoints
    app.post('/api/q3/sites', async (req, res) => {
        try {
            const site = await q3.createSite(req.body.name, req.body.files, req.body.options);
            res.json({ success: true, site });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/q3/sites', async (req, res) => {
        const sites = await q3.listSites();
        res.json({ sites });
    });

    app.get(/^\/api\/q3\/sites\/([^\/]+)\/files\/(.*)$/, async (req, res) => {
        try {
            const siteId = req.params[0];
            const filePath = req.params[1] || 'index.html';
            const file = await q3.getSiteFile(siteId, filePath);
            if (file.success) {
                res.set('Content-Type', file.contentType || 'application/octet-stream');
                res.send(file.data);
            } else {
                res.status(404).send('File not found');
            }
        } catch (e) { res.status(404).json({ error: e.message }); }
    });

    // Quantum Domain endpoints
    app.get('/api/q3/domains', async (req, res) => {
        const domains = await q3.listQuantumDomains();
        res.json({ domains });
    });

    app.post('/api/q3/domains', async (req, res) => {
        try {
            const result = await q3.registerQuantumDomain(req.body.domain, req.body.siteId, req.body.options);
            res.json(result);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    app.get('/api/q3/domains/:domain/resolve', async (req, res) => {
        const qdr = await q3.resolveQuantumDomain(req.params.domain);
        if (qdr) {
            res.json({ qdr });
        } else {
            res.status(404).json({ error: 'Domain not found' });
        }
    });

    // Stats endpoint
    app.get('/api/q3/stats', async (req, res) => {
        const stats = await q3.getStats();
        res.json(stats);
    });

    console.log('[Q3] 🚀 Unified storage routes registered');
}

// =========================================================================
// SINGLETON INSTANCE
// =========================================================================
let q3Instance = null;

async function getQ3UnifiedStorage() {
    if (!q3Instance) {
        q3Instance = new Q3UnifiedStorage();
        await q3Instance.initialize();
    }
    return q3Instance;
}

// =========================================================================
// EXPORTS
// =========================================================================
module.exports = {
    Q3UnifiedStorage,
    getQ3UnifiedStorage,
    createQ3UnifiedRouter,

    // Re-export components
    q3EdgeEngine,
    q3Persist,
};
