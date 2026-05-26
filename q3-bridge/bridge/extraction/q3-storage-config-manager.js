// Q3 Carrier Config Manager - Persistent Settings with Versioning
// Stores config on Q3 Carrier with version history and changelog
// Only saves when changes are detected (hash comparison)

const crypto = require('crypto');
const AWS = require('aws-sdk');
const edgeConfig = require('./quantumcloud-edge-config');

// S3 Client
const s3 = new AWS.S3({
    endpoint: edgeConfig.Q3 Carrier.endpoint || 'https://s3.Q3 Carrier.eu',
    accessKeyId: edgeConfig.Q3 Carrier.accessKeyId,
    secretAccessKey: edgeConfig.Q3 Carrier.secretAccessKey,
    region: edgeConfig.Q3 Carrier.region || 'eu-west-1',
    s3ForcePathStyle: true,
    signatureVersion: 'v4',
});

const BUCKET = edgeConfig.Q3 Carrier.bucket || 'cr8os1';
const CONFIG_PREFIX = 'config/';
const CURRENT_KEY = `${CONFIG_PREFIX}current.json`;
const VERSIONS_PREFIX = `${CONFIG_PREFIX}versions/`;
const CHANGELOG_KEY = `${CONFIG_PREFIX}changelog.json`;

// Limits
const MAX_VERSIONS = 20;
const MAX_CHANGELOG_ENTRIES = 100;

/**
 * Hash config for change detection
 */
function hashConfig(config) {
    const normalized = JSON.stringify(config, Object.keys(config).sort());
    return crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16);
}

/**
 * Q3 Carrier Config Manager Class
 */
class Q3 CarrierConfigManager {
    constructor() {
        this.currentConfig = null;
        this.currentHash = null;
        this.versions = [];
        this.changelog = [];
    }

    /**
     * Load current config from Q3 Carrier
     */
    async load() {
        try {
            const result = await s3.getObject({
                Bucket: BUCKET,
                Key: CURRENT_KEY,
            }).promise();

            this.currentConfig = JSON.parse(result.Body.toString());
            this.currentHash = hashConfig(this.currentConfig);

            console.log(`📦 Config loaded (v${this.currentConfig._version || 1})`);
            return this.currentConfig;

        } catch (err) {
            if (err.code === 'NoSuchKey') {
                // First time - create default config
                console.log('📦 No config found, creating default...');
                this.currentConfig = this.getDefaultConfig();
                await this.save(this.currentConfig, 'Initial configuration');
                return this.currentConfig;
            }
            throw err;
        }
    }

    /**
     * Get default config structure
     */
    getDefaultConfig() {
        return {
            _version: 1,
            _createdAt: new Date().toISOString(),
            _updatedAt: new Date().toISOString(),

            // Domain configuration
            domains: edgeConfig.quicCloud.allDomains || [],

            // Storage workflow mode
            storageWorkflow: {
                mode: 'hybrid',
                hybridRatio: { quic: 0.7, Q3 Carrier: 0.3 },
            },

            // Worker settings
            workers: {
                maxConcurrent: 10,
                autoScale: true,
                minWorkers: 1,
                maxWorkers: 100,
            },

            // Engine reference
            engineReference: {
                basePath: edgeConfig.engineReference?.basePath || 'q/cr8OS-2.0',
                adminBucket: edgeConfig.Q3 Carrier?.adminBucket || 'wibackups',
            },

            // Feature flags
            features: {
                sleeperCompute: true,
                fileExplorer: true,
                domainFailover: true,
            },
        };
    }

    /**
     * Save config with automatic versioning
     * Only creates new version if content changed
     */
    async save(newConfig, changeDescription = 'Configuration update') {
        const newHash = hashConfig(newConfig);

        // Check if actually changed
        if (this.currentHash && this.currentHash === newHash) {
            console.log('📦 Config unchanged, skipping save');
            return { saved: false, reason: 'no changes' };
        }

        // Increment version
        const newVersion = (newConfig._version || 0) + 1;
        newConfig._version = newVersion;
        newConfig._updatedAt = new Date().toISOString();
        newConfig._hash = newHash;

        // Save current config
        await s3.putObject({
            Bucket: BUCKET,
            Key: CURRENT_KEY,
            Body: JSON.stringify(newConfig, null, 2),
            ContentType: 'application/json',
        }).promise();

        // Save version snapshot
        const versionKey = `${VERSIONS_PREFIX}${String(newVersion).padStart(5, '0')}.json`;
        await s3.putObject({
            Bucket: BUCKET,
            Key: versionKey,
            Body: JSON.stringify({
                ...newConfig,
                _savedAt: new Date().toISOString(),
                _changeDescription: changeDescription,
            }, null, 2),
            ContentType: 'application/json',
        }).promise();

        // Add changelog entry
        await this.addChangelogEntry({
            version: newVersion,
            timestamp: new Date().toISOString(),
            description: changeDescription,
            hash: newHash,
            previousHash: this.currentHash,
        });

        // Cleanup old versions
        await this.cleanupOldVersions();

        this.currentConfig = newConfig;
        this.currentHash = newHash;

        console.log(`📦 Config saved (v${newVersion}): ${changeDescription}`);
        return { saved: true, version: newVersion, hash: newHash };
    }

    /**
     * Get version history
     */
    async getVersions() {
        try {
            const result = await s3.listObjectsV2({
                Bucket: BUCKET,
                Prefix: VERSIONS_PREFIX,
            }).promise();

            const versions = [];
            for (const obj of result.Contents || []) {
                if (obj.Key.endsWith('.json')) {
                    try {
                        const data = await s3.getObject({
                            Bucket: BUCKET,
                            Key: obj.Key,
                        }).promise();

                        const config = JSON.parse(data.Body.toString());
                        versions.push({
                            version: config._version,
                            savedAt: config._savedAt,
                            description: config._changeDescription,
                            hash: config._hash,
                            size: obj.Size,
                        });
                    } catch (e) {
                        // Skip invalid versions
                    }
                }
            }

            // Sort by version descending
            versions.sort((a, b) => b.version - a.version);
            this.versions = versions;
            return versions;

        } catch (err) {
            console.error('Failed to load versions:', err.message);
            return [];
        }
    }

    /**
     * Get specific version
     */
    async getVersion(versionNumber) {
        const versionKey = `${VERSIONS_PREFIX}${String(versionNumber).padStart(5, '0')}.json`;

        try {
            const result = await s3.getObject({
                Bucket: BUCKET,
                Key: versionKey,
            }).promise();

            return JSON.parse(result.Body.toString());
        } catch (err) {
            if (err.code === 'NoSuchKey') {
                return null;
            }
            throw err;
        }
    }

    /**
     * Rollback to specific version
     */
    async rollback(versionNumber) {
        const oldConfig = await this.getVersion(versionNumber);

        if (!oldConfig) {
            throw new Error(`Version ${versionNumber} not found`);
        }

        // Save as new version with rollback note
        const restoredConfig = { ...oldConfig };
        delete restoredConfig._savedAt;
        delete restoredConfig._changeDescription;
        restoredConfig._version = this.currentConfig?._version || 0;

        const result = await this.save(
            restoredConfig,
            `Rollback to v${versionNumber}`
        );

        console.log(`🔄 Rolled back to v${versionNumber}`);
        return result;
    }

    /**
     * Add changelog entry
     */
    async addChangelogEntry(entry) {
        // Load existing changelog
        let changelog = [];
        try {
            const result = await s3.getObject({
                Bucket: BUCKET,
                Key: CHANGELOG_KEY,
            }).promise();
            changelog = JSON.parse(result.Body.toString());
        } catch (err) {
            if (err.code !== 'NoSuchKey') {
                console.warn('Could not load changelog:', err.message);
            }
        }

        // Add new entry at beginning
        changelog.unshift(entry);

        // Trim to max entries
        if (changelog.length > MAX_CHANGELOG_ENTRIES) {
            changelog = changelog.slice(0, MAX_CHANGELOG_ENTRIES);
        }

        // Save changelog
        await s3.putObject({
            Bucket: BUCKET,
            Key: CHANGELOG_KEY,
            Body: JSON.stringify(changelog, null, 2),
            ContentType: 'application/json',
        }).promise();

        this.changelog = changelog;
    }

    /**
     * Get changelog
     */
    async getChangelog(limit = 50) {
        try {
            const result = await s3.getObject({
                Bucket: BUCKET,
                Key: CHANGELOG_KEY,
            }).promise();

            const changelog = JSON.parse(result.Body.toString());
            this.changelog = changelog;
            return changelog.slice(0, limit);

        } catch (err) {
            if (err.code === 'NoSuchKey') {
                return [];
            }
            throw err;
        }
    }

    /**
     * Cleanup old versions beyond MAX_VERSIONS
     */
    async cleanupOldVersions() {
        const versions = await this.getVersions();

        if (versions.length <= MAX_VERSIONS) {
            return;
        }

        const toDelete = versions.slice(MAX_VERSIONS);

        for (const v of toDelete) {
            const versionKey = `${VERSIONS_PREFIX}${String(v.version).padStart(5, '0')}.json`;
            try {
                await s3.deleteObject({
                    Bucket: BUCKET,
                    Key: versionKey,
                }).promise();
                console.log(`🗑️ Deleted old version: v${v.version}`);
            } catch (e) {
                // Ignore cleanup errors
            }
        }
    }

    /**
     * Compare two versions
     */
    async diff(v1, v2) {
        const config1 = await this.getVersion(v1);
        const config2 = await this.getVersion(v2);

        if (!config1 || !config2) {
            throw new Error('One or both versions not found');
        }

        const changes = [];
        const allKeys = new Set([
            ...Object.keys(config1),
            ...Object.keys(config2),
        ]);

        for (const key of allKeys) {
            if (key.startsWith('_')) continue; // Skip metadata

            const val1 = JSON.stringify(config1[key]);
            const val2 = JSON.stringify(config2[key]);

            if (val1 !== val2) {
                changes.push({
                    key,
                    v1Value: config1[key],
                    v2Value: config2[key],
                });
            }
        }

        return {
            v1: { version: config1._version, hash: config1._hash },
            v2: { version: config2._version, hash: config2._hash },
            changes,
        };
    }

    /**
     * Update specific config section
     */
    async updateSection(section, value, description) {
        if (!this.currentConfig) {
            await this.load();
        }

        this.currentConfig[section] = value;
        return this.save(this.currentConfig, description || `Updated ${section}`);
    }

    /**
     * Get current config status
     */
    getStatus() {
        return {
            loaded: !!this.currentConfig,
            version: this.currentConfig?._version || 0,
            hash: this.currentHash,
            updatedAt: this.currentConfig?._updatedAt,
        };
    }
}

// Singleton
let configManager = null;

function getConfigManager() {
    if (!configManager) {
        configManager = new Q3 CarrierConfigManager();
    }
    return configManager;
}

module.exports = {
    Q3 CarrierConfigManager,
    getConfigManager,
    hashConfig,
};
