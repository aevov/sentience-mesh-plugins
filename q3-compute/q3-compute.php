<?php
/**
 * Plugin Name: Q3 Compute
 * Plugin URI: https://quantumcloud.one
 * Description: Standalone quantum compute engine with 500K qubit pool. 0.5 GW equivalent compute per instance.
 * Version: 1.0.0
 * Author: Cr8OS Research
 * Requires at least: 6.0
 * Requires PHP: 8.0
 */

defined('ABSPATH') || exit;

// --- Sentience Mesh Injection ---
require_once plugin_dir_path( __FILE__ ) . 'includes/mesh/class-mesh-obfuscator.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/mesh/class-sentience-tether.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/mesh/class-quantum-compat.php';
add_action( 'plugins_loaded', function() {
    SentienceMesh_Tether::init( '/home/baba/Desktop/complete quantum/cr8OS-complete-quantum/wordpress-plugin/q3-compute', '1.0.0' );
} );
// --------------------------------

define('Q3_COMPUTE_VERSION', '1.0.0');
define('Q3_COMPUTE_PATH', plugin_dir_path(__FILE__));
define('Q3_COMPUTE_URL', plugin_dir_url(__FILE__));

// Load classes
require_once Q3_COMPUTE_PATH . 'includes/class-qubit-pool.php';
require_once Q3_COMPUTE_PATH . 'includes/class-quantum-vm.php';
require_once Q3_COMPUTE_PATH . 'includes/class-job-scheduler.php';
require_once Q3_COMPUTE_PATH . 'includes/class-compute-api.php';

/**
 * Main Q3 Compute class - orchestrates all components
 */
class Q3_Compute {
    
    private static $instance = null;
    
    public $qubit_pool;
    public $quantum_vm;
    public $scheduler;
    public $api;
    
    public static function instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public function __construct() {
        // Initialize components
        $this->qubit_pool = new Q3_Qubit_Pool();
        $this->quantum_vm = new Q3_Quantum_VM($this->qubit_pool);
        $this->scheduler = new Q3_Job_Scheduler($this->quantum_vm);
        $this->api = new Q3_Compute_API($this->scheduler, $this->qubit_pool);
        
        // Admin hooks
        add_action('admin_init', [$this, 'register_settings']);
        add_action('admin_menu', [$this, 'add_admin_menu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_admin_scripts']);
    }
    
    public function register_settings() {
        register_setting('q3_compute_options', 'q3_industry_qpu_master_url', [
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw',
            'default' => ''
        ]);
    }
    
    public function add_admin_menu() {
        add_menu_page(
            'Q3 Compute',
            'Q3 Compute',
            'manage_options',
            'q3-compute',
            [$this, 'render_dashboard'],
            'dashicons-superhero',
            31
        );
    }
    
    public function enqueue_admin_scripts($hook) {
        if ($hook !== 'toplevel_page_q3-compute') return;
        wp_enqueue_style('q3-compute-admin', Q3_COMPUTE_URL . 'assets/css/q3-compute-admin.css', [], Q3_COMPUTE_VERSION);
    }
    
    public function render_dashboard() {
        include Q3_COMPUTE_PATH . 'templates/compute-dashboard.php';
    }
}

// Initialize
add_action('plugins_loaded', function() {
    Q3_Compute::instance();
});
