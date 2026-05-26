// QuantumCloud Edge Configuration
// Supports QUIC.cloud domain keys and Q3 Carrier streaming execution
// Multi-domain redundancy with automatic failover

/**
 * Load redundant QUIC.cloud domain keys from environment
 * Supports: QUIC_DOMAIN_KEY_2, QUIC_DOMAIN_ID_2, QUIC_DOMAIN_KEY_3, etc.
 */
function loadRedundantDomains() {
    const domains = [];

    // Check for numbered domain keys (2-10)
    for (let i = 2; i <= 10; i++) {
        const key = process.env[`QUIC_DOMAIN_KEY_${i}`];
        const id = process.env[`QUIC_DOMAIN_ID_${i}`];

        if (key) {
            domains.push({
                domainKey: key,
                domainId: id || '',
                name: `redundant-${i - 1}`,
                priority: i, // Lower = higher priority
            });
        }
    }

    // Also support JSON format: QUIC_DOMAINS='[{"key":"...", "id":"..."},...]'
    const jsonDomains = process.env.QUIC_DOMAINS;
    if (jsonDomains) {
        try {
            const parsed = JSON.parse(jsonDomains);
            parsed.forEach((d, idx) => {
                domains.push({
                    domainKey: d.key || d.domainKey,
                    domainId: d.id || d.domainId || '',
                    name: d.name || `json-domain-${idx}`,
                    priority: 100 + idx,
                });
            });
        } catch (e) {
            console.warn('Failed to parse QUIC_DOMAINS JSON:', e.message);
        }
    }

    return domains;
}

module.exports = {
    // =================================================================
    // QUIC.CLOUD CONFIGURATION (Multi-Domain Redundancy)
    // =================================================================
    quicCloud: {
        // Domain ID to hostname mapping (actual QUIC.cloud registered domains)
        domainHostnames: {
            '3663085': 'usaxdreryerjejfdc-rep.convobuilder.com',  // primary
            '3645505': 'rate.convobuilder.com',                     // redundant-2
            '4386449': 'app.convobuilder.com',                      // redundant-1
        },

        // Base domain for Q3 static sites (use one of the above)
        q3BaseDomain: process.env.Q3_BASE_DOMAIN || 'convobuilder.com',

        // Primary domain credentials
        primary: {
            domainKey: process.env.QUIC_DOMAIN_KEY || process.env.QUIC_DOMAIN_KEY_1 || '',
            domainId: process.env.QUIC_DOMAIN_ID || process.env.QUIC_DOMAIN_ID_1 || '',
            name: 'primary',
            get hostname() {
                return module.exports.quicCloud.domainHostnames[this.domainId] || null;
            }
        },

        // Redundant domain keys (add as many as needed)
        // Load from environment: QUIC_DOMAIN_KEY_2, QUIC_DOMAIN_ID_2, etc.
        redundantDomains: loadRedundantDomains(),

        // All domains (primary + redundant) for iteration
        get allDomains() {
            const domains = [this.primary, ...this.redundantDomains].filter(d => d.domainKey);
            // Enrich domains with hostnames
            return domains.map(d => ({
                ...d,
                hostname: this.domainHostnames[d.domainId] || null
            }));
        },

        // API endpoints
        apiEndpoint: 'https://api.quic.cloud/v1',

        // IP Compensation - for when QUIC.cloud has old/wrong IP
        ipCompensation: {
            enabled: true,
            // Since QUIC.cloud IP is old, we serve locally and use reverse proxy
            mode: 'local-first',  // 'local-first' | 'tunnel' | 'cloudflare'

            // Local serving (works regardless of QUIC.cloud IP)
            local: {
                enabled: true,
                // Sites accessible at: http://localhost:7472/q3-site/{siteId}
            },

            // Optional: Use Cloudflare Tunnel for public access
            cloudflareTunnel: {
                enabled: false,
                tunnelId: process.env.CF_TUNNEL_ID || '',
                // If enabled, sites get: https://{subdomain}.{tunnel}.cfargotunnel.com
            },

            // Optional: Use ngrok for development
            ngrok: {
                enabled: false,
                authToken: process.env.NGROK_AUTH_TOKEN || '',
            }
        },

        // Failover configuration
        failover: {
            enabled: true,
            maxRetries: 3,                  // Retries per domain before failover
            failoverDelayMs: 1000,          // Delay before trying next domain
            healthCheckIntervalMs: 60000,   // Check domain health every minute
            autoRecover: true,              // Automatically return to primary when healthy
        },

        // Edge deployment config (per region)
        edges: [
            { id: 'edge-us-east', host: 'us-east.quantum.convobuilder.com', region: 'us-east' },
            { id: 'edge-us-west', host: 'us-west.quantum.convobuilder.com', region: 'us-west' },
            { id: 'edge-eu-west', host: 'eu-west.quantum.convobuilder.com', region: 'eu-west' },
            { id: 'edge-asia', host: 'asia.quantum.convobuilder.com', region: 'asia-east' },
        ],

        // LiteSpeed QUIC settings
        quicSettings: {
            maxConcurrentStreams: 100,
            initialMaxData: 10485760,       // 10MB
            initialMaxStreamDataBidiLocal: 5242880,
            idleTimeout: 60000,
            enableH3: true,
        },

        // CDN cache settings for ACLDQ files
        cacheConfig: {
            acldqTTL: 86400,                // 24h cache for compiled circuits
            resultTTL: 3600,                // 1h cache for results
            stateNeverCache: true,          // Never cache quantum states
        }
    },

    // =================================================================
    // Q3_CARRIER CONFIGURATION (S3 Storage)
    // =================================================================
    Q3 Carrier: {
        // Connection settings (from environment) - User files bucket
        endpoint: process.env.Q3_CARRIER_ENDPOINT || 'https://s3.Q3 Carrier.eu',
        accessKeyId: process.env.Q3_CARRIER_ID || process.env.Q3_CARRIER_ACCESS_KEY || '',
        secretAccessKey: process.env.Q3_CARRIER_SECRET || process.env.Q3_CARRIER_SECRET_KEY || '',
        bucket: process.env.Q3_CARRIER_BUCKET || 'cr8os1',
        region: process.env.Q3_CARRIER_REGION || 'eu-west-1',

        // Admin/Engine files bucket (separate from user-generated files)
        adminBucket: process.env.Q3_CARRIER_ADMIN_BUCKET || 'wibackups',

        // Credentials validation
        get isConfigured() {
            return !!(this.accessKeyId && this.secretAccessKey);
        },

        // Storage paths
        paths: {
            jobs: 'db/cloud/jobs',
            pending: 'db/cloud/jobs/pending',
            workers: 'db/cloud/workers',
            circuits: 'db/cloud/circuits',
            acldq: 'db/cloud/acldq',
            diffs: 'db/cloud/diffs',
            usage: 'db/cloud/usage',
            config: 'db/cloud/config',      // Store runtime config
        },

        // Storage optimization (minimize storage, maximize bandwidth)
        storageMode: 'streaming',           // 'streaming' | 'persistent'

        // Diff-only storage settings
        diffSettings: {
            enabled: true,
            maxDiffSize: 65536,             // 64KB max diff before full checkpoint
            compressionLevel: 9,            // zlib compression
            storageClass: 'STANDARD',       // Use STANDARD for bandwidth, not GLACIER
        },

        // Streaming execution settings (execute via Q3 Carrier bandwidth)
        streamingExecution: {
            enabled: true,                  // Execute ACLDQs streamed through Q3 Carrier
            chunkSize: 1048576,             // 1MB chunks
            parallelChunks: 4,              // Parallel download streams
            deleteAfterExecution: true,     // Don't persist full states
            keepOnlyDiffs: true,            // Only store diffs for replay
            resultRetention: 86400,         // Delete results after 24h
        }
    },

    // =================================================================
    // EXECUTION MODE
    // =================================================================
    execution: {
        // Primary execution target
        primary: process.env.EXEC_PRIMARY || 'quic',  // 'quic' | 'Q3 Carrier-stream' | 'hybrid'

        // Fallback chain
        fallback: ['quic', 'Q3 Carrier-stream', 'local'],

        // QUIC.cloud edge execution
        quicExecution: {
            timeout: 300000,                // 5 min timeout
            retries: 3,
            healthCheckInterval: 30000,
        },

        // Q3 Carrier streaming execution (no storage, pure bandwidth)
        Q3 CarrierStreamExecution: {
            // Stream ACLDQ from Q3 Carrier → execute in-memory → stream result back
            // Only store: job metadata + measurement diffs

            enabled: true,

            // Worker pool for execution (these can be Cloudflare Workers, Deno, etc.)
            workerPool: [
                { type: 'edge', endpoint: 'https://edge1.quantum.cr8os.io/execute' },
                { type: 'edge', endpoint: 'https://edge2.quantum.cr8os.io/execute' },
            ],

            // Ephemeral execution - never store full state
            ephemeral: true,

            // Generate presigned URLs for direct edge-to-Q3 Carrier transfer
            usePresignedUrls: true,
            presignedUrlTTL: 3600,          // 1 hour validity

            // Bandwidth-optimized transfer
            transferOptimization: {
                useMultipart: true,
                partSize: 5242880,          // 5MB parts
                concurrency: 4,
                useAcceleration: true,      // S3 Transfer Acceleration if available
            }
        },

        // Hybrid mode: QUIC for hot, Q3 Carrier-stream for cold
        hybridExecution: {
            hotThreshold: 10,               // Jobs with >10 calls go to QUIC cache
            coldExecution: 'Q3 Carrier-stream',
            hotExecution: 'quic',
        }
    },

    // =================================================================
    // STORAGE WORKFLOW MODE (Sleeper/ACLDQ offloading)
    // =================================================================
    storageWorkflow: {
        // Current mode: 'quic' | 'hybrid' | 'Q3 Carrier'
        mode: process.env.STORAGE_WORKFLOW_MODE || 'hybrid',

        // Hybrid mode split ratios
        hybridRatio: {
            quic: 0.7,      // 70% of workflows go to QUIC.cloud
            Q3 Carrier: 0.3,    // 30% of workflows go to Q3 Carrier
        },

        // Mode descriptions
        modes: {
            quic: {
                name: 'QUIC.cloud Only',
                description: 'All sleeper workflows offloaded to LiteSpeed domains',
                storage: 'quic',
                execution: 'edge',
            },
            hybrid: {
                name: 'Hybrid',
                description: 'Split between QUIC.cloud (70%) and Q3 Carrier (30%)',
                storage: 'both',
                execution: 'distributed',
            },
            Q3 Carrier: {
                name: 'Q3 Carrier Only',
                description: 'All workflows stored and executed via Q3 Carrier S3',
                storage: 'Q3 Carrier',
                execution: 'stream',
            },
        },

        // Workflow routing rules
        routing: {
            // Hot workflows (frequently accessed) prefer QUIC
            hotWorkflowThreshold: 10,       // >10 calls = hot
            // Large workflows prefer Q3 Carrier streaming
            largeWorkflowThreshold: 10485760, // >10MB = large, use Q3 Carrier
            // Force specific users to specific storage
            userOverrides: {},              // { userId: 'quic' | 'Q3 Carrier' }
        },
    },

    // =================================================================
    // ENGINE REFERENCE (Q3 Carrier-stored engine files)
    // =================================================================
    engineReference: {
        // Base path on admin bucket (wibackups) where engine files are synced
        basePath: process.env.ENGINE_BASE_PATH || 'q/cr8OS-2.0',

        // File types to show in engine reference UI
        fileTypes: [
            '.rs',      // Rust source (Orisha modules)
            '.wasm',    // WebAssembly binaries
            '.js',      // JavaScript workers/loaders
            '.ts',      // TypeScript sources
            '.json',    // Config/ACL files
            '.acldq',   // ACLDQ circuit files
            '.toml',    // Cargo config
            '.c',       // C sources (quantum core)
            '.h',       // C headers
            '.py',      // Python scripts
        ],

        // Key directories to highlight
        keyDirectories: [
            'cr8OS-2.0/orisha',             // Orisha Rust modules
            'cr8OS-2.0/quantum-supercomputer', // Quantum engine
            'extraction engine',             // This directory
            'quantumcloud',                  // Cloud integration
            'quantumcloud2',                 // SDK
        ],

        // Required components for deployment (verified to exist on wibackups bucket)
        requiredComponents: [
            // Orisha Rust Quantum Modules
            { path: 'orisha/Cargo.toml', name: 'Orisha Core' },
            { path: 'orisha/orisha/src/lib.rs', name: 'Orisha Main' },

            // Quantum Supercomputer / ACLDQ
            { path: 'quantum-supercomputer/acldq/include/acldq.h', name: 'ACLDQ Header' },
            { path: 'quantum-supercomputer/serverless-quantum/bridge/rest-bridge.ts', name: 'REST Bridge' },

            // Cloud Platform
            { path: 'cloud-platform/swarm/index.ts', name: 'Swarm Index' },
        ],
    },

    // =================================================================
    // WORKER CONFIGURATION
    // =================================================================
    worker: {
        name: process.env.WORKER_NAME || `worker-${Date.now()}`,

        // Polling intervals
        jobPollInterval: 10000,             // Check for jobs every 10s
        heartbeatInterval: 30000,           // Heartbeat every 30s
        peerSyncInterval: 30000,            // Sync with peer every 30s

        // Cleanup settings
        cleanupInterval: 3600000,           // Cleanup old data every hour
        resultRetention: 86400,             // Keep results for 24h
        diffRetention: 604800,              // Keep diffs for 7 days (for replay)

        // Concurrency
        maxConcurrentJobs: 10,
        maxConcurrentStreams: 50,
    },

    // =================================================================
    // ACLDQ EXECUTION SETTINGS
    // =================================================================
    acldq: {
        // Where ACLDQs are stored
        source: 'Q3 Carrier',                   // 'Q3 Carrier' | 'quic-cache' | 'both'

        // Compilation cache
        compileCache: {
            enabled: true,
            location: 'quic',               // Cache compiled ACLDQs on QUIC.cloud
            ttl: 604800,                    // 7 days
        },

        // Execution engine
        engine: 'orisha',                   // Rust Orisha modules

        // Resource limits
        limits: {
            maxQubits: 200,
            maxGates: 1000000,
            maxShots: 100000,
            maxExecutionTime: 300000,       // 5 min
        }
    },

    // =================================================================
    // AVIF HOLDER INTEGRATION (ACLDQs as AVIF containers)
    // =================================================================
    avifHolder: {
        enabled: true,

        // ACLDQs stored as AVIF metadata
        embedMode: 'xmp',                   // 'xmp' | 'exif' | 'custom-chunk'

        // QUIC.cloud CDN serves AVIF files
        cdnBase: 'https://cdn.cr8os.io/q',

        // Extraction settings
        extraction: {
            method: 'streaming',            // Don't buffer full AVIF
            acldqChunkId: 'ACLD',           // Custom chunk identifier
        }
    }
};
