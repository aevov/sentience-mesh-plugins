/**
 * Q3 Q3 Storage DS3 Transport
 * 
 * S3-compatible distributed storage via Q3 Storage:
 * - Geo-distributed shard storage
 * - Automatic redundancy
 * - Encryption at rest
 */

const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');

class Q3StorageTransport {
    constructor(config = {}) {
        this.config = {
            endpoint: config.endpoint || 'https://s3.Q3 Carrier.eu',
            region: config.region || 'eu-west-1',
            bucket: config.bucket || 'q3-quantum-storage',
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
            paths: config.paths || {
                shards: 'shards/',
                wasm: 'wasm-images/',
                metadata: 'metadata/'
            }
        };

        this.stats = {
            uploads: 0,
            downloads: 0,
            bytesUploaded: 0,
            bytesDownloaded: 0,
            errors: 0
        };
    }

    /**
     * Put shard to Q3 Storage
     */
    async putShard(shard) {
        const key = `${this.config.paths.shards}${shard.objectId}/${shard.shardId}`;

        const metadata = {
            'x-amz-meta-shard-id': shard.shardId,
            'x-amz-meta-object-id': shard.objectId,
            'x-amz-meta-index': String(shard.index),
            'x-amz-meta-hash': shard.hash,
            'x-amz-meta-size': String(shard.size)
        };

        await this._s3Put(key, shard.data, metadata);

        this.stats.uploads++;
        this.stats.bytesUploaded += shard.data.length;

        return {
            success: true,
            key,
            bucket: this.config.bucket,
            url: `${this.config.endpoint}/${this.config.bucket}/${key}`
        };
    }

    /**
     * Get shard from Q3 Storage
     */
    async getShard(shardId, objectId) {
        const key = `${this.config.paths.shards}${objectId}/${shardId}`;

        const { data, metadata } = await this._s3Get(key);

        this.stats.downloads++;
        this.stats.bytesDownloaded += data.length;

        return {
            shardId: metadata['x-amz-meta-shard-id'] || shardId,
            objectId: metadata['x-amz-meta-object-id'] || objectId,
            index: parseInt(metadata['x-amz-meta-index'] || '0'),
            hash: metadata['x-amz-meta-hash'],
            size: data.length,
            data
        };
    }

    /**
     * List shards for an object
     */
    async listShards(objectId) {
        const prefix = `${this.config.paths.shards}${objectId}/`;
        const objects = await this._s3List(prefix);

        return objects.map(obj => ({
            key: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified,
            shardId: obj.Key.split('/').pop()
        }));
    }

    /**
     * Delete shard
     */
    async deleteShard(shardId, objectId) {
        const key = `${this.config.paths.shards}${objectId}/${shardId}`;
        await this._s3Delete(key);
        return { success: true, key };
    }

    /**
     * Put WASM image
     */
    async putWasm(wasmName, data) {
        const key = `${this.config.paths.wasm}${wasmName}.wasm`;

        await this._s3Put(key, data, {
            'x-amz-meta-type': 'wasm-image',
            'x-amz-meta-name': wasmName,
            'Content-Type': 'application/wasm'
        });

        this.stats.uploads++;
        this.stats.bytesUploaded += data.length;

        return {
            success: true,
            key,
            url: `${this.config.endpoint}/${this.config.bucket}/${key}`
        };
    }

    // ==================== S3 PROTOCOL ====================

    /**
     * S3 PUT request
     */
    async _s3Put(key, data, headers = {}) {
        const url = new URL(`/${this.config.bucket}/${key}`, this.config.endpoint);

        const signedHeaders = this._signRequest('PUT', url.pathname, url.hostname, headers, data);

        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: url.hostname,
                port: 443,
                path: url.pathname,
                method: 'PUT',
                headers: {
                    ...signedHeaders,
                    'Content-Length': data.length,
                    'Content-Type': headers['Content-Type'] || 'application/octet-stream',
                    'Host': url.hostname
                }
            }, (res) => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ success: true });
                } else {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        this.stats.errors++;
                        reject(new Error(`S3 PUT failed: ${res.statusCode} - ${body}`));
                    });
                }
            });

            req.on('error', (e) => {
                this.stats.errors++;
                reject(e);
            });

            req.write(data);
            req.end();
        });
    }

    /**
     * S3 GET request
     */
    async _s3Get(key) {
        const url = new URL(`/${this.config.bucket}/${key}`, this.config.endpoint);

        const signedHeaders = this._signRequest('GET', url.pathname, url.hostname, {}, '');

        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: url.hostname,
                port: 443,
                path: url.pathname,
                method: 'GET',
                headers: {
                    ...signedHeaders,
                    'Host': url.hostname
                }
            }, (res) => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    const chunks = [];
                    res.on('data', chunk => chunks.push(chunk));
                    res.on('end', () => {
                        resolve({
                            data: Buffer.concat(chunks),
                            metadata: res.headers
                        });
                    });
                } else {
                    this.stats.errors++;
                    reject(new Error(`S3 GET failed: ${res.statusCode}`));
                }
            });

            req.on('error', (e) => {
                this.stats.errors++;
                reject(e);
            });

            req.end();
        });
    }

    /**
     * S3 LIST request
     */
    async _s3List(prefix) {
        const url = new URL(`/${this.config.bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}`, this.config.endpoint);

        const signedHeaders = this._signRequest('GET', url.pathname, url.hostname, {}, '');

        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: url.hostname,
                port: 443,
                path: url.pathname + url.search,
                method: 'GET',
                headers: {
                    ...signedHeaders,
                    'Host': url.hostname
                }
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        // Parse XML response (simplified)
                        const keys = [];
                        const keyMatches = body.matchAll(/<Key>([^<]+)<\/Key>/g);
                        const sizeMatches = body.matchAll(/<Size>([^<]+)<\/Size>/g);

                        const keyArray = [...keyMatches];
                        const sizeArray = [...sizeMatches];

                        for (let i = 0; i < keyArray.length; i++) {
                            keys.push({
                                Key: keyArray[i][1],
                                Size: parseInt(sizeArray[i]?.[1] || '0')
                            });
                        }

                        resolve(keys);
                    } else {
                        reject(new Error(`S3 LIST failed: ${res.statusCode}`));
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    /**
     * S3 DELETE request
     */
    async _s3Delete(key) {
        const url = new URL(`/${this.config.bucket}/${key}`, this.config.endpoint);

        const signedHeaders = this._signRequest('DELETE', url.pathname, url.hostname, {}, '');

        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: url.hostname,
                port: 443,
                path: url.pathname,
                method: 'DELETE',
                headers: {
                    ...signedHeaders,
                    'Host': url.hostname
                }
            }, (res) => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ success: true });
                } else {
                    reject(new Error(`S3 DELETE failed: ${res.statusCode}`));
                }
            });

            req.on('error', reject);
            req.end();
        });
    }

    /**
     * Sign S3 request (AWS Signature Version 4)
     */
    _signRequest(method, path, host, headers, payload = '') {
        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const dateStamp = amzDate.slice(0, 8);
        const service = 's3';
        const region = this.config.region;

        // Payload hash
        const payloadHash = crypto.createHash('sha256')
            .update(payload)
            .digest('hex');

        // Canonical headers
        const canonicalHeaders = [
            `host:${host}`,
            `x-amz-content-sha256:${payloadHash}`,
            `x-amz-date:${amzDate}`
        ].join('\n') + '\n';

        const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

        // Canonical request
        const canonicalRequest = [
            method,
            path,
            '', // query string
            canonicalHeaders,
            signedHeaders,
            payloadHash
        ].join('\n');

        // String to sign
        const algorithm = 'AWS4-HMAC-SHA256';
        const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
        const stringToSign = [
            algorithm,
            amzDate,
            credentialScope,
            crypto.createHash('sha256').update(canonicalRequest).digest('hex')
        ].join('\n');

        // Signing key
        const kDate = crypto.createHmac('sha256', `AWS4${this.config.secretAccessKey}`)
            .update(dateStamp).digest();
        const kRegion = crypto.createHmac('sha256', kDate)
            .update(region).digest();
        const kService = crypto.createHmac('sha256', kRegion)
            .update(service).digest();
        const kSigning = crypto.createHmac('sha256', kService)
            .update('aws4_request').digest();

        // Signature
        const signature = crypto.createHmac('sha256', kSigning)
            .update(stringToSign)
            .digest('hex');

        // Authorization header
        const authorization = `${algorithm} Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

        return {
            'x-amz-date': amzDate,
            'x-amz-content-sha256': payloadHash,
            'Authorization': authorization
        };
    }

    /**
     * Get transport statistics
     */
    getStats() {
        return { ...this.stats };
    }
}

module.exports = { Q3StorageTransport };
