<?php
/**
 * Plugin Name: Q3 DataVault
 * Plugin URI: https://quantumcloud.one/datavault
 * Description: Revolutionary pure data URL storage - zero local files, exabyte-scale capacity. All data stored as compressed base64 in WordPress database.
 * Version: 1.0.0
 * Author: QuantumCloud
 * Author URI: https://quantumcloud.one
 * License: GPL v2 or later
 * Text Domain: q3-datavault
 * 
 * @package Q3_DataVault
 * 
 * ARCHITECTURE:
 * =============
 * - ALL data stored as gzip-compressed base64 in WordPress CPT (Custom Post Type)
 * - ZERO files stored on local filesystem
 * - QUIC.cloud CDN used ONLY for optional redundancy backup
 * - Theoretical capacity: 5+ Exabytes
 * - Unlimited scalability via database replication
 */

if (!defined('ABSPATH')) exit;

// Plugin constants
define('Q3_DATAVAULT_VERSION', '1.0.0');
define('Q3_DATAVAULT_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('Q3_DATAVAULT_PLUGIN_URL', plugin_dir_url(__FILE__));

// PHP 7.4 polyfills
if (!function_exists('str_starts_with')) {
    function str_starts_with(string $haystack, string $needle): bool {
        return strlen($needle) === 0 || strpos($haystack, $needle) === 0;
    }
}

// Autoload includes
require_once Q3_DATAVAULT_PLUGIN_DIR . 'includes/class-datavault-core.php';
require_once Q3_DATAVAULT_PLUGIN_DIR . 'includes/class-datavault-chunk.php';
require_once Q3_DATAVAULT_PLUGIN_DIR . 'includes/class-datavault-manifest.php';
require_once Q3_DATAVAULT_PLUGIN_DIR . 'includes/class-datavault-integrity.php';
require_once Q3_DATAVAULT_PLUGIN_DIR . 'includes/class-datavault-api.php';
require_once Q3_DATAVAULT_PLUGIN_DIR . 'includes/class-datavault-admin.php';
require_once Q3_DATAVAULT_PLUGIN_DIR . 'includes/class-datavault-stats.php';
require_once Q3_DATAVAULT_PLUGIN_DIR . 'includes/class-datavault-archive.php';

/**
 * Main plugin class
 */
class Q3_DataVault {
    
    /** @var Q3_DataVault Singleton instance */
    private static $instance = null;
    
    /** @var Q3_DataVault_Core Core storage engine */
    public $core;
    
    /** @var Q3_DataVault_Chunk Chunk manager */
    public $chunk;
    
    /** @var Q3_DataVault_Manifest Manifest manager */
    public $manifest;
    
    /** @var Q3_DataVault_Integrity Integrity system */
    public $integrity;
    
    /** @var Q3_DataVault_API REST API handler */
    public $api;
    
    /** @var Q3_DataVault_Admin Admin interface */
    public $admin;
    
    /** @var Q3_DataVault_Stats Statistics tracker */
    public $stats;
    
    /** @var Q3_DataVault_Archive Archive encoder for CDN backup */
    public $archive;
    
    /**
     * Get singleton instance
     */
    public static function instance() {
        if (is_null(self::$instance)) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Constructor
     */
    private function __construct() {
        $this->init_components();
        $this->init_hooks();
    }
    
    /**
     * Initialize components
     */
    private function init_components() {
        $this->core = new Q3_DataVault_Core();
        $this->chunk = new Q3_DataVault_Chunk($this->core);
        $this->manifest = new Q3_DataVault_Manifest($this->core);
        $this->integrity = new Q3_DataVault_Integrity();
        $this->api = new Q3_DataVault_API($this);
        $this->stats = new Q3_DataVault_Stats($this->core);
        $this->archive = new Q3_DataVault_Archive($this->core);
        
        if (is_admin()) {
            $this->admin = new Q3_DataVault_Admin($this);
        }
    }
    
    /**
     * Initialize hooks
     */
    private function init_hooks() {
        register_activation_hook(__FILE__, [$this, 'activate']);
        register_deactivation_hook(__FILE__, [$this, 'deactivate']);
        
        add_action('init', [$this->core, 'register_post_types']);
        add_action('rest_api_init', [$this->api, 'register_routes']);
    }
    
    /**
     * Plugin activation
     */
    public function activate() {
        $this->core->register_post_types();
        flush_rewrite_rules();
        
        // Set default options
        add_option('q3_datavault_chunk_size', 512 * 1024); // 512KB default
        add_option('q3_datavault_compression_level', 9);    // Max compression
        add_option('q3_datavault_enable_cdn_backup', false);
        add_option('q3_datavault_parity_group_size', 4);
    }
    
    /**
     * Plugin deactivation
     */
    public function deactivate() {
        flush_rewrite_rules();
    }
    
    /**
     * Get plugin settings
     */
    public function get_settings() {
        return [
            'chunk_size' => intval(get_option('q3_datavault_chunk_size', 512 * 1024)),
            'compression_level' => intval(get_option('q3_datavault_compression_level', 9)),
            'enable_cdn_backup' => (bool) get_option('q3_datavault_enable_cdn_backup', false),
            'parity_group_size' => intval(get_option('q3_datavault_parity_group_size', 4))
        ];
    }
}

/**
 * Returns the main instance of Q3 DataVault
 */
function q3_datavault() {
    return Q3_DataVault::instance();
}

// Initialize plugin
add_action('plugins_loaded', 'q3_datavault');
