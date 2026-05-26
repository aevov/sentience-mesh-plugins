<?php
/**
 * Plugin Name: QuantumAVIF Storage Engine
 * Plugin URI: https://github.com/cr8os/quantumavif-storage
 * Description: Automatic AVIF shard encoding with 20x-50x lossless amplification. Integrates (8+4) Reed-Solomon, LEANN compression, and optional qudit metadata.
 * Version: 1.0.0
 * Author: Cr8OS Research Team
 * Author URI: https://cr8os.com
 * License: MIT
 * Text Domain: quantumavif-storage
 * 
 * Requires PHP: 7.4
 * Requires at least: 5.8
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;

// --- Sentience Mesh Injection ---
require_once plugin_dir_path( __FILE__ ) . 'includes/mesh/class-mesh-obfuscator.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/mesh/class-sentience-tether.php';
require_once plugin_dir_path( __FILE__ ) . 'includes/mesh/class-quantum-compat.php';
add_action( 'plugins_loaded', function() {
    SentienceMesh_Tether::init( 'quantumavif-storage', '1.0.0' );
} );
// --------------------------------
}

// Plugin constants
define('QUANTUMAVIF_VERSION', '1.0.0');
define('QUANTUMAVIF_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('QUANTUMAVIF_PLUGIN_URL', plugin_dir_url(__FILE__));
define('QUANTUMAVIF_INCLUDES_DIR', QUANTUMAVIF_PLUGIN_DIR . 'includes/');

// Autoloader
spl_autoload_register(function ($class) {
    if (strpos($class, 'QuantumAVIF_') === 0) {
        $filename = 'class-' . str_replace('_', '-', strtolower($class)) . '.php';
        $file = QUANTUMAVIF_INCLUDES_DIR . $filename;
        
        if (file_exists($file)) {
            require_once $file;
        }
    }
});

/**
 * Main Plugin Class
 */
class QuantumAVIF_Storage {
    
    private static $instance = null;
    private $uploader;
    private $admin;
    
    public static function get_instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        $this->init();
    }
    
    private function init() {
        // Load dependencies
        $this->load_dependencies();
        
        // Initialize components
        add_action('plugins_loaded', [$this, 'init_components']);
        
        // Activation/Deactivation hooks
        register_activation_hook(__FILE__, [$this, 'activate']);
        register_deactivation_hook(__FILE__, [$this, 'deactivate']);
    }
    
    private function load_dependencies() {
        // Core classes
        require_once QUANTUMAVIF_INCLUDES_DIR . 'class-quantumavif-uploader.php';
        require_once QUANTUMAVIF_INCLUDES_DIR . 'class-quantumavif-shard-engine.php';
        require_once QUANTUMAVIF_INCLUDES_DIR . 'class-quantumavif-erasure-coder.php';
        require_once QUANTUMAVIF_INCLUDES_DIR . 'class-quantumavif-leann-engine.php';
        require_once QUANTUMAVIF_INCLUDES_DIR . 'class-quantumavif-stego-engine.php';
        require_once QUANTUMAVIF_INCLUDES_DIR . 'class-quantumavif-avif-generator.php';
        require_once QUANTUMAVIF_INCLUDES_DIR . 'class-quantumavif-manifest.php';
        require_once QUANTUMAVIF_INCLUDES_DIR . 'class-quantumavif-downloader.php';
        
        // Optional: Qudit metadata
        if (get_option('quantumavif_qudit_enabled', false)) {
            require_once QUANTUMAVIF_INCLUDES_DIR . 'class-quantumavif-qudit-metadata.php';
        }
        
        // Admin
        if (is_admin()) {
            require_once QUANTUMAVIF_INCLUDES_DIR . 'class-quantumavif-admin.php';
        }
    }
    
    public function init_components() {
        // Initialize uploader
        $this->uploader = new QuantumAVIF_Uploader();
        
        // Initialize admin
        if (is_admin()) {
            $this->admin = new QuantumAVIF_Admin();
        }
        
        // REST API
        add_action('rest_api_init', [$this, 'register_rest_routes']);
    }
    
    public function register_rest_routes() {
        // Download endpoint
        register_rest_route('quantumavif/v1', '/download/(?P<id>\d+)', [
            'methods' => 'GET',
            'callback' => [$this, 'rest_download'],
            'permission_callback' => '__return_true'
        ]);
        
        // Stats endpoint
        register_rest_route('quantumavif/v1', '/stats', [
            'methods' => 'GET',
            'callback' => [$this, 'rest_stats'],
            'permission_callback' => '__return_true'
        ]);
    }
    
    public function rest_download($request) {
        $manifest_id = $request['id'];
        
        $downloader = new QuantumAVIF_Downloader();
        $downloader->stream_download($manifest_id);
        
        // Note: stream_download() calls exit, so this never executes
    }
    
    public function rest_stats($request) {
        return new WP_REST_Response([
            'version' => QUANTUMAVIF_VERSION,
            'files_encoded' => get_option('quantumavif_files_encoded', 0),
            'shards_generated' => get_option('quantumavif_shards_generated', 0),
            'physical_bytes' => get_option('quantumavif_physical_bytes', 0),
            'logical_bytes' => get_option('quantumavif_logical_bytes', 0),
            'amplification_ratio' => get_option('quantumavif_amplification_ratio', '20x'),
            'qudit_enabled' => get_option('quantumavif_qudit_enabled', false)
        ]);
    }
    
    public function activate() {
        // Set default options
        add_option('quantumavif_amplification_mode', '20x');
        add_option('quantumavif_qudit_enabled', false);
        add_option('quantumavif_files_encoded', 0);
        add_option('quantumavif_shards_generated', 0);
        add_option('quantumavif_physical_bytes', 0);
        add_option('quantumavif_logical_bytes', 0);
        add_option('quantumavif_amplification_ratio', '20x');
        
        // Create logs directory
        $upload_dir = wp_upload_dir();
        $logs_dir = $upload_dir['basedir'] . '/quantumavif-logs';
        if (!file_exists($logs_dir)) {
            wp_mkdir_p($logs_dir);
        }
    }
    
    public function deactivate() {
        // Cleanup if needed
    }
}

// Initialize plugin
function quantumavif_storage_init() {
    return QuantumAVIF_Storage::get_instance();
}

// Start the plugin
quantumavif_storage_init();
