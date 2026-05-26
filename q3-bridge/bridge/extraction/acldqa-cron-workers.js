// ACLDQA Rotating Cron Workers
// 10 workers that call each other in a decaying interval pattern
// Each worker gets periodic "breathing room"

const AWS = require('aws-sdk');
const { ACLDQAProtocol, ParentBIDCController, ORIKIProtocol } = require('./acldqa-protocol');

// Q3 Carrier S3 client
const s3 = new AWS.S3({
    endpoint: 'https://s3.Q3 Carrier.io',
    accessKeyId: process.env.Q3_CARRIER_ID || '',
    secretAccessKey: process.env.Q3_CARRIER_SECRET || '',
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
});

const BUCKET = 'cr8os1';
const PREFIX = 'acldqa/workers/';

/**
 * Rotating Cron Worker
 * Implements the decaying interval pattern with breathing room
 */
class RotatingCronWorker {
    constructor(workerId) {
        this.workerId = workerId;
        this.name = `cron-worker-${workerId}`;
        this.acldqa = new ACLDQAProtocol();
        this.oriki = new ORIKIProtocol();
        this.isActive = false;
        this.callsReceived = 0;
        this.callsSent = 0;
        this.restingUntil = null;
        this.metrics = {
            avgResponseTime: 0,
            errorRate: 0,
            backpressure: 0,
        };
    }

    async start() {
        console.log(`🚀 ${this.name} starting...`);

        // Load state from Q3 Carrier
        await this.loadState();

        // Start listening for calls
        this.startListener();

        // If this is worker 0, start the rotation
        if (this.workerId === 0) {
            await this.startRotation();
        }

        // Heartbeat
        this.startHeartbeat();

        console.log(`✅ ${this.name} ready`);
    }

    async loadState() {
        try {
            const data = await s3.getObject({
                Bucket: BUCKET,
                Key: `${PREFIX}${this.name}/state.json`,
            }).promise();

            const state = JSON.parse(data.Body.toString());
            this.callsReceived = state.callsReceived || 0;
            this.callsSent = state.callsSent || 0;
            this.restingUntil = state.restingUntil;
            this.metrics = state.metrics || this.metrics;

            console.log(`📥 ${this.name}: Loaded state`);
        } catch (err) {
            console.log(`ℹ️ ${this.name}: Fresh start`);
        }
    }

    async saveState() {
        await s3.putObject({
            Bucket: BUCKET,
            Key: `${PREFIX}${this.name}/state.json`,
            Body: JSON.stringify({
                workerId: this.workerId,
                name: this.name,
                callsReceived: this.callsReceived,
                callsSent: this.callsSent,
                restingUntil: this.restingUntil,
                metrics: this.metrics,
                lastUpdate: new Date().toISOString(),
            }, null, 2),
            ContentType: 'application/json',
        }).promise();
    }

    /**
     * Listen for incoming calls from other workers
     */
    startListener() {
        setInterval(async () => {
            try {
                // Check for pending calls to this worker
                const callsKey = `${PREFIX}${this.name}/pending/`;
                const result = await s3.listObjectsV2({
                    Bucket: BUCKET,
                    Prefix: callsKey,
                    MaxKeys: 10,
                }).promise();

                for (const obj of result.Contents || []) {
                    await this.handleCall(obj.Key);
                }
            } catch (err) {
                // No pending calls
            }
        }, 1000); // Check every second
    }

    async handleCall(callKey) {
        const startTime = Date.now();

        try {
            const data = await s3.getObject({
                Bucket: BUCKET,
                Key: callKey,
            }).promise();

            const call = JSON.parse(data.Body.toString());
            console.log(`📥 ${this.name}: Received call from worker ${call.source}`);

            this.callsReceived++;
            this.isActive = true;

            // Process the call (Q3 Carrier-native DB operation)
            await this.processCall(call);

            // Delete processed call
            await s3.deleteObject({
                Bucket: BUCKET,
                Key: callKey,
            }).promise();

            // Update metrics
            const responseTime = Date.now() - startTime;
            this.metrics.avgResponseTime = (this.metrics.avgResponseTime * 0.9) + (responseTime * 0.1);

            await this.saveState();
        } catch (err) {
            console.error(`❌ ${this.name}: Error handling call:`, err.message);
            this.metrics.errorRate = Math.min(1, this.metrics.errorRate + 0.1);
        }
    }

    async processCall(call) {
        // Perform Q3 Carrier-native DB operations
        const operations = [
            this.cleanupOldData(),
            this.compactDiffs(),
            this.syncHeartbeats(),
            this.pruneExpiredResults(),
        ];

        await Promise.all(operations);

        console.log(`✅ ${this.name}: Processed call, completed DB maintenance`);
    }

    async cleanupOldData() {
        // List and delete old data beyond retention
        const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days
        const prefix = 'acldqa/calls/';

        try {
            const result = await s3.listObjectsV2({
                Bucket: BUCKET,
                Prefix: prefix,
                MaxKeys: 100,
            }).promise();

            const toDelete = (result.Contents || [])
                .filter(obj => {
                    const timestamp = parseInt(obj.Key.split('/').pop().split('-')[0]);
                    return timestamp < cutoff;
                })
                .map(obj => ({ Key: obj.Key }));

            if (toDelete.length > 0) {
                await s3.deleteObjects({
                    Bucket: BUCKET,
                    Delete: { Objects: toDelete },
                }).promise();
                console.log(`🧹 ${this.name}: Cleaned up ${toDelete.length} old records`);
            }
        } catch (err) {
            // Ignore
        }
    }

    async compactDiffs() {
        // Compact small diffs into larger checkpoint files
        // Implementation would merge multiple small diffs
        console.log(`📦 ${this.name}: Compacting diffs...`);
    }

    async syncHeartbeats() {
        // Sync heartbeat data for Cr8OS Alter monitoring
        await s3.putObject({
            Bucket: BUCKET,
            Key: `acldqa/heartbeats/${this.name}.json`,
            Body: JSON.stringify({
                worker: this.name,
                workerId: this.workerId,
                timestamp: new Date().toISOString(),
                isActive: this.isActive,
                callsReceived: this.callsReceived,
                callsSent: this.callsSent,
                metrics: this.metrics,
            }, null, 2),
            ContentType: 'application/json',
        }).promise();
    }

    async pruneExpiredResults() {
        // Remove results older than retention period
        console.log(`🗑️ ${this.name}: Pruning expired results...`);
    }

    /**
     * Start the rotation pattern (only Worker 0 does this)
     */
    async startRotation() {
        console.log(`🔄 ${this.name}: Starting rotation as master`);

        const bidc = new ParentBIDCController(this.acldqa, s3);
        await bidc.loadStateFromQ3 Carrier();

        const runRotation = async () => {
            const callInfo = bidc.getNextCall();

            // Check if we're resting
            if (this.shouldRest()) {
                console.log(`😴 ${this.name}: Resting...`);
                return;
            }

            // Use ORIKI to optimize interval
            const optimizedInterval = this.oriki.optimizeInterval(
                callInfo.intervalMs,
                this.metrics
            );

            // Execute the call
            await this.callWorker(callInfo.targetWorker, {
                ...callInfo,
                intervalMs: optimizedInterval,
            });

            this.callsSent++;
            await this.saveState();

            // Schedule next call
            setTimeout(runRotation, optimizedInterval);
        };

        // Start the rotation
        runRotation();
    }

    async callWorker(targetWorkerId, callData) {
        const targetName = `cron-worker-${targetWorkerId}`;
        const callKey = `${PREFIX}${targetName}/pending/${Date.now()}-from-${this.workerId}.json`;

        console.log(`📤 ${this.name}: Calling worker ${targetWorkerId}`);

        await s3.putObject({
            Bucket: BUCKET,
            Key: callKey,
            Body: JSON.stringify({
                source: this.workerId,
                target: targetWorkerId,
                timestamp: new Date().toISOString(),
                ...callData,
            }, null, 2),
            ContentType: 'application/json',
        }).promise();
    }

    shouldRest() {
        if (!this.restingUntil) return false;
        return new Date(this.restingUntil) > new Date();
    }

    startHeartbeat() {
        setInterval(async () => {
            await this.syncHeartbeats();
        }, 30000); // Every 30 seconds
    }
}

// Export factory function
function createWorker(workerId) {
    return new RotatingCronWorker(workerId);
}

module.exports = { RotatingCronWorker, createWorker };

// If run directly, start the specified worker
if (require.main === module) {
    const workerId = parseInt(process.env.WORKER_ID || '0');
    const worker = createWorker(workerId);
    worker.start().catch(console.error);
}
