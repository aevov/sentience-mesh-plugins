/**
 * QuantumMonitor API - JavaScript REST Interface
 * 
 * Unified observability: metrics, alerts, dashboards for all quantum systems.
 * Monitors ISP, QWeb, QSec, QLambda, QDB in real-time.
 */

// =========================================================================
// CONSTANTS
// =========================================================================

const METRIC_TYPES = {
    COUNTER: 'counter',
    GAUGE: 'gauge',
    HISTOGRAM: 'histogram'
};

const ALERT_SEVERITIES = {
    INFO: 'info',
    WARNING: 'warning',
    CRITICAL: 'critical'
};

const SYSTEMS = ['isp', 'qweb', 'qsec', 'qlambda', 'qdb'];

// In-memory stores
let metrics = new Map();
let alerts = [];
let dashboards = new Map();

let metricIdCounter = 0;
let alertIdCounter = 0;
let dashboardIdCounter = 0;

// =========================================================================
// METRICS
// =========================================================================

function recordMetric(system, name, value, type = 'gauge', tags = {}) {
    const id = `metric-${++metricIdCounter}`;
    const key = `${system}:${name}`;

    if (!metrics.has(key)) {
        metrics.set(key, {
            id,
            system,
            name,
            type,
            values: [],
            tags
        });
    }

    const metric = metrics.get(key);
    metric.values.push({
        value,
        timestamp: Date.now()
    });

    // Keep last 1000 values
    if (metric.values.length > 1000) {
        metric.values = metric.values.slice(-1000);
    }

    return { success: true, metric: key, value };
}

function getMetric(system, name) {
    const key = `${system}:${name}`;
    return metrics.get(key) || null;
}

function listMetrics(system = null) {
    const all = Array.from(metrics.values());
    if (system) {
        return all.filter(m => m.system === system);
    }
    return all;
}

function getMetricStats(system, name) {
    const metric = getMetric(system, name);
    if (!metric || metric.values.length === 0) {
        return { error: 'Metric not found' };
    }

    const values = metric.values.map(v => v.value);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    return {
        system,
        name,
        count: values.length,
        avg: avg.toFixed(3),
        min: min.toFixed(3),
        max: max.toFixed(3),
        latest: values[values.length - 1]
    };
}

// =========================================================================
// ALERTS
// =========================================================================

function createAlert(system, name, condition, threshold, severity = 'warning') {
    const id = `alert-${++alertIdCounter}`;

    const alert = {
        id,
        system,
        name,
        condition, // 'gt', 'lt', 'eq'
        threshold,
        severity,
        enabled: true,
        triggered: false,
        lastTriggered: null,
        triggerCount: 0,
        createdAt: Date.now()
    };

    alerts.push(alert);
    console.log(`[QMon] 🚨 Alert created: ${name} (${system})`);

    return { success: true, alert };
}

function triggerAlert(alertId, value) {
    const alert = alerts.find(a => a.id === alertId);
    if (!alert) return { error: 'Alert not found' };

    alert.triggered = true;
    alert.lastTriggered = Date.now();
    alert.lastValue = value;
    alert.triggerCount++;

    return { success: true, alert };
}

function listAlerts(system = null, triggered = null) {
    let result = alerts;
    if (system) result = result.filter(a => a.system === system);
    if (triggered !== null) result = result.filter(a => a.triggered === triggered);
    return result;
}

function acknowledgeAlert(alertId) {
    const alert = alerts.find(a => a.id === alertId);
    if (!alert) return { error: 'Alert not found' };

    alert.triggered = false;
    alert.acknowledgedAt = Date.now();

    return { success: true, alert };
}

// =========================================================================
// DASHBOARDS
// =========================================================================

function createDashboard(name, widgets = []) {
    const id = `dash-${++dashboardIdCounter}`;

    const dashboard = {
        id,
        name,
        widgets,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    dashboards.set(id, dashboard);
    return { success: true, dashboard };
}

function listDashboards() {
    return Array.from(dashboards.values());
}

function getDashboard(dashboardId) {
    return dashboards.get(dashboardId) || null;
}

// =========================================================================
// SYSTEM HEALTH
// =========================================================================

function getSystemHealth(system) {
    const systemMetrics = listMetrics(system);
    const systemAlerts = listAlerts(system, true);

    const health = systemAlerts.length === 0 ? 'healthy' :
        systemAlerts.some(a => a.severity === 'critical') ? 'critical' : 'degraded';

    return {
        system,
        health,
        metricsCount: systemMetrics.length,
        activeAlerts: systemAlerts.length,
        lastChecked: Date.now()
    };
}

function getAllSystemsHealth() {
    return SYSTEMS.map(sys => getSystemHealth(sys));
}

// =========================================================================
// STATS
// =========================================================================

function getMonitorStats() {
    return {
        metrics: {
            total: metrics.size,
            bySystem: SYSTEMS.reduce((acc, sys) => {
                acc[sys] = listMetrics(sys).length;
                return acc;
            }, {})
        },
        alerts: {
            total: alerts.length,
            triggered: alerts.filter(a => a.triggered).length,
            bySeverity: {
                info: alerts.filter(a => a.severity === 'info').length,
                warning: alerts.filter(a => a.severity === 'warning').length,
                critical: alerts.filter(a => a.severity === 'critical').length
            }
        },
        dashboards: dashboards.size,
        health: getAllSystemsHealth()
    };
}

// =========================================================================
// EXPORTS
// =========================================================================

module.exports = {
    METRIC_TYPES,
    ALERT_SEVERITIES,
    SYSTEMS,

    recordMetric,
    getMetric,
    listMetrics,
    getMetricStats,

    createAlert,
    triggerAlert,
    listAlerts,
    acknowledgeAlert,

    createDashboard,
    listDashboards,
    getDashboard,

    getSystemHealth,
    getAllSystemsHealth,
    getMonitorStats
};
