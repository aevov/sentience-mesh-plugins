/**
 * Q3 Client Auto-Discovery System
 * Uses Q3 Storage as rendezvous point for Q3 clients to discover urweb.xyz edge orbital
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Q3 Storage credentials for rendezvous registry
const Q3Storage_ENDPOINT = 'https://s3.Q3Storage.eu';
const Q3Storage_ACCESS_KEY = 'u4bi8wC839SUl0aZPBn/Cpw8wPWglXo7';
const Q3Storage_SECRET_KEY = '5GPCMUeE790r5JdLl0V4l9p4vb2R+8WjmsspQex+Bok=';
const REGISTRY_BUCKET = 'q3-client-registry';
const CLIENT_TTL = 300000; // 5 minutes

class Q3ClientDiscovery {
    constructor() {
        this.clientId = this.generateClientId();
        this.apiEndpoint = null;
        this.bidcConnected = false;
        this.pendingRequests = new Map();
        this.pingInterval = null;
    }

    generateClientId() {
        // Generate unique client ID based on machine info
        const machineId = crypto.randomBytes(16).toString('hex');
        return `q3-client-${machineId}`;
    }

    async registerWithQ3Storage() {
        console.log('[Q3 Discovery] Registering client with Q3 Storage rendezvous...');

        const clientInfo = {
            clientId: this.clientId,
            timestamp: Date.now(),
            ip: await this.getPublicIP(),
            port: 8082, // Bridge port
            capabilities: ['BIDC', 'AevIP-Q3', 'Sharding'],
            version: '2.0.0',
            status: 'awaiting_endpoint'
        };

        try {
            // Upload client info to Q3 Storage registry
            const AWS = require('aws-sdk');
            const s3 = new AWS.S3({
                endpoint: Q3Storage_ENDPOINT,
                accessKeyId: Q3Storage_ACCESS_KEY,
                secretAccessKey: Q3Storage_SECRET_KEY,
                s3ForcePathStyle: true,
                signatureVersion: 'v4'
            });

            await s3.putObject({
                Bucket: REGISTRY_BUCKET,
                Key: `clients/${this.clientId}.json`,
                Body: JSON.stringify(clientInfo, null, 2),
                ContentType: 'application/json',
                Metadata: {
                    'q3-discovery': 'true',
                    'ttl': String(Date.now() + CLIENT_TTL)
                }
            }).promise();

            console.log('[Q3 Discovery] ✅ Registered with Q3 Storage');
            console.log('[Q3 Discovery] Client ID:', this.clientId);
            console.log('[Q3 Discovery] Waiting for urweb.xyz to respond...');

            // Start polling for endpoint response
            this.pollForEndpoint();

        } catch (error) {
            console.error('[Q3 Discovery] ❌ Registration failed:', error.message);
            throw error;
        }
    }

    async pollForEndpoint() {
        const interval = setInterval(async () => {
            try {
                const AWS = require('aws-sdk');
                const s3 = new AWS.S3({
                    endpoint: Q3Storage_ENDPOINT,
                    accessKeyId: Q3Storage_ACCESS_KEY,
                    secretAccessKey: Q3Storage_SECRET_KEY,
                    s3ForcePathStyle: true,
                    signatureVersion: 'v4'
                });

                // Check if urweb.xyz has responded
                const response = await s3.getObject({
                    Bucket: REGISTRY_BUCKET,
                    Key: `responses/${this.clientId}.json`
                }).promise();

                const apiInfo = JSON.parse(response.Body.toString());

                if (apiInfo.endpoint) {
                    clearInterval(interval);

                    // Force IP if hostname is returned but known to be proxied
                    if (apiInfo.endpoint.includes('urweb.xyz')) {
                        apiInfo.endpoint = apiInfo.endpoint.replace('urweb.xyz', '172.233.130.112');
                        console.log('[Q3 Discovery] Mapping hostname to direct IP for stability');
                    }

                    console.log('[Q3 Discovery] ✅ Received API endpoint from urweb.xyz!');
                    console.log('[Q3 Discovery] Endpoint:', apiInfo.endpoint);

                    this.apiEndpoint = apiInfo.endpoint;
                    this.establishBIDC(apiInfo);
                }

            } catch (error) {
                if (error.code !== 'NoSuchKey') {
                    console.error('[Q3 Discovery] Poll error:', error.message);
                }
                // NoSuchKey means urweb.xyz hasn't responded yet, keep polling
            }
        }, 2000); // Poll every 2 seconds

        // Timeout after 60 seconds
        setTimeout(() => {
            if (!this.apiEndpoint) {
                clearInterval(interval);
                console.error('[Q3 Discovery] ⏱️  Timeout waiting for urweb.xyz response');
            }
        }, 60000);
    }

    async establishBIDC(apiInfo) {
        console.log('[Q3 Discovery] Establishing BIDC connection...');

        try {
            // Import WebSocket for BIDC connection
            const WebSocket = require('ws');

            // Construct proper BIDC URL - use direct IP to bypass QUIC.cloud issues
            let bidcUrl = apiInfo.bidcUrl;
            if (!bidcUrl || bidcUrl.includes('urweb.xyz')) {
                // Force direct IP for BIDC to avoid CDN/Proxy issues
                bidcUrl = `ws://172.233.130.112:8085`;
            }
            console.log('[Q3 Discovery] Connecting to:', bidcUrl);

            const ws = new WebSocket(bidcUrl);

            ws.on('open', () => {
                console.log('[Q3 Discovery] ✅ BIDC connection established!');
                this.bidcConnected = true;

                ws.send(JSON.stringify({
                    type: 'handshake',
                    clientId: this.clientId,
                    protocol: 'AevIP-Q3',
                    version: '2.0.0'
                }));

                // Start heartbeat
                this.startHeartbeat();
            });

            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    console.log('[Q3 BIDC] Received:', message.type);
                    this.handleBIDCMessage(message.type, message);
                } catch (error) {
                    console.error('[Q3 BIDC] Message parse error:', error);
                }
            });

            ws.on('error', (error) => {
                console.error('[Q3 BIDC] Error:', error.message);
            });

            ws.on('close', () => {
                console.log('[Q3 BIDC] Connection closed');
                this.bidcConnected = false;
            });

            // Save WebSocket instance
            this.bidc = ws;

            // Save endpoint configuration locally
            this.saveEndpointConfig(apiInfo);

        } catch (error) {
            console.error('[Q3 Discovery] ❌ BIDC setup failed:', error.message);
            console.log('[Q3 Discovery] Falling back to HTTP endpoint...');
            this.saveEndpointConfig(apiInfo);
        }
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.pingInterval = setInterval(() => {
            if (this.bidc && this.bidc.readyState === 1) {
                // Keep the tunnel open with periodic pings
                this.bidc.send(JSON.stringify({
                    type: 'ping',
                    clientId: this.clientId,
                    timestamp: Date.now()
                }));
            }
        }, 10000); // 10s heartbeat
    }

    stopHeartbeat() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    handleBIDCMessage(type, data) {
        switch (type) {
            case 'welcome':
                console.log('[Q3 BIDC] Welcome from orbital:', data.endpoint);
                break;

            case 'endpoint_update':
                console.log('[Q3 BIDC] Endpoint updated:', data.endpoint);
                this.apiEndpoint = data.endpoint;
                this.saveEndpointConfig(data);
                break;

            case 'ping':
                if (this.bidc && this.bidc.readyState === 1) {
                    this.bidc.send(JSON.stringify({
                        type: 'pong',
                        clientId: this.clientId,
                        timestamp: Date.now()
                    }));
                }
                break;

            case 'command_response':
                const requestId = data.requestId;
                if (this.pendingRequests.has(requestId)) {
                    const { resolve, timer } = this.pendingRequests.get(requestId);
                    clearTimeout(timer);
                    this.pendingRequests.delete(requestId);
                    resolve(data.result);
                }
                break;

            default:
                console.log('[Q3 BIDC] Unknown message type:', type);
        }
    }

    async executeCommand(command, args = [], backend = 'q3') {
        if (!this.bidcConnected || !this.bidc || this.bidc.readyState !== 1) {
            throw new Error('BIDC not connected');
        }

        const requestId = crypto.randomBytes(8).toString('hex');
        const payload = {
            type: 'execute',
            requestId,
            command,
            args,
            backend
        };

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    reject(new Error('BIDC command timeout'));
                }
            }, 10000); // 10s command timeout over BIDC

            this.pendingRequests.set(requestId, { resolve, reject, timer });
            this.bidc.send(JSON.stringify(payload));
        });
    }

    saveEndpointConfig(apiInfo) {
        const config = {
            clientId: this.clientId,
            endpoint: apiInfo.endpoint,
            bidcUrl: apiInfo.bidcUrl,
            timestamp: Date.now(),
            ttl: apiInfo.ttl || CLIENT_TTL
        };

        const configPath = path.join(__dirname, '.q3-endpoint.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('[Q3 Discovery] ✅ Endpoint config saved to .q3-endpoint.json');
    }

    async getPublicIP() {
        try {
            const https = require('https');
            return new Promise((resolve) => {
                https.get('https://api.ipify.org?format=json', (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        const ip = JSON.parse(data).ip;
                        resolve(ip);
                    });
                }).on('error', () => resolve('unknown'));
            });
        } catch {
            return 'unknown';
        }
    }

    static loadEndpointConfig() {
        const configPath = path.join(__dirname, '.q3-endpoint.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

            // Check if config is still valid (not expired)
            if (Date.now() < config.timestamp + config.ttl) {
                console.log('[Q3 Discovery] Using cached endpoint:', config.endpoint);
                return config;
            } else {
                console.log('[Q3 Discovery] Cached endpoint expired');
            }
        }
        return null;
    }
}

// Auto-run discovery on first load
async function initializeQ3Discovery() {
    const discovery = new Q3ClientDiscovery();

    // Check for cached endpoint first
    const cachedConfig = Q3ClientDiscovery.loadEndpointConfig();

    if (cachedConfig) {
        console.log('[Q3 Discovery] Using cached endpoint');
        discovery.apiEndpoint = cachedConfig.endpoint;
        // Still establish BIDC for real-time updates
        discovery.establishBIDC(cachedConfig);
    } else {
        // No cached endpoint, register with Q3 Storage
        await discovery.registerWithQ3Storage();
    }

    return discovery;
}

module.exports = { Q3ClientDiscovery, initializeQ3Discovery };

// Auto-init if run directly
if (require.main === module) {
    initializeQ3Discovery().catch(console.error);
}
