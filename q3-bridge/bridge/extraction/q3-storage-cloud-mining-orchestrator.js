/**
 * Q3 Carrier Cloud Mining Orchestrator
 * 
 * Master orchestrator that coordinates ALL cloud mining workers on Q3 Carrier.
 * NO local mining - all hashing offloaded to cloud workers.
 * 
 * Architecture:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │                  Q3 Carrier Cloud Mining                        │
 *   │  ┌───────────────────────────────────────────────────────┐  │
 *   │  │  cr8stream-worker-apl3-Q3 Carrier.js (Primary)            │  │
 *   │  │  • APL 3.0 Qutrit optimization (+35%)                 │  │
 *   │  │  • WASM streaming from Q3 Carrier                         │  │
 *   │  │  • Auto-checkpoint to S3                              │  │
 *   │  └───────────────────────────────────────────────────────┘  │
 *   │                          ▼ failover                         │
 *   │  ┌───────────────────────────────────────────────────────┐  │
 *   │  │  cr8stream-worker-apl3-fallback.js (Fallback)         │  │
 *   │  │  • Pure JavaScript (no WASM)                          │  │
 *   │  │  • Same APL 3.0 qudit algorithms                      │  │
 *   │  └───────────────────────────────────────────────────────┘  │
 *   │                          ▼                                  │
 *   │  ┌───────────────────────────────────────────────────────┐  │
 *   │  │  Q3 Carrier-worker.js (Edge)                              │  │
 *   │  │  • Mining API endpoints                               │  │
 *   │  │  • Work distribution                                  │  │
 *   │  │  • Result aggregation                                 │  │
 *   │  └───────────────────────────────────────────────────────┘  │
 *   └─────────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼ Results
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  Flask Monitor (Local)                                      │
 *   │  • Dashboard at localhost:7472                              │
 *   │  • Real-time WebSocket updates                              │
 *   │  • NO mining - monitoring only                              │
 *   └─────────────────────────────────────────────────────────────┘
 * 
 * NO Oracle Dependency - 100% Q3 Carrier
 */

const EventEmitter = require('events');
const https = require('https');
const crypto = require('crypto');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    Q3 Carrier: {
        endpoint: 'https://s3.Q3 Carrier.eu',
        bucket: 'cr8os1',
        region: 'eu-west-1',
        // Keys loaded from environment
        accessKey: process.env.Q3_CARRIER_ACCESS_KEY || '',
        secretKey: process.env.Q3_CARRIER_SECRET_KEY || '',
    },
    mining: {
        stratumPool: 'solo.ckpool.org',
        stratumPort: 3333,
        workerName: 'cr8os-quantum-Q3 Carrier',
        walletAddress: process.env.BTC_WALLET || 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    },
    workers: {
        primary: {
            name: 'cr8stream-worker-apl3-Q3 Carrier',
            endpoint: 'https://mining.cr8os.io/api/mining',
            type: 'wasm-qudit',
        },
        fallback: {
            name: 'cr8stream-worker-apl3-fallback',
            endpoint: 'https://mining-fallback.cr8os.io/api/mining',
            type: 'js-qudit',
        },
        edge: {
            name: 'Q3 Carrier-worker',
            endpoint: 'https://edge.cr8os.io/api/mining',
            type: 'edge',
        }
    },
    paths: {
        work: 'mining/work',
        checkpoints: 'mining/checkpoints',
        results: 'mining/results',
        stats: 'mining/stats',
    },
    intervals: {
        workFetch: 30000,       // 30 seconds
        checkpoint: 300000,     // 5 minutes
        statsUpdate: 10000,     // 10 seconds
        healthCheck: 60000,     // 1 minute
    }
};

// ============================================================================
// AWS SIGNATURE V4 FOR Q3_CARRIER S3
// ============================================================================

function sha256(data) {
    return crypto.createHash('sha256').update(data).digest();
}

function sha256Hex(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest();
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
    const kDate = hmacSha256('AWS4' + key, dateStamp);
    const kRegion = hmacSha256(kDate, regionName);
    const kService = hmacSha256(kRegion, serviceName);
    const kSigning = hmacSha256(kService, 'aws4_request');
    return kSigning;
}

function signS3Request(method, path, body = null) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    
    const url = new URL(`${CONFIG.Q3 Carrier.endpoint}/${CONFIG.Q3 Carrier.bucket}/${path}`);
    const host = url.host;
    const canonicalUri = url.pathname;
    
    const payloadHash = body ? sha256Hex(body) : 'UNSIGNED-PAYLOAD';
    
    const headers = {
        'host': host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
    };
    
    if (body) {
        headers['content-type'] = 'application/json';
    }
    
    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers).sort()
        .map(k => `${k}:${headers[k]}\n`).join('');
    
    const canonicalRequest = [
        method,
        canonicalUri,
        '',
        canonicalHeaders,
        signedHeaders,
        payloadHash
    ].join('\n');
    
    const credentialScope = `${dateStamp}/${CONFIG.Q3 Carrier.region}/s3/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        sha256Hex(canonicalRequest)
    ].join('\n');
    
    const signingKey = getSignatureKey(CONFIG.Q3 Carrier.secretKey, dateStamp, CONFIG.Q3 Carrier.region, 's3');
    const signature = hmacSha256(signingKey, stringToSign).toString('hex');
    
    headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${CONFIG.Q3 Carrier.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    return { url: url.toString(), headers };
}

// ============================================================================
// S3 OPERATIONS
// ============================================================================

function s3Request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const { url, headers } = signS3Request(method, path, body);
        const urlObj = new URL(url);
        
        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname,
            method,
            headers,
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve(data);
                    }
                } else {
                    reject(new Error(`S3 Error: ${res.statusCode} - ${data}`));
                }
            });
        });
        
        req.on('error', reject);
        
        if (body) {
            req.write(body);
        }
        req.end();
    });
}

async function s3Get(path) {
    return s3Request('GET', path);
}

async function s3Put(path, data) {
    const body = typeof data === 'string' ? data : JSON.stringify(data);
    return s3Request('PUT', path, body);
}

// ============================================================================
// Q3_CARRIER CLOUD MINING ORCHESTRATOR
// ============================================================================

class Q3 CarrierCloudMiningOrchestrator extends EventEmitter {
    constructor() {
        super();
        
        this.state = {
            running: false,
            perpetual: true,
            startTime: null,
            
            // Worker status
            workers: {
                primary: { status: 'initializing', lastPing: null, hashrate: 0 },
                fallback: { status: 'standby', lastPing: null, hashrate: 0 },
                edge: { status: 'initializing', lastPing: null, hashrate: 0 },
            },
            
            // Mining stats
            stats: {
                totalHashes: 0n,
                hashrate: 0,
                sharesFound: 0,
                sharesAccepted: 0,
                uptime: 0,
                currentJob: null,
            },
            
            // Platform info
            platform: {
                type: 'Q3 Carrier-only',
                oracleDependent: false,
                cloudflareDependent: false,
                fullyIndependent: true,
            }
        };
        
        this.intervals = {};
    }
    
    // ========================================================================
    // LIFECYCLE
    // ========================================================================
    
    async start() {
        console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           Q3_CARRIER CLOUD MINING ORCHESTRATOR                       ║
║           ══════════════════════════════                         ║
║                                                                  ║
║  Platform:     100% Q3 Carrier (NO Oracle)                           ║
║  Workers:                                                        ║
║    • Primary:  cr8stream-worker-apl3-Q3 Carrier.js                   ║
║    • Fallback: cr8stream-worker-apl3-fallback.js                 ║
║    • Edge:     Q3 Carrier-worker.js                                  ║
║                                                                  ║
║  Local Mode:   MONITORING ONLY (Flask on port 7472)              ║
║  Hashing:      OFFLOADED TO CLOUD                                ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
        `);
        
        this.state.running = true;
        this.state.startTime = Date.now();
        
        // Initialize workers
        await this.initializeWorkers();
        
        // Start periodic tasks
        this.startPeriodicTasks();
        
        // Start perpetual mining loop
        this.perpetualMiningLoop();
        
        this.emit('started');
    }
    
    async stop() {
        console.log('[Orchestrator] Stopping...');
        this.state.running = false;
        
        // Clear intervals
        Object.values(this.intervals).forEach(clearInterval);
        
        // Save final checkpoint
        await this.saveCheckpoint();
        
        this.emit('stopped');
    }
    
    // ========================================================================
    // WORKER MANAGEMENT
    // ========================================================================
    
    async initializeWorkers() {
        console.log('[Orchestrator] Initializing cloud workers...');
        
        // Check primary worker
        await this.checkWorkerHealth('primary');
        
        // Check edge worker
        await this.checkWorkerHealth('edge');
        
        // Fallback stays on standby unless needed
        this.state.workers.fallback.status = 'standby';
        
        console.log('[Orchestrator] Workers initialized');
    }
    
    async checkWorkerHealth(workerType) {
        const worker = CONFIG.workers[workerType];
        const workerState = this.state.workers[workerType];
        
        try {
            const response = await this.fetchWorkerStatus(worker.endpoint);
            workerState.status = 'running';
            workerState.lastPing = Date.now();
            workerState.hashrate = response.stats?.hashrate || 0;
            console.log(`[Orchestrator] ${worker.name}: ✓ Running`);
        } catch (err) {
            workerState.status = 'unreachable';
            console.log(`[Orchestrator] ${worker.name}: ✗ Unreachable`);
            
            // If primary fails, activate fallback
            if (workerType === 'primary') {
                await this.activateFallback();
            }
        }
    }
    
    async activateFallback() {
        console.log('[Orchestrator] Activating fallback worker...');
        
        try {
            const response = await this.fetchWorkerStatus(CONFIG.workers.fallback.endpoint);
            this.state.workers.fallback.status = 'running';
            this.state.workers.fallback.lastPing = Date.now();
            console.log('[Orchestrator] Fallback worker activated');
        } catch (err) {
            this.state.workers.fallback.status = 'failed';
            console.error('[Orchestrator] Fallback worker also failed');
        }
    }
    
    fetchWorkerStatus(endpoint) {
        return new Promise((resolve, reject) => {
            const url = new URL(`${endpoint}/status`);
            
            https.get(url.toString(), (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            resolve(JSON.parse(data));
                        } catch {
                            resolve({ status: 'unknown' });
                        }
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}`));
                    }
                });
            }).on('error', reject);
        });
    }
    
    // ========================================================================
    // MINING OPERATIONS
    // ========================================================================
    
    async perpetualMiningLoop() {
        console.log('[Orchestrator] Starting perpetual mining loop...');
        
        while (this.state.running) {
            try {
                // Get work from pool (cached in S3)
                const work = await this.getMiningWork();
                
                if (work) {
                    // Distribute work to active workers
                    await this.distributeWork(work);
                    
                    // Collect results
                    await this.collectResults();
                }
                
                // Wait before next cycle
                await this.sleep(CONFIG.intervals.workFetch);
                
            } catch (err) {
                console.error('[Orchestrator] Mining loop error:', err.message);
                await this.sleep(5000);
            }
        }
    }
    
    async getMiningWork() {
        try {
            const work = await s3Get(`${CONFIG.paths.work}/current.json`);
            return work;
        } catch (err) {
            // Generate new work if not found
            return this.generateWorkTemplate();
        }
    }
    
    generateWorkTemplate() {
        return {
            workId: `work-${Date.now().toString(36)}`,
            version: '20000000',
            prevHash: '0'.repeat(64),
            merkleRoot: '0'.repeat(64),
            ntime: Math.floor(Date.now() / 1000).toString(16),
            nbits: '1d00ffff',
            nonceStart: 0,
            nonceEnd: 0xFFFFFFFF,
            timestamp: Date.now(),
            source: 'orchestrator'
        };
    }
    
    async distributeWork(work) {
        // Determine which workers are active
        const activeWorkers = Object.entries(this.state.workers)
            .filter(([_, w]) => w.status === 'running')
            .map(([name, _]) => name);
        
        if (activeWorkers.length === 0) {
            console.log('[Orchestrator] No active workers, waiting...');
            return;
        }
        
        // Split nonce range among workers
        const totalRange = BigInt(work.nonceEnd) - BigInt(work.nonceStart);
        const rangePerWorker = totalRange / BigInt(activeWorkers.length);
        
        for (let i = 0; i < activeWorkers.length; i++) {
            const workerName = activeWorkers[i];
            const workerConfig = CONFIG.workers[workerName];
            
            const workerWork = {
                ...work,
                nonceStart: (BigInt(work.nonceStart) + rangePerWorker * BigInt(i)).toString(),
                nonceEnd: (BigInt(work.nonceStart) + rangePerWorker * BigInt(i + 1)).toString(),
                workerId: `${workerName}-${Date.now()}`
            };
            
            // Send work to worker
            try {
                await this.sendWorkToWorker(workerConfig.endpoint, workerWork);
            } catch (err) {
                console.error(`[Orchestrator] Failed to send work to ${workerName}:`, err.message);
            }
        }
        
        this.state.stats.currentJob = work.workId;
    }
    
    async sendWorkToWorker(endpoint, work) {
        return new Promise((resolve, reject) => {
            const url = new URL(`${endpoint}/work`);
            const body = JSON.stringify(work);
            
            const req = https.request({
                hostname: url.hostname,
                port: 443,
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}`));
                    }
                });
            });
            
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }
    
    async collectResults() {
        try {
            // Results are stored in S3 by workers
            const results = await s3Get(`${CONFIG.paths.results}/latest.json`);
            
            if (results && results.found) {
                console.log('[Orchestrator] SHARE FOUND!', results);
                this.state.stats.sharesFound++;
                this.emit('share', results);
            }
            
            // Update stats from results
            if (results.hashCount) {
                this.state.stats.totalHashes += BigInt(results.hashCount);
            }
            
        } catch (err) {
            // No new results
        }
    }
    
    // ========================================================================
    // CHECKPOINTING
    // ========================================================================
    
    async saveCheckpoint() {
        const checkpoint = {
            timestamp: Date.now(),
            stats: {
                ...this.state.stats,
                totalHashes: this.state.stats.totalHashes.toString()
            },
            workers: this.state.workers,
            platform: this.state.platform
        };
        
        try {
            await s3Put(`${CONFIG.paths.checkpoints}/latest.json`, checkpoint);
            console.log('[Orchestrator] Checkpoint saved');
        } catch (err) {
            console.error('[Orchestrator] Failed to save checkpoint:', err.message);
        }
    }
    
    async loadCheckpoint() {
        try {
            const checkpoint = await s3Get(`${CONFIG.paths.checkpoints}/latest.json`);
            
            if (checkpoint) {
                this.state.stats = {
                    ...checkpoint.stats,
                    totalHashes: BigInt(checkpoint.stats.totalHashes || 0)
                };
                console.log('[Orchestrator] Checkpoint restored');
            }
        } catch (err) {
            console.log('[Orchestrator] No checkpoint found, starting fresh');
        }
    }
    
    // ========================================================================
    // PERIODIC TASKS
    // ========================================================================
    
    startPeriodicTasks() {
        // Health checks
        this.intervals.healthCheck = setInterval(() => {
            this.checkWorkerHealth('primary');
            this.checkWorkerHealth('edge');
        }, CONFIG.intervals.healthCheck);
        
        // Checkpoint saving
        this.intervals.checkpoint = setInterval(() => {
            this.saveCheckpoint();
        }, CONFIG.intervals.checkpoint);
        
        // Uptime counter
        this.intervals.uptime = setInterval(() => {
            this.state.stats.uptime++;
        }, 1000);
        
        // Stats aggregation
        this.intervals.stats = setInterval(() => {
            this.aggregateStats();
        }, CONFIG.intervals.statsUpdate);
    }
    
    aggregateStats() {
        let totalHashrate = 0;
        
        for (const [_, worker] of Object.entries(this.state.workers)) {
            if (worker.status === 'running') {
                totalHashrate += worker.hashrate;
            }
        }
        
        this.state.stats.hashrate = totalHashrate;
        
        this.emit('stats', this.getStatus());
    }
    
    // ========================================================================
    // STATUS API
    // ========================================================================
    
    getStatus() {
        return {
            running: this.state.running,
            perpetual: this.state.perpetual,
            uptime: this.state.stats.uptime,
            
            workers: Object.entries(this.state.workers).map(([name, w]) => ({
                name,
                status: w.status,
                lastPing: w.lastPing,
                hashrate: this.formatHashrate(w.hashrate)
            })),
            
            mining: {
                totalHashes: this.state.stats.totalHashes.toString(),
                hashrate: this.formatHashrate(this.state.stats.hashrate),
                sharesFound: this.state.stats.sharesFound,
                sharesAccepted: this.state.stats.sharesAccepted,
                currentJob: this.state.stats.currentJob,
            },
            
            platform: this.state.platform,
            
            endpoints: {
                flaskMonitor: 'http://localhost:7472',
                miningApi: CONFIG.workers.edge.endpoint,
            }
        };
    }
    
    formatHashrate(h) {
        if (h >= 1e18) return `${(h / 1e18).toFixed(2)} EH/s`;
        if (h >= 1e15) return `${(h / 1e15).toFixed(2)} PH/s`;
        if (h >= 1e12) return `${(h / 1e12).toFixed(2)} TH/s`;
        if (h >= 1e9) return `${(h / 1e9).toFixed(2)} GH/s`;
        if (h >= 1e6) return `${(h / 1e6).toFixed(2)} MH/s`;
        if (h >= 1e3) return `${(h / 1e3).toFixed(2)} KH/s`;
        return `${h.toFixed(2)} H/s`;
    }
    
    // ========================================================================
    // UTILITIES
    // ========================================================================
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance = null;

function getQ3 CarrierCloudMiningOrchestrator() {
    if (!instance) {
        instance = new Q3 CarrierCloudMiningOrchestrator();
    }
    return instance;
}

// Auto-start if run directly
if (require.main === module) {
    const orchestrator = getQ3 CarrierCloudMiningOrchestrator();
    
    orchestrator.on('started', () => {
        console.log('[Main] Orchestrator started');
    });
    
    orchestrator.on('share', (share) => {
        console.log('[Main] SHARE FOUND:', share);
    });
    
    orchestrator.start();
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n[Main] Shutting down...');
        await orchestrator.stop();
        process.exit(0);
    });
}

module.exports = { Q3 CarrierCloudMiningOrchestrator, getQ3 CarrierCloudMiningOrchestrator };