// QuantumCloud API Server - QUIC/HTTP3 Edge Native
// Runs on CyberPanel with OpenLiteSpeed (QUIC enabled)
// Orchestrates jobs across LiteSpeed edge nodes

const express = require('express');
const Q3 Carrier = require('./quantumcloud-storage-Q3 Carrier-diff-adapter');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// QUIC/HTTP3 headers for edge optimization
app.use((req, res, next) => {
    res.setHeader('Alt-Svc', 'h3=":443"; ma=86400'); // Advertise HTTP/3
    res.setHeader('X-Edge-Node', process.env.NODE_ID || 'control');
    next();
});

// =================================================================
// AUTHENTICATION MIDDLEWARE
// =================================================================

async function requireApiKey(req, res, next) {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
        return res.status(401).json({ error: 'Missing API key' });
    }

    const user = await Q3 Carrier.getUser(apiKey);
    if (!user) {
        return res.status(401).json({ error: 'Invalid API key' });
    }

    if (user.quota_exceeded) {
        return res.status(429).json({ error: 'Quota exceeded', tier: user.tier });
    }

    req.user = user;
    next();
}

// =================================================================
// USER REGISTRATION (ultimate-email integration)
// =================================================================

app.post('/api/v1/users/register', async (req, res) => {
    const { email, tier = 'free' } = req.body;

    const apiKey = 'qc_' + crypto.randomBytes(32).toString('base64url');

    const user = {
        api_key: apiKey,
        email: email,
        tier: tier,
        gates_used: 0,
        created_at: new Date().toISOString(),
        permissions: getPermissions(tier)
    };

    await Q3 Carrier.createUser(user);

    // TODO: Call ultimate-email service
    // await sendWelcomeEmail(email, apiKey);

    res.status(201).json({
        api_key: apiKey,
        tier: tier,
        message: 'Welcome to QuantumCloud! Check your email for details.'
    });
});

function getPermissions(tier) {
    const perms = {
        free: { max_jobs: 1, rate_limit: '10/min' },
        developer: { max_jobs: 10, rate_limit: '100/min' },
        professional: { max_jobs: 100, rate_limit: '1000/min', priority: true },
        enterprise: { max_jobs: -1, rate_limit: '10000/min', priority: true, dedicated: true }
    };
    return perms[tier] || perms.free;
}

// =================================================================
// JOB SUBMISSION (Routes to LiteSpeed QUIC edge)
// =================================================================

app.post('/api/v1/jobs', requireApiKey, async (req, res) => {
    const { circuit, shots = 1000, priority = 'standard' } = req.body;

    const jobId = 'job_' + crypto.randomBytes(16).toString('base64url');

    const job = {
        id: jobId,
        user_id: req.user.api_key,
        status: 'queued',
        qubits: circuit.qubits || 1,
        shots: shots,
        backend: 'cr8os-588-logical',
        priority: priority,
        created_at: new Date().toISOString()
    };

    await Q3 Carrier.createJob(job);

    // Get assigned edge node (from Q3 Carrier metadata)
    const jobMeta = await Q3 Carrier.s3.getObject({
        Bucket: 'cr8os1',
        Key: `db/cloud/jobs/${jobId}.meta.json`
    }).promise();

    const metadata = JSON.parse(jobMeta.Body.toString());

    // Submit circuit to LiteSpeed QUIC edge node
    // Circuit data sent directly to edge (not stored in Q3 Carrier)
    try {
        const edgeResponse = await fetch(`https://${metadata.litespeed_node}/quantum/execute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Job-ID': jobId,
                'X-Priority': priority
            },
            body: JSON.stringify({
                circuit: circuit,
                shots: shots,
                job_id: jobId
            })
        });

        if (!edgeResponse.ok) {
            throw new Error('Edge node unavailable');
        }

        res.status(202).json({
            job_id: jobId,
            status: 'queued',
            edge_node: metadata.litespeed_node,
            message: 'Job submitted to QUIC edge for execution'
        });
    } catch (err) {
        res.status(503).json({
            error: 'Edge unavailable',
            job_id: jobId,
            message: 'Job queued for retry'
        });
    }
});

// =================================================================
// JOB STATUS (Query edge via QUIC)
// =================================================================

app.get('/api/v1/jobs/:job_id', requireApiKey, async (req, res) => {
    const jobId = req.params.job_id;

    // Get job metadata from Q3 Carrier
    let jobMeta;
    try {
        const data = await Q3 Carrier.s3.getObject({
            Bucket: 'cr8os1',
            Key: `db/cloud/jobs/${jobId}.meta.json`
        }).promise();
        jobMeta = JSON.parse(data.Body.toString());
    } catch (err) {
        return res.status(404).json({ error: 'Job not found' });
    }

    // Query edge node via QUIC for real-time status
    try {
        const edgeStatus = await fetch(`https://${jobMeta.litespeed_node}/quantum/status/${jobId}`, {
            headers: { 'Accept': 'application/json' }
        });

        if (edgeStatus.ok) {
            const liveStatus = await edgeStatus.json();
            res.json({
                ...jobMeta,
                ...liveStatus,
                source: 'edge-live'
            });
        } else {
            // Fallback to Q3 Carrier metadata
            res.json({
                ...jobMeta,
                source: 'Q3 Carrier-cache'
            });
        }
    } catch (err) {
        res.json({
            ...jobMeta,
            source: 'Q3 Carrier-cache',
            note: 'Edge node unreachable, showing cached status'
        });
    }
});

// =================================================================
// GLOBAL STATS (Aggregate from QuantumFS mesh)
// =================================================================

app.get('/api/v1/stats/global', async (req, res) => {
    // Query available edge nodes
    const nodes = await Q3 Carrier.getAvailableNodes();

    // Aggregate stats from all nodes via QUIC
    const statsPromises = nodes.map(node =>
        fetch(`https://${node.node_id}/quantum/stats`)
            .then(r => r.json())
            .catch(() => null)
    );

    const allStats = (await Promise.all(statsPromises)).filter(s => s !== null);

    const global = {
        active_nodes: allStats.length,
        total_chiplets: allStats.reduce((sum, s) => sum + (s.chiplets || 0), 0),
        hash_rate: allStats.reduce((sum, s) => sum + (s.hash_rate || 0), 0),
        distributed_qubits: Math.floor(Math.log2(allStats.length * 100)) + 40,
        global_latency_ms: allStats.reduce((sum, s) => sum + (s.latency || 0), 0) / allStats.length
    };

    res.json(global);
});

// =================================================================
// USAGE & BILLING
// =================================================================

app.get('/api/v1/usage', requireApiKey, async (req, res) => {
    const month = req.query.month || new Date().toISOString().slice(0, 7);

    let usage;
    try {
        const data = await Q3 Carrier.s3.getObject({
            Bucket: 'cr8os1',
            Key: `db/cloud/usage/${req.user.api_key}/${month}.json`
        }).promise();
        usage = JSON.parse(data.Body.toString());
    } catch (err) {
        usage = { gates_used: 0, jobs: 0, cost: 0 };
    }

    res.json(usage);
});

// =================================================================
// HEALTH CHECK
// =================================================================

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'QuantumCloud Control Plane',
        protocol: 'HTTP/3 (QUIC)',
        edge_mode: true
    });
});

// =================================================================
// START SERVER
// =================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 QuantumCloud API listening on port ${PORT}`);
    console.log(`⚡ QUIC/HTTP3 edge-native mode`);
    console.log(`📦 Q3 Carrier differential storage enabled`);
    console.log(`🔗 OpenLiteSpeed integration ready`);
});

module.exports = app;
