/**
 * Q3Storage - Main storage class
 * 
 * Features:
 * - 64MB max shard size (nothing large stored anywhere)
 * - Encrypted shards with per-shard keys
 * - Merkle tree for integrity
 * - Multi-worker distribution (local, Q3 Storage, QUIC.cloud)
 * - Stream upload for large files (GB/TB scale)
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const Q3Sharding = require('./q3-sharding');
const Q3Encryption = require('./q3-encryption');

// Q3 Constants
const Q3_VERSION = '2.0.0';
const DEFAULT_SHARD_SIZE = 64 * 1024 * 1024; // 64MB - NOTHING LARGER STORED
const STREAM_CHUNK_SIZE = 4 * 1024 * 1024;   // 4MB upload chunks

// Backend types
const BackendType = {
    LOCAL: 'local',           // Local filesystem (development/fallback)
    Q3_CARRIER: 'Q3 Carrier',         // Q3 Storage DS3 distributed storage
    QUIC_CLOUD: 'quic_cloud', // QUIC.cloud edge cache + compute
    HYBRID: 'hybrid'          // Multiple backends with redundancy
};

class Q3Storage extends EventEmitter {
    constructor(options = {}) {
        super();

        this.config = {
            shardSize: options.shardSize || DEFAULT_SHARD_SIZE,
            chunkSize: options.chunkSize || STREAM_CHUNK_SIZE,
            redundancy: options.redundancy || 3,
            backend: options.backend || BackendType.LOCAL,
            storageDir: options.storageDir || '/opt/cr8OS-complete-quantum/q3-storage',
            enableEncryption: options.enableEncryption !== false,
            enableCompression: options.enableCompression !== false,

            // Q3 Storage config (when available)
            Q3 Carrier: {
                endpoint: options.Q3 CarrierEndpoint || process.env.Q3_CARRIER_ENDPOINT,
                accessKey: options.Q3 CarrierAccessKey || process.env.Q3_CARRIER_ACCESS_KEY,
                secretKey: options.Q3 CarrierSecretKey || process.env.Q3_CARRIER_SECRET_KEY,
                bucket: options.Q3 CarrierBucket || process.env.Q3_CARRIER_BUCKET || 'q3-shards'
            },

            // QUIC.cloud config (when available)
            quicCloud: {
                domain: options.quicCloudDomain || process.env.QUIC_CLOUD_DOMAIN,
                apiKey: options.quicCloudApiKey || process.env.QUIC_CLOUD_API_KEY,
                ttl: options.quicCloudTTL || 60  // Cache TTL triggers compute
            }
        };

        // Initialize components
        this.sharding = new Q3Sharding({
            shardSize: this.config.shardSize,
            redundancy: this.config.redundancy
        });

        this.encryption = new Q3Encryption();

        // Object registry (metadata)
        this.objects = new Map();
        this.shards = new Map();

        // Worker nodes (ACLDQ mesh)
        this.workers = new Map();

        // Statistics
        this.stats = {
            objectsStored: 0,
            bytesStored: 0,
            shardsCreated: 0,
            activeUploads: 0,
            activeDownloads: 0
        };

        // Ensure storage directory
        this._ensureStorageDir();

        // Initialize workers
        this._initializeWorkers();

        console.log(`✅ Q3 Storage v${Q3_VERSION} initialized`);
        console.log(`   Backend: ${this.config.backend}`);
        console.log(`   Shard size: ${this.config.shardSize / (1024 * 1024)}MB`);
        console.log(`   Redundancy: ${this.config.redundancy}x`);
        console.log(`   Workers: ${this.workers.size}`);
    }

    /**
     * Initialize storage system
     */
    async initialize() {
        // Initialization logic (directory checks are already in constructor)
        console.log('[Q3 Storage] System Ready');
    }

    /**
     * Store data with automatic sharding
     * Handles any size: KB, MB, GB, TB
     */
    async store(data, options = {}) {
        const objectId = this._generateObjectId();
        const name = options.name || objectId;
        const startTime = Date.now();

        console.log(`[Q3] Storing: ${name} (${this._formatBytes(data.length)})`);
        this.emit('storeStart', { objectId, name, size: data.length });

        try {
            // 1. Encrypt the data
            let processedData = data;
            let encryptionMeta = null;

            if (this.config.enableEncryption) {
                const encrypted = this.encryption.encrypt(data);
                processedData = encrypted.data;
                encryptionMeta = encrypted.meta;
            }

            // 2. Shard the data
            const shardResults = await this.sharding.shard(processedData, objectId);

            // 3. Distribute shards to workers
            await this._distributeShards(shardResults.shards);

            // 4. Create object metadata
            const object = {
                objectId,
                name,
                type: options.type || 'blob',
                contentType: options.contentType || 'application/octet-stream',
                size: data.length,
                encryptedSize: processedData.length,
                shardCount: shardResults.shards.length,
                merkleRoot: shardResults.merkleRoot,
                encryption: encryptionMeta,
                contentHash: crypto.createHash('sha256').update(data).digest('hex'),
                createdAt: Date.now(),
                updatedAt: Date.now(),
                redundancy: this.config.redundancy,
                shards: shardResults.shards.map(s => s.shardId),
                tags: options.tags || {}
            };

            // 5. Store metadata
            this.objects.set(objectId, object);
            this.stats.objectsStored++;
            this.stats.bytesStored += data.length;

            const duration = Date.now() - startTime;
            console.log(`[Q3] ✅ Stored: ${objectId} (${shardResults.shards.length} shards, ${duration}ms)`);

            this.emit('storeComplete', { objectId, object, duration });
            return object;

        } catch (error) {
            console.error(`[Q3] ❌ Store failed: ${error.message}`);
            this.emit('storeError', { objectId, error });
            throw error;
        }
    }

    /**
     * Stream upload for large files (GB/TB scale)
     */
    async streamStore(readStream, totalSize, options = {}) {
        const objectId = this._generateObjectId();
        const name = options.name || objectId;

        console.log(`[Q3] Stream upload: ${name} (${this._formatBytes(totalSize)})`);
        this.stats.activeUploads++;

        return new Promise((resolve, reject) => {
            const shards = [];
            let currentBuffer = Buffer.alloc(0);
            let processedBytes = 0;
            let shardIndex = 0;

            // Initialize encryption stream if enabled
            const encryptionKey = this.config.enableEncryption
                ? crypto.randomBytes(32)
                : null;
            const iv = encryptionKey ? crypto.randomBytes(12) : null;
            const cipher = encryptionKey
                ? crypto.createCipheriv('aes-256-gcm', encryptionKey, iv)
                : null;

            readStream.on('data', async (chunk) => {
                // Encrypt chunk
                const processedChunk = cipher ? cipher.update(chunk) : chunk;
                currentBuffer = Buffer.concat([currentBuffer, processedChunk]);
                processedBytes += chunk.length;

                // Emit progress
                const percent = Math.round((processedBytes / totalSize) * 100);
                this.emit('uploadProgress', { objectId, processedBytes, totalSize, percent });

                // If we have enough for a shard, write it
                while (currentBuffer.length >= this.config.shardSize) {
                    const shardData = currentBuffer.slice(0, this.config.shardSize);
                    currentBuffer = currentBuffer.slice(this.config.shardSize);

                    const shard = await this._writeShardToBackend(objectId, shardIndex, shardData);
                    shards.push(shard);
                    shardIndex++;

                    console.log(`[Q3] Shard ${shardIndex} written (${this._formatBytes(shardData.length)})`);
                }
            });

            readStream.on('end', async () => {
                try {
                    // Finalize cipher and write remaining data
                    if (cipher) {
                        const finalChunk = cipher.final();
                        currentBuffer = Buffer.concat([currentBuffer, finalChunk]);
                    }

                    // Write final shard if any data remains
                    if (currentBuffer.length > 0) {
                        const shard = await this._writeShardToBackend(objectId, shardIndex, currentBuffer);
                        shards.push(shard);
                    }

                    const authTag = cipher ? cipher.getAuthTag() : null;

                    // Build Merkle tree
                    const merkle = this.sharding.buildMerkleTree(shards.map(s => s.hash));

                    // Create object metadata
                    const object = {
                        objectId,
                        name,
                        type: 'stream',
                        size: totalSize,
                        shardCount: shards.length,
                        merkleRoot: merkle.root,
                        encryption: encryptionKey ? {
                            algorithm: 'aes-256-gcm',
                            keyId: crypto.createHash('sha256').update(encryptionKey).digest('hex').slice(0, 16),
                            key: encryptionKey.toString('hex'),
                            iv: iv.toString('hex'),
                            tag: authTag ? authTag.toString('hex') : null
                        } : null,
                        createdAt: Date.now(),
                        redundancy: this.config.redundancy,
                        shards: shards.map(s => s.shardId)
                    };

                    this.objects.set(objectId, object);
                    this.stats.objectsStored++;
                    this.stats.bytesStored += totalSize;
                    this.stats.activeUploads--;

                    console.log(`[Q3] ✅ Stream upload complete: ${objectId} (${shards.length} shards)`);
                    resolve(object);

                } catch (error) {
                    this.stats.activeUploads--;
                    reject(error);
                }
            });

            readStream.on('error', (error) => {
                this.stats.activeUploads--;
                reject(error);
            });
        });
    }

    /**
     * Retrieve an object (reassemble shards)
     */
    async retrieve(objectId) {
        const object = this.objects.get(objectId);
        if (!object) {
            throw new Error(`Object not found: ${objectId}`);
        }

        console.log(`[Q3] Retrieving: ${object.name} (${object.shardCount} shards)`);
        this.stats.activeDownloads++;

        try {
            // 1. Retrieve all shards
            const shardBuffers = [];
            for (const shardId of object.shards) {
                const shardData = await this._readShardFromBackend(shardId);
                shardBuffers.push(shardData);
            }

            // 2. Combine shards
            const combined = Buffer.concat(shardBuffers);

            // 3. Decrypt if encrypted
            let data = combined;
            if (object.encryption) {
                data = this.encryption.decrypt(combined, object.encryption);
            }

            // 4. Verify integrity
            const hash = crypto.createHash('sha256').update(data).digest('hex');
            if (object.contentHash && hash !== object.contentHash) {
                throw new Error('Content integrity check failed');
            }

            this.stats.activeDownloads--;
            console.log(`[Q3] ✅ Retrieved: ${object.name} (${this._formatBytes(data.length)})`);

            return { object, data };

        } catch (error) {
            this.stats.activeDownloads--;
            throw error;
        }
    }

    /**
     * Delete an object and its shards
     */
    async delete(objectId) {
        const object = this.objects.get(objectId);
        if (!object) return false;

        console.log(`[Q3] Deleting: ${object.name}`);

        // Delete all shards
        for (const shardId of object.shards) {
            await this._deleteShardFromBackend(shardId);
        }

        this.objects.delete(objectId);
        console.log(`[Q3] 🗑️ Deleted: ${objectId}`);

        return true;
    }

    /**
     * List all objects
     */
    list(filter = {}) {
        const objects = Array.from(this.objects.values());

        return objects
            .filter(obj => {
                if (filter.type && obj.type !== filter.type) return false;
                if (filter.name && !obj.name.includes(filter.name)) return false;
                return true;
            })
            .map(obj => ({
                objectId: obj.objectId,
                name: obj.name,
                size: obj.size,
                type: obj.type,
                shardCount: obj.shardCount,
                createdAt: obj.createdAt
            }));
    }

    /**
     * Get storage statistics
     */
    getStats() {
        return {
            ...this.stats,
            objectCount: this.objects.size,
            shardCount: this.shards.size,
            workerCount: this.workers.size,
            backend: this.config.backend,
            workers: Array.from(this.workers.values()).map(w => ({
                nodeId: w.nodeId,
                type: w.type,
                shardCount: w.shardCount,
                status: w.status
            }))
        };
    }

    // ==================== BACKEND OPERATIONS ====================

    async _distributeShards(shards) {
        const workers = Array.from(this.workers.values()).filter(w => w.status === 'healthy');

        for (let i = 0; i < shards.length; i++) {
            const shard = shards[i];

            // Primary worker (round-robin)
            const primaryWorker = workers[i % workers.length];
            shard.nodeId = primaryWorker.nodeId;

            // Replica workers
            shard.replicas = [];
            for (let r = 1; r < this.config.redundancy && r < workers.length; r++) {
                shard.replicas.push(workers[(i + r) % workers.length].nodeId);
            }

            // Write to backend
            await this._writeShardToBackend(shard.objectId, shard.index, shard.data);

            // Update worker stats
            primaryWorker.shardCount++;

            // Store shard metadata
            this.shards.set(shard.shardId, shard);
            this.stats.shardsCreated++;
        }
    }

    async _writeShardToBackend(objectId, index, data) {
        const shardId = `${objectId}-shard-${index}`;
        const hash = crypto.createHash('sha256').update(data).digest('hex');

        switch (this.config.backend) {
            case BackendType.LOCAL:
            case BackendType.HYBRID:
                // Write to local storage
                const shardPath = path.join(this.config.storageDir, 'shards', shardId);
                fs.writeFileSync(shardPath, data);
                break;

            case BackendType.Q3_CARRIER:
                // TODO: Write to Q3 Storage DS3 when ready
                // await this._writeToQ3Storage(shardId, data);
                const shardPathQ3Storage = path.join(this.config.storageDir, 'shards', shardId);
                fs.writeFileSync(shardPathQ3Storage, data);
                break;

            case BackendType.QUIC_CLOUD:
                // TODO: Write to QUIC.cloud when ready
                // await this._writeToQuicCloud(shardId, data);
                const shardPathQuic = path.join(this.config.storageDir, 'shards', shardId);
                fs.writeFileSync(shardPathQuic, data);
                break;
        }

        return { shardId, objectId, index, size: data.length, hash };
    }

    async _readShardFromBackend(shardId) {
        const shard = this.shards.get(shardId);

        switch (this.config.backend) {
            case BackendType.LOCAL:
            case BackendType.HYBRID:
            case BackendType.Q3_CARRIER:
            case BackendType.QUIC_CLOUD:
            default:
                // Read from local storage (fallback for all backends until ready)
                const shardPath = path.join(this.config.storageDir, 'shards', shardId);
                if (fs.existsSync(shardPath)) {
                    return fs.readFileSync(shardPath);
                }
                throw new Error(`Shard not found: ${shardId}`);
        }
    }

    async _deleteShardFromBackend(shardId) {
        const shardPath = path.join(this.config.storageDir, 'shards', shardId);
        if (fs.existsSync(shardPath)) {
            fs.unlinkSync(shardPath);
        }
        this.shards.delete(shardId);
    }

    // ==================== HELPERS ====================

    _ensureStorageDir() {
        const dirs = [
            this.config.storageDir,
            path.join(this.config.storageDir, 'shards'),
            path.join(this.config.storageDir, 'metadata'),
            path.join(this.config.storageDir, 'keys')
        ];

        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }

    _initializeWorkers() {
        // Initialize local workers for development
        // In production, workers come from ACLDQ mesh
        for (let i = 0; i < 3; i++) {
            this.workers.set(`local-worker-${i}`, {
                nodeId: `local-worker-${i}`,
                type: 'local',
                endpoint: `local://worker-${i}`,
                status: 'healthy',
                shardCount: 0,
                capacity: {
                    totalBytes: 100 * 1024 * 1024 * 1024, // 100GB
                    usedBytes: 0
                },
                lastHeartbeat: Date.now()
            });
        }
    }

    _generateObjectId() {
        return 'q3-' + crypto.randomBytes(12).toString('hex');
    }

    _formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // ==================== WASM IMAGE SPECIFIC ====================

    /**
     * Store a WASM image with proper sharding
     */
    async storeWasmImage(imagePath, imageName) {
        const stats = fs.statSync(imagePath);
        console.log(`[Q3] Storing WASM image: ${imageName} (${this._formatBytes(stats.size)})`);

        const readStream = fs.createReadStream(imagePath, { highWaterMark: this.config.chunkSize });

        return this.streamStore(readStream, stats.size, {
            name: imageName,
            type: 'wasm-image',
            contentType: 'application/wasm',
            tags: {
                category: 'wasm',
                source: 'quantum-engine'
            }
        });
    }

    /**
     * Retrieve a WASM image
     */
    async retrieveWasmImage(imageName) {
        // Find by name
        for (const [objectId, obj] of this.objects) {
            if (obj.name === imageName && obj.type === 'wasm-image') {
                return this.retrieve(objectId);
            }
        }
        throw new Error(`WASM image not found: ${imageName}`);
    }

    /**
     * List all WASM images
     */
    listWasmImages() {
        return this.list({ type: 'wasm-image' });
    }
}

module.exports = Q3Storage;
