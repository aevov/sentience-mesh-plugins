/**
 * Quantum Metrics Collector - Auto-collects metrics from all quantum systems
 * Feeds QuantumMonitor with real-time data from all 13 systems.
 */

const quantumMonitor = require('./quantum-monitor-api');

// System metric collectors
const collectors = {
    async collectISPMetrics() {
        try {
            const quantumISP = require('./quantum-isp-api');
            const stats = quantumISP.getISPStats();
            quantumMonitor.recordMetric('isp', 'customers', stats.customers?.total || 0);
            quantumMonitor.recordMetric('isp', 'bandwidth_allocated', stats.bandwidth?.totalAllocated || 0);
            quantumMonitor.recordMetric('isp', 'qkd_keys', stats.qkd?.totalKeys || 0);
        } catch (e) { console.error('[MetricCollector] ISP error:', e.message); }
    },

    async collectWebMetrics() {
        try {
            const quantumWeb = require('./quantum-web-api');
            const stats = quantumWeb.getWebStats();
            quantumMonitor.recordMetric('qweb', 'nodes', stats.mesh?.nodes || 0);
            quantumMonitor.recordMetric('qweb', 'epr_pairs', stats.entanglement?.totalPairs || 0);
            quantumMonitor.recordMetric('qweb', 'patterns', stats.patterns?.total || 0);
        } catch (e) { console.error('[MetricCollector] Web error:', e.message); }
    },

    async collectSecMetrics() {
        try {
            const quantumSec = require('./quantum-sec-api');
            const stats = quantumSec.getSecStats();
            quantumMonitor.recordMetric('qsec', 'qkd_keys', stats.qkd?.total || 0);
            quantumMonitor.recordMetric('qsec', 'pqc_keypairs', stats.pqc?.total || 0);
            quantumMonitor.recordMetric('qsec', 'auth_tokens', stats.auth?.total || 0);
        } catch (e) { console.error('[MetricCollector] Sec error:', e.message); }
    },

    async collectLambdaMetrics() {
        try {
            const quantumLambda = require('./quantum-lambda-api');
            const stats = quantumLambda.getLambdaStats();
            quantumMonitor.recordMetric('qlambda', 'functions', stats.functions?.total || 0);
            quantumMonitor.recordMetric('qlambda', 'invocations', stats.invocations?.total || 0);
            quantumMonitor.recordMetric('qlambda', 'warm_ratio', stats.performance?.warmRatio || 0, 'gauge');
        } catch (e) { console.error('[MetricCollector] Lambda error:', e.message); }
    },

    async collectDBMetrics() {
        try {
            const quantumDB = require('./quantum-db-api');
            const stats = quantumDB.getDBStats();
            quantumMonitor.recordMetric('qdb', 'databases', stats.databases?.total || 0);
            quantumMonitor.recordMetric('qdb', 'documents', stats.documents?.total || 0);
            quantumMonitor.recordMetric('qdb', 'queries', stats.queries?.total || 0);
        } catch (e) { console.error('[MetricCollector] DB error:', e.message); }
    },

    async collectCDNMetrics() {
        try {
            const quantumCDN = require('./quantum-cdn-api');
            const stats = quantumCDN.getCDNStats();
            quantumMonitor.recordMetric('qcdn', 'distributions', stats.distributions?.total || 0);
            quantumMonitor.recordMetric('qcdn', 'edge_nodes', stats.edgeNodes?.total || 0);
            quantumMonitor.recordMetric('qcdn', 'cache_entries', stats.cache?.entries || 0);
        } catch (e) { console.error('[MetricCollector] CDN error:', e.message); }
    },

    async collectFlowMetrics() {
        try {
            const quantumFlow = require('./quantum-flow-api');
            const stats = quantumFlow.getFlowStats();
            quantumMonitor.recordMetric('qflow', 'workflows', stats.workflows?.total || 0);
            quantumMonitor.recordMetric('qflow', 'executions', stats.executions?.total || 0);
        } catch (e) { console.error('[MetricCollector] Flow error:', e.message); }
    },

    async collectVaultMetrics() {
        try {
            const quantumVault = require('./quantum-vault-api');
            const stats = quantumVault.getVaultStats();
            quantumMonitor.recordMetric('qvault', 'vaults', stats.vaults || 0);
            quantumMonitor.recordMetric('qvault', 'secrets', stats.secrets || 0);
        } catch (e) { console.error('[MetricCollector] Vault error:', e.message); }
    },

    async collectQueueMetrics() {
        try {
            const quantumQueue = require('./quantum-queue-api');
            const stats = quantumQueue.getQueueStats();
            quantumMonitor.recordMetric('qqueue', 'queues', stats.queues || 0);
            quantumMonitor.recordMetric('qqueue', 'pending_messages', stats.pendingMessages || 0);
        } catch (e) { console.error('[MetricCollector] Queue error:', e.message); }
    },

    async collectBackupMetrics() {
        try {
            const quantumBackup = require('./quantum-backup-api');
            const stats = quantumBackup.getBackupStats();
            quantumMonitor.recordMetric('qbackup', 'jobs', stats.jobs || 0);
            quantumMonitor.recordMetric('qbackup', 'snapshots', stats.snapshots || 0);
        } catch (e) { console.error('[MetricCollector] Backup error:', e.message); }
    }
};

/**
 * Collect all metrics from all systems
 */
async function collectAll() {
    console.log('[MetricCollector] 📊 Collecting metrics from all systems...');
    await Promise.all(Object.values(collectors).map(fn => fn()));
    console.log('[MetricCollector] ✅ Metrics collection complete');
}

/**
 * Start periodic collection
 */
let collectorInterval = null;

function startCollector(intervalMs = 30000) {
    if (collectorInterval) return;
    collectAll(); // Initial collection
    collectorInterval = setInterval(collectAll, intervalMs);
    console.log(`[MetricCollector] 🚀 Started (every ${intervalMs / 1000}s)`);
}

function stopCollector() {
    if (collectorInterval) {
        clearInterval(collectorInterval);
        collectorInterval = null;
        console.log('[MetricCollector] ⏹️ Stopped');
    }
}

module.exports = {
    collectors,
    collectAll,
    startCollector,
    stopCollector
};
