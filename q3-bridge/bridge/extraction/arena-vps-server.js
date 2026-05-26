/**
 * ACLDQ Arena - VPS Server (QUIC.cloud Origin)
 * 
 * Lightweight Node.js server for VPS ($5)
 * - Serves AVIF rankings to QUIC.cloud CDN
 * - Syncs with Cloudflare Arena Worker
 * - Stores to Q3 Carrier S3
 * 
 * Run: pm2 start arena-vps-server.js --name arena
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
    port: process.env.PORT || 3847,

    Q3 Carrier: {
        endpoint: 's3.Q3 Carrier.eu',
        bucket: 'cr8os1',
        region: 'eu-west-1',
        accessKey: process.env.Q3_CARRIER_ID || 'u4bi8wC839SUl0aZPBn/Cpw8wPWglXo7',
        secretKey: process.env.Q3_CARRIER_SECRET || '5GPCMUeE790r5JdLl0V4l9p4vb2R+8WjmsspQex+Bok='
    },

    dataDir: process.env.DATA_DIR || '/tmp/arena-data'
};

// Ensure data dir
if (!fs.existsSync(CONFIG.dataDir)) {
    fs.mkdirSync(CONFIG.dataDir, { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────

let arenaState = {
    rankings: [],
    totalMatches: 0,
    totalComputations: 0,
    lastSync: null
};

// ─────────────────────────────────────────────────────────────────────────────
// HTTP SERVER
// ─────────────────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    // LiteSpeed cache headers
    res.setHeader('X-LiteSpeed-Cache-Control', 'public, max-age=60');
    res.setHeader('X-LiteSpeed-Tag', 'arena');

    try {
        // Routes
        if (url.pathname === '/arena/status') {
            return sendJSON(res, {
                status: 'online',
                server: 'vps-origin',
                rankings: arenaState.rankings.length,
                totalMatches: arenaState.totalMatches,
                totalComputations: arenaState.totalComputations,
                lastSync: arenaState.lastSync,
                uptime: process.uptime()
            });
        }

        if (url.pathname === '/arena/rankings.avif') {
            const avif = createAVIF(arenaState.rankings);
            res.setHeader('Content-Type', 'image/avif');
            res.setHeader('Cache-Control', 'public, max-age=60');
            res.setHeader('X-Arena-Matches', arenaState.totalMatches.toString());
            return res.end(avif);
        }

        if (url.pathname === '/arena/rankings.json') {
            res.setHeader('Cache-Control', 'public, max-age=60');
            return sendJSON(res, {
                rankings: arenaState.rankings,
                totalMatches: arenaState.totalMatches,
                lastSync: arenaState.lastSync
            });
        }

        if (url.pathname === '/arena/sync' && req.method === 'POST') {
            const body = await parseBody(req);
            await handleSync(body);
            return sendJSON(res, { synced: true });
        }

        if (url.pathname === '/arena/compute') {
            // Run local compute cycle
            const result = await runLocalCompute();
            return sendJSON(res, result);
        }

        // Default
        return sendJSON(res, {
            service: 'ACLDQ Arena VPS Origin',
            endpoints: [
                '/arena/status',
                '/arena/rankings.avif',
                '/arena/rankings.json',
                '/arena/sync',
                '/arena/compute'
            ]
        });

    } catch (err) {
        console.error('[Arena VPS] Error:', err);
        res.statusCode = 500;
        return sendJSON(res, { error: err.message });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

async function handleSync(data) {
    console.log('[Arena VPS] Sync received:', data);

    if (data.rankings) {
        arenaState.rankings = data.rankings;
    }
    if (data.matches) {
        arenaState.totalMatches += data.matches;
    }
    if (data.computations) {
        arenaState.totalComputations += data.computations;
    }
    arenaState.lastSync = new Date().toISOString();

    // Save locally
    fs.writeFileSync(
        path.join(CONFIG.dataDir, 'state.json'),
        JSON.stringify(arenaState, null, 2)
    );

    // Async save to Q3 Carrier
    saveToQ3 Carrier();
}

async function runLocalCompute() {
    console.log('[Arena VPS] Running local compute...');

    const startTime = Date.now();
    let computations = 0;
    const matchCount = 100;

    // Simple similarity computations
    const dim = 64;
    const vecA = new Float32Array(dim).map(() => Math.random());
    const vecB = new Float32Array(dim).map(() => Math.random());

    for (let m = 0; m < matchCount; m++) {
        // Randomize vectors slightly each match
        for (let i = 0; i < dim; i++) {
            vecA[i] += (Math.random() - 0.5) * 0.1;
            vecB[i] += (Math.random() - 0.5) * 0.1;
        }

        // Cosine similarity
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < dim; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        const sim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
        computations += dim * 3;
    }

    const elapsed = Date.now() - startTime;
    arenaState.totalComputations += computations;

    return {
        matches: matchCount,
        computations,
        elapsed,
        computationsPerSecond: Math.round(computations / (elapsed / 1000))
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Q3_CARRIER S3
// ─────────────────────────────────────────────────────────────────────────────

function saveToQ3 Carrier() {
    const data = JSON.stringify({
        rankings: arenaState.rankings,
        totalMatches: arenaState.totalMatches,
        totalComputations: arenaState.totalComputations,
        savedAt: new Date().toISOString()
    });

    const date = new Date().toUTCString();
    const path = `/${CONFIG.Q3 Carrier.bucket}/arena/state/latest.json`;
    const stringToSign = `PUT\n\napplication/json\n${date}\n${path}`;

    const signature = crypto.createHmac('sha1', CONFIG.Q3 Carrier.secretKey)
        .update(stringToSign)
        .digest('base64');

    const req = https.request({
        hostname: CONFIG.Q3 Carrier.endpoint,
        port: 443,
        path,
        method: 'PUT',
        headers: {
            'Host': CONFIG.Q3 Carrier.endpoint,
            'Date': date,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            'Authorization': `AWS ${CONFIG.Q3 Carrier.accessKey}:${signature}`
        }
    });

    req.on('error', (err) => console.error('[Q3 Carrier] Save error:', err.message));
    req.write(data);
    req.end();
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function sendJSON(res, data) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(JSON.parse(body || '{}'));
            } catch {
                resolve({});
            }
        });
        req.on('error', reject);
    });
}

function createAVIF(rankings) {
    const json = JSON.stringify({ rankings, timestamp: Date.now() });

    // Minimal AVIF structure
    const ftyp = Buffer.from([
        0x00, 0x00, 0x00, 0x1C, 0x66, 0x74, 0x79, 0x70,
        0x61, 0x76, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00,
        0x61, 0x76, 0x69, 0x66, 0x6D, 0x69, 0x66, 0x31,
        0x00, 0x00, 0x00, 0x00
    ]);

    const xmp = Buffer.from(
        `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>` +
        `<x:xmpmeta xmlns:x="adobe:ns:meta/">` +
        `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">` +
        `<rdf:Description xmlns:arena="http://cr8os.io/arena/1.0/">` +
        `<arena:data>${json}</arena:data>` +
        `</rdf:Description></rdf:RDF></x:xmpmeta>` +
        `<?xpacket end="w"?>`
    );

    const xmpHeader = Buffer.alloc(8);
    xmpHeader.writeUInt32BE(xmp.length + 8, 0);
    xmpHeader.write('XMP ', 4);

    return Buffer.concat([ftyp, xmpHeader, xmp]);
}

// ─────────────────────────────────────────────────────────────────────────────
// STARTUP
// ─────────────────────────────────────────────────────────────────────────────

// Load saved state
try {
    const saved = fs.readFileSync(path.join(CONFIG.dataDir, 'state.json'), 'utf8');
    arenaState = JSON.parse(saved);
    console.log('[Arena VPS] Loaded saved state');
} catch { }

server.listen(CONFIG.port, () => {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  ACLDQ Arena - VPS Origin Server                               ║');
    console.log('║  For QUIC.cloud CDN caching                                    ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log();
    console.log(`[Arena VPS] Running on http://0.0.0.0:${CONFIG.port}`);
    console.log(`[Arena VPS] Q3 Carrier: ${CONFIG.Q3 Carrier.bucket}`);
});
