/**
 * Q3 Compute Trigger - Cache-to-Compute Integration
 * 
 * Connects QUIC.cloud cache events to the WorkerBridge compute system:
 * - Cache miss → Fetch from Q3 Storage + optional pre-compute
 * - TTL expiry → Dispatch compute job
 * - Invalidation → Recompute + purge all domains
 * 
 * DRY System Variants:
 * - CQQC: Compressed Quantum Query Cache
 * - CBQC: Compressed Binary Quantum Cache  
 * - CTQC: Compressed Tensor Quantum Cache
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

// Trigger types
const TriggerType = {
    CACHE_MISS: 'cache_miss',
    TTL_EXPIRY: 'ttl_expiry',
    INVALIDATION: 'invalidation',
    PREFETCH: 'prefetch',
    REPLICATION: 'replication'
};

// Compute priority levels
const ComputePriority = {
    CRITICAL: 0,    // Immediate execution
    HIGH: 1,        // Within 1 second
    NORMAL: 2,      // Within 10 seconds
    LOW: 3,         // Background
    BATCH: 4        // Batch processing
};

// DRY system types
const DRYSystem = {
    CQQC: 'cqqc',   // Quantum query cache
    CBQC: 'cbqc',   // Binary quantum cache
    CTQC: 'ctqc'    // Tensor quantum cache
};

class ComputeTrigger extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            workerBridge: config.workerBridge,
            quicCloud: config.quicCloud,
            Q3 Carrier: config.Q3 Carrier,

            // Compute thresholds
            minComputeInterval: config.minComputeInterval || 1000, // 1s between computes
            maxConcurrentJobs: config.maxConcurrentJobs || 100,
            batchSize: config.batchSize || 10,

            // TTL-based triggers
            triggers: {
                shardTTL: 3600,      // Recompute shards hourly
                wasmTTL: 86400,      // Recompute WASM daily
                queryTTL: 60,        // Recompute queries per minute
                tensorTTL: 300       // Recompute tensors every 5 min
            }
        };

        // Active jobs
        this.activeJobs = new Map();
        this.pendingQueue = [];

        // DRY caches
        this.dryCaches = {
            cqqc: new Map(),  // Query cache
            cbqc: new Map(),  // Binary cache
            ctqc: new Map()   // Tensor cache
        };

        // Statistics
        this.stats = {
            triggersReceived: 0,
            computeJobsDispatched: 0,
            cacheHits: 0,
            cacheMisses: 0,
            averageComputeTime: 0,
            lastComputeTime: null,

            // Per-domain stats
            domainStats: {}
        };

        // Initialize domain stats
        if (config.quicCloud?.domains) {
            for (const domain of config.quicCloud.domains) {
                this.stats.domainStats[domain.domain] = {
                    triggers: 0,
                    computes: 0,
                    hits: 0,
                    misses: 0
                };
            }
        }
    }

    /**
     * Handle cache event from QUIC.cloud
     */
    async handleCacheEvent(event) {
        this.stats.triggersReceived++;

        const trigger = {
            id: `trigger-${crypto.randomBytes(4).toString('hex')}`,
            type: event.type,
            domain: event.domain,
            path: event.path,
            objectId: event.objectId,
            shardId: event.shardId,
            timestamp: Date.now(),
            priority: this._determinePriority(event)
        };

        // Update domain stats
        if (this.stats.domainStats[event.domain]) {
            this.stats.domainStats[event.domain].triggers++;
        }

        this.emit('trigger', trigger);

        switch (event.type) {
            case TriggerType.CACHE_MISS:
                return this._handleCacheMiss(trigger);

            case TriggerType.TTL_EXPIRY:
                return this._handleTTLExpiry(trigger);

            case TriggerType.INVALIDATION:
                return this._handleInvalidation(trigger);

            case TriggerType.PREFETCH:
                return this._handlePrefetch(trigger);

            case TriggerType.REPLICATION:
                return this._handleReplication(trigger);

            default:
                console.warn(`[ComputeTrigger] Unknown event type: ${event.type}`);
        }
    }

    /**
     * Handle cache miss - fetch and optionally compute
     */
    async _handleCacheMiss(trigger) {
        this.stats.cacheMisses++;

        // Check DRY caches first
        const dryResult = this._checkDRYCache(trigger);
        if (dryResult) {
            this.stats.cacheHits++;
            return { fromCache: true, data: dryResult };
        }

        // Fetch from Q3 Storage
        if (this.config.Q3 Carrier && trigger.shardId) {
            try {
                const shard = await this.config.Q3 Carrier.getShard(
                    trigger.shardId,
                    trigger.objectId
                );

                // Store in DRY cache
                this._storeDRYCache(trigger, shard.data);

                return { fromCache: false, data: shard };
            } catch (error) {
                console.error(`[ComputeTrigger] Q3 Storage fetch failed:`, error.message);
            }
        }

        return { fromCache: false, data: null };
    }

    /**
     * Handle TTL expiry - dispatch compute job
     */
    async _handleTTLExpiry(trigger) {
        // Check if we should throttle
        if (!this._shouldCompute(trigger)) {
            this.pendingQueue.push(trigger);
            return { queued: true };
        }

        // Dispatch compute job
        return this._dispatchCompute(trigger, 'ttl_recompute');
    }

    /**
     * Handle invalidation - recompute and purge all domains
     */
    async _handleInvalidation(trigger) {
        // Clear DRY caches
        this._clearDRYCache(trigger);

        // Dispatch urgent recompute
        const result = await this._dispatchCompute(trigger, 'invalidation_recompute');

        // Purge from all QUIC.cloud domains
        if (this.config.quicCloud) {
            await this._purgeAllDomains(trigger);
        }

        return result;
    }

    /**
     * Handle prefetch - preemptive compute
     */
    async _handlePrefetch(trigger) {
        // Lower priority compute
        trigger.priority = ComputePriority.LOW;
        return this._dispatchCompute(trigger, 'prefetch');
    }

    /**
     * Handle replication - push to replica domain
     */
    async _handleReplication(trigger) {
        // Fetch shard
        const shard = await this._handleCacheMiss(trigger);

        if (shard.data && this.config.quicCloud) {
            // Get replica domain URL
            const replicaUrl = this.config.quicCloud.getUrlByPurpose(
                'replica',
                `/q3/shard/${trigger.objectId}/${trigger.shardId}`
            );

            this.emit('replicated', { trigger, url: replicaUrl });
        }

        return { replicated: true };
    }

    /**
     * Dispatch compute job to WorkerBridge
     */
    async _dispatchCompute(trigger, operation) {
        if (!this.config.workerBridge) {
            console.warn('[ComputeTrigger] No WorkerBridge configured');
            return { dispatched: false };
        }

        const job = {
            dispatchId: `compute-${trigger.id}`,
            objectId: trigger.objectId,
            operation: operation,
            priority: trigger.priority,
            parameters: {
                shardId: trigger.shardId,
                domain: trigger.domain,
                triggerType: trigger.type
            }
        };

        // Track active job
        this.activeJobs.set(job.dispatchId, {
            ...job,
            startTime: Date.now()
        });

        try {
            const result = await this.config.workerBridge.dispatchCompute(job);

            // Update stats
            this.stats.computeJobsDispatched++;
            this.stats.lastComputeTime = Date.now();

            if (this.stats.domainStats[trigger.domain]) {
                this.stats.domainStats[trigger.domain].computes++;
            }

            // Calculate average compute time
            const jobInfo = this.activeJobs.get(job.dispatchId);
            if (jobInfo) {
                const duration = Date.now() - jobInfo.startTime;
                this.stats.averageComputeTime =
                    (this.stats.averageComputeTime + duration) / 2;
            }

            this.activeJobs.delete(job.dispatchId);
            this.emit('computed', { trigger, result });

            return { dispatched: true, result };

        } catch (error) {
            this.activeJobs.delete(job.dispatchId);
            console.error(`[ComputeTrigger] Compute failed:`, error.message);
            return { dispatched: false, error: error.message };
        }
    }

    // ==================== DRY CACHE SYSTEM ====================

    /**
     * Check DRY caches (CQQC, CBQC, CTQC)
     */
    _checkDRYCache(trigger) {
        const key = this._getDRYCacheKey(trigger);

        // Check each DRY cache
        for (const cacheType of Object.values(DRYSystem)) {
            const cache = this.dryCaches[cacheType];
            if (cache.has(key)) {
                const entry = cache.get(key);

                // Check if still valid
                if (Date.now() - entry.timestamp < this._getDRYCacheTTL(cacheType)) {
                    entry.hits++;
                    return entry.data;
                } else {
                    // Expired
                    cache.delete(key);
                }
            }
        }

        return null;
    }

    /**
     * Store in appropriate DRY cache
     */
    _storeDRYCache(trigger, data) {
        const key = this._getDRYCacheKey(trigger);
        const cacheType = this._selectDRYCache(trigger, data);

        this.dryCaches[cacheType].set(key, {
            data,
            timestamp: Date.now(),
            hits: 0,
            size: data.length || 0
        });
    }

    /**
     * Clear DRY cache entry
     */
    _clearDRYCache(trigger) {
        const key = this._getDRYCacheKey(trigger);

        for (const cache of Object.values(this.dryCaches)) {
            cache.delete(key);
        }
    }

    /**
     * Get DRY cache key
     */
    _getDRYCacheKey(trigger) {
        return `${trigger.objectId}:${trigger.shardId || 'full'}`;
    }

    /**
     * Select appropriate DRY cache based on data type
     */
    _selectDRYCache(trigger, data) {
        // Tensor data → CTQC
        if (trigger.path?.includes('/tensor/') || trigger.type === 'tensor') {
            return DRYSystem.CTQC;
        }

        // Binary data → CBQC
        if (Buffer.isBuffer(data) && data.length > 1024) {
            return DRYSystem.CBQC;
        }

        // Query/metadata → CQQC
        return DRYSystem.CQQC;
    }

    /**
     * Get TTL for DRY cache type
     */
    _getDRYCacheTTL(cacheType) {
        switch (cacheType) {
            case DRYSystem.CQQC: return 60 * 1000;      // 1 minute
            case DRYSystem.CBQC: return 5 * 60 * 1000;  // 5 minutes
            case DRYSystem.CTQC: return 60 * 60 * 1000; // 1 hour
            default: return 60 * 1000;
        }
    }

    // ==================== HELPERS ====================

    /**
     * Determine compute priority
     */
    _determinePriority(event) {
        // Invalidation = critical
        if (event.type === TriggerType.INVALIDATION) {
            return ComputePriority.CRITICAL;
        }

        // API domain = high priority
        if (event.domain === 'app.convobuilder.com') {
            return ComputePriority.HIGH;
        }

        // TTL expiry = normal
        if (event.type === TriggerType.TTL_EXPIRY) {
            return ComputePriority.NORMAL;
        }

        // Replication = low
        if (event.domain?.includes('rep.convobuilder.com')) {
            return ComputePriority.LOW;
        }

        return ComputePriority.NORMAL;
    }

    /**
     * Check if we should compute (throttling)
     */
    _shouldCompute(trigger) {
        // Check max concurrent
        if (this.activeJobs.size >= this.config.maxConcurrentJobs) {
            return false;
        }

        // Check min interval
        if (this.stats.lastComputeTime) {
            const elapsed = Date.now() - this.stats.lastComputeTime;
            if (elapsed < this.config.minComputeInterval) {
                return false;
            }
        }

        return true;
    }

    /**
     * Purge from all QUIC.cloud domains
     */
    async _purgeAllDomains(trigger) {
        const quic = this.config.quicCloud;
        if (!quic) return;

        const urls = quic.getAllShardUrls(trigger.shardId, trigger.objectId);

        for (const { url, domain } of urls) {
            try {
                await quic.purgeShard(trigger.shardId, trigger.objectId);
                console.log(`[ComputeTrigger] Purged from ${domain}`);
            } catch (error) {
                console.error(`[ComputeTrigger] Purge failed for ${domain}:`, error.message);
            }
        }
    }

    /**
     * Process pending queue
     */
    async processPendingQueue() {
        while (this.pendingQueue.length > 0 && this._shouldCompute({})) {
            const trigger = this.pendingQueue.shift();
            await this._dispatchCompute(trigger, 'queued_compute');
        }
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            activeJobs: this.activeJobs.size,
            pendingQueue: this.pendingQueue.length,
            dryCacheStats: {
                cqqc: this.dryCaches.cqqc.size,
                cbqc: this.dryCaches.cbqc.size,
                ctqc: this.dryCaches.ctqc.size
            }
        };
    }

    /**
     * Get compute frequency analysis
     */
    getComputeFrequency() {
        const now = Date.now();
        const hour = 60 * 60 * 1000;

        return {
            computesPerHour: this.stats.computeJobsDispatched,
            averageComputeTimeMs: this.stats.averageComputeTime,
            cacheHitRate: this.stats.triggersReceived > 0
                ? (this.stats.cacheHits / this.stats.triggersReceived * 100).toFixed(2) + '%'
                : 'N/A',
            perDomain: Object.entries(this.stats.domainStats).map(([domain, stats]) => ({
                domain,
                triggers: stats.triggers,
                computes: stats.computes,
                hitRate: stats.triggers > 0
                    ? ((stats.hits / stats.triggers) * 100).toFixed(2) + '%'
                    : 'N/A'
            }))
        };
    }
}

module.exports = {
    ComputeTrigger,
    TriggerType,
    ComputePriority,
    DRYSystem
};
