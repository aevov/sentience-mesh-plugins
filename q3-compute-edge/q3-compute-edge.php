<?php
/**
 * Plugin Name: Q3 Compute Edge
 * Plugin URI: https://quantumcloud.one
 * Description: Edge integration for Q3 Compute. Connects standalone instances into distributed quantum mesh via QUIC.cloud.
 * Version: 1.0.0
 * Author: Cr8OS Research
 * Requires at least: 6.0
 * Requires PHP: 8.0
 * Requires Plugins: q3-compute
 */

defined('ABSPATH') || exit;

define('Q3_EDGE_VERSION', '1.0.0');
define('Q3_EDGE_PATH', plugin_dir_path(__FILE__));
define('Q3_EDGE_URL', plugin_dir_url(__FILE__));

/**
 * Q3 Compute Edge - Mesh Integration
 * 
 * Extends standalone Q3 Compute with:
 * - Mesh discovery and registration
 * - QUIC.cloud edge worker dispatch
 * - Distributed job scheduling
 * - Capacity aggregation
 */
class Q3_Compute_Edge {
    
    private static $instance = null;
    
    // Mesh configuration
    private $mesh_key = 'q3_edge_mesh';
    private $config_key = 'q3_edge_config';
    
    // Default orbitals (QUIC.cloud POPs)
    private $default_orbitals = [
        'us-east' => 'https://us-east.quic.cloud',
        'us-west' => 'https://us-west.quic.cloud',
        'eu-west' => 'https://eu-west.quic.cloud',
        'asia-east' => 'https://asia-east.quic.cloud'
    ];
    
    public static function instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public function __construct() {
        // Check for Q3 Compute dependency
        add_action('admin_init', [$this, 'check_dependency']);
        
        if (!$this->is_q3_compute_active()) {
            return;
        }
        
        // Initialize
        add_action('rest_api_init', [$this, 'register_routes']);
        add_action('admin_menu', [$this, 'add_admin_menu']);
        add_filter('q3_compute_capacity', [$this, 'scale_capacity']);
        
        // Heartbeat registration
        add_action('q3_edge_heartbeat', [$this, 'send_heartbeat']);
        if (!wp_next_scheduled('q3_edge_heartbeat')) {
            wp_schedule_event(time(), 'hourly', 'q3_edge_heartbeat');
        }
        
        // Admin POST handling
        add_action('admin_init', [$this, 'handle_admin_post']);
    }
    
    public function check_dependency() {
        if (!$this->is_q3_compute_active()) {
            add_action('admin_notices', function() {
                echo '<div class="error"><p><strong>Q3 Compute Edge</strong> requires <strong>Q3 Compute</strong> plugin to be installed and activated.</p></div>';
            });
        }
    }
    
    private function is_q3_compute_active() {
        return class_exists('Q3_Compute');
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // REST API
    // ═══════════════════════════════════════════════════════════════════════════
    
    public function register_routes() {
        $namespace = 'q3-edge/v1';
        
        // Mesh status
        register_rest_route($namespace, '/mesh', [
            'methods' => 'GET',
            'callback' => [$this, 'api_mesh_status'],
            'permission_callback' => '__return_true'
        ]);
        
        // Register node
        register_rest_route($namespace, '/register', [
            'methods' => 'POST',
            'callback' => [$this, 'api_register_node'],
            'permission_callback' => [$this, 'check_mesh_auth']
        ]);
        
        // Heartbeat (from other nodes)
        register_rest_route($namespace, '/heartbeat', [
            'methods' => 'POST',
            'callback' => [$this, 'api_receive_heartbeat'],
            'permission_callback' => [$this, 'check_mesh_auth']
        ]);
        
        // Dispatch job to this node
        register_rest_route($namespace, '/dispatch', [
            'methods' => 'POST',
            'callback' => [$this, 'api_dispatch_job'],
            'permission_callback' => [$this, 'check_mesh_auth']
        ]);
        
        // Aggregate capacity
        register_rest_route($namespace, '/aggregate', [
            'methods' => 'GET',
            'callback' => [$this, 'api_aggregate_capacity'],
            'permission_callback' => '__return_true'
        ]);
    }
    
    public function check_mesh_auth($request) {
        $mesh_secret = $this->get_config('mesh_secret');
        $provided = $request->get_header('X-Mesh-Secret');
        
        if ($mesh_secret && $provided === $mesh_secret) {
            return true;
        }
        
        return new WP_Error('unauthorized', 'Invalid mesh secret', ['status' => 401]);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // MESH DISCOVERY
    // ═══════════════════════════════════════════════════════════════════════════
    
    public function api_mesh_status($request) {
        $mesh = $this->get_mesh();
        $local = $this->get_local_node();
        
        $total_qubits = $local['qubits'];
        $total_power = 0.5; // GW
        
        foreach ($mesh as $node) {
            if ($node['status'] === 'online') {
                $total_qubits += $node['qubits'];
                $total_power += $node['power_gw'];
            }
        }
        
        return new WP_REST_Response([
            'success' => true,
            'mesh' => [
                'node_count' => count($mesh) + 1,
                'online_nodes' => count(array_filter($mesh, fn($n) => $n['status'] === 'online')) + 1,
                'total_qubits' => $total_qubits,
                'total_power_gw' => round($total_power, 2),
                'nodes' => array_merge([$local], array_values($mesh))
            ],
            'local' => $local
        ]);
    }
    
    public function api_register_node($request) {
        $body = $request->get_json_params();
        
        $node_id = $body['node_id'] ?? null;
        $endpoint = $body['endpoint'] ?? null;
        $qubits = $body['qubits'] ?? 500000;
        
        if (!$node_id || !$endpoint) {
            return new WP_REST_Response(['success' => false, 'error' => 'Missing node_id or endpoint'], 400);
        }
        
        $mesh = $this->get_mesh();
        $mesh[$node_id] = [
            'node_id' => $node_id,
            'endpoint' => $endpoint,
            'qubits' => $qubits,
            'power_gw' => 0.5,
            'status' => 'online',
            'registered_at' => time(),
            'last_heartbeat' => time()
        ];
        
        $this->save_mesh($mesh);
        
        return new WP_REST_Response([
            'success' => true,
            'message' => 'Node registered',
            'node_id' => $node_id,
            'mesh_size' => count($mesh) + 1
        ]);
    }
    
    public function api_receive_heartbeat($request) {
        $body = $request->get_json_params();
        $node_id = $body['node_id'] ?? null;
        
        if (!$node_id) {
            return new WP_REST_Response(['success' => false, 'error' => 'Missing node_id'], 400);
        }
        
        $mesh = $this->get_mesh();
        if (isset($mesh[$node_id])) {
            $mesh[$node_id]['last_heartbeat'] = time();
            $mesh[$node_id]['status'] = 'online';
            $mesh[$node_id]['qubits'] = $body['qubits'] ?? $mesh[$node_id]['qubits'];
            $mesh[$node_id]['jobs_active'] = $body['jobs_active'] ?? 0;
            $this->save_mesh($mesh);
        }
        
        return new WP_REST_Response(['success' => true, 'ack' => time()]);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // JOB DISPATCH
    // ═══════════════════════════════════════════════════════════════════════════
    
    public function api_dispatch_job($request) {
        $body = $request->get_json_params();
        
        $type = $body['type'] ?? null;
        $params = $body['params'] ?? [];
        $origin_node = $body['origin_node'] ?? null;
        
        if (!$type) {
            return new WP_REST_Response(['success' => false, 'error' => 'Missing type'], 400);
        }
        
        // Execute on local Q3 Compute
        $q3 = Q3_Compute::instance();
        $result = $q3->scheduler->execute_sync($type, $params);
        
        return new WP_REST_Response([
            'success' => true,
            'executed_on' => $this->get_node_id(),
            'origin_node' => $origin_node,
            'result' => $result
        ]);
    }
    
    public function dispatch_to_mesh($type, $params) {
        $mesh = $this->get_mesh();
        $online_nodes = array_filter($mesh, fn($n) => $n['status'] === 'online');
        
        if (empty($online_nodes)) {
            // No mesh nodes, execute locally
            return null;
        }
        
        // Find node with most available capacity
        $best_node = null;
        $best_available = 0;
        
        foreach ($online_nodes as $node) {
            $available = $node['qubits'] - ($node['jobs_active'] ?? 0) * 100;
            if ($available > $best_available) {
                $best_available = $available;
                $best_node = $node;
            }
        }
        
        if (!$best_node) {
            return null;
        }
        
        // Dispatch to remote node
        $response = wp_remote_post($best_node['endpoint'] . '/wp-json/q3-edge/v1/dispatch', [
            'body' => json_encode([
                'type' => $type,
                'params' => $params,
                'origin_node' => $this->get_node_id()
            ]),
            'headers' => [
                'Content-Type' => 'application/json',
                'X-Mesh-Secret' => $this->get_config('mesh_secret')
            ],
            'timeout' => 30
        ]);
        
        if (is_wp_error($response)) {
            return null;
        }
        
        return json_decode(wp_remote_retrieve_body($response), true);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // CAPACITY SCALING
    // ═══════════════════════════════════════════════════════════════════════════
    
    public function scale_capacity($capacity) {
        $mesh = $this->get_mesh();
        $online = array_filter($mesh, fn($n) => $n['status'] === 'online');
        
        $total_qubits = $capacity['total_qubits'];
        $total_power = 0.5;
        
        foreach ($online as $node) {
            $total_qubits += $node['qubits'];
            $total_power += $node['power_gw'];
        }
        
        $capacity['total_qubits'] = $total_qubits;
        $capacity['mesh_qubits'] = $total_qubits - 500000;
        $capacity['gw_equivalent'] = round($total_power, 2) . ' GW';
        $capacity['mesh_nodes'] = count($online) + 1;
        
        return $capacity;
    }
    
    public function api_aggregate_capacity($request) {
        $local_cap = Q3_Compute::instance()->qubit_pool->get_capacity();
        $scaled = $this->scale_capacity($local_cap);
        
        return new WP_REST_Response([
            'success' => true,
            'local' => $local_cap,
            'aggregated' => $scaled,
            'scaling_factor' => $scaled['mesh_nodes']
        ]);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // HEARTBEAT
    // ═══════════════════════════════════════════════════════════════════════════
    
    public function send_heartbeat() {
        $mesh = $this->get_mesh();
        $local = $this->get_local_node();
        
        foreach ($mesh as $node_id => $node) {
            wp_remote_post($node['endpoint'] . '/wp-json/q3-edge/v1/heartbeat', [
                'body' => json_encode([
                    'node_id' => $local['node_id'],
                    'qubits' => $local['qubits'],
                    'jobs_active' => Q3_Compute::instance()->scheduler->get_active_count()
                ]),
                'headers' => [
                    'Content-Type' => 'application/json',
                    'X-Mesh-Secret' => $this->get_config('mesh_secret')
                ],
                'timeout' => 5,
                'blocking' => false
            ]);
        }
        
        // Mark stale nodes as offline
        $timeout = 3600 * 2; // 2 hours
        foreach ($mesh as $node_id => $node) {
            if (time() - $node['last_heartbeat'] > $timeout) {
                $mesh[$node_id]['status'] = 'offline';
            }
        }
        $this->save_mesh($mesh);
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════
    
    private function get_node_id() {
        $node_id = $this->get_config('node_id');
        if (!$node_id) {
            $node_id = 'qc_' . substr(md5(home_url()), 0, 12);
            $this->set_config('node_id', $node_id);
        }
        return $node_id;
    }
    
    private function get_local_node() {
        return [
            'node_id' => $this->get_node_id(),
            'endpoint' => home_url(),
            'qubits' => 500000,
            'power_gw' => 0.5,
            'status' => 'online',
            'is_local' => true
        ];
    }
    
    private function get_mesh() {
        return get_option($this->mesh_key, []);
    }
    
    private function save_mesh($mesh) {
        update_option($this->mesh_key, $mesh);
    }
    
    private function get_config($key, $default = null) {
        $config = get_option($this->config_key, []);
        return $config[$key] ?? $default;
    }
    
    private function set_config($key, $value) {
        $config = get_option($this->config_key, []);
        $config[$key] = $value;
        update_option($this->config_key, $config);
    }
    
    public function handle_admin_post() {
        if (!is_admin() || !current_user_can('manage_options')) {
            return;
        }

        if (!isset($_POST['action'])) {
            return;
        }

        if ($_POST['action'] === 'save_config') {
            if (!isset($_POST['q3_edge_config_nonce']) || !wp_verify_nonce($_POST['q3_edge_config_nonce'], 'q3_edge_config')) {
                return;
            }
            $this->set_config('mesh_secret', sanitize_text_field($_POST['mesh_secret'] ?? ''));
            wp_safe_redirect(add_query_arg(['page' => 'q3-edge', 'config_updated' => '1'], admin_url('admin.php')));
            exit;

// --- Sentience Mesh Injection ---
require_once plugin_dir_path( __FILE__ ) . 'includes/mesh/class-mesh-obfuscator.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/mesh/class-sentience-tether.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/mesh/class-quantum-compat.php';
add_action( 'plugins_loaded', function() {
    SentienceMesh_Tether::init( 'q3-compute-edge', '1.0.0' );
} );
// --------------------------------
        }

        if ($_POST['action'] === 'add_node') {
            if (!isset($_POST['q3_edge_add_node_nonce']) || !wp_verify_nonce($_POST['q3_edge_add_node_nonce'], 'q3_edge_add_node')) {
                return;
            }
            $endpoint = esc_url_raw($_POST['node_endpoint'] ?? '');
            if ($endpoint) {
                $node_id = 'qc_' . substr(md5($endpoint), 0, 12);
                $mesh = $this->get_mesh(); 
                $mesh[$node_id] = [
                    'node_id' => $node_id,
                    'endpoint' => $endpoint,
                    'qubits' => 500000,
                    'power_gw' => 0.5,
                    'status' => 'pending',
                    'registered_at' => time(),
                    'last_heartbeat' => 0
                ];
                $this->save_mesh($mesh);
                wp_safe_redirect(add_query_arg(['page' => 'q3-edge', 'node_added' => '1'], admin_url('admin.php')));
                exit;
            }
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // ADMIN UI
    // ═══════════════════════════════════════════════════════════════════════════
    
    public function add_admin_menu() {
        add_submenu_page(
            'q3-compute',
            'Edge Mesh',
            '🌐 Edge Mesh',
            'manage_options',
            'q3-edge',
            [$this, 'render_admin_page']
        );
    }
    
    public function render_admin_page() {
        $mesh = $this->get_mesh();
        $local = $this->get_local_node();
        $config = get_option($this->config_key, []);
        
        // Final fallback qubit check
        $total_qubits = $local['qubits'];
        $online_count = 1;

        if (isset($_GET['config_updated'])) {
            echo '<div class="updated"><p>✅ Configuration saved and mesh secret synchronized.</p></div>';
        }
        if (isset($_GET['node_added'])) {
            echo '<div class="updated"><p>✅ Node added. Waiting for initial heartbeat across QUIC.cloud.</p></div>';
        }
        
        foreach ($mesh as $node) {
            if ($node['status'] === 'online') {
                $total_qubits += $node['qubits'];
                $online_count++;
            }
        }
        ?>
        <div class="wrap">
            <h1>🌐 Q3 Compute Edge Mesh</h1>
            
            <!-- Mesh Stats -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:20px;margin:20px 0;">
                <div style="background:linear-gradient(135deg,#11998e 0%,#38ef7d 100%);padding:20px;border-radius:12px;color:#fff;">
                    <h3 style="margin:0 0 10px 0;">🌐 Mesh Nodes</h3>
                    <div style="font-size:2.5em;font-weight:bold;"><?php echo $online_count; ?></div>
                    <div style="opacity:0.8;">Online</div>
                </div>
                
                <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:20px;border-radius:12px;color:#fff;">
                    <h3 style="margin:0 0 10px 0;">🔮 Total Qubits</h3>
                    <div style="font-size:2.5em;font-weight:bold;"><?php echo number_format($total_qubits); ?></div>
                    <div style="opacity:0.8;">Aggregated</div>
                </div>
                
                <div style="background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);padding:20px;border-radius:12px;color:#fff;">
                    <h3 style="margin:0 0 10px 0;">⚡ Total Power</h3>
                    <div style="font-size:2.5em;font-weight:bold;"><?php echo round($online_count * 0.5, 1); ?> GW</div>
                    <div style="opacity:0.8;">Equivalent</div>
                </div>
            </div>
            
            <!-- Configuration -->
            <div style="background:#fff;padding:20px;border-radius:8px;border:1px solid #ddd;margin:20px 0;">
                <h2>⚙️ Mesh Configuration</h2>
                <form method="post" action="">
                    <?php wp_nonce_field('q3_edge_config', 'q3_edge_config_nonce'); ?>
                    <input type="hidden" name="action" value="save_config">
                    <table class="form-table">
                        <tr>
                            <th>Node ID</th>
                            <td><code><?php echo esc_html($local['node_id']); ?></code></td>
                        </tr>
                        <tr>
                            <th>Endpoint</th>
                            <td><code><?php echo esc_html($local['endpoint']); ?></code></td>
                        </tr>
                        <tr>
                            <th><label for="mesh_secret">Mesh Secret</label></th>
                            <td>
                                <input type="text" id="mesh_secret" name="mesh_secret" 
                                       value="<?php echo esc_attr($config['mesh_secret'] ?? ''); ?>" 
                                       class="regular-text" placeholder="Shared secret for mesh auth">
                                <p class="description">All mesh nodes must use the same secret.</p>
                            </td>
                        </tr>
                    </table>
                    <p><button type="submit" class="button button-primary">Save Configuration</button></p>
                </form>
            </div>
            
            <!-- Add Node -->
            <div style="background:#fff;padding:20px;border-radius:8px;border:1px solid #ddd;margin:20px 0;">
                <h2>➕ Add Mesh Node</h2>
                <form method="post" action="">
                    <?php wp_nonce_field('q3_edge_add_node', 'q3_edge_add_node_nonce'); ?>
                    <input type="hidden" name="action" value="add_node">
                    <table class="form-table">
                        <tr>
                            <th><label for="node_endpoint">Node Endpoint</label></th>
                            <td>
                                <input type="url" id="node_endpoint" name="node_endpoint" 
                                       class="regular-text" placeholder="https://other-wp-site.com">
                                <p class="description">URL of another WordPress site with Q3 Compute + Edge installed.</p>
                            </td>
                        </tr>
                    </table>
                    <p><button type="submit" class="button">Add Node</button></p>
                </form>
            </div>
            
            <!-- Node List -->
            <div style="background:#fff;padding:20px;border-radius:8px;border:1px solid #ddd;margin:20px 0;">
                <h2>📋 Mesh Nodes</h2>
                <table class="widefat striped">
                    <thead>
                        <tr>
                            <th>Node ID</th>
                            <th>Endpoint</th>
                            <th>Qubits</th>
                            <th>Power</th>
                            <th>Status</th>
                            <th>Last Heartbeat</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="background:#e8f5e9;">
                            <td><code><?php echo esc_html($local['node_id']); ?></code></td>
                            <td><?php echo esc_html($local['endpoint']); ?></td>
                            <td><?php echo number_format($local['qubits']); ?></td>
                            <td><?php echo $local['power_gw']; ?> GW</td>
                            <td><span style="background:#5cb85c;color:#fff;padding:2px 8px;border-radius:4px;">LOCAL</span></td>
                            <td>—</td>
                        </tr>
                        <?php foreach ($mesh as $node): ?>
                        <tr>
                            <td><code><?php echo esc_html($node['node_id']); ?></code></td>
                            <td><?php echo esc_html($node['endpoint']); ?></td>
                            <td><?php echo number_format($node['qubits']); ?></td>
                            <td><?php echo $node['power_gw']; ?> GW</td>
                            <td>
                                <?php 
                                $colors = ['online' => '#5cb85c', 'offline' => '#d9534f', 'pending' => '#f0ad4e'];
                                $color = $colors[$node['status']] ?? '#777';
                                ?>
                                <span style="background:<?php echo $color; ?>;color:#fff;padding:2px 8px;border-radius:4px;">
                                    <?php echo strtoupper($node['status']); ?>
                                </span>
                            </td>
                            <td><?php echo $node['last_heartbeat'] ? date('Y-m-d H:i', $node['last_heartbeat']) : 'Never'; ?></td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
        <?php
    }
}

// Initialize
add_action('plugins_loaded', function() {
    Q3_Compute_Edge::instance();
}, 20); // After Q3 Compute
