#!/bin/bash
# QuantumCloud Cubbit - Complete Deployment Script
# Automatically creates all files in correct locations

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QUANTUM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/quantumcloud"

echo "🚀 QuantumCloud Cubbit - Automated Deployment"
echo "=============================================="
echo "Target: $QUANTUM_DIR"
echo ""

# Create directory structure
echo "📁 Creating directory structure..."
mkdir -p "$QUANTUM_DIR/storage"
mkdir -p "$QUANTUM_DIR/workers"
mkdir -p "$QUANTUM_DIR/scripts"

# File 1: Cubbit Diff Adapter
echo "📦 Creating Cubbit diff storage adapter..."
cat > "$QUANTUM_DIR/storage/cubbit-diff-adapter.js" << 'CUBBIT_EOF'
// QuantumCloud - Cubbit Differential Storage Adapter
const AWS = require('aws-sdk');
const crypto = require('crypto');

class CubbitDiffStorage {
    constructor() {
        this.s3 = new AWS.S3({
            endpoint: 'https://s3.cubbit.io',
            accessKeyId: process.env.CUBBIT_ID || 'u4bi8wC839SUl0aZPBn/Cpw8wPWglXo7',
            secretAccessKey: process.env.CUBBIT_SECRET || '5GPCMUeE790r5JdLl0V4l9p4vb2R+8WjmsspQex+Bok=',
            s3ForcePathStyle: true,
            signatureVersion: 'v4'
        });
        this.bucket = 'cr8os1';
        this.prefix = 'db/cloud/';
    }

    async getUser(apiKey) {
        try {
            const data = await this.s3.getObject({
                Bucket: this.bucket,
                Key: `${this.prefix}users/${apiKey}.json`
            }).promise();
            return JSON.parse(data.Body.toString());
        } catch (err) {
            if (err.code === 'NoSuchKey') return null;
            throw err;
        }
    }

    async createUser(user) {
        await this.s3.putObject({
            Bucket: this.bucket,
            Key: `${this.prefix}users/${user.api_key}.json`,
            Body: JSON.stringify(user, null, 2),
            ContentType: 'application/json'
        }).promise();
    }

    async createJob(job) {
        const jobMeta = {
            id: job.id,
            user_id: job.user_id,
            status: job.status,
            qubits: job.qubits,
            shots: job.shots,
            litespeed_node: this.selectEdgeNode(job),
            created_at: job.created_at
        };
        
        await this.s3.putObject({
            Bucket: this.bucket,
            Key: `${this.prefix}jobs/${job.id}.meta.json`,
            Body: JSON.stringify(jobMeta, null, 2),
            ContentType: 'application/json'
        }).promise();
        
        if (job.status === 'queued') {
            await this.s3.putObject({
                Bucket: this.bucket,
                Key: `${this.prefix}jobs/pending/${job.id}.json`,
                Body: JSON.stringify({ id: job.id, assigned_node: jobMeta.litespeed_node }),
                ContentType: 'application/json'
            }).promise();
        }
    }

    selectEdgeNode(job) {
        const regions = ['us-east', 'us-west', 'eu-west', 'asia-east'];
        return `node001.${regions[Math.floor(Math.random() * regions.length)]}.quantum.cr8os.io`;
    }

    async trackUsage(userId, gates) {
        const month = new Date().toISOString().slice(0, 7);
        const key = `${this.prefix}usage/${userId}/${month}.json`;
        
        let usage;
        try {
            const data = await this.s3.getObject({ Bucket: this.bucket, Key: key }).promise();
            usage = JSON.parse(data.Body.toString());
        } catch (err) {
            usage = { user_id: userId, month, gates_used: 0, jobs: 0 };
        }
        
        usage.gates_used += gates;
        usage.jobs += 1;
        
        await this.s3.putObject({
            Bucket: this.bucket,
            Key: key,
            Body: JSON.stringify(usage, null, 2)
        }).promise();
        
        return usage;
    }

    async listPendingJobs(limit = 10) {
        const result = await this.s3.listObjectsV2({
            Bucket: this.bucket,
            Prefix: `${this.prefix}jobs/pending/`,
            MaxKeys: limit
        }).promise();
        
        if (!result.Contents) return [];
        
        const jobs = await Promise.all(
            result.Contents.map(async (obj) => {
                const data = await this.s3.getObject({ Bucket: this.bucket, Key: obj.Key }).promise();
                return JSON.parse(data.Body.toString());
            })
        );
        
        return jobs;
    }
}

module.exports = new CubbitDiffStorage();
CUBBIT_EOF

# File 2: Bidirectional Worker
echo "🔄 Creating bidirectional cron worker..."
cat > "$QUANTUM_DIR/workers/bidc-worker.js" << 'WORKER_EOF'
// Bidirectional Cron Worker - QUIC Edge Orchestrator
const cubbit = require('../storage/cubbit-diff-adapter');

class QUICEdgeOrchestrator {
    constructor(workerName) {
        this.workerName = workerName;
        this.peerWorker = workerName === 'worker-a' ? 'worker-b' : 'worker-a';
        this.processedJobs = new Set();
    }

    async init() {
        console.log(`🚀 ${this.workerName} starting (QUIC edge mode)`);
        this.startJobProcessor();
        this.startHeartbeat();
    }

    async startJobProcessor() {
        setInterval(async () => {
            try {
                const pendingJobs = await cubbit.listPendingJobs(5);
                
                for (const jobRef of pendingJobs) {
                    if (this.processedJobs.has(jobRef.id)) continue;
                    this.processedJobs.add(jobRef.id);
                    console.log(`📡 Processing job ${jobRef.id} on ${jobRef.assigned_node}`);
                }
            } catch (err) {
                console.error('Job processor error:', err);
            }
        }, 10000);
    }

    async startHeartbeat() {
        setInterval(async () => {
            try {
                await cubbit.s3.putObject({
                    Bucket: 'cr8os1',
                    Key: `db/cloud/workers/${this.workerName}.json`,
                    Body: JSON.stringify({
                        worker: this.workerName,
                        last_heartbeat: new Date().toISOString(),
                        status: 'alive',
                        jobs_processed: this.processedJobs.size
                    }, null, 2)
                }).promise();
            } catch (err) {
                console.error('Heartbeat error:', err);
            }
        }, 30000);
    }
}

const workerName = process.env.WORKER_NAME || 'worker-a';
const orchestrator = new QUICEdgeOrchestrator(workerName);
orchestrator.init();

module.exports = orchestrator;
WORKER_EOF

# File 3: Package.json
echo "📦 Creating package.json..."
cat > "$QUANTUM_DIR/package.json" << 'PKG_EOF'
{
  "name": "quantumcloud-cubbit",
  "version": "2.0.0",
  "description": "QuantumCloud - Cubbit-native quantum computing platform",
  "scripts": {
    "worker-a": "WORKER_NAME=worker-a node workers/bidc-worker.js",
    "worker-b": "WORKER_NAME=worker-b node workers/bidc-worker.js",
    "init-cubbit": "node scripts/init-cubbit.js"
  },
  "dependencies": {
    "aws-sdk": "^2.1400.0",
    "dotenv": "^16.3.1"
  }
}
PKG_EOF

# File 4: Environment config
echo "🔐 Creating .env.production..."
cat > "$QUANTUM_DIR/.env.production" << 'ENV_EOF'
# Cubbit S3 Credentials
CUBBIT_ID=u4bi8wC839SUl0aZPBn/Cpw8wPWglXo7
CUBBIT_SECRET=5GPCMUeE790r5JdLl0V4l9p4vb2R+8WjmsspQex+Bok=
CUBBIT_BUCKET=cr8os1
CUBBIT_PREFIX=db/cloud/

# API Configuration
PORT=5000
NODE_ENV=production
ENV_EOF

# File 5: Cubbit initialization script
echo "☁️ Creating Cubbit init script..."
cat > "$QUANTUM_DIR/scripts/init-cubbit.js" << 'INIT_EOF'
const AWS = require('aws-sdk');
require('dotenv').config({ path: '../.env.production' });

const s3 = new AWS.S3({
    endpoint: 'https://s3.cubbit.io',
    accessKeyId: process.env.CUBBIT_ID,
    secretAccessKey: process.env.CUBBIT_SECRET,
    s3ForcePathStyle: true,
    signatureVersion: 'v4'
});

async function initBucket() {
    console.log('☁️ Initializing Cubbit bucket structure...');
    
    const folders = [
        'db/cloud/users/',
        'db/cloud/jobs/',
        'db/cloud/jobs/pending/',
        'db/cloud/diffs/',
        'db/cloud/usage/',
        'db/cloud/workers/',
        'db/cloud/nodes/'
    ];
    
    for (const folder of folders) {
        try {
            await s3.putObject({
                Bucket: 'cr8os1',
                Key: folder,
                Body: ''
            }).promise();
            console.log(`  ✓ ${folder}`);
        } catch (err) {
            console.error(`  ✗ ${folder}: ${err.message}`);
        }
    }
    
    console.log('✅ Cubbit bucket initialized!');
}

initBucket().catch(console.error);
INIT_EOF

echo ""
echo "✅ All files created successfully!"
echo ""
echo "📁 Files created:"
echo "  - $QUANTUM_DIR/storage/cubbit-diff-adapter.js"
echo "  - $QUANTUM_DIR/workers/bidc-worker.js"
echo "  - $QUANTUM_DIR/package.json"
echo "  - $QUANTUM_DIR/.env.production"
echo "  - $QUANTUM_DIR/scripts/init-cubbit.js"
echo ""
echo "🎯 Next steps:"
echo "  1. cd $QUANTUM_DIR"
echo "  2. npm install"
echo "  3. npm run init-cubbit"
echo "  4. npm run worker-a (in one terminal)"
echo "  5. npm run worker-b (in another terminal)"
echo ""
echo "Or use PM2:"
echo "  pm2 start workers/bidc-worker.js --name worker-a -- --WORKER_NAME=worker-a"
echo "  pm2 start workers/bidc-worker.js --name worker-b -- --WORKER_NAME=worker-b"
echo ""
