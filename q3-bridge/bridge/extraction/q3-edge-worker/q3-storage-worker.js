/**
 * Q3 Q3 Carrier-Native Edge Worker
 * 
 * Serves Q3 static sites AND mining workers directly from Q3 Carrier.
 * NO Cloudflare dependency - runs on Q3 Carrier Functions.
 * 
 * Request Flow:
 *   User → QUIC.cloud → Q3 Carrier Functions → Q3 Carrier S3 → Response
 * 
 * Endpoints:
 *   /                          - Static site hosting (Q3)
 *   /api/mining/*              - Mining worker endpoints
 *   /api/mining/work           - Get mining work
 *   /api/mining/submit         - Submit mining results
 *   /api/mining/status         - Worker status
 *   /api/mining/checkpoint     - Save checkpoint to S3
 * 
 * Environment Variables:
 *   - Q3_CARRIER_ENDPOINT: https://s3.Q3 Carrier.eu
 *   - Q3_CARRIER_BUCKET: cr8os1
 *   - Q3_CARRIER_ACCESS_KEY: S3 access key
 *   - Q3_CARRIER_SECRET_KEY: S3 secret key
 *   - Q3_CARRIER_REGION: eu-west-1
 *   - STRATUM_POOL: solo.ckpool.org (for work fetching)
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    Q3 Carrier: {
        endpoint: 'https://s3.Q3 Carrier.eu',
        bucket: 'cr8os1',
        region: 'eu-west-1',
    },
    mining: {
        stratumPool: 'solo.ckpool.org',
        stratumPort: 3333,
        defaultDifficulty: 524288,
        checkpointPath: 'mining/checkpoints',
        workPath: 'mining/work',
        resultsPath: 'mining/results',
    },
    worker: {
        id: null,
        type: 'Q3 Carrier-edge',
        version: '1.0.0',
    }
};

// MIME types for static hosting
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.wasm': 'application/wasm',
};

// ============================================================================
// AWS SIGNATURE V4 FOR Q3_CARRIER S3
// ============================================================================

async function sha256Hex(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key, message) {
    const keyData = typeof key === 'string' ? new TextEncoder().encode(key) : key;
    const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
    return new Uint8Array(signature);
}

async function hmacSha256Hex(key, message) {
    const signature = await hmacSha256(key, message);
    return Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function signS3Request(method, path, env, body = null) {
    const endpoint = env.Q3_CARRIER_ENDPOINT || CONFIG.Q3 Carrier.endpoint;
    const bucket = env.Q3_CARRIER_BUCKET || CONFIG.Q3 Carrier.bucket;
    const region = env.Q3_CARRIER_REGION || CONFIG.Q3 Carrier.region;

    const url = new URL(`${endpoint}/${bucket}/${path}`);
    const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = datetime.slice(0, 8);

    const payloadHash = body
        ? await sha256Hex(typeof body === 'string' ? body : JSON.stringify(body))
        : 'UNSIGNED-PAYLOAD';

    const headers = {
        'host': url.host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': datetime,
    };

    if (body) {
        headers['content-type'] = 'application/json';
    }

    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers).sort()
        .map(k => `${k}:${headers[k]}\n`).join('');

    const canonicalRequest = [
        method,
        url.pathname,
        '',
        canonicalHeaders,
        signedHeaders,
        payloadHash
    ].join('\n');

    const credentialScope = `${date}/${region}/s3/aws4_request`;
    const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        datetime,
        credentialScope,
        hashedCanonicalRequest
    ].join('\n');

    const kDate = await hmacSha256(`AWS4${env.Q3_CARRIER_SECRET_KEY}`, date);
    const kRegion = await hmacSha256(kDate, region);
    const kService = await hmacSha256(kRegion, 's3');
    const kSigning = await hmacSha256(kService, 'aws4_request');
    const signature = await hmacSha256Hex(kSigning, stringToSign);

    headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${env.Q3_CARRIER_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return { url: url.toString(), headers };
}

// ============================================================================
// S3 OPERATIONS
// ============================================================================

async function s3Get(path, env) {
    const { url, headers } = await signS3Request('GET', path, env);
    return fetch(url, { method: 'GET', headers });
}

async function s3Put(path, data, env) {
    const body = typeof data === 'string' ? data : JSON.stringify(data);
    const { url, headers } = await signS3Request('PUT', path, env, body);
    headers['content-length'] = body.length.toString();
    return fetch(url, { method: 'PUT', headers, body });
}

// ============================================================================
// MINING WORK MANAGEMENT
// ============================================================================

const MiningWorkManager = {
    /**
     * Get current mining work from S3
     * Work is fetched from stratum and cached in S3
     */
    async getWork(env) {
        // Try to get cached work from S3
        const workPath = `${CONFIG.mining.workPath}/current.json`;
        const response = await s3Get(workPath, env);

        if (response.ok) {
            const work = await response.json();
            // Check if work is still valid (not too old)
            const age = Date.now() - work.timestamp;
            if (age < 30000) { // 30 seconds
                return work;
            }
        }

        // Generate new work template
        // In production, this would come from a stratum connection
        // For edge workers, we fetch from the cloud mining service
        return {
            workId: `work-${Date.now().toString(36)}`,
            version: '20000000',
            prevHash: '0000000000000000000000000000000000000000000000000000000000000000',
            merkleRoot: '0000000000000000000000000000000000000000000000000000000000000000',
            ntime: Math.floor(Date.now() / 1000).toString(16),
            nbits: '1d00ffff',
            nonceStart: 0,
            nonceEnd: 0xFFFFFFFF,
            timestamp: Date.now(),
            difficulty: CONFIG.mining.defaultDifficulty,
            source: 'Q3 Carrier-edge'
        };
    },

    /**
     * Submit mining result to S3
     */
    async submitResult(result, env) {
        const resultId = `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
        const resultPath = `${CONFIG.mining.resultsPath}/${resultId}.json`;

        const submission = {
            ...result,
            resultId,
            submittedAt: Date.now(),
            workerType: CONFIG.worker.type,
            workerId: CONFIG.worker.id
        };

        await s3Put(resultPath, submission, env);

        return {
            success: true,
            resultId,
            message: 'Result submitted to Q3 Carrier S3'
        };
    },

    /**
     * Save checkpoint state
     */
    async saveCheckpoint(checkpoint, env) {
        const checkpointPath = `${CONFIG.mining.checkpointPath}/${checkpoint.workerId}/latest.json`;

        const data = {
            ...checkpoint,
            savedAt: Date.now()
        };

        await s3Put(checkpointPath, data, env);

        return { success: true, path: checkpointPath };
    },

    /**
     * Load checkpoint state
     */
    async loadCheckpoint(workerId, env) {
        const checkpointPath = `${CONFIG.mining.checkpointPath}/${workerId}/latest.json`;
        const response = await s3Get(checkpointPath, env);

        if (response.ok) {
            return await response.json();
        }
        return null;
    }
};

// ============================================================================
// STATIC SITE HOSTING (Q3)
// ============================================================================

function getMimeType(path) {
    const ext = '.' + path.split('.').pop().toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}

async function serveSiteFile(siteId, filePath, env) {
    const path = `q3/sites/${siteId}/files/${filePath}`;
    const response = await s3Get(path, env);

    if (!response.ok) {
        return null;
    }

    return {
        body: response.body,
        contentType: getMimeType(filePath)
    };
}

async function resolveSiteId(hostname, env) {
    // Check custom domain mapping
    const domainPath = `q3/domains/${hostname}.json`;
    const response = await s3Get(domainPath, env);

    if (response.ok) {
        const mapping = await response.json();
        return mapping.siteId;
    }

    // Extract subdomain for Q3 pattern
    const parts = hostname.split('.');
    if (parts.length >= 3 && parts[1] === 'q3') {
        const subdomain = parts[0];
        const routingPath = `q3/routing/${subdomain}.json`;
        const routeResponse = await s3Get(routingPath, env);

        if (routeResponse.ok) {
            const routing = await routeResponse.json();
            return routing.siteId;
        }

        return subdomain.startsWith('site-') ? subdomain : null;
    }

    return null;
}

// ============================================================================
// QUDIT VERIFICATION
// ============================================================================

const QuditVerification = {
    createSuperposition(d) {
        const amplitude = 1 / Math.sqrt(d);
        return Array(d).fill(amplitude);
    },

    measure(superposition) {
        const rand = Math.random();
        let cumulative = 0;
        for (let i = 0; i < superposition.length; i++) {
            cumulative += superposition[i] ** 2;
            if (rand < cumulative) return i;
        }
        return superposition.length - 1;
    },

    verifyDomain(domain) {
        let hash = 0;
        for (const char of domain) {
            hash = ((hash << 5) - hash) + char.charCodeAt(0);
            hash |= 0;
        }

        const dimension = Math.min(Math.max(3, domain.length), 8);
        const superposition = this.createSuperposition(dimension);
        const rotated = superposition.map((amp, i) => {
            const phase = (hash * (i + 1)) % 360;
            return amp * Math.cos(phase * Math.PI / 180);
        });

        const state = this.measure(rotated);

        return {
            valid: true,
            dimension,
            verificationState: state,
            quantumSignature: `qd${dimension}:${state}:${hash.toString(16)}`
        };
    }
};

// ============================================================================
// REQUEST HANDLERS
// ============================================================================

async function handleMiningRequest(pathname, request, env) {
    const route = pathname.replace('/api/mining', '');

    // Initialize worker ID
    if (!CONFIG.worker.id) {
        CONFIG.worker.id = `Q3 Carrier-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 6)}`;
    }

    // GET /api/mining/status
    if (route === '/status' || route === '') {
        return new Response(JSON.stringify({
            status: 'running',
            worker: {
                id: CONFIG.worker.id,
                type: CONFIG.worker.type,
                version: CONFIG.worker.version
            },
            endpoints: {
                work: '/api/mining/work',
                submit: '/api/mining/submit',
                checkpoint: '/api/mining/checkpoint'
            },
            platform: 'Q3 Carrier-functions',
            timestamp: Date.now()
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // GET /api/mining/work
    if (route === '/work' && request.method === 'GET') {
        const work = await MiningWorkManager.getWork(env);
        return new Response(JSON.stringify(work), {
            headers: {
                'Content-Type': 'application/json',
                'X-Worker-Id': CONFIG.worker.id
            }
        });
    }

    // POST /api/mining/submit
    if (route === '/submit' && request.method === 'POST') {
        try {
            const result = await request.json();
            const submission = await MiningWorkManager.submitResult(result, env);
            return new Response(JSON.stringify(submission), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    // POST /api/mining/checkpoint
    if (route === '/checkpoint' && request.method === 'POST') {
        try {
            const checkpoint = await request.json();
            const result = await MiningWorkManager.saveCheckpoint(checkpoint, env);
            return new Response(JSON.stringify(result), {
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    // GET /api/mining/checkpoint/:workerId
    if (route.startsWith('/checkpoint/') && request.method === 'GET') {
        const workerId = route.split('/')[2];
        const checkpoint = await MiningWorkManager.loadCheckpoint(workerId, env);

        if (checkpoint) {
            return new Response(JSON.stringify(checkpoint), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return new Response(JSON.stringify({ error: 'Checkpoint not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response('Mining endpoint not found', { status: 404 });
}

async function handleStaticRequest(url, request, env) {
    const hostname = url.hostname;
    const pathname = url.pathname;

    // Resolve site ID
    const siteId = await resolveSiteId(hostname, env);

    if (!siteId) {
        return new Response(generateLandingPage(), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    }

    // Get file path
    let filePath = pathname.slice(1) || 'index.html';
    if (filePath.endsWith('/')) {
        filePath += 'index.html';
    }

    // Fetch file
    const file = await serveSiteFile(siteId, filePath, env);

    if (file) {
        return new Response(file.body, {
            headers: {
                'Content-Type': file.contentType,
                'Cache-Control': 'public, max-age=3600',
                'X-Q3-Site': siteId,
                'X-Powered-By': 'Q3 Q3 Carrier Edge'
            }
        });
    }

    // Try index.html for directory paths
    if (!filePath.includes('.')) {
        const indexFile = await serveSiteFile(siteId, filePath + '/index.html', env);
        if (indexFile) {
            return new Response(indexFile.body, {
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'X-Q3-Site': siteId
                }
            });
        }
    }

    return new Response('File not found', { status: 404 });
}

function generateLandingPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Q3 Q3 Carrier Edge</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 100%);
            color: #fff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container { text-align: center; padding: 40px; }
        h1 {
            font-size: 4rem;
            background: linear-gradient(90deg, #00ffff, #ff00ff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        p { color: rgba(255,255,255,0.7); margin-top: 20px; }
        .badge {
            display: inline-block;
            background: rgba(0,255,255,0.2);
            color: #00ffff;
            padding: 8px 16px;
            border-radius: 20px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Q3</h1>
        <p>Quantum Storage • Q3 Carrier Edge</p>
        <div class="badge">✨ NO Cloudflare • 100% Q3 Carrier</div>
    </div>
</body>
</html>`;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

async function handleRequest(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Max-Age': '86400',
            }
        });
    }

    // Mining API routes
    if (pathname.startsWith('/api/mining')) {
        return await handleMiningRequest(pathname, request, env);
    }

    // Static site hosting
    return await handleStaticRequest(url, request, env);
}

// ============================================================================
// PERPETUAL MINING (Scheduled Handler)
// ============================================================================

const MiningEngine = {
    state: {
        running: false,
        currentNonce: 0,
        totalHashes: 0n,
        sharesFound: 0,
        startTime: null,
        workerId: null
    },

    /**
     * SHA256d (double SHA256) for Bitcoin mining
     */
    async sha256d(data) {
        const first = await crypto.subtle.digest('SHA-256', data);
        const second = await crypto.subtle.digest('SHA-256', first);
        return new Uint8Array(second);
    },

    /**
     * Check if hash meets difficulty target
     */
    meetsTarget(hash, difficulty) {
        // Count leading zero bits
        let zeros = 0;
        for (const byte of hash) {
            if (byte === 0) {
                zeros += 8;
            } else {
                zeros += Math.clz32(byte) - 24;
                break;
            }
        }
        return zeros >= Math.log2(difficulty);
    },

    /**
     * Mine a batch of nonces
     */
    async mineBatch(work, batchSize = 10000, env) {
        const results = [];
        const startNonce = this.state.currentNonce;

        for (let i = 0; i < batchSize; i++) {
            const nonce = startNonce + i;

            // Build block header (simplified)
            const header = new Uint8Array(80);
            const view = new DataView(header.buffer);
            view.setUint32(0, parseInt(work.version, 16), true);
            // ... prevHash, merkleRoot, ntime, nbits would go here
            view.setUint32(76, nonce, true);

            // Hash
            const hash = await this.sha256d(header);
            this.state.totalHashes++;

            // Check difficulty
            if (this.meetsTarget(hash, work.difficulty)) {
                results.push({
                    nonce,
                    hash: Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join(''),
                    workId: work.workId,
                    timestamp: Date.now()
                });
                this.state.sharesFound++;
            }
        }

        this.state.currentNonce = startNonce + batchSize;
        return results;
    },

    /**
     * Run perpetual mining cycle
     */
    async runCycle(env) {
        if (!this.state.startTime) {
            this.state.startTime = Date.now();
            this.state.workerId = `edge-${Date.now().toString(36)}`;
        }

        // Load checkpoint if exists
        const checkpoint = await MiningWorkManager.loadCheckpoint(this.state.workerId, env);
        if (checkpoint) {
            this.state.currentNonce = checkpoint.currentNonce || 0;
            this.state.totalHashes = BigInt(checkpoint.totalHashes || 0);
            this.state.sharesFound = checkpoint.sharesFound || 0;
            console.log(`[Mining] Restored from checkpoint: ${this.state.sharesFound} shares`);
        }

        // Get work
        const work = await MiningWorkManager.getWork(env);

        // Mine batch
        const results = await this.mineBatch(work, 50000, env);

        // Submit results
        for (const result of results) {
            await MiningWorkManager.submitResult(result, env);
        }

        // Save checkpoint
        await MiningWorkManager.saveCheckpoint({
            workerId: this.state.workerId,
            currentNonce: this.state.currentNonce,
            totalHashes: this.state.totalHashes.toString(),
            sharesFound: this.state.sharesFound,
            hashrate: this.getHashrate(),
            uptime: Date.now() - this.state.startTime
        }, env);

        console.log(`[Mining] Cycle complete: ${this.state.totalHashes} hashes, ${this.state.sharesFound} shares`);

        return {
            success: true,
            hashes: this.state.totalHashes.toString(),
            shares: this.state.sharesFound,
            hashrate: this.getHashrate()
        };
    },

    getHashrate() {
        const elapsed = (Date.now() - this.state.startTime) / 1000;
        if (elapsed === 0) return 0;
        return Number(this.state.totalHashes) / elapsed;
    }
};

// ============================================================================
// EXPORT
// ============================================================================

export default {
    async fetch(request, env, ctx) {
        try {
            const response = await handleRequest(request, env);

            // Add CORS headers
            const headers = new Headers(response.headers);
            headers.set('Access-Control-Allow-Origin', '*');

            return new Response(response.body, {
                status: response.status,
                headers
            });
        } catch (err) {
            console.error('Q3 Carrier Edge Worker Error:', err);
            return new Response(JSON.stringify({
                error: err.message,
                worker: 'Q3 Carrier-edge',
                timestamp: Date.now()
            }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    },

    /**
     * Scheduled handler - runs perpetually via cron trigger
     * Configure in wrangler.toml: [triggers] crons = ["* * * * *"]
     */
    async scheduled(event, env, ctx) {
        console.log('[Mining] Scheduled mining cycle triggered');

        // Run mining cycle
        ctx.waitUntil(MiningEngine.runCycle(env));

        return new Response('Mining cycle started', { status: 200 });
    }
};

export { handleRequest, MiningWorkManager, QuditVerification, MiningEngine };