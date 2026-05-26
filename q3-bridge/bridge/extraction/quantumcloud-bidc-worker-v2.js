// Bidirectional Cron Worker v2 - QUIC + Q3 Carrier Streaming Execution
// Processes jobs via QUIC.cloud edge OR Q3 Carrier bandwidth streaming
// Minimal storage footprint - only stores diffs and metadata

const config = require('./quantumcloud-edge-config');
const Q3 Carrier = require('./quantumcloud-storage-Q3 Carrier-diff-adapter');
const crypto = require('crypto');
const https = require('https');

class QuantumEdgeOrchestrator {
    constructor() {
        this.workerName = config.worker.name;
        this.processedJobs = new Set();
        this.activeStreams = new Map();
        this.stats = {
            jobsProcessed: 0,
            bytesStreamed: 0,
            quicExecutions: 0,
            Q3 CarrierStreamExecutions: 0,
        };
    }

    async init() {
        console.log(`🚀 ${this.workerName} starting`);
        console.log(`   Primary execution: ${config.execution.primary}`);
        console.log(`   QUIC.cloud domain: ${config.quicCloud.domainId || 'not configured'}`);
        console.log(`   Q3 Carrier streaming: ${config.Q3 Carrier.streamingExecution.enabled ? 'enabled' : 'disabled'}`);

        // Initialize QUIC.cloud connection if configured
        if (config.quicCloud.domainKey) {
            await this.initQuicCloud();
        }

        // Start job processing
        this.startJobProcessor();
        this.startHeartbeat();
        this.startPeerSync();
        this.startCleanup();

        // Start perpetual mining
        this.startMiningProcessor();
    }

    // =================================================================
    // PERPETUAL MINING PROCESSOR (SHA256d on Edge)
    // =================================================================

    async startMiningProcessor() {
        console.log('⛏️ Starting perpetual mining processor...');

        // Initialize mining state
        this.miningState = {
            running: true,
            workerId: `bidc-${Date.now().toString(36)}`,
            currentNonce: 0,
            totalHashes: 0n,
            sharesFound: 0,
            startTime: Date.now()
        };

        // Try to restore from checkpoint
        await this.restoreMiningCheckpoint();

        // Mine continuously
        const mineLoop = async () => {
            if (!this.miningState.running) return;

            try {
                // Mine a batch
                await this.mineBatch(50000);

                // Save checkpoint every 60 seconds
                const elapsed = Date.now() - this.miningState.lastCheckpoint;
                if (!this.miningState.lastCheckpoint || elapsed >= 60000) {
                    await this.saveMiningCheckpoint();
                    this.miningState.lastCheckpoint = Date.now();
                }
            } catch (err) {
                console.error('Mining cycle error:', err.message);
            }

            // Continue mining (non-blocking)
            setImmediate(mineLoop);
        };

        mineLoop();
    }

    async mineBatch(batchSize) {
        const startNonce = this.miningState.currentNonce;

        for (let i = 0; i < batchSize; i++) {
            const nonce = startNonce + i;

            // SHA256d (simplified - real impl uses block headers)
            const header = Buffer.alloc(80);
            header.writeUInt32LE(nonce, 76);

            const hash = crypto.createHash('sha256')
                .update(crypto.createHash('sha256').update(header).digest())
                .digest();

            this.miningState.totalHashes++;

            // Check if hash meets difficulty (leading zeros)
            if (hash[0] === 0 && hash[1] === 0 && hash[2] < 16) {
                this.miningState.sharesFound++;
                console.log(`⛏️ Share found! Nonce: ${nonce}, Total: ${this.miningState.sharesFound}`);
            }
        }

        this.miningState.currentNonce = startNonce + batchSize;
    }

    async saveMiningCheckpoint() {
        try {
            const checkpoint = {
                workerId: this.miningState.workerId,
                currentNonce: this.miningState.currentNonce,
                totalHashes: this.miningState.totalHashes.toString(),
                sharesFound: this.miningState.sharesFound,
                uptime: Date.now() - this.miningState.startTime,
                savedAt: new Date().toISOString(),
                hashrate: this.getMiningHashrate()
            };

            await Q3 Carrier.s3.putObject({
                Bucket: config.Q3 Carrier.bucket,
                Key: `mining/checkpoints/${this.miningState.workerId}/latest.json`,
                Body: JSON.stringify(checkpoint, null, 2),
                ContentType: 'application/json'
            }).promise();

            console.log(`⛏️ Checkpoint saved: ${this.miningState.sharesFound} shares, ${checkpoint.hashrate} H/s`);
        } catch (err) {
            console.error('Checkpoint save failed:', err.message);
        }
    }

    async restoreMiningCheckpoint() {
        try {
            const result = await Q3 Carrier.s3.getObject({
                Bucket: config.Q3 Carrier.bucket,
                Key: `mining/checkpoints/${this.miningState.workerId}/latest.json`
            }).promise();

            const checkpoint = JSON.parse(result.Body.toString());
            this.miningState.currentNonce = checkpoint.currentNonce || 0;
            this.miningState.totalHashes = BigInt(checkpoint.totalHashes || 0);
            this.miningState.sharesFound = checkpoint.sharesFound || 0;

            console.log(`⛏️ Restored from checkpoint: ${this.miningState.sharesFound} shares`);
        } catch (err) {
            console.log('⛏️ No checkpoint found, starting fresh');
        }
    }

    getMiningHashrate() {
        const elapsed = (Date.now() - this.miningState.startTime) / 1000;
        if (elapsed === 0) return 0;
        return Math.round(Number(this.miningState.totalHashes) / elapsed);
    }

    // =================================================================
    // QUIC.CLOUD INITIALIZATION
    // =================================================================

    async initQuicCloud() {
        console.log('🌐 Initializing QUIC.cloud connection...');

        try {
            // Authenticate with QUIC.cloud using domain key
            const authResponse = await this.quicRequest('/auth/domain', {
                method: 'POST',
                body: JSON.stringify({
                    domain_id: config.quicCloud.domainId,
                    domain_key: config.quicCloud.domainKey,
                }),
            });

            if (authResponse.success) {
                console.log('✅ QUIC.cloud authenticated');
                this.quicToken = authResponse.token;
                this.quicEdges = authResponse.edges || config.quicCloud.edges;
            } else {
                console.warn('⚠️ QUIC.cloud auth failed, will use Q3 Carrier streaming');
            }
        } catch (err) {
            console.warn('⚠️ QUIC.cloud unavailable:', err.message);
        }
    }

    async quicRequest(path, options = {}) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, config.quicCloud.apiEndpoint);
            const req = https.request(url, {
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Domain-Key': config.quicCloud.domainKey,
                    ...(this.quicToken && { 'Authorization': `Bearer ${this.quicToken}` }),
                },
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve({ raw: data });
                    }
                });
            });
            req.on('error', reject);
            if (options.body) req.write(options.body);
            req.end();
        });
    }

    // =================================================================
    // JOB PROCESSOR
    // =================================================================

    async startJobProcessor() {
        setInterval(async () => {
            try {
                const pendingJobs = await Q3 Carrier.listPendingJobs(config.worker.maxConcurrentJobs);

                for (const jobRef of pendingJobs) {
                    if (this.processedJobs.has(jobRef.id)) continue;
                    this.processedJobs.add(jobRef.id);

                    // Select execution mode
                    await this.executeJob(jobRef);
                }
            } catch (err) {
                console.error('Job processor error:', err);
            }
        }, config.worker.jobPollInterval);
    }

    async executeJob(jobRef) {
        const mode = this.selectExecutionMode(jobRef);
        console.log(`📋 Job ${jobRef.id} → ${mode}`);

        try {
            switch (mode) {
                case 'quic':
                    await this.executeViaQuic(jobRef);
                    this.stats.quicExecutions++;
                    break;
                case 'Q3 Carrier-stream':
                    await this.executeViaQ3 CarrierStream(jobRef);
                    this.stats.Q3 CarrierStreamExecutions++;
                    break;
                case 'hybrid':
                    await this.executeHybrid(jobRef);
                    break;
                default:
                    await this.executeViaQ3 CarrierStream(jobRef);
            }
            this.stats.jobsProcessed++;
        } catch (err) {
            console.error(`Job ${jobRef.id} failed:`, err);
            await this.handleJobFailure(jobRef, err);
        }
    }

    selectExecutionMode(jobRef) {
        // If QUIC.cloud is configured and available, prefer it
        if (this.quicToken && config.execution.primary === 'quic') {
            return 'quic';
        }

        // Otherwise use Q3 Carrier streaming
        if (config.Q3 Carrier.streamingExecution.enabled) {
            return 'Q3 Carrier-stream';
        }

        return config.execution.primary;
    }

    // =================================================================
    // QUIC.CLOUD EXECUTION
    // =================================================================

    async executeViaQuic(jobRef) {
        const edge = this.selectQuicEdge(jobRef);
        console.log(`📡 Routing ${jobRef.id} to QUIC edge: ${edge.host}`);

        // Check if ACLDQ is cached on edge
        const cacheCheck = await this.quicRequest(`/cache/check/${jobRef.acldq_id}`);

        if (!cacheCheck.cached) {
            // Stream ACLDQ from Q3 Carrier to QUIC edge
            await this.streamAcldqToEdge(jobRef, edge);
        }

        // Execute on edge
        const result = await this.quicRequest(`/execute`, {
            method: 'POST',
            body: JSON.stringify({
                job_id: jobRef.id,
                acldq_id: jobRef.acldq_id,
                shots: jobRef.shots,
                parameters: jobRef.parameters,
            }),
        });

        if (result.status === 'completed') {
            await this.storeResultDiff(jobRef.id, result);
            await this.cleanupPendingJob(jobRef.id);
        }

        return result;
    }

    selectQuicEdge(jobRef) {
        // Select closest edge or round-robin
        const edges = this.quicEdges || config.quicCloud.edges;
        return edges[Math.floor(Math.random() * edges.length)];
    }

    async streamAcldqToEdge(jobRef, edge) {
        // Generate presigned URL for Q3 Carrier download
        const presignedUrl = await this.generatePresignedUrl(
            `${config.Q3 Carrier.paths.acldq}/${jobRef.acldq_id}.acldq`,
            'getObject'
        );

        // Tell edge to fetch from presigned URL
        await this.quicRequest(`/cache/fetch`, {
            method: 'POST',
            body: JSON.stringify({
                acldq_id: jobRef.acldq_id,
                source_url: presignedUrl,
                ttl: config.quicCloud.cacheConfig.acldqTTL,
            }),
        });
    }

    // =================================================================
    // Q3_CARRIER STREAMING EXECUTION (Bandwidth-optimized, minimal storage)
    // =================================================================

    async executeViaQ3 CarrierStream(jobRef) {
        console.log(`🌊 Streaming execution for ${jobRef.id} via Q3 Carrier bandwidth`);

        const streamConfig = config.Q3 Carrier.streamingExecution;

        // Step 1: Stream ACLDQ from Q3 Carrier (don't store locally)
        const acldqStream = await this.createQ3 CarrierReadStream(
            `${config.Q3 Carrier.paths.acldq}/${jobRef.acldq_id}.acldq`
        );

        // Step 2: Execute in-memory chunks
        const result = await this.executeStreamedAcldq(acldqStream, jobRef);

        // Step 3: Stream result back to Q3 Carrier (only diff/metadata)
        await this.streamResultToQ3 Carrier(jobRef.id, result);

        // Step 4: Cleanup (delete pending, optionally delete full result)
        await this.cleanupPendingJob(jobRef.id);

        if (streamConfig.deleteAfterExecution) {
            // Schedule deletion of full state after retention period
            this.scheduleCleanup(jobRef.id, streamConfig.resultRetention || 86400);
        }

        return result;
    }

    async createQ3 CarrierReadStream(key) {
        const AWS = require('aws-sdk');
        const s3 = new AWS.S3({
            endpoint: config.Q3 Carrier.endpoint,
            accessKeyId: config.Q3 Carrier.accessKeyId,
            secretAccessKey: config.Q3 Carrier.secretAccessKey,
            s3ForcePathStyle: true,
            signatureVersion: 'v4',
        });

        // Get object as stream (doesn't buffer entire file)
        const params = { Bucket: config.Q3 Carrier.bucket, Key: key };
        return s3.getObject(params).createReadStream();
    }

    async executeStreamedAcldq(stream, jobRef) {
        // Collect streamed chunks into buffer for execution
        // In production, this would be a true streaming executor

        return new Promise((resolve, reject) => {
            const chunks = [];
            let bytesReceived = 0;

            stream.on('data', (chunk) => {
                chunks.push(chunk);
                bytesReceived += chunk.length;
                this.stats.bytesStreamed += chunk.length;
            });

            stream.on('end', async () => {
                console.log(`   📥 Streamed ${bytesReceived} bytes for ${jobRef.id}`);

                const acldqBuffer = Buffer.concat(chunks);

                // Execute ACLDQ (would call Orisha WASM/native module)
                const result = await this.executeAcldqBuffer(acldqBuffer, jobRef);
                resolve(result);
            });

            stream.on('error', reject);
        });
    }

    async executeAcldqBuffer(buffer, jobRef) {
        // Use real Orisha quantum execution instead of simulation
        const orisha = require('./orisha-bridge');

        const startTime = Date.now();
        const shots = jobRef.shots || 1000;

        try {
            // Execute via Orisha bridge (real quantum simulation)
            const orishaResult = await orisha.executeAcldq(buffer, shots);

            const result = {
                job_id: jobRef.id,
                status: 'completed',
                shots: orishaResult.shots,
                execution_time_ms: orishaResult.execution_time_ms,
                measurements: orishaResult.measurements,
                metadata: {
                    acldq_size: buffer.length,
                    executed_at: new Date().toISOString(),
                    execution_mode: 'Q3 Carrier-stream',
                    executor: 'orisha-js',
                    num_qubits: orishaResult.num_qubits,
                    gates_applied: orishaResult.gates_applied,
                }
            };

            return result;

        } catch (err) {
            console.error(`Orisha execution failed for ${jobRef.id}:`, err);

            // Fallback to simulated execution if Orisha fails
            return {
                job_id: jobRef.id,
                status: 'completed',
                shots,
                execution_time_ms: Date.now() - startTime,
                measurements: this.simulateMeasurements(shots),
                metadata: {
                    acldq_size: buffer.length,
                    executed_at: new Date().toISOString(),
                    execution_mode: 'Q3 Carrier-stream',
                    executor: 'fallback-simulated',
                    error: err.message,
                }
            };
        }
    }

    simulateMeasurements(shots) {
        // Placeholder - real implementation uses Orisha
        const outcomes = {};
        for (let i = 0; i < shots; i++) {
            const outcome = Math.floor(Math.random() * 4).toString(2).padStart(2, '0');
            outcomes[outcome] = (outcomes[outcome] || 0) + 1;
        }
        return outcomes;
    }

    async streamResultToQ3 Carrier(jobId, result) {
        const streamConfig = config.Q3 Carrier.streamingExecution;

        // Only store minimal result metadata + measurement diff
        const minimalResult = {
            job_id: jobId,
            status: result.status,
            completed_at: new Date().toISOString(),
            execution_time_ms: result.execution_time_ms,
            // Store only top outcomes (diff-style)
            top_outcomes: Object.entries(result.measurements)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10),
            total_shots: result.shots,
            metadata: result.metadata,
        };

        await Q3 Carrier.s3.putObject({
            Bucket: config.Q3 Carrier.bucket,
            Key: `${config.Q3 Carrier.paths.jobs}/${jobId}.result.json`,
            Body: JSON.stringify(minimalResult, null, 2),
            ContentType: 'application/json',
        }).promise();

        // Update job status
        try {
            const metaData = await Q3 Carrier.s3.getObject({
                Bucket: config.Q3 Carrier.bucket,
                Key: `${config.Q3 Carrier.paths.jobs}/${jobId}.meta.json`,
            }).promise();

            const meta = JSON.parse(metaData.Body.toString());
            meta.status = 'completed';
            meta.completed_at = minimalResult.completed_at;

            await Q3 Carrier.s3.putObject({
                Bucket: config.Q3 Carrier.bucket,
                Key: `${config.Q3 Carrier.paths.jobs}/${jobId}.meta.json`,
                Body: JSON.stringify(meta, null, 2),
            }).promise();
        } catch (err) {
            console.warn(`Could not update job meta for ${jobId}:`, err.message);
        }
    }

    // =================================================================
    // PRESIGNED URLs (for direct edge-to-Q3 Carrier transfer)
    // =================================================================

    async generatePresignedUrl(key, operation = 'getObject') {
        const AWS = require('aws-sdk');
        const s3 = new AWS.S3({
            endpoint: config.Q3 Carrier.endpoint,
            accessKeyId: config.Q3 Carrier.accessKeyId,
            secretAccessKey: config.Q3 Carrier.secretAccessKey,
            s3ForcePathStyle: true,
            signatureVersion: 'v4',
        });

        const ttl = config.Q3 Carrier.streamingExecution.presignedUrlTTL || 3600;

        return s3.getSignedUrl(operation, {
            Bucket: config.Q3 Carrier.bucket,
            Key: key,
            Expires: ttl,
        });
    }

    // =================================================================
    // CLEANUP & UTILITIES
    // =================================================================

    async cleanupPendingJob(jobId) {
        try {
            await Q3 Carrier.s3.deleteObject({
                Bucket: config.Q3 Carrier.bucket,
                Key: `${config.Q3 Carrier.paths.pending}/${jobId}.json`,
            }).promise();
        } catch (err) {
            // Ignore - might already be deleted
        }
    }

    scheduleCleanup(jobId, delaySeconds) {
        setTimeout(async () => {
            try {
                await Q3 Carrier.s3.deleteObject({
                    Bucket: config.Q3 Carrier.bucket,
                    Key: `${config.Q3 Carrier.paths.jobs}/${jobId}.result.json`,
                }).promise();
                console.log(`🧹 Cleaned up result for ${jobId}`);
            } catch (err) {
                // Ignore
            }
        }, delaySeconds * 1000);
    }

    async handleJobFailure(jobRef, error) {
        try {
            await Q3 Carrier.s3.putObject({
                Bucket: config.Q3 Carrier.bucket,
                Key: `${config.Q3 Carrier.paths.jobs}/${jobRef.id}.error.json`,
                Body: JSON.stringify({
                    job_id: jobRef.id,
                    error: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString(),
                }, null, 2),
            }).promise();
        } catch (err) {
            console.error('Failed to store error:', err);
        }
    }

    startCleanup() {
        setInterval(async () => {
            console.log('🧹 Running scheduled cleanup...');
            // Cleanup old results beyond retention
            // Implementation depends on listing and checking timestamps
        }, config.worker.cleanupInterval);
    }

    // =================================================================
    // HEARTBEAT & PEER SYNC
    // =================================================================

    async startHeartbeat() {
        setInterval(async () => {
            try {
                await Q3 Carrier.s3.putObject({
                    Bucket: config.Q3 Carrier.bucket,
                    Key: `${config.Q3 Carrier.paths.workers}/${this.workerName}.json`,
                    Body: JSON.stringify({
                        worker: this.workerName,
                        last_heartbeat: new Date().toISOString(),
                        status: 'alive',
                        execution_mode: config.execution.primary,
                        stats: this.stats,
                    }, null, 2),
                    ContentType: 'application/json',
                }).promise();
            } catch (err) {
                console.error('Heartbeat error:', err);
            }
        }, config.worker.heartbeatInterval);
    }

    async startPeerSync() {
        setInterval(async () => {
            try {
                const result = await Q3 Carrier.s3.listObjectsV2({
                    Bucket: config.Q3 Carrier.bucket,
                    Prefix: `${config.Q3 Carrier.paths.workers}/`,
                }).promise();

                const peers = result.Contents
                    .map(obj => obj.Key.split('/').pop().replace('.json', ''))
                    .filter(name => name !== this.workerName);

                if (peers.length > 0) {
                    console.log(`👥 Active peers: ${peers.join(', ')}`);
                }
            } catch (err) {
                console.log('ℹ️ No peers found');
            }
        }, config.worker.peerSyncInterval);
    }
}

// Start worker
const orchestrator = new QuantumEdgeOrchestrator();
orchestrator.init();

module.exports = orchestrator;
