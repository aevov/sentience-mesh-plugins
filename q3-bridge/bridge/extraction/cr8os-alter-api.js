// Cr8OS Alter - Sleeper Compute Control API
// Allows enabling/configuring massive worker scaling from the dashboard
// Manages millions of workers as a single unit via ORIKI Deep
// Now with QUIC.cloud multi-domain redundancy management
// Includes unified Q3 Carrier file manager with js-fileexplorer

// Load environment variables from .env file
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const { SleeperOrchestrator, ChainRotationManager } = require('./acldqa-deep-sleeper');
const { getDomainManager } = require('./quic-domain-manager');
const { addFileManagerRoutes } = require('./Q3 Carrier-file-manager');
const edgeConfig = require('./quantumcloud-edge-config');
const { auth, authMiddleware, requireAuth, requireAdmin } = require('./Q3 Carrier-auth');
const { getConfigManager } = require('./Q3 Carrier-config-manager');
const { getProxyManager } = require('./quantum-reverse-proxy');
const { getQ3NativeStorage } = require('./q3-native-storage');
const quantumISP = require('./quantum-isp-api');
const quantumWeb = require('./quantum-web-api');
const quantumSec = require('./quantum-sec-api');
const quantumLambda = require('./quantum-lambda-api');
const quantumDB = require('./quantum-db-api');
const quantumMonitor = require('./quantum-monitor-api');
const quantumCDN = require('./quantum-cdn-api');
const quantumFlow = require('./quantum-flow-api');
const quantumVault = require('./quantum-vault-api');
const quantumQueue = require('./quantum-queue-api');
const quantumBackup = require('./quantum-backup-api');
const quantumFinance = require('./quantum-finance-api');
const quantumHealth = require('./quantum-health-api');
const quantumAnalytics = require('./quantum-analytics-api');
const quantumStream = require('./quantum-stream-api');
const q3Persist = require('./q3-persist');
const quantumAuth = require('./quantum-auth-middleware');
const metricsCollector = require('./quantum-metrics-collector');
const q3EdgeEngine = require('./q3-quantum-edge-engine');
const { getQ3UnifiedStorage, createQ3UnifiedRouter } = require('./q3-unified-storage');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Allow larger uploads
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve the file explorer library statically
app.use('/file-explorer', express.static(path.join(__dirname, 'file-explorer-lib/file-explorer')));

// Serve dashboard
app.use(express.static(__dirname));

// Serve docs/html folder for dashboards like quantum-cloud-console.html
app.use(express.static(path.join(__dirname, '../docs/html')));

// Auth middleware (set AUTH_BYPASS=true in dev to skip)
// app.use(quantumAuth.authMiddleware);

// Start metrics collector (collects every 30 seconds)
setTimeout(() => metricsCollector.startCollector(30000), 5000);

// Register Q3 Quantum Edge routes (Cloudflare-free .q domains and static hosting)
q3EdgeEngine.createQ3Router(app);
console.log('[Q3 Edge] ⚡ Quantum Edge Engine integrated (no Cloudflare!)');

// Initialize unified Q3 storage (async)
(async () => {
    try {
        const q3 = await getQ3UnifiedStorage();
        createQ3UnifiedRouter(app, q3);
        console.log('[Q3] 📦 Unified storage ready');
    } catch (e) {
        console.warn('[Q3] Storage init warning:', e.message);
    }
})();


// Global instances
let orchestrator = null;
let chainManager = null;
let domainManager = null;
let proxyManager = null;
let q3Storage = null;

// Configuration state
const config = {
    enabled: false,
    targetWorkers: 1000,
    maxWorkers: 1000000,
    workersPerPool: 1000,
    autoScale: false,
};

/**
 * Initialize the sleeper compute system
 */
function initializeSystem() {
    orchestrator = new SleeperOrchestrator({
        maxPools: Math.ceil(config.maxWorkers / config.workersPerPool),
        workersPerPool: config.workersPerPool,
        maxTotalWorkers: config.maxWorkers,
    });

    chainManager = new ChainRotationManager();
    domainManager = getDomainManager();
    proxyManager = getProxyManager();

    // Initialize Q3 Native Storage - integrates with ACLDQ mesh
    q3Storage = getQ3NativeStorage({
        shardSize: 64 * 1024 * 1024,  // 64MB shards
        redundancy: 3,                 // 3x replication across workers
        baseDomain: proxyManager.baseDomain  // Use QUIC.cloud domain from config
    });

    console.log('🚀 Cr8OS Alter Sleeper API initialized');
    console.log(`   QUIC Domains: ${domainManager.domains.length} configured`);
    console.log(`   Q3 Carrier: ${edgeConfig.Q3 Carrier.isConfigured ? 'Configured ✓' : 'Not configured (using local storage)'}`);
    console.log(`   Reverse Proxy: Using ${proxyManager.baseDomain}`);
    console.log(`   Q3 Storage: ${q3Storage ? 'Ready ✓' : 'Not configured ✗'}`);
}

// =================================================================
// REST API ENDPOINTS
// =================================================================

/**
 * GET /api/status
 * Get current system status
 */
app.get('/api/status', (req, res) => {
    if (!orchestrator) {
        return res.json({
            initialized: false,
            enabled: config.enabled,
        });
    }

    const status = orchestrator.getStatus();
    res.json({
        initialized: true,
        enabled: config.enabled,
        config,
        ...status,
    });
});

/**
 * POST /api/enable
 * Enable sleeper compute system
 */
app.post('/api/enable', async (req, res) => {
    try {
        config.enabled = true;

        if (req.body.targetWorkers) {
            config.targetWorkers = Math.min(req.body.targetWorkers, config.maxWorkers);
        }

        if (!orchestrator) {
            initializeSystem();
        }

        res.json({
            success: true,
            message: 'Sleeper compute enabled',
            config,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/disable
 * Disable and sleep all workers
 */
app.post('/api/disable', async (req, res) => {
    try {
        config.enabled = false;

        if (orchestrator) {
            // Sleep all pools
            for (const [, pool] of orchestrator.pools) {
                await pool.sleep();
            }
        }

        res.json({
            success: true,
            message: 'Sleeper compute disabled, all workers dormant',
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/configure
 * Configure scaling parameters
 */
app.post('/api/configure', (req, res) => {
    const { targetWorkers, maxWorkers, workersPerPool, autoScale } = req.body;

    if (targetWorkers !== undefined) {
        config.targetWorkers = Math.min(targetWorkers, 1000000);
    }
    if (maxWorkers !== undefined) {
        config.maxWorkers = Math.min(maxWorkers, 10000000); // 10M absolute max
    }
    if (workersPerPool !== undefined) {
        config.workersPerPool = Math.min(workersPerPool, 10000);
    }
    if (autoScale !== undefined) {
        config.autoScale = autoScale;
    }

    res.json({
        success: true,
        config,
    });
});

/**
 * POST /api/scale
 * Scale to specific worker count immediately
 */
app.post('/api/scale', async (req, res) => {
    try {
        if (!config.enabled) {
            return res.status(400).json({ error: 'Sleeper compute not enabled' });
        }

        const { workers } = req.body;
        if (!workers || workers < 1) {
            return res.status(400).json({ error: 'Invalid worker count' });
        }

        const scaled = await orchestrator.scaleToWorkers(workers);

        res.json({
            success: true,
            requestedWorkers: workers,
            actualWorkers: scaled,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/generate
 * Generate ACLDQs on demand
 */
app.post('/api/generate', async (req, res) => {
    try {
        if (!config.enabled) {
            return res.status(400).json({ error: 'Sleeper compute not enabled' });
        }

        const { count, template, keepAwake } = req.body;

        if (!count || count < 1) {
            return res.status(400).json({ error: 'Invalid ACLDQ count' });
        }

        console.log(`📥 Generate request: ${count} ACLDQs`);

        const result = await orchestrator.generateAcldqsOnDemand(count, {
            template: template || {},
            keepAwake: keepAwake || false,
        });

        res.json({
            success: true,
            generated: result.count,
            stats: result.stats,
            // Don't return all ACLDQs in response, just metadata
            message: `Generated ${result.count} ACLDQs, stored to Q3 Carrier`,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/chain
 * Get chain rotation status
 */
app.get('/api/chain', (req, res) => {
    if (!chainManager) {
        chainManager = new ChainRotationManager();
    }

    res.json({
        currentChain: chainManager.currentChain,
        currentStep: chainManager.currentStep,
        callCount: chainManager.callCount,
        chains: chainManager.chains,
        nextCall: chainManager.getNextCall(),
    });
});

/**
 * POST /api/chain/step
 * Execute next step in chain rotation
 */
app.post('/api/chain/step', (req, res) => {
    if (!chainManager) {
        chainManager = new ChainRotationManager();
    }

    const call = chainManager.getNextCall();

    res.json({
        executed: call,
        nextChain: chainManager.currentChain,
        nextStep: chainManager.currentStep,
    });
});

/**
 * GET /api/oriki
 * Get ORIKI Deep status
 */
app.get('/api/oriki', (req, res) => {
    if (!orchestrator) {
        return res.json({
            active: false,
            amplification: 5120,
            message: 'ORIKI Deep not initialized',
        });
    }

    res.json({
        active: orchestrator.orikiDeep.state.active,
        amplification: orchestrator.orikiDeep.totalAmplification,
        baseLayers: orchestrator.orikiDeep.baseLayers,
        deepMultiplier: orchestrator.orikiDeep.deepMultiplier,
        state: orchestrator.orikiDeep.state,
    });
});

// =================================================================
// QUIC.CLOUD DOMAIN MANAGEMENT
// =================================================================

/**
 * GET /api/domains
 * List all QUIC.cloud domains and their status
 */
app.get('/api/domains', async (req, res) => {
    try {
        if (!domainManager) {
            domainManager = getDomainManager();
        }

        res.json({
            success: true,
            ...domainManager.getStatus(),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/domains
 * Add a new QUIC.cloud domain
 */
app.post('/api/domains', (req, res) => {
    try {
        if (!domainManager) {
            domainManager = getDomainManager();
        }

        const { domainKey, domainId, name } = req.body;

        if (!domainKey) {
            return res.status(400).json({ error: 'domainKey is required' });
        }

        const domain = domainManager.addDomain({
            domainKey,
            domainId: domainId || '',
            name: name || `domain-${Date.now()}`,
        });

        res.json({
            success: true,
            domain,
            totalDomains: domainManager.domains.length,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/domains/:name
 * Remove a QUIC.cloud domain
 */
app.delete('/api/domains/:name', (req, res) => {
    try {
        if (!domainManager) {
            domainManager = getDomainManager();
        }

        const removed = domainManager.removeDomain(req.params.name);

        if (removed) {
            res.json({
                success: true,
                message: `Domain ${req.params.name} removed`,
                totalDomains: domainManager.domains.length,
            });
        } else {
            res.status(404).json({ error: 'Domain not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/domains/active
 * Set the active QUIC.cloud domain
 */
app.post('/api/domains/active', (req, res) => {
    try {
        if (!domainManager) {
            domainManager = getDomainManager();
        }

        const { domain } = req.body; // name or index

        const success = domainManager.setActiveDomain(domain);

        if (success) {
            res.json({
                success: true,
                activeDomain: domainManager.getActiveDomain()?.name,
            });
        } else {
            res.status(400).json({ error: 'Invalid domain name or index' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/domains/health
 * Check health of all domains
 */
app.post('/api/domains/health', async (req, res) => {
    try {
        if (!domainManager) {
            domainManager = getDomainManager();
        }

        console.log('🏥 Checking domain health...');
        const domains = await domainManager.checkAllDomainHealth();

        res.json({
            success: true,
            domains,
            activeDomain: domainManager.getActiveDomain()?.name,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =================================================================
// Q3_CARRIER STATUS
// =================================================================

/**
 * GET /api/Q3 Carrier
 * Get Q3 Carrier configuration status
 */
app.get('/api/Q3 Carrier', (req, res) => {
    res.json({
        configured: edgeConfig.Q3 Carrier.isConfigured,
        endpoint: edgeConfig.Q3 Carrier.endpoint,
        bucket: edgeConfig.Q3 Carrier.bucket,
        region: edgeConfig.Q3 Carrier.region,
        storageMode: edgeConfig.Q3 Carrier.storageMode,
        paths: edgeConfig.Q3 Carrier.paths,
        // Don't expose credentials
        hasCredentials: !!(edgeConfig.Q3 Carrier.accessKeyId && edgeConfig.Q3 Carrier.secretAccessKey),
    });
});

// =================================================================
// STORAGE WORKFLOW MODE
// =================================================================

// Runtime storage mode (can be changed via API)
let currentStorageMode = edgeConfig.storageWorkflow?.mode || 'hybrid';

/**
 * GET /api/storage-mode
 * Get current storage workflow mode
 */
app.get('/api/storage-mode', (req, res) => {
    const modeInfo = edgeConfig.storageWorkflow?.modes?.[currentStorageMode] || {};

    res.json({
        success: true,
        mode: currentStorageMode,
        name: modeInfo.name || currentStorageMode,
        description: modeInfo.description || '',
        hybridRatio: edgeConfig.storageWorkflow?.hybridRatio || { quic: 0.7, Q3 Carrier: 0.3 },
        availableModes: Object.keys(edgeConfig.storageWorkflow?.modes || {}),
    });
});

/**
 * POST /api/storage-mode
 * Set storage workflow mode
 */
app.post('/api/storage-mode', (req, res) => {
    const { mode } = req.body;

    const validModes = ['quic', 'hybrid', 'Q3 Carrier'];
    if (!validModes.includes(mode)) {
        return res.status(400).json({
            error: `Invalid mode. Must be one of: ${validModes.join(', ')}`,
        });
    }

    currentStorageMode = mode;
    console.log(`📦 Storage mode changed to: ${mode}`);

    const modeInfo = edgeConfig.storageWorkflow?.modes?.[mode] || {};

    res.json({
        success: true,
        mode: currentStorageMode,
        name: modeInfo.name,
        description: modeInfo.description,
    });
});

// =================================================================
// ENGINE REFERENCE (Q3 Carrier-stored files)
// =================================================================

const { getFileManager } = require('./Q3 Carrier-file-manager');

/**
 * GET /api/engine/files
 * List engine files from Q3 Carrier
 */
app.get('/api/engine/files', async (req, res) => {
    try {
        const fm = getFileManager();
        const basePath = edgeConfig.engineReference?.basePath || 'wibackups/q/cr8OS-complete-quantum';
        const subPath = req.query.path || '';
        const fullPath = subPath ? `${basePath}/${subPath}` : basePath;

        const result = await fm.listFolder(fullPath);

        if (!result.success) {
            return res.status(500).json({ success: false, error: result.error });
        }

        // Filter to engine file types
        const allowedTypes = edgeConfig.engineReference?.fileTypes || [
            '.rs', '.wasm', '.js', '.ts', '.json', '.acldq', '.toml', '.c', '.h', '.py'
        ];

        const filtered = result.entries.filter(entry => {
            if (entry.type === 'folder') return true;
            const ext = entry.name.includes('.') ? '.' + entry.name.split('.').pop().toLowerCase() : '';
            return allowedTypes.includes(ext);
        });

        res.json({
            success: true,
            basePath,
            currentPath: fullPath,
            entries: filtered,
            count: filtered.length,
            keyDirectories: edgeConfig.engineReference?.keyDirectories || [],
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/engine/status
 * Check if required engine components exist in ADMIN bucket (wibackups)
 */
app.get('/api/engine/status', async (req, res) => {
    try {
        const fm = getFileManager();
        const basePath = edgeConfig.engineReference?.basePath || 'q/cr8OS-2.0';
        const required = edgeConfig.engineReference?.requiredComponents || [];

        console.log(`🔧 Checking engine status in admin bucket: ${basePath}`);

        const componentStatus = [];

        for (const comp of required) {
            const fullPath = `${basePath}/${comp.path}`;
            console.log(`   Checking: ${fullPath}`);

            // Use getAdminFile to check in wibackups bucket
            const result = await fm.getAdminFile(fullPath, false);

            componentStatus.push({
                name: comp.name,
                path: comp.path,
                exists: result.exists === true,
                size: result.size || null,
            });

            console.log(`   ${result.exists ? '✅' : '❌'} ${comp.name}`);
        }

        const allPresent = componentStatus.every(c => c.exists);
        const presentCount = componentStatus.filter(c => c.exists).length;

        console.log(`🔧 Engine check complete: ${presentCount}/${required.length}`);

        res.json({
            success: true,
            basePath,
            adminBucket: edgeConfig.Q3 Carrier.adminBucket || 'wibackups',
            allComponentsPresent: allPresent,
            presentCount,
            totalRequired: required.length,
            deploymentReady: allPresent,
            components: componentStatus,
        });

    } catch (err) {
        console.error('Engine status error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================================================================
// AUTHENTICATION ENDPOINTS (Q3 Carrier-native)
// =================================================================

// Add auth middleware to app
app.use(authMiddleware(auth));

/**
 * POST /api/auth/register
 * Register a new user
 */
app.post('/api/auth/register', async (req, res) => {
    const { username, password, displayName } = req.body;

    const result = await auth.register(username, password, { displayName });

    if (result.success) {
        res.json(result);
    } else {
        res.status(400).json(result);
    }
});

/**
 * POST /api/auth/login
 * Login and get session token
 */
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    const result = await auth.login(username, password);

    if (result.success) {
        res.json(result);
    } else {
        res.status(401).json(result);
    }
});

/**
 * GET /api/auth/verify
 * Verify session token
 */
app.get('/api/auth/verify', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;

    const result = await auth.verify(token);
    res.json(result);
});

/**
 * POST /api/auth/logout
 * Logout and invalidate session
 */
app.post('/api/auth/logout', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.body.token;

    const result = await auth.logout(token);
    res.json(result);
});

/**
 * GET /api/auth/me
 * Get current user info
 */
app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({
        success: true,
        user: req.user,
    });
});

/**
 * GET /api/auth/users (admin only)
 * List all users
 */
app.get('/api/auth/users', requireAuth, requireAdmin, async (req, res) => {
    const result = await auth.listUsers();
    res.json(result);
});

/**
 * POST /api/auth/change-password
 * Change user password
 */
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    const result = await auth.changePassword(req.user.username, oldPassword, newPassword);

    if (result.success) {
        res.json(result);
    } else {
        res.status(400).json(result);
    }
});

// =================================================================
// CONFIG MANAGEMENT (Q3 Carrier-backed with versioning)
// =================================================================

/**
 * GET /api/config
 * Load current config from Q3 Carrier
 */
app.get('/api/config', async (req, res) => {
    try {
        const cm = getConfigManager();
        const config = await cm.load();
        res.json({
            success: true,
            config,
            status: cm.getStatus(),
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PUT /api/config
 * Save config with automatic versioning
 */
app.put('/api/config', requireAuth, async (req, res) => {
    try {
        const { config, description } = req.body;
        const cm = getConfigManager();

        if (!cm.currentConfig) await cm.load();

        const result = await cm.save(
            { ...cm.currentConfig, ...config },
            description || `Updated by ${req.user?.username || 'unknown'}`
        );

        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * PATCH /api/config/:section
 * Update specific config section
 */
app.patch('/api/config/:section', requireAuth, async (req, res) => {
    try {
        const { section } = req.params;
        const { value, description } = req.body;
        const cm = getConfigManager();

        const result = await cm.updateSection(
            section,
            value,
            description || `Updated ${section} by ${req.user?.username || 'unknown'}`
        );

        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/config/versions
 * Get version history
 */
app.get('/api/config/versions', async (req, res) => {
    try {
        const cm = getConfigManager();
        const versions = await cm.getVersions();
        res.json({ success: true, versions, count: versions.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/config/versions/:version
 * Get specific version
 */
app.get('/api/config/versions/:version', async (req, res) => {
    try {
        const cm = getConfigManager();
        const config = await cm.getVersion(parseInt(req.params.version));

        if (!config) {
            return res.status(404).json({ success: false, error: 'Version not found' });
        }

        res.json({ success: true, config });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/config/rollback/:version
 * Rollback to specific version
 */
app.post('/api/config/rollback/:version', requireAuth, async (req, res) => {
    try {
        const cm = getConfigManager();
        const result = await cm.rollback(parseInt(req.params.version));

        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/config/changelog
 * Get changelog
 */
app.get('/api/config/changelog', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const cm = getConfigManager();
        const changelog = await cm.getChangelog(limit);

        res.json({ success: true, changelog, count: changelog.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/config/diff
 * Compare two versions
 */
app.get('/api/config/diff', async (req, res) => {
    try {
        const v1 = parseInt(req.query.v1);
        const v2 = parseInt(req.query.v2);

        if (!v1 || !v2) {
            return res.status(400).json({ success: false, error: 'v1 and v2 required' });
        }

        const cm = getConfigManager();
        const diff = await cm.diff(v1, v2);

        res.json({ success: true, diff });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =================================================================
// =================================================================

// =================================================================
// REAL DEPLOYMENT & COMPUTE ENGINE
// =================================================================
const { exec, spawn } = require('child_process');

// Ensure deployments dir exists
const DEPLOY_DIR = path.join(__dirname, 'public', 'deployments');
if (!fs.existsSync(DEPLOY_DIR)) fs.mkdirSync(DEPLOY_DIR, { recursive: true });

// Serve deployments statically
app.use('/deployments', express.static(DEPLOY_DIR));

// Cloud State Persistence
const CLOUD_STATE_FILE = './cloud-state.json';
let cloudState = {
    droplets: [],
    credits: 500.00,
    deployments: []
};
if (fs.existsSync(CLOUD_STATE_FILE)) {
    try { cloudState = JSON.parse(fs.readFileSync(CLOUD_STATE_FILE, 'utf8')); }
    catch (e) { console.error('Failed to load cloud state', e); }
}
function saveCloudState() {
    fs.writeFileSync(CLOUD_STATE_FILE, JSON.stringify(cloudState, null, 2));
}

// Track active child processes for "Droplets"
const activeKernels = {};

/**
 * GET /api/cloud/droplets
 */
app.get('/api/cloud/droplets', (req, res) => {
    res.json({
        success: true,
        droplets: cloudState.droplets,
        credits: cloudState.credits
    });
});

/**
 * POST /api/cloud/deploy
 * REAL Implementation: Extracts ZIP and serves it.
 * Payload: { name, content (base64) }
 */
app.post('/api/cloud/deploy', async (req, res) => {
    try {
        const { name, content } = req.body;
        const cleanName = (name || 'app').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const deployId = `${cleanName}-${crypto.randomBytes(4).toString('hex')}`;
        const deployPath = path.join(DEPLOY_DIR, deployId);
        const zipPath = path.join(DEPLOY_DIR, `${deployId}.zip`);

        console.log(`🚀 Deploying ${cleanName} to quantum mesh...`);

        // 1. Write ZIP to disk
        const buffer = Buffer.from(content, 'base64');
        fs.writeFileSync(zipPath, buffer);

        // 2. Extract (using system unzip for reliability)
        fs.mkdirSync(deployPath);

        await new Promise((resolve, reject) => {
            exec(`unzip -o "${zipPath}" -d "${deployPath}"`, (err, stdout, stderr) => {
                if (err) {
                    console.error('Unzip failed:', stderr);
                    reject(err);
                } else {
                    resolve(stdout);
                }
            });
        });

        // 3. Cleanup ZIP
        fs.unlinkSync(zipPath);

        // 4. Return Access URL
        // Using the API server itself as the gateway
        const accessUrl = `http://localhost:${process.env.ALTER_API_PORT || 7472}/deployments/${deployId}/index.html`;

        console.log(`✅ Deployment Success: ${accessUrl}`);

        res.json({
            success: true,
            url: accessUrl,
            path: deployPath,
            deploymentId: deployId
        });

    } catch (e) {
        console.error("Deployment Error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * POST /api/cloud/droplets
 * REAL Implementation: Spawns a persistent Child Process (Quantum Kernel)
 */
app.post('/api/cloud/droplets', async (req, res) => {
    const { name, size, region, image } = req.body;

    // Billing check
    if (cloudState.credits <= 0) {
        return res.status(402).json({ success: false, error: 'Insufficient credits' });
    }
    cloudState.credits -= (size.includes('gpu') ? 5 : 1);

    const dropletId = crypto.randomBytes(8).toString('hex');
    const dropletName = name || `node-${dropletId}`;

    // [PRODUCTION STACKS] - REAL PODMAN CONTAINERS WITH FULL TOOLCHAINS
    console.log(`🐳 Spawning Production Container for ${dropletName}...`);
    const containerName = `cr8os-${dropletId}`;

    // Image mapping for production stacks
    const imageMap = {
        'devbox': 'cr8os/devbox:latest',
        'nodestack': 'cr8os/nodestack:latest',
        'webstack': 'cr8os/webstack:latest',
        'dockerhost': 'cr8os/dockerhost:latest',
        'ubuntu-24-04-x64': 'cr8os/ubuntu:latest',  // Enhanced Ubuntu with sudo, apt, etc.
        'cyberpanel': 'cr8os/cyberpanel:latest',     // Real CyberPanel
        'cr8os-node': 'ubuntu:latest'
    };

    // Port mappings for each stack
    const portMaps = {
        'nodestack': ['3000', '5432'],
        'webstack': ['80', '443', '3306'],
        'cyberpanel': ['8090', '80', '443'],
        'dockerhost': [],
        'devbox': [],
        'ubuntu-24-04-x64': []
    };

    const selectedImage = imageMap[image] || 'ubuntu:latest';
    const ports = portMaps[image] || [];

    // Generate port mapping arguments
    let portArgs = '';
    const assignedPorts = {};
    for (const port of ports) {
        // Assign random high port (30000-40000 range)
        const hostPort = 30000 + Math.floor(Math.random() * 10000);
        assignedPorts[port] = hostPort;
        portArgs += ` -p ${hostPort}:${port}`;
    }

    // Create persistent volume
    const volumeName = `${dropletId}-data`;
    exec(`podman volume create ${volumeName}`, (err) => {
        if (err) console.error('Volume creation warning:', err);
    });


    // Check if custom image exists, otherwise use fallback
    const checkImageExists = (imageName) => {
        return new Promise((resolve) => {
            exec(`podman image exists ${imageName}`, (err) => {
                resolve(!err); // Returns true if image exists
            });
        });
    };

    // Check if our custom image is available
    const imageExists = selectedImage.startsWith('cr8os/')
        ? await checkImageExists(selectedImage)
        : true;

    // Use fallback if custom image not built yet
    const finalImage = imageExists ? selectedImage : 'docker.io/library/ubuntu:latest';

    if (!imageExists && selectedImage.startsWith('cr8os/')) {
        console.log(`⚠️  Custom image ${selectedImage} not found, using ubuntu:latest as fallback`);
        console.log(`   Run './build-images.sh' to build custom images`);
    }

    // Launch Container with proper configuration
    // CyberPanel needs systemd and privileged mode
    const isCyberPanel = image === 'cyberpanel';
    const command = isCyberPanel
        ? `podman run -d --rm --name ${containerName}${portArgs} -v ${volumeName}:/data --systemd=always --privileged ${finalImage}`
        : (image === 'cr8os-node'
            ? `podman run -d --rm --name ${containerName}${portArgs} -v ${volumeName}:/data docker.io/library/ubuntu:latest sleep infinity`
            : `podman run -d --rm --name ${containerName}${portArgs} -v ${volumeName}:/data ${finalImage}`);

    console.log(`   Command: ${command}`);

    exec(command, (err, stdout, stderr) => {
        if (err) {
            console.error('Podman launch failed:', stderr);
            // Fallback to basic ubuntu if custom image not found
            if (stderr.includes('unable to find image')) {
                console.log('Fallback: Using ubuntu:latest instead...');
                exec(`podman run -d --rm --name ${containerName} -v ${volumeName}:/data ubuntu:latest sleep infinity`, (err2, out2) => {
                    if (err2) {
                        console.error('Fallback also failed:', err2);
                    } else {
                        console.log('Container started (fallback):', out2.trim());
                    }
                });
            }
        } else {
            console.log('Container started:', stdout.trim());
        }
    });

    // The "Proxy" Script for terminal access
    const isProductionStack = ['devbox', 'nodestack', 'webstack', 'dockerhost'].includes(image);

    const terminalHTML = `<!DOCTYPE html><html><head><title>Quantum Terminal - ${image}</title><style>
            body { background: #0c0c0c; color: #cccccc; font-family: 'Ubuntu Mono', monospace; padding: 20px; font-size: 16px; margin: 0; }
            #output { white-space: pre-wrap; word-wrap: break-word; }
            .prompt { color: #87ff00; font-weight: bold; }
            .path { color: #3b8eea; font-weight: bold; }
            .info { color: #ffa500; margin: 10px 0; }
            input { background: transparent; border: none; color: #fff; font-family: inherit; font-size: inherit; flex-grow: 1; outline: none; }
        </style></head><body>
        <div id="output">Quantum Network OS [${image.toUpperCase()}]<br>Container: ${dropletId}<br>Mesh ID: ${dropletName}<br>${isProductionStack ? `Stack: Production-Ready ${image}<br>` : 'Image: Ubuntu 24.04 (Real OCI)<br>'}${Object.keys(assignedPorts).length > 0 ? `<br><span class="info">🌐 Exposed Ports: ${Object.entries(assignedPorts).map(([p, h]) => `${p}→${h}`).join(', ')}</span><br>` : ''}<br></div>
        <div style="display:flex"><span class="prompt">root@${dropletName}</span>:<span class="path" id="path">/</span>#&nbsp;<input id="cmd" autofocus></div>
        <script>
            const cmd = document.getElementById('cmd');
            const out = document.getElementById('output');
            const pathEl = document.getElementById('path');
            let cwd = '/';
            
            cmd.addEventListener('keydown', async (e) => {
                if(e.key === 'Enter') {
                    const c = cmd.value;
                    out.innerHTML += \`<div><span class="prompt">root@${dropletName}</span>:<span class="path">\${cwd}</span># \${c}</div>\`;
                    cmd.value = '';
                    if(!c.trim()) return;
                    if(c === 'clear') { out.innerHTML = ''; return; }
                    
                    try {
                        const res = await fetch('/cmd', { 
                            method: 'POST', 
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({ cmd: c, cwd }) 
                        });
                        const data = await res.json();
                        if(data.cwd) { cwd = data.cwd; pathEl.innerText = cwd; }
                        out.innerHTML += \`<div>\${data.output}</div>\`;
                        window.scrollTo(0, document.body.scrollHeight);
                    } catch(e) { out.innerHTML += 'Connection Lost'; }
                }
            });
            document.addEventListener('click', ()=>cmd.focus());
        </script></body></html>`;

    const proxyScript = `
            const http = require('http');
            const { exec } = require('child_process');
            
            const server = http.createServer((req, res) => {
                // Enable CORS
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
                
                if (req.method === 'OPTIONS') {
                    res.writeHead(200);
                    res.end();
                    return;
                }
                
                // Command Handler
                if (req.method === 'POST' && req.url === '/cmd') {
                    let body = '';
                    req.on('data', c => body += c);
                    req.on('end', () => {
                        const { cmd, cwd } = JSON.parse(body);
                        
                        // Handle "cd" specially
                        if (cmd.startsWith('cd ')) {
                             const target = cmd.substring(3).trim();
                             exec(\`podman exec ${containerName} /bin/bash -c "cd \${cwd} && cd \${target} && pwd"\`, (err, stdout, stderr) => {
                                 res.setHeader('Content-Type', 'application/json');
                                 if (err || stderr) res.end(JSON.stringify({ output: stderr || err.message, cwd }));
                                 else res.end(JSON.stringify({ output: '', cwd: stdout.trim() }));
                             });
                             return;
                        }

                        // Run Command
                        exec(\`podman exec -w "\${cwd}" ${containerName} /bin/bash -c "\${cmd}"\`, (err, stdout, stderr) => {
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ output: stdout || stderr || '', cwd }));
                        });
                    });
                    return;
                }
                
                // Serve Terminal
                res.writeHead(200, {'Content-Type': 'text/html'});
                res.end(${JSON.stringify(terminalHTML)});
            });
            server.listen(0, () => { console.log(server.address().port); setInterval(()=>{},10000); });
        `;

    const scriptPath = path.join(__dirname, `.proxy-${dropletId}.js`);
    fs.writeFileSync(scriptPath, proxyScript);

    const child = spawn('node', [scriptPath], { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let assignedPort = 0;
    await new Promise(r => child.stdout.once('data', d => { assignedPort = parseInt(d.toString().trim()); r(); }));
    child.unref();

    activeKernels[dropletId] = {
        pid: child.pid,
        path: scriptPath,
        type: 'container',
        containerName,
        volumeName,
        ports: assignedPorts
    };

    // CALL finalizeDroplet to register the droplet and respond to the client
    finalizeDroplet(dropletId, dropletName, assignedPort, child.pid, assignedPorts);
    return; // Response already sent by finalizeDroplet

    function finalizeDroplet(id, name, port, pid, assignedPorts = {}) {
        console.log(`✨ Droplet ${name} deployed on localhost:${port}`);

        // Register with reverse proxy for public URL
        let publicUrl = null;
        if (proxyManager) {
            try {
                publicUrl = proxyManager.registerDroplet(id, port);
                console.log(`🌐 Public URL: ${publicUrl}`);
            } catch (error) {
                console.warn(`⚠️  Failed to register with proxy: ${error.message}`);
            }
        }

        const newDroplet = {
            id, name,
            ip: `127.0.0.1:${port}`,
            access_url: publicUrl || `http://localhost:${port}`,
            public_url: publicUrl,  // New field for external access
            status: 'active',
            created_at: new Date().toISOString(),
            pid,
            ports: assignedPorts
        };
        cloudState.droplets.push(newDroplet);
        saveCloudState();

        // CONNECT TO QUANTUM NETWORK (Simulated via Orchestrator)
        if (orchestrator && config.enabled) {
            orchestrator.scaleToWorkers(orchestrator.workers.size + 50).catch(console.error);
        }
        res.json({ success: true, droplet: newDroplet });
    }
});
// End of POST logic
// Container Cleanup in DELETE

/**
 * DELETE /api/cloud/droplets/:id
 * REAL Implementation: Kills the Child Process
 */
app.delete('/api/cloud/droplets/:id', (req, res) => {
    const { id } = req.params;
    const idx = cloudState.droplets.findIndex(d => d.id === id);

    if (idx !== -1) {
        const d = cloudState.droplets[idx];
        const kernel = activeKernels[id];

        if (kernel) {
            // Kill Proxy
            if (kernel.pid) try { process.kill(kernel.pid); } catch (e) { }
            if (fs.existsSync(kernel.path)) fs.unlinkSync(kernel.path);

            // Kill Container
            if (kernel.type === 'container' && kernel.containerName) {
                console.log(`🔥 Removing Container: ${kernel.containerName}`);
                exec(`podman stop ${kernel.containerName} && podman rm ${kernel.containerName}`, (err) => {
                    if (err) console.error("Container remove error:", err);
                });
            }
            delete activeKernels[id];
        }

        cloudState.droplets.splice(idx, 1);
        saveCloudState();

        if (orchestrator && config.enabled) {
            orchestrator.scaleToWorkers(Math.max(0, orchestrator.workers.size - 50)).catch(console.error);
        }
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, error: 'Droplet not found' });
    }
});
// End of POST logic
// Container Cleanup in DELETE

/**
 * DELETE /api/cloud/droplets/:id
 * REAL Implementation: Kills the Child Process
 */
app.delete('/api/cloud/droplets/:id', (req, res) => {
    const { id } = req.params;
    const idx = cloudState.droplets.findIndex(d => d.id === id);

    if (idx !== -1) {
        const d = cloudState.droplets[idx];
        const kernel = activeKernels[id];

        if (kernel) {
            // Kill Proxy
            if (kernel.pid) try { process.kill(kernel.pid); } catch (e) { }
            if (fs.existsSync(kernel.path)) fs.unlinkSync(kernel.path);

            // Kill Container
            if (kernel.type === 'container' && kernel.containerName) {
                console.log(`🔥 Removing Container: ${kernel.containerName} `);
                exec(`podman stop ${kernel.containerName} && podman rm ${kernel.containerName} `, (err) => {
                    if (err) console.error("Container remove error:", err);
                });
            }
            delete activeKernels[id];
        }

        cloudState.droplets.splice(idx, 1);
        saveCloudState();

        if (orchestrator && config.enabled) {
            orchestrator.scaleToWorkers(Math.max(0, orchestrator.workers.size - 50)).catch(console.error);
        }
        res.json({ success: true });
    } else {
        res.status(404).json({ success: false, error: 'Droplet not found' });
    }
});

/**
 * GET /api/cloud/account
 */
app.get('/api/cloud/account', (req, res) => {
    res.json({ success: true, credits: cloudState.credits, history: [] });
});
const WebSocket = require('ws');

function startWebSocket(server) {
    const wss = new WebSocket.Server({ server, path: '/ws' });

    wss.on('connection', (ws) => {
        console.log('📡 WebSocket client connected');

        // Send initial status
        if (orchestrator) {
            ws.send(JSON.stringify({
                type: 'status',
                data: orchestrator.getStatus(),
            }));
        }

        // Periodic updates
        const interval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN && orchestrator) {
                ws.send(JSON.stringify({
                    type: 'status',
                    data: orchestrator.getStatus(),
                }));
            }
        }, 5000);

        ws.on('close', () => {
            clearInterval(interval);
            console.log('📡 WebSocket client disconnected');
        });

        ws.on('message', async (message) => {
            try {
                const msg = JSON.parse(message);

                switch (msg.type) {
                    case 'enable':
                        config.enabled = true;
                        if (!orchestrator) initializeSystem();
                        break;

                    case 'disable':
                        config.enabled = false;
                        break;

                    case 'generate':
                        if (orchestrator && config.enabled) {
                            const result = await orchestrator.generateAcldqsOnDemand(
                                msg.count || 100,
                                { template: msg.template || {} }
                            );
                            ws.send(JSON.stringify({
                                type: 'generated',
                                data: result,
                            }));
                        }
                        break;

                    case 'scale':
                        if (orchestrator && config.enabled) {
                            await orchestrator.scaleToWorkers(msg.workers);
                        }
                        break;
                }
            } catch (err) {
                ws.send(JSON.stringify({
                    type: 'error',
                    error: err.message,
                }));
            }
        });
    });

    return wss;
}

// =================================================================
// START SERVER
// =================================================================

// Add file manager routes
addFileManagerRoutes(app);

// =================================================================
// Q3 QUANTUM STORAGE API (Native Implementation)
// =================================================================

/**
 * GET /api/q3/stats
 * Get Q3 storage statistics
 */
app.get('/api/q3/stats', async (req, res) => {
    try {
        if (!q3Storage) {
            return res.json({ objectCount: 0, bytesStored: 0, shardCount: 0, workerCount: 0 });
        }
        const stats = q3Storage.getStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Alias without /api prefix for frontend compatibility
app.get('/q3/stats', async (req, res) => {
    try {
        if (!q3Storage) {
            return res.json({ objectCount: 0, bytesStored: 0, shardCount: 0, workerCount: 0 });
        }
        const stats = q3Storage.getStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/q3/objects
 * List all Q3 objects
 */
app.get('/api/q3/objects', (req, res) => {
    try {
        if (!q3Storage) {
            return res.json({ objects: [] });
        }
        const objects = q3Storage.list();
        res.json({ objects });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/q3/objects
 * Store a new object (supports JSON data, base64, or raw)
 */
app.post('/api/q3/objects', async (req, res) => {
    try {
        if (!q3Storage) {
            return res.status(503).json({ error: 'Q3 Storage not initialized' });
        }

        const { name, data, type } = req.body;

        // Convert data to buffer
        let buffer;
        if (typeof data === 'string') {
            // Check if base64
            if (data.match(/^[A-Za-z0-9+/=]+$/)) {
                buffer = Buffer.from(data, 'base64');
            } else {
                buffer = Buffer.from(data, 'utf8');
            }
        } else if (Buffer.isBuffer(data)) {
            buffer = data;
        } else {
            buffer = Buffer.from(JSON.stringify(data));
        }

        const object = await q3Storage.store(buffer, { name, type });
        res.json({ success: true, object });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/q3/objects/:objectId
 * Retrieve an object
 */
app.get('/api/q3/objects/:objectId', async (req, res) => {
    try {
        if (!q3Storage) {
            return res.status(503).json({ error: 'Q3 Storage not initialized' });
        }

        const { objectId } = req.params;
        const result = await q3Storage.retrieve(objectId);

        if (!result) {
            return res.status(404).json({ error: 'Object not found' });
        }

        // Return metadata and base64 encoded data
        res.json({
            object: result.object,
            data: result.data.toString('base64'),
            size: result.data.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/q3/objects/:objectId
 * Delete an object
 */
app.delete('/api/q3/objects/:objectId', async (req, res) => {
    try {
        if (!q3Storage) {
            return res.status(503).json({ error: 'Q3 Storage not initialized' });
        }

        const { objectId } = req.params;
        const deleted = await q3Storage.delete(objectId);

        res.json({ success: deleted });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/q3/workers
 * Get ACLDQ worker status for Q3
 */
app.get('/api/q3/workers', (req, res) => {
    try {
        if (!q3Storage) {
            return res.json({ workers: [] });
        }
        const stats = q3Storage.getStats();
        res.json({ workers: stats.workers || [] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =================================================================
// Q3 STATIC WEBSITE HOSTING
// =================================================================

/**
 * POST /api/q3/sites
 * Create a new static website
 */
app.post('/api/q3/sites', async (req, res) => {
    try {
        if (!q3Storage) {
            return res.status(503).json({ error: 'Q3 Storage not initialized' });
        }

        const { name, subdomain, files } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Site name required' });
        }

        // Convert base64 files to buffers
        const fileList = (files || []).map(f => ({
            path: f.path,
            data: Buffer.from(f.data, 'base64')
        }));

        const site = await q3Storage.createSite(name, fileList, { subdomain });
        res.json({ success: true, site });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/q3/sites
 * List all static websites
 */
app.get('/api/q3/sites', (req, res) => {
    try {
        if (!q3Storage) {
            return res.json({ sites: [] });
        }
        const sites = q3Storage.listSites();
        res.json({ sites });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/q3/sites/:siteId
 * Get site details
 */
app.get('/api/q3/sites/:siteId', (req, res) => {
    try {
        if (!q3Storage || !q3Storage.sites) {
            return res.status(404).json({ error: 'Site not found' });
        }
        const site = q3Storage.sites.get(req.params.siteId);
        if (!site) {
            return res.status(404).json({ error: 'Site not found' });
        }
        res.json({ site });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/q3/sites/:siteId
 * Delete a static website
 */
app.delete('/api/q3/sites/:siteId', async (req, res) => {
    try {
        if (!q3Storage) {
            return res.status(503).json({ error: 'Q3 Storage not initialized' });
        }
        const deleted = await q3Storage.deleteSite(req.params.siteId);
        res.json({ success: deleted });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/q3/sites/:siteId/files
 * Upload file to an existing site
 */
app.post('/api/q3/sites/:siteId/files', async (req, res) => {
    try {
        if (!q3Storage) {
            return res.status(503).json({ error: 'Q3 Storage not initialized' });
        }

        const { path: filePath, data } = req.body;
        if (!filePath || !data) {
            return res.status(400).json({ error: 'File path and data required' });
        }

        const buffer = Buffer.from(data, 'base64');
        const object = await q3Storage.addSiteFile(req.params.siteId, filePath, buffer);
        res.json({ success: true, object });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /q3-site/:siteId/:path(*)
 * Serve static website files
 */
app.get(/^\/q3-site\/([^\/]+)\/(.*)$/, async (req, res) => {
    try {
        if (!q3Storage) {
            return res.status(503).send('Q3 Storage not available');
        }

        const siteId = req.params[0];
        const filePath = req.params[1] || 'index.html';

        const file = await q3Storage.getSiteFile(siteId, filePath);

        res.set('Content-Type', file.contentType);
        res.set('Content-Length', file.size);
        res.set('Cache-Control', 'public, max-age=3600');
        res.send(file.data);
    } catch (error) {
        if (error.message.includes('not found')) {
            res.status(404).send('File not found');
        } else {
            res.status(500).send('Error loading file');
        }
    }
});

/**
 * GET /q3-site/:siteId (root)
 * Serve site index
 */
app.get('/q3-site/:siteId', async (req, res) => {
    try {
        if (!q3Storage) {
            return res.status(503).send('Q3 Storage not available');
        }

        const file = await q3Storage.getSiteFile(req.params.siteId, 'index.html');
        res.set('Content-Type', file.contentType);
        res.send(file.data);
    } catch (error) {
        res.status(404).send('Site not found or no index.html');
    }
});

/**
 * GET /api/q3/fullstats
 * Get comprehensive statistics including sites
 */
app.get('/api/q3/fullstats', (req, res) => {
    try {
        if (!q3Storage) {
            return res.json({ storage: {}, sites: { count: 0, sites: [] } });
        }
        const stats = q3Storage.getFullStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/q3/sites/:siteId/publish
 * Publish a site to edge (sync to Q3 Carrier S3 for Cloudflare Worker)
 */
app.post('/api/q3/sites/:siteId/publish', async (req, res) => {
    try {
        if (!q3Storage) {
            return res.status(503).json({ error: 'Q3 Storage not initialized' });
        }

        const { siteId } = req.params;
        const site = q3Storage.sites?.get(siteId);

        if (!site) {
            return res.status(404).json({ error: 'Site not found' });
        }

        // Lazy load AWS SDK
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

        const s3Client = new S3Client({
            endpoint: edgeConfig.Q3 Carrier.endpoint,
            region: edgeConfig.Q3 Carrier.region,
            credentials: {
                accessKeyId: process.env.Q3_CARRIER_ACCESS_KEY || process.env.Q3_CARRIER_ID,
                secretAccessKey: process.env.Q3_CARRIER_SECRET_KEY || process.env.Q3_CARRIER_SECRET,
            },
            forcePathStyle: true,
        });

        const bucket = edgeConfig.Q3 Carrier.bucket;
        const Q3_SITES_PREFIX = 'q3/sites';
        const Q3_ROUTING_PREFIX = 'q3/routing';

        console.log(`[Q3] Publishing site to edge: ${site.name} (${siteId})`);

        // 1. Upload manifest
        const manifest = {
            siteId: site.siteId,
            name: site.name,
            subdomain: site.subdomain,
            indexFile: site.indexFile,
            files: site.files.map(f => ({
                path: f.path,
                contentType: f.contentType,
                size: f.size,
            })),
            createdAt: site.createdAt,
            publishedAt: Date.now(),
        };

        await s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: `${Q3_SITES_PREFIX}/${siteId}/manifest.json`,
            Body: JSON.stringify(manifest, null, 2),
            ContentType: 'application/json',
        }));

        // 2. Upload each file
        let uploadedFiles = 0;
        for (const file of site.files) {
            try {
                const result = await q3Storage.retrieve(file.objectId);
                await s3Client.send(new PutObjectCommand({
                    Bucket: bucket,
                    Key: `${Q3_SITES_PREFIX}/${siteId}/files/${file.path}`,
                    Body: result.data,
                    ContentType: file.contentType,
                }));
                uploadedFiles++;
            } catch (err) {
                console.warn(`[Q3] Failed to upload ${file.path}:`, err.message);
            }
        }

        // 3. Create subdomain routing
        await s3Client.send(new PutObjectCommand({
            Bucket: bucket,
            Key: `${Q3_ROUTING_PREFIX}/${site.subdomain}.json`,
            Body: JSON.stringify({ siteId, subdomain: site.subdomain }),
            ContentType: 'application/json',
        }));

        console.log(`[Q3] ✅ Published to edge: ${uploadedFiles}/${site.files.length} files`);

        res.json({
            success: true,
            published: {
                siteId,
                subdomain: site.subdomain,
                files: uploadedFiles,
                edgeUrl: `https://${site.subdomain}.q3.${edgeConfig.quicCloud.q3BaseDomain}`,
                publishedAt: new Date().toISOString(),
            }
        });
    } catch (error) {
        console.error('[Q3] Publish error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =========================================================================
// Q3 CUSTOM DOMAIN API
// =========================================================================

/**
 * POST /api/q3/sites/:siteId/domains
 * Add a custom domain to a site
 */
app.post('/api/q3/sites/:siteId/domains', async (req, res) => {
    try {
        if (!q3Storage) {
            return res.status(503).json({ error: 'Q3 Storage not initialized' });
        }

        const { domain } = req.body;
        if (!domain) {
            return res.status(400).json({ error: 'Domain required' });
        }

        const domainConfig = await q3Storage.addCustomDomain(req.params.siteId, domain);

        res.json({
            success: true,
            domain: domainConfig,
            instructions: {
                step1: `Add a CNAME record for ${domainConfig.domain}`,
                step2: `Point it to: ${domainConfig.cnameTarget}`,
                step3: 'Call POST /api/q3/sites/:siteId/domains/:domain/verify to verify'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * DELETE /api/q3/sites/:siteId/domains/:domain
 * Remove a custom domain from a site
 */
app.delete('/api/q3/sites/:siteId/domains/:domain', async (req, res) => {
    try {
        if (!q3Storage) {
            return res.status(503).json({ error: 'Q3 Storage not initialized' });
        }

        const removed = await q3Storage.removeCustomDomain(req.params.siteId, req.params.domain);
        res.json({ success: removed });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /api/q3/sites/:siteId/domains/:domain/verify
 * Verify a custom domain (checks DNS)
 */
app.post('/api/q3/sites/:siteId/domains/:domain/verify', async (req, res) => {
    try {
        if (!q3Storage) {
            return res.status(503).json({ error: 'Q3 Storage not initialized' });
        }

        const domainConfig = await q3Storage.verifyCustomDomain(req.params.siteId, req.params.domain);

        res.json({
            success: true,
            domain: domainConfig,
            verified: domainConfig.verified,
            message: domainConfig.verified
                ? '✅ Domain verified! SSL is active via Cloudflare.'
                : '❌ Verification failed. Please check your DNS settings.'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/q3/sites/:siteId/domains
 * List custom domains for a site
 */
app.get('/api/q3/sites/:siteId/domains', (req, res) => {
    try {
        if (!q3Storage) {
            return res.json({ domains: [] });
        }

        const site = q3Storage.sites?.get(req.params.siteId);
        if (!site) {
            return res.status(404).json({ error: 'Site not found' });
        }

        res.json({
            success: true,
            siteId: req.params.siteId,
            defaultDomain: `${site.subdomain}.q3.${edgeConfig.quicCloud.q3BaseDomain}`,
            customDomains: site.customDomains || []
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/q3/domains
 * List all custom domains across all sites
 */
app.get('/api/q3/domains', (req, res) => {
    try {
        if (!q3Storage) {
            return res.json({ domains: [] });
        }

        const domains = q3Storage.listCustomDomains();
        res.json({
            success: true,
            count: domains.length,
            domains
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =========================================================================
// QDP - QUANTUM DOMAIN PROTOCOL (.q TLD)
// =========================================================================

// Supported QDP TLDs
const QDP_TLDS = ['.q', '.quantum', '.qweb', '.q3'];

// Reserved single-char domains (platform owned)
const QDP_RESERVED_CHARS = new Set([
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'
]);

// Protected Web 2 brand names (identity manipulation prevention)
// These cannot be registered without verified ownership
const QDP_PROTECTED_BRANDS = new Set([
    // Tech Giants
    'google', 'microsoft', 'apple', 'amazon', 'meta', 'facebook', 'instagram',
    'twitter', 'x', 'tiktok', 'youtube', 'netflix', 'spotify', 'uber', 'lyft',
    'airbnb', 'dropbox', 'slack', 'zoom', 'discord', 'reddit', 'linkedin',
    'pinterest', 'snapchat', 'whatsapp', 'telegram', 'signal',
    // Cloud/Tech
    'aws', 'azure', 'gcp', 'cloudflare', 'vercel', 'netlify', 'heroku',
    'digitalocean', 'linode', 'vultr', 'github', 'gitlab', 'bitbucket',
    // Finance
    'paypal', 'stripe', 'visa', 'mastercard', 'amex', 'chase', 'bankofamerica',
    'wellsfargo', 'coinbase', 'binance', 'kraken', 'robinhood', 'venmo', 'cashapp',
    // E-commerce
    'ebay', 'shopify', 'etsy', 'walmart', 'target', 'bestbuy', 'aliexpress',
    // Media
    'nytimes', 'cnn', 'bbc', 'reuters', 'bloomberg', 'forbes', 'techcrunch',
    // Gaming
    'steam', 'epic', 'nintendo', 'playstation', 'xbox', 'roblox', 'minecraft',
    // Crypto
    'bitcoin', 'ethereum', 'solana', 'cardano', 'polygon', 'opensea',
    // Common impersonation targets
    'admin', 'administrator', 'root', 'system', 'official', 'support', 'help',
    'security', 'verify', 'verified', 'auth', 'login', 'signin', 'account',
    'gov', 'government', 'police', 'fbi', 'cia', 'irs', 'tax',
    // Platform reserved
    'cr8os', 'quantum', 'quantumcloud', 'q3', 'qdp', 'web5', 'aevov', 'convobuilder'
]);

// QDP domain registry (in-memory, persisted to S3)
let qdpRegistry = new Map();
let qdpAnalytics = new Map(); // domain -> { visits, bandwidth, lastAccess }
let qdpRateLimiter = new Map(); // ip -> { count, resetTime }

// Rate limit config
const QDP_RATE_LIMIT = {
    registrationsPerHour: 10,
    lookupsPerMinute: 100,
    windowMs: 60 * 60 * 1000 // 1 hour
};

/**
 * Load QDP registry from S3 on startup
 */
async function loadQDPRegistry() {
    try {
        const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
        const s3Client = new S3Client({
            endpoint: edgeConfig.Q3 Carrier.endpoint,
            region: edgeConfig.Q3 Carrier.region,
            credentials: {
                accessKeyId: process.env.Q3_CARRIER_ACCESS_KEY || process.env.Q3_CARRIER_ID,
                secretAccessKey: process.env.Q3_CARRIER_SECRET_KEY || process.env.Q3_CARRIER_SECRET,
            },
            forcePathStyle: true,
        });

        // List all QDR files
        const listResult = await s3Client.send(new ListObjectsV2Command({
            Bucket: edgeConfig.Q3 Carrier.bucket,
            Prefix: 'q3/qdp/domains/'
        }));

        if (!listResult.Contents) {
            console.log('[QDP] No existing domains found');
            return;
        }

        // Load each QDR
        for (const obj of listResult.Contents) {
            if (!obj.Key.endsWith('.qdr')) continue;

            try {
                const getResult = await s3Client.send(new GetObjectCommand({
                    Bucket: edgeConfig.Q3 Carrier.bucket,
                    Key: obj.Key
                }));

                const body = await getResult.Body.transformToString();
                const qdr = JSON.parse(body);
                const name = qdr.qdn.replace(/\.[a-z0-9]+$/, '');
                qdpRegistry.set(name, qdr);
            } catch (err) {
                console.warn(`[QDP] Failed to load ${obj.Key}:`, err.message);
            }
        }

        console.log(`[QDP] ✅ Loaded ${qdpRegistry.size} domains from S3`);
    } catch (err) {
        console.error('[QDP] Failed to load registry:', err.message);
    }
}

/**
 * Check rate limit for an IP
 */
function checkRateLimit(ip, type = 'registration') {
    const key = `${ip}:${type}`;
    const now = Date.now();
    const limit = type === 'registration' ? QDP_RATE_LIMIT.registrationsPerHour : QDP_RATE_LIMIT.lookupsPerMinute;
    const window = type === 'registration' ? QDP_RATE_LIMIT.windowMs : 60000;

    let record = qdpRateLimiter.get(key);

    if (!record || now > record.resetTime) {
        record = { count: 0, resetTime: now + window };
        qdpRateLimiter.set(key, record);
    }

    record.count++;

    if (record.count > limit) {
        return { limited: true, retryAfter: Math.ceil((record.resetTime - now) / 1000) };
    }

    return { limited: false };
}

/**
 * Track domain analytics
 */
function trackAnalytics(domain, bytes = 0) {
    let stats = qdpAnalytics.get(domain);
    if (!stats) {
        stats = { visits: 0, bandwidth: 0, lastAccess: 0, firstAccess: Date.now() };
        qdpAnalytics.set(domain, stats);
    }
    stats.visits++;
    stats.bandwidth += bytes;
    stats.lastAccess = Date.now();
}

/**
 * Invalidate edge cache for a domain
 */
async function invalidateCache(domain) {
    // This would call Cloudflare API to purge cache
    // For now, we'll log the intent
    console.log(`[QDP] Cache invalidation requested for: ${domain}`);

    // In production, would use:
    // await fetch('https://api.cloudflare.com/client/v4/zones/{zone}/purge_cache', {
    //     method: 'POST',
    //     headers: { 'Authorization': `Bearer ${CF_TOKEN}` },
    //     body: JSON.stringify({ files: [`https://${domain}.q/*`] })
    // });

    return true;
}

/**
 * Check if domain is protected/reserved
 */
function checkDomainProtection(name) {
    const cleanName = name.toLowerCase();

    // Single char = platform reserved
    if (cleanName.length === 1 && QDP_RESERVED_CHARS.has(cleanName)) {
        return { blocked: true, reason: 'reserved', message: 'Single-character domains are platform reserved' };
    }

    // Brand protection
    if (QDP_PROTECTED_BRANDS.has(cleanName)) {
        return {
            blocked: true,
            reason: 'brand-protected',
            message: `"${cleanName}" is a protected brand name. Contact brand-claims@cr8os.io to verify ownership.`
        };
    }

    // Check for brand variants (typosquatting prevention)
    for (const brand of QDP_PROTECTED_BRANDS) {
        // Exact substring match for longer brands
        if (brand.length >= 4 && cleanName.includes(brand) && cleanName !== brand) {
            return {
                blocked: true,
                reason: 'brand-variant',
                message: `Domain may infringe on protected brand "${brand}". Web 5 prohibits identity manipulation.`
            };
        }
    }

    return { blocked: false };
}

/**
 * POST /api/qdp/register
 * Register a .q domain
 */
app.post('/api/qdp/register', async (req, res) => {
    try {
        const { name, siteId, owner, tld } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Domain name required' });
        }

        // Support multiple TLDs, default to .q
        const selectedTld = QDP_TLDS.includes(tld) ? tld : '.q';
        const cleanName = name.toLowerCase().replace(/\.(q|quantum|qweb|q3)$/, '').replace(/[^a-z0-9-]/g, '');

        // Check length
        if (cleanName.length < 2) {
            return res.status(400).json({ error: 'Domain must be 2+ characters' });
        }

        if (cleanName.length > 63) {
            return res.status(400).json({ error: 'Domain name too long (max 63 chars)' });
        }

        // Check protection (reserved, brands, variants)
        const protection = checkDomainProtection(cleanName);
        if (protection.blocked) {
            return res.status(403).json({
                error: protection.reason,
                message: protection.message,
                domain: `${cleanName}${selectedTld}`
            });
        }

        // Check if already registered
        if (qdpRegistry.has(cleanName)) {
            return res.status(409).json({
                error: 'Domain already registered',
                domain: `${cleanName}.q`
            });
        }

        // Create QDR (Quantum Domain Record)
        const qdr = {
            qdn: `${cleanName}.q`,
            version: 1,
            siteId: siteId || null,
            records: {
                root: siteId ? `q3://${siteId}:0@edge/` : null
            },
            owner: owner || 'anonymous',
            registeredAt: Date.now(),
            signature: null, // Would be Ed25519 signature
            quantum: {
                entangled: [],
                fallback: null
            },
            ttl: 300
        };

        qdpRegistry.set(cleanName, qdr);

        // Sync to S3 for edge worker
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        const s3Client = new S3Client({
            endpoint: edgeConfig.Q3 Carrier.endpoint,
            region: edgeConfig.Q3 Carrier.region,
            credentials: {
                accessKeyId: process.env.Q3_CARRIER_ACCESS_KEY || process.env.Q3_CARRIER_ID,
                secretAccessKey: process.env.Q3_CARRIER_SECRET_KEY || process.env.Q3_CARRIER_SECRET,
            },
            forcePathStyle: true,
        });

        await s3Client.send(new PutObjectCommand({
            Bucket: edgeConfig.Q3 Carrier.bucket,
            Key: `q3/qdp/domains/${cleanName}.qdr`,
            Body: JSON.stringify(qdr, null, 2),
            ContentType: 'application/json',
        }));

        console.log(`[QDP] ✅ Registered: ${cleanName}.q`);

        res.json({
            success: true,
            domain: `${cleanName}.q`,
            qdr,
            quantumAddress: qdr.records.root
        });
    } catch (error) {
        console.error('[QDP] Registration error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/qdp/resolve/:domain
 * Resolve a .q domain to its QDR
 */
app.get('/api/qdp/resolve/:domain', async (req, res) => {
    try {
        const cleanName = req.params.domain.toLowerCase().replace(/\.q$/, '');

        // Check reserved
        if (QDP_RESERVED.has(cleanName)) {
            return res.json({
                domain: `${cleanName}.q`,
                reserved: true,
                owner: 'platform'
            });
        }

        const qdr = qdpRegistry.get(cleanName);
        if (!qdr) {
            return res.status(404).json({
                domain: `${cleanName}.q`,
                available: true
            });
        }

        res.json({
            domain: `${cleanName}.q`,
            qdr
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/qdp/domains
 * List all registered .q domains
 */
app.get('/api/qdp/domains', (req, res) => {
    const domains = Array.from(qdpRegistry.entries()).map(([name, qdr]) => ({
        domain: `${name}.q`,
        siteId: qdr.siteId,
        owner: qdr.owner,
        registeredAt: qdr.registeredAt
    }));

    res.json({
        count: domains.length,
        reserved: QDP_RESERVED.size,
        domains
    });
});

/**
 * PUT /api/qdp/:domain/link
 * Link a .q domain to a Q3 site
 */
app.put('/api/qdp/:domain/link', async (req, res) => {
    try {
        const cleanName = req.params.domain.toLowerCase().replace(/\.q$/, '');
        const { siteId } = req.body;

        const qdr = qdpRegistry.get(cleanName);
        if (!qdr) {
            return res.status(404).json({ error: 'Domain not registered' });
        }

        qdr.siteId = siteId;
        qdr.records.root = `q3://${siteId}:0@edge/`;

        // Sync to S3
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        const s3Client = new S3Client({
            endpoint: edgeConfig.Q3 Carrier.endpoint,
            region: edgeConfig.Q3 Carrier.region,
            credentials: {
                accessKeyId: process.env.Q3_CARRIER_ACCESS_KEY || process.env.Q3_CARRIER_ID,
                secretAccessKey: process.env.Q3_CARRIER_SECRET_KEY || process.env.Q3_CARRIER_SECRET,
            },
            forcePathStyle: true,
        });

        await s3Client.send(new PutObjectCommand({
            Bucket: edgeConfig.Q3 Carrier.bucket,
            Key: `q3/qdp/domains/${cleanName}.qdr`,
            Body: JSON.stringify(qdr, null, 2),
            ContentType: 'application/json',
        }));

        res.json({
            success: true,
            domain: `${cleanName}.q`,
            siteId,
            quantumAddress: qdr.records.root
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/qdp/:domain/transfer
 * Transfer domain ownership to a new owner
 */
app.post('/api/qdp/:domain/transfer', async (req, res) => {
    try {
        const cleanName = req.params.domain.toLowerCase().replace(/\.q$/, '');
        const { currentOwner, newOwner, signature } = req.body;

        if (!newOwner) {
            return res.status(400).json({ error: 'New owner required' });
        }

        const qdr = qdpRegistry.get(cleanName);
        if (!qdr) {
            return res.status(404).json({ error: 'Domain not registered' });
        }

        // Verify current owner (in production, would verify cryptographic signature)
        if (currentOwner && qdr.owner !== currentOwner && qdr.owner !== 'anonymous') {
            return res.status(403).json({ error: 'Not authorized to transfer this domain' });
        }

        const previousOwner = qdr.owner;
        qdr.owner = newOwner;
        qdr.transferHistory = qdr.transferHistory || [];
        qdr.transferHistory.push({
            from: previousOwner,
            to: newOwner,
            timestamp: Date.now()
        });

        // Sync to S3
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        const s3Client = new S3Client({
            endpoint: edgeConfig.Q3 Carrier.endpoint,
            region: edgeConfig.Q3 Carrier.region,
            credentials: {
                accessKeyId: process.env.Q3_CARRIER_ACCESS_KEY || process.env.Q3_CARRIER_ID,
                secretAccessKey: process.env.Q3_CARRIER_SECRET_KEY || process.env.Q3_CARRIER_SECRET,
            },
            forcePathStyle: true,
        });

        await s3Client.send(new PutObjectCommand({
            Bucket: edgeConfig.Q3 Carrier.bucket,
            Key: `q3/qdp/domains/${cleanName}.qdr`,
            Body: JSON.stringify(qdr, null, 2),
            ContentType: 'application/json',
        }));

        console.log(`[QDP] 🔄 Transferred ${cleanName}.q: ${previousOwner} → ${newOwner}`);

        res.json({
            success: true,
            domain: `${cleanName}.q`,
            previousOwner,
            newOwner
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/qdp/:domain/subdomain
 * Register a subdomain under an existing domain
 */
app.post('/api/qdp/:domain/subdomain', async (req, res) => {
    try {
        const parentDomain = req.params.domain.toLowerCase().replace(/\.q$/, '');
        const { subdomain, siteId } = req.body;

        if (!subdomain) {
            return res.status(400).json({ error: 'Subdomain name required' });
        }

        const parentQdr = qdpRegistry.get(parentDomain);
        if (!parentQdr) {
            return res.status(404).json({ error: 'Parent domain not registered' });
        }

        const cleanSub = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
        const fullDomain = `${cleanSub}.${parentDomain}`;

        // Initialize subdomains array
        parentQdr.subdomains = parentQdr.subdomains || {};
        parentQdr.subdomains[cleanSub] = {
            siteId: siteId || null,
            quantumAddress: siteId ? `q3://${siteId}:0@edge/` : null,
            createdAt: Date.now()
        };

        // Sync to S3
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        const s3Client = new S3Client({
            endpoint: edgeConfig.Q3 Carrier.endpoint,
            region: edgeConfig.Q3 Carrier.region,
            credentials: {
                accessKeyId: process.env.Q3_CARRIER_ACCESS_KEY || process.env.Q3_CARRIER_ID,
                secretAccessKey: process.env.Q3_CARRIER_SECRET_KEY || process.env.Q3_CARRIER_SECRET,
            },
            forcePathStyle: true,
        });

        await s3Client.send(new PutObjectCommand({
            Bucket: edgeConfig.Q3 Carrier.bucket,
            Key: `q3/qdp/domains/${parentDomain}.qdr`,
            Body: JSON.stringify(parentQdr, null, 2),
            ContentType: 'application/json',
        }));

        console.log(`[QDP] ✅ Subdomain registered: ${fullDomain}.q`);

        res.json({
            success: true,
            subdomain: `${fullDomain}.q`,
            parent: `${parentDomain}.q`
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/qdp/:domain/analytics
 * Get analytics for a domain
 */
app.get('/api/qdp/:domain/analytics', (req, res) => {
    const cleanName = req.params.domain.toLowerCase().replace(/\.q$/, '');
    const stats = qdpAnalytics.get(cleanName) || { visits: 0, bandwidth: 0, lastAccess: null };

    res.json({
        domain: `${cleanName}.q`,
        analytics: stats
    });
});

/**
 * GET /api/qdp/stats
 * Get overall QDP system statistics
 */
app.get('/api/qdp/stats', (req, res) => {
    const totalDomains = qdpRegistry.size;
    const totalVisits = Array.from(qdpAnalytics.values()).reduce((sum, s) => sum + s.visits, 0);
    const totalBandwidth = Array.from(qdpAnalytics.values()).reduce((sum, s) => sum + s.bandwidth, 0);

    res.json({
        system: {
            totalDomains,
            reservedDomains: QDP_RESERVED_CHARS.size,
            protectedBrands: QDP_PROTECTED_BRANDS.size,
            supportedTLDs: QDP_TLDS
        },
        analytics: {
            totalVisits,
            totalBandwidthBytes: totalBandwidth,
            totalBandwidthGB: (totalBandwidth / (1024 * 1024 * 1024)).toFixed(2)
        }
    });
});

/**
 * POST /api/qdp/:domain/purge
 * Purge edge cache for a domain
 */
app.post('/api/qdp/:domain/purge', async (req, res) => {
    const cleanName = req.params.domain.toLowerCase().replace(/\.q$/, '');

    const qdr = qdpRegistry.get(cleanName);
    if (!qdr) {
        return res.status(404).json({ error: 'Domain not registered' });
    }

    await invalidateCache(cleanName);

    res.json({
        success: true,
        domain: `${cleanName}.q`,
        message: 'Cache purge requested'
    });
});

// Initialize QDP registry on startup
setTimeout(() => {
    loadQDPRegistry().catch(err => console.error('[QDP] Init failed:', err));
}, 2000);

// =========================================================================
// QDP DISPUTE RESOLUTION / BRAND CLAIMS
// =========================================================================

// In-memory claims storage
let qdpClaims = [];

/**
 * POST /api/qdp/claims
 * Submit a brand claim for a protected domain
 */
app.post('/api/qdp/claims', async (req, res) => {
    try {
        const { domain, claimantEmail, trademarkNumber, evidence, company } = req.body;

        if (!domain || !claimantEmail) {
            return res.status(400).json({ error: 'Domain and email required' });
        }

        const cleanName = domain.toLowerCase().replace(/\.q$/, '');

        // Check if domain is actually protected
        if (!QDP_PROTECTED_BRANDS.has(cleanName)) {
            return res.status(400).json({
                error: 'Domain not protected',
                message: `${cleanName}.q is not a protected brand. Register it directly.`
            });
        }

        const claim = {
            id: `claim-${crypto.randomBytes(8).toString('hex')}`,
            domain: `${cleanName}.q`,
            claimantEmail,
            company: company || null,
            trademarkNumber: trademarkNumber || null,
            evidence: evidence || null,
            status: 'pending',
            submittedAt: Date.now(),
            reviewedAt: null,
            reviewedBy: null,
            resolution: null
        };

        qdpClaims.push(claim);

        console.log(`[QDP] 📋 Brand claim submitted: ${cleanName}.q by ${claimantEmail}`);

        res.json({
            success: true,
            claim,
            message: 'Claim submitted for review. You will be notified via email.'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/qdp/claims
 * List all claims (admin only in production)
 */
app.get('/api/qdp/claims', (req, res) => {
    res.json({
        count: qdpClaims.length,
        claims: qdpClaims.map(c => ({
            id: c.id,
            domain: c.domain,
            status: c.status,
            submittedAt: c.submittedAt
        }))
    });
});

/**
 * POST /api/qdp/claims/:claimId/approve
 * Approve a brand claim (admin only)
 */
app.post('/api/qdp/claims/:claimId/approve', async (req, res) => {
    try {
        const claim = qdpClaims.find(c => c.id === req.params.claimId);
        if (!claim) {
            return res.status(404).json({ error: 'Claim not found' });
        }

        claim.status = 'approved';
        claim.reviewedAt = Date.now();
        claim.reviewedBy = req.body.reviewer || 'admin';
        claim.resolution = 'Domain released to verified owner';

        // Create the domain for the claimant
        const cleanName = claim.domain.replace('.q', '');
        const qdr = {
            qdn: claim.domain,
            version: 1,
            siteId: null,
            records: { root: null },
            owner: claim.claimantEmail,
            registeredAt: Date.now(),
            claimId: claim.id,
            quantum: { entangled: [], fallback: null },
            ttl: 300
        };

        qdpRegistry.set(cleanName, qdr);

        // Sync to S3
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
        const s3Client = new S3Client({
            endpoint: edgeConfig.Q3 Carrier.endpoint,
            region: edgeConfig.Q3 Carrier.region,
            credentials: {
                accessKeyId: process.env.Q3_CARRIER_ACCESS_KEY || process.env.Q3_CARRIER_ID,
                secretAccessKey: process.env.Q3_CARRIER_SECRET_KEY || process.env.Q3_CARRIER_SECRET,
            },
            forcePathStyle: true,
        });

        await s3Client.send(new PutObjectCommand({
            Bucket: edgeConfig.Q3 Carrier.bucket,
            Key: `q3/qdp/domains/${cleanName}.qdr`,
            Body: JSON.stringify(qdr, null, 2),
            ContentType: 'application/json',
        }));

        console.log(`[QDP] ✅ Brand claim approved: ${claim.domain} → ${claim.claimantEmail}`);

        res.json({
            success: true,
            claim,
            domain: claim.domain,
            message: 'Claim approved. Domain registered to claimant.'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/qdp/claims/:claimId/reject
 * Reject a brand claim (admin only)
 */
app.post('/api/qdp/claims/:claimId/reject', (req, res) => {
    const claim = qdpClaims.find(c => c.id === req.params.claimId);
    if (!claim) {
        return res.status(404).json({ error: 'Claim not found' });
    }

    claim.status = 'rejected';
    claim.reviewedAt = Date.now();
    claim.reviewedBy = req.body.reviewer || 'admin';
    claim.resolution = req.body.reason || 'Insufficient evidence';

    console.log(`[QDP] ❌ Brand claim rejected: ${claim.domain}`);

    res.json({
        success: true,
        claim,
        message: 'Claim rejected.'
    });
});

// =========================================================================
// QUANTUM ISP - Internet Service Provider
// =========================================================================

/**
 * POST /api/isp/customers
 * Create new ISP customer
 */
app.post('/api/isp/customers', (req, res) => {
    try {
        const { name, tier, contact } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Customer name required' });
        }

        const customer = quantumISP.createISPCustomer(name, tier || 2, contact);
        res.json({ success: true, customer });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/isp/customers
 * List all customers
 */
app.get('/api/isp/customers', (req, res) => {
    const customers = quantumISP.listISPCustomers();
    res.json({
        count: customers.length,
        customers,
        tiers: quantumISP.ISP_TIERS
    });
});

/**
 * GET /api/isp/customers/:id
 * Get customer by ID
 */
app.get('/api/isp/customers/:id', (req, res) => {
    const customer = quantumISP.getISPCustomer(req.params.id);
    if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
    }
    res.json({ customer });
});

/**
 * POST /api/isp/bandwidth
 * Allocate EPR bandwidth
 */
app.post('/api/isp/bandwidth', (req, res) => {
    try {
        const { customerId, rateKHz, fidelity } = req.body;
        if (!customerId || !rateKHz) {
            return res.status(400).json({ error: 'customerId and rateKHz required' });
        }

        const result = quantumISP.allocateBandwidth(customerId, rateKHz, fidelity || 0.95);
        if (result.error) {
            return res.status(400).json(result);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/isp/bandwidth/:customerId
 * Get customer's bandwidth allocations
 */
app.get('/api/isp/bandwidth/:customerId', (req, res) => {
    const allocations = quantumISP.getCustomerAllocations(req.params.customerId);
    res.json({ allocations });
});

/**
 * POST /api/isp/qkd
 * Provision QKD service
 */
app.post('/api/isp/qkd', (req, res) => {
    try {
        const { customerId, protocol, keyRateBps } = req.body;
        if (!customerId || !protocol) {
            return res.status(400).json({ error: 'customerId and protocol required' });
        }

        const result = quantumISP.provisionQKD(customerId, protocol, keyRateBps || 1000);
        if (result.error) {
            return res.status(400).json(result);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/isp/qkd/:sessionId/generate
 * Generate key bits
 */
app.post('/api/isp/qkd/:sessionId/generate', (req, res) => {
    const { numBits } = req.body;
    const result = quantumISP.generateKeyBits(req.params.sessionId, numBits || 1000);
    if (result.error) {
        return res.status(404).json(result);
    }
    res.json(result);
});

/**
 * GET /api/isp/qkd/:sessionId/qber
 * Get session QBER
 */
app.get('/api/isp/qkd/:sessionId/qber', (req, res) => {
    const result = quantumISP.getSessionQBER(req.params.sessionId);
    if (result.error) {
        return res.status(404).json(result);
    }
    res.json(result);
});

/**
 * GET /api/isp/billing/:customerId
 * Calculate monthly bill
 */
app.get('/api/isp/billing/:customerId', (req, res) => {
    const result = quantumISP.calculateBill(req.params.customerId);
    if (result.error) {
        return res.status(404).json(result);
    }
    res.json(result);
});

/**
 * POST /api/isp/metrics
 * Record performance metrics
 */
app.post('/api/isp/metrics', (req, res) => {
    try {
        const { customerId, uptime, fidelity, latency, keyRate } = req.body;
        if (!customerId) {
            return res.status(400).json({ error: 'customerId required' });
        }

        const result = quantumISP.recordMetrics(
            customerId,
            uptime || 99,
            fidelity || 0.97,
            latency || 20,
            keyRate || 5000
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/isp/sla/:customerId
 * Get SLA report
 */
app.get('/api/isp/sla/:customerId', (req, res) => {
    const result = quantumISP.getSLAReport(req.params.customerId);
    if (result.error) {
        return res.status(404).json(result);
    }
    res.json(result);
});

/**
 * POST /api/isp/link/q3
 * Link customer to Q3 site
 */
app.post('/api/isp/link/q3', (req, res) => {
    const { customerId, siteId } = req.body;
    const result = quantumISP.linkQ3Site(customerId, siteId);
    if (result.error) {
        return res.status(404).json(result);
    }
    res.json(result);
});

/**
 * POST /api/isp/link/qdp
 * Link customer to .q domain
 */
app.post('/api/isp/link/qdp', (req, res) => {
    const { customerId, domain } = req.body;
    const result = quantumISP.linkQDomain(customerId, domain);
    if (result.error) {
        return res.status(404).json(result);
    }
    res.json(result);
});

/**
 * GET /api/isp/stats
 * Get ISP system stats
 */
app.get('/api/isp/stats', (req, res) => {
    const stats = quantumISP.getISPStats();
    res.json(stats);
});

// =========================================================================
// QUANTUM WEB - Mesh Network & Entanglement
// =========================================================================

/**
 * POST /api/qweb/nodes
 * Register mesh node
 */
app.post('/api/qweb/nodes', (req, res) => {
    try {
        const { name, endpoint, capabilities } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Node name required' });
        }
        const node = quantumWeb.registerNode(name, endpoint, capabilities);
        res.json({ success: true, node });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/qweb/nodes
 * List all mesh nodes
 */
app.get('/api/qweb/nodes', (req, res) => {
    const nodes = quantumWeb.listNodes();
    res.json({ count: nodes.length, nodes });
});

/**
 * POST /api/qweb/peers
 * Connect two nodes as peers
 */
app.post('/api/qweb/peers', (req, res) => {
    const { nodeId1, nodeId2 } = req.body;
    const result = quantumWeb.connectPeers(nodeId1, nodeId2);
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

/**
 * POST /api/qweb/entanglement
 * Create EPR pair
 */
app.post('/api/qweb/entanglement', (req, res) => {
    try {
        const { nodeId1, nodeId2, fidelity } = req.body;
        if (!nodeId1 || !nodeId2) {
            return res.status(400).json({ error: 'Two nodeIds required' });
        }
        const result = quantumWeb.createEntanglementPair(nodeId1, nodeId2, fidelity);
        if (result.error) {
            return res.status(400).json(result);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/qweb/entanglement
 * List EPR pairs
 */
app.get('/api/qweb/entanglement', (req, res) => {
    const pairs = quantumWeb.listEntanglementPairs(req.query.nodeId);
    res.json({ count: pairs.length, pairs });
});

/**
 * POST /api/qweb/entanglement/:id/consume
 * Consume EPR pair
 */
app.post('/api/qweb/entanglement/:id/consume', (req, res) => {
    const result = quantumWeb.consumeEntanglementPair(req.params.id, req.body.purpose);
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

/**
 * POST /api/qweb/patterns
 * Register pattern
 */
app.post('/api/qweb/patterns', (req, res) => {
    try {
        const { sourceNodeId, type, data, fitnessImprovement } = req.body;
        if (!sourceNodeId || !type || !data) {
            return res.status(400).json({ error: 'sourceNodeId, type, and data required' });
        }
        const result = quantumWeb.registerPattern(sourceNodeId, type, data, fitnessImprovement);
        if (result.error) {
            return res.status(400).json(result);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/qweb/patterns
 * List patterns
 */
app.get('/api/qweb/patterns', (req, res) => {
    const patterns = quantumWeb.listPatterns(req.query.status);
    res.json({ count: patterns.length, patterns });
});

/**
 * POST /api/qweb/patterns/:id/validate
 * Validate pattern
 */
app.post('/api/qweb/patterns/:id/validate', (req, res) => {
    const { validatorNodeId, confidence } = req.body;
    const result = quantumWeb.validatePattern(req.params.id, validatorNodeId, confidence);
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

/**
 * GET /api/qweb/topology
 * Get network topology
 */
app.get('/api/qweb/topology', (req, res) => {
    const topology = quantumWeb.getTopology();
    res.json(topology);
});

/**
 * POST /api/qweb/partition/:nodeId
 * Simulate partition
 */
app.post('/api/qweb/partition/:nodeId', (req, res) => {
    const result = quantumWeb.simulatePartition(req.params.nodeId);
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

/**
 * POST /api/qweb/rejoin/:nodeId
 * Rejoin from partition
 */
app.post('/api/qweb/rejoin/:nodeId', (req, res) => {
    const result = quantumWeb.rejoinFromPartition(req.params.nodeId);
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

/**
 * GET /api/qweb/stats
 * Get QuantumWeb stats
 */
app.get('/api/qweb/stats', (req, res) => {
    const stats = quantumWeb.getWebStats();
    res.json(stats);
});

// =========================================================================
// QUANTUM SEC - Quantum Security Platform
// =========================================================================

/**
 * POST /api/qsec/qkd
 * Generate QKD key
 */
app.post('/api/qsec/qkd', (req, res) => {
    try {
        const { protocol, lengthBits, partnerId } = req.body;
        if (!protocol || !lengthBits) {
            return res.status(400).json({ error: 'protocol and lengthBits required' });
        }
        const result = quantumSec.generateQKDKey(protocol, lengthBits, partnerId);
        if (result.error) {
            return res.status(400).json(result);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/qsec/qkd
 * List QKD keys
 */
app.get('/api/qsec/qkd', (req, res) => {
    const keys = quantumSec.listQKDKeys(req.query.partnerId);
    res.json({ count: keys.length, keys });
});

/**
 * POST /api/qsec/qkd/:id/consume
 * Consume QKD key
 */
app.post('/api/qsec/qkd/:id/consume', (req, res) => {
    const result = quantumSec.consumeQKDKey(req.params.id);
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

/**
 * POST /api/qsec/pqc/keypair
 * Generate PQC keypair
 */
app.post('/api/qsec/pqc/keypair', (req, res) => {
    try {
        const { algorithm } = req.body;
        if (!algorithm) {
            return res.status(400).json({ error: 'algorithm required' });
        }
        const result = quantumSec.generatePQCKeypair(algorithm);
        if (result.error) {
            return res.status(400).json(result);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/qsec/pqc/keypairs
 * List PQC keypairs
 */
app.get('/api/qsec/pqc/keypairs', (req, res) => {
    const keypairs = quantumSec.listPQCKeypairs();
    res.json({ count: keypairs.length, keypairs });
});

/**
 * POST /api/qsec/pqc/sign
 * Sign with PQC
 */
app.post('/api/qsec/pqc/sign', (req, res) => {
    const { keypairId, data } = req.body;
    const result = quantumSec.signWithPQC(keypairId, data);
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

/**
 * POST /api/qsec/pqc/encapsulate
 * Encapsulate with PQC KEM
 */
app.post('/api/qsec/pqc/encapsulate', (req, res) => {
    const { keypairId } = req.body;
    const result = quantumSec.encapsulateWithPQC(keypairId);
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

/**
 * POST /api/qsec/qrng
 * Generate quantum random
 */
app.post('/api/qsec/qrng', (req, res) => {
    const { lengthBytes, format } = req.body;
    const result = quantumSec.generateQRNG(lengthBytes || 32, format || 'hex');
    res.json(result);
});

/**
 * POST /api/qsec/qrng/integers
 * Generate random integers
 */
app.post('/api/qsec/qrng/integers', (req, res) => {
    const { min, max, count } = req.body;
    const result = quantumSec.generateQRNGIntegers(min || 0, max || 100, count || 10);
    res.json(result);
});

/**
 * POST /api/qsec/auth/token
 * Generate auth token
 */
app.post('/api/qsec/auth/token', (req, res) => {
    const { userId, validitySeconds } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }
    const result = quantumSec.generateAuthToken(userId, validitySeconds);
    res.json(result);
});

/**
 * POST /api/qsec/auth/verify
 * Verify auth token
 */
app.post('/api/qsec/auth/verify', (req, res) => {
    const { token } = req.body;
    const result = quantumSec.verifyAuthToken(token);
    res.json(result);
});

/**
 * POST /api/qsec/hybrid
 * Create hybrid key
 */
app.post('/api/qsec/hybrid', (req, res) => {
    const { qkdKeyId, pqcKeypairId } = req.body;
    const result = quantumSec.createHybridKey(qkdKeyId, pqcKeypairId);
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

/**
 * GET /api/qsec/stats
 * Get QuantumSec stats
 */
app.get('/api/qsec/stats', (req, res) => {
    const stats = quantumSec.getSecStats();
    res.json(stats);
});

// =========================================================================
// QUANTUM LAMBDA - Serverless Quantum Functions
// =========================================================================

/**
 * POST /api/qlambda/functions
 * Create function
 */
app.post('/api/qlambda/functions', (req, res) => {
    try {
        const { name, circuit, qubits, shots, timeout } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Function name required' });
        }
        const func = quantumLambda.createFunction(name, circuit || [], { qubits, shots, timeout });
        res.json({ success: true, function: func });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/qlambda/functions
 * List functions
 */
app.get('/api/qlambda/functions', (req, res) => {
    const funcs = quantumLambda.listFunctions(req.query.state);
    res.json({ count: funcs.length, functions: funcs });
});

/**
 * GET /api/qlambda/functions/:id
 * Get function
 */
app.get('/api/qlambda/functions/:id', (req, res) => {
    const func = quantumLambda.getFunction(req.params.id);
    if (!func) {
        return res.status(404).json({ error: 'Function not found' });
    }
    res.json({ function: func });
});

/**
 * POST /api/qlambda/functions/:id/invoke
 * Invoke function
 */
app.post('/api/qlambda/functions/:id/invoke', (req, res) => {
    const result = quantumLambda.invokeFunction(req.params.id, req.body.input);
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

/**
 * DELETE /api/qlambda/functions/:id
 * Delete function
 */
app.delete('/api/qlambda/functions/:id', (req, res) => {
    const result = quantumLambda.deleteFunction(req.params.id);
    if (result.error) {
        return res.status(404).json(result);
    }
    res.json(result);
});

/**
 * GET /api/qlambda/invocations
 * List invocations
 */
app.get('/api/qlambda/invocations', (req, res) => {
    const invs = quantumLambda.listInvocations(req.query.functionId, parseInt(req.query.limit) || 50);
    res.json({ count: invs.length, invocations: invs });
});

/**
 * POST /api/qlambda/triggers
 * Create trigger
 */
app.post('/api/qlambda/triggers', (req, res) => {
    const { functionId, type, config } = req.body;
    if (!functionId || !type) {
        return res.status(400).json({ error: 'functionId and type required' });
    }
    const result = quantumLambda.createTrigger(functionId, type, config);
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

/**
 * GET /api/qlambda/triggers
 * List triggers
 */
app.get('/api/qlambda/triggers', (req, res) => {
    const trigs = quantumLambda.listTriggers(req.query.functionId);
    res.json({ count: trigs.length, triggers: trigs });
});

/**
 * POST /api/qlambda/triggers/:id/fire
 * Fire trigger
 */
app.post('/api/qlambda/triggers/:id/fire', (req, res) => {
    const result = quantumLambda.fireTrigger(req.params.id, req.body.eventData);
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

/**
 * GET /api/qlambda/billing/:functionId
 * Get function billing
 */
app.get('/api/qlambda/billing/:functionId', (req, res) => {
    const result = quantumLambda.getFunctionBilling(req.params.functionId);
    if (result.error) {
        return res.status(404).json(result);
    }
    res.json(result);
});

/**
 * GET /api/qlambda/stats
 * Get Lambda stats
 */
app.get('/api/qlambda/stats', (req, res) => {
    const stats = quantumLambda.getLambdaStats();
    res.json(stats);
});

// =========================================================================
// QUANTUM DB - Quantum-Accelerated Database
// =========================================================================

/**
 * POST /api/qdb/databases
 * Create database
 */
app.post('/api/qdb/databases', (req, res) => {
    try {
        const { name, encryption } = req.body;
        if (!name) {
            return res.status(400).json({ error: 'Database name required' });
        }
        const db = quantumDB.createDatabase(name, { encryption });
        res.json({ success: true, database: db });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/qdb/databases
 * List databases
 */
app.get('/api/qdb/databases', (req, res) => {
    const dbs = quantumDB.listDatabases();
    res.json({ count: dbs.length, databases: dbs });
});

/**
 * DELETE /api/qdb/databases/:id
 * Delete database
 */
app.delete('/api/qdb/databases/:id', (req, res) => {
    const result = quantumDB.deleteDatabase(req.params.id);
    if (result.error) {
        return res.status(404).json(result);
    }
    res.json(result);
});

/**
 * POST /api/qdb/collections
 * Create collection
 */
app.post('/api/qdb/collections', (req, res) => {
    const { dbId, name, schema } = req.body;
    if (!dbId || !name) {
        return res.status(400).json({ error: 'dbId and name required' });
    }
    const col = quantumDB.createCollection(dbId, name, schema);
    if (col.error) {
        return res.status(400).json(col);
    }
    res.json({ success: true, collection: col });
});

/**
 * GET /api/qdb/collections
 * List collections
 */
app.get('/api/qdb/collections', (req, res) => {
    const cols = quantumDB.listCollections(req.query.dbId);
    res.json({ count: cols.length, collections: cols });
});

/**
 * POST /api/qdb/documents
 * Insert document
 */
app.post('/api/qdb/documents', (req, res) => {
    const { collectionId, data } = req.body;
    if (!collectionId || !data) {
        return res.status(400).json({ error: 'collectionId and data required' });
    }
    const result = quantumDB.insertDocument(collectionId, data);
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

/**
 * GET /api/qdb/documents/:id
 * Get document
 */
app.get('/api/qdb/documents/:id', (req, res) => {
    const doc = quantumDB.getDocument(req.params.id);
    if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
    }
    res.json({ document: doc });
});

/**
 * PUT /api/qdb/documents/:id
 * Update document
 */
app.put('/api/qdb/documents/:id', (req, res) => {
    const result = quantumDB.updateDocument(req.params.id, req.body.data);
    if (result.error) {
        return res.status(404).json(result);
    }
    res.json(result);
});

/**
 * DELETE /api/qdb/documents/:id
 * Delete document
 */
app.delete('/api/qdb/documents/:id', (req, res) => {
    const result = quantumDB.deleteDocument(req.params.id);
    if (result.error) {
        return res.status(404).json(result);
    }
    res.json(result);
});

/**
 * POST /api/qdb/query
 * Execute query
 */
app.post('/api/qdb/query', (req, res) => {
    const { collectionId, query, useQuantum } = req.body;
    if (!collectionId) {
        return res.status(400).json({ error: 'collectionId required' });
    }
    const result = quantumDB.executeQuery(collectionId, query || {}, useQuantum !== false);
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

/**
 * POST /api/qdb/grover
 * Grover search
 */
app.post('/api/qdb/grover', (req, res) => {
    const { collectionId, condition } = req.body;
    if (!collectionId || !condition) {
        return res.status(400).json({ error: 'collectionId and condition required' });
    }
    const result = quantumDB.groverSearch(collectionId, condition);
    if (result.error) {
        return res.status(400).json(result);
    }
    res.json(result);
});

/**
 * GET /api/qdb/queries
 * List queries
 */
app.get('/api/qdb/queries', (req, res) => {
    const queries = quantumDB.listQueries(req.query.dbId, parseInt(req.query.limit) || 50);
    res.json({ count: queries.length, queries });
});

/**
 * GET /api/qdb/stats
 * Get QDB stats
 */
app.get('/api/qdb/stats', (req, res) => {
    const stats = quantumDB.getDBStats();
    res.json(stats);
});

// =========================================================================
// QUANTUM MONITOR - Unified Observability
// =========================================================================

app.post('/api/qmon/metrics', (req, res) => {
    const { system, name, value, type, tags } = req.body;
    if (!system || !name || value === undefined) {
        return res.status(400).json({ error: 'system, name, and value required' });
    }
    const result = quantumMonitor.recordMetric(system, name, value, type, tags);
    res.json(result);
});

app.get('/api/qmon/metrics', (req, res) => {
    const metrics = quantumMonitor.listMetrics(req.query.system);
    res.json({ count: metrics.length, metrics });
});

app.get('/api/qmon/metrics/:system/:name/stats', (req, res) => {
    const stats = quantumMonitor.getMetricStats(req.params.system, req.params.name);
    if (stats.error) return res.status(404).json(stats);
    res.json(stats);
});

app.post('/api/qmon/alerts', (req, res) => {
    const { system, name, condition, threshold, severity } = req.body;
    if (!system || !name || !condition || threshold === undefined) {
        return res.status(400).json({ error: 'system, name, condition, threshold required' });
    }
    const result = quantumMonitor.createAlert(system, name, condition, threshold, severity);
    res.json(result);
});

app.get('/api/qmon/alerts', (req, res) => {
    const triggered = req.query.triggered === 'true' ? true : req.query.triggered === 'false' ? false : null;
    const alerts = quantumMonitor.listAlerts(req.query.system, triggered);
    res.json({ count: alerts.length, alerts });
});

app.post('/api/qmon/alerts/:id/acknowledge', (req, res) => {
    const result = quantumMonitor.acknowledgeAlert(req.params.id);
    if (result.error) return res.status(404).json(result);
    res.json(result);
});

app.get('/api/qmon/health', (req, res) => {
    const health = quantumMonitor.getAllSystemsHealth();
    res.json({ systems: health });
});

app.get('/api/qmon/health/:system', (req, res) => {
    const health = quantumMonitor.getSystemHealth(req.params.system);
    res.json(health);
});

app.post('/api/qmon/dashboards', (req, res) => {
    const { name, widgets } = req.body;
    const result = quantumMonitor.createDashboard(name, widgets);
    res.json(result);
});

app.get('/api/qmon/dashboards', (req, res) => {
    const dashboards = quantumMonitor.listDashboards();
    res.json({ count: dashboards.length, dashboards });
});

app.get('/api/qmon/stats', (req, res) => {
    const stats = quantumMonitor.getMonitorStats();
    res.json(stats);
});

// =========================================================================
// QUANTUM CDN - Content Delivery Network
// =========================================================================

app.post('/api/qcdn/distributions', (req, res) => {
    const { name, origin, cachePolicy, quantumSecured, regions } = req.body;
    if (!name || !origin) {
        return res.status(400).json({ error: 'name and origin required' });
    }
    const result = quantumCDN.createDistribution(name, origin, { cachePolicy, quantumSecured, regions });
    res.json(result);
});

app.get('/api/qcdn/distributions', (req, res) => {
    const dists = quantumCDN.listDistributions();
    res.json({ count: dists.length, distributions: dists });
});

app.get('/api/qcdn/distributions/:id', (req, res) => {
    const dist = quantumCDN.getDistribution(req.params.id);
    if (!dist) return res.status(404).json({ error: 'Distribution not found' });
    res.json({ distribution: dist });
});

app.delete('/api/qcdn/distributions/:id', (req, res) => {
    const result = quantumCDN.deleteDistribution(req.params.id);
    if (result.error) return res.status(404).json(result);
    res.json(result);
});

app.post('/api/qcdn/edges', (req, res) => {
    const { region, endpoint } = req.body;
    if (!region || !endpoint) {
        return res.status(400).json({ error: 'region and endpoint required' });
    }
    const result = quantumCDN.registerEdgeNode(region, endpoint);
    if (result.error) return res.status(400).json(result);
    res.json(result);
});

app.get('/api/qcdn/edges', (req, res) => {
    const nodes = quantumCDN.listEdgeNodes(req.query.region);
    res.json({ count: nodes.length, edges: nodes });
});

app.post('/api/qcdn/cache', (req, res) => {
    const { distId, path, content, ttl } = req.body;
    if (!distId || !path) {
        return res.status(400).json({ error: 'distId and path required' });
    }
    const result = quantumCDN.cacheContent(distId, path, content || '', ttl);
    res.json(result);
});

app.get('/api/qcdn/cache/:distId/:path', (req, res) => {
    const path = req.params.path || '/';
    const result = quantumCDN.getCacheEntry(req.params.distId, path);
    res.json(result);
});

app.post('/api/qcdn/cache/:distId/invalidate', (req, res) => {
    const result = quantumCDN.invalidateCache(req.params.distId, req.body.pathPattern);
    res.json(result);
});

app.get('/api/qcdn/stats', (req, res) => {
    const stats = quantumCDN.getCDNStats();
    res.json(stats);
});

// =========================================================================
// QUANTUM FLOW - Workflow Orchestration
// =========================================================================

app.post('/api/qflow/workflows', (req, res) => {
    const { name, steps, timeout, retryPolicy } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'name required' });
    }
    const result = quantumFlow.createWorkflow(name, steps || [], { timeout, retryPolicy });
    res.json(result);
});

app.get('/api/qflow/workflows', (req, res) => {
    const workflows = quantumFlow.listWorkflows();
    res.json({ count: workflows.length, workflows });
});

app.get('/api/qflow/workflows/:id', (req, res) => {
    const wf = quantumFlow.getWorkflow(req.params.id);
    if (!wf) return res.status(404).json({ error: 'Workflow not found' });
    res.json({ workflow: wf });
});

app.put('/api/qflow/workflows/:id', (req, res) => {
    const result = quantumFlow.updateWorkflow(req.params.id, req.body);
    if (result.error) return res.status(404).json(result);
    res.json(result);
});

app.delete('/api/qflow/workflows/:id', (req, res) => {
    const result = quantumFlow.deleteWorkflow(req.params.id);
    if (result.error) return res.status(404).json(result);
    res.json(result);
});

app.post('/api/qflow/workflows/:id/execute', (req, res) => {
    const result = quantumFlow.executeWorkflow(req.params.id, req.body.input);
    if (result.error) return res.status(400).json(result);
    res.json(result);
});

app.get('/api/qflow/executions', (req, res) => {
    const execs = quantumFlow.listExecutions(req.query.workflowId, parseInt(req.query.limit) || 50);
    res.json({ count: execs.length, executions: execs });
});

app.get('/api/qflow/executions/:id', (req, res) => {
    const exec = quantumFlow.getExecution(req.params.id);
    if (!exec) return res.status(404).json({ error: 'Execution not found' });
    res.json({ execution: exec });
});

app.post('/api/qflow/executions/:id/cancel', (req, res) => {
    const result = quantumFlow.cancelExecution(req.params.id);
    if (result.error) return res.status(400).json(result);
    res.json(result);
});

app.post('/api/qflow/templates', (req, res) => {
    const { name, description, steps } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const result = quantumFlow.createTemplate(name, description, steps || []);
    res.json(result);
});

app.get('/api/qflow/templates', (req, res) => {
    const templates = quantumFlow.listTemplates();
    res.json({ count: templates.length, templates });
});

app.get('/api/qflow/stats', (req, res) => {
    const stats = quantumFlow.getFlowStats();
    res.json(stats);
});

// =========================================================================
// QUANTUM VAULT - Secrets & Key Management
// =========================================================================
app.post('/api/qvault/vaults', (req, res) => { const r = quantumVault.createVault(req.body.name, req.body.encryption); res.json(r); });
app.get('/api/qvault/vaults', (req, res) => { res.json({ vaults: quantumVault.listVaults() }); });
app.post('/api/qvault/secrets', (req, res) => { const { vaultId, name, value, type, ttl } = req.body; const r = quantumVault.storeSecret(vaultId, name, value, type, ttl); res.json(r); });
app.get('/api/qvault/secrets', (req, res) => { res.json({ secrets: quantumVault.listSecrets(req.query.vaultId) }); });
app.get('/api/qvault/secrets/:id', (req, res) => { const r = quantumVault.getSecret(req.params.id); if (r.error) return res.status(404).json(r); res.json(r); });
app.post('/api/qvault/secrets/:id/rotate', (req, res) => { const r = quantumVault.rotateSecret(req.params.id, req.body.value); if (r.error) return res.status(404).json(r); res.json(r); });
app.get('/api/qvault/stats', (req, res) => { res.json(quantumVault.getVaultStats()); });

// =========================================================================
// QUANTUM QUEUE - Message Queue
// =========================================================================
app.post('/api/qqueue/queues', (req, res) => { const r = quantumQueue.createQueue(req.body.name, req.body); res.json(r); });
app.get('/api/qqueue/queues', (req, res) => { res.json({ queues: quantumQueue.listQueues() }); });
app.post('/api/qqueue/messages', (req, res) => { const { queueId, body, delaySeconds } = req.body; const r = quantumQueue.sendMessage(queueId, body, delaySeconds); res.json(r); });
app.get('/api/qqueue/messages', (req, res) => { const r = quantumQueue.receiveMessages(req.query.queueId, parseInt(req.query.max) || 10); res.json(r); });
app.delete('/api/qqueue/messages/:id', (req, res) => { const r = quantumQueue.deleteMessage(req.params.id); if (r.error) return res.status(404).json(r); res.json(r); });
app.get('/api/qqueue/stats', (req, res) => { res.json(quantumQueue.getQueueStats()); });

// =========================================================================
// QUANTUM BACKUP - Backup Service
// =========================================================================
app.post('/api/qbackup/jobs', (req, res) => { const { name, sourceType, sourceId, schedule, retention } = req.body; const r = quantumBackup.createBackupJob(name, sourceType, sourceId, schedule, retention); res.json(r); });
app.get('/api/qbackup/jobs', (req, res) => { res.json({ jobs: quantumBackup.listBackupJobs() }); });
app.post('/api/qbackup/jobs/:id/run', (req, res) => { const r = quantumBackup.runBackup(req.params.id); if (r.error) return res.status(404).json(r); res.json(r); });
app.get('/api/qbackup/snapshots', (req, res) => { res.json({ snapshots: quantumBackup.listSnapshots(req.query.jobId) }); });
app.post('/api/qbackup/snapshots/:id/restore', (req, res) => { const r = quantumBackup.restoreSnapshot(req.params.id); if (r.error) return res.status(404).json(r); res.json(r); });
app.get('/api/qbackup/stats', (req, res) => { res.json(quantumBackup.getBackupStats()); });

// =========================================================================
// QUANTUM FINANCE - Financial Services
// =========================================================================
app.post('/api/qfinance/portfolios', (req, res) => { const r = quantumFinance.createPortfolio(req.body.name, req.body.assets); res.json(r); });
app.post('/api/qfinance/portfolios/:id/optimize', (req, res) => { const r = quantumFinance.optimizePortfolio(req.params.id); if (r.error) return res.status(404).json(r); res.json(r); });
app.post('/api/qfinance/portfolios/:id/risk', (req, res) => { const r = quantumFinance.analyzeRisk(req.params.id); if (r.error) return res.status(404).json(r); res.json(r); });
app.post('/api/qfinance/fraud-detect', (req, res) => { const r = quantumFinance.detectFraud(req.body); res.json(r); });
app.get('/api/qfinance/stats', (req, res) => { res.json(quantumFinance.getFinanceStats()); });

// =========================================================================
// QUANTUM HEALTH - Healthcare Services
// =========================================================================
app.post('/api/qhealth/patients', (req, res) => { const r = quantumHealth.createPatientRecord(req.body); res.json(r); });
app.get('/api/qhealth/patients/:id', (req, res) => { const r = quantumHealth.getPatientRecord(req.params.id, req.headers.authorization); if (r.error) return res.status(403).json(r); res.json(r); });
app.post('/api/qhealth/genome/:patientId', (req, res) => { const r = quantumHealth.analyzeGenome(req.params.patientId, req.body.sequence); res.json(r); });
app.post('/api/qhealth/drug-discovery', (req, res) => { const r = quantumHealth.drugDiscoverySimulation(req.body); res.json(r); });
app.get('/api/qhealth/stats', (req, res) => { res.json(quantumHealth.getHealthStats()); });

// =========================================================================
// QUANTUM ANALYTICS - Business Intelligence
// =========================================================================
app.post('/api/qanalytics/datasets', (req, res) => { const r = quantumAnalytics.createDataset(req.body.name, req.body.schema); res.json(r); });
app.post('/api/qanalytics/datasets/:id/ingest', (req, res) => { const r = quantumAnalytics.ingestData(req.params.id, req.body.rows || []); if (r.error) return res.status(404).json(r); res.json(r); });
app.post('/api/qanalytics/query', (req, res) => { const r = quantumAnalytics.runAnalyticsQuery(req.body.datasetId, req.body.query); if (r.error) return res.status(404).json(r); res.json(r); });
app.post('/api/qanalytics/ml', (req, res) => { const r = quantumAnalytics.mlInference(req.body.datasetId, req.body.model); if (r.error) return res.status(404).json(r); res.json(r); });
app.get('/api/qanalytics/stats', (req, res) => { res.json(quantumAnalytics.getAnalyticsStats()); });

// =========================================================================
// QUANTUM STREAM - Real-Time Streaming
// =========================================================================
app.post('/api/qstream/streams', (req, res) => { const r = quantumStream.createStream(req.body.name, req.body.partitions); res.json(r); });
app.post('/api/qstream/publish', (req, res) => { const r = quantumStream.publishEvent(req.body.streamId, req.body.event); if (r.error) return res.status(404).json(r); res.json(r); });
app.post('/api/qstream/subscribe', (req, res) => { const r = quantumStream.subscribeToStream(req.body.streamId, req.body.callbackUrl); if (r.error) return res.status(404).json(r); res.json(r); });
app.get('/api/qstream/events/:streamId', (req, res) => { const r = quantumStream.getStreamEvents(req.params.streamId, parseInt(req.query.limit) || 100); res.json(r); });
app.get('/api/qstream/stats', (req, res) => { res.json(quantumStream.getStreamStats()); });

// Legacy bucket endpoints for backward compatibility
app.post('/api/q3/buckets', async (req, res) => {
    // Map to objects API - buckets are just named object containers in native Q3
    const { name } = req.body;
    res.json({ success: true, bucket: { name, id: crypto.randomBytes(8).toString('hex'), createdAt: Date.now() } });
});

app.get('/api/q3/buckets', (req, res) => {
    res.json({ buckets: [] }); // Native Q3 doesn't use buckets, uses flat object namespace
});

// =====================================================================
// Q3 ALIAS ROUTES (without /api prefix for frontend compatibility)
// =====================================================================
app.get('/q3/buckets', (req, res) => {
    res.json({ buckets: [] });
});

app.post('/q3/buckets', async (req, res) => {
    const { name } = req.body;
    res.json({ success: true, bucket: { name, id: crypto.randomBytes(8).toString('hex'), createdAt: Date.now() } });
});

app.get('/q3/sites', (req, res) => {
    res.json({ sites: [] }); // Q3 sites stored in Q3 Carrier
});

app.post('/q3/sites', async (req, res) => {
    res.json({ success: true, site: { id: 'site-' + crypto.randomBytes(8).toString('hex'), name: req.body.name } });
});

app.get('/q3/objects', async (req, res) => {
    if (!q3Storage) return res.json({ objects: [] });
    try {
        const objects = await q3Storage.list();
        res.json({ objects });
    } catch (e) {
        res.json({ objects: [] });
    }
});

/**
 * GET /api/q3/:bucket/objects
 * List objects in a bucket
 */
app.get('/api/q3/:bucket/objects', async (req, res) => {
    try {
        if (!q3Storage) {
            return res.status(503).json({ error: 'Q3 Storage not configured' });
        }

        const { bucket } = req.params;
        const { prefix } = req.query;

        const result = await q3Storage.listObjects(bucket, prefix);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/q3/:bucket/:key
 * Upload object to Q3 bucket
 */
app.put('/api/q3/:bucket/:key', async (req, res) => {
    try {
        if (!q3Storage) {
            return res.status(503).json({ error: 'Q3 Storage not configured' });
        }

        const { bucket, key } = req.params;
        const data = req.body.data || req.body;
        const metadata = req.body.metadata || {};

        const result = await q3Storage.putObject(bucket, key, data, metadata);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/q3/:bucket/:key
 * Download object from Q3 bucket
 */
app.get('/api/q3/:bucket/:key', async (req, res) => {
    try {
        if (!q3Storage) {
            return res.status(503).json({ error: 'Q3 Storage not configured' });
        }

        const { bucket, key } = req.params;
        const result = await q3Storage.getObject(bucket, key);

        res.setHeader('Content-Type', result.contentType || 'application/octet-stream');
        res.setHeader('Content-Length', result.size);
        res.send(result.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/q3/:bucket/:key
 * Delete object from Q3 bucket
 */
app.delete('/api/q3/:bucket/:key', async (req, res) => {
    try {
        if (!q3Storage) {
            return res.status(503).json({ error: 'Q3 Storage not configured' });
        }

        const { bucket, key } = req.params;
        const result = await q3Storage.deleteObject(bucket, key);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// =================================================================
// REVERSE PROXY / REAL IP API
// =================================================================

/**
 * GET /api/proxy/routes
 * List all reverse proxy routes
 */
app.get('/api/proxy/routes', (req, res) => {
    try {
        if (!proxyManager) {
            return res.json({ routes: [] });
        }
        const routes = proxyManager.getRoutes();
        res.json({ routes, baseDomain: proxyManager.baseDomain });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Apply reverse proxy middleware
if (proxyManager) {
    app.use(proxyManager.middleware());
}

// =================================================================
// START SERVER
// =================================================================

const PORT = process.env.ALTER_API_PORT || 7472;

const server = app.listen(PORT, () => {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  🌐 Cr8OS ALTER - Unified Control API');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  REST API: http://localhost:${PORT}`);
    console.log(`  Dashboard: http://localhost:${PORT}/cr8os-alter-dashboard.html`);
    console.log(`  WebSocket: ws://localhost:${PORT}/ws`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Sleeper Compute:');
    console.log('    GET  /api/status     - Get system status');
    console.log('    POST /api/enable     - Enable sleeper compute');
    console.log('    POST /api/disable    - Disable and sleep workers');
    console.log('    POST /api/configure  - Configure scaling params');
    console.log('    POST /api/scale      - Scale to N workers');
    console.log('    POST /api/generate   - Generate N ACLDQs');
    console.log('    GET  /api/chain      - Get chain rotation status');
    console.log('    GET  /api/oriki      - Get ORIKI Deep status');
    console.log('  QUIC.cloud Domains:');
    console.log('    GET  /api/domains       - List all domains');
    console.log('    POST /api/domains       - Add new domain');
    console.log('    DEL  /api/domains/:name - Remove domain');
    console.log('    POST /api/domains/active- Set active domain');
    console.log('    POST /api/domains/health- Check all domain health');
    console.log('  Q3 Carrier / File Manager:');
    console.log('    GET  /api/Q3 Carrier     - Get Q3 Carrier status');
    console.log('    GET  /api/files/list - List folder contents');
    console.log('    GET  /api/files/get  - Get/download file');
    console.log('    POST /api/files/folder - Create folder');
    console.log('    POST /api/files/upload - Upload file');
    console.log('    PUT  /api/files/rename - Rename file/folder');
    console.log('    DEL  /api/files      - Delete file/folder');
    console.log('    GET  /api/files/stats - Storage statistics');
    console.log('  Q3 Quantum Storage:');
    console.log('    GET  /api/q3/stats          - Storage statistics');
    console.log('    GET  /api/q3/buckets        - List buckets');
    console.log('    POST /api/q3/buckets        - Create bucket');
    console.log('    GET  /api/q3/:bucket/objects- List objects');
    console.log('    PUT  /api/q3/:bucket/:key  - Upload object');
    console.log('    GET  /api/q3/:bucket/:key  - Download object');
    console.log('    DEL  /api/q3/:bucket/:key  - Delete object');
    console.log('  Reverse Proxy:');
    console.log('    GET  /api/proxy/routes      - List routes');
    console.log('═══════════════════════════════════════════════════════\n');
});

// Initialize core systems on startup
initializeSystem();

// ═══════════════════════════════════════════════════════════════════════════════
// CLOUD PERPETUAL MINING API
// Runs perpetually on quantum network, controllable via cr8os-alter dashboard
// ═══════════════════════════════════════════════════════════════════════════════

const { getCloudMiningService } = require('./cloud-mining-service');

// Initialize mining service (starts immediately and runs perpetually)
let miningService = null;
try {
    miningService = getCloudMiningService({
        walletAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        minWorkers: 10,
        maxWorkers: 100000000  // 100M workers max
    });
    console.log('[CloudMining] ⛏️ Perpetual mining service initialized');
} catch (e) {
    console.warn('[CloudMining] Mining service init warning:', e.message);
}

/**
 * GET /api/mining/status
 * Get current mining status, hashrate, shares, earnings
 */
app.get('/api/mining/status', (req, res) => {
    try {
        if (!miningService) {
            return res.status(503).json({ error: 'Mining service not initialized' });
        }
        res.json({
            success: true,
            ...miningService.getStatus()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/mining/scale
 * Scale workers up or down
 * Body: { workers: number } OR { add: number } OR { remove: number }
 */
app.post('/api/mining/scale', async (req, res) => {
    try {
        if (!miningService) {
            return res.status(503).json({ error: 'Mining service not initialized' });
        }

        const { workers, add, remove } = req.body;
        let newCount;

        if (workers !== undefined) {
            newCount = await miningService.scaleWorkers(workers);
        } else if (add !== undefined) {
            newCount = await miningService.addWorkers(add);
        } else if (remove !== undefined) {
            newCount = await miningService.removeWorkers(remove);
        } else {
            return res.status(400).json({ error: 'Specify workers, add, or remove' });
        }

        res.json({
            success: true,
            workers: newCount,
            status: miningService.getStatus()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/mining/history
 * Get historical performance data
 * Query: ?period=24h|7d|30d
 */
app.get('/api/mining/history', (req, res) => {
    try {
        if (!miningService) {
            return res.status(503).json({ error: 'Mining service not initialized' });
        }

        const period = req.query.period || '24h';
        res.json({
            success: true,
            ...miningService.getHistory(period)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/mining/earnings
 * Get detailed earnings breakdown
 */
app.get('/api/mining/earnings', (req, res) => {
    try {
        if (!miningService) {
            return res.status(503).json({ error: 'Mining service not initialized' });
        }

        const status = miningService.getStatus();
        res.json({
            success: true,
            btc: status.earnings.btc,
            usd: status.earnings.usd,
            shares: status.shares,
            estimatedDaily: {
                btc: (parseFloat(status.earnings.btc) / Math.max(1, status.uptime.seconds / 86400)).toFixed(8),
                usd: ((parseFloat(status.earnings.usd) / Math.max(1, status.uptime.seconds / 86400))).toFixed(2)
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/mining/pool
 * Change mining pool
 * Body: { pool: "host:port" }
 */
app.post('/api/mining/pool', (req, res) => {
    try {
        if (!miningService) {
            return res.status(503).json({ error: 'Mining service not initialized' });
        }

        const { pool } = req.body;
        if (!pool) {
            return res.status(400).json({ error: 'Pool address required (host:port)' });
        }

        // Would reconnect to new pool in production
        miningService.state.pool = pool;
        miningService.saveState();

        res.json({
            success: true,
            pool: miningService.state.pool,
            message: 'Pool updated (reconnecting...)'
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

console.log('  ⛏️ Cloud Mining (Perpetual):');
console.log('    GET  /api/mining/status   - Mining status, hashrate, shares');
console.log('    POST /api/mining/scale    - Scale workers up/down');
console.log('    GET  /api/mining/history  - Historical performance');
console.log('    GET  /api/mining/earnings - Earnings breakdown');
console.log('    POST /api/mining/pool     - Change mining pool');

// Initialize WebSocket
try {
    startWebSocket(server);
} catch (err) {
    console.warn('WebSocket initialization skipped:', err.message);
}

module.exports = { app, initializeSystem, miningService };
