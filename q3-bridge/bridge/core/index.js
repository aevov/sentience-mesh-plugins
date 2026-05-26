/**
 * Q3 Storage Protocol - Quantum Object Storage
 * 
 * Comprehensive implementation with:
 * - 64MB shard distribution (nothing large stored anywhere)
 * - AES-256-GCM encryption per shard
 * - Merkle tree verification
 * - Multi-backend support (local, Q3 Storage, QUIC.cloud)
 * - AevIP transport (72-hour resilience)
 * - Compute-on-storage capability
 * - Backward S3 compatibility
 * - Space-capable architecture
 * 
 * Based on Q3 Storage libraries:
 * - web-file-stream: Browser streaming
 * - chronos: Fiber scheduling
 * - PyKMIP: Key management
 * - uWebSockets: High-perf transport
 * - composer-cli: Swarm management
 */

// Core modules
const Q3Storage = require('./q3-storage');
const Q3Sharding = require('./q3-sharding');
const Q3Encryption = require('./q3-encryption');
const Q3Transport = require('./q3-transport');
const Q3CLI = require('./q3-cli');

// Enhanced modules (pending technologies now integrated)
const { BidcChannel, BidcManager, ChannelState, BidcMessageType } = require('./q3-bidc');
const { QuantumShardManager, QuantumShardType, ShardingStrategy, MAX_SHARD_SIZE } = require('./q3-quantum-sharding');
const { WorkerBridge, StorageOperation, WorkerState, ComputeCapability } = require('./q3-worker-bridge');
const { EnigmaLayer, StreamState, ALGORITHM, IV_LENGTH, AUTH_TAG_LENGTH, CHUNK_SIZE } = require('./q3-enigma');

// Cloud integrations
// const { Q3StorageTransport } = require('./q3-Q3 Carrier');
const { QuicCloudTransport } = require('./q3-quiccloud');
const cloudConfig = require('./q3-cloud-config');


module.exports = {
    // Core
    Q3Storage,
    Q3Sharding,
    Q3Encryption,
    Q3Transport,
    Q3CLI,

    // Bidirectional Channels (bidc)
    BidcChannel,
    BidcManager,
    ChannelState,
    BidcMessageType,

    // Quantum-Aware Sharding
    QuantumShardManager,
    QuantumShardType,
    ShardingStrategy,
    MAX_SHARD_SIZE,

    // Worker Bridge (ACLDQ Integration)
    WorkerBridge,
    StorageOperation,
    WorkerState,
    ComputeCapability,

    // Streaming Encryption (Enigma)
    EnigmaLayer,
    StreamState,
    ALGORITHM,
    IV_LENGTH,
    AUTH_TAG_LENGTH,
    CHUNK_SIZE,

    // Cloud Integrations
    // Q3StorageTransport,
    QuicCloudTransport,
    cloudConfig,

    // Factory functions
    createQ3Client: (options = {}) => new Q3Storage(options),


    createQuantumShardManager: (options = {}) => new QuantumShardManager(options),

    createBidcManager: (options = {}) => new BidcManager(options),

    createWorkerBridge: async (q3Storage, options = {}) => {
        const bridge = new WorkerBridge(options);
        await bridge.initialize(q3Storage);
        return bridge;
    },

    createEnigmaLayer: (options = {}) => new EnigmaLayer(options),

    /**
     * Create a complete Q3 system with all components
     */
    createQ3System: async (options = {}) => {
        // Create core storage
        const storage = new Q3Storage(options);
        await storage.initialize();

        // Create quantum shard manager
        const shardManager = new QuantumShardManager({
            strategy: options.shardingStrategy || ShardingStrategy.BYTE_BOUNDARY
        });

        // Create bidc manager
        const bidcManager = new BidcManager({
            maxChannels: options.maxChannels || 100
        });

        // Create worker bridge
        const workerBridge = new WorkerBridge(options);
        await workerBridge.initialize(storage);

        // Create enigma layer
        const enigma = new EnigmaLayer(options);

        return {
            storage,
            shardManager,
            bidcManager,
            workerBridge,
            enigma,

            // Convenience methods
            store: (data, opts) => storage.store(data, opts),
            retrieve: (objectId) => storage.retrieve(objectId),
            delete: (objectId) => storage.delete(objectId),
            list: (filter) => storage.list(filter),

            // Quantum sharding
            shardQuantum: (data, objectId, opts) => shardManager.shard(data, objectId, opts),

            // Encrypted operations
            encryptAndStore: async (data, masterKey, opts) => {
                const key = masterKey || enigma.generateKey();
                const { encrypted, iv, authTag } = enigma.encrypt(data, key);
                const result = await storage.store(encrypted, {
                    ...opts,
                    encryption: { iv: iv.toString('base64'), authTag: authTag.toString('base64') }
                });
                return { ...result, key };
            },

            // Worker operations
            registerWorker: (info) => workerBridge.registerWorker(info),
            dispatchCompute: (dispatch) => workerBridge.dispatchCompute(dispatch),

            // Statistics
            getStats: () => ({
                storage: storage.getStats(),
                shardManager: shardManager.getStats(),
                bidcManager: bidcManager.getStats(),
                workerBridge: workerBridge.getStats(),
                enigma: enigma.getStats()
            })
        };
    }
};
