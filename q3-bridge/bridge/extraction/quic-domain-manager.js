// QUIC.cloud Multi-Domain Manager with Failover
// Handles multiple domain keys with automatic failover for redundancy

const https = require('https');
const config = require('./quantumcloud-edge-config');

class QUICDomainManager {
    constructor() {
        this.domains = config.quicCloud.allDomains;
        this.currentDomainIndex = 0;
        this.failoverConfig = config.quicCloud.failover;

        // Track domain health
        this.domainHealth = new Map();
        this.domains.forEach(d => {
            this.domainHealth.set(d.name, {
                healthy: true,
                lastCheck: null,
                failCount: 0,
                lastError: null,
            });
        });

        // Start health monitoring
        if (this.failoverConfig.enabled && this.domains.length > 1) {
            this.startHealthMonitoring();
        }
    }

    /**
     * Get the current active domain
     */
    getActiveDomain() {
        return this.domains[this.currentDomainIndex] || null;
    }

    /**
     * Get all configured domains
     */
    getAllDomains() {
        return this.domains.map((d, idx) => ({
            ...d,
            isActive: idx === this.currentDomainIndex,
            health: this.domainHealth.get(d.name),
        }));
    }

    /**
     * Execute a request with automatic failover
     */
    async executeWithFailover(requestFn) {
        const maxRetries = this.failoverConfig.maxRetries;
        const startIndex = this.currentDomainIndex;
        let lastError = null;

        // Try each domain up to maxRetries times
        for (let attempt = 0; attempt < this.domains.length * maxRetries; attempt++) {
            const domain = this.domains[this.currentDomainIndex];

            if (!domain) {
                throw new Error('No QUIC.cloud domains configured');
            }

            const health = this.domainHealth.get(domain.name);

            try {
                console.log(`🌐 Attempting request via ${domain.name} (${domain.domainId || 'no-id'})`);

                const result = await requestFn(domain);

                // Success - reset fail count
                health.failCount = 0;
                health.healthy = true;
                health.lastCheck = new Date().toISOString();

                // If we're not on primary and it's healthy, consider auto-recovery
                if (this.failoverConfig.autoRecover && this.currentDomainIndex !== 0) {
                    const primaryHealth = this.domainHealth.get(this.domains[0]?.name);
                    if (primaryHealth?.healthy) {
                        console.log('🔄 Auto-recovering to primary domain');
                        this.currentDomainIndex = 0;
                    }
                }

                return result;

            } catch (err) {
                lastError = err;
                health.failCount++;
                health.lastError = err.message;
                health.lastCheck = new Date().toISOString();

                console.warn(`⚠️ ${domain.name} failed (attempt ${health.failCount}): ${err.message}`);

                // Check if we should failover
                if (health.failCount >= maxRetries) {
                    health.healthy = false;

                    // Move to next domain
                    this.currentDomainIndex = (this.currentDomainIndex + 1) % this.domains.length;

                    if (this.currentDomainIndex === startIndex) {
                        // We've tried all domains
                        throw new Error(`All QUIC.cloud domains failed. Last error: ${lastError.message}`);
                    }

                    console.log(`🔀 Failing over to ${this.domains[this.currentDomainIndex].name}`);

                    // Wait before trying next domain
                    await this.delay(this.failoverConfig.failoverDelayMs);
                }
            }
        }

        throw lastError || new Error('All QUIC.cloud domains exhausted');
    }

    /**
     * Make authenticated request to QUIC.cloud API
     */
    async quicRequest(path, options = {}, domain = null) {
        domain = domain || this.getActiveDomain();

        if (!domain || !domain.domainKey) {
            throw new Error('No QUIC.cloud domain configured');
        }

        return new Promise((resolve, reject) => {
            const url = new URL(path, config.quicCloud.apiEndpoint);

            const req = https.request(url, {
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-QUIC-Domain-Key': domain.domainKey,
                    'X-QUIC-Domain-ID': domain.domainId,
                    ...options.headers,
                },
                timeout: options.timeout || 30000,
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (res.statusCode >= 400) {
                            reject(new Error(json.error || `HTTP ${res.statusCode}`));
                        } else {
                            resolve(json);
                        }
                    } catch {
                        resolve({ raw: data, statusCode: res.statusCode });
                    }
                });
            });

            req.on('error', reject);
            req.on('timeout', () => reject(new Error('Request timeout')));

            if (options.body) {
                req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
            }
            req.end();
        });
    }

    /**
     * Health check for all domains
     */
    async checkAllDomainHealth() {
        console.log('🏥 Checking domain health...');

        const results = await Promise.allSettled(
            this.domains.map(async (domain) => {
                try {
                    await this.quicRequest('/health', { timeout: 10000 }, domain);
                    return { domain: domain.name, healthy: true };
                } catch (err) {
                    return { domain: domain.name, healthy: false, error: err.message };
                }
            })
        );

        results.forEach((result) => {
            if (result.status === 'fulfilled') {
                const { domain, healthy, error } = result.value;
                const health = this.domainHealth.get(domain);
                if (health) {
                    health.healthy = healthy;
                    health.lastCheck = new Date().toISOString();
                    if (error) health.lastError = error;
                    if (healthy) health.failCount = 0;
                }
            }
        });

        return this.getAllDomains();
    }

    /**
     * Start background health monitoring
     */
    startHealthMonitoring() {
        setInterval(async () => {
            await this.checkAllDomainHealth();

            // Auto-recover to primary if it's healthy
            if (this.failoverConfig.autoRecover && this.currentDomainIndex !== 0) {
                const primaryHealth = this.domainHealth.get(this.domains[0]?.name);
                if (primaryHealth?.healthy) {
                    console.log('🔄 Primary domain recovered, switching back');
                    this.currentDomainIndex = 0;
                }
            }
        }, this.failoverConfig.healthCheckIntervalMs);
    }

    /**
     * Manually set active domain
     */
    setActiveDomain(domainNameOrIndex) {
        if (typeof domainNameOrIndex === 'number') {
            if (domainNameOrIndex >= 0 && domainNameOrIndex < this.domains.length) {
                this.currentDomainIndex = domainNameOrIndex;
                return true;
            }
        } else {
            const idx = this.domains.findIndex(d => d.name === domainNameOrIndex);
            if (idx !== -1) {
                this.currentDomainIndex = idx;
                return true;
            }
        }
        return false;
    }

    /**
     * Add a new domain at runtime
     */
    addDomain(domain) {
        if (!domain.domainKey) {
            throw new Error('Domain key is required');
        }

        const newDomain = {
            domainKey: domain.domainKey,
            domainId: domain.domainId || '',
            name: domain.name || `runtime-${this.domains.length}`,
            priority: domain.priority || this.domains.length + 1,
        };

        this.domains.push(newDomain);
        this.domainHealth.set(newDomain.name, {
            healthy: true,
            lastCheck: null,
            failCount: 0,
            lastError: null,
        });

        console.log(`➕ Added domain: ${newDomain.name}`);
        return newDomain;
    }

    /**
     * Remove a domain at runtime
     */
    removeDomain(domainName) {
        const idx = this.domains.findIndex(d => d.name === domainName);
        if (idx === -1) return false;

        // Don't remove if it's the only domain
        if (this.domains.length === 1) {
            throw new Error('Cannot remove the only configured domain');
        }

        this.domains.splice(idx, 1);
        this.domainHealth.delete(domainName);

        // Adjust current index if needed
        if (this.currentDomainIndex >= this.domains.length) {
            this.currentDomainIndex = 0;
        }

        console.log(`➖ Removed domain: ${domainName}`);
        return true;
    }

    /**
     * Get status summary
     */
    getStatus() {
        return {
            configured: this.domains.length,
            activeDomain: this.getActiveDomain()?.name || 'none',
            domains: this.getAllDomains(),
            failoverEnabled: this.failoverConfig.enabled,
        };
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Singleton instance
let domainManager = null;

function getDomainManager() {
    if (!domainManager) {
        domainManager = new QUICDomainManager();
    }
    return domainManager;
}

module.exports = { QUICDomainManager, getDomainManager };
