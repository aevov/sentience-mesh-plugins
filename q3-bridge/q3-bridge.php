<?php
/**
 * Plugin Name: Q3 Bridge
 * Plugin URI: https://quantumcloud.one
 * Description: WordPress wrapper for the Node.js Q3 BIDC Bridge. Manage high-density build offloading without root access.
 * Version: 1.0.0
 * Author: Cr8OS Research
 * Requires PHP: 8.0
 */

defined('ABSPATH') || exit;

define('Q3_BRIDGE_VERSION', '1.0.0');
define('Q3_BRIDGE_PATH', plugin_dir_path(__FILE__));
define('Q3_BRIDGE_URL', plugin_dir_url(__FILE__));

// Load components
require_once Q3_BRIDGE_PATH . 'includes/class-bridge-manager.php';

/**
 * Main Q3 Bridge class
 */
class Q3_Bridge {
    
    private static $instance = null;
    public $manager;
    
    public static function instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public function __construct() {
        $this->manager = new Q3_Bridge_Manager();
        
        add_action('admin_menu', [$this, 'add_admin_menu']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_admin_scripts']);
        add_action('wp_ajax_q3_bridge_action', [$this->manager, 'handle_ajax_action']);
    }
    
    public function add_admin_menu() {
        add_menu_page(
            'Q3 Bridge',
            'Q3 Bridge',
            'manage_options',
            'q3-bridge',
            [$this, 'render_dashboard'],
            'dashicons-rest-api',
            32
        );
    }
    
    public function enqueue_admin_scripts($hook) {
        if ($hook !== 'toplevel_page_q3-bridge') return;
        
        wp_enqueue_style('q3-bridge-admin', Q3_BRIDGE_URL . 'assets/css/q3-bridge-admin.css', [], Q3_BRIDGE_VERSION);
        wp_enqueue_script('q3-bridge-admin', Q3_BRIDGE_URL . 'assets/js/q3-bridge-admin.js', ['jquery'], Q3_BRIDGE_VERSION, true);
        
        wp_localize_script('q3-bridge-admin', 'q3Bridge', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('q3_bridge_nonce')
        ]);
    }
    
    public function render_dashboard() {
        include Q3_BRIDGE_PATH . 'templates/bridge-dashboard.php';
    }
}

// Initialize
add_action('plugins_loaded', function() {
    Q3_Bridge::instance();
});
