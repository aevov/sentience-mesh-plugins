// ACLDQA Master Orchestrator
// Manages all ACLDQA subsystems: Cron Workers, Auto-Scaler, and Cr8OS Alter sync
// Deployable to Q3 Carrier for serverless operation

const AWS = require('aws-sdk');
const { ACLDQAProtocol, ParentBIDCController, ORIKIProtocol } = require('./acldqa-protocol');
const { RotatingCronWorker } = require('./acldqa-cron-workers');
const { ACLDQAAutoScaler } = require('./acldqa-autoscaler');

// Configuration
const CONFIG = {
    Q3 Carrier: {
        endpoint: process.env.Q3_CARRIER_ENDPOINT || 'https://s3.Q3 Carrier.io',
        accessKeyId: process.env.Q3_CARRIER_ID || '',
        secretAccessKey: process.env.Q3_CARRIER_SECRET || '',
        bucket: process.env.Q3_CARRIER_BUCKET || 'cr8os1',
    },
    workers: {
        count: parseInt(process.env.WORKER_COUNT || '10'),
        rotationEnabled: true,
    },
    autoscale: {
        enabled: process.env.AUTOSCALE_ENABLED !== 'false',
        minWorkers: parseInt(process.env.MIN_WORKERS || '2'),
        maxWorkers: parseInt(process.env.MAX_WORKERS || '20'),
    },
    monitoring: {
        syncIntervalMs: 30000,
        dashboardPath: 'cr8os-alter/',
    },
};

// S3 Client
const s3 = new AWS.S3({
    endpoint: CONFIG.Q3 Carrier.endpoint,
    accessKeyId: CONFIG.Q3 Carrier.accessKeyId,
    secretAccessKey: CONFIG.Q3 Carrier.secretAccessKey,
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
});

/**
 * Master Orchestrator
 * Coordinates all ACLDQA subsystems
 */
class ACLDQAOrchestrator {
    constructor() {
        this.acldqa = new ACLDQAProtocol(CONFIG.Q3 Carrier);
        this.bidc = new ParentBIDCController(this.acldqa, s3);
        this.oriki = new ORIKIProtocol();

        this.workers = [];
        this.autoScaler = null;
        this.isRunning = false;

        this.stats = {
            startTime: null,
            totalOperations: 0,
            lastSync: null,
        };
    }

    async start() {
        console.log('═══════════════════════════════════════════════════════');
        console.log('  🚀 ACLDQA Master Orchestrator Starting');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`  Q3 Carrier: ${CONFIG.Q3 Carrier.bucket}`);
        console.log(`  Workers: ${CONFIG.workers.count}`);
        console.log(`  Auto-Scale: ${CONFIG.autoscale.enabled ? 'Enabled' : 'Disabled'}`);
        console.log('═══════════════════════════════════════════════════════');

        this.isRunning = true;
        this.stats.startTime = new Date().toISOString();

        // Initialize BIDC controller
        await this.bidc.initializeWorkers();

        // Start rotating cron workers
        await this.startWorkers();

        // Start auto-scaler if enabled
        if (CONFIG.autoscale.enabled) {
            await this.startAutoScaler();
        }

        // Start Cr8OS Alter sync
        this.startMonitoringSync();

        // Upload dashboard to Q3 Carrier
        await this.deployDashboard();

        // Handle shutdown
        this.setupShutdownHandler();

        console.log('═══════════════════════════════════════════════════════');
        console.log('  ✅ All systems operational');
        console.log('═══════════════════════════════════════════════════════');
    }

    async startWorkers() {
        console.log(`\n📋 Starting ${CONFIG.workers.count} rotating cron workers...`);

        for (let i = 0; i < CONFIG.workers.count; i++) {
            const worker = new RotatingCronWorker(i);
            this.workers.push(worker);

            // Stagger worker startup to avoid thundering herd
            setTimeout(() => {
                worker.start().catch(err => {
                    console.error(`Worker ${i} failed to start:`, err.message);
                });
            }, i * 500);
        }
    }

    async startAutoScaler() {
        console.log('\n📈 Starting auto-scaler...');

        this.autoScaler = new ACLDQAAutoScaler({
            minWorkers: CONFIG.autoscale.minWorkers,
            maxWorkers: CONFIG.autoscale.maxWorkers,
        });

        await this.autoScaler.start();
    }

    startMonitoringSync() {
        console.log('\n💓 Starting Cr8OS Alter monitoring sync...');

        setInterval(async () => {
            try {
                await this.syncMonitoringData();
                this.stats.lastSync = new Date().toISOString();
            } catch (err) {
                console.error('Monitoring sync failed:', err.message);
            }
        }, CONFIG.monitoring.syncIntervalMs);
    }

    async syncMonitoringData() {
        // Collect data from all subsystems
        const monitoringData = {
            orchestrator: {
                startTime: this.stats.startTime,
                uptime: Date.now() - new Date(this.stats.startTime).getTime(),
                totalOperations: this.stats.totalOperations,
            },
            workers: this.workers.map(w => ({
                id: w.workerId,
                name: w.name,
                isActive: w.isActive,
                callsReceived: w.callsReceived,
                callsSent: w.callsSent,
                metrics: w.metrics,
            })),
            rotation: this.acldqa.rotationState,
            autoScaler: this.autoScaler ? this.autoScaler.getStatus() : null,
            timestamp: new Date().toISOString(),
        };

        // Store for Cr8OS Alter dashboard
        await s3.putObject({
            Bucket: CONFIG.Q3 Carrier.bucket,
            Key: `${CONFIG.monitoring.dashboardPath}data/current-state.json`,
            Body: JSON.stringify(monitoringData, null, 2),
            ContentType: 'application/json',
        }).promise();

        this.stats.totalOperations++;
    }

    async deployDashboard() {
        console.log('\n🌐 Deploying Cr8OS Alter dashboard to Q3 Carrier...');

        const fs = require('fs');
        const path = require('path');

        const dashboardFiles = [
            { local: 'cr8os-alter-dashboard.html', remote: 'index.html' },
            { local: 'cr8os-alter-logo.png', remote: 'assets/logo.png' },
        ];

        for (const file of dashboardFiles) {
            try {
                const localPath = path.join(__dirname, file.local);
                if (fs.existsSync(localPath)) {
                    const content = fs.readFileSync(localPath);
                    const contentType = file.local.endsWith('.html')
                        ? 'text/html'
                        : 'image/png';

                    await s3.putObject({
                        Bucket: CONFIG.Q3 Carrier.bucket,
                        Key: `${CONFIG.monitoring.dashboardPath}${file.remote}`,
                        Body: content,
                        ContentType: contentType,
                        ACL: 'public-read',
                    }).promise();

                    console.log(`   ✓ Uploaded ${file.remote}`);
                }
            } catch (err) {
                console.warn(`   ⚠ Could not upload ${file.local}:`, err.message);
            }
        }

        // Generate presigned URL for dashboard access
        const dashboardUrl = s3.getSignedUrl('getObject', {
            Bucket: CONFIG.Q3 Carrier.bucket,
            Key: `${CONFIG.monitoring.dashboardPath}index.html`,
            Expires: 86400 * 7, // 7 days
        });

        console.log(`\n📊 Dashboard URL (7-day access):\n   ${dashboardUrl}\n`);
    }

    setupShutdownHandler() {
        const shutdown = async (signal) => {
            console.log(`\n⚠️ Received ${signal}, shutting down gracefully...`);
            this.isRunning = false;

            // Save final state
            await this.syncMonitoringData();

            // Store shutdown record
            await s3.putObject({
                Bucket: CONFIG.Q3 Carrier.bucket,
                Key: `${CONFIG.monitoring.dashboardPath}data/shutdown-${Date.now()}.json`,
                Body: JSON.stringify({
                    signal,
                    timestamp: new Date().toISOString(),
                    uptime: Date.now() - new Date(this.stats.startTime).getTime(),
                    totalOperations: this.stats.totalOperations,
                }, null, 2),
            }).promise();

            console.log('👋 Shutdown complete');
            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
    }
}

// Quick status check function (can be called via cron)
async function quickHealthCheck() {
    try {
        const data = await s3.getObject({
            Bucket: CONFIG.Q3 Carrier.bucket,
            Key: `${CONFIG.monitoring.dashboardPath}data/current-state.json`,
        }).promise();

        const state = JSON.parse(data.Body.toString());
        const uptime = Date.now() - new Date(state.orchestrator.startTime).getTime();
        const uptimeHours = (uptime / 3600000).toFixed(1);

        console.log('═══════════════════════════════════════════');
        console.log('  ACLDQA Health Check');
        console.log('═══════════════════════════════════════════');
        console.log(`  Status: ✅ Operational`);
        console.log(`  Uptime: ${uptimeHours} hours`);
        console.log(`  Workers: ${state.workers.filter(w => w.isActive).length}/${state.workers.length} active`);
        console.log(`  Operations: ${state.orchestrator.totalOperations}`);
        console.log(`  Last Sync: ${state.timestamp}`);
        console.log('═══════════════════════════════════════════');

        return { healthy: true, state };
    } catch (err) {
        console.error('Health check failed:', err.message);
        return { healthy: false, error: err.message };
    }
}

// Export
module.exports = { ACLDQAOrchestrator, quickHealthCheck };

// Run if called directly
if (require.main === module) {
    const mode = process.argv[2];

    if (mode === 'health') {
        quickHealthCheck().then(result => {
            process.exit(result.healthy ? 0 : 1);
        });
    } else {
        const orchestrator = new ACLDQAOrchestrator();
        orchestrator.start().catch(err => {
            console.error('Fatal error:', err);
            process.exit(1);
        });
    }
}
