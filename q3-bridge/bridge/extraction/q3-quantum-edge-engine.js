/**
 * Q3 Quantum Edge Engine - Cloudflare-Free Static Site Hosting
 * 
 * Serves Q3 static sites and .q domains directly from Q3 Carrier S3
 * NO CLOUDFLARE DEPENDENCY - runs as part of cr8os-alter-api.js
 * 
 * Request Flow:
 *   User → Your Server → Q3 Carrier S3 → Response
 *   User → .q Domain → QDP Resolution → Q3 Carrier S3 → Response
 * 
 * Integration:
 *   Add routes in cr8os-alter-api.js or run standalone on port 7480
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

// =========================================================================
// CONFIGURATION (from environment or quantumcloud-edge-config.js)
// =========================================================================
const config = {
    Q3 Carrier: {
        endpoint: process.env.Q3_CARRIER_ENDPOINT || 'https://s3.Q3 Carrier.eu',
        accessKeyId: process.env.Q3_CARRIER_ID || process.env.Q3_CARRIER_ACCESS_KEY || '',
        secretAccessKey: process.env.Q3_CARRIER_SECRET || process.env.Q3_CARRIER_SECRET_KEY || '',
        bucket: process.env.Q3_CARRIER_BUCKET || 'cr8os1',
        region: process.env.Q3_CARRIER_REGION || 'eu-west-1',
    },
    // Cache settings
    cache: {
        enabled: true,
        maxAge: 3600,
        inmemoryTTL: 300000, // 5 min in-memory cache
    }
};

// In-memory cache for hot paths
const fileCache = new Map();

// MIME types
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.pdf': 'application/pdf',
    '.wasm': 'application/wasm',
};

function getMimeType(path) {
    const ext = '.' + path.split('.').pop().toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}

// =========================================================================
// AWS SIGNATURE V4 FOR Q3_CARRIER S3
// =========================================================================
function hmacSha256(key, data) {
    return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data) {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function signS3Request(method, path, region, accessKey, secretKey) {
    const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = datetime.slice(0, 8);

    const url = new URL(config.Q3 Carrier.endpoint + path);
    const host = url.host;

    const headers = {
        'host': host,
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
        'x-amz-date': datetime,
    };

    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:${datetime}\n`;

    const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
    const credentialScope = `${date}/${region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', datetime, credentialScope, sha256Hex(canonicalRequest)].join('\n');

    const kDate = hmacSha256('AWS4' + secretKey, date);
    const kRegion = hmacSha256(kDate, region);
    const kService = hmacSha256(kRegion, 's3');
    const kSigning = hmacSha256(kService, 'aws4_request');
    const signature = hmacSha256(kSigning, stringToSign).toString('hex');

    headers['Authorization'] = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return headers;
}

// =========================================================================
// Q3_CARRIER S3 FETCHER
// =========================================================================
function fetchFromQ3 Carrier(objectPath) {
    return new Promise((resolve, reject) => {
        const { endpoint, accessKeyId, secretAccessKey, bucket, region } = config.Q3 Carrier;
        const path = `/${bucket}/${objectPath}`;

        // Check cache
        const cached = fileCache.get(path);
        if (cached && Date.now() - cached.timestamp < config.cache.inmemoryTTL) {
            return resolve({ ok: true, body: cached.body, contentType: cached.contentType });
        }

        const headers = signS3Request('GET', path, region, accessKeyId, secretAccessKey);
        const url = new URL(endpoint + path);

        const req = https.request({
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'GET',
            headers
        }, (res) => {
            if (res.statusCode === 404) {
                return resolve({ ok: false, status: 404 });
            }
            if (res.statusCode !== 200) {
                return resolve({ ok: false, status: res.statusCode });
            }

            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks);
                const contentType = res.headers['content-type'] || 'application/octet-stream';

                // Cache hot paths
                if (body.length < 1024 * 1024) { // Only cache <1MB
                    fileCache.set(path, { body, contentType, timestamp: Date.now() });
                }

                resolve({ ok: true, body, contentType });
            });
        });

        req.on('error', reject);
        req.end();
    });
}

// =========================================================================
// QUANTUM DOMAIN PROTOCOL (QDP) RESOLVER
// =========================================================================
async function resolveQuantumDomain(domainName) {
    const name = domainName.toLowerCase().replace(/\.q$/, '');

    // Reserved single-char domains
    if (name.length === 1) {
        return { reserved: true, name };
    }

    // Look up QDR from Q3 Carrier
    const qdrPath = `q3/qdp/domains/${name}.qdr`;
    const result = await fetchFromQ3 Carrier(qdrPath);

    if (result.ok) {
        try {
            return JSON.parse(result.body.toString());
        } catch (e) {
            console.error(`[QDP] Invalid QDR for ${name}:`, e.message);
        }
    }

    return null;
}

// =========================================================================
// SITE FILE FETCHER
// =========================================================================
async function getSiteFile(siteId, filePath) {
    const path = `q3/sites/${siteId}/files/${filePath}`;
    return fetchFromQ3 Carrier(path);
}

async function resolveSiteFromSubdomain(subdomain) {
    // Try routing file first
    const routingPath = `q3/routing/${subdomain}.json`;
    const result = await fetchFromQ3 Carrier(routingPath);

    if (result.ok) {
        try {
            const mapping = JSON.parse(result.body.toString());
            return mapping.siteId;
        } catch (e) { }
    }

    // Fallback: subdomain IS the siteId
    return subdomain.startsWith('site-') ? subdomain : null;
}

// =========================================================================
// REQUEST HANDLER (Express-compatible middleware)
// =========================================================================
async function handleQ3Request(req, res) {
    const hostname = req.headers.host || '';
    const pathname = req.url.split('?')[0] || '/';

    // Check for .q domain
    const isQuantumDomain = hostname.endsWith('.q') || hostname === 'q';
    let siteId = null;

    if (isQuantumDomain) {
        const qdr = await resolveQuantumDomain(hostname);

        if (!qdr) {
            // Domain not registered
            res.writeHead(404, { 'Content-Type': 'text/html' });
            return res.end(`<h1>${hostname}</h1><p>Quantum domain not registered.</p>`);
        }

        if (qdr.reserved) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            return res.end(`<h1>${qdr.name.toUpperCase()}.q</h1><p>Reserved platform domain.</p>`);
        }

        siteId = qdr.siteId || qdr.records?.root?.split('://')[1]?.split(':')[0];
    } else {
        // Standard subdomain: {subdomain}.q3.yourdomain.com
        const parts = hostname.split('.');
        const subdomain = parts[0];

        if (!subdomain || subdomain === 'www' || subdomain === 'q3') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            return res.end('<h1>Q3 Quantum Storage</h1><p>Serverless static hosting.</p>');
        }

        siteId = await resolveSiteFromSubdomain(subdomain);
    }

    if (!siteId) {
        res.writeHead(404);
        return res.end('Site not found');
    }

    // Resolve file path
    let filePath = pathname.slice(1) || 'index.html';
    if (filePath === '' || filePath.endsWith('/')) {
        filePath = filePath + 'index.html';
    }

    // Fetch file from Q3 Carrier
    const file = await getSiteFile(siteId, filePath);

    if (!file.ok) {
        // Try index.html for directory
        if (!filePath.includes('.')) {
            const indexFile = await getSiteFile(siteId, filePath + '/index.html');
            if (indexFile.ok) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                return res.end(indexFile.body);
            }
        }
        res.writeHead(404);
        return res.end(`File not found: ${filePath}`);
    }

    const contentType = getMimeType(filePath);
    res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'X-Q3-Site': siteId,
        'X-Powered-By': 'Q3 Quantum Edge Engine',
    });
    res.end(file.body);
}

// =========================================================================
// EXPRESS ROUTER (for cr8os-alter-api.js integration)
// =========================================================================
function createQ3Router(app) {
    // Serve Q3 sites at /q3-site/{siteId}/{path}
    // Using a regex route for full path capture (path-to-regexp v8 compatible)
    app.get(/^\/q3-site\/([^\/]+)\/(.*)$/, async (req, res) => {
        const siteId = req.params[0];
        const filePath = req.params[1] || 'index.html';

        const file = await getSiteFile(siteId, filePath);

        if (!file.ok) {
            return res.status(404).send(`File not found: ${filePath}`);
        }

        res.set('Content-Type', getMimeType(filePath));
        res.set('X-Q3-Site', siteId);
        res.send(file.body);
    });

    // QDP lookup endpoint
    app.get('/api/qdp/resolve/:domain', async (req, res) => {
        const qdr = await resolveQuantumDomain(req.params.domain);
        if (!qdr) return res.status(404).json({ error: 'Domain not found' });
        res.json(qdr);
    });

    // QDP domains list (for frontend compatibility - also accessible at /qdp/domains)
    app.get('/qdp/domains', async (req, res) => {
        // List all registered .q domains from Q3 Carrier
        const domainsPath = 'q3/qdp/domains/';
        const result = await fetchFromQ3 Carrier(domainsPath);
        const domains = [];
        // Return empty array if no domains yet
        res.json({ domains, count: domains.length });
    });

    app.get('/api/qdp/domains', async (req, res) => {
        const domainsPath = 'q3/qdp/domains/';
        const result = await fetchFromQ3 Carrier(domainsPath);
        const domains = [];
        res.json({ domains, count: domains.length });
    });

    // QDP stats endpoint
    app.get('/qdp/stats', (req, res) => {
        res.json({
            totalDomains: 0,
            activeDomains: 0,
            reservedDomains: 26, // A-Z single chars
            protocol: 'QDP v1.0',
            backend: 'Q3 Carrier S3',
            cloudflare: false
        });
    });

    app.get('/api/qdp/stats', (req, res) => {
        res.json({
            totalDomains: 0,
            activeDomains: 0,
            reservedDomains: 26,
            protocol: 'QDP v1.0',
            backend: 'Q3 Carrier S3',
            cloudflare: false
        });
    });

    // Gateway redirect for extensionless access: /q-redirect/{domain.q}/path
    // Using regex for path-to-regexp v8 compatibility
    app.get(/^\/q-redirect\/([^\/]+)\/(.*)$/, async (req, res) => {
        const domain = req.params[0];
        const path = req.params[1] || '';

        const qdr = await resolveQuantumDomain(domain);
        if (!qdr || !qdr.siteId) {
            return res.status(404).send(`<h1>${domain}</h1><p>Quantum domain not registered.</p>`);
        }

        // Redirect to Q3 site
        res.redirect(`/q3-site/${qdr.siteId}/${path}`);
    });

    // Gateway subdomain handler: Catches *.q.quantum.cr8os.com (and *.q.cr8os.com)
    // IMPORTANT: Only applies to requests with matching Host header
    // Explicitly skips: localhost, 127.0.0.1, API paths
    app.use(async (req, res, next) => {
        const host = req.headers.host || '';

        // SKIP if localhost or IP address (dev/API requests)
        if (host.includes('localhost') || host.startsWith('127.') || host.startsWith('192.168.') || host.match(/^\d+\.\d+\.\d+\.\d+/)) {
            return next();
        }

        // SKIP if this is an API request
        if (req.path.startsWith('/api/')) {
            return next();
        }

        // Check for .q.quantum.cr8os.com or .q.cr8os.com pattern
        const match = host.match(/^(.+)\.q\.(quantum\.)?cr8os\.com$/);
        if (!match) {
            return next();
        }

        const domain = match[1] + '.q';
        console.log(`[Q3 Gateway] Resolving ${domain} from host ${host}`);

        const qdr = await resolveQuantumDomain(domain);

        if (!qdr || !qdr.siteId) {
            return res.status(404).send(`<h1>${domain}</h1><p>Quantum domain not registered. <a href="https://quantum.cr8os.com/domains">Register it</a></p>`);
        }

        // Serve site file
        const filePath = req.path.slice(1) || 'index.html';
        const file = await getSiteFile(qdr.siteId, filePath);

        if (!file.ok) {
            // Try index.html for directory paths
            if (!filePath.includes('.')) {
                const indexFile = await getSiteFile(qdr.siteId, filePath + '/index.html');
                if (indexFile.ok) {
                    res.set('Content-Type', 'text/html');
                    res.set('X-Q3-Site', qdr.siteId);
                    res.set('X-Q-Domain', domain);
                    return res.send(indexFile.body);
                }
            }
            return res.status(404).send(`File not found: ${filePath}`);
        }

        res.set('Content-Type', getMimeType(filePath));
        res.set('X-Q3-Site', qdr.siteId);
        res.set('X-Q-Domain', domain);
        res.send(file.body);
    });

    console.log('[Q3 Edge] 🚀 Quantum Edge Engine routes registered');
    console.log('[Q3 Edge] 🌐 Gateway: *.q.quantum.cr8os.com (skips localhost/API)');
}

// =========================================================================
// STANDALONE SERVER (optional - run without cr8os-alter-api.js)
// =========================================================================
function startStandaloneServer(port = 7480) {
    const server = http.createServer(handleQ3Request);

    server.listen(port, () => {
        console.log(`[Q3 Edge] ⚡ Quantum Edge Engine running on http://localhost:${port}`);
        console.log(`[Q3 Edge] 📂 Q3 Carrier bucket: ${config.Q3 Carrier.bucket}`);
        console.log(`[Q3 Edge] 🌐 .q domains: Enabled`);
    });

    return server;
}

// =========================================================================
// EXPORTS
// =========================================================================
module.exports = {
    // Configuration
    config,

    // Core functions
    fetchFromQ3 Carrier,
    getSiteFile,
    resolveQuantumDomain,
    resolveSiteFromSubdomain,

    // Handlers
    handleQ3Request,

    // Integration
    createQ3Router,
    startStandaloneServer,

    // Utils
    getMimeType,
    signS3Request,
};

// Run standalone if executed directly
if (require.main === module) {
    startStandaloneServer(process.env.Q3_PORT || 7480);
}

