<?php
/**
 * Q3 Bridge Dashboard Template
 */

defined('ABSPATH') || exit;

$status = Q3_Bridge::instance()->manager->get_full_status();
?>

<div class="wrap q3-bridge-wrap">
    <h1>⚛️ Q3 Bridge Dashboard</h1>
    <p>Manage the Node.js BIDC bridge for high-density build offloading.</p>

    <div class="q3-bridge-status-card <?php echo $status['status']; ?>">
        <div class="status-header">
            <span class="status-indicator"></span>
            <h2>System Status: <?php echo strtoupper($status['status']); ?></h2>
        </div>
        
        <div class="status-details">
            <div class="detail-item">
                <span class="label">PID:</span>
                <span class="value"><?php echo $status['pid'] ?: 'N/A'; ?></span>
            </div>
            <div class="detail-item">
                <span class="label">BIDC Port (8082):</span>
                <span class="value <?php echo $status['port_active'] ? 'active' : 'inactive'; ?>">
                    <?php echo $status['port_active'] ? 'OPEN' : 'CLOSED'; ?>
                </span>
            </div>
            <div class="detail-item">
                <span class="label">Node Version:</span>
                <span class="value"><?php echo esc_html($status['node_version']); ?></span>
            </div>
        </div>

        <div class="status-actions">
            <button id="q3-bridge-start" class="button button-primary" <?php disabled($status['status'], 'running'); ?>>
                ▶ Start Bridge
            </button>
            <button id="q3-bridge-stop" class="button button-secondary" <?php disabled($status['status'], 'stopped'); ?>>
                ⏹ Stop Bridge
            </button>
            <button id="q3-bridge-refresh" class="button">
                🔄 Refresh
            </button>
        </div>
    </div>

    <div class="q3-bridge-logs-card">
        <h2>📜 Bridge Logs (Tail)</h2>
        <pre id="q3-bridge-logs"><?php echo esc_html($status['log_tail']); ?></pre>
    </div>

    <div class="q3-bridge-config-card">
        <h2>⚙️ Connection Info</h2>
        <p>Use the following endpoint in your Luci dispatcher:</p>
        <code>ws://<?php echo $_SERVER['HTTP_HOST']; ?>:8082</code>
        <p class="description">Ensure port 8082 is open in your server firewall.</p>
    </div>
</div>
