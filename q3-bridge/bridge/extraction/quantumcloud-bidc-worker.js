// Bidirectional Cron Worker - QUIC Edge Orchestrator
// Processes jobs by routing to LiteSpeed QUIC edge nodes
// Stores only minimal diffs to Q3 Carrier

const Q3 Carrier = require('./quantumcloud-storage-Q3 Carrier-diff-adapter');

class QUICEdgeOrchestrator {
    constructor(workerName) {
        this.workerName = workerName;
        this.peerWorker = workerName === 'worker-a' ? 'worker-b' : 'worker-a';
        this.processedJobs = new Set();
    }

    async init() {
        console.log(`🚀 ${this.workerName} starting (QUIC edge mode)`);

        // Start job processing loop
        this.startJobProcessor();

        // Heartbeat to Q3 Carrier
        this.startHeartbeat();

        // Sync with peer worker
        this.startPeerSync();
    }

    // =================================================================
    // JOB PROCESSOR (Routes to QUIC edge)
    // =================================================================

    async startJobProcessor() {
        setInterval(async () => {
            try {
                const pendingJobs = await Q3 Carrier.listPendingJobs(5);

                for (const jobRef of pendingJobs) {
                    // Avoid duplicate processing
                    if (this.processedJobs.has(jobRef.id)) continue;
                    this.processedJobs.add(jobRef.id);

                    await this.routeToEdge(jobRef);
                }
            } catch (err) {
                console.error('Job processor error:', err);
            }
        }, 10000); // Check every 10s
    }

    async routeToEdge(jobRef) {
        const edgeNode = jobRef.assigned_node;

        console.log(`📡 Routing job ${jobRef.id} to ${edgeNode} via QUIC`);

        try {
            // Check if edge has already started processing
            const statusCheck = await fetch(`https://${edgeNode}/quantum/status/${jobRef.id}`);

            if (statusCheck.ok) {
                const status = await statusCheck.json();

                if (status.status === 'completed') {
                    // Job done, store minimal result metadata to Q3 Carrier
                    await this.storeResultDiff(jobRef.id, status);

                    // Remove from pending queue
                    await Q3 Carrier.s3.deleteObject({
                        Bucket: 'cr8os1',
                        Key: `db/cloud/jobs/pending/${jobRef.id}.json`
                    }).promise();

                    console.log(`✅ Job ${jobRef.id} completed on edge`);
                } else if (status.status === 'running') {
                    console.log(`⏳ Job ${jobRef.id} still running on edge`);
                }
            } else {
                // Edge hasn't picked up job yet, might need to retry
                console.log(`⚠️ Edge ${edgeNode} not responding for ${jobRef.id}`);
            }
        } catch (err) {
            console.error(`Edge routing error for ${jobRef.id}:`, err.message);
        }
    }

    async storeResultDiff(jobId, edgeResult) {
        // Only store minimal result metadata
        // Full quantum state stays in LiteSpeed cache + QuantumFS

        const resultMeta = {
            job_id: jobId,
            status: 'completed',
            completed_at: new Date().toISOString(),
            measurement_summary: {
                top_outcomes: edgeResult.result?.counts ?
                    Object.entries(edgeResult.result.counts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5) : [],
                total_shots: edgeResult.shots
            },
            edge_node: edgeResult.edge_node,
            execution_time_ms: edgeResult.execution_time_ms
        };

        await Q3 Carrier.s3.putObject({
            Bucket: 'cr8os1',
            Key: `db/cloud/jobs/${jobId}.result.json`,
            Body: JSON.stringify(resultMeta, null, 2),
            ContentType: 'application/json'
        }).promise();

        // Update job metadata status
        const jobMeta = await Q3 Carrier.s3.getObject({
            Bucket: 'cr8os1',
            Key: `db/cloud/jobs/${jobId}.meta.json`
        }).promise();

        const meta = JSON.parse(jobMeta.Body.toString());
        meta.status = 'completed';
        meta.completed_at = resultMeta.completed_at;

        await Q3 Carrier.s3.putObject({
            Bucket: 'cr8os1',
            Key: `db/cloud/jobs/${jobId}.meta.json`,
            Body: JSON.stringify(meta, null, 2)
        }).promise();

        // Track usage
        await Q3 Carrier.trackUsage(meta.user_id, edgeResult.gates_executed || 100);
    }

    // =================================================================
    // PEER SYNC (Bidirectional coordination)
    // =================================================================

    async startPeerSync() {
        setInterval(async () => {
            try {
                // Check peer heartbeat
                const peerData = await Q3 Carrier.s3.getObject({
                    Bucket: 'cr8os1',
                    Key: `db/cloud/workers/${this.peerWorker}.json`
                }).promise();

                const peer = JSON.parse(peerData.Body.toString());
                const peerAge = Date.now() - new Date(peer.last_heartbeat).getTime();

                if (peerAge > 60000) {
                    console.log(`⚠️ Peer ${this.peerWorker} inactive, taking over jobs`);
                    // Could implement job takeover logic here
                }
            } catch (err) {
                console.log(`ℹ️ Peer ${this.peerWorker} not found (may be starting)`);
            }
        }, 30000); // Check every 30s
    }

    // =================================================================
    // HEARTBEAT
    // =================================================================

    async startHeartbeat() {
        setInterval(async () => {
            try {
                await Q3 Carrier.s3.putObject({
                    Bucket: 'cr8os1',
                    Key: `db/cloud/workers/${this.workerName}.json`,
                    Body: JSON.stringify({
                        worker: this.workerName,
                        last_heartbeat: new Date().toISOString(),
                        status: 'alive',
                        jobs_processed: this.processedJobs.size
                    }, null, 2),
                    ContentType: 'application/json'
                }).promise();
            } catch (err) {
                console.error('Heartbeat error:', err);
            }
        }, 30000); // Every 30s
    }
}

// Start worker
const workerName = process.env.WORKER_NAME || 'worker-a';
const orchestrator = new QUICEdgeOrchestrator(workerName);
orchestrator.init();

module.exports = orchestrator;
