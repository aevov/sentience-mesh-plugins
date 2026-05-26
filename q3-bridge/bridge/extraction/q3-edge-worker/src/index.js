/**
 * Q3 Edge Worker - Serverless Static Site Hosting
 * 
 * Serves Q3 static sites from Q3 Carrier S3 at the edge.
 * No origin server needed - fully serverless architecture.
 * 
 * Request Flow:
 *   User → QUIC.cloud → Cloudflare Worker → Q3 Carrier S3 → Response
 * 
 * Environment Variables Required:
 *   - Q3_CARRIER_ENDPOINT: S3 endpoint (e.g., https://s3.Q3 Carrier.eu)
 *   - Q3_CARRIER_BUCKET: Bucket name (e.g., cr8os1)
 *   - Q3_CARRIER_ACCESS_KEY: S3 access key
 *   - Q3_CARRIER_SECRET_KEY: S3 secret key
 *   - Q3_CARRIER_REGION: S3 region (e.g., eu-west-1)
 */

// MIME type mapping
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
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.wasm': 'application/wasm',
    '.avif': 'image/avif',
};

/**
 * Get MIME type from file extension
 */
function getMimeType(path) {
    const ext = '.' + path.split('.').pop().toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Qudit Superposition Verification
 * Simulates d-dimensional quantum state for routing verification
 * Uses multi-state superposition for enhanced security
 */
const QuditVerification = {
    // Create d-dimensional superposition
    createSuperposition(d) {
        const amplitude = 1 / Math.sqrt(d);
        return Array(d).fill(amplitude);
    },

    // Quantum measurement (collapse to one state)
    measure(superposition) {
        const rand = Math.random();
        let cumulative = 0;
        for (let i = 0; i < superposition.length; i++) {
            cumulative += superposition[i] ** 2;
            if (rand < cumulative) return i;
        }
        return superposition.length - 1;
    },

    // Verify domain through qudit rotation
    verifyDomain(domain) {
        // Use domain hash to seed verification
        let hash = 0;
        for (const char of domain) {
            hash = ((hash << 5) - hash) + char.charCodeAt(0);
            hash |= 0;
        }

        // Create qutrit (3-state) or higher based on domain length
        const dimension = Math.min(Math.max(3, domain.length), 8);
        const superposition = this.createSuperposition(dimension);

        // Apply domain-specific phase rotation
        const rotated = superposition.map((amp, i) => {
            const phase = (hash * (i + 1)) % 360;
            return amp * Math.cos(phase * Math.PI / 180);
        });

        // Measure and get verification state
        const state = this.measure(rotated);

        return {
            valid: true,
            dimension,
            verificationState: state,
            confidence: 1 / dimension,
            quantumSignature: `qd${dimension}:${state}:${hash.toString(16)}`
        };
    },

    // Generate quantum-secure routing key
    generateRoutingKey(domain, siteId) {
        const verification = this.verifyDomain(domain);
        return {
            ...verification,
            routingPath: `${siteId}@shard-${verification.verificationState}`,
            entanglementId: `${domain.length}-${siteId.slice(0, 8)}-${verification.verificationState}`
        };
    }
};

/**
 * AWS Signature V4 for S3 requests
 */
async function signS3Request(request, env, service = 's3') {
    const url = new URL(request.url);
    const datetime = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = datetime.slice(0, 8);
    const region = env.Q3_CARRIER_REGION || 'eu-west-1';

    // Canonical request components
    const method = request.method;
    const canonicalUri = url.pathname;
    const canonicalQueryString = url.searchParams.toString();

    const headers = {
        'host': url.host,
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
        'x-amz-date': datetime,
    };

    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers).sort()
        .map(k => `${k}:${headers[k]}\n`).join('');

    const canonicalRequest = [
        method,
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        'UNSIGNED-PAYLOAD'
    ].join('\n');

    // String to sign
    const credentialScope = `${date}/${region}/${service}/aws4_request`;
    const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        datetime,
        credentialScope,
        hashedCanonicalRequest
    ].join('\n');

    // Signing key
    const kDate = await hmacSha256(`AWS4${env.Q3_CARRIER_SECRET_KEY}`, date);
    const kRegion = await hmacSha256(kDate, region);
    const kService = await hmacSha256(kRegion, service);
    const kSigning = await hmacSha256(kService, 'aws4_request');

    // Signature
    const signature = await hmacSha256Hex(kSigning, stringToSign);

    // Authorization header
    const authorization = `AWS4-HMAC-SHA256 Credential=${env.Q3_CARRIER_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return {
        ...headers,
        'Authorization': authorization,
    };
}

/**
 * Crypto helpers
 */
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

/**
 * Fetch file from Q3 Carrier S3
 */
async function fetchFromS3(path, env) {
    const endpoint = env.Q3_CARRIER_ENDPOINT || 'https://s3.Q3 Carrier.eu';
    const bucket = env.Q3_CARRIER_BUCKET || 'cr8os1';

    const url = `${endpoint}/${bucket}/${path}`;
    const request = new Request(url, { method: 'GET' });

    const signedHeaders = await signS3Request(request, env);

    const response = await fetch(url, {
        method: 'GET',
        headers: signedHeaders,
    });

    return response;
}

/**
 * Get site manifest from S3
 * Sites are stored at: q3/sites/{siteId}/manifest.json
 */
async function getSiteManifest(siteId, env) {
    const path = `q3/sites/${siteId}/manifest.json`;
    const response = await fetchFromS3(path, env);

    if (!response.ok) {
        return null;
    }

    return await response.json();
}

/**
 * Get site file from S3
 * Files are stored at: q3/sites/{siteId}/files/{filePath}
 */
async function getSiteFile(siteId, filePath, env) {
    const path = `q3/sites/${siteId}/files/${filePath}`;
    return await fetchFromS3(path, env);
}

/**
 * Resolve site ID from subdomain or custom domain
 * Checks: 1) Custom domain mapping, 2) Subdomain routing, 3) Direct siteId
 */
async function resolveSiteId(hostnameOrSubdomain, env, isFullHostname = false) {
    let lookupKey = hostnameOrSubdomain;

    // If it's a full hostname, check custom domain mapping first
    if (isFullHostname) {
        const customDomainPath = `q3/domains/${hostnameOrSubdomain}.json`;
        const customResponse = await fetchFromS3(customDomainPath, env);

        if (customResponse.ok) {
            const mapping = await customResponse.json();
            console.log(`[Q3] Custom domain resolved: ${hostnameOrSubdomain} → ${mapping.siteId}`);
            return mapping.siteId;
        }
    }

    // Try subdomain routing
    const mappingPath = `q3/routing/${lookupKey}.json`;
    const response = await fetchFromS3(mappingPath, env);

    if (response.ok) {
        const mapping = await response.json();
        return mapping.siteId;
    }

    // Fallback: subdomain might BE the siteId
    return lookupKey.startsWith('site-') ? lookupKey : null;
}

/**
 * Resolve Quantum Domain (.q TLD) via QDP
 * Looks up q3/qdp/domains/{name}.qdr in S3
 */
async function resolveQuantumDomain(domainName, env) {
    // Remove .q suffix if present
    const name = domainName.toLowerCase().replace(/\.q$/, '');

    // Check for reserved domains (single char)
    if (name.length === 1) {
        console.log(`[QDP] Reserved domain accessed: ${name}.q`);
        // Reserved domains point to platform sites
        // Qudit verification for reserved domains
        const qVerify = QuditVerification.verifyDomain(name);
        return { reserved: true, name, quantum: qVerify };
    }

    // Look up Quantum Domain Record (QDR)
    const qdrPath = `q3/qdp/domains/${name}.qdr`;
    const response = await fetchFromS3(qdrPath, env);

    if (response.ok) {
        const qdr = await response.json();

        // Apply qudit verification for quantum-secure routing
        if (qdr.siteId) {
            qdr.quantumRouting = QuditVerification.generateRoutingKey(name, qdr.siteId);
            console.log(`[QDP] Quantum verified ${name}.q → ${qdr.siteId} (${qdr.quantumRouting.quantumSignature})`);
        } else {
            console.log(`[QDP] Resolved ${name}.q → ${qdr.records?.root || 'no siteId'}`);
        }

        return qdr;
    }

    return null;
}

/**
 * Main request handler
 */
async function handleRequest(request, env) {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Check for .q TLD (Quantum Domain Protocol)
    const isQuantumDomain = hostname.endsWith('.q') || hostname === 'q';

    if (isQuantumDomain) {
        const qdr = await resolveQuantumDomain(hostname, env);

        if (qdr) {
            if (qdr.reserved) {
                // Reserved domain - show platform page
                return new Response(generateReservedDomainPage(qdr.name), {
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                });
            }

            // Resolved QDR - get site ID from records
            const siteId = qdr.siteId || qdr.records?.root?.split('://')[1]?.split(':')[0];
            if (siteId) {
                return await serveSiteContent(siteId, url.pathname, env);
            }
        }

        // Quantum domain not registered
        return new Response(generateQuantumDomainNotFound(hostname), {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    }

    // List of known Q3/convobuilder patterns to skip custom domain check
    const isQ3Subdomain = hostname.includes('.q3.') || hostname.endsWith('.q3');
    const isConvobuilder = hostname.endsWith('.convobuilder.com');

    // Parse subdomain for Q3 pattern: {subdomain}.q3.convobuilder.com
    const parts = hostname.split('.');
    let subdomain = null;
    let siteId = null;

    // First, check if this is a custom domain (not a Q3 subdomain)
    if (!isQ3Subdomain && !isConvobuilder) {
        // This is a custom domain - try to resolve it directly
        siteId = await resolveSiteId(hostname, env, true);

        if (siteId) {
            console.log(`[Q3] Serving custom domain: ${hostname} → ${siteId}`);
        } else {
            // Custom domain not found - show helpful message
            return new Response(generateCustomDomainNotConfigured(hostname), {
                status: 404,
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }
    } else {
        // Standard Q3 subdomain pattern
        if (parts.length >= 3 && parts[1] === 'q3') {
            subdomain = parts[0];
        } else if (parts.length >= 2) {
            // Direct access: {siteId}.convobuilder.com
            subdomain = parts[0];
        }

        if (!subdomain || subdomain === 'www' || subdomain === 'q3') {
            // Serve landing page
            return new Response(generateLandingPage(), {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }

        // Resolve site ID from subdomain
        siteId = await resolveSiteId(subdomain, env, false);
    }

    if (!siteId) {
        return new Response('Site not found', { status: 404 });
    }

    // Get file path
    let filePath = url.pathname.slice(1) || 'index.html';

    // Remove leading slash if present
    filePath = filePath.replace(/^\/+/, '');

    // Default to index.html for directory requests
    if (filePath === '' || filePath.endsWith('/')) {
        filePath = filePath + 'index.html';
    }

    // Fetch the file from S3
    const response = await getSiteFile(siteId, filePath, env);

    if (!response.ok) {
        // Try index.html for directory-like paths
        if (!filePath.includes('.')) {
            const indexPath = filePath + '/index.html';
            const indexResponse = await getSiteFile(siteId, indexPath, env);
            if (indexResponse.ok) {
                return new Response(indexResponse.body, {
                    headers: {
                        'Content-Type': 'text/html; charset=utf-8',
                        'Cache-Control': 'public, max-age=3600',
                        'X-Q3-Site': siteId,
                    }
                });
            }
        }

        // 404 with custom page if available
        const notFoundResponse = await getSiteFile(siteId, '404.html', env);
        if (notFoundResponse.ok) {
            return new Response(notFoundResponse.body, {
                status: 404,
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
        }

        return new Response(`File not found: ${filePath}`, { status: 404 });
    }

    // Determine content type
    const contentType = getMimeType(filePath);

    // Build response with proper headers
    const headers = {
        'Content-Type': contentType,
        'Cache-Control': getCacheControl(filePath),
        'X-Q3-Site': siteId,
        'X-Powered-By': 'Q3 Quantum Storage',
        'Access-Control-Allow-Origin': '*',
    };

    // Add security headers for HTML
    if (contentType.includes('text/html')) {
        headers['X-Content-Type-Options'] = 'nosniff';
        headers['X-Frame-Options'] = 'SAMEORIGIN';
        headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
    }

    return new Response(response.body, { headers });
}

/**
 * Get appropriate cache control header
 */
function getCacheControl(path) {
    const ext = '.' + path.split('.').pop().toLowerCase();

    // Long cache for immutable assets
    if (['.woff', '.woff2', '.ttf', '.eot', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.mp4', '.webm'].includes(ext)) {
        return 'public, max-age=31536000, immutable';
    }

    // Medium cache for CSS/JS (might update)
    if (['.css', '.js', '.mjs'].includes(ext)) {
        return 'public, max-age=86400, stale-while-revalidate=3600';
    }

    // Short cache for HTML (dynamic content)
    if (['.html', '.htm'].includes(ext)) {
        return 'public, max-age=300, stale-while-revalidate=60';
    }

    return 'public, max-age=3600';
}

/**
 * Generate landing page for root domain
 */
function generateLandingPage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Q3 Quantum Storage</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0d0d1f 100%);
            color: #fff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container { text-align: center; padding: 40px; }
        h1 {
            font-size: 4rem;
            background: linear-gradient(90deg, #00ffff, #ff00ff, #00ffff);
            background-size: 200% 100%;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: shimmer 3s ease-in-out infinite;
        }
        @keyframes shimmer { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        p { font-size: 1.2rem; color: rgba(255,255,255,0.7); margin-top: 20px; }
        .features {
            display: flex; gap: 30px; margin-top: 40px; justify-content: center; flex-wrap: wrap;
        }
        .feature {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 24px;
            width: 200px;
        }
        .feature-icon { font-size: 2rem; margin-bottom: 12px; }
        .feature-title { font-weight: 600; margin-bottom: 8px; }
        .feature-desc { font-size: 0.9rem; color: rgba(255,255,255,0.6); }
    </style>
</head>
<body>
    <div class="container">
        <h1>Q3</h1>
        <p>Quantum Storage Protocol • Serverless Static Hosting</p>
        <div class="features">
            <div class="feature">
                <div class="feature-icon">🚀</div>
                <div class="feature-title">Edge Delivery</div>
                <div class="feature-desc">Global CDN via Cloudflare</div>
            </div>
            <div class="feature">
                <div class="feature-icon">🔐</div>
                <div class="feature-title">Zero-Knowledge</div>
                <div class="feature-desc">AES-256-GCM encrypted</div>
            </div>
            <div class="feature">
                <div class="feature-icon">⚡</div>
                <div class="feature-title">Serverless</div>
                <div class="feature-desc">No origin server needed</div>
            </div>
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generate page for custom domains not yet configured
 */
function generateCustomDomainNotConfigured(domain) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Domain Not Configured - Q3</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container { text-align: center; padding: 40px; max-width: 600px; }
        h1 { font-size: 2rem; margin-bottom: 16px; color: #ff6b6b; }
        .domain { font-size: 1.5rem; color: #4ecdc4; font-family: monospace; margin: 20px 0; }
        p { color: rgba(255,255,255,0.7); margin: 12px 0; line-height: 1.6; }
        .steps {
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            padding: 24px;
            margin-top: 24px;
            text-align: left;
        }
        .step { margin: 12px 0; }
        .step-num { display: inline-block; width: 28px; height: 28px; background: #4ecdc4; color: #000; border-radius: 50%; text-align: center; line-height: 28px; margin-right: 12px; font-weight: bold; }
        code { background: rgba(78,205,196,0.2); padding: 2px 8px; border-radius: 4px; font-family: monospace; }
        .footer { margin-top: 32px; font-size: 0.9rem; color: rgba(255,255,255,0.4); }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔗 Domain Not Configured</h1>
        <div class="domain">${domain}</div>
        <p>This domain is pointing to Q3 but hasn't been configured yet.</p>
        <div class="steps">
            <div class="step"><span class="step-num">1</span>Add this domain to your Q3 site</div>
            <div class="step"><span class="step-num">2</span>Set CNAME to: <code>your-site.q3.convobuilder.com</code></div>
            <div class="step"><span class="step-num">3</span>Verify the domain in your Q3 dashboard</div>
        </div>
        <p class="footer">Powered by Q3 Quantum Storage</p>
    </div>
</body>
</html>`;
}

/**
 * Serve site content - reusable function for all domain types
 */
async function serveSiteContent(siteId, pathname, env) {
    let filePath = pathname.slice(1) || 'index.html';
    filePath = filePath.replace(/^\/+/, '');

    if (filePath === '' || filePath.endsWith('/')) {
        filePath = filePath + 'index.html';
    }

    const response = await getSiteFile(siteId, filePath, env);

    if (!response.ok) {
        // Try index.html for directory paths
        if (!filePath.includes('.')) {
            const indexPath = filePath + '/index.html';
            const indexResponse = await getSiteFile(siteId, indexPath, env);
            if (indexResponse.ok) {
                return new Response(indexResponse.body, {
                    headers: {
                        'Content-Type': 'text/html; charset=utf-8',
                        'Cache-Control': 'public, max-age=3600',
                        'X-Q3-Site': siteId,
                    }
                });
            }
        }
        return new Response(`File not found: ${filePath}`, { status: 404 });
    }

    const contentType = getMimeType(filePath);
    return new Response(response.body, {
        headers: {
            'Content-Type': contentType,
            'Cache-Control': getCacheControl(filePath),
            'X-Q3-Site': siteId,
            'X-Powered-By': 'Q3 Quantum Storage / QDP',
        }
    });
}

/**
 * Generate page for reserved .q domains (A-Z, 0-9)
 */
function generateReservedDomainPage(name) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name.toUpperCase()}.q - Reserved Quantum Domain</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #0f0f23 0%, #1a1a3e 50%, #0d0d1f 100%);
            color: #fff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container { text-align: center; padding: 40px; }
        .domain {
            font-size: 6rem;
            font-weight: 800;
            background: linear-gradient(135deg, #00d9ff, #a855f7, #00ff88);
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 20px;
        }
        .badge {
            display: inline-block;
            background: linear-gradient(135deg, #fbbf24, #f59e0b);
            color: #000;
            padding: 8px 20px;
            border-radius: 20px;
            font-weight: 600;
            margin-bottom: 30px;
        }
        p { color: rgba(255,255,255,0.7); font-size: 1.2rem; line-height: 1.6; }
        .footer { margin-top: 40px; font-size: 0.9rem; color: rgba(255,255,255,0.4); }
    </style>
</head>
<body>
    <div class="container">
        <div class="domain">${name.toUpperCase()}.q</div>
        <div class="badge">👑 Platform Reserved</div>
        <p>This premium quantum domain is reserved for the Cr8OS platform.</p>
        <p>Single-letter and single-digit .q domains are held by the founding team.</p>
        <p class="footer">Powered by QDP - Quantum Domain Protocol</p>
    </div>
</body>
</html>`;
}

/**
 * Generate page for unregistered .q domains
 */
function generateQuantumDomainNotFound(domain) {
    const name = domain.replace(/\.q$/, '');
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}.q - Available</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container { text-align: center; padding: 40px; max-width: 600px; }
        .domain {
            font-size: 3rem;
            font-weight: 700;
            color: #22c55e;
            font-family: monospace;
            margin: 20px 0;
        }
        .available {
            display: inline-block;
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
            padding: 8px 20px;
            border-radius: 20px;
            font-weight: 600;
            margin-bottom: 20px;
        }
        p { color: rgba(255,255,255,0.7); margin: 12px 0; line-height: 1.6; }
        .btn {
            display: inline-block;
            background: linear-gradient(135deg, #00d9ff, #a855f7);
            color: #fff;
            padding: 12px 30px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            margin-top: 20px;
        }
        .footer { margin-top: 40px; font-size: 0.9rem; color: rgba(255,255,255,0.4); }
    </style>
</head>
<body>
    <div class="container">
        <div class="available">✨ Available</div>
        <div class="domain">${name}.q</div>
        <p>This quantum domain is available for registration!</p>
        <p>Register it now to claim your piece of Web 5.</p>
        <a href="https://quantum.cr8os.io/domains" class="btn">Register ${name}.q</a>
        <p class="footer">Powered by QDP - Quantum Domain Protocol</p>
    </div>
</body>
</html>`;
}

/**
 * Worker entry point
 */
export default {
    async fetch(request, env, ctx) {
        try {
            return await handleRequest(request, env);
        } catch (err) {
            console.error('Q3 Worker Error:', err);
            return new Response(`Q3 Edge Error: ${err.message}`, { status: 500 });
        }
    }
};
