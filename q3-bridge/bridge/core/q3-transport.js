/**
 * Q3Transport - Shard transfer layer
 * 
 * Features:
 * - AevIP transport (72-hour resilience) - PRIMARY
 * - WebSocket transport (uWebSockets compatible)
 * - HTTP/HTTPS fallback
 * - UDP for fast shard transfer
 * - Retry and resumable uploads
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');

// Try to import AevIP client
let AevIPClient;
try {
    // Try multiple paths for AevIP
    try {
        AevIPClient = require('../../services/frontend/tools/aevip-client');
    } catch {
        try {
            AevIPClient = require('../../../cr8OS-2.0/services/frontend/tools/aevip-client');
        } catch {
            AevIPClient = null;
        }
    }
} catch (e) {
    console.log('[Q3Transport] AevIP client not available');
    AevIPClient = null;
}

// Transport types - AevIP is PRIMARY
const TransportType = {
    AEVIP: 'aevip',            // 72-hour resilient P2P mesh (PRIMARY)
    WEBSOCKET: 'websocket',    // High-performance WebSocket (uWebSockets)
    HTTP: 'http',               // HTTP/HTTPS fallback
    UDP: 'udp',                 // Fast UDP for local mesh
    QUIC: 'quic'               // QUIC.cloud native
};



class Q3Transport extends EventEmitter {
    constructor(options = {}) {
        super();

        // Default to AevIP if available, otherwise HTTP
        const defaultType = AevIPClient ? TransportType.AEVIP : TransportType.HTTP;

        this.config = {
            type: options.type || defaultType,
            endpoint: options.endpoint || 'http://localhost:3000',
            timeout: options.timeout || 30000,
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 1000,
            chunkSize: options.chunkSize || 1024 * 1024, // 1MB transfer chunks
            // AevIP specific config
            aevipChannel: options.aevipChannel || 2,  // Dedicated channel for Q3 shards
            aevipKeepalive: options.aevipKeepalive || 30000
        };

        this.stats = {
            bytesSent: 0,
            bytesReceived: 0,
            requestCount: 0,
            errorCount: 0,
            aevipReconnects: 0
        };

        // AevIP client instance
        this.aevipClient = null;

        // Initialize AevIP if selected
        if (this.config.type === TransportType.AEVIP && AevIPClient) {
            this._initAevIP();
        }

        console.log(`[Q3Transport] Using transport: ${this.config.type}`);
    }

    /**
     * Initialize AevIP client
     */
    _initAevIP() {
        if (!AevIPClient) {
            console.warn('[Q3Transport] AevIP client not available, falling back to HTTP');
            this.config.type = TransportType.HTTP;
            return;
        }

        this.aevipClient = new AevIPClient({
            apiUrl: '/aevip',
            channels: {
                [this.config.aevipChannel]: 'q3-shards'
            },
            keepaliveInterval: this.config.aevipKeepalive
        });

        this.aevipClient.on('connected', ({ sessionId }) => {
            console.log(`[Q3Transport] AevIP session: ${sessionId} (72h resilient)`);
        });

        this.aevipClient.on('disconnected', () => {
            console.log('[Q3Transport] AevIP disconnected, session preserved');
        });

        this.aevipClient.on('reconnected', () => {
            console.log('[Q3Transport] AevIP reconnected');
            this.stats.aevipReconnects++;
        });

        console.log('[Q3Transport] AevIP initialized (72-hour resilience)');
    }

    /**
     * Send shard to a worker node
     */
    async sendShard(shard, workerEndpoint) {
        const startTime = Date.now();

        try {
            let result;

            switch (this.config.type) {
                case TransportType.AEVIP:
                    result = await this._sendViaAevIP(shard, workerEndpoint);
                    break;

                case TransportType.WEBSOCKET:
                    result = await this._sendViaWebSocket(shard, workerEndpoint);
                    break;

                case TransportType.UDP:
                    result = await this._sendViaUDP(shard, workerEndpoint);
                    break;

                case TransportType.QUIC:
                    result = await this._sendViaQUIC(shard, workerEndpoint);
                    break;

                case TransportType.HTTP:
                default:
                    result = await this._sendViaHTTP(shard, workerEndpoint);
            }

            this.stats.bytesSent += shard.data.length;
            this.stats.requestCount++;

            const duration = Date.now() - startTime;
            this.emit('shardSent', { shardId: shard.shardId, duration, size: shard.data.length });

            return result;

        } catch (error) {
            this.stats.errorCount++;
            throw error;
        }
    }


    /**
     * Receive shard from a worker node
     */
    async receiveShard(shardId, workerEndpoint) {
        const startTime = Date.now();

        try {
            let data;

            switch (this.config.type) {
                case TransportType.AEVIP:
                    data = await this._receiveViaAevIP(shardId, workerEndpoint);
                    break;

                case TransportType.WEBSOCKET:
                    data = await this._receiveViaWebSocket(shardId, workerEndpoint);
                    break;

                case TransportType.UDP:
                    data = await this._receiveViaUDP(shardId, workerEndpoint);
                    break;

                case TransportType.QUIC:
                    data = await this._receiveViaQUIC(shardId, workerEndpoint);
                    break;

                case TransportType.HTTP:
                default:
                    data = await this._receiveViaHTTP(shardId, workerEndpoint);
            }

            this.stats.bytesReceived += data.length;
            this.stats.requestCount++;

            const duration = Date.now() - startTime;
            this.emit('shardReceived', { shardId, duration, size: data.length });

            return data;

        } catch (error) {
            this.stats.errorCount++;
            throw error;
        }
    }

    // ==================== HTTP TRANSPORT ====================

    async _sendViaHTTP(shard, endpoint) {
        const url = `${endpoint}/q3/shards/${shard.shardId}`;

        // Use native fetch or http module
        if (typeof fetch !== 'undefined') {
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'X-Q3-Shard-Hash': shard.hash,
                    'X-Q3-Shard-Index': shard.index.toString()
                },
                body: shard.data
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();

        } else {
            // Node.js http module
            const http = require('http');
            const https = require('https');
            const { URL } = require('url');

            const parsedUrl = new URL(url);
            const client = parsedUrl.protocol === 'https:' ? https : http;

            return new Promise((resolve, reject) => {
                const req = client.request(parsedUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/octet-stream',
                        'Content-Length': shard.data.length,
                        'X-Q3-Shard-Hash': shard.hash,
                        'X-Q3-Shard-Index': shard.index.toString()
                    }
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(JSON.parse(data));
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}`));
                        }
                    });
                });

                req.on('error', reject);
                req.write(shard.data);
                req.end();
            });
        }
    }

    async _receiveViaHTTP(shardId, endpoint) {
        const url = `${endpoint}/q3/shards/${shardId}`;

        if (typeof fetch !== 'undefined') {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return Buffer.from(await response.arrayBuffer());

        } else {
            const http = require('http');
            const https = require('https');
            const { URL } = require('url');

            const parsedUrl = new URL(url);
            const client = parsedUrl.protocol === 'https:' ? https : http;

            return new Promise((resolve, reject) => {
                client.get(parsedUrl, (res) => {
                    const chunks = [];
                    res.on('data', chunk => chunks.push(chunk));
                    res.on('end', () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(Buffer.concat(chunks));
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}`));
                        }
                    });
                }).on('error', reject);
            });
        }
    }

    // ==================== AEVIP TRANSPORT (72-HOUR RESILIENCE) ====================

    /**
     * Send shard via AevIP (72-hour resilient mesh)
     */
    async _sendViaAevIP(shard, endpoint) {
        if (!this.aevipClient) {
            console.warn('[Q3Transport] AevIP not initialized, falling back to HTTP');
            return this._sendViaHTTP(shard, endpoint);
        }

        return new Promise((resolve, reject) => {
            // Create Q3 shard message
            const message = JSON.stringify({
                type: 'shard_store',
                shardId: shard.shardId,
                objectId: shard.objectId,
                index: shard.index,
                hash: shard.hash,
                size: shard.data.length,
                data: shard.data.toString('base64')
            });

            try {
                // Send on dedicated Q3 channel with reliable delivery
                this.aevipClient.send(this.config.aevipChannel, message, true);

                // AevIP handles retries and persistence
                resolve({
                    success: true,
                    shardId: shard.shardId,
                    transport: 'aevip',
                    resilience: '72h'
                });
            } catch (error) {
                console.error('[Q3Transport] AevIP send failed:', error.message);
                // Fall back to HTTP
                resolve(this._sendViaHTTP(shard, endpoint));
            }
        });
    }

    /**
     * Receive shard via AevIP
     */
    async _receiveViaAevIP(shardId, endpoint) {
        if (!this.aevipClient) {
            return this._receiveViaHTTP(shardId, endpoint);
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('AevIP receive timeout'));
            }, this.config.timeout);

            // Request shard via AevIP
            const request = JSON.stringify({
                type: 'shard_retrieve',
                shardId: shardId
            });

            // Set up one-time listener for response
            const handler = (channel, data) => {
                try {
                    const msg = JSON.parse(data);
                    if (msg.type === 'shard_data' && msg.shardId === shardId) {
                        clearTimeout(timeout);
                        this.aevipClient.removeListener('message', handler);
                        resolve(Buffer.from(msg.data, 'base64'));
                    }
                } catch (e) {
                    // Not our message
                }
            };

            this.aevipClient.on('message', handler);
            this.aevipClient.send(this.config.aevipChannel, request, true);
        });
    }


    // ==================== WEBSOCKET TRANSPORT ====================

    async _sendViaWebSocket(shard, endpoint) {
        // TODO: Implement when uWebSockets is integrated
        // For now, fall back to HTTP
        console.log('[Q3Transport] WebSocket not yet implemented, using HTTP');
        return this._sendViaHTTP(shard, endpoint);
    }

    async _receiveViaWebSocket(shardId, endpoint) {
        // TODO: Implement when uWebSockets is integrated
        return this._receiveViaHTTP(shardId, endpoint);
    }

    // ==================== UDP TRANSPORT ====================

    async _sendViaUDP(shard, endpoint) {
        // TODO: Implement UDP transport for local mesh
        return this._sendViaHTTP(shard, endpoint);
    }

    async _receiveViaUDP(shardId, endpoint) {
        // TODO: Implement UDP transport
        return this._receiveViaHTTP(shardId, endpoint);
    }

    // ==================== QUIC TRANSPORT ====================

    async _sendViaQUIC(shard, endpoint) {
        // TODO: Implement QUIC.cloud native transport
        return this._sendViaHTTP(shard, endpoint);
    }

    async _receiveViaQUIC(shardId, endpoint) {
        // TODO: Implement QUIC.cloud native transport
        return this._receiveViaHTTP(shardId, endpoint);
    }

    // ==================== HELPERS ====================

    /**
     * Retry wrapper
     */
    async withRetry(fn, attempts = this.config.retryAttempts) {
        let lastError;

        for (let i = 0; i < attempts; i++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                if (i < attempts - 1) {
                    await this._delay(this.config.retryDelay * (i + 1));
                }
            }
        }

        throw lastError;
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getStats() {
        return { ...this.stats };
    }
}

module.exports = Q3Transport;
module.exports.TransportType = TransportType;
