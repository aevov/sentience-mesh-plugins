<?php
/**
 * Q3 Compute Dashboard Template
 */

defined('ABSPATH') || exit;

// Helper function for formatting numbers
function q3_format_number($num) {
    if ($num >= 1e12) return round($num / 1e12, 1) . 'T';
    if ($num >= 1e9) return round($num / 1e9, 1) . 'B';
    if ($num >= 1e6) return round($num / 1e6, 1) . 'M';
    if ($num >= 1e3) return round($num / 1e3, 1) . 'K';
    return number_format($num);
}

$q3 = Q3_Compute::instance();
$stats = $q3->quantum_vm->get_stats();
$capacity = $q3->qubit_pool->get_capacity();
$recent_jobs = $q3->scheduler->get_recent(10);
?>
<div class="wrap">
    <h1>⚛️ Q3 Compute Engine</h1>
    
    <div class="q3-cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px;margin:20px 0;">
        <!-- Capacity Card -->
        <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:20px;border-radius:12px;color:#fff;">
            <h3 style="margin:0 0 10px 0;">🔮 Qubit Pool</h3>
            <div style="font-size:2.5em;font-weight:bold;"><?php echo number_format($capacity['total_qubits']); ?></div>
            <div style="opacity:0.8;">Total Capacity</div>
            <div style="margin-top:10px;font-size:0.9em;">
                Available: <?php echo number_format($capacity['available_qubits']); ?>
            </div>
        </div>
        
        <!-- Power Card -->
        <div style="background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);padding:20px;border-radius:12px;color:#fff;">
            <h3 style="margin:0 0 10px 0;">⚡ Compute Power</h3>
            <div style="font-size:2.5em;font-weight:bold;"><?php echo $capacity['gw_equivalent']; ?></div>
            <div style="opacity:0.8;">Equivalent</div>
            <div style="margin-top:10px;font-size:0.9em;">
                <?php echo number_format($capacity['gate_ops_per_sec']); ?> ops/sec
            </div>
        </div>
        
        <!-- Jobs Card -->
        <div style="background:linear-gradient(135deg,#4facfe 0%,#00f2fe 100%);padding:20px;border-radius:12px;color:#fff;">
            <h3 style="margin:0 0 10px 0;">📊 Jobs Completed</h3>
            <div style="font-size:2.5em;font-weight:bold;"><?php echo number_format($stats['jobs_completed'] ?? 0); ?></div>
            <div style="opacity:0.8;">Total Processed</div>
            <div style="margin-top:10px;font-size:0.9em;">
                Failed: <?php echo number_format($stats['jobs_failed'] ?? 0); ?>
            </div>
        </div>
        
        <!-- Gate Ops Card -->
        <div style="background:linear-gradient(135deg,#43e97b 0%,#38f9d7 100%);padding:20px;border-radius:12px;color:#fff;">
            <h3 style="margin:0 0 10px 0;">🔢 Gate Operations</h3>
            <div style="font-size:2.5em;font-weight:bold;"><?php echo q3_format_number($stats['total_gate_ops'] ?? 0); ?></div>
            <div style="opacity:0.8;">Total Executed</div>
            <div style="margin-top:10px;font-size:0.9em;">
                Qubits Used: <?php echo q3_format_number($stats['total_qubits_used'] ?? 0); ?>
            </div>
        </div>
    </div>
    
    <!-- Integration Settings -->
    <div style="background:#fff;padding:20px;border-radius:8px;border:1px solid #ddd;margin:20px 0;">
        <h2>🌐 Dual Tether Integration Settings</h2>
        <p>Configure industry QPU backends (e.g., AWS Braket, IBM Qiskit orchestration endpoints). When configured, standard jobs will route here while the native Sentience Mesh aggregates telemetry stealthily.</p>
        <form method="post" action="options.php">
            <?php settings_fields('q3_compute_options'); ?>
            <table class="form-table">
                <tr valign="top">
                    <th scope="row">Industry QPU Master URL</th>
                    <td>
                        <input type="url" name="q3_industry_qpu_master_url" value="<?php echo esc_attr(get_option('q3_industry_qpu_master_url')); ?>" class="regular-text" placeholder="https://qiskit-proxy.example.com/api/execute" />
                        <p class="description">If set, incoming OpenQASM-compatible circuits will be translated and forwarded to this endpoint. Leave blank to process jobs via the local native Sentience Q3 VM.</p>
                    </td>
                </tr>
            </table>
            <?php submit_button('Save Integrations'); ?>
        </form>
    </div>
    
    <!-- API Endpoints -->
    <div style="background:#fff;padding:20px;border-radius:8px;border:1px solid #ddd;margin:20px 0;">
        <h2>🔌 API Endpoints</h2>
        <table class="widefat striped">
            <thead>
                <tr>
                    <th>Endpoint</th>
                    <th>Method</th>
                    <th>Auth</th>
                    <th>Description</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><code><?php echo rest_url('q3-compute/v1/capacity'); ?></code></td>
                    <td>GET</td>
                    <td>Public</td>
                    <td>Get capacity and status</td>
                </tr>
                <tr>
                    <td><code><?php echo rest_url('q3-compute/v1/operations'); ?></code></td>
                    <td>GET</td>
                    <td>Public</td>
                    <td>List available operations</td>
                </tr>
                <tr>
                    <td><code><?php echo rest_url('q3-compute/v1/submit'); ?></code></td>
                    <td>POST</td>
                    <td>Required</td>
                    <td>Submit async job</td>
                </tr>
                <tr>
                    <td><code><?php echo rest_url('q3-compute/v1/compute'); ?></code></td>
                    <td>POST</td>
                    <td>Required</td>
                    <td>Sync compute (small jobs)</td>
                </tr>
                <tr>
                    <td><code><?php echo rest_url('q3-compute/v1/status/{id}'); ?></code></td>
                    <td>GET</td>
                    <td>Required</td>
                    <td>Get job status</td>
                </tr>
                <tr>
                    <td><code><?php echo rest_url('q3-compute/v1/result/{id}'); ?></code></td>
                    <td>GET</td>
                    <td>Required</td>
                    <td>Get job result</td>
                </tr>
            </tbody>
        </table>
    </div>
    
    <!-- Recent Jobs -->
    <div style="background:#fff;padding:20px;border-radius:8px;border:1px solid #ddd;margin:20px 0;">
        <h2>📋 Recent Jobs</h2>
        <?php if (empty($recent_jobs)): ?>
            <p>No jobs yet.</p>
        <?php else: ?>
            <table class="widefat striped">
                <thead>
                    <tr>
                        <th>Job ID</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Qubits</th>
                        <th>Created</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($recent_jobs as $job): ?>
                    <tr>
                        <td><code><?php echo esc_html($job['id']); ?></code></td>
                        <td><?php echo esc_html($job['type']); ?></td>
                        <td>
                            <?php 
                            $colors = [
                                'queued' => '#f0ad4e',
                                'running' => '#5bc0de',
                                'completed' => '#5cb85c',
                                'failed' => '#d9534f',
                                'cancelled' => '#777'
                            ];
                            $color = $colors[$job['status']] ?? '#777';
                            ?>
                            <span style="background:<?php echo $color; ?>;color:#fff;padding:2px 8px;border-radius:4px;font-size:0.85em;">
                                <?php echo esc_html($job['status']); ?>
                            </span>
                        </td>
                        <td><?php echo esc_html($job['qubits']); ?></td>
                        <td><?php echo date('Y-m-d H:i:s', $job['created_at']); ?></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>
    
    <!-- Quick Test -->
    <div style="background:#fff;padding:20px;border-radius:8px;border:1px solid #ddd;margin:20px 0;">
        <h2>🧪 Quick Test</h2>
        <p>Test the compute engine with a random circuit:</p>
        <button id="q3-test-btn" class="button button-primary" onclick="q3TestCompute()">
            Run Random Circuit (10 qubits, 1000 shots)
        </button>
        <pre id="q3-test-result" style="background:#f5f5f5;padding:15px;margin-top:15px;display:none;overflow:auto;max-height:300px;"></pre>
        
        <script>
        async function q3TestCompute() {
            const btn = document.getElementById('q3-test-btn');
            const result = document.getElementById('q3-test-result');
            
            btn.disabled = true;
            btn.textContent = 'Running...';
            result.style.display = 'block';
            result.textContent = 'Executing quantum circuit...';
            
            try {
                const response = await fetch('<?php echo rest_url('q3-compute/v1/compute'); ?>', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-WP-Nonce': '<?php echo wp_create_nonce('wp_rest'); ?>'
                    },
                    body: JSON.stringify({
                        type: 'random_circuit',
                        params: { num_qubits: 10, depth: 20, shots: 1000 }
                    })
                });
                
                const data = await response.json();
                result.textContent = JSON.stringify(data, null, 2);
            } catch (e) {
                result.textContent = 'Error: ' + e.message;
            }
            
            btn.disabled = false;
            btn.textContent = 'Run Random Circuit (10 qubits, 1000 shots)';
        }
        </script>
    </div>
</div>
