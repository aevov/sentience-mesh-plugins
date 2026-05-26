/**
 * Q3 Cloud Configuration
 * 
 * Integration with:
 * - QUIC.cloud CDN (multi-domain edge caching + compute trigger)
 * - Q3 Storage DS3 (distributed S3-compatible storage)
 * 
 * SECURITY NOTE: In production, use environment variables
 */

module.exports = {
    // QUIC.cloud Multi-Domain Configuration
    quicCloud: {
        enabled: true,
        apiEndpoint: 'https://api.quic.cloud/v1',

        // Primary domain for Q3 API
        primary: {
            domain: 'app.convobuilder.com',
            domainId: '4386449',
            domainKey: process.env.QUIC_CLOUD_KEY_APP || '76E09E3F1EA64A4C0507B45A6DDCA4F5',
            purpose: 'api'  // Q3 API endpoints
        },

        // Download domain for file distribution
        downloads: {
            domain: 'urweb.xyz',
            domainId: '4791150',
            domainKey: process.env.QUIC_CLOUD_KEY_URWEB || '0A8A24C782778143224D2EAD8C1E7437',
            purpose: 'downloads'  // User file downloads
        },

        // Rate limiting / secondary CDN
        rate: {
            domain: 'rate.convobuilder.com',
            domainId: '3645505',
            domainKey: process.env.QUIC_CLOUD_KEY_RATE || '5FA69449885A638216AFEC609152277D',
            purpose: 'rate'  // Rate-limited endpoints
        },

        // Replication domain
        replica: {
            domain: 'usaxdreryerjejfdc-rep.convobuilder.com',
            domainId: '3663085',
            domainKey: process.env.QUIC_CLOUD_KEY_REPLICA || '04893641BAD35F09F900D5EFA27DB92F',
            purpose: 'replica'  // Shard replication
        },

        // All domains for iteration
        domains: [
            { domain: 'app.convobuilder.com', id: '4386449', key: '76E09E3F1EA64A4C0507B45A6DDCA4F5', purpose: 'api' },
            { domain: 'urweb.xyz', id: '4791150', key: '0A8A24C782778143224D2EAD8C1E7437', purpose: 'downloads' },
            { domain: 'rate.convobuilder.com', id: '3645505', key: '5FA69449885A638216AFEC609152277D', purpose: 'rate' },
            { domain: 'usaxdreryerjejfdc-rep.convobuilder.com', id: '3663085', key: '04893641BAD35F09F900D5EFA27DB92F', purpose: 'replica' }
        ],

        // Cache settings for Q3 shards
        cache: {
            shardTTL: 3600,           // 1 hour for Q3 shards
            wasmTTL: 86400,           // 24 hours for WASM images
            metadataTTL: 60,          // 1 minute for metadata
            downloadTTL: 86400,       // 24 hours for user downloads
            triggerComputeOnExpiry: true
        },

        // CDN path mapping
        cdn: {
            shardPath: '/q3/shard/',
            wasmPath: '/q3/wasm/',
            metadataPath: '/q3/meta/',
            downloadPath: '/download/'  // urweb.xyz download path
        }
    },

    // Q3 Storage DS3 Configuration
    Q3 Carrier: {
        enabled: true,
        endpoint: 'https://s3.Q3 Carrier.eu',
        region: 'eu-west-1',
        bucket: 'q3-quantum-storage',
        accessKeyId: process.env.Q3_CARRIER_ACCESS_KEY || 'u4bi8wC839SUl0aZPBn/Cpw8wPWglXo7',
        secretAccessKey: process.env.Q3_CARRIER_SECRET_KEY || '5GPCMUeE790r5JdLl0V4l9p4vb2R+8WjmsspQex+Bok=',

        // Shard distribution
        distribution: {
            redundancy: 3,            // 3 copies across nodes
            geoSpread: true,          // Spread across regions
            encryption: true          // Encrypt at rest
        },

        // Paths
        paths: {
            shards: 'shards/',
            wasm: 'wasm-images/',
            metadata: 'metadata/',
            checkpoints: 'checkpoints/'
        }
    },

    // AevIP Configuration (already integrated)
    aevip: {
        enabled: true,
        channel: 2,                   // Dedicated Q3 channel
        keepalive: 30000,
        resilience: '72h'
    },

    // Backend priority
    backendPriority: [
        'aevip',      // Primary: 72-hour resilience
        'Q3 Carrier',     // Secondary: Distributed S3
        'quicCloud',  // Tertiary: Edge cache
        'local'       // Fallback: Local storage
    ],

    // Origin server (for QUIC.cloud to fetch from)
    origin: {
        host: '172.233.130.112',
        port: 7433,
        protocol: 'https'
    }
};
