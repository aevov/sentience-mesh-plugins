// ACLDQA Auto-Scaling Module
// Managed by Parent BIDC and ORIKI Protocol
// Optimized for dynamic worker scaling based on load

const { ACLDQAProtocol, ORIKIProtocol } = require('./acldqa-protocol');
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
    endpoint: 'https://s3.Q3 Carrier.io',
    accessKeyId: process.env.Q3_CARRIER_ID || '',
    secretAccessKey: process.env.Q3_CARRIER_SECRET || '',
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
});

const BUCKET = 'cr8os1';
const PREFIX = 'acldqa/autoscale/';

/**
 * ACLDQA Auto-Scaling Protocol
 * 
 * Extends ACLDQA for automatic worker scaling:
 * - Monitors queue depth and response times
 * - Uses ORIKI cognitive optimization for scaling decisions
 * - Implements rotating scale-up/scale-down pattern
 * - Manages worker lifecycle via Q3 Carrier coordination
 */
class ACLDQAAutoScaler {
    constructor(config = {}) {
        this.acldqa = new ACLDQAProtocol(config);
        this.oriki = new ORIKIProtocol({ layers: 4 });

        this.config = {
            minWorkers: config.minWorkers || 2,
            maxWorkers: config.maxWorkers || 20,
            scaleUpThreshold: config.scaleUpThreshold || 0.8,    // 80% utilization
            scaleDownThreshold: config.scaleDownThreshold || 0.3, // 30% utilization
            cooldownPeriodMs: config.cooldownPeriodMs || 60000,  // 1 minute
            checkIntervalMs: config.checkIntervalMs || 10000,    // 10 seconds

            // Rotating scale pattern (similar to cron workers)
            rotatingScale: {
                enabled: true,
                scaleUpInterval: 10000,    // Check every 10s
                scaleDownInterval: 60000,  // Slower scale down
                maxScalePerCycle: 2,       // Max workers to add/remove per cycle
            },
        };

        this.state = {
            currentWorkers: this.config.minWorkers,
            targetWorkers: this.config.minWorkers,
            lastScaleAction: null,
            scaleHistory: [],
            isScaling: false,
        };

        this.metrics = {
            queueDepth: 0,
            avgUtilization: 0,
            avgResponseTime: 0,
            errorRate: 0,
            pendingJobs: 0,
        };
    }

    /**
     * Start the auto-scaler
     */
    async start() {
        console.log('🚀 ACLDQA Auto-Scaler starting...');
        console.log(`   Min workers: ${this.config.minWorkers}`);
        console.log(`   Max workers: ${this.config.maxWorkers}`);

        // Load state from Q3 Carrier
        await this.loadState();

        // Start monitoring loop
        this.startMonitoring();

        // Start scaling loop
        this.startScalingLoop();

        console.log('✅ Auto-Scaler ready');
    }

    /**
     * Monitoring loop - collect metrics from Q3 Carrier
     */
    startMonitoring() {
        setInterval(async () => {
            try {
                await this.collectMetrics();
                await this.syncStateToQ3 Carrier();
            } catch (err) {
                console.error('Monitoring error:', err.message);
            }
        }, this.config.checkIntervalMs);
    }

    async collectMetrics() {
        // Count pending jobs
        const pendingResult = await s3.listObjectsV2({
            Bucket: BUCKET,
            Prefix: 'acldqa/workers/',
            MaxKeys: 1000,
        }).promise();

        let pendingJobs = 0;
        let activeWorkers = 0;
        let totalUtilization = 0;
        let totalResponseTime = 0;
        let errorCount = 0;

        // Check each worker's state
        for (const obj of pendingResult.Contents || []) {
            if (obj.Key.endsWith('/state.json')) {
                try {
                    const data = await s3.getObject({
                        Bucket: BUCKET,
                        Key: obj.Key,
                    }).promise();

                    const workerState = JSON.parse(data.Body.toString());

                    if (workerState.status === 'active') activeWorkers++;
                    if (workerState.metrics) {
                        totalUtilization += workerState.metrics.utilization || 0;
                        totalResponseTime += workerState.metrics.avgResponseTime || 0;
                        errorCount += workerState.metrics.errors || 0;
                    }
                } catch (e) {
                    // Worker state unavailable
                }
            } else if (obj.Key.includes('/pending/')) {
                pendingJobs++;
            }
        }

        this.state.currentWorkers = activeWorkers || this.state.currentWorkers;

        this.metrics = {
            queueDepth: pendingJobs,
            avgUtilization: activeWorkers > 0 ? totalUtilization / activeWorkers : 0,
            avgResponseTime: activeWorkers > 0 ? totalResponseTime / activeWorkers : 0,
            errorRate: this.state.currentWorkers > 0 ? errorCount / this.state.currentWorkers : 0,
            pendingJobs,
        };

        console.log(`📊 Metrics: ${activeWorkers} workers, ${pendingJobs} pending, ${(this.metrics.avgUtilization * 100).toFixed(1)}% util`);
    }

    /**
     * Scaling decision loop with ORIKI optimization
     */
    startScalingLoop() {
        const checkScale = async () => {
            if (this.state.isScaling) return;

            const decision = this.makeScalingDecision();

            if (decision.action !== 'none') {
                await this.executeScaling(decision);
            }

            // Schedule next check with ORIKI-optimized interval
            const nextInterval = this.oriki.optimizeInterval(
                decision.action === 'scale-up'
                    ? this.config.rotatingScale.scaleUpInterval
                    : this.config.rotatingScale.scaleDownInterval,
                this.metrics
            );

            setTimeout(checkScale, nextInterval);
        };

        checkScale();
    }

    /**
     * Make scaling decision using ORIKI cognitive analysis
     */
    makeScalingDecision() {
        const { currentWorkers, targetWorkers, lastScaleAction } = this.state;
        const { minWorkers, maxWorkers, scaleUpThreshold, scaleDownThreshold, cooldownPeriodMs } = this.config;

        // Check cooldown
        if (lastScaleAction && Date.now() - new Date(lastScaleAction).getTime() < cooldownPeriodMs) {
            return { action: 'none', reason: 'cooldown' };
        }

        // ORIKI 4-layer analysis
        let scaleScore = 0;

        // Layer 1: Queue depth analysis
        const queuePressure = this.metrics.pendingJobs / (currentWorkers || 1);
        if (queuePressure > 5) scaleScore += 2;
        else if (queuePressure > 2) scaleScore += 1;
        else if (queuePressure < 0.5) scaleScore -= 1;

        // Layer 2: Utilization analysis
        if (this.metrics.avgUtilization > scaleUpThreshold) scaleScore += 2;
        else if (this.metrics.avgUtilization < scaleDownThreshold) scaleScore -= 1;

        // Layer 3: Response time analysis
        if (this.metrics.avgResponseTime > 1000) scaleScore += 1;
        else if (this.metrics.avgResponseTime < 100) scaleScore -= 0.5;

        // Layer 4: Error rate analysis
        if (this.metrics.errorRate > 0.1) scaleScore += 1; // High errors might mean overload

        // Make decision
        if (scaleScore >= 2 && currentWorkers < maxWorkers) {
            const scaleCount = Math.min(
                this.config.rotatingScale.maxScalePerCycle,
                maxWorkers - currentWorkers
            );
            return {
                action: 'scale-up',
                count: scaleCount,
                reason: `Score: ${scaleScore.toFixed(1)}, util: ${(this.metrics.avgUtilization * 100).toFixed(1)}%`,
            };
        } else if (scaleScore <= -1 && currentWorkers > minWorkers) {
            const scaleCount = Math.min(
                this.config.rotatingScale.maxScalePerCycle,
                currentWorkers - minWorkers
            );
            return {
                action: 'scale-down',
                count: scaleCount,
                reason: `Score: ${scaleScore.toFixed(1)}, util: ${(this.metrics.avgUtilization * 100).toFixed(1)}%`,
            };
        }

        return { action: 'none', reason: 'balanced' };
    }

    /**
     * Execute scaling action
     */
    async executeScaling(decision) {
        this.state.isScaling = true;
        console.log(`⚡ Scaling: ${decision.action} by ${decision.count} (${decision.reason})`);

        try {
            if (decision.action === 'scale-up') {
                await this.scaleUp(decision.count);
            } else if (decision.action === 'scale-down') {
                await this.scaleDown(decision.count);
            }

            this.state.lastScaleAction = new Date().toISOString();
            this.state.scaleHistory.push({
                timestamp: this.state.lastScaleAction,
                action: decision.action,
                count: decision.count,
                reason: decision.reason,
                fromWorkers: this.state.currentWorkers,
                toWorkers: this.state.targetWorkers,
            });

            // Keep history bounded
            if (this.state.scaleHistory.length > 100) {
                this.state.scaleHistory = this.state.scaleHistory.slice(-100);
            }

            await this.syncStateToQ3 Carrier();

        } catch (err) {
            console.error('Scaling error:', err.message);
        } finally {
            this.state.isScaling = false;
        }
    }

    async scaleUp(count) {
        const startId = this.state.currentWorkers;

        for (let i = 0; i < count; i++) {
            const workerId = startId + i;
            const workerName = `cron-worker-${workerId}`;

            // Create worker entry in Q3 Carrier
            await s3.putObject({
                Bucket: BUCKET,
                Key: `acldqa/workers/${workerName}/state.json`,
                Body: JSON.stringify({
                    workerId,
                    name: workerName,
                    status: 'starting',
                    createdAt: new Date().toISOString(),
                    scaledBy: 'acldqa-autoscaler',
                }, null, 2),
                ContentType: 'application/json',
            }).promise();

            console.log(`   ➕ Created worker ${workerName}`);
        }

        this.state.targetWorkers = this.state.currentWorkers + count;
    }

    async scaleDown(count) {
        // Find idle workers to remove
        const workers = [];

        const result = await s3.listObjectsV2({
            Bucket: BUCKET,
            Prefix: 'acldqa/workers/',
        }).promise();

        for (const obj of result.Contents || []) {
            if (obj.Key.endsWith('/state.json')) {
                try {
                    const data = await s3.getObject({
                        Bucket: BUCKET,
                        Key: obj.Key,
                    }).promise();
                    const state = JSON.parse(data.Body.toString());

                    if (state.status === 'idle' || state.status === 'resting') {
                        workers.push({ key: obj.Key, state });
                    }
                } catch (e) {
                    // Skip unavailable worker
                }
            }
        }

        // Sort by activity (remove least active first)
        workers.sort((a, b) => (a.state.callsReceived || 0) - (b.state.callsReceived || 0));

        // Remove workers
        const toRemove = workers.slice(0, count);
        for (const worker of toRemove) {
            // Mark for termination
            const newState = { ...worker.state, status: 'terminating', terminatedAt: new Date().toISOString() };
            await s3.putObject({
                Bucket: BUCKET,
                Key: worker.key,
                Body: JSON.stringify(newState, null, 2),
            }).promise();

            console.log(`   ➖ Terminating worker ${worker.state.name}`);
        }

        this.state.targetWorkers = Math.max(this.config.minWorkers, this.state.currentWorkers - count);
    }

    /**
     * Q3 Carrier state management
     */
    async syncStateToQ3 Carrier() {
        await s3.putObject({
            Bucket: BUCKET,
            Key: `${PREFIX}state.json`,
            Body: JSON.stringify({
                state: this.state,
                metrics: this.metrics,
                config: this.config,
                lastUpdate: new Date().toISOString(),
            }, null, 2),
            ContentType: 'application/json',
        }).promise();
    }

    async loadState() {
        try {
            const data = await s3.getObject({
                Bucket: BUCKET,
                Key: `${PREFIX}state.json`,
            }).promise();

            const saved = JSON.parse(data.Body.toString());
            this.state = { ...this.state, ...saved.state };
            console.log('📥 Loaded auto-scaler state from Q3 Carrier');
        } catch (err) {
            console.log('ℹ️ No existing state, starting fresh');
        }
    }

    /**
     * Get current status for monitoring
     */
    getStatus() {
        return {
            state: this.state,
            metrics: this.metrics,
            config: {
                minWorkers: this.config.minWorkers,
                maxWorkers: this.config.maxWorkers,
            },
        };
    }
}

module.exports = { ACLDQAAutoScaler };

// If run directly
if (require.main === module) {
    const scaler = new ACLDQAAutoScaler({
        minWorkers: parseInt(process.env.MIN_WORKERS || '2'),
        maxWorkers: parseInt(process.env.MAX_WORKERS || '20'),
    });
    scaler.start().catch(console.error);
}
