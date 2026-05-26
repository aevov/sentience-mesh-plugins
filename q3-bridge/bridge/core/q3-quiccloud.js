/**
 * Q3 QUIC.cloud CDN Integration
 * 
 * Multi-domain edge caching for Q3 shards via QUIC.cloud:
 * - app.convobuilder.com: Q3 API endpoints
 * - urweb.xyz: File downloads
 * - rate.convobuilder.com: Rate-limited endpoints
 * - usaxdreryerjejfdc-rep.convobuilder.com: Shard replication
 */

const https = require('https');
const crypto = require('crypto');

class QuicCloudTransport {
    constructor(config = {}) {
        // Multi-domain configuration
        this.domains = config.domains || [
            { domain: 'app.convobuilder.com', id: '4386449', key: '76E09E3F1EA64A4C0507B45A6DDCA4F5', purpose: 'api' }
        ];

        // Primary domain (for backward compatibility)
        this.config = {
            domain: config.primary?.domain || config.domain || 'app.convobuilder.com',
            domainId: config.primary?.domainId || config.domainId || '4386449',
            domainKey: config.primary?.domainKey || config.domainKey,
            apiEndpoint: config.apiEndpoint || 'https://api.quic.cloud/v1',

            // Download domain
            downloadDomain: config.downloads?.domain || 'urweb.xyz',
            downloadKey: config.downloads?.domainKey || '0A8A24C782778143224D2EAD8C1E7437',

            cache: config.cache || {
                shardTTL: 3600,
                wasmTTL: 86400,
                metadataTTL: 60,
                downloadTTL: 86400
            },

            cdn: config.cdn || {
                shardPath: '/q3/shard/',
                wasmPath: '/q3/wasm/',
                metadataPath: '/q3/meta/',
                downloadPath: '/download/'
            },

            origin: config.origin || {
                host: '172.233.130.112',
                port: 7433,
                protocol: 'https'
            }
        };

        this.stats = {
            cacheHits: 0,
            cacheMisses: 0,
            purges: 0,
            errors: 0
        };
    }

    /**
     * Get CDN URL for a shard (primary domain)
     */
    getShardUrl(shardId, objectId) {
        return `https://${this.config.domain}${this.config.cdn.shardPath}${objectId}/${shardId}`;
    }

    /**
     * Get CDN URL for WASM image (primary domain)
     */
    getWasmUrl(wasmName) {
        return `https://${this.config.domain}${this.config.cdn.wasmPath}${wasmName}.wasm`;
    }

    /**
     * Get download URL for a file (urweb.xyz)
     */
    getDownloadUrl(filename) {
        return `https://${this.config.downloadDomain}${this.config.cdn.downloadPath}${filename}`;
    }

    /**
     * Get URL for specific domain purpose
     */
    getUrlByPurpose(purpose, path) {
        const domainConfig = this.domains.find(d => d.purpose === purpose);
        if (!domainConfig) {
            console.warn(`[QuicCloud] No domain found for purpose: ${purpose}, using primary`);
            return `https://${this.config.domain}${path}`;
        }
        return `https://${domainConfig.domain}${path}`;
    }

    /**
     * Get all CDN URLs for a shard (for replication)
     */
    getAllShardUrls(shardId, objectId) {
        const path = `${this.config.cdn.shardPath}${objectId}/${shardId}`;
        return this.domains.map(d => ({
            domain: d.domain,
            purpose: d.purpose,
            url: `https://${d.domain}${path}`
        }));
    }


    /**
     * Purge shard from cache
     */
    async purgeShard(shardId, objectId) {
        const url = this.getShardUrl(shardId, objectId);
        return this._purgeUrl(url);
    }

    /**
     * Purge WASM image from cache
     */
    async purgeWasm(wasmName) {
        const url = this.getWasmUrl(wasmName);
        return this._purgeUrl(url);
    }

    /**
     * Purge URL from QUIC.cloud cache
     */
    async _purgeUrl(url) {
        const apiUrl = `${this.config.apiEndpoint}/purge`;

        const payload = JSON.stringify({
            domain_id: this.config.domainId,
            urls: [url]
        });

        const signature = this._signRequest(payload);

        return new Promise((resolve, reject) => {
            const parsed = new URL(apiUrl);

            const req = https.request({
                hostname: parsed.hostname,
                port: 443,
                path: parsed.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                    'X-QUIC-Domain-Key': this.config.domainKey,
                    'X-QUIC-Signature': signature
                }
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        this.stats.purges++;
                        resolve({ success: true, purged: [url] });
                    } else {
                        this.stats.errors++;
                        reject(new Error(`QUIC.cloud purge failed: ${res.statusCode} - ${body}`));
                    }
                });
            });

            req.on('error', (e) => {
                this.stats.errors++;
                reject(e);
            });

            req.write(payload);
            req.end();
        });
    }

    /**
     * Get cache rules for Q3
     */
    getCacheRules() {
        return [
            {
                name: 'Q3 Shards',
                path: this.config.cdn.shardPath + '*',
                ttl: this.config.cache.shardTTL,
                cacheControl: `public, max-age=${this.config.cache.shardTTL}`,
                headers: {
                    'X-Q3-Type': 'shard',
                    'X-Q3-Cache': 'enabled'
                }
            },
            {
                name: 'Q3 WASM Images',
                path: this.config.cdn.wasmPath + '*',
                ttl: this.config.cache.wasmTTL,
                cacheControl: `public, max-age=${this.config.cache.wasmTTL}`,
                headers: {
                    'X-Q3-Type': 'wasm',
                    'X-Q3-Cache': 'enabled'
                }
            },
            {
                name: 'Q3 Metadata',
                path: this.config.cdn.metadataPath + '*',
                ttl: this.config.cache.metadataTTL,
                cacheControl: `public, max-age=${this.config.cache.metadataTTL}`,
                headers: {
                    'X-Q3-Type': 'metadata',
                    'X-Q3-Cache': 'enabled'
                }
            },
            {
                name: 'ACLDQ AVIF',
                path: '/acldq/*.avif',
                ttl: 86400,  // 24 hours for AVIF comparison files
                cacheControl: 'public, max-age=86400',
                headers: {
                    'X-ACLDQ-Type': 'comparison',
                    'Content-Type': 'image/avif'
                }
            }
        ];
    }

    /**
     * Generate .htaccess rules for LiteSpeed/QUIC.cloud
     */
    getHtaccessRules() {
        return `
# Q3 Cache Rules for QUIC.cloud
# Generated by Q3 Storage System

# Enable QUIC.cloud caching for Q3 shards
<IfModule LiteSpeed>
    # Q3 Shard Cache - 1 hour
    <FilesMatch "^${this.config.cdn.shardPath.replace(/\//g, '\\/')}.*">
        CacheControl "public, max-age=${this.config.cache.shardTTL}"
        Header set X-Q3-Cache "edge"
    </FilesMatch>
    
    # Q3 WASM Cache - 24 hours
    <FilesMatch "^${this.config.cdn.wasmPath.replace(/\//g, '\\/')}.*\\.wasm$">
        CacheControl "public, max-age=${this.config.cache.wasmTTL}"
        Header set X-Q3-Type "wasm"
    </FilesMatch>
    
    # ACLDQ AVIF - 24 hours
    <FilesMatch "\\.avif$">
        CacheControl "public, max-age=86400"
        Header set Content-Type "image/avif"
    </FilesMatch>
</IfModule>

# Vary header for CDN
Header set Vary "Accept-Encoding"

# CORS for Q3 API
<IfModule mod_headers.c>
    Header set Access-Control-Allow-Origin "*"
    Header set Access-Control-Allow-Methods "GET, POST, OPTIONS"
    Header set Access-Control-Allow-Headers "Content-Type, X-Q3-Token"
</IfModule>
`;
    }

    /**
     * Sign API request
     */
    _signRequest(payload) {
        return crypto
            .createHmac('sha256', this.config.domainKey)
            .update(payload)
            .digest('hex');
    }

    /**
     * Get transport statistics
     */
    getStats() {
        return { ...this.stats };
    }
}

module.exports = { QuicCloudTransport };
